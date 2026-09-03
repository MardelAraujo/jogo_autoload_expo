import * as THREE from "three";
import { M } from "../builders/core/materials";
import { box } from "../builders/builders/primitives";
import { disposeSceneContents } from "../renderer";
import {
  aplicarTemaDaPlanta,
  aplicarTexturasReais,
  texturaDoMar,
  COR_DA_AGUA,
  GROUND_LEFT_X,
  GROUND_RIGHT_X,
  GROUND_W,
  type PlantaElement,
  type PlantaLayout,
} from "../scene";
import { pecaDoElemento, transformNoTracado } from "./fabrica";

/**
 * A cena do editor: o mesmo terreno, luz e peças do jogo, mas com um objeto
 * por elemento da planta, indexado igual ao array `PL.elements` — é esse
 * pareamento 1:1 que torna possível clicar numa peça e saber qual linha do
 * JSON ela é.
 *
 * Por que não reaproveitar `buildTerminal()`: ele monta a cena para ser
 * *olhada*, não editada. Junta várias peças no mesmo grupo (`T.equip`), coloca
 * equipamento que não existe na planta (o funcionário, o telão), pula
 * elementos por regra de módulo contratado e não deixa nenhum rastro de qual
 * elemento gerou qual objeto. A geometria, porém, é rigorosamente a mesma: a
 * fábrica chama os mesmos builders (ver fabrica.ts).
 */

export interface CenaEditor {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  /** Uma peça por elemento, no mesmo índice de PL.elements. */
  pecas: (THREE.Object3D | null)[];
  contorno: THREE.BoxHelper | null;
  grade: THREE.GridHelper;
  alcas: THREE.Group;
  PL: PlantaLayout;
}

export const editorRef: { current: CenaEditor | null } = { current: null };

// ---------------- câmera do editor ----------------
// Independente da `camState` do jogo: aqui a câmera também precisa passear
// pelo plano (a planta tem ~580 unidades de largura e o enquadramento do jogo
// mostra uma fração dela) e afastar muito mais do que o jogo permite.
export const camEditor = {
  azim: 5.08,
  elev: 0.72,
  view: 170,
  alvo: new THREE.Vector3(-20, 0, 60),
};

const VIEW_MIN = 12;
const VIEW_MAX = 460;
const ELEV_MIN = 0.08;
const ELEV_MAX = 1.5;

export function limitarView(v: number): number {
  return Math.min(VIEW_MAX, Math.max(VIEW_MIN, v));
}
export function limitarElev(e: number): number {
  return Math.min(ELEV_MAX, Math.max(ELEV_MIN, e));
}

export function aplicarCameraEditor(cam: THREE.OrthographicCamera, aspect: number): void {
  const { azim, elev, view, alvo } = camEditor;
  cam.left = -view * aspect;
  cam.right = view * aspect;
  cam.top = view;
  cam.bottom = -view;
  const r = 620;
  cam.position.set(
    alvo.x + r * Math.cos(elev) * Math.sin(azim),
    alvo.y + r * Math.sin(elev),
    alvo.z + r * Math.cos(elev) * Math.cos(azim),
  );
  cam.lookAt(alvo);
  cam.updateProjectionMatrix();
}

/** Enquadramento inicial — a planta inteira, de cima e um pouco de lado. */
export function enquadrarTudo(): void {
  camEditor.azim = 5.08;
  camEditor.elev = 0.72;
  camEditor.view = 170;
  camEditor.alvo.set(-20, 0, 60);
}

/**
 * Aproxima de uma peça sem mudar o ângulo — o que o clique na lista lateral faz.
 *
 * Quem tem traçado é enquadrado pelo traçado, não pelo objeto. A peça de um
 * `caminhao_animado` é do tamanho de um caminhão, mas o que se edita ali é uma
 * curva que atravessa o terminal inteiro: enquadrar pelo objeto deixaria as
 * quinze alças fora da tela, com o zoom colado no para-choque.
 */
