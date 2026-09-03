"use client";

import dynamic from "next/dynamic";

// A árvore src/lib/three/** cria texturas via document.createElement('canvas')
// no load do módulo (core/materials.ts), não só quando chamada — então não
// pode ser avaliada durante SSR/RSC prerender. ssr:false só é permitido
// dentro de um arquivo "use client", por isso este wrapper existe separado
// de layout.tsx (Server Component).
const SceneCanvas = dynamic(() => import("./SceneCanvas").then((m) => m.SceneCanvas), { ssr: false });

export default SceneCanvas;
