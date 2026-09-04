import * as THREE from "three";
import { buildTerminal, getPlanta, type BuildTerminalHandle } from "@/lib/three/scene";
import { disposeSceneContents } from "@/lib/three/renderer";
import { gerarPlaca, gerarMotorista, tocar, type Motorista } from "@/lib/utils";
import { CADENCIA_AUTO_S, DURACAO_TURNO, N_TRUCKS_AUTO, N_TRUCKS_MAN, ORDEM_MODS, PONTOS, STAGES_DEF, VOL_MEDIO, type Stage } from "@/lib/constants";
import { instalarConsoleRota, logAndando, logChegada, logRotaMontada, logSaida } from "./debug-rota";
import type { Sel } from "@/state/kiosk-store";
import { useKioskStore } from "@/state/kiosk-store";
import { STAGE_MISSAO, type MissionConfig } from "./missions";
import { fmtMMSS } from "@/lib/utils";
import { salvarRankingDia, atualizarLeadPosJogo, type Lead } from "@/lib/ranking";

/**
 * Motor da simulação — porte simplificado de sim/criarLado/stepRotaAnimada/
 * spawnAlerta/resolverAlerta da referência (ver AGENTS.md do port). Com
 * A frota usa instâncias independentes da rota animada construídas pelo
 * terminal. Elas entram no circuito progressivamente, depois da portaria.
 */

const ROTA_ANIMADA_SPEED = 14; // idem referência (linha 9176)
const HEADWAY_U = 19; // idem referência (linha 9894): rig de 18u + 1u de folga
// Ordem, na PLANTA, dos 6 pontos de espera reais da rota — idem referência (ROTA_PARADAS, linha 9925).
// Exportado: também é a ordem de exibição da trilha do #auto-console (auto-console.tsx).
export const ROTA_PARADAS = ["checkin", "pesagem1", "vistoria", "carga", "pesagem2", "saida"];

function mod1(t: number): number {
  return ((t % 1) + 1) % 1;
}

export interface Alerta {
  stage: Stage;
  t0: number;
  limite: number;
  resolvido: boolean;
  vencido: boolean;
  autoResolve?: boolean;
  missao?: MissionConfig;
  ativo?: boolean;
}

export interface MissaoTruck {
  placa: string;
  motorista: Motorista;
  alert: Alerta | null;
  cicloT0: number | null;
}

export interface Kpi {
  exp: number;
  vol: number;
  /** Caminhões que concluíram o check-in na portaria — o contador de entrada do
   *  turno. Sobe uma vez por passagem pela etapa "checkin", em cada lado, e
   *  acumula entre as rodadas junto com o resto do KPI. Vira a linha
   *  "Caminhões processados" do placar (ver finalizarTurno). */
  checkins: number;
  ciclos: number[];
  oco: number;
  interv: number;
  nfe: number;
  parado: number;
}

export interface RotaAnimada {
  curve: THREE.CatmullRomCurve3;
  curveLen: number;
  order: { idx: number; t: number; stageId?: string }[];
  waits: number[];
  closed: boolean;
  tractor: THREE.Object3D;
  trailer: THREE.Object3D | null;
  root: THREE.Object3D;
  tPos: number;
  ptr: number;
  state: "move" | "wait";
  waitLeft: number;
  parado?: boolean;
  lado?: Lado;
  missaoTruck?: MissaoTruck;
  ativo?: boolean;
  indiceFrota?: number;
}

interface AlertaNaFila {
  alerta: Alerta;
  truck: MissaoTruck;
}

export interface Lado {
  auto: boolean;
  mods: Record<string, boolean>;
  scene: THREE.Scene;
  T: BuildTerminalHandle;
  camera: THREE.OrthographicCamera;
  kpi: Kpi;
  rotas: RotaAnimada[];
  filaAlertas: AlertaNaFila[];
  /** Quando o próximo caminhão da frota entra na portaria. Só o lado AutoLoad
   *  usa (ver liberarPorCadencia); no manual quem solta o próximo é a cancela
   *  (liberarAposCancela). */
  proximaEntrada: number;
  /** Onde, na curva da rota, fica a cancela de entrada. É o marco que o lado
   *  manual usa para saber que a via de acesso vaziou (ver liberarAposCancela).
   *  Sai da posição real da peça na planta, projetada na curva. */
  tCancela: number;
}

export interface AcEvento {
  seq: number;
  stageId: string;
  placa: string;
}

export interface SimState {
  clock: number;
  pontos: number;
  pontosEstrategia: number;
  pontosAgilidade: number;
  pontosEtapas: number;
  rodadaAtual: number;
  rodadasTotal: number;
  restante: number;
  turnoFim: number;
  man: Lado;
  auto: Lado;
  /** Fila de etapas automatizadas concluídas pelo lado AutoLoad — porte
   *  simplificado do #auto-console da referência (ver auto-console.tsx).
   *  Drenada pelo componente que a exibe; só cresce sem limite se nada ler. */
  acQueue: AcEvento[];
  acSeq: number;
}

