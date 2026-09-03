import * as THREE from "three";
import { makeCar } from "./car";

export function makeCars() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = makeCar();
    c.position.set(i * 3.2, 0, 0);
    g.add(c);
  }
  return g;
}
