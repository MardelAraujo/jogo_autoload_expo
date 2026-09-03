import { exigirAdmin } from "@/lib/server/admin-session";
import { montarCSV, hojeStr } from "@/lib/server/dados";

export const dynamic = "force-dynamic";

// Devolve o CSV já montado, como download. O browser não precisa mais poder
// varrer a tabela de leads inteira pra gerar o arquivo.
export async function GET() {
  const negado = await exigirAdmin();
  if (negado) return negado;
  return new Response(await montarCSV(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="automind_expopostos_leads_${hojeStr()}.csv"`,
    },
  });
}
