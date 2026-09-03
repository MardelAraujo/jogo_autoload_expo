import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Guarita de vistoria física — a posição onde o caminhão para e o inspetor
 * anda ao lado da carreta conferindo lacres, pneus e documentação antes de
 * liberar. Pequena de propósito: uma faixa de parada, a guarita envidraçada do
 * inspetor e uma passarela elevada de inspeção que corre ao lado do caminhão,
 * com holofotes pra vistoria noturna.
 *
 * Eixos: o caminhão para no sentido Z (faixa em Z), a passarela corre em Z do
 * lado −X e a guarita fica no canto. Nasce com a faixa de parada em +Z.
 */

const LANE_HW = 3;      // meia-largura da faixa de parada
const LANE_LEN = 22;    // comprimento da faixa (cabe uma carreta)
const WALK_Y = 2.6;     // altura da passarela (na cintura da carreta)

/**
 * Cabine envidraçada do inspetor.
 *
 * Mesma pegada de antes (3,6 x 3,2 m, 3 m de altura) — mexer nisso deslocaria
 * as quatro cabines já posicionadas na planta —, mas com o vocabulário de
 * fachada do truck center (builders/truck-center.ts), que é a construção mais
 * caprichada da cena: embasamento, peitoril e verga escuros emoldurando a fita
 * de vidro, montantes quebrando o pano, pilastras de canto, platibanda com
 * rufo. Antes eram oito caixas — corpo branco, tira azul e uma laje solta em
 * cima —, e a cabine lia como caixote ao lado de um prédio desenhado com
 * relevo de verdade.
 *
 * A faixa fina da cor da marca sob o rufo é o que amarra o conjunto: repetida
 * igual em cada construção de apoio, faz peças de tamanhos muito diferentes
 * pertencerem à mesma família.
 *
 * `frente` é a direção (em Z) para onde a porta e a sinaleira olham — quem
 * chama escolhe, porque a cabine solta da planta e a que fica na baia de
 * vistoria encaram lados opostos.
 */
function addBooth(g: THREE.Object3D, x: number, z: number, frente = 1) {
  const W = 3.6;
  const D = 3.2;
  const yBase = 0.3;                 // topo do embasamento
  const ySill = yBase + 0.75;        // topo do peitoril
  const yHead = ySill + 1.5;         // base da verga
  const yTopo = yHead + 0.2;         // topo da parede
  const zF = frente * (D / 2);       // face da frente

  // embasamento: dois degraus, pra cabine assentar no piso em vez de flutuar
  box(W + 0.7, 0.16, D + 0.7, M.concrete, x, 0.08, z, g);
  box(W + 0.36, 0.16, D + 0.36, M.concrete, x, 0.24, z, g);

  // corpo: peitoril cheio, fita de vidro, verga
  box(W, 0.75, D, M.tankW, x, yBase + 0.375, z, g);
  box(W + 0.08, 0.12, D + 0.08, M.dark, x, ySill + 0.06, z, g);
  box(W - 0.14, yHead - ySill, D - 0.14, M.glass, x, (ySill + yHead) / 2, z, g);
  box(W + 0.08, 0.2, D + 0.08, M.dark, x, yHead + 0.1, z, g);

  // montantes quebrando o pano de vidro nas quatro faces
  const mull = 0.1;
  [-1, 1].forEach((s) => {
    [-0.85, 0, 0.85].forEach((d) => {
      box(mull, yHead - ySill, mull, M.cabinetDark, x + d, (ySill + yHead) / 2, z + s * (D / 2), g);
      box(mull, yHead - ySill, mull, M.cabinetDark, x + s * (W / 2), (ySill + yHead) / 2, z + d * 0.8, g);
    });
  });

  // pilastras de canto, do embasamento à verga
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) =>
    box(0.26, yTopo - yBase, 0.26, M.tankW, x + (sx * W) / 2, (yBase + yTopo) / 2, z + (sz * D) / 2, g));

  // platibanda, faixa da marca e rufo
  box(W + 0.42, 0.42, D + 0.42, M.tankW, x, yTopo + 0.21, z, g);
  box(W + 0.46, 0.1, D + 0.46, M.brand, x, yTopo + 0.1, z, g);
  box(W + 0.62, 0.12, D + 0.62, M.dark, x, yTopo + 0.48, z, g);

  // porta na face da frente: nicho escuro, folha de vidro e puxador
  box(0.92, yHead - yBase - 0.1, 0.14, M.cabinetDark, x - 0.9, (yBase + yHead) / 2, z + zF, g);
  box(0.72, yHead - yBase - 0.45, 0.06, M.glass, x - 0.9, (yBase + yHead) / 2 + 0.1, z + zF + frente * 0.08, g);
  cyl(0.03, 0.03, 0.34, M.steel, x - 0.56, yBase + 0.95, z + zF + frente * 0.12, g, 6);

  // sinaleira alojada na platibanda (verde = liberado), virada pra frente
  box(0.36, 0.5, 0.28, M.cabinetDark, x + W / 2 - 0.5, yTopo + 0.3, z + zF + frente * 0.2, g);
  box(0.2, 0.2, 0.06, M.ledGreen, x + W / 2 - 0.5, yTopo + 0.34, z + zF + frente * 0.35, g);
}

