import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";

/**
 * Ferrovia dividida em três elementos independentes — via, vagão-tanque e
 * locomotiva — em vez de um único grupo monolítico. Isso é de propósito: a
 * cena vai ser animada, e o trem precisa poder andar sobre a via parada,
 * cada vagão com posição própria. Cada um é um tipo separado na paleta
 * (ver registry/types.js), então também dá pra acrescentar/remover vagões
 * sem mexer no builder.
 *
 * Todas as alturas descendem da mesma referência: o topo do boleto
 * (`RAIL_TOP`). Rodas, chassi e casco são posicionados a partir dele, então
 * mexer no perfil do trilho reposiciona o trem junto, sem números soltos.
 */
export const TRACK_LEN = 300;
export const GAUGE = 3;          // bitola: distância entre os dois trilhos
export const RAIL_TOP = 1.44;    // topo do boleto — as rodas assentam aqui
export const CAR_SPACING = 22;   // centro a centro: encosta os engates de dois vagões

const SLEEPER_STEP = 1.8;
const WHEEL_R = 0.9;
const Y_WHEEL = RAIL_TOP + WHEEL_R;

/**
 * Truque (bogie): laterais, travessa, pivô e eixos com rodas assentadas no
 * trilho. `axleOffsets` define quantos eixos e onde — 2 no vagão, 3 na
 * locomotiva (Co-Co).
 */
function addBogie(g: THREE.Object3D, z: number, axleOffsets: number[]) {
  [-1.9, 1.9].forEach((x) => box(0.3, 0.85, 4.6, M.carFrame, x, Y_WHEEL + 0.45, z, g));
  box(3.6, 0.6, 1.3, M.carFrame, 0, Y_WHEEL + 0.5, z, g);
  cyl(0.5, 0.5, 0.7, M.carFrame, 0, Y_WHEEL + 1.15, z, g, 10);

  axleOffsets.forEach((dz) => {
    const axle = cyl(0.16, 0.16, 3.4, M.dark, 0, Y_WHEEL, z + dz, g, 8);
    axle.rotation.z = Math.PI / 2;
    [-GAUGE / 2, GAUGE / 2].forEach((x) => {
      const w = cyl(WHEEL_R, WHEEL_R, 0.3, M.steel, x, Y_WHEEL, z + dz, g, 18);
      w.rotation.z = Math.PI / 2;
      // friso (flange) do lado de dentro do trilho, que é o que guia a roda
      const flange = cyl(WHEEL_R + 0.13, WHEEL_R + 0.13, 0.1, M.dark, x - Math.sign(x) * 0.2, Y_WHEEL, z + dz, g, 18);
      flange.rotation.z = Math.PI / 2;
    });
  });
}

/** Engate + travessa de topo + mangueira de ar, numa das pontas (`s` = +1 ou -1). */
function addCoupler(g: THREE.Object3D, s: number, halfLen: number, y: number) {
  box(1.7, 0.5, 0.4, M.carFrame, 0, y, s * (halfLen - 0.2), g);
  box(0.75, 0.6, 1.5, M.carFrame, 0, y, s * (halfLen + 0.75), g);
  box(0.5, 0.42, 0.5, M.dark, 0, y, s * (halfLen + 1.45), g);
  cyl(0.09, 0.09, 0.8, M.dark, 0.65, y - 0.35, s * (halfLen + 0.3), g, 5);
}

/**
 * Via férrea: leito de brita, dormentes de madeira e trilhos de aço com
 * perfil de verdade (patim, alma e boleto) em vez de uma barra chapada.
 */
export function makeRail() {
  const g = new THREE.Group();

  box(9, 0.5, TRACK_LEN, M.ballast, 0, 0.25, 0, g);

  // Dormentes: ~165 peças idênticas. Como InstancedMesh, viram uma malha só
  // (uma draw call) em vez de 165 objetos — a via é comprida e essa é a
  // parte que mais se repete na cena inteira.
  const count = Math.floor(TRACK_LEN / SLEEPER_STEP);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(5.4, 0.3, 0.6), M.sleeper, count);
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    mtx.makeTranslation(0, 0.65, -TRACK_LEN / 2 + SLEEPER_STEP * (i + 0.5));
    sleepers.setMatrixAt(i, mtx);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  g.add(sleepers);

  [-GAUGE / 2, GAUGE / 2].forEach((x) => {
    box(0.5, 0.12, TRACK_LEN, M.railWeb, x, 0.86, 0, g);   // patim
    box(0.18, 0.34, TRACK_LEN, M.railWeb, x, 1.09, 0, g);  // alma
    box(0.34, 0.18, TRACK_LEN, M.railHead, x, 1.35, 0, g); // boleto (polido)
  });

  return g;
}

