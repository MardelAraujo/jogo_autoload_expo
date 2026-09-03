import * as THREE from "three";
import { M } from "../core/materials";

/**
 * Sistema de pista genérico multi-instância (curva por pontos). Cada pista
 * guarda seus próprios pontos/largura/aberta-ou-fechada em
 * `g.userData.pista = {points:[[x,z],...], closed:bool, width:n}`.
 */

export function ribbonPts(
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  offset: number,
  y: number,
  mat: THREE.Material,
  dashed: boolean,
  closed?: boolean,
  uvRepeat?: number
) {
  const N = 160;
  const pos: number[] = [];
  const idx: number[] = [];
  const uvs: number[] = [];
  const curveLen = uvRepeat ? curve.getLength() : 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const nx = -tan.z;
    const nz = tan.x;
    pos.push(
      p.x + nx * (offset - width / 2), y, p.z + nz * (offset - width / 2),
      p.x + nx * (offset + width / 2), y, p.z + nz * (offset + width / 2),
    );
    const u = uvRepeat ? (t * curveLen) / uvRepeat : t;
    uvs.push(u, 0, u, 1);
  }
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    if (dashed && i % 18 > 4) continue;
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}

/** Reconstrói toda a geometria de uma pista a partir de `g.userData.pista`. */
export function rebuildPista(g: THREE.Object3D) {
  const built = g.userData.built || (g.userData.built = []);
  built.forEach((m: THREE.Mesh) => {
    g.remove(m);
    if (m.geometry) m.geometry.dispose();
  });
  g.userData.built = [];

  const pd = g.userData.pista;
  const pts: number[][] = pd.points;
  if (pts.length < 2 || (pd.closed && pts.length < 3)) return;

  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), pd.closed, 'centripetal', 0.5);
  const add = (m: THREE.Mesh) => {
    g.userData.built.push(m);
    g.add(m);
    return m;
  };
  const W = pd.width;
  const roadY = 0.12;

  // asfalto liso em cinza escuro (M.road), plano e sem meio-fio — e apenas o
  // tracejado central espaçado como marcação; sem faixas laterais.
  add(ribbonPts(curve, W, 0, roadY, M.road, false, pd.closed));
  add(ribbonPts(curve, 0.32, 0, 0.2, M.line, true, pd.closed));

  // marcadores início/fim (só em pista aberta)
  if (!pd.closed) {
    const s = pts[0];
    const e = pts[pts.length - 1];
    const capR = W / 2 + 0.1;
    const sM = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.3, 20), M.start);
    sM.position.set(s[0], 0.05, s[1]);
    g.add(sM);
    g.userData.built.push(sM);
    const eM = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.3, 20), M.end);
    eM.position.set(e[0], 0.05, e[1]);
    g.add(eM);
    g.userData.built.push(eM);
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.handle) o.userData.root = g;
  });
}

export function makePistaGroup(points: number[][], closed?: boolean, width?: number) {
  const g = new THREE.Group();
  g.userData.pista = { points: points.map((p) => p.slice()), closed: !!closed, width: width || 11 };
  g.userData.built = [];
  rebuildPista(g);
  return g;
}

export function makePistaDefault() {
  return makePistaGroup([[-14, 0], [14, 0]], false, 11);
}