/** Passarela elevada de inspeção: piso de grade, guarda-corpo e escada de acesso. */
function addCatwalk(g: THREE.Object3D, x: number) {
  box(1.6, 0.2, LANE_LEN, M.grate, x, WALK_Y, 0, g);
  [-LANE_LEN / 2 + 1, 0, LANE_LEN / 2 - 1].forEach((z) => cyl(0.16, 0.16, WALK_Y, M.beam, x, WALK_Y / 2, z, g, 8));
  // guarda-corpo amarelo dos dois lados (montantes + corrimão)
  [-0.75, 0.75].forEach((dx) => {
    instanced(
      new THREE.BoxGeometry(0.08, 1.0, 0.08),
      M.handrail,
      7,
      (i, m) => m.makeTranslation(x + dx, WALK_Y + 0.6, -LANE_LEN / 2 + (i / 6) * LANE_LEN),
      g,
    );
    const rail = cyl(0.06, 0.06, LANE_LEN, M.handrail, x + dx, WALK_Y + 1.1, 0, g, 6);
    rail.rotation.x = Math.PI / 2;
  });
  // escada de acesso na ponta +Z
  const z0 = LANE_LEN / 2;
  const z1 = LANE_LEN / 2 + 3.5;
  [-0.7, 0.7].forEach((dx) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, Math.hypot(z1 - z0, WALK_Y)), M.beam);
    s.position.set(x + dx, WALK_Y / 2, (z0 + z1) / 2);
    s.lookAt(new THREE.Vector3(x + dx, 0.1, z1));
    g.add(s);
  });
  instanced(
    new THREE.BoxGeometry(1.5, 0.08, 0.7),
    M.grate,
    7,
    (i, m) => {
      const t = (i + 0.5) / 7;
      m.makeTranslation(x, WALK_Y - (WALK_Y - 0.2) * t, z0 + (z1 - z0) * t);
    },
    g,
  );
}

/** Só a cabine envidraçada, sem faixa/passarela/holofotes — pra compor livre na cena. */
function makeInspectionBooth() {
  const g = new THREE.Group();
  addBooth(g, 0, 0);
  return g;
}

function makeInspection() {
  const g = new THREE.Group();

  // piso de concreto da baia
  box(LANE_HW * 2 + 4, 0.16, LANE_LEN + 2, M.pad, -0.5, 0.08, 0, g);

  // faixa de parada zebrada + linha de eixo
  box(LANE_HW * 2, 0.06, 1, M.hazard, 0, 0.18, LANE_LEN / 2 - 1, g);
  for (let z = -LANE_LEN / 2 + 1; z < LANE_LEN / 2 - 1; z += 2.4) box(0.18, 0.04, 1.2, M.line, 0, 0.17, z, g);

  addCatwalk(g, -LANE_HW - 0.6);
  addBooth(g, LANE_HW + 2.2, LANE_LEN / 2 - 2, -1); // porta e sinaleira voltadas pra faixa de parada

  // dois postes de holofote iluminando a faixa
  [[-LANE_HW - 2, -LANE_LEN / 2 + 2], [LANE_HW + 2, -LANE_LEN / 2 + 2]].forEach(([px, pz]) => {
    cyl(0.14, 0.18, 5.5, M.cabinetDark, px, 2.75, pz, g, 8);
    const head = box(1, 0.4, 0.5, M.cabinetDark, px + (px < 0 ? 0.6 : -0.6), 5.4, pz, g);
    head.rotation.z = px < 0 ? -0.3 : 0.3;
    box(0.7, 0.25, 0.3, M.ledAmber, px + (px < 0 ? 1 : -1), 5.2, pz, g);
  });

  // Placa VISTORIA, na boca da baia. Ficava a meio metro da cabine e, vista de
  // cima (que é como o jogo mostra), colava nela como se fosse um painel na
  // parede. Empurrada 2 m para fora, as duas leem como duas peças.
  const zPlaca = LANE_LEN / 2 + 2.5;
  cyl(0.1, 0.1, 3, M.cabinetDark, LANE_HW + 1, 1.5, zPlaca, g, 6);
  box(2.4, 0.9, 0.12, M.cabinetDark, LANE_HW + 1, 3.1, zPlaca, g);
  box(2.0, 0.5, 0.06, M.ledRed, LANE_HW + 1, 3.1, zPlaca + 0.07, g);

  return g;
}

export { makeInspectionBooth, makeInspection };
