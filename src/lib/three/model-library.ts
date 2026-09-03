import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { M } from "./builders/core/materials";

// ---------------- acervo 3D do editor (biblioteca de modelos) ----------------
// Port de precarregarBiblioteca()/buildLibInstance()/pintarCoresDoTema() do
// autoload_expo3d.html (ver AGENTS.md deste diretório pra contexto). Única
// diferença deliberada em relação à referência: lá os .glb vinham embutidos em
// base64 dentro de LIB[id].b64 e o parse era feito com `loader.parse` a partir
// de bytes decodificados com atob(); aqui os .glb são arquivos reais em
// public/models/, então cada um é carregado por URL com `loader.load` (que já
// faz fetch+parse por baixo). O resto — a ordem de prioridade, o ritmo de um
// modelo por macrotarefa via setTimeout, e o callback de "acervo terminou" —
// é o mesmo.

export interface ModelLibraryEntry {
  name: string;
  cat: string;
  group: string;
  scale: number;
  rotY: number;
  builder: string | null;
  srcSha: string;
}

let LIB: Record<string, ModelLibraryEntry> = {};
const libTemplates: Record<string, THREE.Object3D> = {};

let manifestPromise: Promise<void> | null = null;

/** Busca (e memoiza) o manifest.json — equivalente a `window.MODEL_LIBRARY` na referência. */
async function loadManifest(): Promise<void> {
  if (!manifestPromise) {
    manifestPromise = fetch("/models/manifest.json")
      .then((r) => r.json())
      .then((json: Record<string, ModelLibraryEntry>) => {
        LIB = json;
      });
  }
  return manifestPromise;
}

/**
 * O acervo inteiro, para quem precisa LISTAR modelos e não instanciar um —
 * hoje só o painel "Acervo" do editor de planta. Compartilha a memoização de
 * loadManifest(), então abrir o editor não refaz o fetch que o boot já fez.
 */
export async function carregarManifest(): Promise<Record<string, ModelLibraryEntry>> {
  await loadManifest();
  return LIB;
}

/**
 * Traz um modelo exportado do editor pro pipeline de cor DESTE arquivo. Roda
 * uma vez por modelo (no template, não por instância).
 *
 * São duas conversões, e as duas são exatas — cada uma desfaz um passo que o
 * editor faz e este projeto não:
 *
 * 1. **Cor de volta pra sRGB.** O editor renderiza com saída sRGB, então a
 *    paleta dele roda um `convertSRGBToLinear()` em bloco no import
 *    (core/materials.js) e é esse valor linear que o exportador grava no
 *    baseColorFactor. Aqui o renderer é o legado do r128 (saída linear, sem
 *    tone mapping), igual ao resto da cena — `convertLinearToSRGB()` devolve
 *    exatamente o hex que o designer escreveu.
 * 2. **Textura pra LinearEncoding.** As texturas destes modelos nasceram em
 *    <canvas> (core/textures.js) e viraram WebP na exportação; o GLTFLoader
 *    marca toda baseColorTexture como sRGB. Com saída linear o shader
 *    linearizaria de novo e a listra da cancela sairia escura. LinearEncoding
 *    faz o pixel passar direto, que é como as CanvasTexture do bundle já se
 *    comportam.
 *
 * E uma troca de material: o exportador do r128 não conhece MeshLambertMaterial
 * e grava tudo como PBR **com metalness 0,5** — sob a iluminação simples daqui
 * o concreto sairia com cara de chumbo. Volta pra Lambert, que é o material do
 * resto da planta e ainda custa menos pra sombrear. Os LEDs e telas são exceção:
 * saíram como KHR_materials_unlit e voltam como MeshBasicMaterial sozinhos, que
 * é justamente o que eles são na paleta.
 *
 * As duas coisas têm alcances diferentes, e é por isso que `corDoEditor` existe.
 * O desfazer de cor vale só para quem saiu do editor. A troca de PBR por
 * Lambert vale para o acervo INTEIRO, incluindo os modelos de catálogo: PBR
 * precisa de mapa de ambiente para fechar a conta da luz, e esta cena não tem
 * nenhum. Sem isso, um material com cor escura ficava quase preto — era o que
 * acontecia com as 37 árvores e arbustos de catálogo da planta, que apareciam
 * como manchas pretas ao lado da vegetação clara vinda da paleta. Em peça de
 * cor clara o efeito quase não aparece (daí os caminhões nunca terem
 * denunciado o problema).
 */
