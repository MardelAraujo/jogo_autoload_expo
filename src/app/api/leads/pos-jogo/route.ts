import type { NextRequest } from "next/server";
import { atualizarLeadPosJogo } from "@/lib/server/dados";

export const dynamic = "force-dynamic";

// Contabiliza a partida no lead (jogos +1, melhor_pontos). Chamado ao fim de
// cada rodada, junto com o POST do ranking.
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { whats?: unknown; pontos?: unknown } | null;
  const whats = typeof body?.whats === "string" ? body.whats.trim().slice(0, 40) : "";
  const pontos = Math.trunc(Number(body?.pontos));
  if (!whats || !Number.isFinite(pontos) || pontos < 0 || pontos > 100_000) {
    return Response.json({ erro: "payload_invalido" }, { status: 400 });
  }
  await atualizarLeadPosJogo(whats, pontos);
  return Response.json({ ok: true });
}
