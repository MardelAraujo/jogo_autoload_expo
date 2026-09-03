import { create } from "zustand";
import { ORDEM_MODS } from "@/lib/constants";
import type { Lead, RankingEntry } from "@/lib/ranking";
import { carregarRankingDia } from "@/lib/ranking";

export type Modo = "start" | "lead" | "builder" | "sim" | "jornada" | "end" | "admin" | "ranking" | "editor";

export interface SelOrdem {
  vistoriaEntrada: string;
  vistoriaSaida: string;
}

export interface SelModais {
  ferro: boolean;
  mar: boolean;
  duto: boolean;
}

export interface Sel {
  mods: Record<string, boolean>;
  ordem: SelOrdem;
  modais: SelModais;
  rodadas: number;
  modeloCaminhao: string | null;
}

function selInicial(): Sel {
  return {
    mods: Object.fromEntries(ORDEM_MODS.map((k) => [k, true])),
    ordem: { vistoriaEntrada: "patio", vistoriaSaida: "antes_checkout" },
    modais: { ferro: false, mar: false, duto: false },
    rodadas: 1,
    modeloCaminhao: null,
  };
}

interface KioskState {
  modo: Modo;
  sel: Sel;
  currentLead: Lead | null;
  somAtivo: boolean;
  adminOk: boolean;
  rankingCache: RankingEntry[];

  irPara: (modo: Modo) => void;
  setSel: (patch: Partial<Sel>) => void;
  setMod: (id: string, ativo: boolean) => void;
  setModal: (id: keyof SelModais, ativo: boolean) => void;
  setCurrentLead: (lead: Lead | null) => void;
  toggleSom: () => void;
  loginAdmin: (ok: boolean) => void;
  refreshRanking: (dia?: string) => Promise<void>;
  setRanking: (entradas: RankingEntry[]) => void;
  resetSel: () => void;
}

export const useKioskStore = create<KioskState>((set, get) => ({
  modo: "start",
  sel: selInicial(),
  currentLead: null,
  somAtivo: true,
  adminOk: false,
  rankingCache: [],

  irPara: (modo) => set({ modo }),
  setSel: (patch) => set({ sel: { ...get().sel, ...patch } }),
  setMod: (id, ativo) => set({ sel: { ...get().sel, mods: { ...get().sel.mods, [id]: ativo } } }),
  setModal: (id, ativo) => set({ sel: { ...get().sel, modais: { ...get().sel.modais, [id]: ativo } } }),
  setCurrentLead: (lead) => set({ currentLead: lead }),
  toggleSom: () => set({ somAtivo: !get().somAtivo }),
  loginAdmin: (ok) => set({ adminOk: ok }),
  refreshRanking: async (dia) => set({ rankingCache: await carregarRankingDia(dia) }),
  // Usado pelo stream do ranking ao vivo, que já traz a lista pronta.
  setRanking: (entradas) => set({ rankingCache: entradas }),
  resetSel: () => set({ sel: selInicial() }),
}));