/** Porte de `let sim` (mutável, fora do Zustand — lido/escrito no loop de render). */
export const simRef: { current: SimState | null } = { current: null };

function somAtivo(): boolean {
  return useKioskStore.getState().somAtivo;
}

function stageAuto(lado: Lado, st: Stage): boolean {
  return lado.auto && !!lado.mods[st.mod];
}

function criarKpi(): Kpi {
  return { exp: 0, vol: 0, checkins: 0, ciclos: [], oco: 0, interv: 0, nfe: 0, parado: 0 };
}

function criarLado(auto: boolean, sel: Sel, kpi = criarKpi()): Lado {
  const mods = auto ? sel.mods : {};
  const scene = new THREE.Scene();
  const PL = getPlanta();
  const T = buildTerminal(scene, mods, sel.modais, PL, {
    modeloCaminhao: sel.modeloCaminhao,
    quantidadeCaminhoes: auto ? N_TRUCKS_AUTO : N_TRUCKS_MAN,
  });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  const rotas = (T.rotasAnimadas || (T.rotaAnimada ? [T.rotaAnimada] : [])) as RotaAnimada[];
  const lado: Lado = {
    auto, mods, scene, T, camera, kpi, rotas, filaAlertas: [],
    proximaEntrada: CADENCIA_AUTO_S,
    tCancela: projetarNaRota(rotas[0], T.gateIn),
  };
  rotas.forEach((R, indice) => {
    let i = 0;
    R.order.forEach((o) => {
      if ((R.waits[o.idx] || 0) > 0) o.stageId = ROTA_PARADAS[i++];
    });
    // Os dois lados começam igual: um caminhão na pista, o resto da frota
    // esperando a vez FORA do circuito. O que muda é quem chama o próximo —
    // liberarAposCancela no manual, liberarPorCadencia no AutoLoad.
    R.ativo = indice === 0;
    R.root.visible = R.ativo;
    R.indiceFrota = indice;
    R.lado = lado;
    R.missaoTruck = { placa: gerarPlaca(), motorista: gerarMotorista(), alert: null, cicloT0: null };
  });
  logRotaMontada(lado);
  return lado;
}

function promoverAlertaManual(lado: Lado, sim: SimState) {
  while (lado.filaAlertas.length && lado.filaAlertas[0].alerta.resolvido) lado.filaAlertas.shift();
  const atual = lado.filaAlertas[0]?.alerta;
  if (!atual || atual.ativo) return;
  atual.ativo = true;
  atual.t0 = sim.clock;
  tocar("alarme", somAtivo());
}

/** Porte de creditarAgilidade() — linha 11164 da referência. */
function creditarAgilidade(sim: SimState): number {
  const ganho = Math.max(0, Math.min(PONTOS.TAP_RAPIDO, PONTOS.TAP_CAP_TOTAL - sim.pontosAgilidade));
  if (ganho > 0) {
    sim.pontos += ganho;
    sim.pontosAgilidade += ganho;
  }
  return ganho;
}

/**
 * Porte de spawnAlerta() — linha 10593. Sem DOM: o cartão da missão é
 * responsabilidade do React (SimScreen/missions.tsx), aqui só nasce o estado.
 * ponytail: o combo/pressão (missaoStreak/pressaoAtiva) da referência foi
 * cortado — não está na lista de "portar fielmente" do brief, só os prazos
 * (9s manual / 5s automatizado sem módulo) importam pro jogo.
 */
function spawnAlerta(lado: Lado, tr: MissaoTruck, st: Stage, sim: SimState) {
  const a: Alerta = {
    stage: st,
    t0: sim.clock,
    limite: lado.auto ? 5 : 9,
    resolvido: false,
    vencido: false,
    ativo: lado.auto,
  };
  tr.alert = a;
  if (!lado.auto) {
    a.missao = STAGE_MISSAO[st.id];
    lado.filaAlertas.push({ alerta: a, truck: tr });
    promoverAlertaManual(lado, sim);
  } else {
    a.autoResolve = true;
  }
}

/** Porte de resolverAlerta() — linha 11232. */
export function resolverAlerta(sim: SimState, lado: Lado, a: Alerta, humano: boolean): number {
  if (a.resolvido) return 0;
  a.resolvido = true;
  lado.kpi.interv++;
  let ganho = 0;
  if (humano) {
    const dt = sim.clock - a.t0;
    if (dt < 3) ganho = creditarAgilidade(sim);
    tocar("ok", somAtivo());
    promoverAlertaManual(lado, sim);
  }
  return ganho;
}

/** Resolve a missão ativa do lado manual (chamado pelos widgets de missão). */
export function resolverAlertaManual(): number {
  const sim = simRef.current;
  if (!sim) return 0;
  const atual = sim.man.filaAlertas[0];
  if (!atual?.alerta.ativo) return 0;
  return resolverAlerta(sim, sim.man, atual.alerta, true);
}

