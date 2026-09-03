import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";

/**
 * Balança rodoviária (ponte de pesagem) + totem — dimensionada pra assentar
 * DENTRO de uma faixa de estrada: tabuleiro estreito (~3,4 m, largura de uma
 * pista de caminhão), baixo (quase rasante) e com rampas curtas nas pontas,
 * pra parecer embutida no asfalto quando solta sobre a pista. Sem laje larga
 * em volta — só a moldura do tabuleiro, pra não virar um pátio próprio.
 *
 * O totem de pesagem fica na beira (lado +X), fora da faixa de rolamento, com
 * o display do peso e o semáforo siga/pare virados pra cabine (+Z).
 *
 * Eixos: o caminhão trafega em Z (tabuleiro comprido em Z); posicione sobre um
 * trecho reto da pista alinhando o Z do elemento com o sentido do tráfego.
 */

const DECK_HW = 1.7;    // meia-largura do tabuleiro (~3,4 m, cabe uma pista)
const DECK_LEN = 18;    // comprimento útil (cabe o caminhão sobre a ponte)
const DECK_Y = 0.24;    // altura do tabuleiro — baixo, quase rasante ao asfalto
const RAMP_LEN = 2.6;   // rampa curta de acesso em cada ponta

/** Rampa de acesso curta numa ponta (side −1/+1 em Z), do asfalto até o tabuleiro. */
function addRamp(g: THREE.Object3D, side: number) {
  const len = Math.hypot(RAMP_LEN, DECK_Y);
  const ramp = box(DECK_HW * 2, 0.14, len, M.dark, 0, DECK_Y / 2, side * (DECK_LEN / 2 + RAMP_LEN / 2), g);
  ramp.rotation.x = side * Math.atan2(DECK_Y, RAMP_LEN);
}

/**
 * Totem de pesagem — poste na beira com display grande do peso e semáforo
 * siga/pare virados pra cabine; gabinete do operador na base. Fica fora da
 * faixa de rolamento pra não brigar com o caminhão sobre a balança.
 */
function addWeighTotem(g: THREE.Object3D, x: number, z: number) {
  box(1.3, 0.28, 1.1, M.concrete, x, 0.14, z, g);          // sapata
  box(0.95, 1.3, 0.75, M.cabinet, x, 0.95, z, g);          // gabinete do operador
  box(1.0, 0.35, 0.8, M.hazard, x, 0.5, z, g);             // faixa zebrada no pé
  const postH = 3.0;
  cyl(0.12, 0.15, postH, M.cabinetDark, x, 1.6 + postH / 2, z, g, 8);

  // display do peso, virado pro motorista (+z)
  const dispY = 1.6 + postH - 0.1;
  box(2.0, 1.35, 0.28, M.cabinetDark, x, dispY, z + 0.1, g);
  box(1.7, 1.05, 0.1, M.screen, x, dispY, z + 0.26, g);

  // semáforo siga/pare no topo
  cyl(0.09, 0.09, 0.8, M.cabinetDark, x, dispY + 1.15, z, g, 8);
  box(0.36, 0.8, 0.28, M.cabinetDark, x, dispY + 1.7, z + 0.05, g);
  cyl(0.1, 0.1, 0.08, M.ledRed, x, dispY + 1.9, z + 0.2, g, 10).rotation.x = Math.PI / 2;
  cyl(0.1, 0.1, 0.08, M.ledGreen, x, dispY + 1.5, z + 0.2, g, 10).rotation.x = Math.PI / 2;
}

function makeScale() {
  const g = new THREE.Group();

  // moldura/fundação do tabuleiro — só a pegada da ponte (mesma largura), pra
  // assentar sobre a pista sem criar uma laje larga em volta
  box(DECK_HW * 2 + 0.4, 0.1, DECK_LEN + RAMP_LEN * 2, M.dark, 0, 0.05, 0, g);

  // tabuleiro de aço, baixo
  box(DECK_HW * 2, DECK_Y, DECK_LEN, M.steel, 0, DECK_Y / 2, 0, g);
  // frestas transversais entre módulos do tabuleiro (leitura de "ponte")
  for (let z = -DECK_LEN / 2 + 3; z < DECK_LEN / 2; z += 4) box(DECK_HW * 2 + 0.05, 0.05, 0.12, M.dark, 0, DECK_Y + 0.01, z, g);

  addRamp(g, -1);
  addRamp(g, 1);

  // guias laterais baixas zebradas (evitam o caminhão sair do tabuleiro)
  [-1, 1].forEach((s) => box(0.22, 0.34, DECK_LEN, M.hazard, s * (DECK_HW + 0.1), DECK_Y + 0.17, 0, g));

  addWeighTotem(g, DECK_HW + 2.2, 3);

  return g;
}

export { makeScale };