export function enquadrarElemento(i: number): void {
  const ed = editorRef.current;
  const g = ed?.pecas[i];
  if (!ed || !g) return;
  const e = ed.PL.elements[i];
  const bb = new THREE.Box3();
  const pts = pontosDoTracado(e);
  if (pts && pts.length) {
    g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    pts.forEach(([x, z]) => bb.expandByPoint(v.set(x, 0, z).applyMatrix4(g.matrixWorld)));
  } else {
    bb.setFromObject(g);
  }
  if (bb.isEmpty()) return;
  bb.getCenter(camEditor.alvo);
  camEditor.alvo.y = 0;
  const tam = bb.getSize(new THREE.Vector3());
  camEditor.view = limitarView(Math.max(tam.x, tam.z, 12) * 0.75 + 20);
}

/**
 * O que `tick.ts` chama quando `modo === "editor"` (via `editorTickRef`).
 * Tela cheia, sem scissor: aqui não há visor de maquete recortado.
 */
export function renderizarEditor(renderer: THREE.WebGLRenderer): void {
  const ed = editorRef.current;
  if (!ed) return;
  const canvas = renderer.domElement;
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  aplicarCameraEditor(ed.camera, W / H);
  renderer.render(ed.scene, ed.camera);
}

// ---------------- montagem ----------------

const COR_CEU = 0xd6d6da;

function montarPano(scene: THREE.Scene, PL: PlantaLayout): void {
  scene.background = new THREE.Color(COR_CEU);
  const amb = PL.environment;
  scene.fog = !amb || amb.fogOn !== false ? new THREE.Fog(COR_CEU, 420, 1400) : null;

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  scene.add(new THREE.HemisphereLight(0xe8ecf5, 0x9a9aa0, 0.35));
  const sol = new THREE.DirectionalLight(0xfff4e0, 0.85);
  sol.position.set(-140, 200, -90);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  const S = 320;
  sol.shadow.camera.left = -S;
  sol.shadow.camera.right = S;
  sol.shadow.camera.top = S;
  sol.shadow.camera.bottom = -S;
  sol.shadow.camera.near = 10;
  sol.shadow.camera.far = 900;
  sol.shadow.bias = -0.0006;
  scene.add(sol);

  // terreno, mar e cais — as mesmas medidas de buildTerminal (o jogo usa
  // constantes de módulo, não PL.terrain; ver a nota do painel Cenário)
  const chao = new THREE.Mesh(new THREE.BoxGeometry(GROUND_W, 4, 900), M.ground);
  chao.position.set((GROUND_LEFT_X + GROUND_RIGHT_X) / 2, -2, 20);
  chao.receiveShadow = true;
  scene.add(chao);
  const mar = new THREE.Mesh(new THREE.BoxGeometry(140, 3.4, 900), M.water);
  mar.position.set(240, -2.2, 20);
  mar.receiveShadow = true;
  scene.add(mar);
  box(4, 4.6, 900, M.concrete, 172, -1.7, 20, scene);
}

/** Repinta tema e texturas a partir do rascunho — a paleta `M` é compartilhada, então isto vale para a cena inteira sem remontar nada. */
export function aplicarAparencia(PL: PlantaLayout): void {
  aplicarTemaDaPlanta(PL.theme);
  aplicarTexturasReais(PL);
  (M.water as THREE.MeshLambertMaterial).map = texturaDoMar();
  (M.water as THREE.MeshLambertMaterial).color.set(COR_DA_AGUA);
  (M.water as THREE.MeshLambertMaterial).needsUpdate = true;
}

/** Índice de um elemento entre os do mesmo tipo. */
function ordinal(PL: PlantaLayout, idx: number): number {
  const tipo = PL.elements[idx].type;
  let n = 0;
  for (let i = 0; i < idx; i++) if (PL.elements[i].type === tipo) n++;
  return n;
}

