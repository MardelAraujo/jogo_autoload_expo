import * as THREE from "three";
import { M, applyTheme, setGroupColor, setGroupTexture, setGroupOpacity } from "./builders/core/materials";
import { box, cyl } from "./builders/builders/primitives";
import { makeTankFarm, makeLampPost, marcarTanques } from "./builders/builders/tank-farm";
import { makeGatehouse } from "./builders/builders/gatehouse";
import { makeTruckCenter } from "./builders/builders/truck-center";
import { makeScale } from "./builders/builders/scale";
import { makeBooth } from "./builders/builders/booth";
import { makeInspection, makeInspectionBooth } from "./builders/builders/inspection";
import { makeCanopy } from "./builders/builders/canopy";
import { makeGate } from "./builders/builders/gate";
import { makeBasin } from "./builders/builders/basin";
import { makeTotem } from "./builders/builders/totem";
import { makeTree, makeShrub } from "./builders/builders/tree";
import { makeShip } from "./builders/builders/ship";
import { makeRail, makeLoco, makeTankCar } from "./builders/builders/rail";
import { ribbonPts } from "./builders/builders/pista";
import { makeFence } from "./builders/builders/fence";
import { makeApron } from "./builders/builders/apron";
import { buildLibInstance, estadoDoAcervo } from "./model-library";
import { rendererAtual } from "./renderer";

declare global {
  interface Window {
    TEXTURAS_BASE?: Record<string, string>;
  }
}

// aplicarTexturasReais() só aplica fotos reais (grama/asfalto/concreto) quando
// window.TEXTURAS_BASE existe — no build estático (AutoLoad) isso vem
// embutido em base64 pelo build.mjs; aqui os mesmos arquivos já estão em
// public/textures/, só faltava apontar pra eles.
if (typeof window !== "undefined" && !window.TEXTURAS_BASE) {
  window.TEXTURAS_BASE = {
    asphalt: "/textures/asphalt.jpg",
    asphaltClean: "/textures/asphalt-clean.jpg",
    asphaltWorn: "/textures/asphalt-worn.jpg",
    concrete: "/textures/concrete.jpg",
    concretePavers: "/textures/concrete-pavers.jpg",
    terrain: "/textures/terrain.jpg",
    terrainMoss: "/textures/terrain-moss.jpg",
  };
}

// ---------------- planta importada (editor 3d_plant) ----------------
// Port de autoload_expo3d.html linhas ~8283-9846 (ver AGENTS.md deste
// diretório). PLANTA_LAYOUT vem do editor externo: {theme, elements:[{type,p,
// r,s,pista?}], truckGLB}.

export interface PlantaElement {
  type: string;
  cat?: string;
  name?: string;
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
  color?: number | string | null;
  seed?: number;
  pista?: { points: number[][]; closed?: boolean; width?: number };
  rota?: { points: number[][]; closed?: boolean; waits?: number[] };
  gate?: { range?: number; delayOpen?: number; delayClose?: number };
  [k: string]: unknown;
}

export interface PlantaTheme {
  road?: number | string;
  basin?: number | string;
  base?: number | string;
  laneMarking?: number | string;
  groundPattern?: string;
}

export interface PlantaEnvironment {
  fogOn?: boolean;
  fogColor?: string;
  fogLevel?: number;
  dayNight?: string;
}

export interface PlantaLayout {
  theme: PlantaTheme;
  environment?: PlantaEnvironment;
  elements: PlantaElement[];
  truckGLB?: string | null;
  truckAsset?: string | null;
  [k: string]: unknown;
}

let plantaPromise: Promise<PlantaLayout> | null = null;
let PL_CACHE: PlantaLayout | null = null;

/** Busca (e memoiza) planta_layout.json. */
export async function loadPlanta(): Promise<PlantaLayout> {
  if (!plantaPromise) {
    plantaPromise = fetch("/planta_layout.json")
      .then((r) => r.json())
      .then((json: PlantaLayout) => {
        PL_CACHE = json;
        return json;
      });
  }
  return plantaPromise;
}

/** Devolve a planta já carregada — lançar/null se loadPlanta() ainda não resolveu (o chamador dá await nela 1x no bootstrap). */
export function getPlanta(): PlantaLayout {
  if (!PL_CACHE) throw new Error("planta ainda não carregada — chame loadPlanta() antes de getPlanta()");
  return PL_CACHE;
}

/**
 * Troca a planta em vigor pela versão editada. Só o editor de admin chama:
 * depois de gravar em disco, o resto do app (rebuildPreview, a simulação do
 * turno seguinte) precisa passar a ler a planta nova sem um F5 — e um novo
 * fetch de /planta_layout.json voltaria do cache do browser.
 */
export function setPlanta(PL: PlantaLayout): void {
  PL_CACHE = PL;
  plantaPromise = Promise.resolve(PL);
}

export function elsDoTipo(PL: PlantaLayout, tipo: string): PlantaElement[] {
  return PL.elements.filter((e) => e.type === tipo);
}

/** Distância de (px,pz) ao segmento a→b, e o parâmetro t∈[0,1] do pé da perpendicular. */
function distAoSegmento(px: number, pz: number, a: number[], b: number[]): { d: number; t: number } {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const len2 = vx * vx + vz * vz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / len2)) : 0;
  return { d: Math.hypot(a[0] + t * vx - px, a[1] + t * vz - pz), t };
}

/**
 * Ordena um par de peças (as duas cancelas, os dois totens) pela ORDEM EM QUE O
 * CAMINHÃO PASSA POR ELAS na rota do layout: a primeira é a de entrada, a
 * segunda a de saída.
 *
 * Antes isso saía da posição no array de elementos, o que é frágil — o editor
 * grava na ordem em que as peças foram criadas, não na ordem do percurso. Foi
 * o que quebrou nesta planta: a rota foi redesenhada entrando pela cancela que
 * estava em segundo lugar no array, e o jogo passou a levantar o braço errado
 * (e a etapa de check-in, que só abre depois da placa acertada, deixou de
 * valer, porque quem reagia ao caminhão era a cancela de saída).
 *
 * Sem rota no layout, ou com menos de duas peças, devolve como veio.
 */
function ordenarPelaRota(els: PlantaElement[], rota: PlantaElement["rota"] | undefined): PlantaElement[] {
  const pts = rota?.points;
  if (!pts || pts.length < 2 || els.length < 2) return els;
  const avanco = (e: PlantaElement) => {
    let melhor = Infinity, onde = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const { d, t } = distAoSegmento(e.p[0], e.p[2], pts[k], pts[k + 1]);
      if (d < melhor) { melhor = d; onde = k + t; }
    }
    return onde;
  };
  return els
    .map((e, i) => ({ e, i, avanco: avanco(e) }))
    // desempate pelo índice original: sem rota que distinga as duas, nada muda
    .sort((a, b) => a.avanco - b.avanco || a.i - b.i)
    .map((x) => x.e);
}

export function pxz(e: PlantaElement | null): [number, number] {
  return e ? [e.p[0], e.p[2]] : [0, 0];
}

/**
 * Constantes derivadas da planta (EL_, PT_, WPTS, STAGE_PT, PT_TELAO) — na
 * referência estas são `const` de topo de arquivo porque PL está disponível
 * de forma síncrona; aqui PL só existe depois de loadPlanta() resolver, então
 * viram um cálculo explícito que buildTerminal roda no início de cada
 * chamada (ver ali). Ver autoload_expo3d.html linhas 8292-8510 pro raciocínio
 * completo de cada ponto — reproduzido aqui só como comentário resumido.
 */
