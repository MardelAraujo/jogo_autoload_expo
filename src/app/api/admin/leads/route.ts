import { exigirAdmin } from "@/lib/server/admin-session";
import { listarLeads } from "@/lib/server/dados";

export const dynamic = "force-dynamic";

export async function GET() {
  const negado = await exigirAdmin();
  if (negado) return negado;
  return Response.json(await listarLeads());
}