export function montarCenaEditor(PL: PlantaLayout): CenaEditor {
  descartarCenaEditor();

  const scene = new THREE.Scene();
  aplicarAparencia(PL);
  montarPano(scene, PL);

  const grade = new THREE.GridHelper(1000, 50, 0x9aa4b2, 0x6d7683);
  grade.position.y = 0.08;
  (grade.material as THREE.Material).transparent = true;
  (grade.material as THREE.Material).opacity = 0.35;
  scene.add(grade);

  const alcas = new THREE.Group();
  alcas.renderOrder = 999;
  scene.add(alcas);

  const pecas: (THREE.Object3D | null)[] = PL.elements.map((e, i) => {
    const g = pecaDoElemento(e, { PL, ordinal: ordinal(PL, i) });
    g.userData.elIdx = i;
    marcarRaiz(g, i);
    scene.add(g);
    return g;
  });

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2400);
  const cena: CenaEditor = { scene, camera, pecas, contorno: null, grade, alcas, PL };
  editorRef.current = cena;
  return cena;
}

/** Todo mesh aponta para a raiz do seu elemento — o raycast acerta um filho qualquer e precisa subir. */
function marcarRaiz(g: THREE.Object3D, i: number): void {
  g.traverse((o) => {
    o.userData.raizIdx = i;
  });
}

export function descartarCenaEditor(): void {
  const ed = editorRef.current;
  if (!ed) return;
  limparAlcas();
  disposeSceneContents(ed.scene);
  editorRef.current = null;
}

// ---------------- edição de um elemento ----------------

/** Refaz a peça de um elemento (mudou cor, traçado, tipo…) mantendo o índice. */
export function refazerPeca(i: number): void {
  const ed = editorRef.current;
  if (!ed) return;
  const antiga = ed.pecas[i];
  if (antiga) {
    ed.scene.remove(antiga);
    disposeUm(antiga);
  }
  const e = ed.PL.elements[i];
  if (!e) {
    ed.pecas[i] = null;
    return;
  }
  const g = pecaDoElemento(e, { PL: ed.PL, ordinal: ordinal(ed.PL, i) });
  g.userData.elIdx = i;
  marcarRaiz(g, i);
  ed.scene.add(g);
  ed.pecas[i] = g;
  if (ed.contorno && ed.contorno.userData.elIdx === i) selecionarPeca(i);
}

/** Descarta geometria de uma peça só (mesma regra de disposeSceneContents: nada do acervo). */
function disposeUm(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o.userData?.doAcervo) return;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/** Copia posição/rotação/escala do elemento para a peça — o caminho rápido do arrasto e dos campos numéricos. */
export function aplicarTransform(i: number): void {
  const ed = editorRef.current;
  const g = ed?.pecas[i];
  const e = ed?.PL.elements[i];
  if (!ed || !g || !e) return;
  if (transformNoTracado(e.type)) {
    const R = g.userData.rotaAnimada as { tractor?: THREE.Object3D; trailer?: THREE.Object3D } | undefined;
    R?.tractor?.scale.set(e.s[0], e.s[1], e.s[2]);
    R?.trailer?.scale.set(e.s[0], e.s[1], e.s[2]);
  } else {
    g.position.set(e.p[0], e.p[1], e.p[2]);
    g.rotation.set(e.r[0], e.r[1], e.r[2]);
    g.scale.set(e.s[0], e.s[1], e.s[2]);
  }
  ed.contorno?.update();
}

/** Remonta a cena inteira depois de uma mudança estrutural (adicionar, apagar, importar). */
export function remontar(PL: PlantaLayout): void {
  const anterior = editorRef.current;
  const azimAnterior = anterior ? { ...camEditor } : null;
  montarCenaEditor(PL);
  if (azimAnterior) {
    camEditor.azim = azimAnterior.azim;
    camEditor.elev = azimAnterior.elev;
    camEditor.view = azimAnterior.view;
    camEditor.alvo.copy(azimAnterior.alvo);
  }
}

// ---------------- seleção ----------------

