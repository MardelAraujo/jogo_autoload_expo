"use client";

import { useEffect } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import type { RankingEntry } from "./tipos";

// Mantém o placar da tela em dia sozinho: assina /api/ranking/stream e escreve
// cada atualização no store. Enquanto esse hook estiver montado, a tela reflete
// o ranking ao vivo — quem terminar uma partida em outro kiosk aparece no
// telão em segundos, sem ninguém dar F5.
export function useRankingAoVivo(): void {
  const setRanking = useKioskStore((s) => s.setRanking);
  const refreshRanking = useKioskStore((s) => s.refreshRanking);

  useEffect(() => {
    // EventSource reconecta sozinho quando a rede oscila — no stand isso
    // acontece. O que ele não faz é resolver a ausência de suporte, daí o
    // fallback para uma leitura única.
    if (typeof EventSource === "undefined") {
      void refreshRanking();
      return;
    }

    const es = new EventSource("/api/ranking/stream");

    es.addEventListener("ranking", (ev) => {
      try {
        setRanking(JSON.parse((ev as MessageEvent).data) as RankingEntry[]);
      } catch (e) {
        console.error("[ranking ao vivo] payload inválido:", e);
      }
    });

    // O EventSource já tenta reconectar sozinho a cada erro; aqui só se
    // registra, para o console do stand não ficar mudo se algo travar.
    es.onerror = () => console.warn("[ranking ao vivo] conexão caiu — reconectando");

    return () => es.close();
  }, [setRanking, refreshRanking]);
}
