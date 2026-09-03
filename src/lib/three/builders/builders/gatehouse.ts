import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";
import { makeGate } from "./gate";
import { makeTotem } from "./totem";

/**
 * Portaria (guarita de controle de acesso) — prédio pequeno envidraçado com
 * laje protendida em balanço sobre as pistas, mais completo que a guarita
 * simples (booth.js). Usado sozinho e como peça central do pack de portaria.
 *
 * Nasce com a fachada de atendimento em +z e −z (janelas dos dois lados, pra
 * ver as duas pistas). A marquise cobre um pouco de cada pista vizinha.
 */
function makeGatehouse() {
  const g = new THREE.Group();
  const W = 9;
  const D = 6.5;
  const H = 3.6;

  // laje de piso elevada
  box(W + 0.6, 0.4, D + 0.6, M.concrete, 0, 0.2, 0, g);

  // corpo: parapeito baixo + faixa de vidro em volta
  box(W, 1.0, D, M.tankW, 0, 0.9, 0, g);
  box(W - 0.3, H - 1.4, D - 0.3, M.glass, 0, 0.9 + (H - 1.4) / 2 + 0.1, 0, g);
  // montantes dos cantos
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) =>
    box(0.3, H, 0.3, M.cabinetDark, (sx * W) / 2, H / 2 + 0.4, (sz * D) / 2, g));
  // montantes intermediários nas fachadas longas
  [-W / 4, 0, W / 4].forEach((x) => box(0.16, H - 1.4, 0.16, M.cabinetDark, x, 0.9 + (H - 1.4) / 2 + 0.1, D / 2, g));

  // laje de cobertura em balanço (marquise): superfície clara por cima, fina
  // faixa escura de arremate (fascia) só embaixo, um pouco maior, dando o
  // reforço/sombra da borda — não uma placa escura cobrindo o telhado inteiro
  const mW = W + 5;
  const mD = D + 1.5;
  box(mW, 0.22, mD + 0.5, M.cabinetDark, 0, H + 0.55, 0, g);   // fascia (embaixo)
  box(mW - 0.4, 0.3, mD, M.cabinet, 0, H + 0.72, 0, g);        // laje clara (por cima)
  // pilar de apoio da ponta da marquise, de cada lado
  [-1, 1].forEach((s) => cyl(0.2, 0.24, H + 0.4, M.steel, (s * mW) / 2 - s * 0.4, (H + 0.4) / 2, 0, g));

  // porta nos fundos (−z), degrau
  box(1.2, 2.1, 0.1, M.cabinetDark, W / 2 - 1.6, 1.45, -D / 2 - 0.02, g);
  box(1.6, 0.2, 0.8, M.concrete, W / 2 - 1.6, 0.5, -D / 2 - 0.5, g);

  // ar-condicionado sobre a laje + luminárias sob a marquise
  box(1.1, 0.6, 0.7, M.steel, -W / 2 + 1, H + 0.95, 0, g);
  [-2.5, 2.5].forEach((x) => box(1.0, 0.1, 0.4, M.ledAmber, x, H + 0.5, D / 2 + 0.6, g));

  // placa "PORTARIA" na testeira (fascia) da marquise, virada pra frente
  box(4.2, 0.8, 0.12, M.cabinetDark, 0, H + 0.5, mD / 2 + 0.28, g);
  box(3.2, 0.42, 0.06, M.ledGreen, 0, H + 0.5, mD / 2 + 0.35, g);

  return g;
}

/**
 * Pack de controle de acesso: portaria numa ilha central, com duas pistas
 * (entrada e saída), cada uma com sua cancela e seu totem. Montado pra
 * animar depois — cada cancela é um filho nomeado, e o pack expõe em
 * `userData.anim.gates` os nomes dos dois braços (dados serializáveis; ver
 * gate.js pra a convenção e o porquê de não guardar Object3D aqui).
 *
 *      x →           ┌── ilha ──┐
 *   ┌───────┬────────┤ PORTARIA ├────────┬───────┐
 *   │ entra │ totem ▮│          │▮ totem │ sai   │   ← fluxo em z
 *   │  ═╪═ cancela   │          │   cancela ═╪═   │
 *   └───────┴────────┴──────────┴────────┴───────┘
 */
