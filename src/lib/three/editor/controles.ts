import * as THREE from "three";
import {
  editorRef,
  camEditor,
  limitarElev,
  limitarView,
  atualizarContorno,
  atualizarAlcas,
  mundoParaTracado,
  pontosDoTracado,
  refazerPeca,
} from "./cena-editor";
import { transformNoTracado } from "./fabrica";

/**
 * Ponteiro do editor. Um botão só (o kiosk é touch), com o modo decidido no
 * `pointerdown` a partir do que está debaixo do dedo:
 *
 * | onde caiu o clique          | o que faz            |
 * | --------------------------- | -------------------- |
 * | alça do traçado (modo rota) | arrasta o ponto      |
 * | peça destravada             | arrasta a peça       |
 * | peça travada                | só seleciona         |
 * | vazio                       | orbita a câmera      |
 * | botão direito / meio / Space| passeia (pan)        |
 *
 * É a mesma gramática do editor de referência (`_template_editor3d.html`,
 * em legacy/prototipos-3d/) — o que muda é o pan, que lá não existia porque
 * a planta cabia inteira na tela.
 */

export interface GanchosControles {
  /** Estado que o controle precisa consultar a cada evento — vem do store, que ele não importa de propósito. */
  estado: () => { sel: number | null; modoTracado: boolean; travado: (i: number) => boolean };
  aoSelecionar: (i: number | null) => void;
  aoSelecionarPonto: (i: number | null) => void;
  /** Antes da primeira alteração de um arrasto — o ponto de desfazer. */
  antesDeMudar: () => void;
  /** Durante o arrasto (coalescido por frame). */
  aoMudar: () => void;
  /** Fim do arrasto. */
  aoSoltar: () => void;
}

type Modo = "orbitar" | "pan" | "arrastar" | "alca" | null;

const PLANO_CHAO = new THREE.Vector3(0, 1, 0);

