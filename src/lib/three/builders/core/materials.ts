import * as THREE from "three";
import {
  makeAsphaltTexture,
  makeTankBodyTexture,
  makeRoofTexture,
  makeTreadTexture,
  makeRailCarTexture,
  makeSleeperTexture,
  makeBallastTexture,
  makeHazardTexture,
  makeGrassTexture,
  makePadTexture,
  makeCorrugatedTexture,
  makeBoomTexture,
  makeScreenTexture,
  makeChainLinkTexture,
  makeFenceSignTexture,
  makeTankLogoTexture,
} from "./textures";
import { loadTiledTexture } from "./texture-catalog";

/**
 * Cores da planta configuráveis pelo usuário (aba Aparência) — pista, bacia,
 * base e faixa central. Mantidas separadas do resto da paleta (`M.concrete`,
 * `M.ground` etc.) de propósito, pra que trocar uma não acople nas outras.
 */
const SCENE_COLORS: Record<string, number> = {
  road: 0x4a4d52,
  basin: 0xbfc3c8,
  base: 0xaeb3b8,
  laneMarking: 0xf2f2f2,
};

/** Paleta de materiais compartilhada por todos os builders. */
const M: Record<string, THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null }> = {
  ground: new THREE.MeshLambertMaterial({ color: 0xb0b0b6 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0xbdbdc2 }),
  road: new THREE.MeshLambertMaterial({ color: SCENE_COLORS.road }),
  basin: new THREE.MeshLambertMaterial({ color: SCENE_COLORS.basin }),
  base: new THREE.MeshLambertMaterial({ color: SCENE_COLORS.base }),
  white: new THREE.MeshLambertMaterial({ color: 0xececed }),
  tankW: new THREE.MeshLambertMaterial({ color: 0xe4e1d5 }),
  tankBase: new THREE.MeshLambertMaterial({ color: 0x332f29 }),
  tankTrim: new THREE.MeshLambertMaterial({ color: 0xc9a13a }),
  red: new THREE.MeshLambertMaterial({ color: 0xc0392b }),
  darkred: new THREE.MeshLambertMaterial({ color: 0x8f2a1e }),
  steel: new THREE.MeshLambertMaterial({ color: 0xcdcdd3 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x3c3c44 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x7fa6bd }),
  water: new THREE.MeshLambertMaterial({ color: 0x35688f }),
  line: new THREE.MeshBasicMaterial({ color: SCENE_COLORS.laneMarking }),
  start: new THREE.MeshBasicMaterial({ color: 0x1fa860 }),
  end: new THREE.MeshBasicMaterial({ color: 0xc0392b }),
  roofSlate: new THREE.MeshLambertMaterial({ color: 0x8b929c }),
  // estrutura da plataforma de carregamento: perfis pintados, guarda-corpo
  // amarelo (norma de segurança) e piso de grade escuro
  beam: new THREE.MeshLambertMaterial({ color: 0x8d949d }),
  handrail: new THREE.MeshLambertMaterial({ color: 0xdca726 }),
  grate: new THREE.MeshLambertMaterial({ color: 0x4a4f57 }),
  shipHull: new THREE.MeshLambertMaterial({ color: 0xb8402a }),
  shipHullDark: new THREE.MeshLambertMaterial({ color: 0x1b2530 }),
  shipDeck: new THREE.MeshLambertMaterial({ color: 0x6b5744 }),
  railHead: new THREE.MeshLambertMaterial({ color: 0xc4cad2 }),
  railWeb: new THREE.MeshLambertMaterial({ color: 0x6d5e50 }),
  carFrame: new THREE.MeshLambertMaterial({ color: 0x2b2f35 }),
  locoBody: new THREE.MeshLambertMaterial({ color: 0x39404a }),
  locoAccent: new THREE.MeshLambertMaterial({ color: 0xefb316 }),
  pipeRed: new THREE.MeshLambertMaterial({ color: 0xc8392c }),
  pipeFlange: new THREE.MeshLambertMaterial({ color: 0x9c3026 }),
  valveBody: new THREE.MeshLambertMaterial({ color: 0x2f5f8a }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b503a }),
  leafDark: new THREE.MeshLambertMaterial({ color: 0x3f6b2c }),
  leafMid: new THREE.MeshLambertMaterial({ color: 0x4f8235 }),
  leafLight: new THREE.MeshLambertMaterial({ color: 0x639b3f }),
  cabinet: new THREE.MeshLambertMaterial({ color: 0xd9d9dd }),
  cabinetDark: new THREE.MeshLambertMaterial({ color: 0x35383e }),
  // Azul da marca AutoLoad, o mesmo medido na arte do logotipo. Serve de fio
  // condutor entre as construções de apoio (cabine de vistoria, truck center):
  // uma faixa fina sob o rufo, igual em todas, é o que faz peças de tamanhos
  // muito diferentes lerem como um conjunto.
  brand: new THREE.MeshLambertMaterial({ color: 0x68b6c9 }),
  // MeshBasic (não recebe sombra/luz) pros elementos "acesos": tela, farol,
  // sinaleira — devem brilhar mesmo no lado de sombra
  ledGreen: new THREE.MeshBasicMaterial({ color: 0x27c07a }),
  ledRed: new THREE.MeshBasicMaterial({ color: 0xe23b3b }),
  ledAmber: new THREE.MeshBasicMaterial({ color: 0xf3a712 }),
};