/**
 * Vagão-tanque: chassi sobre dois truques, casco de aço com tampos
 * abaulados e cintas, passadiço com guarda-corpo, domo com válvulas e
 * volantes, escada lateral e engates nas duas pontas.
 */
export function makeTankCar() {
  const g = new THREE.Group();
  const L = 19;
  const HALF = L / 2;
  const R = 2.6;
  const BODY_LEN = 15.5;
  const yFrame = 3.6;
  const yBody = 6.2;
  const yTop = yBody + R;

  box(5.2, 0.5, L, M.carFrame, 0, yFrame, 0, g);
  [-2.5, 2.5].forEach((x) => box(0.26, 0.75, L, M.carFrame, x, yFrame - 0.12, 0, g));

  [-6.4, 6.4].forEach((z) => addBogie(g, z, [-1.4, 1.4]));

  const body = cyl(R, R, BODY_LEN, M.carBody, 0, yBody, 0, g, 24);
  body.rotation.x = Math.PI / 2;

  // tampos abaulados: meia-esfera apontando pra fora em cada ponta
  [-1, 1].forEach((s) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.carBody);
    cap.rotation.x = (s * Math.PI) / 2;
    cap.position.set(0, yBody, (s * BODY_LEN) / 2);
    cap.castShadow = true;
    g.add(cap);
  });

  // cintas de reforço / berços sobre o chassi
  [-4.8, 4.8].forEach((z) => {
    const band = cyl(R + 0.08, R + 0.08, 0.5, M.carFrame, 0, yBody, z, g, 24);
    band.rotation.x = Math.PI / 2;
  });

  // passadiço em dois trechos, com o domo no vão do meio
  [-1, 1].forEach((s) => {
    const zc = s * 4.4;
    box(1.5, 0.12, 5.6, M.treadTex, 0, yTop + 0.06, zc, g);
    [-0.85, 0.85].forEach((x) => {
      const rail = cyl(0.05, 0.05, 5.6, M.dark, x, yTop + 0.96, zc, g, 6);
      rail.rotation.x = Math.PI / 2;
      [-2.4, 0, 2.4].forEach((dz) => cyl(0.045, 0.045, 0.9, M.dark, x, yTop + 0.51, zc + dz, g, 5));
    });
  });

  // domo (boca de visita) com tampa aparafusada
  cyl(1.15, 1.3, 0.75, M.carBody, 0, yTop - 0.15, 0, g, 16);
  cyl(1.05, 1.05, 0.32, M.carFrame, 0, yTop + 0.38, 0, g, 16);

  // válvulas de carga/descarga com volante vermelho
  [[-0.55, 0.4], [0.55, -0.4]].forEach(([x, z]) => {
    cyl(0.16, 0.16, 0.75, M.steel, x, yTop + 0.9, z, g, 8);
    const hw = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 14), M.red);
    hw.rotation.x = Math.PI / 2;
    hw.position.set(x, yTop + 1.3, z);
    g.add(hw);
  });
  // válvula de segurança / respiro
  cyl(0.24, 0.24, 0.55, M.carFrame, 0, yTop + 0.85, -1.0, g, 8);

  // escada lateral de acesso ao passadiço
  const lx = 2.68;
  const lz = 5.8;
  const ladH = yTop - yFrame;
  [-0.35, 0.35].forEach((dz) => cyl(0.06, 0.06, ladH, M.dark, lx, yFrame + ladH / 2, lz + dz, g, 5));
  for (let i = 1; i < 6; i++) box(0.12, 0.05, 0.72, M.dark, lx, yFrame + (ladH * i) / 6, lz, g);

  // descarga inferior
  cyl(0.3, 0.3, 0.9, M.carFrame, 0, yFrame - 0.1, 0, g, 8);

  [-1, 1].forEach((s) => addCoupler(g, s, HALF, yFrame - 0.15));

  return g;
}

