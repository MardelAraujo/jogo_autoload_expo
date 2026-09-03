import { create } from "zustand";
import type { PlantaElement, PlantaLayout } from "@/lib/three/scene";

/**
 * Estado do editor de planta (tela `editor`, só para admin).
 *
 * O rascunho NÃO fica no Zustand. Ele é um objeto mutável de módulo
 * (`rascunho`), pelo mesmo motivo que `previewRef` existe em preview.ts: a
 * cena 3D lê e escreve nele a 60 fps enquanto o desenvolvedor arrasta uma
 * peça, e uma planta de 143 elementos passando por `set()` a cada frame
 * re-renderizaria a lista lateral inteira em cada quadro do arrasto.
 *
 * O que o Zustand guarda são só os gatilhos de renderização, separados por
 * granularidade:
 *
 * - `versaoEstrutura` — mudou a lista (adicionou, apagou, duplicou, carregou
 *   outra planta). Quem escuta: a lista lateral.
 * - `versaoTransform` — mudou um número do elemento selecionado. Quem escuta:
 *   o painel de propriedades. Sobe no máximo uma vez por frame durante o
 *   arrasto (ver `tocarTransform`).
 */

const rascunho: { current: PlantaLayout | null } = { current: null };

/** Planta em edição. Null antes de o editor abrir. */
export function getRascunho(): PlantaLayout | null {
  return rascunho.current;
}

export function elementoSel(): PlantaElement | null {
  const PL = rascunho.current;
  const i = useEditorStore.getState().sel;
  if (!PL || i == null) return null;
  return PL.elements[i] ?? null;
}

/** Índice de um elemento entre os do mesmo tipo — a fábrica precisa dele (cancela de entrada vs. de saída). */
export function ordinalDoTipo(PL: PlantaLayout, idx: number): number {
  const tipo = PL.elements[idx]?.type;
  let n = 0;
  for (let i = 0; i < idx; i++) if (PL.elements[i].type === tipo) n++;
  return n;
}

export type AbaEditor = "propriedades" | "acervo" | "cenario";

interface EditorState {
  /** Já buscou a planta do servidor? */
  carregado: boolean;
  erro: string | null;
  /** Índice do elemento selecionado em `rascunho.elements`. */
  sel: number | null;
  /** Índice do ponto de traçado (pista/rota) selecionado, quando em modo traçado. */
  ponto: number | null;
  modoTracado: boolean;
  grade: boolean;
  aba: AbaEditor;
  filtro: string;
  salvando: boolean;
  status: string | null;
  backups: string[];
  /** Diferença entre o rascunho e o que está em disco. */
  sujo: boolean;
  versaoEstrutura: number;
  versaoTransform: number;

  abrir: (PL: PlantaLayout, backups: string[]) => void;
  fechar: () => void;
  falhar: (erro: string) => void;
  selecionar: (i: number | null) => void;
  selecionarPonto: (i: number | null) => void;
  setModoTracado: (on: boolean) => void;
  setGrade: (on: boolean) => void;
  setAba: (aba: AbaEditor) => void;
  setFiltro: (s: string) => void;
  setSalvando: (on: boolean) => void;
  setStatus: (s: string | null) => void;
  setBackups: (b: string[]) => void;
  marcarSalvo: () => void;
  tocarEstrutura: () => void;
  tocarTransform: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  carregado: false,
  erro: null,
  sel: null,
  ponto: null,
  modoTracado: false,
  grade: true,
  aba: "propriedades",
  filtro: "",
  salvando: false,
  status: null,
  backups: [],
  sujo: false,
  versaoEstrutura: 0,
  versaoTransform: 0,

  abrir: (PL, backups) => {
    rascunho.current = PL;
    set({
      carregado: true,
      erro: null,
      sel: null,
      ponto: null,
      modoTracado: false,
      sujo: false,
      backups,
      versaoEstrutura: get().versaoEstrutura + 1,
      versaoTransform: get().versaoTransform + 1,
    });
  },
  fechar: () => {
    rascunho.current = null;
    set({ carregado: false, sel: null, ponto: null, modoTracado: false, sujo: false, status: null, erro: null });
  },
  falhar: (erro) => set({ erro, carregado: false }),
  selecionar: (i) => set({ sel: i, ponto: null, modoTracado: false, aba: i == null ? get().aba : "propriedades" }),
  selecionarPonto: (i) => set({ ponto: i }),
  setModoTracado: (on) => set({ modoTracado: on, ponto: null }),
  setGrade: (on) => set({ grade: on }),
  setAba: (aba) => set({ aba }),
  setFiltro: (filtro) => set({ filtro }),
  setSalvando: (salvando) => set({ salvando }),
  setStatus: (status) => set({ status }),
  setBackups: (backups) => set({ backups }),
  marcarSalvo: () => set({ sujo: false }),
  tocarEstrutura: () =>
    set({
      sujo: true,
      versaoEstrutura: get().versaoEstrutura + 1,
      versaoTransform: get().versaoTransform + 1,
    }),
  tocarTransform: () => set({ sujo: true, versaoTransform: get().versaoTransform + 1 }),
}));

// ---------------- coalescência do arrasto ----------------
// Um arrasto dispara pointermove muito mais vezes do que a tela sabe desenhar.
// `tocarTransformLeve` junta tudo o que chegar dentro do mesmo frame num
// `set()` só — o painel de propriedades mostra os números vivos sem que o
// arrasto pague um re-render de React por evento de ponteiro.
let framePendente = 0;
export function tocarTransformLeve(): void {
  if (framePendente) return;
  framePendente = requestAnimationFrame(() => {
    framePendente = 0;
    useEditorStore.getState().tocarTransform();
  });
}

// ---------------- histórico (desfazer) ----------------
// Snapshots do rascunho inteiro. A planta tem ~50 KB de JSON, então 40 passos
// custam ~2 MB de memória — barato o bastante para não valer um diff.
const LIMITE_HISTORICO = 40;
const historico: string[] = [];

/** Guarda o estado atual antes de uma alteração. Chamar UMA vez por operação (um arrasto inteiro é uma operação). */
export function guardarHistorico(): void {
  const PL = rascunho.current;
  if (!PL) return;
  historico.push(JSON.stringify(PL));
  if (historico.length > LIMITE_HISTORICO) historico.shift();
}

export function podeDesfazer(): boolean {
  return historico.length > 0;
}

/** Volta ao snapshot anterior. Devolve a planta restaurada (o chamador remonta a cena) ou null. */
export function desfazer(): PlantaLayout | null {
  const anterior = historico.pop();
  if (!anterior) return null;
  rascunho.current = JSON.parse(anterior) as PlantaLayout;
  return rascunho.current;
}

export function limparHistorico(): void {
  historico.length = 0;
}

/** Troca a planta em edição (importar arquivo, restaurar backup, desfazer). */
export function trocarRascunho(PL: PlantaLayout): void {
  rascunho.current = PL;
}
