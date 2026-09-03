import * as THREE from "three";
import { M } from "../core/materials";
import { LOGO_TANQUE_ASPECTO } from "../core/textures";
import { box, cyl, instanced } from "./primitives";

/** Curva helicoidal (raio/altura/ângulo variam linearmente com t) — base do corrimão da escada. */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  r: number;
  h0: number;
  h1: number;
  a0: number;
  a1: number;

  constructor(r: number, h0: number, h1: number, a0: number, a1: number) {
    super();
    this.r = r;
    this.h0 = h0;
    this.h1 = h1;
    this.a0 = a0;
    this.a1 = a1;
  }

  getPoint(t: number, target?: THREE.Vector3) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    const h = this.h0 + (this.h1 - this.h0) * t;
    const p = target || new THREE.Vector3();
    return p.set(Math.cos(a) * this.r, h, Math.sin(a) * this.r);
  }
}

/** Rampa helicoidal (piso da escada) — mesma técnica de extrusão da pista, mas subindo em espiral. */
function helixRibbon(
  rIn: number,
  rOut: number,
  h0: number,
  h1: number,
  a0: number,
  a1: number,
  mat: THREE.Material | THREE.Material[],
  group: THREE.Object3D,
  vRepeat?: number
) {
  const N = 90;
  const pos: number[] = [];
  const idx: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + (a1 - a0) * t;
    const h = h0 + (h1 - h0) * t;
    pos.push(Math.cos(a) * rIn, h, Math.sin(a) * rIn, Math.cos(a) * rOut, h, Math.sin(a) * rOut);
    const v = vRepeat ? t * vRepeat : t;
    uvs.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function addSpiralStair(g: THREE.Object3D, tankR: number, h0: number, h1: number, turns: number, startAngle: number) {
  const width = 1.6;
  const a0 = startAngle;
  const a1 = startAngle + turns * Math.PI * 2;
  const rIn = tankR + 0.35;
  const rOut = rIn + width;
  const railLift = 2.5;

  helixRibbon(rIn, rOut, h0, h1, a0, a1, M.treadTex, g, 16);

  const railCurve = new HelixCurve(rOut, h0 + railLift, h1 + railLift, a0, a1);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 60, 0.13, 6, false), M.tankTrim));

  const posts = 10;
  instanced(new THREE.CylinderGeometry(0.06, 0.06, railLift, 5), M.dark, posts + 1, (i, m) => {
    const t = i / posts;
    const a = a0 + (a1 - a0) * t;
    const h = h0 + (h1 - h0) * t;
    m.makeTranslation(Math.cos(a) * rOut, h + railLift / 2, Math.sin(a) * rOut);
  }, g);

  const struts = 7;
  for (let i = 0; i <= struts; i++) {
    const t = i / struts;
    const a = a0 + (a1 - a0) * t;
    const h = h0 + (h1 - h0) * t;
    const strut = box(width * 0.75, 0.16, 0.16, M.dark, Math.cos(a) * (rIn + width * 0.3), h - 0.55, Math.sin(a) * (rIn + width * 0.3), g);
    strut.rotation.y = -a;
    strut.rotation.z = -0.45;
  }
}

/** Sombra de contato suave sob a base — evita a leitura de objeto "flutuando" no chão. */
function addGroundShadow(g: THREE.Object3D, r: number, y: number) {
  const geo = new THREE.CircleGeometry(r, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y;
  g.add(disc);
}

/** Escotilha de inspeção no teto — tampa aparafusada com dobradiça, fora do centro. */
function addRoofHatch(g: THREE.Object3D, roofR: number, roofY: number, roofH: number) {
  const a = 2.1;
  const dist = roofR * 0.45;
  const x = Math.cos(a) * dist;
  const z = Math.sin(a) * dist;
  const y = roofY + roofH * (1 - dist / (roofR + 0.9));
  const rim = cyl(0.62, 0.62, 0.1, M.dark, x, y, z, g, 16);
  rim.rotation.set(0, 0, 0);
  cyl(0.5, 0.5, 0.12, M.steel, x, y + 0.1, z, g, 16);
  box(0.55, 0.05, 0.16, M.dark, x - 0.35, y + 0.13, z, g);
}

/** Cinta aparafusada — fileira de rebites em volta de um anel (instanciada: são dezenas por tanque). */
const BOLT_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6);
function addBoltedRing(g: THREE.Object3D, r: number, y: number, count: number) {
  instanced(BOLT_GEO, M.dark, count, (i, m) => {
    const a = (i / count) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r);
  }, g);
}