/** Porte de avancarPonteiroRota() — linha 10041. */
function avancarPonteiroRota(R: RotaAnimada) {
  const n = R.order.length;
  if (R.closed) {
    const eraUltimo = R.ptr === n - 1;
    R.ptr = (R.ptr + 1) % n;
    if (eraUltimo) R.tPos -= 1;
  } else if (R.ptr >= n - 1) {
    R.ptr = 0;
    R.tPos = Math.max(0, R.order[0].t - 0.01);
    if (R.missaoTruck) {
      R.missaoTruck.placa = gerarPlaca();
      R.missaoTruck.motorista = gerarMotorista();
    }
  } else {
    R.ptr++;
  }
}

/** Porte de posicionarRotaAnimada() — linha 10068. */
function posicionarRotaAnimada(R: RotaAnimada) {
  const L = R.curveLen;
  const amostra = (t: number) => R.curve.getPointAt(R.closed ? mod1(t) : Math.min(1, Math.max(0, t)));
  const p = amostra(R.tPos);
  const q = amostra(R.tPos + 0.006);
  R.tractor.position.set(p.x, 0, p.z);
  if (Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.z - p.z) > 1e-6) R.tractor.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
  if (!R.trailer) return;
  const gap = 8.5 / L;
  const tp = amostra(R.tPos - gap);
  const hitch = amostra(R.tPos - gap * 0.35);
  R.trailer.position.set(tp.x, 0, tp.z);
  if (Math.abs(hitch.x - tp.x) > 1e-6 || Math.abs(hitch.z - tp.z) > 1e-6)
    R.trailer.rotation.y = Math.atan2(hitch.x - tp.x, hitch.z - tp.z);
}

/** Em que ponto da curva (0..1) uma peça da planta fica. Usado para achar a
 *  cancela de entrada na rota; se a peça não existir, cai no marco do check-in,
 *  que é o vizinho dela. */
function projetarNaRota(R: RotaAnimada | undefined, peca: THREE.Object3D | null | undefined): number {
  if (!R) return 0;
  if (!peca) return R.order.find((o) => o.stageId === "checkin")?.t ?? 0;
  let melhor = 0;
  let menor = Infinity;
  const AMOSTRAS = 600;
  for (let i = 0; i <= AMOSTRAS; i++) {
    const t = i / AMOSTRAS;
    const p = R.curve.getPointAt(R.closed ? mod1(t) : t);
    const d = (p.x - peca.position.x) ** 2 + (p.z - peca.position.z) ** 2;
    if (d < menor) {
      menor = d;
      melhor = t;
    }
  }
  return melhor;
}

/**
 * A chegada do lado manual: o próximo caminhão da frota só entra na via de
 * acesso quando o anterior JÁ PASSOU PELA CANCELA de entrada — isto é, quando
 * não há mais ninguém entre o começo da rota e a cancela.
 *
 * A regra é geométrica de propósito, e não "quando o anterior sai do check-in",
 * que era a versão antiga: entre sair da parada e cruzar a cancela ainda há 12
 * un de pista, e liberar antes disso é liberar com a portaria ocupada.
 *
 * O efeito de jogo é o que interessa: o caminhão só passa pela cancela depois
 * que o visitante atende o check-in dele, então QUEM DITA O RITMO DE CHEGADA É
 * A MÃO DE QUEM JOGA. Jogou rápido, entra mais caminhão; demorou, a via de
 * acesso fica ocupada e a frota espera do lado de fora. É o oposto do AutoLoad,
 * onde a chegada é um relógio que não depende de ninguém (liberarPorCadencia),
 * e é essa diferença que o split-screen existe para mostrar.
 *
 * A versão antiga também morria: era um tiro só por caminhão e a corrente
 * andava pelo índice da frota, então depois de N-1 liberações não entrava mais
 * ninguém no turno inteiro. Esta regra vale do primeiro ao último segundo.
 */
function liberarAposCancela(lado: Lado) {
  if (lado.auto) return;
  const proximo = lado.rotas.find((R) => !R.ativo);
  if (!proximo) return;
  // Quem ainda não chegou na cancela está na via de acesso — inclusive quem
  // acabou de fechar a volta e voltou para o começo da rota.
  if (lado.rotas.some((R) => R.ativo && R.tPos <= lado.tCancela)) return;
  proximo.ativo = true;
  proximo.root.visible = true;
  posicionarRotaAnimada(proximo);
}