function derivePlantaRefs(PL: PlantaLayout) {
  // a rota do caminhão animado é o que diz quem é entrada e quem é saída
  const _rota = elsDoTipo(PL, "caminhao_animado")[0]?.rota;
  const _cancelas = ordenarPelaRota(elsDoTipo(PL, "cancela"), _rota),
    _totens = ordenarPelaRota(elsDoTipo(PL, "totem"), _rota),
    _balancas = elsDoTipo(PL, "balanca"),
    _guaritas = elsDoTipo(PL, "guarita"),
    _vistorias = elsDoTipo(PL, "vistoria"),
    _coberturas = elsDoTipo(PL, "cobertura");

  const EL_PORTARIA = elsDoTipo(PL, "portaria")[0] || null;
  const EL_TRUCKCENTER = elsDoTipo(PL, "truck_center")[0] || null;
  const EL_TANQUES = elsDoTipo(PL, "parque_tanques")[0] || null;
  const EL_NAVIO = elsDoTipo(PL, "navio")[0] || null;
  const EL_FERROVIA = elsDoTipo(PL, "ferrovia")[0] || null;
  const EL_LOCOMOTIVA = elsDoTipo(PL, "locomotiva")[0] || null;
  const EL_VAGOES = elsDoTipo(PL, "vagao");

  const EL_CANCELA_IN = _cancelas[0] || null,
    EL_CANCELA_OUT = _cancelas[1] || null;
  const EL_TOTEM_IN = _totens[0] || null,
    EL_TOTEM_OUT = _totens[1] || null;
  const EL_BALANCA_PESAGEM2 = _balancas[0] || null,
    EL_BALANCA_PESAGEM1 = _balancas[1] || null;
  const PT_PESAGEM1 = EL_BALANCA_PESAGEM1 || EL_BALANCA_PESAGEM2;
  const PT_PESAGEM2 = EL_BALANCA_PESAGEM2 || EL_BALANCA_PESAGEM1;
  const EL_GUARITA_CHECKOUT = _guaritas[0] || null,
    EL_GUARITA_DECOR = _guaritas[1] || null;
  const PT_CHECKOUT = EL_GUARITA_CHECKOUT || EL_TOTEM_OUT || EL_CANCELA_OUT;
  const EL_VISTORIA_STAGE = _vistorias[0] || null,
    EL_VISTORIA_DECOR = _vistorias[1] || null;
  const EL_COBERTURA_DECOR = _coberturas[0] || null,
    EL_COBERTURA_STAGE = _coberturas[1] || null;

  const _ptMeio = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const PT_ACESSO_IN = _ptMeio(pxz(EL_TRUCKCENTER), pxz(PT_PESAGEM1));

  const WPTS: [number, number][] = [
    pxz(EL_PORTARIA),
    [-95, 100],
    pxz(EL_TRUCKCENTER),
    [-100, 95],
    PT_ACESSO_IN,
    pxz(PT_PESAGEM1),
    [95, 115],
    [104.42453359961004, 95.2890817064648],
    [110, 70],
    [100, 55],
    pxz(EL_COBERTURA_STAGE),
    pxz(PT_PESAGEM2),
    [-46.538058632573836, 68.69952041671564],
    [-59.016239390265355, 101.8747650756396],
    [-90.78443920044003, 104.36878011900647],
    [-85, 116],
    [-108, 132],
    [-145.23884757526554, 106.29947258505939],
    [-163.00797212870344, 124.05462125053549],
    [-118, 152],
    pxz(EL_CANCELA_IN),
    [-112, 128],
  ];
  const STAGE_WPT: Record<string, number> = {
    checkin: 0, patio: 2, acesso_in: 4, pesagem1: 5, vistoria: 7,
    carga: 10, pesagem2: 11, saida: 14, checkout: 15,
  };
  const STAGE_PT: Record<string, [number, number]> = {
    checkin: pxz(EL_PORTARIA), patio: pxz(EL_TRUCKCENTER),
    vistoria: pxz(EL_VISTORIA_STAGE), acesso_in: PT_ACESSO_IN,
    pesagem1: pxz(PT_PESAGEM1), carga: pxz(EL_COBERTURA_STAGE),
    pesagem2: pxz(PT_PESAGEM2), saida: pxz(EL_CANCELA_OUT),
    checkout: pxz(PT_CHECKOUT),
  };
  const PT_TELAO: [number, number] = (() => {
    const [x, z] = pxz(EL_TRUCKCENTER);
    return [x + 16, z + 14];
  })();

  return {
    EL_PORTARIA, EL_TRUCKCENTER, EL_TANQUES, EL_NAVIO, EL_FERROVIA, EL_LOCOMOTIVA, EL_VAGOES,
    EL_CANCELA_IN, EL_CANCELA_OUT, EL_TOTEM_IN, EL_TOTEM_OUT,
    EL_BALANCA_PESAGEM1, EL_BALANCA_PESAGEM2, PT_PESAGEM1, PT_PESAGEM2,
    EL_GUARITA_CHECKOUT, EL_GUARITA_DECOR, PT_CHECKOUT,
    EL_VISTORIA_STAGE, EL_VISTORIA_DECOR, EL_COBERTURA_DECOR, EL_COBERTURA_STAGE,
    PT_ACESSO_IN, WPTS, STAGE_WPT, STAGE_PT, PT_TELAO,
  };
}

// ---------------- caminhão 3D customizado (GLB do layout) ----------------
let truckTemplate: THREE.Object3D | null = null;
let truckTemplatePL: PlantaLayout | null = null;
function carregarTruckCustom(PL: PlantaLayout) {
  if (truckTemplatePL === PL || !PL.truckGLB) return;
  truckTemplatePL = PL;
  import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
    try {
      const bin = atob(PL.truckGLB!);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      new GLTFLoader().parse(
        bytes.buffer, "",
        (gltf) => { truckTemplate = gltf.scene; },
        (err) => console.warn("Falha ao carregar o caminhão customizado da planta:", err),
      );
    } catch (err) {
      console.warn("Falha ao decodificar o caminhão customizado da planta:", err);
    }
  });
}
function buildCustomTruck(): THREE.Group {
  const g = new THREE.Group();
  if (!truckTemplate) return g;
  const inst = truckTemplate.clone(true);
  inst.traverse((o) => {
    o.userData.doAcervo = true;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  g.userData.doAcervo = true;
  g.add(inst);
  return g;
}

/** O grupo interno de buildLibInstance() — onde ficam a escala e a rotação de repouso do meta.json. */
export const interno = (g: THREE.Object3D) => g.children[0];

/**
 * Peça da planta vinda do acervo, com o builder procedural como rede de
 * segurança enquanto o modelo não terminou de parsear.
 */
export function peca(assetId: string, substituto: () => THREE.Object3D): THREE.Object3D {
  return buildLibInstance(assetId) || substituto();
}

/** Repinta a luz de sinalização de uma peça do acervo (casa por cor, não por nome do nó — ver referência). */
export function trocarSinalizacao(g: THREE.Object3D, de: THREE.Material & { color: THREE.Color }, para: THREE.Material): THREE.Object3D {
  const alvo = de.color, tol = 2 / 255;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const c = mesh.isMesh ? (mesh.material as THREE.MeshLambertMaterial | undefined)?.color : undefined;
    if (c && Math.abs(c.r - alvo.r) < tol && Math.abs(c.g - alvo.g) < tol && Math.abs(c.b - alvo.b) < tol) mesh.material = para;
  });
  return g;
}

/** Cancela — .glb numa configuração só (braço +x, luz verde); as duas cancelas saem dela. */
export function pecaCancela(opts: { dir: number; len: number; entry: boolean }): THREE.Object3D {
  const doAcervo = buildLibInstance("objects/cancela");
  const g = doAcervo || makeGate(opts);
  if (doAcervo) {
    if (opts.dir < 0) interno(g).rotation.y += Math.PI;
    if (!opts.entry) trocarSinalizacao(g, M.ledGreen as THREE.Material & { color: THREE.Color }, M.ledRed);
  }
  g.userData.sentidoAbertura = doAcervo ? 1 : opts.dir < 0 ? -1 : 1;
  return g;
}

