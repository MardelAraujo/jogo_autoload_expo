import * as THREE from "three";
import { MODULOS } from "@/lib/constants";
import { camState, VIEW_PADRAO, CAM_AZIM_PADRAO } from "./camera";
import { previewRef } from "./preview";
import { getPlanta, derivePlantaRefs, pxz } from "./scene";

/**
 * Visor da maquete do montador: acender uma estação da jornada manda a câmera
 * até a peça correspondente (MQ_PECAS), fecha o enquadramento, planta um pino
 * no chão e segura alguns segundos antes de voltar sozinha à panorâmica.
 * Porte de autoload_expo3d.html linhas 5641-5799 (ver AGENTS.md deste
 * diretório). Roda sobre os MESMOS camAzim/camElev/viewSize do resto do app
 * (camState é um objeto só) — este módulo só acrescenta ALVOS perseguidos por
 * suavização exponencial em atualizarMaquete().
 */

const MQ_VIEW_FOCO = 62; // fechado na peça
const MQ_ELEV_AMPLA = 0.66;
const MQ_ELEV_FOCO = 0.48;
const MQ_FOCO_S = 5.5; // quanto tempo a câmera segura na peça
const MQ_ALTURA = 34; // o que sobe mais na planta (a tancagem)

interface MqPeca {
  semPeca?: boolean;
  local?: string;
  pt?: [number, number];
  on: string;
  off: string;
}

let mqPecas: Record<string, MqPeca> | null = null;
let mqPano: { alvo: THREE.Vector3; raio: number } | null = null;

function ensureMaquete() {
  if (mqPecas && mqPano) return;
  const PL = getPlanta();
  const refs = derivePlantaRefs(PL);
  // Indexada pela ETAPA da jornada, não pelo módulo. Dois módulos cobrem duas
  // etapas cada — `acesso` é a cancela de entrada E a de saída, `pesagem` é a
  // balança de entrada E a de saída —, então com a tabela por módulo as quatro
  // caíam duas a duas no mesmo pino: quem tocava "Acesso de saída" via a
  // câmera ir até a peça da entrada, e "Pesagem final" até a balança inicial.
  //
  // A entrada também estava no lugar errado por outro motivo: apontava pra
  // STAGE_PT.acesso_in, que é o MEIO do caminho entre o pátio e a balança
  // (PT_ACESSO_IN, um vértice de traçado da rota) — chão vazio, não a cancela.
  // Aqui a etapa aponta pro elemento `cancela` de verdade.
  //
  // Os três módulos sem peça no chão continuam pela chave de MÓDULO: não têm
  // etapa na jornada, e nenhum nome deles colide com um id de etapa.
  mqPecas = {
    checkin: { local: "Portaria", pt: refs.STAGE_PT.checkin, on: "Totem de check-in instalado", off: "Totem de check-in retirado" },
    patio: { local: "Pátio", pt: refs.PT_TELAO, on: "Telão de chamada instalado", off: "Telão de chamada retirado" },
    acesso_in: { local: "Cancela de entrada", pt: pxz(refs.EL_CANCELA_IN), on: "LPR instalado na cancela de entrada", off: "LPR retirado da cancela de entrada" },
    pesagem1: { local: "Balança de entrada", pt: pxz(refs.PT_PESAGEM1), on: "Balança de entrada integrada ao sistema", off: "Balança de entrada volta ao visor e à planilha" },
    vistoria: { local: "Vistoria", pt: refs.STAGE_PT.vistoria, on: "Vistoria digital em campo", off: "Vistoria volta ao papel" },
    carga: { local: "Ilha de carregamento", pt: refs.STAGE_PT.carga, on: "Preset e intertravamento na ilha", off: "Ilha volta ao comando manual" },
    pesagem2: { local: "Balança de saída", pt: pxz(refs.PT_PESAGEM2), on: "Balança de saída integrada ao sistema", off: "Balança de saída volta ao visor e à planilha" },
    // Mesmo ponto do check-out, de propósito: a cancela de saída fica 16 m do
    // totem de NF-e, e no enquadramento fechado os dois pinos em pontos
    // diferentes liam como dois lugares distintos do terminal. Saída e
    // check-out são a mesma boca — um pino só, marcado duas vezes.
    saida: { local: "Cancela de saída", pt: refs.STAGE_PT.checkout, on: "LPR instalado na cancela de saída", off: "LPR retirado da cancela de saída" },
    checkout: { local: "Saída", pt: refs.STAGE_PT.checkout, on: "Totem de NF-e instalado", off: "Totem de NF-e retirado" },
    agendamento: { semPeca: true, on: "Agendamento ligado — acontece antes do portão", off: "Agendamento desligado" },
    autochecker: { semPeca: true, on: "AutoChecker ligado — a conferência é na base", off: "AutoChecker desligado" },
    dashboard: { semPeca: true, on: "Dashboard ligado — a leitura é no escritório", off: "Dashboard desligado" },
  };

  // A panorâmica é MEDIDA, não digitada: o alvo é o centro da caixa das nove
  // peças mais a tancagem, o pátio e a ilha, e o enquadramento sai do raio.
  const pts = Object.values(refs.STAGE_PT)
    .concat([pxz(refs.EL_TANQUES), pxz(refs.EL_TRUCKCENTER), pxz(refs.EL_COBERTURA_STAGE)])
    .filter((p): p is [number, number] => !!(p && (p[0] || p[1])));
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  mqPano = {
    alvo: new THREE.Vector3(cx, MQ_ALTURA * 0.3, cz),
    raio: Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz))),
  };
  mqAlvo.copy(mqPano.alvo);
  mqAlvoGoal.copy(mqPano.alvo);
}

