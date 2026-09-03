import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";
import { pipeRun, elbow, valve } from "./pipes";
import { makeTank, geometriaLogo, TANQUE_R, TANQUE_Y_LOGO } from "./tank";
import { CAM_AZIM_PADRAO } from "../../camera";

/**
 * Parque de tanques — o "pack" de ambiente: dique de contenção com meio-fio
 * zebrado, 8 tanques em malha alternada, interligamento vermelho (header +
 * ramais com válvulas) e iluminação de perímetro.
 *
 * O rack de dutos lateral e a arborização de perímetro ficaram DE FORA de
 * propósito — são montados depois, por cima, com os tipos soltos da paleta
 * (Dutos, Árvore, Arbusto). Assim o pack entrega só a base do parque e a
 * composição final do entorno fica a cargo de quem edita.
 *
 * É um elemento único de propósito: serve pra compor o parque de uma vez, com
 * as peças já casadas entre si (os ramais nascem exatamente no costado de cada
 * tanque, o header cai na altura certa).
 *
 * Geometria do arranjo, tudo derivado destas constantes:
 *
 *        x →
 *   z    ┌──────── dique (PAD_W × PAD_D) ────────┐
 *   ↓    │   ○     ○     ○     ○   ← fila fundo  │
 *        │   ○     ○     ○     ○   ← fila frente │
 *        │  ══════ header + ramais ══════        │
 *        └───────────────────────────────────────┘
 *
 * As duas filas ficam alinhadas coluna a coluna (grade regular). Como o
 * tanque da frente fica exatamente na frente do de trás, o ramal do fundo
 * não desce reto até o coletor: ele faz um desvio em L pelo corredor entre
 * duas colunas (COL_STEP/2 de largura livre) e só então desce. Ver
 * `addTankBranch`.
 */

const R = 9.5;                     // raio do tanque (igual ao de builders/tank.js)
const ROW_BACK = -14;
const ROW_FRONT = 14;
const COL_STEP = 24;               // > 2R: sobra corredor livre entre colunas
const COLS = [-36, -12, 12, 36];

const PAD_W = 126;
const PAD_D = 84;
const PAD_Z = 8;                   // dique deslocado pra frente: sobra espaço pro header
const CURB_SEG = 21;               // segmento de meio-fio (divide os dois lados exatos)

const HEADER_Z = 30;               // linha do coletor, à frente da fila da frente
const HEADER_Y = [2.3, 3.7];

/** Meio-fio zebrado em volta do dique, em segmentos de tamanho fixo (a textura é compartilhada). */
function addCurb(g: THREE.Object3D) {
  const x0 = -PAD_W / 2;
  const z0 = PAD_Z - PAD_D / 2;
  const nx = Math.round(PAD_W / CURB_SEG);
  const nz = Math.round(PAD_D / CURB_SEG);

  for (let i = 0; i < nx; i++) {
    const x = x0 + CURB_SEG * (i + 0.5);
    [z0, z0 + PAD_D].forEach((z) => box(CURB_SEG, 0.8, 1.6, M.hazard, x, 0.5, z, g));
  }
  for (let i = 0; i < nz; i++) {
    const z = z0 + CURB_SEG * (i + 0.5);
    [x0, x0 + PAD_W].forEach((x) => box(1.6, 0.8, CURB_SEG, M.hazard, x, 0.5, z, g));
  }
}

/** Sobe do nível do ramal até o costado do tanque: vertical + entrada no casco. */
function addRiser(g: THREE.Object3D, tx: number, tz: number, zStart: number, y: number, r: number) {
  const top = 6.4;
  cyl(r, r, top - y, M.pipeRed, tx, (y + top) / 2, zStart, g, 14);
  pipeRun(zStart - (tz + R) + 0.6, r, M.pipeRed, tx, top, (tz + R - 0.6 + zStart) / 2, 'z', g, false);
  cyl(r * 1.5, r * 1.5, 0.5, M.pipeFlange, tx, top, tz + R - 0.3, g, 14).rotation.x = Math.PI / 2;
}