/** Bacia de contenção — a cor (`theme.basin`) é repintada depois de clonar, igual trocarSinalizacao(). */
/**
 * Marcacao de vagas com o pavimento embaixo.
 *
 * O modelo do acervo traz so as faixas brancas. Sem piso, elas apareciam
 * pintadas direto na grama do terreno - estacionamento de visitante desenhado
 * sobre gramado, que e a leitura errada e uma das coisas que mais saltava aos
 * olhos na entrada do terminal.
 *
 * O piso e dimensionado pela caixa envolvente do proprio modelo, com meio
 * metro de sobra em volta, entao acompanha qualquer escala que o elemento
 * receba na planta. Fica logo abaixo das faixas: baixo o bastante pra nao
 * brigar com elas no z-buffer, alto o bastante pra cobrir a grama.
 */
function pecaVagas(): THREE.Object3D | null {
  const g = buildLibInstance("objects/vagas");
  if (!g) return null;
  const caixa = new THREE.Box3().setFromObject(g);
  const tam = caixa.getSize(new THREE.Vector3());
  const meio = caixa.getCenter(new THREE.Vector3());
  // As faixas do modelo ficam entre y=0,071 e y=0,229 (medido). O piso entra
  // com o topo logo abaixo delas e desce por baixo do terreno — a primeira
  // tentativa o deixou inteiro abaixo de y=0 e ele simplesmente não aparecia,
  // enterrado no bloco do chão.
  const ESP = 0.14;
  const topo = caixa.min.y - 0.012;
  const piso = box(tam.x + 1, ESP, tam.z + 1, M.roadTex, meio.x, topo - ESP / 2, meio.z, g);
  piso.receiveShadow = true;
  piso.castShadow = false;
  return g;
}

export function pecaBacia(): THREE.Object3D {
  const g = buildLibInstance("structures/bacia");
  if (!g) return makeBasin();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = M.basin;
  });
  return g;
}

// ---------------- caminhão articulado procedural (rede de segurança) ----------------
// caminhão do jogo, cavalo+carreta articulados no estilo dos builders — usado
// só quando o modelo do acervo (trucks/*) ainda não terminou de parsear.
function makeArtTruck(cabMat?: THREE.Material) {
  const tractor = new THREE.Group(), tIn = new THREE.Group(); tractor.add(tIn);
  box(5, 4.6, 5.5, cabMat || M.red, 0, 3.7, 2.2, tIn);
  box(4.6, 1.7, 1.1, M.glass, 0, 5, 4.9, tIn);
  box(5.4, 1.4, 6.6, M.dark, 0, 1.2, 1.5, tIn);
  const rodas: { no: THREE.Object3D; eixo: string; raio: number }[] = [];
  ([[-2.5, 3.4], [2.5, 3.4], [-2.5, -0.6], [2.5, -0.6]] as [number, number][]).forEach(([x, z]) => {
    const w = cyl(1.1, 1.1, 0.8, M.dark, x, 1.1, z, tIn); w.rotation.z = Math.PI / 2;
    rodas.push({ no: w, eixo: "y", raio: 1.1 });
  });
  const trailer = new THREE.Group(), rIn = new THREE.Group(); trailer.add(rIn);
  const tk = cyl(2.5, 2.5, 15, M.steel, 0, 4.3, -1, rIn); tk.rotation.x = Math.PI / 2;
  box(5.2, 0.8, 15, M.dark, 0, 1.9, -1, rIn);
  ([[-2.5, -6.5], [2.5, -6.5], [-2.5, -4], [2.5, -4]] as [number, number][]).forEach(([x, z]) => {
    const w = cyl(1.1, 1.1, 0.8, M.dark, x, 1.1, z, rIn); w.rotation.z = Math.PI / 2;
    rodas.push({ no: w, eixo: "y", raio: 1.1 });
  });
  const cap = cyl(2.55, 2.55, 1.2, M.red, 0, 4.3, -8.4, rIn); cap.rotation.x = Math.PI / 2;
  tractor.userData.poseNo = tIn;
  trailer.userData.poseNo = rIn;
  return { tractor, trailer, rodas };
}

/**
 * Caminhão do turno — semirreboque-tanque do acervo, com o cavalo+carreta
 * procedural como rede de segurança. Ver "Normalização" na referência
 * (autoload_expo3d.html linhas 9076-9096) pro porquê da escala/pivô.
 */
const ESCALA_CAMINHAO = 1.21; // idem custom_m2 do layout
const NARIZ_CAMINHAO = 5.45; // z do para-brisa no cavalo procedural

/** x centrado, y apoiado no chão, z pelo nariz — aplicado no grupo interno de uma instância do acervo. */
function normalizarCaminhaoDoAcervo(g: THREE.Object3D, esc?: number) {
  const inst = interno(g);
  if (esc) inst.scale.multiplyScalar(esc);
  const bb = new THREE.Box3().setFromObject(inst);
  inst.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, NARIZ_CAMINHAO - bb.max.z);
  const pose = new THREE.Group();
  g.remove(inst); pose.add(inst); g.add(pose);
  g.userData.poseNo = pose;
  return g;
}

/** Rodas do rig, se houver nós separados pra elas (nomeados wheel/roda/tire/tyre/rim/pneu). */
const RE_RODA = /wheel|roda|tire|tyre|rim|pneu/i;
function acharRodas(raiz: THREE.Object3D) {
  raiz.updateMatrixWorld(true);
  const rodas: { no: THREE.Object3D; eixo: string; raio: number }[] = [];
  const vistos = new Set<THREE.Object3D>();
  const bb = new THREE.Box3(), sz = new THREE.Vector3(), v = new THREE.Vector3();
  raiz.traverse((o) => {
    if (!RE_RODA.test(o.name || "")) return;
    for (let p = o.parent; p; p = p.parent) if (vistos.has(p)) return;
    vistos.add(o);
    bb.setFromObject(o); if (bb.isEmpty()) return;
    bb.getSize(sz);
    const e = (["x", "y", "z"] as const)
      .map((eixo, i) => ({ eixo, dot: Math.abs(v.setFromMatrixColumn(o.matrixWorld, i).normalize().x) }))
      .sort((a, b) => b.dot - a.dot)[0].eixo;
    const dims = { x: [sz.y, sz.z], y: [sz.x, sz.z], z: [sz.x, sz.y] }[e];
    rodas.push({ no: o, eixo: e, raio: Math.max(0.35, Math.max(dims[0], dims[1]) / 2) });
  });
  return rodas;
}

function pecaCaminhao(i: number, cabMat: THREE.Material, caminhoesAcervo: string[]) {
  const g = buildLibInstance(caminhoesAcervo[i % caminhoesAcervo.length]);
  if (!g) return makeArtTruck(cabMat);
  normalizarCaminhaoDoAcervo(g, ESCALA_CAMINHAO);
  return { tractor: g, trailer: null as THREE.Object3D | null, rodas: acharRodas(g) };
}

const TRAILER_GAP_U = 8.5; // cavalo→carreta em unidades (idem BASE_SPEED/HEADWAY, ver constants.ts)

/** Amostra a curva pra achar o t∈[0,1] de cada ponto de controle — port de computeOrder(). */
function ordemRota(curve: THREE.CatmullRomCurve3, points: number[][]) {
  const SAMP = 720;
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i < SAMP; i++) samples.push(curve.getPointAt(i / SAMP));
  return points
    .map((pt, idx) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < SAMP; i++) {
        const p = samples[i];
        const d = (p.x - pt[0]) ** 2 + (p.z - pt[1]) ** 2;
        if (d < bd) { bd = d; best = i / SAMP; }
      }
      return { idx, t: best };
    })
    .sort((a, b) => a.t - b.t);
}

/** Estado de animação de um caminhão do layout — ver g.userData.rotaAnimada abaixo. */
export interface RotaAnimadaEstado {
  curve: THREE.CatmullRomCurve3;
  curveLen: number;
  order: { idx: number; t: number }[];
  waits: number[];
  closed: boolean;
  tractor: THREE.Object3D;
  trailer: THREE.Object3D | null;
  root: THREE.Object3D;
  tPos: number;
  ptr: number;
  state: string;
  waitLeft: number;
  ativo?: boolean;
  indiceFrota?: number;
}

