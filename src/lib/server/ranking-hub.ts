import "server-only";
import { carregarRankingDia } from "./dados";
import type { RankingEntry } from "../tipos";

// Hub do ranking ao vivo. Um único lugar no servidor observa o placar do dia e
// empurra as mudanças para todas as telas conectadas por SSE.
//
// Por que aqui e não no browser: dar Supabase Realtime para cada kiosk exigiria
// devolver a chave do banco ao cliente, desfazendo a separação que o resto do
// servidor mantém. Aqui, N telas conectadas custam 1 leitura do banco.
//
// Duas fontes de mudança, somadas:
//   1. `publicar()`, chamado pelas rotas que escrevem (POST /api/ranking e o
//      zerar do admin) — o telão reage no mesmo instante.
//   2. Um polling de segurança, ativo só enquanto houver alguém conectado, que
//      pega o que mudou por fora (outra instância do servidor, uma edição
//      manual na tabela, ou a virada do dia).

type Ouvinte = (entradas: RankingEntry[]) => void;

const INTERVALO_MS = Number(process.env.RANKING_POLL_MS || 4000);

interface Hub {
  ouvintes: Set<Ouvinte>;
  timer: ReturnType<typeof setInterval> | null;
  ultimo: string; // JSON do último ranking enviado, para não repetir
}

// Em globalThis porque o hot reload do dev recarrega o módulo e criaria um
// segundo hub, deixando o polling do primeiro rodando órfão.
const g = globalThis as typeof globalThis & { __rankingHub?: Hub };
const hub: Hub = (g.__rankingHub ??= { ouvintes: new Set(), timer: null, ultimo: "" });

async function verificar(forcar = false): Promise<void> {
  if (!hub.ouvintes.size) return;
  const entradas = await carregarRankingDia(null);
  const serial = JSON.stringify(entradas);
  if (!forcar && serial === hub.ultimo) return;
  hub.ultimo = serial;
  hub.ouvintes.forEach((ouvinte) => {
    try {
      ouvinte(entradas);
    } catch {
      // uma conexão que já morreu não pode derrubar as outras
    }
  });
}

// Chamado pelas rotas de escrita. Não é await-ado por elas: quem gravou a
// pontuação não deve esperar o broadcast para receber a resposta.
export function publicar(): void {
  void verificar().catch((e) => console.error("[hub] falha ao publicar:", e));
}

export function assinar(ouvinte: Ouvinte): () => void {
  hub.ouvintes.add(ouvinte);
  if (!hub.timer) {
    hub.timer = setInterval(() => {
      void verificar().catch((e) => console.error("[hub] falha no polling:", e));
    }, INTERVALO_MS);
    // Não segura o processo vivo se for a única coisa pendente.
    hub.timer.unref?.();
  }
  return () => {
    hub.ouvintes.delete(ouvinte);
    if (!hub.ouvintes.size && hub.timer) {
      clearInterval(hub.timer);
      hub.timer = null;
      // Zera o cache para que a próxima tela a conectar receba o estado real,
      // e não seja comparada contra um snapshot velho.
      hub.ultimo = "";
    }
  };
}

// Snapshot para o primeiro evento da conexão, antes de qualquer mudança.
export function estadoAtual(): Promise<RankingEntry[]> {
  return carregarRankingDia(null);
}
