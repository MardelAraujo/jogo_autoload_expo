import type { NextRequest } from "next/server";
import { assinar, estadoAtual } from "@/lib/server/ranking-hub";
import type { RankingEntry } from "@/lib/tipos";

export const dynamic = "force-dynamic";
// Precisa do runtime Node: a conexão fica aberta e o hub usa timers.
export const runtime = "nodejs";

// Stream do ranking do dia (Server-Sent Events). A tela abre um EventSource
// aqui e recebe o placar sempre que ele muda — sem F5, sem polling no browser
// e sem nenhuma credencial do banco sair do servidor.
export async function GET(request: NextRequest) {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let vivo = true;
      const enviar = (evento: string, dados: unknown) => {
        if (!vivo) return;
        try {
          controller.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`));
        } catch {
          vivo = false; // cliente sumiu no meio do envio
        }
      };

      enviar("ranking", await estadoAtual());
      const cancelar = assinar((entradas: RankingEntry[]) => enviar("ranking", entradas));

      // Comentário SSE a cada 25s. Proxies e balanceadores cortam conexões
      // ociosas, e num stand o placar pode passar minutos sem mudar.
      const batida = setInterval(() => {
        if (!vivo) return;
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          vivo = false;
        }
      }, 25_000);
      batida.unref?.();

      const encerrar = () => {
        if (!vivo) return;
        vivo = false;
        clearInterval(batida);
        cancelar();
        try {
          controller.close();
        } catch {
          // já fechado pelo cliente
        }
      };

      // Fechar a aba aborta a requisição — é aqui que a assinatura é liberada.
      request.signal.addEventListener("abort", encerrar);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Impede o nginx (se houver um na frente) de segurar o stream em buffer.
      "X-Accel-Buffering": "no",
    },
  });
}