/**
 * `caminhao_animado` do layout: cavalo+carreta seguindo a curva Catmull-Rom
 * salva em `rota.points`, com o rig RÍGIDO do acervo (mesmo `trucks/*` de
 * pecaCaminhao). O estado de animação fica em `g.userData.rotaAnimada` — quem
 * monta a cena (buildTerminal) copia pra `T.rotaAnimada`; o avanço por frame
 * (stepRotaAnimada) é responsabilidade de uma fase posterior do port.
 */
export function pecaCaminhaoAnimado(
  rota: PlantaElement["rota"] | undefined,
  modeloCaminhaoId: string | null | undefined,
  modelosCaminhaoDefault: string,
): THREE.Group | null {
  if (!rota || !Array.isArray(rota.points) || rota.points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(
    rota.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!rota.closed, "centripetal", 0.5);
  const curveLen = Math.max(curve.getLength(), 1);
  const order = ordemRota(curve, rota.points);
  const gapT = Math.min(0.1, TRAILER_GAP_U / curveLen);
  const t0 = Math.max(0, order[0].t - 0.01);
  const p = curve.getPointAt(t0), q = curve.getPointAt(Math.min(0.99, t0 + 0.01));
  const yaw = Math.atan2(q.x - p.x, q.z - p.z);
  const g = new THREE.Group();
  const idPedido = modeloCaminhaoId || modelosCaminhaoDefault;
  const doAcervo = buildLibInstance(idPedido);
  // guardados pro instrumentador de rota (sim/debug-rota.ts): QUAL modelo foi
  // pedido e em que estado o acervo estava NESTE INSTANTE. Ler o estado depois
  // não serve — o .glb pode ter terminado de carregar no meio-tempo, e aí o
  // log diria "pronto" pra um caminhão que saiu procedural.
  g.userData.modeloPedido = idPedido;
  g.userData.acervoNoMomento = estadoDoAcervo(idPedido);
  let tractor: THREE.Object3D, trailer: THREE.Object3D | null = null;
  if (doAcervo) {
    normalizarCaminhaoDoAcervo(doAcervo);
    doAcervo.position.set(p.x, 0, p.z); doAcervo.rotation.y = yaw;
    g.add(doAcervo);
    tractor = doAcervo;
  } else {
    const tk = makeArtTruck(M.red);
    tk.tractor.position.set(p.x, 0, p.z); tk.tractor.rotation.y = yaw;
    const tp = curve.getPointAt(Math.max(0, t0 - gapT));
    tk.trailer.position.set(tp.x, 0, tp.z); tk.trailer.rotation.y = yaw;
    g.add(tk.tractor, tk.trailer);
    tractor = tk.tractor; trailer = tk.trailer;
  }
  g.userData.rotaAnimada = {
    curve, curveLen, order, waits: rota.waits || [], closed: !!rota.closed,
    tractor, trailer, root: g, tPos: t0, ptr: 0, state: "move", waitLeft: 0,
  };
  return g;
}

// Normalização do caminhão-tanque parado, copiada do FUEL_MODEL do editor
// (builders/fuel-truck.js): o modelo cru é escalado até ter COMPRIMENTO_PARADO
// de comprimento e reposicionado com a origem no tandem da carreta, que é o
// pivô sobre o qual a escala `s` do elemento (1.29 no layout atual) age.
const CAMINHAO_PARADO_ASSET = "trucks/fuel-truck-style-adapted"; // FUEL_MODEL.asset do editor
const COMPRIMENTO_PARADO = 17;
const EIXO_TANDEM_Z = 22.2; // FUEL_MODEL.axleZ, em unidades do modelo

/**
 * `caminhao_fuel_estatico` do layout: o caminhão-tanque estacionado, sem rota.
 *
 * O editor monta essa peça cortando o .glb em cavalo+carreta e afastando o
 * cavalo do pivô — só que, pra um caminhão PARADO, o afastamento é exatamente
 * o que separa o pino-rei do tandem, então as duas metades voltam a casar e o
 * resultado é o modelo inteiro deslocado por `-axleZ` e apoiado no chão. É o
 * que se faz aqui, numa peça só: o corte só ganha sentido quando o caminhão
 * dobra numa curva, que é o caso do `caminhao_animado`.
 */
export function pecaCaminhaoParado(): THREE.Object3D | null {
  const g = buildLibInstance(CAMINHAO_PARADO_ASSET);
  if (!g) return null;
  const inst = interno(g);
  const bb = new THREE.Box3().setFromObject(inst);
  const k = COMPRIMENTO_PARADO / Math.max(1e-6, bb.max.z - bb.min.z);
  inst.scale.multiplyScalar(k);
  inst.position.set(0, -bb.min.y * k, -EIXO_TANDEM_Z * k);
  return g;
}

/**
 * Vegetação de perímetro — variação por instância (rotação/escala) no lugar do
 * sorteio do builder.
 *
 * O `seed` vem do elemento: o editor sorteia UMA vez, ao criar a peça, e grava
 * o valor no layout justamente pra ela ser reconstruída idêntica a cada
 * abertura (ver persistence/state.js do 3d_plant). Sortear aqui de novo fazia
 * a mata sair diferente da do editor — e diferente a cada reload do jogo.
 *
 * A forma não sai idêntica à de lá: no editor o seed alimenta makeTree/makeShrub,
 * que variam tronco e copa; aqui a peça vem do acervo, que é UMA exportação
 * congelada desse builder (manifest: `builder: "arvore"`), então o seed só pode
 * mover rotação e tamanho. O substituto procedural, esse sim, reconstrói igual.
 */
export function pecaVegetacao(assetId: string, substituto: (seed?: number) => THREE.Object3D, seed?: number): THREE.Object3D {
  const g = buildLibInstance(assetId);
  if (!g) return substituto(seed);
  const s = seed ?? Math.random();
  interno(g).rotation.y = s * Math.PI * 2;
  interno(g).scale.multiplyScalar(0.82 + s * 0.4);
  return g;
}

/**
 * Acabamento individual do elemento — foto (`e.texture`), cor (`e.color`) e
 * translucidez (`e.alpha`), os três controles do painel de propriedades do
 * editor. A ordem importa e é a mesma de lá: a foto zera a cor do material pra
 * branco, então tingir depois é o que preserva os dois ajustes juntos.
 *
 * Peças que se pintam sozinhas (a pista, que tem asfalto e faixas com cores
 * próprias) marcam `corDoElementoAplicada` e ficam de fora — cobrir o grupo
 * inteiro com uma foto apagaria as marcações do piso.
 */
function aplicarAparencia(g: THREE.Object3D, e: PlantaElement) {
  const propria = !!g.userData.corDoElementoAplicada;
  if (!propria && typeof e.texture === "string" && e.texture) setGroupTexture(g, e.texture);
  corDoElemento(g, e);
  if (!propria && typeof e.alpha === "number" && e.alpha < 1) setGroupOpacity(g, e.alpha);
}

/**
 * Cor individual do elemento (`e.color`) — o color picker por elemento do
 * painel de propriedades do editor.
 *
 * O hex entra CRU, sem `convertSRGBToLinear()`. Havia uma conversão aqui, e
 * ela era a causa de a planta chegar ao jogo quase toda preta: este renderer
 * é de saída linear com texturas sem `encoding`, então o projeto inteiro trata
 * número sRGB como se já fosse linear — a paleta dos builders (`M.leafMid`,
 * `M.locoAccent`, `M.shipHull`…) nunca passou por conversão nenhuma.
 * Converter só as cores vindas da planta jogava esse subconjunto para uma
 * escala diferente da do resto da cena, e o erro cresce com o quanto a cor é
 * escura: o verde de grama 0x1f421a de uma bacia virava 0x030e02, preto puro.
 * Eram justamente as bacias que ocupavam os maiores vazios pretos da tela.
 *
 * O mesmo vale para o tema (abaixo) e para o chão (aplicarTexturasReais).
 * A neblina continua convertida de propósito: ela é misturada no fragment
 * shader depois da iluminação, não é cor de superfície.
 */
export function corDoElemento(g: THREE.Object3D, e: PlantaElement | null): THREE.Object3D {
  if (!e || e.color == null) return g;
  if (g.userData.corDoElementoAplicada) return g;
  setGroupColor(g, e.color);
  return g;
}

/** As quatro cores do tema (pista, bacia, base, faixa) — ver corDoElemento sobre o espaço de cor. */
export function aplicarTemaDaPlanta(tema: PlantaTheme) {
  applyTheme(tema as Record<string, number | string | null | undefined>);
}

// ---------------- texturas reais (fotos) ----------------
function fotoDoChao(TB: Record<string, string>, PL: PlantaLayout) {
  const padrao = PL.theme && PL.theme.groundPattern;
  return padrao === "terrain-moss" ? TB.terrainMoss : TB.terrain;
}

// Céu de cada período. O `day` é a cor que o jogo já usava — as intensidades
// de luz do editor NÃO vêm junto de propósito: lá o render é sRGB + tone
// mapping ACES (core/render-config.js) e aqui é saída linear, então os valores
// de lá deixariam a cena lavada. O que se honra é o que o usuário escolheu na
// aba Aparência: período, neblina, cor e densidade dela.
const CEU_DO_PERIODO: Record<string, number> = { day: 0xd6d6da, night: 0x11141f };

/**
 * `environment` do layout — o painel Aparência do editor: liga/desliga a
 * neblina, escolhe a cor e a densidade dela (`fogLevel`) e o período do dia.
 *
 * As distâncias saem do mesmo cálculo do editor (fitFog em core/scene.js):
 * amarradas ao tamanho do terreno, não fixas, porque um alcance fixo engole
 * metade de uma planta de 1 km. `fogLevel` só encolhe ou estica esse alcance —
 * 0.5 é o padrão, mais denso começa mais perto.
 */
/**
 * Céu em degradê, como textura de fundo.
 *
 * `scene.background` aceita cor OU textura; com cor, o Three só chama
 * gl.clearColor e o horizonte fica um chapado cinza que denuncia a maquete.
 * Com textura, o Three desenha um quad de tela cheia antes da cena — custo
 * de um triângulo, sem dome, sem geometria extra e sem entrar no cálculo de
 * sombra. Como a câmera é ORTOGRÁFICA e sempre olha de cima pro mesmo lado
 * (ver camera.ts), um degradê fixo em tela basta: não há para onde virar e
 * flagrar que o céu não acompanha.
 *
 * A ponta de baixo do degradê é a cor da neblina — é ali que a planta some
 * ao longe, e qualquer diferença entre as duas viraria uma linha de horizonte
 * dura no meio do pátio.
 */
const ceuCache: Record<string, THREE.CanvasTexture> = {};
function texturaDoCeu(periodo: string): THREE.CanvasTexture {
  if (ceuCache[periodo]) return ceuCache[periodo];
  const paradas: [number, string][] = periodo === "night"
    ? [[0, "#080a14"], [0.55, "#141a2c"], [1, "#2a2f3d"]]
    : [[0, "#7fa8cd"], [0.42, "#b9cfe2"], [0.78, "#d8dade"], [1, "#e2e0dc"]];
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  paradas.forEach(([t, cor]) => grad.addColorStop(t, cor));
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  ceuCache[periodo] = tex;
  return tex;
}

function aplicarAmbiente(scene: THREE.Scene, PL: PlantaLayout) {
  const amb = PL.environment || {};
  const periodo = amb.dayNight || "day";
  // o fundo é desenhado como quad de tela cheia, sem passar pelo shader da
  // cena: a textura fica em sRGB cru, igual à cor que havia aqui antes.
  scene.background = texturaDoCeu(periodo in CEU_DO_PERIODO ? periodo : "day");
  if (amb.fogOn === false) {
    scene.fog = null;
    return;
  }
  // cor da neblina é misturada dentro do fragment shader — vai pra linear,
  // como todo o resto da paleta da planta (ver aplicarTemaDaPlanta)
  const cor = new THREE.Color(amb.fogColor ?? 0xd6d6da).convertSRGBToLinear().getHex();
  const terreno = (PL.terrain || {}) as { groundW?: number; groundD?: number };
  const alcance = Math.hypot(terreno.groundW || GROUND_W, terreno.groundD || 900) / 2;
  const t = amb.fogLevel == null ? 0.5 : amb.fogLevel;
  const k = 0.25 + (1 - t) * 1.5;
  scene.fog = new THREE.Fog(cor, alcance * 1.9 * k, alcance * 3.4 * k);
}

let texturasBaseCarregadas: Record<string, THREE.Texture> | null = null;
let fotoChaoAtual: string | null = null;
export function aplicarTexturasReais(PL: PlantaLayout) {
  const TB = (typeof window !== "undefined" && window.TEXTURAS_BASE) || null;
  if (!TB) return; // build sem base-textures/ (ou template antigo) — mantém o ruído procedural
  if (!texturasBaseCarregadas) {
    // Filtro anisotrópico: o chão e o pátio são planos enormes vistos quase
    // de raspão pela câmera isométrica, e é exatamente esse o caso em que a
    // mipmap sozinha borra a textura até virar cinza liso a 30 m da câmera.
    // Custa amostras a mais só nos fragmentos inclinados — nas peças de perto
    // (que a câmera vê de frente) o hardware nem entra nesse caminho.
    const aniso = Math.min(4, rendererAtual()?.capabilities.getMaxAnisotropy() ?? 1);
    const carregar = (url: string) => {
      const t = new THREE.TextureLoader().load(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      return t;
    };
    texturasBaseCarregadas = {
      asphaltPista: carregar(TB.asphaltClean || TB.asphalt),
      // Pátio e bacia usavam `asphalt.jpg`, cuja média é RGB(34,30,29) — 13% de
      // luminância. Multiplicada pela iluminação difusa, a maior superfície da
      // tela caía para ~8% e lia como um buraco preto, não como asfalto: era o
      // vazio escuro no meio da planta. `asphalt-worn` é a mesma família de
      // foto com média RGB(89,80,70), e aí o pátio tem textura visível. A
      // pista continua na foto mais escura de propósito — a via ser mais
      // escura que o pátio é o que dá a leitura de faixa de rolamento.
      asphaltPatio: carregar(TB.asphaltWorn || TB.asphalt),
      asphaltBacia: carregar(TB.asphaltWorn || TB.asphalt),
      concreto: carregar(TB.concrete),
      terreno: carregar(TB.terrain),
      terrenoMusgo: carregar(TB.terrainMoss),
    };
    texturasBaseCarregadas.asphaltPatio.repeat.set(1, 1);
    texturasBaseCarregadas.asphaltBacia.repeat.set(3, 3);
    texturasBaseCarregadas.terreno.repeat.set(GROUND_W / 150, 900 / 150);
    texturasBaseCarregadas.terrenoMusgo.repeat.set(GROUND_W / 150, 900 / 150);
  }
  (M.road as THREE.MeshLambertMaterial).map = texturasBaseCarregadas.asphaltPista;
  (M.roadTex as THREE.MeshLambertMaterial).map = texturasBaseCarregadas.asphaltPatio;
  (M.basin as THREE.MeshLambertMaterial).map = texturasBaseCarregadas.asphaltBacia;
  const foto = fotoDoChao(TB, PL);
  if (foto !== fotoChaoAtual) {
    fotoChaoAtual = foto;
    (M.ground as THREE.MeshLambertMaterial).map = foto === TB.terrainMoss ? texturasBaseCarregadas.terrenoMusgo : texturasBaseCarregadas.terreno;
  }
  // O chão NÃO passa por convertSRGBToLinear, e é o único do tema que não
  // passa. O resto da paleta dos builders (`M.leafMid`, `M.locoAccent`…) entra
  // crua, porque o renderer é de saída linear com texturas sem encoding — o
  // projeto inteiro trata número sRGB como linear e fica coerente consigo
  // mesmo. Converter só esta cor a deslocava para fora dessa convenção: o
  // verde 0x426645 do tema virava 0x0e2210 e, multiplicado ainda pela foto de
  // musgo, o terreno saía PRETO no jogo enquanto o editor o mostrava verde.
  // Era a causa de a planta parecer flutuar num vazio escuro.
  if (PL.theme && PL.theme.base != null) (M.ground as THREE.MeshLambertMaterial).color.set(PL.theme.base);
  (M.water as THREE.MeshLambertMaterial).map = texturaDoMar();
  (M.water as THREE.MeshLambertMaterial).color.set(COR_DA_AGUA);
  [M.road, M.roadTex, M.basin, M.ground, M.water].forEach((m) => { m.needsUpdate = true; });
}

/** Mar — cor de água parada + textura de marolas (ver referência pro porquê da divisão cor/textura). */
export const COR_DA_AGUA = 0x0b364c;
let texturaMar: THREE.CanvasTexture | null = null;
export function texturaDoMar(): THREE.CanvasTexture {
  if (texturaMar) return texturaMar;
  const S = 256;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b8b8b8"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * S, x = Math.random() * S;
    const w = 5 + Math.random() * 13, h = 30 + Math.random() * 90;
    const a = 0.05 + Math.random() * 0.15;
    for (const dy of [-S, 0, S]) {
      const grad = g.createLinearGradient(x - w, 0, x + w, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(x, y + dy, w, h, 0, 0, Math.PI * 2); g.fill();
    }
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  texturaMar = new THREE.CanvasTexture(c);
  texturaMar.wrapS = texturaMar.wrapT = THREE.RepeatWrapping;
  texturaMar.repeat.set(1, 4);
  return texturaMar;
}

// ---------------- pista paramétrica (única peça que continua procedural) ----------------
const ASFALTO_PISTA = 0.09; // asfalto novo → pista quase preta da captura
const AMARELA_DO_EIXO = 0.19; // fração da largura entre o eixo e a faixa âmbar
const MARCACAO_AMARELA = new THREE.MeshBasicMaterial({ color: 0xf3a712 });

export function pistaDoLayout(pd: NonNullable<PlantaElement["pista"]>, cor: number | string | null | undefined): THREE.Object3D {
  const g = new THREE.Group();
  const fechada = !!pd.closed;
  const W = pd.width || 11;
  const curva = new THREE.CatmullRomCurve3(
    pd.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), fechada, "centripetal", 0.5);
  const tinta = new THREE.Color(cor == null ? 0xffffff : cor);

  const asfalto = ribbonPts(curva, W, 0, 0.12, (M.road as THREE.Material).clone(), false, fechada, W) as THREE.Mesh & { material: THREE.MeshLambertMaterial };
  asfalto.material.color.copy(tinta).convertSRGBToLinear().multiplyScalar(ASFALTO_PISTA);
  g.add(asfalto);

  const central = ribbonPts(curva, 0.32, 0, 0.2, (M.line as THREE.Material).clone(), true, fechada) as THREE.Mesh & { material: THREE.MeshBasicMaterial };
  central.material.color.copy(tinta);
  g.add(central);

  if (fechada) g.add(ribbonPts(curva, 0.34, W * AMARELA_DO_EIXO, 0.2, MARCACAO_AMARELA, true, fechada));

  g.userData.corDoElementoAplicada = true;
  return g;
}

// figura humana simples (funcionário)
export function makePerson(cor?: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: cor || 0xf5a623 });
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.5, 10), mat);
  corpo.position.y = 1.05; corpo.castShadow = true; g.add(corpo);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8c39e }));
  cabeca.position.y = 2.1; cabeca.castShadow = true; g.add(cabeca);
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  capacete.position.y = 2.16; g.add(capacete);
  return g;
}

