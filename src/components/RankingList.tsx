import type { RankingEntry } from "@/lib/ranking";

export function RankingList({ entries, destaqueWhats, topN }: { entries: RankingEntry[]; destaqueWhats?: string | null; topN?: number }) {
  const top = entries.slice(0, topN ?? 5);
  if (!top.length) return null;
  return (
    <div className="rank-box">
      <div className="rank-titulo">Ranking do dia</div>
      {top.map((e, i) => (
        <div key={e.whats || e.nome} className={`rank-linha${i < 3 ? " podio" : ""}${e.whats === destaqueWhats ? " eu" : ""}`}>
          <span className="pos">{i + 1}º</span>
          <span className="quem">
            {e.nome}
            {e.empresa ? <span> · {e.empresa}</span> : null}
          </span>
          <span className="pts">
            {e.pontos}
            <small>PTS</small>
          </span>
        </div>
      ))}
    </div>
  );
}