// Asfalto do PÁTIO (piso do truck center e piso sob a marcação de vagas).
// A cor não é decorativa: ela MULTIPLICA a foto `asphalt-worn`, cuja média é
// RGB(89,80,70) — uma foto quente, que sem correção deixava o pátio bege claro
// em vez de asfalto. O alvo é o cinza levemente esverdeado da referência de
// arte, RGB(42,45,39); medindo o pátio renderizado com cor branca em
// RGB(138,122,104), o multiplicador por canal é 0,304/0,369/0,375 — daí o
// tom frio deste hex, que é o que neutraliza o calor da foto.
// Valor CRU, sem convertSRGBToLinear() (ver o comentário de corDoElemento em
// scene.ts). Calibrado para a foto; no fallback procedural, mais escuro que
// ela, o pátio fica mais fechado do que o pretendido.
M.roadTex = new THREE.MeshLambertMaterial({ color: 0x4e5e60, map: makeAsphaltTexture() });
M.tankBody = new THREE.MeshLambertMaterial({ map: makeTankBodyTexture() });
M.tankRoofTex = new THREE.MeshLambertMaterial({ map: makeRoofTexture() });
M.treadTex = new THREE.MeshLambertMaterial({ map: makeTreadTexture() });
M.carBody = new THREE.MeshLambertMaterial({ map: makeRailCarTexture() });
M.sleeper = new THREE.MeshLambertMaterial({ map: makeSleeperTexture() });
M.ballast = new THREE.MeshLambertMaterial({ map: makeBallastTexture() });
// o leito é muito mais comprido que largo — sem repetir, a brita vira borrão
(M.ballast.map as THREE.Texture).repeat.set(3, 100);
M.hazard = new THREE.MeshLambertMaterial({ map: makeHazardTexture() });
(M.hazard.map as THREE.Texture).repeat.set(8, 1);
M.grass = new THREE.MeshLambertMaterial({ map: makeGrassTexture() });
(M.grass.map as THREE.Texture).repeat.set(10, 10);
M.pad = new THREE.MeshLambertMaterial({ map: makePadTexture() });
(M.pad.map as THREE.Texture).repeat.set(8, 6);
// telha da cobertura: repetição alta em X (onda ~0,4 m no pano de 42 m) e
// baixa em Z, senão a onda vira listra grossa e o telhado parece xadrez
M.corrugated = new THREE.MeshLambertMaterial({ map: makeCorrugatedTexture() });
(M.corrugated.map as THREE.Texture).repeat.set(13, 2);
M.boom = new THREE.MeshLambertMaterial({ map: makeBoomTexture() });
(M.boom.map as THREE.Texture).repeat.set(6, 1); // chevrons ao longo do braço
M.screen = new THREE.MeshBasicMaterial({ map: makeScreenTexture() });

