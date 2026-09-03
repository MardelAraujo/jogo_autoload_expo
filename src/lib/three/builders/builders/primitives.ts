import * as THREE from "three";

/**
 * Caixa com sombra habilitada, adicionada ao grupo `g` informado.
 * (No código original havia um fallback pra adicionar direto na `scene`
 * quando `g` não era passado, mas nenhum builder realmente usa esse
 * fallback — todo call-site sempre passa um grupo explícito. Removido
 * aqui de propósito pra evitar um import circular entre este módulo e
 * core/scene.js; se algum dia precisar do fallback, passe a `scene`
 * explicitamente como grupo, como o backdrop já faz.)
 */
function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  g?: THREE.Object3D
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (g) g.add(m);
  return m;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  g?: THREE.Object3D,
  seg?: number
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (g) g.add(m);
  return m;
}

/**
 * Repete a mesma peça `count` vezes como um único InstancedMesh (uma draw
 * call em vez de `count` objetos). `place(i, m)` recebe a matriz de cada
 * cópia pra posicioná-la — normalmente `m.makeTranslation(...)`.
 *
 * Existe porque as peças pequenas e repetidas (parafusos de cinta, postes de
 * guarda-corpo, dormentes) dominavam a contagem de malhas: um tanque sozinho
 * passava de 160 objetos, quase todos parafuso. Visual idêntico, custo de
 * cena muito menor — importa porque a cena instancia 8 tanques de uma vez
 * (ver builders/tank-farm.js).
 */
function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  count: number,
  place: (i: number, m: THREE.Matrix4) => void,
  g?: THREE.Object3D
) {
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.castShadow = true;
  im.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.identity();
    place(i, m);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  if (g) g.add(im);
  return im;
}

export { box, cyl, instanced };