/**
 * A chegada do lado AutoLoad: de CADENCIA_AUTO_S em CADENCIA_AUTO_S segundos,
 * mais um caminhão da frota entra — SEMPRE pelo começo da rota, isto é, pela
 * via de acesso, antes do agendamento, do pátio e do check-in. Nenhum caminhão
 * aparece dentro do terminal: quem está lá dentro entrou pela portaria e passou
 * por todas as etapas, como tem que ser.
 *
 * É a contraparte de liberarAposCancela, e a diferença entre as duas é o
 * argumento do produto: lá a chegada seguinte espera o visitante atender a
 * anterior; aqui a chegada é um relógio, porque não há ninguém para esperar. O
 * que a automação encurta é o INTERVALO entre um caminhão e o próximo, que é
 * exatamente a promessa do módulo de Agendamento (slots de chegada no lugar da
 * rajada). O resultado é caminhão novo surgindo na portaria ao longo da
 * partida, e não uma frota que aparece de uma vez.
 *
 * A guarda de portaria desimpedida existe para a cadência não empurrar um
 * caminhão para dentro de outro que ainda não saiu do ponto de nascimento: aí a
 * entrada fica para o próximo quadro, e não se perde o intervalo — só se adia.
 */
function liberarPorCadencia(lado: Lado, sim: SimState) {
  if (!lado.auto || sim.clock < lado.proximaEntrada) return;
  const proximo = lado.rotas.find((R) => !R.ativo);
  if (!proximo) return;
  const encostado = lado.rotas.some((o) => {
    if (o === proximo || !o.ativo) return false;
    const dx = o.tractor.position.x - proximo.tractor.position.x;
    const dz = o.tractor.position.z - proximo.tractor.position.z;
    return dx * dx + dz * dz < (HEADWAY_U * 1.4) ** 2;
  });
  if (encostado) return;
  proximo.ativo = true;
  proximo.root.visible = true;
  posicionarRotaAnimada(proximo);
  lado.proximaEntrada = sim.clock + CADENCIA_AUTO_S;
}

/**
 * Trava de fila — o que faltava do porte de stepLado() (referência linha 11820).
 * Todos os caminhões correm na MESMA curva, na mesma velocidade, e nada olhava o
 * da frente: um atravessava o outro.
 *
 * A referência mede a folga ao longo da curva (distFrente/HEADWAY) e lá isso
 * basta, porque a frota nasce em pelotão. Aqui não: os caminhões são liberados
 * um a um no checkin e acabam espalhados pela rota. Nesta planta a saída
 * desemboca na mesma reta da entrada — quem já saiu (t≈0.89) fica 16,5u à frente
 * de quem está entrando (t≈0.15), quase colineares e no mesmo sentido. Em
 * parâmetro de curva estão a 3/4 de volta um do outro; no mundo, um entra dentro
 * do outro. Por isso a medida aqui é no espaço, e não em `t`.
 *
 * Só segura quem está À FRENTE e no mesmo sentido — e isso NÃO basta pra
 * impedir o abraço mútuo, como esta função já supôs um dia. Sentido OPOSTO de
 * fato nunca trava (nenhum passa no teste de proa do outro), mas sentido
 * CONVERGENTE trava: no entroncamento em que a pista de saída volta pra reta da
 * entrada, um caminhão saindo (proa a -51°) e um entrando (proa a 4°) ficam a
 * 19 un um do outro com 55° entre as proas. 55° passa no teste de "mesmo
 * sentido" (< 90°), e o vetor que separa os dois cai na proa DOS DOIS: cada um
 * vê o outro na frente, os dois param, e param pra sempre.
 *
 * Reproduzido fora do jogo com a curva do planta_layout.json: com o visitante
 * resolvendo as missões em ~1 s, trava em 1min57 de turno; em ~2 s, em 2min22.
 * Jogador lento espalha a frota e o encontro não acontece — daí ser intermitente.
 *
 * O desempate é de preferência, não de geometria: quem está MAIS ADIANTE na
 * rota (tPos maior) passa, quem está atrás cede. É a regra de trânsito certa
 * pro lugar — quem já vai embora desocupa o entroncamento, quem está entrando
 * espera —, e de quebra torna o impasse impossível por construção: ceder só
 * acontece na direção de quem tem tPos maior, e uma relação estritamente
 * crescente não fecha ciclo, com dois caminhões ou com dez.
 */
function naProa(R: RotaAnimada, o: RotaAnimada): boolean {
  const proa = R.tractor.rotation.y;
  const fx = Math.sin(proa), fz = Math.cos(proa);
  const dx = o.tractor.position.x - R.tractor.position.x;
  const dz = o.tractor.position.z - R.tractor.position.z;
  if (dx * fx + dz * fz <= 0) return false; // atrás de mim
  if (Math.hypot(dx, dz) > HEADWAY_U) return false;
  const dif = Math.abs((((o.tractor.rotation.y - proa) * 180) / Math.PI + 540) % 360 - 180);
  return dif < 90;
}

/** Quem passa primeiro quando os dois se veem na própria proa. O empate de
 *  tPos (dois caminhões recém-nascidos no mesmo ponto) cai no índice da frota,
 *  que é único — sem isso o desempate seria simétrico e não desempataria nada. */
