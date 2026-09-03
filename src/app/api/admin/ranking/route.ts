import { exigirAdmin } from "@/lib/server/admin-session";
import { zerarRankingDia } from "@/lib/server/dados";
import { publicar } from "@/lib/server/ranking-hub";

export const dynamic = "force-dynamic";

// Zera o ranking do dia. Continua sendo destrutivo, mas agora exige a sessão
// de admin — antes bastava um DELETE do console de qualquer visitante.
export async function DELETE() {
  const negado = await exigirAdmin();
  if (negado) return negado;
  await zerarRankingDia();
  publicar();
  return Response.json({ ok: true });
}
