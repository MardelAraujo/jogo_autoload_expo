import type { NextRequest } from "next/server";
import { carregarRankingDia, salvarRankingDia, parseRanking } from "@/lib/server/dados";
import { publicar } from "@/lib/server/ranking-hub";

// O placar muda a cada partida — nunca pode vir de cache.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dia = request.nextUrl.searchParams.get("dia");
  return Response.json(await carregarRankingDia(dia));
}

export async function POST(request: NextRequest) {
  const entrada = parseRanking(await request.json().catch(() => null));
  if (!entrada) return Response.json({ erro: "payload_invalido" }, { status: 400 });
  await salvarRankingDia(entrada);
  // Acorda o stream: as telas abertas recebem o novo placar de imediato, sem
  // esperar o polling de segurança do hub.
  publicar();
  return Response.json({ ok: true });
}