function temPreferencia(A: RotaAnimada, B: RotaAnimada): boolean {
  if (A.tPos !== B.tPos) return A.tPos > B.tPos;
  return (A.indiceFrota ?? 0) < (B.indiceFrota ?? 0);
}

function bloqueadoPorFrente(lado: Lado, R: RotaAnimada): boolean {
  for (const o of lado.rotas) {
    if (o === R || !o.ativo) continue;
    if (!naProa(R, o)) continue;
    if (naProa(o, R) && temPreferencia(R, o)) continue; // abraço mútuo: eu tenho a preferência
    return true;
  }
  return false;
}

function stepRotaAnimada(lado: Lado, R: RotaAnimada, dt: number, sim: SimState) {
  if (!R.ativo || R.parado || R.order.length < 2) return;
  if (R.state === "wait") {
    const a = R.missaoTruck?.alert ?? null;
    if (a && !a.resolvido) {
      if (!lado.auto && !a.ativo) {
        lado.kpi.parado += dt;
        posicionarRotaAnimada(R);
        return;
      }
      const espera = sim.clock - a.t0;
      if (a.autoResolve) {
        if (espera > 3.2) resolverAlerta(sim, lado, a, false);
      } else if (!a.vencido && espera > a.limite) {
        a.vencido = true;
        lado.kpi.oco++;
        tocar("alarme", somAtivo());
      }
      if (!a.autoResolve && !a.resolvido) lado.kpi.parado += dt;
      if (!a.resolvido) {
        posicionarRotaAnimada(R);
        return;
      }
    }
    R.waitLeft -= dt;
    if (R.waitLeft > 0) {
      posicionarRotaAnimada(R);
      return;
    }
    R.state = "move";
    logSaida(lado, R, sim.clock);
    const saiuDe = R.order[R.ptr].stageId;
    // Dois marcos distintos da mesma passagem, e os dois contam:
    // o check-in diz quantos caminhões cada lado conseguiu pôr PRA DENTRO
    // (kpi.checkins, de Paulo), e o check-out mais abaixo diz quantos ele
    // conseguiu PROCESSAR até o fim. A distância entre os dois é o que ficou
    // preso na rota quando o relógio parou — que é justamente o que nenhuma
    // das duas medidas sozinha mostrava.
    if (saiuDe === "checkin") lado.kpi.checkins++;
    // O CAMINHÃO CONTA QUANDO É PROCESSADO, e não quando some da tela.
    //
    // Contava na saída de `saida` — a cancela de saída, último ponto do
    // circuito. Só que o turno tem 3 minutos e o circuito não cabe inteiro
    // nesse tempo pra todo mundo: medindo um turno instrumentado, 7 caminhões
    // entraram de cada lado, 6 passaram pela pesagem final e só 5 chegaram a
    // cruzar a cancela. Os outros continuavam rodando quando o relógio parou,
    // e o placar dizia que não tinham existido. Do lado manual, onde a fila
    // trava esperando alguém tocar na tela, a perda é maior ainda: dá pra
    // trabalhar três caminhões e o placar fechar em um.
    //
    // O marco certo é o CHECK-OUT — a etapa 08 da jornada que o visitante lê no
    // montador: emitida a NF-e, aquele caminhão foi processado, e o que falta é
    // dirigir até a cancela. Só que check-out não tem parada própria no
    // circuito (ROTA_PARADAS tem 6 pontos e `checkout` não é um deles: é etapa
    // virtual, como pátio e acesso de entrada). O ponto real onde ele acontece
    // é a saída da PESAGEM FINAL — depois dela não há mais nenhuma tarefa, nem
    // manual nem automatizada.
    //
    // Por isso o crédito inteiro se muda pra cá: contagem, volume, ciclo e os
    // pontos de caminhão expedido do AutoLoad. Todos descrevem o mesmo fato, e
    // separá-los faria o "ciclo médio" ser a média de um conjunto de caminhões
    // diferente do que a linha de cima contou.
    //
    // O ciclo passa a medir check-in → check-out, que é o tempo em que o
    // terminal esteve com o caminhão na mão — a medida que a comparação
    // manual×AutoLoad quer fazer. O trecho até a cancela é a mesma reta pros
    // dois lados e não distingue nada.
    if (R.missaoTruck) {
      if (saiuDe === "pesagem2" && R.missaoTruck.cicloT0 !== null) {
        lado.kpi.nfe++;
        lado.kpi.exp++;
        lado.kpi.vol += VOL_MEDIO;
        lado.kpi.ciclos.push(sim.clock - R.missaoTruck.cicloT0);
        R.missaoTruck.cicloT0 = null;
        if (lado.auto) {
          sim.pontos += PONTOS.EXPEDIDO_AUTO;
          sim.pontosEstrategia += PONTOS.EXPEDIDO_AUTO;
        }
      }
    }
    avancarPonteiroRota(R);
  }
  if (bloqueadoPorFrente(lado, R)) {
    posicionarRotaAnimada(R);
    return;
  }
  R.tPos += (ROTA_ANIMADA_SPEED * dt) / R.curveLen;
  const alvo = R.order[R.ptr].t;
  if (R.tPos >= alvo) {
    R.tPos = alvo;
    const espera = Math.max(0, R.waits[R.order[R.ptr].idx] || 0);
    if (espera > 0) {
      R.state = "wait";
      R.waitLeft = espera;
      posicionarRotaAnimada(R); // põe o caminhão no ponto antes de logar a posição
      logChegada(lado, R, sim.clock);
      const stageId = R.order[R.ptr].stageId;
      if (stageId && R.missaoTruck) {
        const st = STAGES_DEF.find((s) => s.id === stageId)!;
        if (stageId === "checkin" && R.missaoTruck.cicloT0 === null) R.missaoTruck.cicloT0 = sim.clock;
        if (!stageAuto(lado, st)) {
          spawnAlerta(lado, R.missaoTruck, st, sim);
        } else {
          sim.pontos += PONTOS.ETAPA_AUTO;
          sim.pontosEtapas += PONTOS.ETAPA_AUTO;
          sim.acQueue.push({ seq: ++sim.acSeq, stageId, placa: R.missaoTruck.placa });
          if (sim.acQueue.length > 20) sim.acQueue.shift();
        }
      }
    } else {
      avancarPonteiroRota(R);
    }
  }
  posicionarRotaAnimada(R);
  logAndando(lado, R, sim.clock);
}

