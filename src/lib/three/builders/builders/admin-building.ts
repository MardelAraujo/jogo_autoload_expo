import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";

/** Telhado em duas águas (cumeeira ao longo de x) — painéis inclinados a partir do topo da parede. */
function gableRoof(w: number, d: number, wallH: number, rise: number, overhang: number, mat: THREE.Material, g: THREE.Object3D) {
  const halfDepth = d / 2 + overhang;
  const slopeLen = Math.hypot(halfDepth, rise);
  const theta = Math.atan2(rise, halfDepth);
  const midY = wallH + rise / 2;
  const roofW = w + overhang * 2;

  const p1 = box(roofW, 0.18, slopeLen, mat, 0, midY, halfDepth / 2, g);
  p1.rotation.x = theta;
  const p2 = box(roofW, 0.18, slopeLen, mat, 0, midY, -halfDepth / 2, g);
  p2.rotation.x = -theta;
  box(roofW, 0.22, 0.3, M.dark, 0, wallH + rise + 0.02, 0, g);
}

export function makeAdmin() {
  const g = new THREE.Group();
  const W = 20;
  const D = 9;
  const WALL_H = 4.2;
  const doorX = -W / 2 + 4.5;

  box(W, WALL_H, D, M.tankW, 0, WALL_H / 2, 0, g);
  box(W + 0.1, 0.5, D + 0.1, M.dark, 0, 0.25, 0, g);
  gableRoof(W, D, WALL_H, 2.2, 0.6, M.roofSlate, g);

  box(2, 3, 0.22, M.dark, doorX, 1.5, D / 2 + 0.03, g);
  box(1.6, 2.6, 0.08, M.glass, doorX, 1.4, D / 2 + 0.14, g);
  box(3, 0.5, 0.1, M.dark, doorX, 3.6, D / 2 + 0.06, g);

  [doorX + 5, doorX + 9, doorX + 13].forEach((x) => {
    box(1.6, 1.5, 0.2, M.dark, x, 2.7, D / 2 + 0.03, g);
    box(1.3, 1.2, 0.06, M.glass, x, 2.7, D / 2 + 0.14, g);
  });

  box(4.4, 0.22, 2.4, M.dark, doorX, WALL_H + 0.55, D / 2 + 1.3, g);
  cyl(0.1, 0.1, WALL_H + 0.4, M.dark, doorX - 1.8, (WALL_H + 0.4) / 2, D / 2 + 2.3, g);
  cyl(0.1, 0.1, WALL_H + 0.4, M.dark, doorX + 1.8, (WALL_H + 0.4) / 2, D / 2 + 2.3, g);
  box(4.8, 0.26, 2.6, M.concrete, doorX, 0.13, D / 2 + 1.3, g);

  box(1.3, 1, 0.9, M.steel, W / 2 + 1, 0.5, -D / 2 + 1.4, g);
  return g;
}
