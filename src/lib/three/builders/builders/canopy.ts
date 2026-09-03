import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Plataforma de carga e descarga rodoviária — cobertura de telha metálica em
 * duas águas sobre pórticos treliçados, com dois mezaninos de operação no meio
 * e braços de carregamento (top loading) sobre as quatro faixas de caminhão.
 *
 * Geometria pensada pra leitura de cima e de lado (que é como a planta é vista
 * no editor), não pra close: a onda da telha é textura e não relevo, os perfis
 * são caixas simples e os braços são cilindros articulados em ângulo reto. O
 * que precisa ficar óbvio à distância é a silhueta — telhado em duas águas,
 * colunas nas bordas, mezaninos amarelos no meio e os braços por cima dos
 * caminhões.
 *
 * Eixos: os caminhões entram no sentido Z (comprimento em Z, como o modelo de
 * builders/truck.js), estacionados lado a lado em quatro faixas ao longo de X.
 * Cada mezanino corre em Z entre duas faixas e atende as duas, com braços pros
 * dois lados — é assim que rack de carregamento real é montado, e é o que
 * mantém o vão entre colunas livre pra manobra.
 */

const HALF_W = 21;            // meia largura do telhado (X)
const EAVE_Z = 15;            // beiral (Z) — o pano de telha vai da cumeeira até aqui
const RIDGE_Y = 14.6;         // altura da cumeeira
const EAVE_Y = 12.8;          // altura do beiral
// Quatro pórticos, não cinco: o eixo central saiu porque a coluna dele caía
// dentro da faixa por onde o caminhão atravessa a plataforma. Ver addColumns.
const COL_X = [-19, -9, 9, 19];
const COL_Z = 13.5;           // eixo das duas fileiras de colunas
const COL_TOP = 11.8;         // topo das colunas / banzo inferior da treliça
const DECK_Y = 6.2;           // piso do mezanino — na altura do domo do caminhão
const DECK_HALF_LEN = 12;     // meio comprimento do mezanino (em Z)
const PLATFORM_X = [-9, 9];   // eixo dos dois mezaninos
const LANE_OFFSET = 4.5;      // distância do mezanino até o eixo da faixa que ele atende
const RISER_OFFSET = 1.9;     // prumada de produto, logo fora do guarda-corpo
const ARM_Z = [-3.5, 3.5];    // dois braços por faixa (o tanque tem mais de um compartimento)
const BOOM_Y = 9.6;           // altura da lança

/**
 * Barra reta entre dois pontos quaisquer — usada em diagonal de treliça,
 * longarina de escada e tirante. Vale a pena existir porque montar diagonal
 * com rotação na mão erra o comprimento toda vez que uma cota muda; aqui a
 * barra sempre encosta exatamente nos dois nós informados.
 */
function strut(a: [number, number, number], b: [number, number, number], w: number, mat: THREE.Material, g: THREE.Object3D) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, va.distanceTo(vb)), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.lookAt(vb); // BoxGeometry tem a profundidade em Z, então o +Z aponta pro destino
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Altura da face inferior do telhado num dado z (a treliça acompanha o caimento). */
function roofUnderY(z: number) {
  return RIDGE_Y - 0.5 - (Math.abs(z) / EAVE_Z) * (RIDGE_Y - EAVE_Y);
}

/**
 * As dez colunas (2 fileiras × 5) como dois InstancedMesh — peça idêntica
 * repetida. A altura da coluna já vem embutida na geometria (translate) em vez
 * de sair da matriz de instância: Box3.setFromObject não enxerga matriz de
 * instância nesta versão do three, então uma peça alta centrada na origem
 * estouraria a caixa envolvente do grupo (e com ela o enquadramento de
 * miniatura e o realce de seleção) meio prédio abaixo do chão.
 */
function addColumns(g: THREE.Object3D) {
  const spots: [number, number][] = [];
  COL_X.forEach((x) => [-COL_Z, COL_Z].forEach((z) => {
    // Nada de coluna onde a escada desce. As escadas saem da ponta +Z dos dois
    // mezaninos (addStairs) e correm de z=12 a z=18,5 no MESMO eixo x deles —
    // a coluna do pórtico ficava exatamente no meio do lance, atravessando os
    // degraus. O pé de +Z desses dois pórticos morre aqui; quem pega a ponta
    // da treliça é a viga transversal de COL_TOP+0,6, que corre a largura
    // inteira e se apoia nas colunas de canto (x = ±19).
    if (z > 0 && PLATFORM_X.includes(x)) return;
    spots.push([x, z]);
  }));
  instanced(
    new THREE.BoxGeometry(0.75, COL_TOP, 0.75).translate(0, COL_TOP / 2, 0),
    M.beam,
    spots.length,
    (i, m) => m.makeTranslation(spots[i][0], 0, spots[i][1]),
    g,
  );
  instanced(
    new THREE.BoxGeometry(1.7, 0.3, 1.7),
    M.concrete,
    spots.length,
    (i, m) => m.makeTranslation(spots[i][0], 0.35, spots[i][1]),
    g,
  );
}

