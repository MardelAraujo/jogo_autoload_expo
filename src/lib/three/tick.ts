import * as THREE from "three";
import { useKioskStore } from "@/state/kiosk-store";
import { aplicarCamera, camState, ASPECT_REF } from "./camera";
import { previewRef } from "./preview";
import { atualizarMaquete, mqAlvo, setMaqueteAspect } from "./maquete";
import { comecarQuadro, terminarQuadro } from "./pos-processo";
import type { WebGLRenderer } from "three";

/**
 * Recorte de tela (em pixels de canvas) pro visor da maquete do montador —
 * fora do modo 'builder' fica null e o preview roda em tela cheia. Setado
 * pelo BuilderScreen via `setPreviewClipRect`. Porte do conceito de mqRect().
 */
export interface ClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const previewClip: { current: ClipRect | null } = { current: null };
export function setPreviewClipRect(rect: ClipRect | null) {
  previewClip.current = rect;
}

/**
 * Hook pro motor de simulação (fase posterior do port) plugar o render
 * split-screen sem que este módulo precise conhecer sim.ts. Enquanto não
 * plugado, o modo 'sim' simplesmente não desenha nada além do que já estiver
 * na tela (as telas de jornada/end não dependem do canvas).
 */
export type SimTickFn = (renderer: WebGLRenderer, dt: number, now: number) => void;
export const simTickRef: { current: SimTickFn | null } = { current: null };

/**
 * Mesma ideia para o editor de planta: ele desenha a própria cena em tela
 * cheia, e quem pluga é a tela do editor no mount. Um `ref` e não um import
 * porque `tick.ts` é carregado no boot (SceneCanvas) enquanto o editor é um
 * `next/dynamic` que só o administrador abre — importá-lo daqui traria a
 * árvore inteira do editor para o bundle de todo visitante do stand.
 */
export const editorTickRef: { current: SimTickFn | null } = { current: null };

function semMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let last = 0;
let rafHandle: number | null = null;

/** Porte do loop `tick(now)` — linhas 12613-12679 da referência. */
function frame(renderer: THREE.WebGLRenderer, now: number) {
  rafHandle = requestAnimationFrame((t) => frame(renderer, t));
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Antisserrilhado: `desenhar` continua achando que pinta na tela; quem
  // desvia pro alvo fora de tela e resolve o filtro por cima é este par. Com
  // o pós-processo desligado, os dois viram no-op e o caminho é o de antes.
  comecarQuadro(renderer);
  desenhar(renderer, dt, now);
  terminarQuadro(renderer);
}

function desenhar(renderer: THREE.WebGLRenderer, dt: number, now: number) {
  const canvas = renderer.domElement;
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  renderer.setScissorTest(false);

  const modo = useKioskStore.getState().modo;

  if (modo === "sim" && simTickRef.current) {
    simTickRef.current(renderer, dt, now);
    return;
  }

  // Editor de planta: cena própria, câmera própria, tela cheia. Não passa
  // pelo `preview` porque o que se edita ali é a planta em si — a maquete do
  // montador é uma leitura da planta, não a planta.
  if (modo === "editor") {
    editorTickRef.current?.(renderer, dt, now);
    return;
  }

  const preview = previewRef.current;
  if (!preview) return;

  // vitrine em repouso: a maquete gira sozinha, devagar o bastante pra ler
  // como "ligada" e não como carrossel. É o único movimento de câmera que
  // não vem da mão do visitante.
  if (modo === "start" && !semMovimento()) camState.camAzim += dt * 0.012;

  const r = modo === "builder" ? previewClip.current : null;
  if (r) {
    // Fora do recorte a tela precisa ser limpa TODO frame: com o scissor
    // ligado o render só pinta dentro do quadro, e o que sobrou do último
    // frame de tela cheia ficaria congelado na coluna, em volta do visor.
    renderer.setScissorTest(false);
    renderer.setClearColor(0x1a2028, 1); // mesma ardósia do degradê das telas de fundo (ver :root em globals.css)
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setViewport(r.x, r.y, r.w, r.h);
    renderer.setScissor(r.x, r.y, r.w, r.h);
    setMaqueteAspect(r.w / r.h);
    atualizarMaquete(dt);
    aplicarCamera(preview.camera, r.w / r.h, mqAlvo);
    renderer.render(preview.scene, preview.camera);
  } else {
    // Tela cheia (start/lead): numa janela mais estreita que 16:9 o
    // enquadramento abre em altura em vez de cortar o terminal — ver aspectMin.
    aplicarCamera(preview.camera, W / H, undefined, ASPECT_REF);
    renderer.setViewport(0, 0, W, H);
    renderer.render(preview.scene, preview.camera);
  }
}

/** Inicia o loop rAF único do app. Chamar uma única vez, no mount do SceneCanvas. */
export function startTick(renderer: THREE.WebGLRenderer) {
  if (rafHandle != null) return; // idempotente sob Strict Mode
  last = performance.now();
  rafHandle = requestAnimationFrame((t) => frame(renderer, t));
}

export function stopTick() {
  if (rafHandle != null) cancelAnimationFrame(rafHandle);
  rafHandle = null;
}
