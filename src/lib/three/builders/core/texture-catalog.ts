import * as THREE from "three";

/**
 * Fotos reais que o editor 3d_plant oferece no seletor "Textura" do painel de
 * propriedades — o valor escolhido chega aqui em `elemento.texture`. Os ids e
 * os `tileMeters` são os mesmos do catálogo de lá (core/texture-catalog.js);
 * os arquivos já estão em public/textures/, os mesmos que aplicarTexturasReais()
 * usa pra pista/bacia/chão.
 */
const TEXTURE_CATALOG = [
  { id: "asphalt", url: "/textures/asphalt.jpg", tileMeters: 20 },
  { id: "asphalt-clean", url: "/textures/asphalt-clean.jpg", tileMeters: 20 },
  { id: "asphalt-worn", url: "/textures/asphalt-worn.jpg", tileMeters: 20 },
  { id: "concrete", url: "/textures/concrete.jpg", tileMeters: 30 },
  { id: "concrete-pavers", url: "/textures/concrete-pavers.jpg", tileMeters: 30 },
  { id: "terrain", url: "/textures/terrain.jpg", tileMeters: 40 },
  { id: "terrain-moss", url: "/textures/terrain-moss.jpg", tileMeters: 40 },
];

// Nenhum objeto repete a foto mais que isso em cada direção, não importa o
// tamanho — são fotos reais (não ruído), então repetição alta faz a mesma
// composição de manchas virar um carimbo óbvio visto de cima.
const MAX_REPEAT = 4;

/**
 * Textura de `id` com `.repeat` proporcional ao footprint em metros do objeto
 * (`sizeX`×`sizeZ`), sempre entre 1 e MAX_REPEAT — o mesmo cálculo do editor,
 * pra uma bacia de 70×78 e um canteiro pequeno ladrilharem igual lá.
 *
 * Cada chamada devolve uma instância própria (o repeat é por objeto), mas a
 * foto não baixa de novo: as mesmas URLs já estão no cache do navegador desde
 * o boot, então custa só um decode.
 */
function loadTiledTexture(id: string, sizeX: number, sizeZ: number): THREE.Texture | null {
  const entry = TEXTURE_CATALOG.find((t) => t.id === id);
  if (!entry) return null;
  const tex = new THREE.TextureLoader().load(entry.url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeat = (size: number) => Math.min(MAX_REPEAT, Math.max(1, size / entry.tileMeters));
  tex.repeat.set(repeat(sizeX), repeat(sizeZ));
  return tex;
}

export { TEXTURE_CATALOG, loadTiledTexture };