/** Pé de apoio do ramal, repetido ao longo de um trecho reto. */
function addPipeSupports(g: THREE.Object3D, x: number, z0: number, z1: number, y: number, n: number) {
  instanced(new THREE.BoxGeometry(0.3, y, 0.3), M.steel, n, (i, m) => {
    m.makeTranslation(x, y / 2, z0 + ((z1 - z0) * (i + 0.5)) / n);
  }, g);
}

/**
 * Ramal de um tanque até o coletor.
 *
 * Fila da frente: desce reto em z, nada no caminho.
 * Fila do fundo: o tanque da frente está exatamente na mesma coluna, então
 * o ramal sai, corre em x até o corredor entre colunas (`lane`) e só lá
 * desce até o coletor — o desvio em L que aparece na planta real.
 */
function addTankBranch(g: THREE.Object3D, tx: number, tz: number, lane?: number) {
  const r = 0.5;
  const y = HEADER_Y[0];
  const zStart = tz + R + 1.4;

  addRiser(g, tx, tz, zStart, y, r);

  if (lane === undefined) {
    const len = HEADER_Z - zStart;
    pipeRun(len, r, M.pipeRed, tx, y, zStart + len / 2, 'z', g);
    valve(r, M.valveBody, tx, y, zStart + len * 0.45, 'z', g);
    addPipeSupports(g, tx, zStart, HEADER_Z, y, 2);
    return;
  }

  // trecho curto em z antes do desvio, ainda antes do tanque da frente
  const zJog = ROW_FRONT - R - 3.2;
  pipeRun(zJog - zStart, r, M.pipeRed, tx, y, (zStart + zJog) / 2, 'z', g);

  // desvio em x até o corredor
  const dir = Math.sign(lane - tx);
  elbow(1.1, r, M.pipeRed, tx + dir * 1.1, y, zJog, dir > 0 ? Math.PI / 2 : 0, g);
  const runX = Math.abs(lane - tx) - 2.2;
  pipeRun(runX, r, M.pipeRed, (tx + dir * 1.1 + lane - dir * 1.1) / 2, y, zJog + 1.1, 'x', g, false);
  elbow(1.1, r, M.pipeRed, lane - dir * 1.1, y, zJog, dir > 0 ? Math.PI : -Math.PI / 2, g);

  // descida pelo corredor até o coletor
  const len = HEADER_Z - (zJog + 1.1);
  pipeRun(len, r, M.pipeRed, lane, y, zJog + 1.1 + len / 2, 'z', g);
  valve(r, M.valveBody, lane, y, zJog + 1.1 + len * 0.5, 'z', g);
  addPipeSupports(g, lane, zJog + 1.1, HEADER_Z, y, 2);
}

/**
 * Interligação entre tanques vizinhos da mesma fila: duto rasteiro de costado
 * a costado, com válvula de bloqueio no meio. É o que faz o parque ler como
 * um conjunto interligado e não como oito tanques soltos lado a lado —
 * transferência entre tanques sem passar pelo coletor.
 */
function addCrossTies(g: THREE.Object3D, z: number) {
  const r = 0.42;
  const y = 1.6;
  for (let i = 0; i < COLS.length - 1; i++) {
    const a = COLS[i] + R;
    const b = COLS[i + 1] - R;
    const mid = (a + b) / 2;
    pipeRun(b - a, r, M.pipeRed, mid, y, z, 'x', g);
    valve(r, M.valveBody, mid, y, z, 'x', g);
    box(0.28, y, 0.28, M.steel, mid, y / 2, z, g);
  }
}