function adaptarMateriaisDoEditor(root: THREE.Object3D, corDoEditor: boolean): THREE.Object3D {
  const feitos = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const novos = mats.map((m) => {
      if (feitos.has(m)) return feitos.get(m)!;
      const withColor = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; map?: THREE.Texture | null };
      // O desfazer de cor é só das exportações do editor: o modelo de catálogo
      // já grava no baseColorFactor a cor que o autor escolheu.
      if (corDoEditor) {
        if (withColor.color) withColor.color.convertLinearToSRGB();
        if (withColor.emissive) withColor.emissive.convertLinearToSRGB();
      }
      // A textura, essa vale para todos: o GLTFLoader marca toda
      // baseColorTexture como sRGB, e com saída linear o shader a linearizaria
      // sem re-codificar na saída — o pixel sai cerca de uma gama mais escuro.
      if (withColor.map) {
        withColor.map.encoding = THREE.LinearEncoding;
        withColor.map.needsUpdate = true;
      }
      let novo: THREE.Material = m;
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = m as THREE.MeshStandardMaterial;
        novo = new THREE.MeshLambertMaterial({
          color: std.color,
          map: std.map,
          side: std.side,
          transparent: std.transparent,
          opacity: std.opacity,
          alphaTest: std.alphaTest,
          depthWrite: std.depthWrite,
        });
        std.dispose();
      } else {
        m.needsUpdate = true;
      }
      feitos.set(m, novo);
      return novo;
    });
    mesh.material = Array.isArray(mesh.material) ? novos : novos[0];
  });
  return root;
}

/**
 * O parse dos modelos trava a thread se for tudo de uma vez, então vai um de
 * cada vez, começando no boot — o visitante gasta a tela de cadastro e o
 * montador antes da simulação. Quem ainda não terminou simplesmente não
 * aparece naquele turno: é cenário, não jogo.
 *
 * Vai por setTimeout e NÃO por requestIdleCallback — mesmo motivo da
 * referência: o loop de requestAnimationFrame roda o tempo todo, então o
 * navegador praticamente nunca fica ocioso.
 *
 * `usados` (ids referenciados pelo layout via lib_*, a frota do jogo e os
 * modelos de caminhão escolhíveis) é passado pelo chamador — ao contrário da
 * referência, este módulo não conhece PL/CAMINHOES_ACERVO/MODELOS_CAMINHAO
 * diretamente (eles vivem em scene.ts/constants.ts).
 */
export function preloadLibrary(usedIds: string[], onAllLoaded?: () => void): void {
  loadManifest().then(() => {
    const usados = new Set(usedIds);
    const prio = (id: string) => (LIB[id].builder ? 2 : usados.has(id) ? 1 : 0);
    const ids = Object.keys(LIB).sort((a, b) => prio(b) - prio(a));
    if (!ids.length) {
      acervoTerminou(onAllLoaded);
      return;
    }
    const loader = new GLTFLoader();
    let i = 0;
    const proximo = () => {
      if (i >= ids.length) {
        acervoTerminou(onAllLoaded);
        return;
      }
      const id = ids[i++];
      loader.load(
        "/models/" + id + ".glb",
        (gltf) => {
          // O desfazer de espaço de cor é SÓ para as exportações de builder:
          // os modelos de catálogo (prédios, caminhões, vegetação) vieram de
          // fora do editor, com a cor já no contrato do glTF. A troca de PBR
          // por Lambert, essa vale para todo mundo — ver adaptarMateriaisDoEditor.
          libTemplates[id] = adaptarMateriaisDoEditor(gltf.scene, !!LIB[id].builder);
          agendar();
        },
        undefined,
        (err) => {
          console.warn("Falha ao carregar modelo do acervo", id, err);
          agendar();
        },
      );
    };
    const agendar = () => setTimeout(proximo, 0);
    agendar();
  });
}

