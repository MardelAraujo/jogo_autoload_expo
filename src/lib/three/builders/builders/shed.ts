import * as THREE from "three";
import { M } from "../core/materials";
import { box } from "./primitives";

export function makeShed() {
  const g = new THREE.Group();
  box(24, 9, 15, M.white, 0, 4.5, 0, g);
  box(25, 1, 16, M.steel, 0, 9.2, 0, g);
  for (let i = 0; i < 4; i++) box(3, 2.6, 0.3, M.glass, -8 + i * 5.3, 4, 7.6, g);
  return g;
}