/** Coletor (header): bancada de dutos em dois níveis correndo em x, com jumpers e suportes. */
function addHeader(g: THREE.Object3D) {
  const half = 58;
  HEADER_Y.forEach((y, lvl) => {
    const rs = lvl === 0 ? [0.55, 0.44] : [0.44, 0.36];
    rs.forEach((r, i) => {
      const z = HEADER_Z + (lvl === 0 ? i * 1.5 : i * 1.3 - 0.4);
      pipeRun(half * 2, r, M.pipeRed, 0, y, z, 'x', g, false);
    });
  });

  // cavaletes do coletor
  for (let i = 0; i <= 8; i++) {
    const x = -half + (i * half * 2) / 8;
    [0, 1].forEach((lvl) => box(3.4, 0.3, 0.3, M.steel, x, HEADER_Y[lvl] - 0.85, HEADER_Z + 0.7, g));
    cyl(0.24, 0.28, HEADER_Y[1] - 0.7, M.steel, x, (HEADER_Y[1] - 0.7) / 2, HEADER_Z + 0.7, g, 8);
  }

  // jumpers entre os dois níveis
  [-38, 2, 40].forEach((x) => {
    cyl(0.36, 0.36, HEADER_Y[1] - HEADER_Y[0], M.pipeRed, x, (HEADER_Y[0] + HEADER_Y[1]) / 2, HEADER_Z + 1.1, g, 12);
    valve(0.36, M.valveBody, x, HEADER_Y[1] + 0.6, HEADER_Z + 1.1, 'x', g);
  });
}

/** Poste de iluminação: haste, braço curvado e luminária. */
function addLamp(g: THREE.Object3D, x: number, z: number, flip: boolean) {
  const h = 11;
  const s = flip ? -1 : 1;
  cyl(0.22, 0.32, h, M.steel, x, h / 2, z, g, 8);
  box(1.0, 0.3, 1.0, M.concrete, x, 0.15, z, g);
  const arm = box(3.2, 0.22, 0.22, M.steel, x + s * 1.6, h - 0.3, z, g);
  arm.rotation.z = s * 0.12;
  box(1.5, 0.28, 0.7, M.white, x + s * 3.0, h - 0.62, z, g);
}

/** Um poste de iluminação avulso (o mesmo do perímetro do parque), sem os tanques. */
function makeLampPost() {
  const g = new THREE.Group();
  addLamp(g, 0, 0, false);
  return g;
}

function makeTankFarm() {
  const g = new THREE.Group();

  // --- dique de contenção ---
  box(PAD_W, 0.35, PAD_D, M.pad, 0, 0.17, PAD_Z, g);
  addCurb(g);

  // --- tanques: grade alinhada, 4 colunas × 2 filas ---
  let i = 0;
  [ROW_BACK, ROW_FRONT].forEach((z) => {
    COLS.forEach((x) => {
      const t = makeTank((i++) * 1.15);
      t.position.set(x, 0.35, z);
      g.add(t);
    });
  });

  // --- interligamento ---
  addHeader(g);
  // fila da frente desce reto; a do fundo desvia pro corredor à direita da
  // própria coluna (a última usa o espaço aberto além do bloco de tanques)
  COLS.forEach((x) => addTankBranch(g, x, ROW_FRONT));
  COLS.forEach((x) => addTankBranch(g, x, ROW_BACK, x + COL_STEP / 2));
  // travessas de tanque a tanque, um pouco fora do costado pra não colidir
  // com a escada helicoidal que dá a volta em cada tanque
  addCrossTies(g, ROW_BACK - 3.5);
  addCrossTies(g, ROW_FRONT + 3.5);

  // --- iluminação de perímetro ---
  [[-PAD_W / 2 - 5, PAD_Z - 26], [-PAD_W / 2 - 5, PAD_Z + 22], [PAD_W / 2 + 5, PAD_Z - 26], [PAD_W / 2 + 5, PAD_Z + 22]]
    .forEach(([x, z], k) => addLamp(g, x, z, k < 2));

  // Rack de dutos lateral e arborização de perímetro: montados depois, por cima,
  // com os tipos soltos da paleta (Dutos, Árvore, Arbusto).

  return g;
}