/** Porte de iniciarSimulacao()+montarRodada() — linhas 12325/12346. */
export function iniciarSimulacao(sel: Sel): SimState {
  if (simRef.current) {
    disposeSceneContents(simRef.current.man.scene);
    disposeSceneContents(simRef.current.auto.scene);
  }
  const sim: SimState = {
    clock: 0,
    pontos: 0,
    pontosEstrategia: 0,
    pontosAgilidade: 0,
    pontosEtapas: 0,
    rodadaAtual: 1,
    rodadasTotal: sel.rodadas,
    restante: 0,
    turnoFim: 0,
    man: criarLado(false, sel),
    auto: criarLado(true, sel),
    acQueue: [],
    acSeq: 0,
  };
  sim.turnoFim = performance.now() + DURACAO_TURNO * 1000;
  sim.restante = DURACAO_TURNO;
  simRef.current = sim;
  instalarConsoleRota(() => simRef.current);
  return sim;
}

/** Porte de proximaRodada() — linha 12376: descarta as cenas e monta a próxima, pontuação acumula. */
export function proximaRodada(sel: Sel) {
  const sim = simRef.current;
  if (!sim) return;
  // Uma rodada nova troca apenas a cena e a frota. Os indicadores pertencem ao
  // turno inteiro e precisam continuar acumulando; zerá-los aqui fazia o placar
  // final exibir somente a última rodada, embora a pontuação não fosse zerada.
  const kpiMan = sim.man.kpi;
  const kpiAuto = sim.auto.kpi;
  disposeSceneContents(sim.man.scene);
  disposeSceneContents(sim.auto.scene);
  sim.rodadaAtual++;
  sim.man = criarLado(false, sel, kpiMan);
  sim.auto = criarLado(true, sel, kpiAuto);
  sim.turnoFim = performance.now() + DURACAO_TURNO * 1000;
  sim.restante = DURACAO_TURNO;
  sim.acQueue = [];
  sim.acSeq = 0;
}

/** Abre/fecha o braço da cancela conforme o caminhão da rota animada se aproxima/afasta — dados em gate.userData (ver armarAnimGate em scene.ts). */
function updateGates(lado: Lado, dt: number) {
  [lado.T.gateIn, lado.T.gateOut].forEach((gate) => {
    if (!gate?.userData.braco) return;
    const cfg = gate.userData.gateCfg;
    const abrir = lado.rotas.some((R) => {
      if (!R.ativo || R.parado) return false;
      if (gate === lado.T.gateIn && R.state === "wait" && R.order[R.ptr]?.stageId === "checkin") {
        const a = R.missaoTruck?.alert;
        if (a && !a.resolvido) return false; // só conta pra abrir a cancela depois de acertar a placa
      }
      const dx = gate.position.x - R.tractor.position.x;
      const dz = gate.position.z - R.tractor.position.z;
      return dx * dx + dz * dz < cfg.range * cfg.range;
    });
    const anim = (gate.userData.gateAnim ??= { t: 0 });
    const rate = 1 / Math.max(0.05, abrir ? cfg.delayOpen : cfg.delayClose);
    anim.t = THREE.MathUtils.clamp(anim.t + (abrir ? 1 : -1) * rate * dt, 0, 1);
    const sentido = gate.userData.sentidoAbertura || 1;
    (gate.userData.braco as THREE.Object3D).rotation.z = sentido * (Math.PI / 2) * 0.92 * anim.t;
  });
}