/**
 * Pórtico transversal treliçado sobre um par de colunas: banzo inferior reto,
 * banzo superior acompanhando as duas águas e diagonais em zigue-zague.
 */
function addTruss(g: THREE.Object3D, x: number) {
  const nodes = [-COL_Z, -6.5, 0, 6.5, COL_Z];
  box(0.45, 0.45, COL_Z * 2 + 0.8, M.beam, x, COL_TOP, 0, g);
  strut([x, roofUnderY(-COL_Z), -COL_Z], [x, roofUnderY(0), 0], 0.4, M.beam, g);
  strut([x, roofUnderY(0), 0], [x, roofUnderY(COL_Z), COL_Z], 0.4, M.beam, g);
  for (let i = 0; i < nodes.length - 1; i++) {
    const z0 = nodes[i];
    const z1 = nodes[i + 1];
    // diagonais alternando de lado, como treliça Warren
    const up = i % 2 === 0;
    strut(
      [x, up ? COL_TOP : roofUnderY(z0), z0],
      [x, up ? roofUnderY(z1) : COL_TOP, z1],
      0.28, M.beam, g,
    );
  }
}

/**
 * Um pano de telha (meia água) montado deitado e depois inclinado inteiro:
 * telha, terças e testeira giram juntas, então nenhuma peça descola do plano
 * do telhado quando o caimento muda.
 */
function addRoofSlope(g: THREE.Object3D, side: number) {
  const rise = RIDGE_Y - EAVE_Y;
  const len = Math.hypot(EAVE_Z, rise);
  const slope = new THREE.Group();

  box(HALF_W * 2 + 1, 0.2, len, M.corrugated, 0, 0, 0, slope);
  [-len * 0.32, 0, len * 0.32].forEach((z) => box(HALF_W * 2, 0.35, 0.3, M.beam, 0, -0.28, z, slope));
  // testeira/calha na ponta do beiral, virada pra baixo
  box(HALF_W * 2 + 1, 0.8, 0.28, M.beam, 0, -0.5, len / 2 - 0.15, slope);

  slope.position.set(0, RIDGE_Y - rise / 2, side * (EAVE_Z / 2));
  slope.rotation.x = side * Math.atan2(rise, EAVE_Z);
  g.add(slope);
}

/** Guarda-corpo amarelo correndo em Z (montantes instanciados + corrimão, travessa e rodapé). */
function addRailing(g: THREE.Object3D, x: number) {
  const posts = 9;
  instanced(
    new THREE.BoxGeometry(0.1, 1.1, 0.1),
    M.handrail,
    posts,
    (i, m) => m.makeTranslation(x, DECK_Y + 0.55, -DECK_HALF_LEN + (i / (posts - 1)) * DECK_HALF_LEN * 2),
    g,
  );
  const rail = cyl(0.07, 0.07, DECK_HALF_LEN * 2, M.handrail, x, DECK_Y + 1.1, 0, g, 6);
  rail.rotation.x = Math.PI / 2;
  const mid = cyl(0.06, 0.06, DECK_HALF_LEN * 2, M.handrail, x, DECK_Y + 0.6, 0, g, 6);
  mid.rotation.x = Math.PI / 2;
  box(0.06, 0.22, DECK_HALF_LEN * 2, M.handrail, x, DECK_Y + 0.11, 0, g);
}

/** Mezanino de operação: piso de grade, vigas de borda, pilaretes e guarda-corpo dos dois lados. */
function addPlatform(g: THREE.Object3D, px: number) {
  box(3, 0.3, DECK_HALF_LEN * 2, M.grate, px, DECK_Y - 0.15, 0, g);
  [-1.55, 1.55].forEach((dx) => box(0.25, 0.5, DECK_HALF_LEN * 2, M.beam, px + dx, DECK_Y - 0.55, 0, g));
  [-10, -3.5, 3.5, 10].forEach((z) => cyl(0.24, 0.24, DECK_Y - 0.3, M.beam, px, (DECK_Y - 0.3) / 2, z, g, 8));
  [-1.4, 1.4].forEach((dx) => addRailing(g, px + dx));
}