// --- cerca do perímetro (builders/fence.ts) ---
// O pano de alambrado é um plano com a MESMA textura como `map` e `alphaMap`:
// o desenho já é transparente entre os arames, e o alphaMap faz o recorte do
// vão. `depthWrite` fica LIGADO (o normal para material transparente seria
// desligar) porque os painéis vêm em fila e, sem escrever profundidade, um
// pano piscava por cima do outro conforme a câmera girava.
M.chainLink = new THREE.MeshLambertMaterial({
  map: makeChainLinkTexture(),
  alphaMap: makeChainLinkTexture(),
  transparent: true,
  // corte baixo, não binário: `alphaTest` alto (0,42, a primeira tentativa)
  // apagava o pano inteiro assim que a mipmap entrava, porque a média do alfa
  // de um bloco de tela é muito menor que a do arame sozinho. Com 0,08 o corte
  // só descarta o vão entre os arames e o resto ainda mistura — que é como
  // alambrado se comporta de longe mesmo: vira um véu, não some.
  alphaTest: 0.08,
  side: THREE.DoubleSide,
  depthWrite: true,
});
// O pano tem sempre 40 × 2,9 m (builders/fence.ts) — com o repeat fixo aqui,
// todos os painéis dividem o MESMO par de texturas, em vez de cada painel
// clonar as suas só pra mudar o `repeat`.
{
  const LOSANGO = 2.4; // metros por bloco de 4 losangos da textura → 60 cm cada
  [M.chainLink.map, (M.chainLink as THREE.MeshLambertMaterial).alphaMap].forEach((t) => {
    if (t) t.repeat.set(40 / LOSANGO, 2.9 / LOSANGO);
  });
  M.chainLink.color = new THREE.Color(0xcfd6de);
}
M.fenceSign = new THREE.MeshBasicMaterial({ map: makeFenceSignTexture() });
// Decalque da marca no costado do tanque — ver makeTankLogoTexture().
M.tankLogo = new THREE.MeshLambertMaterial({
  map: makeTankLogoTexture(),
  transparent: true,
  // Corte baixo de propósito: com 0,35 a palavra "autoload", de traço fino,
  // era descartada inteira assim que a mipmap entrava, e sobrava só o símbolo.
  // Com 0,12 o traço desbota suavemente em vez de sumir de um quadro pro outro.
  alphaTest: 0.12,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
M.galv = new THREE.MeshLambertMaterial({ color: 0x9fa8b2 });
M.galvDark = new THREE.MeshLambertMaterial({ color: 0x6d757f });
M.plinth = new THREE.MeshLambertMaterial({ color: 0x9d9d9f });

/** Material Three.js dono de cada cor configurável (usado por setSceneColor/applyTheme). */
const SCENE_COLOR_MATERIALS: Record<string, THREE.Material & { color: THREE.Color }> = {
  road: M.road as THREE.Material & { color: THREE.Color },
  basin: M.basin as THREE.Material & { color: THREE.Color },
  base: M.base as THREE.Material & { color: THREE.Color },
  laneMarking: M.line as THREE.Material & { color: THREE.Color },
};

/** Troca ao vivo a cor de `key` (road/basin/base/laneMarking) — materiais são referências compartilhadas, então nenhum rebuild é necessário. */
function setSceneColor(key: string, hex: number | string) {
  const mat = SCENE_COLOR_MATERIALS[key];
  if (!mat) return;
  mat.color.set(hex);
  SCENE_COLORS[key] = typeof hex === "string" ? mat.color.getHex() : hex;
}

/** Aplica um objeto {road,basin,base,laneMarking} de uma vez (usado ao restaurar layout salvo). */
function applyTheme(colors?: Record<string, number | string | null | undefined>) {
  if (!colors) return;
  Object.keys(SCENE_COLOR_MATERIALS).forEach((key) => {
    if (colors[key] != null) setSceneColor(key, colors[key]!);
  });
}

/** Converte um hex numérico (0xrrggbb) pro formato aceito por <input type=color>. */
function hexToCss(hex: number) {
  return "#" + (hex >>> 0).toString(16).padStart(6, "0");
}

/** Cor "representativa" de um grupo — cor do primeiro material com `.color` encontrado nos meshes filhos. */
function getGroupColor(g: THREE.Object3D) {
  let hex: number | null = null;
  g.traverse((o) => {
    if (hex != null || !(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mat = Array.isArray(mesh.material)
      ? mesh.material.find((m) => (m as THREE.MeshLambertMaterial).color)
      : mesh.material;
    const withColor = mat as THREE.MeshLambertMaterial | undefined;
    if (withColor && withColor.color) hex = withColor.color.getHex();
  });
  return hex;
}

/**
 * Recolore um grupo inteiro pra uma cor sólida — usado pelo color picker
 * individual do painel de propriedades. Materiais de builders vêm
 * compartilhados (paleta `M`), então na 1ª chamada cada material do grupo é
 * clonado (fica exclusivo dessa instância); chamadas seguintes só mutam a
 * cor já clonada. `userData.colorCloned` marca esse estado — duplicate.js
 * reseta a flag pra forçar um novo clone quando um elemento colorido é copiado.
 */
function setGroupColor(g: THREE.Object3D & { userData: Record<string, unknown> }, hex: number | string) {
  const owned = !!g.userData.colorCloned;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const apply = (mat: THREE.Material) => {
      const withColor = mat as THREE.MeshLambertMaterial;
      if (!withColor.color) return mat;
      const m = owned ? withColor : (withColor.clone() as THREE.MeshLambertMaterial);
      m.color.set(hex);
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
  });
  g.userData.colorCloned = true;
  g.userData.colorOverride = new THREE.Color(hex).getHex();
}

/**
 * Aplica (ou remove, com `textureId` falsy) uma foto do catálogo a um grupo
 * inteiro — é o seletor "Textura" do painel de propriedades do editor, que
 * chega no layout como `elemento.texture`. Mesma posse de material do
 * setGroupColor (flag `colorCloned` compartilhada), porque os builders
 * entregam materiais da paleta `M`, compartilhados entre todos os elementos.
 *
 * O `.repeat` sai do bounding box de CADA mesh (em espaço de mundo, já com a
 * escala do grupo), não de um valor fixo — assim o ladrilho fica proporcional
 * tanto numa bacia de 70×78 quanto numa peça pequena. A cor vai a branco
 * junto: a foto já traz a cor real e, sem isso, continuaria multiplicada pela
 * cor sólida herdada da paleta.
 */
function setGroupTexture(g: THREE.Object3D & { userData: Record<string, unknown> }, textureId: string | null) {
  const owned = !!g.userData.colorCloned;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const apply = (mat: THREE.Material) => {
      const src = mat as THREE.MeshLambertMaterial;
      const m = owned ? src : (src.clone() as THREE.MeshLambertMaterial);
      if (!textureId) {
        m.map = null;
        const semRelevo = m as THREE.MeshLambertMaterial & { bumpMap?: THREE.Texture | null };
        if ("bumpMap" in semRelevo) semRelevo.bumpMap = null;
      } else {
        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        m.map = loadTiledTexture(textureId, Math.max(size.x, 0.1), Math.max(size.z, 0.1));
        if (m.color) m.color.set(0xffffff);
        // a foto também vira relevo; sem isso o bump herdado da paleta
        // continuaria apontando pra textura ANTIGA, com outro repeat
        const comRelevo = m as THREE.MeshLambertMaterial & { bumpMap?: THREE.Texture | null; bumpScale?: number };
        if ("bumpMap" in comRelevo) {
          comRelevo.bumpMap = m.map;
          comRelevo.bumpScale = 0.3;
        }
      }
      m.needsUpdate = true;
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
  });
  g.userData.colorCloned = true;
  g.userData.textureOverride = textureId || null;
}

/**
 * Translucidez de um grupo inteiro — o slider do painel de propriedades do
 * editor, que chega no layout como `elemento.alpha`. 1 = sólido, 0 = invisível.
 * Mesma posse de material do setGroupColor.
 */
function setGroupOpacity(g: THREE.Object3D & { userData: Record<string, unknown> }, alpha: number) {
  const owned = !!g.userData.colorCloned;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const apply = (mat: THREE.Material) => {
      const m = owned ? mat : mat.clone();
      m.transparent = alpha < 1;
      m.opacity = alpha;
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
  });
  g.userData.colorCloned = true;
  g.userData.opacity = alpha;
}

export { SCENE_COLORS, M, setSceneColor, applyTheme, hexToCss, getGroupColor, setGroupColor, setGroupTexture, setGroupOpacity };
