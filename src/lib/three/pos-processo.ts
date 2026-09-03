import * as THREE from "three";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";

/**
 * Antisserrilhado por pós-processo (FXAA) — a RESERVA do MSAA.
 *
 * Em vez de desenhar direto na tela, o quadro inteiro vai para um alvo fora
 * de tela e, no fim, é copiado para o canvas por um quad de tela cheia que
 * suaviza as bordas. Como o filtro roda uma vez por PIXEL DE TELA, o custo não
 * depende de quantas cenas o quadro empilhou — e isso importa aqui, porque o
 * split-screen da simulação desenha o terminal duas vezes por quadro.
 *
 * O padrão do jogo é o MSAA do contexto (ver renderer.ts): nesta cena, feita
 * de geometria fina e clara, o FXAA amacia o guarda-corpo junto com a borda
 * dele — ele não distingue detalhe de serrilhado. Este caminho entra quando o
 * driver aceita a flag `antialias` e devolve uma amostra só, o que acontece em
 * GPU integrada antiga: sem ele, essas máquinas ficariam sem antisserrilhado
 * nenhum e sem aviso.
 *
 * Em compensação ele pega dois casos que o MSAA não pega, e por isso vale
 * como reserva de verdade: a borda recortada por `alphaTest` (a tela do
 * alambrado da cerca, que o MSAA vê como opaca porque o recorte acontece com
 * `discard` dentro do shader — daí o `alphaToCoverage` no outro caminho) e o
 * serrilhado que vem da própria textura, não da geometria.
 */

let alvo: THREE.WebGLRenderTarget | null = null;
let cenaQuad: THREE.Scene | null = null;
let camQuad: THREE.OrthographicCamera | null = null;
let material: THREE.ShaderMaterial | null = null;
let ligado = false;
const tamanho = new THREE.Vector2();

/** Liga/desliga o pós-processo. Chamado uma vez, no boot do renderer. */
export function configurarPosProcesso(ativo: boolean) {
  ligado = ativo;
}

function garantirRecursos(renderer: THREE.WebGLRenderer) {
  renderer.getDrawingBufferSize(tamanho);
  const l = Math.max(1, Math.floor(tamanho.x));
  const a = Math.max(1, Math.floor(tamanho.y));

  if (!alvo) {
    // depthBuffer é obrigatório: o alvo recebe a cena 3D inteira, com
    // profundidade e sombra. stencil não é usado por nada aqui.
    alvo = new THREE.WebGLRenderTarget(l, a, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
  } else if (alvo.width !== l || alvo.height !== a) {
    alvo.setSize(l, a);
  }

  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    cenaQuad = new THREE.Scene();
    camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cenaQuad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  }

  material.uniforms.tDiffuse.value = alvo.texture;
  material.uniforms.resolution.value.set(1 / l, 1 / a);
  return { l, a };
}

/**
 * Início do quadro: desvia o desenho para o alvo fora de tela.
 *
 * Fica em `tick.ts`, o único ponto por onde os três caminhos de render passam
 * (preview/maquete, split-screen da simulação e editor de planta). Nenhum
 * deles toca em `setRenderTarget`, então todos caem no alvo sem saber disso —
 * é o que permite acrescentar o filtro sem mexer em três arquivos.
 */
export function comecarQuadro(renderer: THREE.WebGLRenderer) {
  if (!ligado) return;
  garantirRecursos(renderer);
  renderer.setRenderTarget(alvo);
}

/** Fim do quadro: resolve o alvo na tela pelo filtro. */
export function terminarQuadro(renderer: THREE.WebGLRenderer) {
  if (!ligado || !alvo || !cenaQuad || !camQuad) return;
  const { l, a } = garantirRecursos(renderer);
  renderer.setRenderTarget(null);
  // o quad cobre a tela inteira: scissor e limpeza sairiam sobrando, e o
  // scissor ainda por cima recortaria o filtro no visor da maquete
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, l, a);
  const limpavaSozinho = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(cenaQuad, camQuad);
  renderer.autoClear = limpavaSozinho;
}
