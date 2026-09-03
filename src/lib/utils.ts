// hojeStr() saiu daqui: o "dia da feira" agora é decidido pelo servidor, no
// fuso do evento (src/lib/server/dia.ts). Calcular no browser deixava o dia do
// ranking à mercê do relógio e do fuso da máquina do stand.

/**
 * O sistema pediu menos movimento? Quem anima número — a contagem do placar
 * final e o placar de fliperama do HUD — pergunta aqui antes de rodar, e
 * entrega o valor final direto quando a resposta é sim.
 */
export function menosMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function fmtMMSS(s: number): string {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

const PLACA_LETRAS = "BCDFGHJKLMNPRSTVWXZ";
export function gerarPlaca(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return PLACA_LETRAS[r(19)] + PLACA_LETRAS[r(19)] + PLACA_LETRAS[r(19)] + "-" + (1000 + r(9000));
}

// Ficha do motorista: dados fictícios de vitrine, CPF/CNH sem dígito
// verificador válido — ninguém valida nada aqui.
const MOT_NOMES = ["Carlos Eduardo", "Antônio", "José Ricardo", "Marcos", "Sebastião", "Luiz Fernando",
  "Adriana", "Paulo Sérgio", "Wagner", "Cleiton", "Rosana", "Djalma", "Everton", "Maria Aparecida"];
const MOT_SOBRENOMES = ["Ramos", "da Silva", "Bezerra", "Nogueira", "Prado", "dos Santos", "Fontes",
  "Alencar", "Ferreira", "Modesto", "Vasconcelos", "Batista", "Klein", "Siqueira"];

export interface Motorista {
  nome: string;
  cpf: string;
  cnh: string;
}

export function gerarMotorista(): Motorista {
  const p = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const d = (n: number) => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, "0");
  return {
    nome: p(MOT_NOMES) + " " + p(MOT_SOBRENOMES),
    cpf: d(3) + "." + d(3) + "." + d(3) + "-" + d(2),
    cnh: d(11),
  };
}

export function maskWhats(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}

let audioCtx: AudioContext | null = null;
export type SomTipo = "alarme" | "ok" | "fim" | "tap";

export function tocar(tipo: SomTipo, somAtivo: boolean) {
  if (!somAtivo) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if (tipo === "alarme") {
      o.type = "sawtooth"; o.frequency.setValueAtTime(240, t); g.gain.setValueAtTime(0.06, t); o.start(t); o.stop(t + 0.25);
    } else if (tipo === "ok") {
      o.type = "sine"; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + 0.09); g.gain.setValueAtTime(0.05, t); o.start(t); o.stop(t + 0.18);
    } else if (tipo === "fim") {
      o.type = "sine";
      [523, 659, 784, 1047].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.12));
      g.gain.setValueAtTime(0.06, t); o.start(t); o.stop(t + 0.5);
    } else {
      o.type = "square"; o.frequency.setValueAtTime(440, t); g.gain.setValueAtTime(0.03, t); o.start(t); o.stop(t + 0.06);
    }
  } catch {
    // ambiente sem AudioContext (SSR/teste) — silencioso, como no original
  }
}

// Padrão "toque para confirmar": primeiro toque pede confirmação por 3s,
// segundo toque (dentro da janela) dispara a ação. Usado nos botões de
// admin (zerar ranking) e em algumas missões manuais.
export function confirmar2(
  estado: { armado: boolean },
  onArmar: () => void,
  onDesarmar: () => void,
  acao: () => void,
  janelaMs = 3000,
): () => void {
  return () => {
    if (estado.armado) {
      estado.armado = false;
      onDesarmar();
      acao();
      return;
    }
    estado.armado = true;
    onArmar();
    setTimeout(() => {
      if (estado.armado) {
        estado.armado = false;
        onDesarmar();
      }
    }, janelaMs);
  };
}