export const GROUND_RIGHT_X = 170; // onde o cais/mar começam
export const GROUND_LEFT_X = -340; // borda oeste, inalterada
export const GROUND_W = GROUND_RIGHT_X - GROUND_LEFT_X;

/**
 * Frota que circula na simulação — três liverias do mesmo semirreboque-tanque
 * do acervo (ver pecaCaminhao()).
 */
export const CAMINHOES_ACERVO = ["trucks/fuel-truck-industrial", "trucks/fuel-truck-classic", "trucks/fuel-truck-style-adapted"];

/**
 * Modelos de caminhão que o visitante pode escolher no montador (skin do
 * caminhão animado). `img` é a vitrine mostrada no painel — o arquivo é
 * nomeado pelo ID DO MODELO, nao pelo rotulo, pra que trocar `nome` nunca
 * desassocie a foto do .glb que ela retrata.
 */
export const MODELOS_CAMINHAO = [
  { id: "trucks/fuel-truck-style-adapted", nome: "Original", img: "/trucks/fuel-truck-style-adapted.webp" },
  { id: "trucks/fuel-truck-industrial", nome: "Industrial", img: "/trucks/fuel-truck-industrial.webp" },
];

export interface BuildTerminalHandle {
  equip: THREE.Group;
  pulses: THREE.Object3D[];
  badges: THREE.Object3D[];
  curve: THREE.CatmullRomCurve3;
  curveLen: number;
  gateIn: THREE.Object3D;
  gateOut: THREE.Object3D;
  ship?: THREE.Object3D | null;
  person: THREE.Group;
  rotaAnimada?: RotaAnimadaEstado;
  rotasAnimadas?: RotaAnimadaEstado[];
}

