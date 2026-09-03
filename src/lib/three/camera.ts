import * as THREE from "three";

export const VIEW_PADRAO = 61.34568909473495; // enquadramento de tela cheia (lead e simulação)
export const CAM_AZIM_PADRAO = 5.08286074995797; // azimute calibrado da tela cheia (lead e simulação)

// Ângulo calibrado contra a captura de referência da planta (imagem do stand):
// azimute ~317° e elevação ~48,7° batem o alinhamento da tancagem e a faixa
// fina de mar no canto superior direito que a referência mostra.
export const camState = {
  camAzim: 5.08286074995797,
  camElev: 0.25,
  viewSize: 61.34568909473495,
};

export const CAM_TARGET = new THREE.Vector3(58.53242380643985, 0, 63.39179956076242);

// `alvo` existe pro visor da maquete, que aproxima a câmera de uma peça
// específica em vez do centro da planta; sem ele tudo continua olhando o
// CAM_TARGET de sempre (lead e os dois lados da simulação).
/**
 * Proporção em que o enquadramento foi calibrado: a tela do estande, 1920×1080.
 * Ver `aspectMin` abaixo.
 */
export const ASPECT_REF = 16 / 9;

/**
 * `aspectMin` — a garantia de que nenhuma tela mostra MENOS terminal que a do
 * estande.
 *
 * `viewSize` é meia-ALTURA, e a largura saía dela multiplicada pelo aspecto. Num
 * quadro mais estreito que o de referência isso não reenquadra: encolhe o campo
 * de visão horizontal e corta o terminal pelos lados. Numa tela em pé
 * (1080×1920) sobra um pedaço do cais e mais nada — o resto fica fora do quadro,
 * sem que nenhum controle do jogo permita alcançá-lo.
 *
 * Com `aspectMin`, quando o quadro é mais estreito que ele a meia-altura cresce
 * na mesma proporção, e o produto `meiaAltura * aspect` — a meia-largura — fica
 * cravado em `viewSize * aspectMin`. Ou seja: a largura de mundo é a mesma
 * sempre, e uma tela mais estreita ganha ALTURA em vez de perder largura.
 *
 * Quem chama passa o aspecto do seu próprio quadro: `ASPECT_REF` na tela cheia,
 * metade dele em cada lado do split-screen. Nos dois casos o valor bate exato
 * com o que 1920×1080 produz, então **no totem nada muda** — isto só entra em
 * telas de outra proporção. O visor da maquete não precisa: `mqViewAmpla()`
 * (maquete.ts) já faz a mesma conta com o raio da planta.
 */
export function aplicarCamera(cam: THREE.OrthographicCamera, aspect: number, alvo?: THREE.Vector3, aspectMin = 0) {
  const T = alvo || CAM_TARGET;
  const { camAzim, camElev, viewSize } = camState;
  const meiaAltura = aspect > 0 && aspect < aspectMin ? (viewSize * aspectMin) / aspect : viewSize;
  cam.left = -meiaAltura * aspect;
  cam.right = meiaAltura * aspect;
  cam.top = meiaAltura;
  cam.bottom = -meiaAltura;
  const r = 340;
  cam.position.set(
    T.x + r * Math.cos(camElev) * Math.sin(camAzim),
    T.y + r * Math.sin(camElev),
    T.z + r * Math.cos(camElev) * Math.cos(camAzim)
  );
  cam.lookAt(T);
  cam.updateProjectionMatrix();
}

// A câmera é a mesma nas duas metades do split-screen (mesmos camAzim/camElev
// pros dois aplicarCamera() em tick()) — "um personagem de câmera" só, pra
// cena inteira. Ela não se mexe sozinha: fica onde o visitante a deixou (ou
// no enquadramento padrão), e só arrastar/dar zoom muda alguma coisa.

const ELEV_MIN = 0.3;
const ELEV_MAX = 1.2;
const VIEW_MIN = 60;
const VIEW_MAX = 240;

