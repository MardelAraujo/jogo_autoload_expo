import * as THREE from "three";
import { M } from "../core/materials";
import { cyl } from "./primitives";

const LEAF_MATS = [M.leafDark, M.leafMid, M.leafLight];

/**
 * Árvore de perímetro (arborização da planta). A copa é feita de três esferas
 * facetadas de tons diferentes, sobrepostas e deslocadas — sai mais orgânica
 * do que uma esfera só, e o baixo número de segmentos deixa as facetas
 * visíveis de propósito, no mesmo registro estilizado do resto da cena.
 *
 * `seed` (0..1) varia altura, largura e inclinação; passe um valor fixo pra
 * ter uma árvore reproduzível, ou deixe sortear.
 */
function makeTree(seed?: number) {
  const s = seed === undefined ? Math.random() : seed;
  const g = new THREE.Group();

  const h = 5.2 + s * 3.4;
  const spread = 2.5 + s * 1.1;

  const trunk = cyl(0.32, 0.55, h, M.trunk, 0, h / 2, 0, g, 7);
  trunk.rotation.y = s * Math.PI;

  // duas raízes/sapata alargando a base
  cyl(0.75, 0.95, 0.5, M.trunk, 0, 0.25, 0, g, 7);

  const blobs: [number, number, number, number][] = [
    [0, h * 0.92, 0, spread],
    [spread * 0.5, h * 0.72, spread * 0.34, spread * 0.78],
    [-spread * 0.42, h * 0.78, -spread * 0.4, spread * 0.7],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const mat = LEAF_MATS[(i + Math.round(s * 2)) % LEAF_MATS.length];
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    m.position.set(x, y, z);
    m.rotation.set(s * 2, s * 4, s * 1.5);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  });

  return g;
}

/** Arbusto baixo — mesma ideia da copa, sem tronco: usado em canteiro. */
function makeShrub(seed?: number) {
  const s = seed === undefined ? Math.random() : seed;
  const g = new THREE.Group();
  const r = 1.1 + s * 0.6;
  const blobs: [number, number, number, number][] = [
    [0, r * 0.8, 0, r],
    [r * 0.7, r * 0.6, r * 0.3, r * 0.7],
  ];
  blobs.forEach(([x, y, z, rr], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 7, 5), LEAF_MATS[(i + Math.round(s * 2)) % LEAF_MATS.length]);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  });
  return g;
}

export { makeTree, makeShrub };
