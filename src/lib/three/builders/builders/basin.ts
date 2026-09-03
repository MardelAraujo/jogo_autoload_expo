import * as THREE from "three";
import { M } from "../core/materials";
import { box } from "./primitives";

export function makeBasin() {
  const g = new THREE.Group();
  box(70, 1.4, 78, M.basin, 0, 0.7, 0, g);
  return g;
}
