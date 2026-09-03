import type { NextRequest } from "next/server";
import { senhaConfere, abrirSessaoAdmin, sessaoAdminValida, fecharSessaoAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

// GET: a tela pergunta, ao abrir, se o cookie de sessão ainda vale — assim o
// operador não precisa redigitar a senha a cada F5 do kiosk.
export async function GET() {
  return Response.json({ autenticado: await sessaoAdminValida() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { senha?: unknown } | null;
  if (!senhaConfere(body?.senha)) {
    return Response.json({ erro: "senha_invalida" }, { status: 401 });
  }
  await abrirSessaoAdmin();
  return Response.json({ ok: true });
}

export async function DELETE() {
  await fecharSessaoAdmin();
  return Response.json({ ok: true });
}