/**
 * Suspende os controles compartilhados sem desinstalá-los. O editor de planta
 * (tela `editor`) tem controles próprios no mesmo canvas — clique que
 * seleciona peça, arrasto que move peça, botão direito que passeia — e sem
 * esta trava os dois conjuntos rodariam no mesmo pointerdown: a câmera do
 * jogo orbitaria junto com o arrasto da peça. Um `ref` de módulo e não uma
 * leitura do store porque este arquivo não conhece o Zustand (e roda dentro
 * do loop de render).
 */
export const controlesPausados = { current: false };

function limitarView(v: number): number {
  return Math.min(VIEW_MAX, Math.max(VIEW_MIN, v));
}

/**
 * Instala os handlers que orbitam e aproximam a câmera compartilhada.
 *
 * Um dedo GIRA, dois dedos APROXIMAM — e é o mapa `dedos` que separa os dois.
 * Antes o giro guardava um único par `px/py` e a pinça vinha por `touchmove`
 * paralelo, então os dois rodavam ao mesmo tempo: com dois dedos na tela, os
 * `pointermove` chegam alternados de um e de outro, e cada evento media o
 * deslocamento contra a última posição do dedo ERRADO. O visitante que tentasse
 * só dar zoom via o terminal girar aos solavancos, ida e volta, no ritmo do
 * revezamento dos eventos. Num mouse isso nunca aparecia — ponteiro é um só.
 *
 * O outro conserto é `pointercancel`. Sem ele, um toque que o navegador cancela
 * (o sistema reconheceu um gesto seu, a mão encostou na borda) nunca fecha o
 * arrasto: `dragging` ficava `true` para sempre e, daí em diante, passar o dedo
 * pela tela girava a câmera sem ninguém estar pressionando nada. É o tipo de
 * defeito que só aparece depois de horas de estande.
 */
export function installCameraControls(canvas: HTMLElement, onChange?: () => void) {
  const dedos = new Map<number, { x: number; y: number }>();
  let px = 0;
  let py = 0;
  let pinchD = 0;

  /** Distância entre os dois dedos — a medida que vira zoom. */
  function separacao(): number {
    const [a, b] = Array.from(dedos.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Passa a girar a partir de onde este dedo está AGORA, sem herdar o trajeto anterior. */
  function ancorar(x: number, y: number) {
    px = x;
    py = y;
  }

  function onPointerDown(e: PointerEvent) {
    if (controlesPausados.current) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 1) ancorar(e.clientX, e.clientY);
    // O segundo dedo abre a pinça e encerra o giro: daqui em diante a distância
    // entre eles é que manda, e a âncora do giro fica obsoleta de propósito.
    else if (dedos.size === 2) pinchD = separacao();
  }

  function onPointerUp(e: PointerEvent) {
    if (!dedos.delete(e.pointerId)) return;
    pinchD = 0;
    // Tirou um dedo e sobrou um: reancorar no que ficou. Sem isto o próximo
    // movimento seria medido contra a posição do dedo que saiu, e a câmera
    // daria um salto proporcional ao vão entre os dois.
    if (dedos.size === 1) {
      const [u] = Array.from(dedos.values());
      ancorar(u.x, u.y);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (controlesPausados.current) return;
    // Só interessa o ponteiro que ENCOSTOU no canvas. Sem esta guarda, o mouse
    // apenas passeando pela tela (botão solto) também orbitaria.
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dedos.size >= 2) {
      const d = dedos.size === 2 ? separacao() : 0;
      if (pinchD && d) camState.viewSize = limitarView((camState.viewSize * pinchD) / d);
      pinchD = d;
      onChange?.();
      return;
    }

    camState.camAzim -= (e.clientX - px) * 0.005;
    camState.camElev = Math.min(ELEV_MAX, Math.max(ELEV_MIN, camState.camElev + (e.clientY - py) * 0.003));
    ancorar(e.clientX, e.clientY);
    onChange?.();
  }

  function onWheel(e: WheelEvent) {
    if (controlesPausados.current) return;
    e.preventDefault();
    camState.viewSize = limitarView(camState.viewSize * (e.deltaY > 0 ? 1.08 : 0.93));
    onChange?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return function uninstall() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("wheel", onWheel);
    dedos.clear();
  };
}