/**
 * Aplica a marca AutoLoad no costado de todos os tanques de um parque.
 *
 * Fica FORA de `makeTank` de propósito. O que o jogo desenha quase nunca é o
 * builder daqui: `peca("structures/parque-tanques", makeTankFarm)` prefere o
 * .glb congelado do editor externo (ver public/models/manifest.json), e nesse
 * caminho makeTank sequer é chamado — o logo simplesmente não apareceria. Como
 * o .glb é uma exportação DESTE mesmo builder, a malha dos tanques está nas
 * posições que as constantes acima descrevem, então dá pra pendurar os
 * decalques por cima da instância, venha ela de onde vier.
 *
 * DUAS faces por tanque, opostas, viradas para a câmera padrão — não quatro.
 * Quatro era o arranjo da marca anterior, que era um símbolo compacto; o
 * logotipo da AutoLoad é largo (77° de costado cada), e quatro deles cobriam
 * 308° dos 360° do tanque: sobrava um anel de logotipos emendados, com dois ou
 * três pedaços deformados aparecendo ao mesmo tempo. Com duas faces sobra
 * costado limpo entre elas, e é assim que tanque de verdade é pintado — uma
 * marca virada para quem olha.
 *
 * O ângulo base é o próprio `CAM_AZIM_PADRAO`: a normal de um decalque em θ é
 * (sen θ, cos θ), e a direção da câmera em relação ao alvo é (sen azim,
 * cos azim) — mesma fórmula, então o decalque encara a câmera quando θ = azim.
 * Os dois parques da planta estão com rotação Y zero, então o ângulo local
 * vale direto, sem correção.
 *
 * Sobre o desvio, ver DESVIO_DA_VIZINHA.
 */
/**
 * Quanto o decalque gira além de encarar a câmera.
 *
 * Encarando a câmera em cheio (desvio 0) só o tanque da ponta mostra a marca
 * inteira: os outros ficam com a metade esquerda escondida pelo vizinho da
 * frente, e sobra "oload" em quase todo o parque. As colunas estão a 24 m de
 * eixo para tanques de 19 m — quem olha da câmera padrão vê só uma nesga do
 * costado de cada um, sempre do mesmo lado.
 *
 * Girar a marca para dentro dessa nesga resolve o parque inteiro de uma vez,
 * porque a malha é regular e todos os tanques são ocultados igual. 0,3 rad foi
 * escolhido comparando renderizações: com 0,45 quase todos mostram a palavra,
 * mas o tanque desimpedido da frente já fica com a marca torta; com 0,3 o da
 * frente continua centrado e os de trás mostram "autoload" quase inteiro.
 */
const DESVIO_DA_VIZINHA = 0.3;

function marcarTanques(parque: THREE.Object3D) {
  const angulos = [CAM_AZIM_PADRAO + DESVIO_DA_VIZINHA, CAM_AZIM_PADRAO + DESVIO_DA_VIZINHA + Math.PI];
  const tanques: [number, number][] = [];
  [ROW_BACK, ROW_FRONT].forEach((z) => COLS.forEach((x) => tanques.push([x, z])));

  const giro = new THREE.Matrix4();
  const im = instanced(geometriaLogo(TANQUE_R), M.tankLogo, tanques.length * angulos.length, (i, m) => {
    const [x, z] = tanques[Math.floor(i / angulos.length)];
    giro.makeRotationY(angulos[i % angulos.length]);
    m.copy(giro);
    m.setPosition(x, TANQUE_Y_LOGO + 0.35, z);
  });
  im.name = "marca-autoload";
  im.castShadow = false;
  im.receiveShadow = false;
  parque.add(im);
  return parque;
}

export { makeTankFarm, makeLampPost, marcarTanques };