export const mqAlvo = new THREE.Vector3();
const mqAlvoGoal = new THREE.Vector3();
let mqAzimGoal = 0;
let mqElevGoal = MQ_ELEV_AMPLA;
let mqViewGoal = 200;
let mqClock = 0;
let mqFocoAte = 0;
let mqAspect = 16 / 9;
let mqPin: { g: THREE.Group; anel: THREE.Mesh; facho: THREE.Mesh } | null = null;

export interface MqLegenda {
  local: string;
  tit: string;
  sub: string;
  off: boolean;
}
type LegendaListener = (l: MqLegenda) => void;
let legendaListener: LegendaListener | null = null;
export function setMaqueteLegendaListener(fn: LegendaListener | null) {
  legendaListener = fn;
}

function mqLegenda(local: string, tit: string, sub: string, off: boolean) {
  legendaListener?.({ local, tit, sub, off });
}

/** Chamado pelo BuilderScreen a cada resize/medição do #mq-scope. */
export function setMaqueteAspect(aspect: number) {
  mqAspect = aspect > 0 ? aspect : mqAspect;
}

// meia-altura da câmera ortográfica que faz a planta caber no quadro do visor.
function mqViewAmpla(): number {
  ensureMaquete();
  const vert = mqPano!.raio * Math.sin(MQ_ELEV_AMPLA) + MQ_ALTURA * Math.cos(MQ_ELEV_AMPLA);
  return Math.max(vert, mqPano!.raio / mqAspect) * 0.98;
}

// Pino: anel no chão + facho vertical, sempre visível (depthTest:false) porque
// a peça marcada costuma estar atrás de um tanque ou da cobertura. Rosa =
// equipamento entrou; âmbar = a etapa voltou a ser feita por uma pessoa.
function porPin(pt: [number, number], cor: number) {
  tirarPin();
  const g = new THREE.Group();
  const anel = new THREE.Mesh(
    new THREE.TorusGeometry(7, 0.5, 8, 40),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.95, depthTest: false }),
  );
  anel.rotation.x = -Math.PI / 2;
  anel.position.y = 0.6;
  const facho = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 34, 7),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.3, depthTest: false }),
  );
  facho.position.y = 17;
  g.add(anel);
  g.add(facho);
  g.position.set(pt[0], 0, pt[1]);
  g.renderOrder = 999;
  mqPin = { g, anel, facho };
  if (previewRef.current) previewRef.current.scene.add(g);
}
function tirarPin() {
  if (!mqPin) return;
  if (mqPin.g.parent) mqPin.g.parent.remove(mqPin.g);
  mqPin.g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) (mesh.material as THREE.Material).dispose();
  });
  mqPin = null;
}