/**
 * Geometria do decalque da marca no costado: uma fatia fina de cilindro por
 * fora da chapa (raio + 7 cm), centrada no ângulo 0.
 *
 * Não entra na textura do casco de propósito — o casco repete ~14 vezes em
 * volta do tanque, e um logo desenhado ali sairia carimbado 14 vezes. Assim a
 * marca aparece uma vez por face, acompanhando a curvatura sem esticar.
 *
 * `polygonOffset` no material (ver core/materials.ts) evita o z-fighting com a
 * chapa a 7 cm de distância quando a câmera se afasta e a precisão do depth
 * buffer cai.
 */
function geometriaLogo(R: number) {
  // ~77° de costado. O logotipo da AutoLoad é bem mais largo que alto (801×216
  // na arte), então precisa de mais arco que a marca anterior pra chegar à
  // mesma altura de faixa; 1,35 rad dá 12,9 m de largura e 3,5 m de altura, que
  // ainda cabe com folga no vão de 4,95 m entre as duas cintas do costado.
  const arco = 1.35;
  const raio = R + 0.07;
  // altura derivada da proporção da textura: assim a marca nunca estica, e a
  // faixa continua cabendo no vão entre as duas cintas do costado
  const altura = (arco * raio) / LOGO_TANQUE_ASPECTO;
  return new THREE.CylinderGeometry(raio, raio, altura, 16, 1, true, -arco / 2, arco);
}

/** Tanque de armazenamento — teto cônico, cinta de arremate, escada helicoidal e base escura. */
function makeTank(stairAngle?: number) {
  if (stairAngle === undefined) stairAngle = Math.random() * Math.PI * 2;
  const g = new THREE.Group();
  const R = 9.5;
  const H = 15.5;
  const roofH = 2.6;

  addGroundShadow(g, R + 1.4, 0.02);
  cyl(R + 0.6, R + 0.6, 0.5, M.concrete, 0, 0.25, 0, g, 30);
  cyl(R + 0.15, R + 0.15, 0.9, M.tankBase, 0, 0.7, 0, g, 30);
  cyl(R, R, H, M.tankBody, 0, H / 2 + 0.9, 0, g, 30);
  [0.3, 0.62].forEach((f) => {
    const y = 0.9 + H * f;
    cyl(R + 0.06, R + 0.06, 0.22, M.tankW, 0, y, 0, g, 30);
    addBoltedRing(g, R + 0.09, y, 36);
  });

  const roofY = H + 0.9;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.9, R + 0.35, roofH, 30), M.tankRoofTex);
  roof.position.y = roofY + roofH / 2;
  roof.castShadow = true;
  g.add(roof);
  addRoofHatch(g, R + 0.35, roofY, roofH);

  cyl(R + 0.4, R + 0.4, 0.28, M.tankTrim, 0, roofY + 0.02, 0, g, 30);
  addBoltedRing(g, R + 0.42, roofY + 0.02, 30);

  const roofRail = new THREE.Mesh(new THREE.TorusGeometry(R + 0.15, 0.09, 6, 40), M.dark);
  roofRail.rotation.x = Math.PI / 2;
  roofRail.position.y = roofY + 0.9;
  g.add(roofRail);

  const railPosts = 24;
  instanced(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 5), M.dark, railPosts, (i, m) => {
    const a = (i / railPosts) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * (R + 0.15), roofY + 0.45, Math.sin(a) * (R + 0.15));
  }, g);

  cyl(1.2, 1.2, 0.45, M.steel, 0, roofY + roofH + 0.2, 0, g, 14);

  addSpiralStair(g, R, 1.6, roofY - 0.6, 0.92, stairAngle);

  return g;
}

/** Raio e altura do costado — o decalque da marca é posicionado a partir daqui (ver tank-farm.ts). */
const TANQUE_R = 9.5;
const TANQUE_Y_LOGO = 0.9 + 15.5 * 0.46;

export { HelixCurve, helixRibbon, addSpiralStair, makeTank, geometriaLogo, TANQUE_R, TANQUE_Y_LOGO };