function makeGatePlaza() {
  const g = new THREE.Group();

  const LANE_W = 7;
  const ISLAND_HW = 5;                     // meia-largura da ilha
  const laneCx = ISLAND_HW + LANE_W / 2;   // centro de cada pista (±)
  const outerX = ISLAND_HW + LANE_W;       // borda externa (±)
  const Z_BAR = 0;                         // linha das cancelas
  const ISLAND_Z = 16;                     // meia-profundidade da ilha/pátio

  // --- pavimento do pátio de acesso ---
  box(outerX * 2 + 6, 0.14, ISLAND_Z * 2, M.road, 0, 0.07, 0, g);

  // --- ilha central (canteiro elevado com meio-fio zebrado) ---
  box(ISLAND_HW * 2, 0.5, ISLAND_Z * 2 - 2, M.pad, 0, 0.25, 0, g);
  [-1, 1].forEach((s) => box(0.5, 0.75, ISLAND_Z * 2 - 2, M.hazard, s * ISLAND_HW, 0.38, 0, g));
  const gh = makeGatehouse();
  gh.position.set(0, 0.5, 0);
  g.add(gh);

  // --- faixas divisórias tracejadas nas bordas das pistas ---
  const dash = (x: number) => {
    for (let z = -ISLAND_Z + 2; z < ISLAND_Z - 2; z += 3) box(0.18, 0.16, 1.6, M.line, x, 0.15, z, g);
  };
  dash(outerX);
  dash(-outerX);

  // --- entrada (−x) e saída (+x): cada uma com cancela + totem ---
  // A cancela fica na borda da ilha e o braço atravessa a pista pra fora.
  // O totem fica antes da cancela, no lado da ilha, virado pro motorista.
  const entryGate = makeGate({ dir: -1, len: LANE_W + 0.5, entry: true });
  entryGate.position.set(-ISLAND_HW, 0.14, Z_BAR);
  entryGate.name = 'cancelaEntrada';
  g.add(entryGate);

  const exitGate = makeGate({ dir: 1, len: LANE_W + 0.5, entry: false });
  exitGate.position.set(ISLAND_HW, 0.14, Z_BAR);
  exitGate.name = 'cancelaSaida';
  g.add(exitGate);

  // totens: no lado da ilha, uns metros antes da cancela (motorista chega por +z)
  const tEntry = makeTotem({ entry: true });
  tEntry.position.set(-laneCx, 0.14, Z_BAR + 5);
  tEntry.rotation.y = -Math.PI / 2;   // tela virada pra pista de entrada
  g.add(tEntry);

  const tExit = makeTotem({ entry: false });
  tExit.position.set(laneCx, 0.14, Z_BAR - 5);
  tExit.rotation.y = Math.PI / 2;     // saída flui no sentido oposto
  g.add(tExit);

  // setas de direção no piso
  arrow(g, -laneCx, Z_BAR + 10, 1);   // entrada: aponta pra dentro (−z)
  arrow(g, laneCx, Z_BAR - 10, -1);   // saída: aponta pra fora (+z)

  // dica de animação do pack: nomes dos dois braços (dados serializáveis)
  g.userData.anim = {
    gates: [
      { gate: 'cancelaEntrada', part: 'braco', axis: 'z' },
      { gate: 'cancelaSaida', part: 'braco', axis: 'z' },
    ],
  };

  return g;
}

/** Seta de direção pintada no piso (corpo + ponta), apontando em +z*sign. */
function arrow(g: THREE.Object3D, x: number, z: number, sign: number) {
  box(0.7, 0.05, 4, M.line, x, 0.16, z, g);
  const tip = box(2.2, 0.05, 2.2, M.line, x, 0.16, z + sign * 2.6, g);
  tip.rotation.y = Math.PI / 4;
}

export { makeGatehouse, makeGatePlaza };