/** Escada de acesso ao mezanino, saindo pela ponta sul — longarinas, degraus e corrimão. */
function addStairs(g: THREE.Object3D, px: number) {
  const z0 = DECK_HALF_LEN;
  const z1 = DECK_HALF_LEN + 6.5;
  [-1.3, 1.3].forEach((dx) => {
    strut([px + dx, DECK_Y, z0], [px + dx, 0.1, z1], 0.28, M.beam, g);
    strut([px + dx * 1.2, DECK_Y + 1.1, z0], [px + dx * 1.2, 1.2, z1], 0.12, M.handrail, g);
  });
  const steps = 9;
  instanced(
    new THREE.BoxGeometry(2.6, 0.1, 0.8),
    M.grate,
    steps,
    (i, m) => {
      const t = (i + 0.5) / steps;
      m.makeTranslation(px, DECK_Y - (DECK_Y - 0.2) * t, z0 + (z1 - z0) * t);
    },
    g,
  );
}

/**
 * Braço de carregamento superior (top loading): prumada de produto subindo do
 * coletor pela lateral do mezanino, lança articulada avançando sobre a faixa e
 * tubo de descida com bocal na ponta, contrapeso atrás. `sx` é −1/+1 (faixa à
 * esquerda ou à direita do mezanino `px`).
 */
function addLoadingArm(g: THREE.Object3D, px: number, sx: number, z: number) {
  const riserX = px + sx * RISER_OFFSET;
  const laneX = px + sx * LANE_OFFSET;

  cyl(0.2, 0.2, BOOM_Y - 3.4, M.pipeRed, riserX, (BOOM_Y + 3.4) / 2, z, g, 10);
  box(0.6, 0.6, 0.6, M.valveBody, riserX, DECK_Y + 0.6, z, g);

  const boom = cyl(0.18, 0.18, Math.abs(laneX - riserX), M.steel, (riserX + laneX) / 2, BOOM_Y, z, g, 10);
  boom.rotation.z = Math.PI / 2;

  cyl(0.22, 0.22, 2.6, M.steel, laneX, BOOM_Y - 1.3, z, g, 10);
  cyl(0.34, 0.34, 0.5, M.dark, laneX, BOOM_Y - 2.5, z, g, 10);

  box(1.1, 0.7, 0.7, M.dark, px + sx * 0.9, BOOM_Y + 0.5, z, g);
  strut([px + sx * 1.2, BOOM_Y + 0.8, z], [laneX - sx * 0.6, BOOM_Y + 0.25, z], 0.1, M.dark, g);
}

/**
 * Coletor de produto de uma posição externa: prumada de alimentação subindo do
 * chão na ponta traseira e barrilete correndo em Z sob a linha de braços. Cada
 * plataforma externa tem o seu, alimentado por conta própria — não há barrilete
 * cruzando o meio da estrutura, porque as duas vagas internas não carregam.
 */
function addHeader(g: THREE.Object3D, px: number, sx: number) {
  const branchX = px + sx * RISER_OFFSET;
  const branch = cyl(0.22, 0.22, DECK_HALF_LEN * 2, M.pipeRed, branchX, 3.4, 0, g, 10);
  branch.rotation.x = Math.PI / 2;
  cyl(0.24, 0.24, 3.4, M.pipeRed, branchX, 1.7, -DECK_HALF_LEN, g, 10);
  cyl(0.3, 0.3, 0.5, M.pipeFlange, branchX, 3.4, -DECK_HALF_LEN, g, 10);
}

function makeCanopy() {
  const g = new THREE.Group();

  // Piso de concreto da plataforma — acima da pista (y=0.12) pra não brigar
  // com o asfalto no z-buffer quando a cobertura é solta sobre o viário.
  box(HALF_W * 2, 0.3, EAVE_Z * 2, M.pad, 0, 0.06, 0, g);

  addColumns(g);
  COL_X.forEach((x) => addTruss(g, x));
  [-COL_Z, COL_Z].forEach((z) => box(HALF_W * 2, 0.9, 0.5, M.beam, 0, COL_TOP + 0.6, z, g));

  // Contraventamento longitudinal nos vãos das pontas — sem ele a cobertura
  // fica visualmente "solta" de lado, que é justamente um dos ângulos de uso.
  [[-19, -9], [9, 19]].forEach(([xa, xb]) => {
    [-COL_Z, COL_Z].forEach((z) => strut([xa, COL_TOP - 0.4, z], [xb, COL_TOP - 3.4, z], 0.22, M.beam, g));
  });

  [-1, 1].forEach((side) => addRoofSlope(g, side));
  box(HALF_W * 2 + 1.4, 0.4, 1.4, M.beam, 0, RIDGE_Y + 0.2, 0, g);

  PLATFORM_X.forEach((px) => {
    // só a vaga externa de cada mezanino carrega — o lado interno vira apenas
    // passarela/guarda-corpo, sem braço nem prumada avançando pro meio.
    const outer = Math.sign(px);
    addPlatform(g, px);
    addStairs(g, px);
    addHeader(g, px, outer);
    ARM_Z.forEach((z) => addLoadingArm(g, px, outer, z));
  });

  return g;
}

export { makeCanopy };