/**
 * Locomotiva diesel-elétrica moderna (industrial): capô longo do motor,
 * cabine elevada envidraçada, nariz curto, radiador de teto, tanque de
 * combustível entre os truques e truques de três eixos.
 *
 * Construída com o nariz apontando pra +z. Na cena o rake de vagões fica de
 * um lado só, então quem coloca a locomotiva gira 180° pra que o nariz
 * aponte pra fora e o engate traseiro encoste no primeiro vagão.
 */
export function makeLoco() {
  const g = new THREE.Group();
  const HALF = 13;
  const yFrame = 3.5;
  const deck = yFrame + 0.53;

  box(5.4, 0.7, HALF * 2, M.carFrame, 0, yFrame, 0, g);
  box(6.0, 0.18, HALF * 2 - 1.2, M.treadTex, 0, yFrame + 0.44, 0, g);

  [-8, 8].forEach((z) => addBogie(g, z, [-2.4, 0, 2.4]));

  // tanque de combustível pendurado entre os truques
  box(4.4, 1.1, 8.4, M.carFrame, 0, 2.6, 0, g);
  box(1.0, 0.5, 1.0, M.dark, 2.3, 3.0, 3.2, g);

  // capô longo (motor) + cabine + nariz curto
  box(5.0, 3.6, 13, M.locoBody, 0, deck + 1.8, -4.5, g);
  box(5.4, 4.3, 6, M.locoBody, 0, deck + 2.15, 5.5, g);
  box(4.6, 2.6, 4, M.locoBody, 0, deck + 1.3, 10.5, g);

  // envidraçamento da cabine
  box(4.2, 1.7, 0.16, M.glass, 0, deck + 3.0, 8.58, g);
  box(3.4, 1.5, 0.16, M.glass, 0, deck + 3.0, 2.42, g);
  [-2.73, 2.73].forEach((x) => box(0.16, 1.7, 3.6, M.glass, x, deck + 3.0, 5.4, g));

  // teto da cabine com pestana + condicionador
  box(5.7, 0.26, 6.4, M.dark, 0, deck + 4.42, 5.5, g);
  box(2.2, 0.7, 2.4, M.steel, 0, deck + 4.9, 4.3, g);

  // radiador: grades laterais e ventilador no topo do capô
  [-2.53, 2.53].forEach((x) => box(0.12, 2.2, 4.6, M.dark, x, deck + 2.2, -8.4, g));
  box(4.6, 0.8, 4.6, M.dark, 0, deck + 3.75, -8.4, g);
  cyl(1.5, 1.5, 0.2, M.carFrame, 0, deck + 4.2, -8.4, g, 16);

  // escapamento
  cyl(0.42, 0.52, 0.95, M.dark, 0, deck + 3.9, -1.2, g, 10);

  // faixas de advertência e faróis
  box(4.65, 0.9, 0.16, M.locoAccent, 0, deck + 0.55, 12.55, g);
  box(5.05, 0.9, 0.16, M.locoAccent, 0, deck + 0.55, -11.05, g);
  [-1.3, 1.3].forEach((x) => {
    const hl = cyl(0.3, 0.3, 0.26, M.white, x, deck + 2.05, 12.6, g, 12);
    hl.rotation.x = Math.PI / 2;
  });
  box(0.9, 0.35, 0.3, M.white, 0, deck + 4.5, 8.5, g);

  // corrimãos e para-choques nas pontas
  [-1, 1].forEach((s) => {
    [-2.62, 2.62].forEach((x) => cyl(0.06, 0.06, 1.7, M.locoAccent, x, yFrame + 1.35, s * 11.6, g, 5));
    box(5.4, 0.11, 0.11, M.locoAccent, 0, yFrame + 2.1, s * 11.6, g);
    addCoupler(g, s, HALF, yFrame - 0.25);
  });

  return g;
}
