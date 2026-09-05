import * as THREE from "three";
import { M } from "./builders/core/materials";
import { configurarPosProcesso } from "./pos-processo";

// split-screen renderiza a cena inteira 2x por frame (manual + autoload), cada
// uma com sua própria luz de sombra — o `devicePixelRatio` fica travado em 1
// aqui, mais conservador que num app de tela única (era a principal causa do
// travamento num touch kiosk sem GPU dedicada).
let renderer: THREE.WebGLRenderer | null = null;
let msaaLigado = false;

/**
 * O rasterizador é software? Lê o nome real da GPU pela extensão
 * WEBGL_debug_renderer_info num contexto descartável, ANTES de criar o
 * renderer de verdade — `antialias` é flag de criação de contexto WebGL e não
 * dá pra ligar ou desligar depois.
 *
 * Sem GPU, o Chrome cai no SwiftShader (e o Windows, no "Basic Render
 * Driver"); aí cada amostra extra do MSAA é trabalho de CPU pura e o custo é
 * literalmente 4x na rasterização. É exatamente a máquina do kiosk em que o
 * antialias tinha sido desligado. Com GPU, o MSAA resolve nas unidades de
 * ROP e sai quase de graça.
 *
 * Se o navegador esconder o nome (alguns escondem por privacidade), assume
 * hardware: o falso positivo caro é desligar o antialias numa máquina boa,
 * não o contrário — quem estiver sem GPU e sentir queda tem o `?aa=0`.
 */
function rasterizadorDeSoftware(): boolean {
  try {
    const sonda = document.createElement("canvas").getContext("webgl");
    if (!sonda) return true;
    const ext = sonda.getExtension("WEBGL_debug_renderer_info");
    const nome = ext ? String(sonda.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    sonda.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softwarerasterizer|basic render|software adapter/i.test(nome);
  } catch {
    return false;
  }
}

/**
 * Qual antisserrilhado usar.
 *
 * - `"msaa"` — o `antialias: true` do próprio contexto WebGL. É o padrão: numa
 *   cena feita de geometria fina e clara (guarda-corpos, montantes, tubulação,
 *   faixa de pista) ele é o único que suaviza a borda SEM borrar o que está
 *   dentro dela. Comparado lado a lado com o FXAA na mesma câmera, o corrimão
 *   amarelo da plataforma continua legível com MSAA e vira um borrão com FXAA.
 * - `"fxaa"` — filtro de pós-processo (ver pos-processo.ts). Reserva, não
 *   segunda opção estética: entra sozinho quando o driver aceita a flag de
 *   contexto mas devolve 1 amostra só, coisa que acontece em GPU integrada
 *   antiga. Custa uma passada de tela cheia, independente de quantas cenas o
 *   quadro empilhou — o que é uma vantagem real no split-screen da simulação,
 *   que desenha o terminal duas vezes por quadro.
 * - `"nenhum"` — o comportamento anterior.
 *
 * Sobre custo: tentei medir os três nesta máquina (Intel UHD 630, 1600×900) e
 * NÃO consegui separar as diferenças do ruído — a variação entre repetições do
 * mesmo modo (54 a 77 ms) foi maior que a variação entre modos. Então a
 * escolha aqui é por qualidade, não por medição. O que sobrou de proteção é o
 * que dá pra afirmar com segurança: sem GPU nenhuma, nada de antisserrilhado.
 *
 * `?aa=0|msaa|fxaa` força a mão. O app não tem rotas, mas a query continua
 * valendo na única página — dá pra fixar o modo no atalho do kiosk sem
 * recompilar nada.
 */
type ModoAA = "fxaa" | "msaa" | "nenhum";
function modoPedido(): ModoAA {
  const forcado = new URLSearchParams(window.location.search).get("aa");
  if (forcado === "0" || forcado === "nenhum") return "nenhum";
  if (forcado === "msaa" || forcado === "1") return "msaa";
  if (forcado === "fxaa") return "fxaa";
  return rasterizadorDeSoftware() ? "nenhum" : "msaa";
}

let modo: ModoAA = "nenhum";

/** Singleton idempotente — React (Strict Mode) pode remontar o efeito dono do canvas, mas o renderer só é criado uma vez. */
export function getRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  if (renderer) return renderer;
  modo = modoPedido();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: modo === "msaa", powerPreference: "high-performance" });

  // Pedir MSAA não é receber MSAA: a flag é um pedido, e há driver que a
  // aceita e entrega uma amostra só. Quando isso acontece o jogo ficaria sem
  // antisserrilhado nenhum e sem aviso, então cai no FXAA, que não depende do
  // contexto. É por isso que o caminho de pós-processo existe.
  if (modo === "msaa" && amostrasDoContexto(renderer) < 2) modo = "fxaa";
  msaaLigado = modo === "msaa";

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  configurarPosProcesso(modo === "fxaa");
  aplicarAlphaToCoverage();
  // Uma linha no console dizendo o que entrou. No stand, quando alguém
  // reclamar de serrilhado ou de travamento, esta é a diferença entre saber e
  // adivinhar em qual dos três caminhos a máquina caiu.
  console.info(`[3d] antisserrilhado: ${modo}${msaaLigado ? ` (${amostrasDoContexto(renderer)}x)` : ""}`);
  return renderer;
}

