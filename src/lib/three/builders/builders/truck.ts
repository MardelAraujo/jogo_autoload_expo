import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";

function makeTruck(cabColor?: THREE.Material) {
  cabColor = cabColor || M.steel;
  const g = new THREE.Group();
  box(5, 4.6, 5.5, cabColor, 0, 3.7, 8.4, g);
  box(4.6, 1.7, 1.1, M.glass, 0, 5, 11.1, g);
  box(5.4, 1.4, 6.6, M.dark, 0, 1.2, 7.6, g);
  [[-2.5, 10], [2.5, 10], [-2.5, 6.4], [2.5, 6.4]].forEach(([x, z]) => {
    const w = cyl(1.1, 1.1, 0.8, M.dark, x, 1.1, z, g);
    w.rotation.z = Math.PI / 2;
  });
  const tk = cyl(2.5, 2.5, 15, M.steel, 0, 4.3, -1.5, g);
  tk.rotation.x = Math.PI / 2;
  box(5.2, 0.8, 15, M.dark, 0, 1.9, -1.5, g);
  [[-2.5, -7], [2.5, -7], [-2.5, -4.4], [2.5, -4.4]].forEach(([x, z]) => {
    const w = cyl(1.1, 1.1, 0.8, M.dark, x, 1.1, z, g);
    w.rotation.z = Math.PI / 2;
  });
  const cap = cyl(2.55, 2.55, 1.2, M.red, 0, 4.3, -9, g);
  cap.rotation.x = Math.PI / 2;
  return g;
}

export { makeTruck };
