import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Cancela (barreira articulada) — motorizada, com braço listrado, saia
 * pendente, base/motor, sinaleira e poste de descanso.
 *
 * ── Convenção de animação (a cena vai ser animada) ────────────────────────
 * O braço é um filho NOMEADO ('braco'), com o pivô na dobradiça: a origem do
 * grupo 'braco' fica no eixo de rotação, e o braço se estende a partir dela.
 * Levantar = girar 'braco' no eixo z.
 *
 * A dica de animação vai em `g.userData.anim`, e é só DADO SERIALIZÁVEL
 * (strings/números) de propósito — NÃO uma referência a Object3D. Guardar um
 * Object3D em userData quebraria o clone (duplicate-delete.js faz
 * JSON.stringify(userData); um Object3D tem referência circular pai↔filho e
 * estoura a pilha — mesmo motivo do fix de `userData.root`). O animador acha
 * o pivô por nome:
 *
 *     const a = gate.userData.anim;                 // {part:'braco', axis, closed, open}
 *     const braco = gate.getObjectByName(a.part);
 *     braco.rotation[a.axis] = lerp(a.closed, a.open, t);   // t: 0 fechado → 1 aberto
 *
 * `dir` (+1 / −1) é o lado pra onde o braço aponta; o sentido de abertura
 * acompanha (o topo do braço sempre sobe). `entry` só troca a cor da
 * sinaleira (verde entrada / vermelho saída) — a geometria é a mesma.
 */
function makeGate(opts?: { dir?: number; len?: number; entry?: boolean }) {
  const { dir = 1, len = 8, entry = true } = opts || {};
  const g = new THREE.Group();

  const hingeY = 2.15;

  // --- base / motor (gabinete) ---
  box(1.6, 0.4, 1.6, M.concrete, 0, 0.2, 0, g);                  // sapata
  const cab = box(1.1, hingeY - 0.4, 0.9, M.cabinet, 0, (hingeY - 0.4) / 2 + 0.4, 0, g);
  cab.castShadow = true;
  box(1.16, 0.5, 0.96, M.hazard, 0, 0.75, 0, g);                 // faixa zebrada no pé
  box(0.8, 1.0, 0.06, M.cabinetDark, 0, hingeY - 0.75, 0.48, g); // porta de acesso
  cyl(0.05, 0.05, 0.18, M.steel, 0.28, hingeY - 0.75, 0.52, g, 6); // maçaneta
  box(0.9, 0.28, 0.7, M.cabinetDark, 0, hingeY - 0.05, 0, g);    // tampo do motor

  // --- sinaleira no topo do gabinete (verde entrada / vermelho saída) ---
  const led = entry ? M.ledGreen : M.ledRed;
  cyl(0.14, 0.14, 0.34, M.cabinetDark, 0, hingeY + 0.25, 0, g, 8);
  const lamp = cyl(0.13, 0.13, 0.16, led, 0, hingeY + 0.5, 0, g, 8);
  lamp.name = 'sinaleira'; // animação futura pode piscar trocando o material

  // --- dobradiça ---
  const hub = cyl(0.28, 0.28, 0.7, M.cabinetDark, 0, hingeY, 0, g, 12);
  hub.rotation.x = Math.PI / 2;

  // --- braço: filho nomeado, pivô na dobradiça, estende-se em dir*x ---
  const braco = new THREE.Group();
  braco.name = 'braco';
  braco.position.set(0, hingeY, 0);
  g.add(braco);

  const arm = box(len, 0.34, 0.5, M.boom, (dir * len) / 2, 0, 0, braco);
  arm.castShadow = true;
  box(0.5, 0.44, 0.6, M.white, dir * (len - 0.25), 0, 0, braco);   // ponteira refletiva
  box(0.9, 0.7, 0.7, M.cabinetDark, -dir * 0.7, -0.1, 0, braco);   // contrapeso atrás da dobradiça

  // saia pendente (barras verticais sob o braço) — instanciada
  const bars = Math.max(3, Math.round(len / 1.2));
  instanced(new THREE.BoxGeometry(0.05, 0.7, 0.16), M.red, bars, (i, m) => {
    const t = (i + 0.5) / bars;
    m.makeTranslation(dir * (0.8 + t * (len - 1.4)), -0.5, 0);
  }, braco);

  // --- poste de descanso na ponta (onde o braço encosta quando fechado) ---
  const restX = dir * (len - 0.1);
  cyl(0.12, 0.16, hingeY - 0.2, M.cabinetDark, restX, (hingeY - 0.2) / 2, 0, g, 8);
  box(0.4, 0.14, 0.5, M.hazard, restX, hingeY - 0.2, 0, g);

  // dica de animação (dados serializáveis; ver cabeçalho)
  g.userData.anim = { part: 'braco', axis: 'z', closed: 0, open: dir * (Math.PI / 2) * 0.92 };

  return g;
}

export { makeGate };
