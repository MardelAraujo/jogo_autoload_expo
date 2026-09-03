import * as THREE from "three";
import { M } from "../core/materials";
import { box } from "./primitives";

function makeBooth() {
  const g = new THREE.Group();
  box(6.5, 5, 6.5, M.white, 0, 2.5, 0, g);
  box(4.4, 2.2, 0.3, M.glass, 0, 3.3, 3.3, g);
  box(7.4, 0.7, 7.4, M.steel, 0, 5.3, 0, g);
  return g;
}

export { makeBooth };
