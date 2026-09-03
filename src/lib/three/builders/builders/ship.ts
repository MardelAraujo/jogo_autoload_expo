import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Petroleiro (navio-tanque) atracado — casco extrudado de verdade (proa/popa
 * afilando), casario a ré em blocos escalonados com asas de passadiço, chaminé
 * com faixa da armadora, e o convés de carga detalhado como num navio real:
 * guarda-corpo de costado, linha de dutos de carga correndo à meia-nau,
 * fileira de domos/escotilhas de tanque, manifold central com guindastes de
 * mangote, castelo de proa com molinete e âncora, e mastro de radar.
 *
 * O nível de detalhe é pensado pra leitura à distância (o navio é peça de
 * fundo, atracado no cais): silhueta certa de petroleiro — casco baixo e
 * comprido, casario só na popa, convés cheio de tubulação — mais do que
 * fidelidade de close. Repetições (balaústres, domos) vão em InstancedMesh.
 */

/**
 * Perfil do casco (meia-boca) da popa (z negativo) até a proa (z positivo) —
 * usado tanto pelo casco quanto pelo convés, então proa/popa afilam junto.
 * `z` é a posição ao longo do navio, `hw` a meia-boca naquele ponto.
 */
const HULL_STATIONS: [number, number][] = [
  [-46, 6.5],
  [-42, 11.5],
  [-25, 12],
  [20, 12],
  [34, 11],
  [42, 5.5],
  [46, 0.4],
];

const PARALLEL_Z0 = -24;   // início do corpo paralelo (boca cheia) — onde vale correr trilho reto
const PARALLEL_Z1 = 33;

/** Meia-boca do casco em qualquer `z`, por interpolação linear entre estações. */
function hwAt(z: number) {
  for (let i = 0; i < HULL_STATIONS.length - 1; i++) {
    const [z0, hw0] = HULL_STATIONS[i];
    const [z1, hw1] = HULL_STATIONS[i + 1];
    if (z >= z0 && z <= z1) {
      const t = (z - z0) / (z1 - z0);
      return hw0 + (hw1 - hw0) * t;
    }
  }
  return HULL_STATIONS[HULL_STATIONS.length - 1][1];
}

