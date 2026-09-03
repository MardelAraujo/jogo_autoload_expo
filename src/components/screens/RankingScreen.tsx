"use client";

import { useEffect } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import { RankingList } from "@/components/RankingList";

export function RankingScreen() {
  const { irPara, rankingCache, refreshRanking } = useKioskStore();

  useEffect(() => {
    refreshRanking();
  }, [refreshRanking]);

  return (
    <div id="screen-ranking" className="overlay">
      <div className="overlay-card">
        <h1>
          Ranking <span>completo</span>
        </h1>
        <div className="sub">Todos os participantes de hoje</div>
        <div id="ranking-completo-lista" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <RankingList entries={rankingCache} topN={rankingCache.length} />
        </div>
        <button className="btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => irPara("start")}>
          Fechar
        </button>
      </div>
    </div>
  );
}