/**
 * Monta um terminal completo numa cena, a partir da planta importada
 * (PL.elements). `mods`/`modais` controlam o equipamento de automação
 * visível. Retorna referências pra animação (fase de simulação, fora deste
 * módulo). Port de buildTerminal() — autoload_expo3d.html linhas 9570-9846.
 */
export function buildTerminal(
  scene: THREE.Scene,
  mods: Record<string, boolean>,
  modais: { ferro: boolean; mar: boolean; duto: boolean },
  PL: PlantaLayout,
  sel?: { modeloCaminhao?: string | null; quantidadeCaminhoes?: number },
): BuildTerminalHandle {
  const refs = derivePlantaRefs(PL);
  const {
    EL_PORTARIA, EL_TRUCKCENTER, EL_TANQUES, EL_NAVIO, EL_FERROVIA, EL_LOCOMOTIVA, EL_VAGOES,
    EL_CANCELA_IN, EL_CANCELA_OUT, EL_TOTEM_IN, EL_TOTEM_OUT,
    EL_BALANCA_PESAGEM1, EL_BALANCA_PESAGEM2,
    EL_GUARITA_CHECKOUT, EL_GUARITA_DECOR,
    EL_VISTORIA_STAGE, EL_VISTORIA_DECOR, EL_COBERTURA_DECOR, EL_COBERTURA_STAGE,
    WPTS, PT_TELAO,
  } = refs;

  carregarTruckCustom(PL);

  const T = { equip: new THREE.Group(), pulses: [], badges: [] } as unknown as BuildTerminalHandle;
  aplicarTemaDaPlanta(PL.theme);
  aplicarTexturasReais(PL);
  aplicarAmbiente(scene, PL);
  // Balanço das luzes: o ambiente uniforme era o dobro do que precisava e
  // achatava tudo — sem gradiente entre a face iluminada e a de sombra, cada
  // tanque virava uma silhueta branca. Parte dessa energia foi para a
  // hemisférica (que já separa céu de chão) e parte para o sol, que agora
  // desenha o volume. A soma é praticamente a mesma, então a cena não
  // escureceu; só ganhou relevo. Nenhuma dessas mudanças custa frame.
  scene.add(new THREE.AmbientLight(0xffffff, 0.34));
  scene.add(new THREE.HemisphereLight(0xdfe8f7, 0x8e8a80, 0.5));
  const sun = new THREE.DirectionalLight(0xfff2da, 1.02);
  sun.position.set(-140, 200, -90); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const S = 260;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S; sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 700; sun.shadow.bias = -0.0006;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.BoxGeometry(GROUND_W, 4, 900), M.ground);
  ground.position.set((GROUND_LEFT_X + GROUND_RIGHT_X) / 2, -2, 20); ground.receiveShadow = true; scene.add(ground);
  const sea = new THREE.Mesh(new THREE.BoxGeometry(140, 3.4, 900), M.water);
  sea.position.set(240, -2.2, 20); sea.receiveShadow = true; scene.add(sea);
  box(4, 4.6, 900, M.concrete, 172, -1.7, 20, scene);

  const curve = new THREE.CatmullRomCurve3(WPTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal", 0.5);
  T.curve = curve; T.curveLen = curve.getLength();

  /**
   * Peças que deixam de PROJETAR sombra (continuam recebendo).
   *
   * A cena tem 1.194 malhas, e 1.040 delas projetavam sombra — ou seja, o
   * terminal inteiro era desenhado uma SEGUNDA vez por quadro, dentro do mapa
   * de sombra da direcional. E a passada de sombra não se beneficia do
   * enquadramento da câmera: o frustum ali é o da LUZ, que cobre a planta toda,
   * então até o que está fora de vista custava uma chamada de desenho.
   *
   * O corte é por LEITURA, não por tamanho: o que sai é o cenário distante e o
   * miúdo, cuja sombra não se distingue na altura de câmera do jogo — o trem
   * inteiro (8 vagões + locomotiva + via, sozinhos 58% das malhas da cena), o
   * navio, a cerca, o paisagismo, os postes e as superfícies rasteiras, que só
   * têm o que receber. Fica projetando sombra o que dá volume ao terminal e o
   * que o visitante olha de perto: tancagem, coberturas, prédios, cabines,
   * balanças, cancelas, totens e os caminhões.
   */
  const SEM_SOMBRA = new Set([
    "vagao", "locomotiva", "ferrovia", "navio",
    "grade", "poste_luz",
    "arvore", "arbusto", "arbusto_quadrado", "canteiro",
    "pista", "vagas", "pavimento", "bacia",
  ]);
  function tirarSombra(g: THREE.Object3D, tipo: string) {
    if (!SEM_SOMBRA.has(tipo) && !tipo.startsWith("lib_plants/")) return;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = false;
    });
  }

  function colocar(e: PlantaElement | null, buildFn: () => THREE.Object3D): THREE.Object3D | null {
    if (!e) return null;
    const g = buildFn();
    g.position.set(e.p[0], e.p[1], e.p[2]);
    g.rotation.set(e.r[0], e.r[1], e.r[2]);
    g.scale.set(e.s[0], e.s[1], e.s[2]);
    corDoElemento(g, e);
    tirarSombra(g, e.type);
    scene.add(g);
    return g;
  }

  // ---- instalações fixas da planta (sempre presentes) ----
  // marcarTanques põe a marca AutoLoad no costado — fica por fora do builder
  // porque o caminho normal é o .glb do acervo, e lá makeTank nem roda.
  const pecaParque = () => marcarTanques(peca("structures/parque-tanques", makeTankFarm));
  colocar(EL_TANQUES, pecaParque);
  elsDoTipo(PL, "parque_tanques").slice(1).forEach((e) => colocar(e, pecaParque));
  colocar(EL_PORTARIA, () => peca("structures/portaria", makeGatehouse));
  colocar(EL_TRUCKCENTER, makeTruckCenter);
  colocar(EL_BALANCA_PESAGEM1, () => peca("structures/balanca", makeScale));
  colocar(EL_BALANCA_PESAGEM2, () => peca("structures/balanca", makeScale));
  colocar(EL_GUARITA_CHECKOUT, () => peca("structures/guarita", makeBooth));
  colocar(EL_GUARITA_DECOR, () => peca("structures/guarita", makeBooth));
  // Vistoria e truck center também deixam o acervo: as duas carregam a cabine
  // envidraçada de builders/inspection.ts, e o .glb congelado guardaria a
  // versão antiga dela. Mesma decisão da cerca e da cobertura.
  colocar(EL_VISTORIA_STAGE, makeInspection);
  colocar(EL_VISTORIA_DECOR, makeInspection);
  // A plataforma de carga NÃO vem do acervo. `structures/cobertura.glb` é uma
  // exportação congelada deste mesmo builder (ver `builder`/`srcSha` no
  // manifest.json), e o exportador vivia no editor 3d_plant, que não existe
  // mais no repositório — então qualquer conserto na geometria dela morreria
  // no .glb antigo, sem chegar à tela. Mesma decisão da cerca: quem manda é o
  // builder. Ver builders/canopy.ts.
  colocar(EL_COBERTURA_STAGE, makeCanopy);
  colocar(EL_COBERTURA_DECOR, makeCanopy);

  /**
   * Instâncias EXTRAS dos tipos que derivePlantaRefs indexa por ordem.
   *
   * Aquele bloco acima pega o 1º e o 2º elemento de cada tipo porque é disso
   * que a simulação precisa (a balança da pesagem 1, a da pesagem 2, a
   * cobertura do palco, a de decoração…). O efeito colateral era que uma
   * TERCEIRA peça do mesmo tipo, colocada na planta só como cenário, nunca
   * chegava à tela: o desenvolvedor a via no editor 3d_plant e não a via no
   * jogo, sem nenhum aviso. Na planta de hoje era o caso da segunda
   * `ferrovia` (149, -302), o trecho de linha que corre para o sul do
   * terminal marítimo.
   *
   * O padrão já existia para `parque_tanques` logo acima; aqui ele só passa a
   * valer para os outros tipos estruturais. `cancela` e `totem` ficam de fora
   * de propósito: eles carregam animação e dependem do módulo contratado, e
   * uma cópia decorativa entraria na cena com estado de jogo pela metade.
   */
  const EXTRAS_ESTRUTURAIS: { tipo: string; indexadas: number; construir: () => THREE.Object3D }[] = [
    { tipo: "ferrovia", indexadas: 1, construir: () => peca("structures/ferrovia", makeRail) },
    { tipo: "navio", indexadas: 1, construir: () => peca("vehicles/navio", makeShip) },
    { tipo: "portaria", indexadas: 1, construir: () => peca("structures/portaria", makeGatehouse) },
    { tipo: "truck_center", indexadas: 1, construir: makeTruckCenter },
    { tipo: "locomotiva", indexadas: 1, construir: () => peca("vehicles/locomotiva", makeLoco) },
    { tipo: "balanca", indexadas: 2, construir: () => peca("structures/balanca", makeScale) },
    { tipo: "guarita", indexadas: 2, construir: () => peca("structures/guarita", makeBooth) },
    { tipo: "vistoria", indexadas: 2, construir: makeInspection },
    { tipo: "cobertura", indexadas: 2, construir: makeCanopy },
  ];
  EXTRAS_ESTRUTURAIS.forEach(({ tipo, indexadas, construir }) => {
    elsDoTipo(PL, tipo).slice(indexadas).forEach((e) => colocar(e, construir));
  });

  // cancelas — sempre presentes (a etapa "check-in"/"saída" é controlada pela fase de simulação, não por módulo contratado)
  function colocarTransform(g: THREE.Object3D, e: PlantaElement | null) {
    if (!e) return;
    g.position.set(e.p[0], e.p[1], e.p[2]);
    g.rotation.set(e.r[0], e.r[1], e.r[2]);
    g.scale.set(e.s[0], e.s[1], e.s[2]);
  }
  function armarAnimGate(g: THREE.Object3D, e: PlantaElement | null) {
    g.userData.braco = g.getObjectByName("braco") || null;
    g.userData.gateCfg = {
      range: e?.gate?.range ?? 18,
      delayOpen: e?.gate?.delayOpen ?? 2,
      delayClose: e?.gate?.delayClose ?? 2,
    };
  }
  const gIn = pecaCancela({ dir: 1, len: 8, entry: true });
  colocarTransform(gIn, EL_CANCELA_IN); scene.add(gIn); armarAnimGate(gIn, EL_CANCELA_IN);
  const gOut = pecaCancela({ dir: 1, len: 8, entry: false });
  colocarTransform(gOut, EL_CANCELA_OUT); scene.add(gOut); armarAnimGate(gOut, EL_CANCELA_OUT);
  T.gateIn = gIn; T.gateOut = gOut;

  // demais peças da planta (paisagismo, bacias, pistas visuais, o caminhão customizado)
  const JA_TRATADOS = new Set([
    "portaria", "truck_center", "cancela", "totem", "balanca", "guarita",
    "vistoria", "cobertura", "navio", "ferrovia", "locomotiva", "vagao", "parque_tanques",
  ]);
  PL.elements.forEach((e) => {
    if (JA_TRATADOS.has(e.type)) return;
    let g: THREE.Object3D | null = null;
    if (e.type === "pista" && e.pista) g = pistaDoLayout(e.pista, e.color);
    else if (e.type === "bacia") g = pecaBacia();
    else if (e.type === "arvore") g = pecaVegetacao("plants/arvore", makeTree, e.seed);
    else if (e.type === "arbusto") g = pecaVegetacao("plants/arbusto", makeShrub, e.seed);
    else if (e.type === "arbusto_quadrado") g = buildLibInstance("plants/arbusto-quadrado");
    else if (e.type === "canteiro") g = buildLibInstance("plants/canteiro");
    else if (e.type === "vagas") g = pecaVagas();
    else if (e.type === "pavimento") g = makeApron();
    // A cerca deixou de vir do .glb congelado do editor (gradil de ripas
    // brancas) e passou a ser o alambrado nativo — ver builders/fence.ts.
    else if (e.type === "grade") g = makeFence();
    else if (e.type === "cabine_vistoria") g = makeInspectionBooth();
    else if (e.type === "poste_luz") g = makeLampPost();
    else if (e.type === "caminhao_fuel_estatico") g = pecaCaminhaoParado();
    else if (e.type === "caminhao_animado") {
      const frota = new THREE.Group();
      const rotas: RotaAnimadaEstado[] = [];
      const quantidade = Math.max(1, Math.floor(sel?.quantidadeCaminhoes ?? 1));
      for (let i = 0; i < quantidade; i++) {
        const caminhao = pecaCaminhaoAnimado(e.rota, sel?.modeloCaminhao, MODELOS_CAMINHAO[0].id);
        if (!caminhao) continue;
        const rotaAnimada = caminhao.userData.rotaAnimada as RotaAnimadaEstado;
        caminhao.visible = i === 0;
        rotaAnimada.ativo = i === 0;
        rotaAnimada.indiceFrota = i;
        frota.add(caminhao);
        rotas.push(rotaAnimada);
      }
      frota.userData.rotaAnimada = rotas[0];
      frota.userData.rotasAnimadas = rotas;
      g = frota;
    }
    else if (e.type.startsWith("lib_")) {
      const assetId = e.type.slice(4);
      g = buildLibInstance(assetId) || (assetId.startsWith("plants/") ? makeShrub() : null);
    } else if (e.type === "custom_m2")
      g = (PL.truckAsset && buildLibInstance(PL.truckAsset)) || buildCustomTruck();
    if (!g) return;
    const gg = g;
    if (e.type === "caminhao_animado") {
      const rotas = (gg.userData.rotasAnimadas || []) as RotaAnimadaEstado[];
      rotas.forEach((R) => {
        R.tractor.scale.set(e.s[0], e.s[1], e.s[2]);
        if (R.trailer) R.trailer.scale.set(e.s[0], e.s[1], e.s[2]);
      });
    } else {
      gg.position.set(e.p[0], e.p[1], e.p[2]);
      gg.rotation.set(e.r[0], e.r[1], e.r[2]);
      gg.scale.set(e.s[0], e.s[1], e.s[2]);
    }
    aplicarAparencia(gg, e);
    tirarSombra(gg, e.type);
    scene.add(gg);
    if (e.type === "caminhao_animado" && gg.userData.rotaAnimada) {
      T.rotaAnimada = gg.userData.rotaAnimada;
      T.rotasAnimadas = gg.userData.rotasAnimadas;
    }
  });

  // posições de área
  const [pox, poz] = pxz(EL_PORTARIA);
  const [vsx, vsz] = pxz(EL_VISTORIA_STAGE);

  // equipamento condicional (aparece só com o módulo contratado)
  if (mods.checkin && EL_TOTEM_IN) colocar(EL_TOTEM_IN, () => peca("objects/totem", () => makeTotem({ entry: true })));
  if (mods.checkout && EL_TOTEM_OUT) colocar(EL_TOTEM_OUT, () => trocarSinalizacao(
    peca("objects/totem", () => makeTotem({ entry: false })), M.ledGreen as THREE.Material & { color: THREE.Color }, M.ledRed));
  if (mods.acesso) {
    [EL_CANCELA_IN, EL_CANCELA_OUT].forEach((e) => {
      if (!e) return;
      const [x, z] = pxz(e);
      cyl(0.14, 0.18, 5, M.cabinetDark, x + 3, 2.5, z, T.equip, 8);
      box(1, 0.5, 0.6, M.cabinetDark, x + 2.4, 5, z, T.equip);
      box(0.3, 0.3, 0.1, M.ledRed, x + 1.9, 5, z, T.equip);
    });
  }
  if (mods.filas) {
    const [ttx, ttz] = PT_TELAO;
    cyl(0.2, 0.26, 7, M.cabinetDark, ttx, 3.5, ttz, T.equip, 8);
    const tela = box(7, 3.4, 0.4, M.screen, ttx, 8.2, ttz, T.equip); tela.rotation.y = Math.PI / 4;
  }
  if (mods.dashboard) {
    box(9, 4.2, 0.5, M.screen, pox + 10, 9.6, poz - 6, T.equip);
  }
  if (mods.vistoria) {
    const p = makePerson(0x27c07a); p.position.set(vsx + 4, 0, vsz - 4); T.equip.add(p);
  }
  scene.add(T.equip);

  // ---- modais ----
  if (EL_NAVIO) {
    const ship = colocar(EL_NAVIO, () => peca("vehicles/navio", makeShip)); T.ship = ship;
    const [nx, nz] = pxz(EL_NAVIO);
    cyl(1, 1, 10, M.steel, nx - 18, 5, nz, scene);
    const arm = cyl(0.8, 0.8, 20, M.steel, nx - 12, 9, nz, scene); arm.rotation.z = Math.PI / 2.6;
  }
  colocar(EL_FERROVIA, () => peca("structures/ferrovia", makeRail));
  colocar(EL_LOCOMOTIVA, () => peca("vehicles/locomotiva", makeLoco));
  EL_VAGOES.forEach((e) => colocar(e, () => peca("vehicles/vagao", makeTankCar)));
  if (modais.duto) {
    const [tx, tz] = pxz(EL_TANQUES);
    const px0 = tx + 70, pz0 = tz + 20;
    for (let i = 0; i < 3; i++) { const p = cyl(1, 1, 60, M.pipeRed, px0, 1.6, pz0 - i * 2.6, scene); p.rotation.z = Math.PI / 2; }
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff5540 }));
      s.position.set(px0 + 30 - (i / 6) * 60, 1.6, pz0 - (i % 3) * 2.6);
      scene.add(s); T.pulses.push(s);
    }
  }

  // funcionário "chamador" (só anima no lado manual — fase de simulação)
  const [tcx, tcz] = pxz(EL_TRUCKCENTER);
  T.person = makePerson(0xf5a623);
  T.person.position.set(tcx + 8, 0, tcz - 4); T.person.visible = false; scene.add(T.person);
  return T;
}

export { pecaCaminhao, derivePlantaRefs };