/** Avança clock/timer e os dois lados por dt segundos. Retorna true quando o turno acabou. */
export function tickSim(sim: SimState, dt: number, now: number): boolean {
  sim.clock += dt;
  sim.restante = Math.max(0, (sim.turnoFim - now) / 1000);
  liberarAposCancela(sim.man);
  sim.man.rotas.forEach((R) => stepRotaAnimada(sim.man, R, dt, sim));
  updateGates(sim.man, dt);
  liberarPorCadencia(sim.auto, sim);
  sim.auto.rotas.forEach((R) => stepRotaAnimada(sim.auto, R, dt, sim));
  updateGates(sim.auto, dt);
  return sim.restante <= 0;
}

export function descartarSimulacao() {
  const sim = simRef.current;
  if (!sim) return;
  disposeSceneContents(sim.man.scene);
  disposeSceneContents(sim.auto.scene);
  simRef.current = null;
}

export interface HUDSnapshot {
  restante: number;
  pontos: number;
  scoreMan: number;
  scoreAuto: number;
  rodadaAtual: number;
  rodadasTotal: number;
  alerta: Alerta | null;
  placa: string;
  /** Motorista do caminhão da missão aberta — a ficha do canto (ver
   *  FichaMotorista em SimScreen). Sai do MESMO truck que dá a placa: são o
   *  mesmo caminhão, e separá-los deixaria a ficha mostrar um nome que não é o
   *  de quem está no balcão. `null` entre um alerta e outro. */
  motorista: Motorista | null;
}

/**
 * De quem é cada ponto. Os três baldes do breakdown viram os DOIS lados do
 * versus: agilidade é o que a pessoa fez na mão (toque rápido em alerta), e
 * estratégia+etapas é o que a máquina dela fez sozinha (módulos, modais,
 * fechamento, ciclo, etapas automatizadas, caminhão expedido).
 *
 * Mora aqui, e não em cada tela, porque o HUD do turno, os dois cartões do
 * placar final e o número que vai pro ranking precisam contar a MESMA história.
 * Enquanto a divisão estava escrita à mão no snapshot do HUD, qualquer tela
 * nova podia inventar outra — e o visitante veria um placar durante a partida e
 * outro no fim.
 */
export function placarPorLado(sim: SimState): { man: number; auto: number } {
  return { man: sim.pontosAgilidade, auto: sim.pontosEstrategia + sim.pontosEtapas };
}

export function snapshotHUD(sim: SimState): HUDSnapshot {
  const alertaAtual = sim.man.filaAlertas[0];
  const placar = placarPorLado(sim);
  return {
    restante: sim.restante,
    pontos: sim.pontos,
    scoreMan: placar.man,
    scoreAuto: placar.auto,
    rodadaAtual: sim.rodadaAtual,
    rodadasTotal: sim.rodadasTotal,
    alerta: alertaAtual?.alerta ?? null,
    placa: alertaAtual?.truck.placa ?? "",
    motorista: alertaAtual?.truck.motorista ?? null,
  };
}

export interface CompRow {
  nome: string;
  m: number | null;
  a: number | null;
  tm: string;
  ta: string;
  menos?: boolean;
}

export interface EndResult {
  ganho: [string, string];
  pontos: number;
  pontosSem: number;
  /** O placar de cada lado, na mesma divisão que o HUD mostrou o turno inteiro
   *  (ver placarPorLado). `man` é também o número que vai pro ranking. */
  placar: { man: number; auto: number };
  breakdown: { estrategia: number; agilidade: number; etapas: number };
  comp: CompRow[];
  veredito: string | null;
  mods: string[];
}