/** Contorno 2D do casco (visto de cima) como THREE.Shape, escalado por `scale`. */
function hullShape(scale?: number) {
  const s = scale || 1;
  const shape = new THREE.Shape();
  HULL_STATIONS.forEach(([z, hw], i) => {
    const x = hw * s;
    const y = -z;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  for (let i = HULL_STATIONS.length - 2; i >= 0; i--) {
    const [z, hw] = HULL_STATIONS[i];
    shape.lineTo(-hw * s, -z);
  }
  return shape;
}

/** Uma "fatia" do casco extrudada a partir do contorno (normais sempre certas). */
function hullSlab(scale: number, height: number, y0: number, mat: THREE.Material, g: THREE.Object3D) {
  const geo = new THREE.ExtrudeGeometry(hullShape(scale), { depth: height, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y0;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/**
 * Casario (superestrutura) na popa: blocos decrescentes com fita de janelas
 * por pavimento, asas de passadiço no topo, bote salva-vidas num turco lateral
 * e mastro. Fica sobre o casing de máquinas, virado pra proa (janelas em +z).
 */
function addAccommodation(g: THREE.Object3D, cz: number, deckY: number) {
  const tiers = [
    { w: 20, h: 5.0, d: 15 },
    { w: 18, h: 4.2, d: 12.5 },
    { w: 16, h: 3.6, d: 10.5 },
    { w: 14, h: 3.2, d: 8.5 },   // passadiço (bridge)
  ];
  let y = deckY;
  tiers.forEach((t) => {
    const cy = y + t.h / 2;
    box(t.w, t.h, t.d, M.white, 0, cy, cz, g);
    // fita de janelas virada pra proa (+z)
    box(t.w - 1.6, t.h * 0.42, 0.16, M.glass, 0, cy + t.h * 0.14, cz + t.d / 2 + 0.05, g);
    // janelas laterais
    [-1, 1].forEach((s) => box(0.16, t.h * 0.4, t.d - 1.6, M.glass, s * (t.w / 2 + 0.04), cy + t.h * 0.12, cz, g));
    // faixa escura de arremate entre pavimentos
    box(t.w + 0.1, 0.25, t.d + 0.1, M.cabinetDark, 0, y + t.h, cz, g);
    y += t.h;
  });
  const bridgeTop = y;
  const topTier = tiers[tiers.length - 1];

  // asas de passadiço: prolongam o piso do bridge até quase a boca do navio
  [-1, 1].forEach((s) => {
    box(4.5, 0.3, 3.2, M.white, s * (topTier.w / 2 + 2.2), bridgeTop - topTier.h + 0.15, cz + 1, g);
    box(4.5, 0.9, 0.14, M.glass, s * (topTier.w / 2 + 2.2), bridgeTop - topTier.h + 0.7, cz + 2.55, g);
  });

  // bote salva-vidas laranja num turco, na lateral do 2º pavimento
  const boatY = deckY + tiers[0].h + 0.6;
  [-1, 1].forEach((s) => {
    const bx = s * (tiers[1].w / 2 + 1.6);
    box(0.2, 2.2, 0.2, M.steel, bx, boatY + 1.1, cz - 2, g);        // coluna do turco
    box(0.2, 2.2, 0.2, M.steel, bx, boatY + 1.1, cz + 2, g);
    const boat = cyl(1.0, 1.0, 4.4, M.ledAmber, bx + s * 0.4, boatY, cz, g, 10);
    boat.rotation.x = Math.PI / 2;                                   // casco do bote deitado em z
    box(2.0, 0.5, 4.6, M.cabinetDark, bx + s * 0.4, boatY - 0.5, cz, g); // berço/quilha
  });

  // mastro de radar com verga e antena giratória
  const mx = 0;
  const mBase = bridgeTop;
  cyl(0.16, 0.2, 5.5, M.steel, mx, mBase + 2.75, cz - 1, g, 8);
  box(4.2, 0.16, 0.16, M.steel, mx, mBase + 3.4, cz - 1, g);        // verga
  box(2.4, 0.5, 0.9, M.steel, mx, mBase + 4.6, cz - 0.4, g);        // scanner de radar
  box(0.5, 0.5, 0.5, M.ledRed, mx, mBase + 5.7, cz - 1, g);         // luz de topo
  [-1.9, 1.9].forEach((dx) => box(0.3, 0.3, 0.3, M.ledAmber, mx + dx, mBase + 3.5, cz - 1, g));
}

/** Chaminé com faixa da armadora e boca escura no topo, sobre o casing. */
function addFunnel(g: THREE.Object3D, z: number, deckY: number) {
  const h = 8.5;
  cyl(2.2, 2.7, h, M.white, 0, deckY + h / 2, z, g, 16);
  box(4.6, 2.2, 4.9, M.cabinetDark, 0, deckY + h - 3.6, z, g);      // faixa/logo da armadora
  cyl(2.25, 2.25, 1, M.dark, 0, deckY + h - 0.1, z, g, 16);         // boca
  // dutos de exaustão menores ao lado
  [-1, 1].forEach((s) => cyl(0.5, 0.5, h * 0.7, M.steel, s * 2.6, deckY + h * 0.35, z, g, 8));
}

/** Passadiço elevado ligando a proa ao casario — a espinha longitudinal do petroleiro. */
function addCatwalk(g: THREE.Object3D, deckY: number, zFrom: number, zTo: number) {
  const y = deckY + 2.4;
  const len = zFrom - zTo;
  box(1.8, 0.22, len, M.steel, 0, y, zTo + len / 2, g);
  const posts = 10;
  instanced(new THREE.BoxGeometry(0.1, 2.2, 0.1), M.steel, posts + 1, (i, m) => {
    m.makeTranslation(0, deckY + 1.2, zTo + (len * i) / posts);
  }, g);
  // corrimão dos dois lados do passadiço
  [-0.85, 0.85].forEach((dx) => box(0.06, 0.06, len, M.steel, dx, y + 1.0, zTo + len / 2, g));
}

/**
 * Linha de dutos de carga correndo à meia-nau (fore-aft) sobre o convés — o
 * feixe de tubos vermelhos que alimenta os tanques a partir do manifold.
 */
function addCargoLines(g: THREE.Object3D, deckY: number, zFrom: number, zTo: number) {
  const y = deckY + 0.6;
  const len = zTo - zFrom;
  [-2.4, -0.8, 0.8, 2.4].forEach((dx, i) => {
    const r = i === 1 || i === 2 ? 0.42 : 0.32;
    const p = cyl(r, r, len, i % 2 ? M.pipeRed : M.steel, dx, y + (i % 2 ? 0.1 : 0), (zFrom + zTo) / 2, g, 10);
    p.rotation.x = Math.PI / 2;
  });
  // berços de apoio dos tubos
  const cradles = Math.round(len / 8);
  instanced(new THREE.BoxGeometry(6, 0.5, 0.4), M.steel, cradles, (i, m) => {
    m.makeTranslation(0, deckY + 0.35, zFrom + (len * (i + 0.5)) / cradles);
  }, g);
}

/** Fileira de domos/escotilhas de tanque de carga ao longo do convés (2 fileiras). */
function addTankDomes(g: THREE.Object3D, deckY: number, zFrom: number, zTo: number, count: number) {
  const bodyGeo = new THREE.CylinderGeometry(1.7, 1.9, 1.1, 12);
  const capGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 10);
  [-6, 6].forEach((dx) => {
    instanced(bodyGeo, M.steel, count, (i, m) => {
      const z = zFrom + ((zTo - zFrom) * (i + 0.5)) / count;
      m.makeTranslation(dx, deckY + 0.55, z);
    }, g);
    instanced(capGeo, M.cabinetDark, count, (i, m) => {
      const z = zFrom + ((zTo - zFrom) * (i + 0.5)) / count;
      m.makeTranslation(dx - 0.6, deckY + 1.35, z);
    }, g);
  });
}

/** Guarda-corpo de costado ao longo do corpo paralelo (balaústres instanciados + duas correntes de trilho). */
function addDeckRail(g: THREE.Object3D, deckY: number) {
  const y = deckY + 0.1;
  const len = PARALLEL_Z1 - PARALLEL_Z0;
  [-1, 1].forEach((s) => {
    const x = s * (hwAt(0) - 0.3);
    const n = Math.round(len / 2.4);
    instanced(new THREE.BoxGeometry(0.08, 1.1, 0.08), M.steel, n, (i, m) => {
      m.makeTranslation(x, y + 0.55, PARALLEL_Z0 + (len * (i + 0.5)) / n);
    }, g);
    [0.5, 1.0].forEach((h) => box(0.05, 0.05, len, M.steel, x, y + h, PARALLEL_Z0 + len / 2, g));
  });
}

/** Manifold central: rack transversal de conexões + dois guindastes de mangote (pedestal + lança). */
function addManifold(g: THREE.Object3D, deckY: number, z: number) {
  const y = deckY + 1.4;
  // rack transversal com bocais de conexão
  cyl(0.4, 0.4, 15, M.steel, 0, y, z, g, 10).rotation.z = Math.PI / 2;
  cyl(0.4, 0.4, 15, M.pipeRed, 0, y - 0.8, z + 1.5, g, 10).rotation.z = Math.PI / 2;
  [-6, -2, 2, 6].forEach((x) => {
    cyl(0.28, 0.28, 1.4, M.pipeRed, x, deckY + 0.9, z, g, 8);       // subida do bocal
    cyl(0.42, 0.42, 0.3, M.pipeFlange, x, y + 0.2, z + 1.5, g, 8).rotation.x = Math.PI / 2; // flange de conexão
  });

  // guindastes de mangote nos dois bordos
  [-1, 1].forEach((s) => {
    const px = s * 8;
    cyl(0.7, 0.9, 4.5, M.white, px, deckY + 2.25, z - 3, g, 10);    // pedestal
    box(1.4, 1.2, 1.6, M.white, px, deckY + 4.7, z - 3, g);         // casa de máquinas do guindaste
    const jib = box(0.4, 0.4, 9, M.steel, px, deckY + 5.4, z + 1, g); // lança
    jib.rotation.x = 0.32;
    cyl(0.1, 0.1, 3, M.dark, px, deckY + 4.2, z + 5, g, 6);         // cabo/mangote pendurado
  });
}

/** Castelo de proa: convés elevado com amurada, molinete de amarração e âncora. */
function addForecastle(g: THREE.Object3D, deckY: number) {
  const z = 40;
  box(hwAt(z) * 1.5, 0.6, 8, M.shipDeck, 0, deckY + 0.3, z, g);     // convés elevado
  // amurada baixa acompanhando a proa
  [-1, 1].forEach((s) => {
    const wall = box(0.3, 1.0, 9, M.white, s * (hwAt(z) - 0.4), deckY + 0.9, z, g);
    wall.rotation.y = s * 0.12;
  });
  // molinete + cabeços de amarração
  box(3.4, 1.0, 1.6, M.cabinetDark, 0, deckY + 1.0, z + 2, g);      // molinete (windlass)
  cyl(0.9, 0.9, 1.2, M.steel, 0, deckY + 1.1, z + 3, g, 12);        // tambor
  [-1, 1].forEach((s) => {
    [[s * 3, z - 1], [s * 4, z + 3]].forEach(([bx, bz]) =>
      cyl(0.3, 0.35, 0.9, M.dark, bx, deckY + 0.75, bz, g, 8));     // cabeços (bitts)
  });
  // âncora recolhida no escovém + mastro de proa com luz
  box(1.4, 1.6, 0.3, M.dark, 0, deckY + 1.2, z + 4.4, g);
  cyl(0.12, 0.14, 4, M.steel, 0, deckY + 2.3, z, g, 6);
  box(0.4, 0.4, 0.4, M.ledAmber, 0, deckY + 4.2, z, g);
}

export function makeShip() {
  const g = new THREE.Group();

  const y0 = -1;
  const lowerH = 5.5;   // obra viva (antifouling vermelho)
  const upperH = 4;     // obra morta (costado escuro)
  const deckY = y0 + lowerH + upperH;

  hullSlab(1, lowerH, y0, M.shipHull, g);
  hullSlab(1, upperH, y0 + lowerH, M.shipHullDark, g);
  hullSlab(1.008, 0.35, y0 + lowerH - 0.18, M.white, g);   // faixa de boot-top na linha d'água
  hullSlab(1.02, 0.7, deckY, M.shipDeck, g);               // convés

  const topDeckY = deckY + 0.7;

  // convés de carga (da proa até o casario)
  addDeckRail(g, topDeckY);
  addCargoLines(g, topDeckY, -26, 36);
  addTankDomes(g, topDeckY, -18, 33, 6);
  addManifold(g, topDeckY, -2);
  addCatwalk(g, topDeckY, 40, -28);
  addForecastle(g, topDeckY);

  // popa: casario + chaminé sobre o casing de máquinas
  addAccommodation(g, -36, topDeckY);
  addFunnel(g, -45, topDeckY);

  return g;
}