function amostrasDoContexto(r: THREE.WebGLRenderer): number {
  try {
    const gl = r.getContext();
    return gl.getParameter(gl.SAMPLES) as number;
  } catch {
    return 0;
  }
}



/**
 * Materiais recortados por `alphaTest` — a tela da cerca e o decalque da marca
 * no tanque — não ganham nada com MSAA sozinho: o recorte acontece DENTRO do
 * fragment shader, com `discard`, e o resultado é binário por pixel, não por
 * amostra. `alphaToCoverage` transforma o alfa em máscara de cobertura das
 * amostras do MSAA, e aí a borda do losango do alambrado suaviza junto com o
 * resto da cena. Sem MSAA a flag não tem efeito nenhum (há uma amostra só),
 * então fica atrelada a `msaaLigado`.
 */
function aplicarAlphaToCoverage() {
  ([M.chainLink, M.tankLogo] as (THREE.Material | undefined)[]).forEach((mat) => {
    if (!mat) return;
    mat.alphaToCoverage = msaaLigado;
    mat.needsUpdate = true;
  });
}



/** O renderer já criado, ou null antes do primeiro mount do SceneCanvas. O editor precisa do `domElement` para instalar os próprios controles no mesmo canvas. */
export function rendererAtual(): THREE.WebGLRenderer | null {
  return renderer;
}

// ---------------- limpeza de cena (evita vazamento de memória de GPU) ----------------
// `M` (paleta de materiais do 3d_plant, ver core/materials.ts) é COMPARTILHADA
// por todo mundo — preview, lado manual e lado autoload usam os mesmos
// objetos de material/textura. Nunca dar dispose() nelas, ou o próximo render
// do outro lado fica sem material. Geometrias, ao contrário, são sempre
// criadas do zero a cada buildTerminal() — sempre seguro dispor. Sprites de
// texto (labels de área, badges "AUTO") também criam canvas+textura únicos a
// cada chamada de makeLabel() e NUNCA eram liberados: rodando o dia inteiro
// num kiosk, cada visitante que jogava um turno completo (2 cenas com
// tancagem, portaria, caminhões etc.) deixava a cena anterior presa na
// memória pra sempre — essa é a causa mais provável do "travando muito" ao
// longo do dia (efeito cumulativo, não visível num teste curto).
const SHARED_MATS = new Set(Object.values(M));

export function disposeSceneContents(scene: THREE.Scene | null | undefined) {
  if (!scene) return;
  scene.traverse((o) => {
    const sprite = o as THREE.Sprite;
    if (sprite.isSprite) {
      // makeLabel(): material+textura únicos, nunca da paleta M
      const mat = sprite.material as THREE.SpriteMaterial | undefined;
      if (mat) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
      return;
    }
    const withUserData = o as THREE.Object3D & { userData: Record<string, unknown> };
    // Modelo do acervo (ou o caminhão custom da planta): o que está na cena é
    // clone(true) de um template parseado 1x, e clone COMPARTILHA geometria e
    // material com o original. Dar dispose aqui destruiria o template — o
    // modelo sumiria de todos os turnos seguintes. Ver buildLibInstance().
    if (withUserData.userData?.doAcervo) return;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    mats.forEach((m) => {
      if (!m || SHARED_MATS.has(m)) return;
      // Material com canvas próprio (o telão de chamada do pátio): dispose() do
      // material NÃO libera a textura, e um canvas por cena por turno vaza a
      // tarde inteira. Quem cria marca com `texturaPropria`.
      const propria = (m.userData as { texturaPropria?: THREE.Texture } | undefined)?.texturaPropria;
      if (propria) propria.dispose();
      m.dispose();
    });
  });
}
