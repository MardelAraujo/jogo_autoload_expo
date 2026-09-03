import * as THREE from "three";
import { M } from "../core/materials";
import { box } from "./primitives";

export function makeCar() {
  const g = new THREE.Group();
  box(4.6, 1.5, 2.2, M.white, 0, 1, 0, g);
  box(2.8, 1.2, 2, M.glass, -0.2, 2.1, 0, g);
  return g;
}
