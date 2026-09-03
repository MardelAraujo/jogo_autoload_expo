import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Tubulação de processo. Duas coisas moram aqui, usadas tanto soltas na cena
 * quanto montadas pelo parque de tanques (builders/tank-farm.js):
 *
 * - `makePipes()` — o rack (pipe rack) sobre cavaletes de aço, o corredor de
 *   dutos vermelhos que corta a planta;
 * - `pipeRun`/`elbow`/`valve` — primitivas de duto reutilizáveis, pra montar
 *   o interligamento entre tanques.
 *
 * Convenção: `axis` é 'x' ou 'z', o eixo ao longo do qual o duto corre.
 * CylinderGeometry nasce em pé (eixo y), então cada trecho é girado 90° no
 * eixo que sobra — z pra deitar em x, x pra deitar em z.
 */

/** Trecho reto de duto, com flange de emenda em cada ponta. */
function pipeRun(
  len: number,
  r: number,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  axis: "x" | "z",
  g: THREE.Object3D,
  flanges?: boolean
) {
  const p = cyl(r, r, len, mat, x, y, z, g, 14);
  p.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2;
  if (flanges !== false) {
    [-1, 1].forEach((s) => {
      const fx = axis === 'x' ? x + (s * len) / 2 : x;
      const fz = axis === 'z' ? z + (s * len) / 2 : z;
      const f = cyl(r * 1.35, r * 1.35, r * 0.5, M.pipeFlange, fx, y, fz, g, 14);
      f.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2;
    });
  }
  return p;
}

/**
 * Curva de 90° (cotovelo). Sem `vertical`, a curva fica deitada no plano
 * horizontal (liga um trecho em x a um em z) e `rot` gira ela nesse plano;
 * com `vertical`, fica em pé, ligando um trecho horizontal a um vertical —
 * é assim que os ramais sobem do header pro costado do tanque.
 */
function elbow(
  bend: number,
  r: number,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  rot: number,
  g: THREE.Object3D,
  vertical?: boolean
) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(bend, r, 8, 14, Math.PI / 2), mat);
  m.position.set(x, y, z);
  if (vertical) m.rotation.set(0, rot, 0);
  else m.rotation.set(Math.PI / 2, 0, rot);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Válvula de bloqueio: corpo, castelo e volante — o que faz ler como tubulação de processo. */
function valve(r: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, axis: "x" | "z", g: THREE.Object3D) {
  const b = cyl(r * 1.5, r * 1.5, r * 1.8, mat, x, y, z, g, 12);
  b.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2;
  cyl(r * 0.35, r * 0.35, r * 2.2, M.steel, x, y + r * 1.6, z, g, 8);
  const hw = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.22, 6, 14), M.red);
  hw.rotation.x = Math.PI / 2;
  hw.position.set(x, y + r * 2.6, z);
  hw.castShadow = true;
  g.add(hw);
}

/**
 * Rack de dutos: cavaletes de aço (colunas sobre sapata + travessas +
 * contraventamento) carregando dois níveis de dutos vermelhos, correndo
 * ao longo de z.
 */
function makePipes(len?: number) {
  const g = new THREE.Group();
  const LEN = len || 150;
  const SPAN = 12;              // vão entre cavaletes
  const bays = Math.round(LEN / SPAN);
  const halfW = 3.1;
  const lvl = [4.3, 6.5];       // altura dos dois níveis de duto

  for (let i = 0; i <= bays; i++) {
    const z = -LEN / 2 + i * SPAN;
    [-halfW, halfW].forEach((x) => {
      cyl(0.26, 0.3, lvl[1] + 0.8, M.steel, x, (lvl[1] + 0.8) / 2, z, g, 8);
      box(1.1, 0.3, 1.1, M.concrete, x, 0.15, z, g);
    });
    lvl.forEach((y) => box(halfW * 2 + 0.6, 0.34, 0.34, M.steel, 0, y - 0.42, z, g));
    // contraventamento em vãos alternados, pra não virar um pente uniforme
    if (i % 2 === 0) {
      const br = box(0.2, 0.2, Math.hypot(halfW * 2, lvl[1] - lvl[0]), M.steel, 0, (lvl[0] + lvl[1]) / 2 - 0.4, z, g);
      br.rotation.y = Math.PI / 2;
      br.rotation.x = Math.atan2(lvl[1] - lvl[0], halfW * 2);
    }
  }

  // dutos: 4 embaixo, 3 em cima — bitolas diferentes, como num rack real
  [
    { y: lvl[0], xs: [-2.3, -0.8, 0.8, 2.3], r: 0.55 },
    { y: lvl[1], xs: [-1.7, 0, 1.7], r: 0.42 },
  ].forEach(({ y, xs, r }) => {
    xs.forEach((x) => {
      const p = cyl(r, r, LEN, M.pipeRed, x, y, 0, g, 12);
      p.rotation.x = Math.PI / 2;
      // sapatas de apoio sobre cada travessa
      instanced(new THREE.BoxGeometry(r * 1.8, 0.22, 0.5), M.dark, bays + 1, (i, m) => {
        m.makeTranslation(x, y - r - 0.11, -LEN / 2 + i * SPAN);
      }, g);
    });
  });

  return g;
}

export { pipeRun, elbow, valve, makePipes };
