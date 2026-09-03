import * as THREE from "three";
import { buildTerminal, getPlanta, type BuildTerminalHandle } from "./scene";
import { disposeSceneContents } from "./renderer";
import type { Sel } from "@/state/kiosk-store";

export interface PreviewState {
  scene: THREE.Scene;
  T: BuildTerminalHandle;
  camera: THREE.OrthographicCamera;
}

/** Porte de `let preview` (linha 12156) — mutável, não Zustand: lido/escrito no loop de render. */
export const previewRef: { current: PreviewState | null } = { current: null };

/**
 * Remonta a cena de fundo (terminal girando) usada pelas telas start/lead/builder.
 * Porte de rebuildPreview() — linhas 12157-12168 (sem o pino da maquete, ver AGENTS/plano: dead code fora de escopo).
 */
export function rebuildPreview(sel: Pick<Sel, "mods" | "modais" | "modeloCaminhao">) {
  if (previewRef.current) disposeSceneContents(previewRef.current.scene);
  const scene = new THREE.Scene();
  const PL = getPlanta();
  const T = buildTerminal(scene, sel.mods, sel.modais, PL, { modeloCaminhao: sel.modeloCaminhao });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  previewRef.current = { scene, T, camera };
}
