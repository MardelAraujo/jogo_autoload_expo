"use client";

import { useEffect, useRef } from "react";
import { getRenderer } from "@/lib/three/renderer";
import { installCameraControls } from "@/lib/three/camera";
import { startTick } from "@/lib/three/tick";
import { loadPlanta, CAMINHOES_ACERVO, MODELOS_CAMINHAO } from "@/lib/three/scene";
import { preloadLibrary } from "@/lib/three/model-library";
import { rebuildPreview } from "@/lib/three/preview";
import { syncMaqueteFromDrag } from "@/lib/three/maquete";
import { useKioskStore } from "@/state/kiosk-store";

/**
 * Canvas 3D único, compartilhado por todas as telas — porte do `<div id="scene">`
 * + `THREE.WebGLRenderer` global da referência. Montado uma única vez em
 * `layout.tsx`, acima do roteamento por `modo` de `page.tsx`, pra sobreviver
 * às trocas de tela exatamente como o canvas único da referência.
 */
export function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = getRenderer(canvas);

    // ---- listeners: instalados e desinstalados A CADA montagem ----
    // Antes eles moravam DENTRO do guard `bootedRef`, junto com o boot pesado.
    // Em dev o Strict Mode monta, desmonta e remonta: o cleanup do desmonte
    // chamava uninstallControls(), e a remontagem caía no `return` do guard sem
    // reinstalar nada. O canvas terminava sem pointerdown/wheel/touchmove e a
    // window sem pointermove/pointerup/resize — a câmera não respondia a
    // arraste nem a pinça em tela nenhuma, e a simulação (que lê o mesmo
    // camState) parecia travada no enquadramento inicial.
    //
    // Cleanup só pode desfazer o que a montagem refaz. O que é singleton de
    // módulo (renderer, cena, loop rAF) fica no bloco de boot abaixo e não
    // aparece aqui — sobrevive à remontagem de propósito.
    const uninstallControls = installCameraControls(canvas, () => {
      if (useKioskStore.getState().modo === "builder") syncMaqueteFromDrag();
    });

    function onResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);
    onResize();

    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);

    // ---- boot pesado: uma vez só na vida da página ----
    if (!bootedRef.current) {
      bootedRef.current = true;
      loadPlanta().then((PL) => {
        const sel = useKioskStore.getState().sel;
        rebuildPreview(sel);
        startTick(renderer);

        const usados = new Set<string>();
        PL.elements.filter((e) => e.type.startsWith("lib_")).forEach((e) => usados.add(e.type.slice(4)));
        CAMINHOES_ACERVO.forEach((id) => usados.add(id));
        MODELOS_CAMINHAO.forEach((m) => usados.add(m.id));
        preloadLibrary(Array.from(usados), () => {
          const modo = useKioskStore.getState().modo;
          if (modo === "start" || modo === "lead" || modo === "builder") {
            rebuildPreview(useKioskStore.getState().sel);
          }
        });
      });
    }

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("contextmenu", onContextMenu);
      uninstallControls();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        touchAction: "none",
      }}
    />
  );
}