export function instalarControlesEditor(canvas: HTMLCanvasElement, g: GanchosControles): () => void {
  const raio = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2();
  const plano = new THREE.Plane();
  const alvoTmp = new THREE.Vector3();
  const desloc = new THREE.Vector3();
  const eixoX = new THREE.Vector3();
  const eixoY = new THREE.Vector3();
  const caixaTmp = new THREE.Box3();
  /** Traçado no instante em que o arrasto começou, para mover a rota inteira sem acumular erro. */
  let tracadoInicial: number[][] | null = null;
  const ancora = new THREE.Vector2();

  let modo: Modo = null;
  let px = 0;
  let py = 0;
  let pinca = 0;
  /** Ponteiros encostados no canvas — dois ou mais significam pinça, não arrasto. */
  const dedos = new Set<number>();
  let idxArrasto: number | null = null;
  let pontoArrasto: number | null = null;
  let mudou = false;
  let espaco = false;

  function normalizar(e: PointerEvent | { clientX: number; clientY: number }) {
    const r = canvas.getBoundingClientRect();
    ponteiro.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ponteiro.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  /**
   * Índice da peça sob o ponteiro. O raio acerta um mesh filho, então sobe
   * pelo `raizIdx` que a cena carimbou.
   *
   * Devolve o índice e MAIS NADA — em particular, não devolve o ponto de
   * interseção, porque nas peças do acervo ele não é confiável. Medido nesta
   * planta: `objects/vagas` é uma geometria de raio 1,2 escalada por 19,6, e o
   * Raycaster do three r128 devolve para ela um ponto a (-450, 313, 209) —
   * fora do próprio bounding box da malha, a 71 unidades da câmera, quando a
   * peça está no chão a 618. `structures/balanca` faz o mesmo em (1085,
   * -1038, -365). Quem usasse esse ponto como referência do arrasto jogava a
   * peça para fora do mapa no primeiro pixel de movimento — era o bug de
   * "clico para arrastar e a peça some".
   *
   * O ponto serve, porém, como teste de sanidade: acerto cujo ponto cai fora
   * do bounding box da própria malha é descartado, para uma peça longe não
   * roubar o clique com uma distância inventada. Se TODOS forem assim, vale o
   * primeiro — é melhor selecionar do que não responder ao clique.
   */
  function pecaSob(): number | null {
    const ed = editorRef.current;
    if (!ed) return null;
    raio.setFromCamera(ponteiro, ed.camera);
    const alvos = ed.pecas.filter((p): p is THREE.Object3D => !!p);
    let reserva: number | null = null;
    for (const hit of raio.intersectObjects(alvos, true)) {
      const idx = hit.object.userData.raizIdx;
      if (typeof idx !== "number") continue;
      if (reserva === null) reserva = idx;
      caixaTmp.setFromObject(hit.object).expandByScalar(0.5);
      if (caixaTmp.containsPoint(hit.point)) return idx;
    }
    return reserva;
  }

  function alcaSob(): number | null {
    const ed = editorRef.current;
    if (!ed || !ed.alcas.children.length) return null;
    raio.setFromCamera(ponteiro, ed.camera);
    const hits = raio.intersectObjects(ed.alcas.children, false);
    const k = hits[0]?.object.userData.ponto;
    return typeof k === "number" ? k : null;
  }

  function onPointerDown(e: PointerEvent) {
    const ed = editorRef.current;
    if (!ed) return;
    dedos.add(e.pointerId);
    // Captura TODOS os ponteiros, inclusive o segundo: é o que garante que o
    // `pointerup` dele volte para cá mesmo se o dedo sair do canvas antes de
    // levantar. Sem isso o `dedos` ficaria com um fantasma e o editor
    // continuaria achando que há uma pinça em curso.
    canvas.setPointerCapture?.(e.pointerId);
    // Segundo dedo na tela: o gesto virou pinça, e o que estava em curso é
    // abortado. Sem isto, os dois ponteiros alimentam o MESMO par `px/py` e o
    // `modo` decidido pelo primeiro toque continua valendo — quem tentasse só
    // aproximar a planta acabava orbitando aos solavancos ou, pior, ARRASTANDO
    // a peça que estava embaixo do primeiro dedo. Aqui isso não é só um
    // incômodo de câmera: é uma peça movida sem querer num editor cujo botão
    // de gravar escreve a planta que o jogo lê.
    if (dedos.size > 1) {
      if (mudou) g.aoSoltar();
      modo = null;
      idxArrasto = null;
      pontoArrasto = null;
      tracadoInicial = null;
      mudou = false;
      return;
    }
    px = e.clientX;
    py = e.clientY;
    mudou = false;

    if (e.button === 1 || e.button === 2 || espaco) {
      modo = "pan";
      return;
    }

    normalizar(e);
    const est = g.estado();

    if (est.modoTracado && est.sel != null) {
      const k = alcaSob();
      if (k != null) {
        modo = "alca";
        idxArrasto = est.sel;
        pontoArrasto = k;
        g.aoSelecionarPonto(k);
        plano.setFromNormalAndCoplanarPoint(PLANO_CHAO, new THREE.Vector3(0, 0, 0));
        return;
      }
      // em modo traçado o clique fora das alças só orbita — senão a peça
      // inteira sai do lugar quando a intenção era remodelar a curva
      modo = "orbitar";
      return;
    }

    const idx = pecaSob();
    if (idx == null) {
      g.aoSelecionar(null);
      modo = "orbitar";
      return;
    }

    g.aoSelecionar(idx);
    if (est.travado(idx)) {
      modo = "orbitar";
      return;
    }
    const el = ed.PL.elements[idx];
    modo = "arrastar";
    idxArrasto = idx;
    tracadoInicial = null;

    // A referência do arrasto é o cruzamento do raio com o plano do chão — o
    // MESMO cálculo que o pointermove usa. Medir o começo com uma régua
    // (o ponto na malha) e o resto com outra é o que produzia o salto.
    plano.setFromNormalAndCoplanarPoint(PLANO_CHAO, new THREE.Vector3(0, el.p[1] || 0, 0));
    if (!raio.ray.intersectPlane(plano, alvoTmp)) {
      modo = "orbitar";
      return;
    }

    if (transformNoTracado(el.type)) {
      // Peça cujo transform vive no traçado (o caminhão da rota): arrastar o
      // corpo move a CURVA inteira. Mexer em `el.p` ali não teria efeito — e
      // mexer na posição do grupo deslocaria o referencial da curva, jogando o
      // caminhão para longe.
      const pts = pontosDoTracado(el);
      const local = mundoParaTracado(idx, alvoTmp);
      if (!pts || !local) {
        modo = "orbitar";
        return;
      }
      tracadoInicial = pts.map((pt) => [pt[0], pt[1]]);
      ancora.set(local[0], local[1]);
      desloc.set(0, 0, 0);
      return;
    }

    desloc.set(el.p[0], 0, el.p[2]).sub(alvoTmp);
    desloc.y = 0;
  }

  function onPointerMove(e: PointerEvent) {
    const ed = editorRef.current;
    if (!ed || !modo) return;
    if (dedos.size > 1) return; // pinça em curso: quem manda é onTouchMove

    if (modo === "orbitar") {
      camEditor.azim -= (e.clientX - px) * 0.005;
      camEditor.elev = limitarElev(camEditor.elev + (e.clientY - py) * 0.003);
      px = e.clientX;
      py = e.clientY;
      return;
    }

    if (modo === "pan") {
      const r = canvas.getBoundingClientRect();
      // câmera ortográfica: a escala mundo↔tela é constante e sai direto da moldura
      const porPixel = (ed.camera.right - ed.camera.left) / r.width;
      eixoX.setFromMatrixColumn(ed.camera.matrixWorld, 0);
      eixoY.setFromMatrixColumn(ed.camera.matrixWorld, 1);
      camEditor.alvo.addScaledVector(eixoX, -(e.clientX - px) * porPixel);
      camEditor.alvo.addScaledVector(eixoY, (e.clientY - py) * porPixel);
      px = e.clientX;
      py = e.clientY;
      return;
    }

    normalizar(e);
    raio.setFromCamera(ponteiro, ed.camera);
    if (!raio.ray.intersectPlane(plano, alvoTmp)) return;

    if (!mudou) {
      mudou = true;
      g.antesDeMudar();
    }

    if (modo === "arrastar" && idxArrasto != null && tracadoInicial) {
      const pts = pontosDoTracado(ed.PL.elements[idxArrasto]);
      const local = mundoParaTracado(idxArrasto, alvoTmp);
      if (!pts || !local) return;
      const dx = local[0] - ancora.x;
      const dz = local[1] - ancora.y;
      for (let k = 0; k < pts.length && k < tracadoInicial.length; k++) {
        pts[k][0] = tracadoInicial[k][0] + dx;
        pts[k][1] = tracadoInicial[k][1] + dz;
      }
      redesenharTracado(idxArrasto, pontoArrasto);
      g.aoMudar();
      return;
    }

    if (modo === "arrastar" && idxArrasto != null) {
      const el = ed.PL.elements[idxArrasto];
      alvoTmp.add(desloc);
      // Shift encaixa na grade de 1 unidade — o mesmo passo dos campos numéricos
      el.p[0] = e.shiftKey ? Math.round(alvoTmp.x) : alvoTmp.x;
      el.p[2] = e.shiftKey ? Math.round(alvoTmp.z) : alvoTmp.z;
      const peca = ed.pecas[idxArrasto];
      peca?.position.set(el.p[0], el.p[1], el.p[2]);
      atualizarContorno();
      g.aoMudar();
      return;
    }

    if (modo === "alca" && idxArrasto != null && pontoArrasto != null) {
      const pts = pontosDoTracado(ed.PL.elements[idxArrasto]);
      const local = mundoParaTracado(idxArrasto, alvoTmp);
      if (!pts || !local) return;
      pts[pontoArrasto] = local;
      redesenharTracado(idxArrasto, pontoArrasto);
      g.aoMudar();
    }
  }

  // Mover uma alça obriga a refazer a peça inteira: a fita de asfalto de uma
  // pista tem 460 seções, e a peça de uma rota clona o `.glb` do caminhão.
  // Refazer isso a cada `pointermove` (que chega bem mais rápido do que a
  // tela desenha) é trabalho jogado fora — um por frame basta.
  let framePendente = 0;
  function redesenharTracado(idx: number, ponto: number | null) {
    if (framePendente) return;
    framePendente = requestAnimationFrame(() => {
      framePendente = 0;
      refazerPeca(idx);
      atualizarAlcas(idx, ponto);
    });
  }

  function onPointerUp(e: PointerEvent) {
    dedos.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
    // o último pointermove pode ter caído dentro do frame já agendado — sem
    // este desenho final a peça ficaria uma posição de alça atrás
    if ((modo === "alca" || tracadoInicial) && idxArrasto != null) {
      cancelAnimationFrame(framePendente);
      framePendente = 0;
      refazerPeca(idxArrasto);
      atualizarAlcas(idxArrasto, pontoArrasto);
    }
    if (mudou) g.aoSoltar();
    modo = null;
    idxArrasto = null;
    pontoArrasto = null;
    tracadoInicial = null;
    mudou = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    camEditor.view = limitarView(camEditor.view * (e.deltaY > 0 ? 1.09 : 0.92));
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 2) return;
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    if (pinca) camEditor.view = limitarView((camEditor.view * pinca) / d);
    pinca = d;
  }
  function onTouchEnd() {
    pinca = 0;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Space") espaco = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === "Space") espaco = false;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return function desinstalar() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    dedos.clear();
  };
}