/**
 * Remonta a planta uma vez, quando o último modelo do acervo termina de
 * parsear. Na referência chama `rebuildPreview()` direto; aqui o chamador
 * passa o callback (essa função ainda não existe nesta fase do port).
 */
let acervoJaRemontou = false;
function acervoTerminou(onAllLoaded?: () => void): void {
  if (acervoJaRemontou) return;
  acervoJaRemontou = true;
  onAllLoaded?.();
}

/**
 * Instância de um modelo do acervo, com a escala e a rotação de repouso que o
 * meta.json define (mesmo contrato de buildLibraryInstance no editor).
 *
 * `userData.doAcervo` marca a subárvore inteira porque clone(true) COMPARTILHA
 * geometria e material com o template — e disposeSceneContents() varre a cena
 * dando dispose em tudo. Sem a marca, o primeiro turno que terminasse levaria
 * junto a geometria do template e todos os turnos seguintes ficariam sem o
 * modelo. Ver a guarda em disposeSceneContents().
 *
 * Devolve null (e não um grupo vazio) quando o modelo ainda não terminou de
 * parsear ou não existe no acervo, pra quem chama poder cair num substituto
 * procedural em vez de deixar um buraco na cena.
 */
/**
 * Estado de um id no acervo — só pra diagnóstico (ver sim/debug-rota.ts).
 * Distingue os dois motivos de `buildLibInstance` devolver null: o id não
 * existe no manifest, ou existe mas o .glb ainda não terminou de parsear.
 */
export function estadoDoAcervo(assetId: string): "pronto" | "carregando" | "inexistente" {
  if (!LIB[assetId]) return "inexistente";
  return libTemplates[assetId] ? "pronto" : "carregando";
}

export function buildLibInstance(assetId: string): THREE.Group | null {
  const lm = LIB[assetId];
  const tpl = libTemplates[assetId];
  if (!lm || !tpl) return null;
  const g = new THREE.Group();
  const inst = tpl.clone(true);
  inst.scale.setScalar(lm.scale || 1);
  inst.rotation.y = ((lm.rotY || 0) * Math.PI) / 180;
  inst.traverse((o) => {
    o.userData.doAcervo = true;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  if (lm.builder) pintarCoresDoTema(inst);
  g.userData.doAcervo = true;
  // qual modelo é — só o grupo de fora, que é o que vai pra cena. Serve ao
  // diagnóstico de window.__acervo(): "embutido" e "em cena" são perguntas
  // diferentes, e sem isso a segunda não tem como ser respondida.
  g.userData.acervoId = assetId;
  g.add(inst);
  return g;
}

/** Duas cores são "a mesma" com 2/255 de folga — absorve o ida-e-volta sRGB↔linear da exportação. */
function mesmaCor(a: THREE.Color, b: THREE.Color): boolean {
  const tol = 2 / 255;
  return Math.abs(a.r - b.r) < tol && Math.abs(a.g - b.g) < tol && Math.abs(a.b - b.b) < tol;
}

/**
 * Devolve a cor do tema pras superfícies que o exportador gravou com o PADRÃO
 * do editor. Só faz sentido nas exportações de builder, por isso a chamada em
 * buildLibInstance é guardada por `lm.builder`. Ver o cabeçalho longo desta
 * função na referência (autoload_expo3d.html linhas 8746-8789) pro raciocínio
 * completo — casar por cor (e não por nome) porque o exportador não preserva
 * nome de material, e só a `road` porque é o único valor que não colide com o
 * resto da paleta dentro da tolerância de 2/255.
 */
const ROAD_PADRAO_EDITOR = new THREE.Color(0x4a4d52);
export function pintarCoresDoTema(root: THREE.Object3D): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.isMesh ? (mesh.material as THREE.MeshLambertMaterial | undefined) : undefined;
    const c = mat?.color;
    if (c && mesmaCor(c, ROAD_PADRAO_EDITOR)) c.copy((M.road as THREE.MeshLambertMaterial).color);
  });
  return root;
}