/** Porte de mostrarPlacar() — linha 12411 da referência. */
export async function finalizarTurno(sel: Sel, currentLead: Lead | null): Promise<EndResult> {
  const sim = simRef.current!;
  const m = sim.man.kpi;
  const a = sim.auto.kpi;
  const cic = (k: Kpi) => (k.ciclos.length ? k.ciclos.reduce((x, y) => x + y, 0) / k.ciclos.length : 0);

  if (sel.mods.dashboard) {
    sim.pontos += PONTOS.FECHAMENTO_EXATO;
    sim.pontosEstrategia += PONTOS.FECHAMENTO_EXATO;
  }
  const cicAuto = cic(a);
  if (a.exp >= 3 && cicAuto > 0 && cicAuto < PONTOS.CICLO_META_S) {
    sim.pontos += PONTOS.CICLO_META_BONUS;
    sim.pontosEstrategia += PONTOS.CICLO_META_BONUS;
  }

  const ganho: [string, string] =
    m.exp && a.exp > m.exp
      ? [`+${Math.round(((a.exp - m.exp) / m.exp) * 100)}%`, "de caminhões expedidos com o AutoLoad"]
      : !m.exp && a.exp
        ? [`${a.exp}`, "caminhões expedidos com o AutoLoad — o manual não expediu nenhum"]
        : a.exp > 0
          ? [`${a.exp}`, "caminhões expedidos com o AutoLoad"]
          : ["0", "Nenhum caminhão expedido. Acenda módulos e compare os dois lados."];

  // Quatro linhas, não sete. O placar deixou de ser uma régua de eixo único e
  // virou DOIS cartões lado a lado (ver .placar-duo) — um do que a pessoa fez na
  // mão, outro do que o AutoLoad dela fez. Nesse formato cada linha ocupa um
  // bloco inteiro do cartão, e o visitante lê o placar de pé, a três metros da
  // TV, em cinco segundos: só sobrevive o que responde "valeu a pena?".
  //
  // O que saiu: volume expedido (anda junto com caminhões expedidos, é a mesma
  // vitória contada duas vezes), ocorrências (o que dói é a intervenção que ela
  // custou, e essa ficou), tempo de caminhão parado e divergência de inventário
  // (só apareciam em parte dos turnos — linha que às vezes existe é linha que
  // não se aprende a ler).
  //
  // "Caminhões processados" é o contador de check-ins: quantos caminhões cada
  // lado conseguiu pôr pra dentro no turno. Fica ao lado dos expedidos de
  // propósito — juntas, as duas linhas mostram quanto entrou e quanto saiu, e a
  // distância entre elas é o que ficou parado na rota.
  const semZero = (v: number) => (v > 0 ? v : null);
  const comp: CompRow[] = [
    { nome: "Caminhões expedidos", m: m.exp, a: a.exp, tm: `${m.exp}`, ta: `${a.exp}` },
    { nome: "Caminhões processados", m: m.checkins, a: a.checkins, tm: `${m.checkins}`, ta: `${a.checkins}` },
    {
      nome: "Ciclo médio por caminhão",
      m: semZero(cic(m)),
      a: semZero(cic(a)),
      menos: true,
      tm: cic(m) ? fmtMMSS(cic(m)) : "—",
      ta: cic(a) ? fmtMMSS(cic(a)) : "—",
    },
    { nome: "Intervenções humanas", m: m.interv, a: a.interv, tm: `${m.interv}`, ta: `${a.interv}`, menos: true },
  ];

  let winsA = 0;
  let winsM = 0;
  comp.forEach((l) => {
    const temM = l.m !== null && l.m !== undefined;
    const temA = l.a !== null && l.a !== undefined;
    if (temM && temA && l.m !== l.a) {
      if (l.menos ? l.a! < l.m! : l.a! > l.m!) winsA++;
      else winsM++;
    }
  });
  const veredito =
    winsA + winsM > 0
      ? winsM === 0
        ? `O AutoLoad venceu em todas as ${winsA} comparações`
        : `O AutoLoad venceu ${winsA} de ${winsA + winsM} comparações`
      : null;

  const usados = ORDEM_MODS.filter((k) => sel.mods[k]);
  // calculado DEPOIS dos dois bônus de fechamento acima, senão o cartão do
  // AutoLoad no placar final mostraria menos do que o HUD mostrou no último
  // segundo do turno.
  const placar = placarPorLado(sim);
  const result: EndResult = {
    ganho,
    pontos: sim.pontos,
    pontosSem: m.exp * PONTOS.EXPEDIDO_AUTO,
    placar,
    breakdown: { estrategia: sim.pontosEstrategia, agilidade: sim.pontosAgilidade, etapas: sim.pontosEtapas },
    comp,
    veredito,
    mods: usados,
  };
  endResultRef.current = result;

  // O QUE FICA NO RANKING É O QUE A PESSOA FEZ NA MÃO — `placar.man`, e não
  // `sim.pontos`.
  //
  // O ranking do dia é a disputa entre visitantes, e o lado AutoLoad não é
  // disputa nenhuma: ele roda sozinho, e quem acende mais módulos no montador
  // ganha pontos que a máquina fez por ele. Com o total, o topo da tabela
  // media configuração, não desempenho — duas pessoas com o mesmo desempenho
  // manual apareciam separadas por cem pontos só porque uma marcou mais
  // caixinhas antes de começar.
  //
  // O lado AutoLoad continua inteiro no placar final, ao lado do manual: é lá
  // que ele tem que ser visto, porque a comparação é o argumento do produto.
  // No ranking ele seria ruído.
  const whats = currentLead?.whats || "";
  await salvarRankingDia({
    nome: currentLead?.nome || "—",
    empresa: currentLead?.empresa || "",
    whats,
    pontos: placar.man,
    carregados: a.exp,
    mods: usados,
  });
  // mesmo número no lead: `melhor_pontos` é a marca pessoal do visitante, e ela
  // tem que falar a mesma língua da tabela em que ele se procura.
  if (whats) await atualizarLeadPosJogo(whats, placar.man);
  return result;
}

export const endResultRef: { current: EndResult | null } = { current: null };