/** Volta ao estado de repouso do visor — panorâmica parada, sem pino. */
export function mqPanoramica() {
  ensureMaquete();
  tirarPin();
  mqFocoAte = 0;
  mqAlvoGoal.copy(mqPano!.alvo);
  mqViewGoal = mqViewAmpla();
  mqElevGoal = MQ_ELEV_AMPLA;
  mqLegenda(
    "Panorâmica",
    "A maquete do terminal",
    "Toque uma estação da jornada: a câmera vai até a peça e mostra onde ela entra no terminal.",
    false,
  );
}

/**
 * Leva a câmera até a peça da ETAPA `estacao`. `mod` só entra na frase do
 * cartão (o texto com/sem AutoLoad é do módulo, não da etapa) e como chave de
 * reserva pros módulos que não têm etapa na jornada.
 * `ligado` decide a cor do pino e qual das duas frases aparece.
 */
export function focarMaquete(estacao: string, mod: string, ligado: boolean) {
  ensureMaquete();
  const p = mqPecas![estacao] ?? mqPecas![mod];
  const modulo = MODULOS[mod];
  if (!p || !modulo) return;
  if (p.semPeca || !p.pt) {
    mqPanoramica();
    mqLegenda("Panorâmica", ligado ? p.on : p.off, ligado ? modulo.com : modulo.sem, !ligado);
    return;
  }
  mqAlvoGoal.set(p.pt[0], 6, p.pt[1]);
  mqViewGoal = MQ_VIEW_FOCO;
  mqElevGoal = MQ_ELEV_FOCO; // mais rente ao chão pra ver a peça de pé
  // olhar de FORA pra dentro: a câmera se põe do lado de fora da planta em
  // relação à peça, senão metade das peças fica atrás da tancagem.
  const dx = p.pt[0] - mqPano!.alvo.x;
  const dz = p.pt[1] - mqPano!.alvo.z;
  if (dx || dz) {
    const bruto = Math.atan2(dx, dz);
    // caminho angular mais curto: sem isto a maquete dá uma volta inteira
    // quando o alvo cruza ±π.
    mqAzimGoal = camState.camAzim + Math.atan2(Math.sin(bruto - camState.camAzim), Math.cos(bruto - camState.camAzim));
  }
  mqFocoAte = mqClock + MQ_FOCO_S;
  porPin(p.pt, ligado ? 0xfa094e : 0xf5a623);
  mqLegenda(p.local!, ligado ? p.on : p.off, ligado ? modulo.com : modulo.sem, !ligado);
}

/** Entra no repouso do montador — chamar ao montar o BuilderScreen. */
export function enterBuilderMaquete() {
  mqAzimGoal = camState.camAzim;
  mqPanoramica();
}

/** Sai do montador — devolve a câmera ao enquadramento padrão do resto do app. */
export function exitBuilderMaquete() {
  tirarPin();
  mqFocoAte = 0;
  camState.viewSize = VIEW_PADRAO;
  camState.camElev = 0.25;
  camState.camAzim = CAM_AZIM_PADRAO;
}

// No montador quem manda na câmera são os ALVOS da maquete: sem sincronizar,
// a suavização desfaz o arraste do visitante no frame seguinte. Mexer com a
// mão também cancela a volta automática à panorâmica, mas mantém o pino e a
// legenda da peça.
export function syncMaqueteFromDrag() {
  mqAzimGoal = camState.camAzim;
  mqElevGoal = camState.camElev;
  mqViewGoal = camState.viewSize;
  mqAlvoGoal.copy(mqAlvo);
  mqFocoAte = 0;
}

/** Chamar 1x por frame, só quando modo==='builder'. */
export function atualizarMaquete(dt: number) {
  mqClock += dt;
  if (mqFocoAte && mqClock >= mqFocoAte) mqPanoramica();
  const k = 1 - Math.exp(-dt * 2.4); // suavização independente de FPS
  camState.camAzim += (mqAzimGoal - camState.camAzim) * k;
  camState.camElev += (mqElevGoal - camState.camElev) * k;
  camState.viewSize += (mqViewGoal - camState.viewSize) * k;
  mqAlvo.lerp(mqAlvoGoal, k);
  if (mqPin) {
    const b = 1 + 0.13 * Math.sin(mqClock * 3.6);
    mqPin.anel.scale.set(b, b, 1);
    (mqPin.facho.material as THREE.MeshBasicMaterial).opacity = 0.2 + (0.16 * (1 + Math.sin(mqClock * 3.6))) / 2;
  }
}