export function selecionarPeca(i: number | null): void {
  const ed = editorRef.current;
  if (!ed) return;
  if (ed.contorno) {
    ed.scene.remove(ed.contorno);
    ed.contorno.geometry.dispose();
    ed.contorno = null;
  }
  const g = i == null ? null : ed.pecas[i];
  if (!g) return;
  const c = new THREE.BoxHelper(g, 0xfa094e);
  c.userData.elIdx = i;
  (c.material as THREE.LineBasicMaterial).depthTest = false;
  c.renderOrder = 998;
  ed.scene.add(c);
  ed.contorno = c;
}

export function atualizarContorno(): void {
  editorRef.current?.contorno?.update();
}

// ---------------- alças do traçado (pista e rota) ----------------

const GEO_ALCA = new THREE.SphereGeometry(2.6, 14, 10);
const MAT_ALCA = new THREE.MeshBasicMaterial({ color: 0xfa094e, depthTest: false });
const MAT_ALCA_PONTA = new THREE.MeshBasicMaterial({ color: 0x27c07a, depthTest: false });
const MAT_ALCA_SEL = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
const MAT_ALCA_ESPERA = new THREE.MeshBasicMaterial({ color: 0xf3a712, depthTest: false });

/** Pontos do traçado de um elemento — `pista.points` ou `rota.points`, o que existir. */
export function pontosDoTracado(e: PlantaElement | null | undefined): number[][] | null {
  if (!e) return null;
  if (e.type === "pista") return e.pista?.points ?? null;
  if (e.rota) return e.rota.points ?? null;
  return null;
}

export function fechadoNoTracado(e: PlantaElement): boolean {
  return e.type === "pista" ? !!e.pista?.closed : !!e.rota?.closed;
}

export function limparAlcas(): void {
  const ed = editorRef.current;
  if (!ed) return;
  ed.alcas.children.slice().forEach((h) => {
    ed.alcas.remove(h);
  });
  // a geometria das alças é compartilhada (GEO_ALCA) — nada a dispor aqui
}

/**
 * Desenha uma alça por ponto de controle do traçado do elemento selecionado.
 *
 * As alças ficam num grupo próprio da cena (e não dentro da peça) porque a
 * peça de uma pista carrega escala não uniforme — `s = [1.05, 2, 1]` na planta
 * de hoje — e uma esfera dentro dela sairia achatada. O grupo copia a matriz
 * da peça, então as alças pousam exatamente sobre a curva e continuam
 * redondas.
 */
export function atualizarAlcas(i: number | null, pontoSel: number | null): void {
  const ed = editorRef.current;
  if (!ed) return;
  limparAlcas();
  if (i == null) return;
  const e = ed.PL.elements[i];
  const pts = pontosDoTracado(e);
  const peca = ed.pecas[i];
  if (!pts || !peca) return;

  const aberto = !fechadoNoTracado(e);
  const esperas = e.rota?.waits;
  peca.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  pts.forEach((pt, k) => {
    const ponta = aberto && (k === 0 || k === pts.length - 1);
    const espera = !!(esperas && esperas[k] > 0);
    const mat = k === pontoSel ? MAT_ALCA_SEL : ponta ? MAT_ALCA_PONTA : espera ? MAT_ALCA_ESPERA : MAT_ALCA;
    const h = new THREE.Mesh(GEO_ALCA, mat);
    v.set(pt[0], 0, pt[1]).applyMatrix4(peca.matrixWorld);
    h.position.set(v.x, v.y + 2.2, v.z);
    h.renderOrder = 999;
    h.userData.alca = true;
    h.userData.ponto = k;
    h.userData.elIdx = i;
    ed.alcas.add(h);
  });
}

/** Converte um ponto do mundo (o raio do mouse no plano y=0) para o espaço local do traçado. */
export function mundoParaTracado(i: number, mundo: THREE.Vector3): [number, number] | null {
  const ed = editorRef.current;
  const peca = ed?.pecas[i];
  if (!ed || !peca) return null;
  peca.updateMatrixWorld(true);
  const local = peca.worldToLocal(mundo.clone());
  return [local.x, local.z];
}
