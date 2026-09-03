import type { NextRequest } from "next/server";
import { exigirAdmin } from "@/lib/server/admin-session";
import { lerPlanta, gravarPlanta, validarPlanta, listarBackups, lerBackup } from "@/lib/server/planta";

export const dynamic = "force-dynamic";

// A planta é o arquivo de que a cena inteira nasce — quem escreve nela
// escreve o jogo. Por isso as três rotas exigem a mesma sessão do painel
// administrativo (cookie httpOnly assinado, ver admin-session.ts): o editor é
// para os desenvolvedores do projeto, não para o visitante do stand.

/** Planta em vigor + backups disponíveis. O editor abre a partir daqui em vez do /planta_layout.json estático, pra não pegar uma cópia de cache do browser. */
export async function GET() {
  const barrado = await exigirAdmin();
  if (barrado) return barrado;
  try {
    return Response.json({ planta: await lerPlanta(), backups: await listarBackups() });
  } catch (err) {
    return Response.json({ erro: "falha_ao_ler", detalhe: String(err) }, { status: 500 });
  }
}

/** Grava a planta editada (com backup do arquivo anterior). */
export async function PUT(request: NextRequest) {
  const barrado = await exigirAdmin();
  if (barrado) return barrado;
  const corpo = await request.json().catch(() => null);
  const conferida = validarPlanta(corpo);
  if (!conferida.ok) return Response.json({ erro: conferida.erro }, { status: 400 });
  try {
    const { backup, bytes } = await gravarPlanta(conferida.planta);
    return Response.json({ ok: true, backup, bytes, elementos: conferida.planta.elements.length });
  } catch (err) {
    return Response.json({ erro: "falha_ao_gravar", detalhe: String(err) }, { status: 500 });
  }
}

/** Devolve o conteúdo de um backup — o editor carrega no rascunho e o desenvolvedor decide se salva por cima. */
export async function POST(request: NextRequest) {
  const barrado = await exigirAdmin();
  if (barrado) return barrado;
  const corpo = (await request.json().catch(() => null)) as { backup?: unknown } | null;
  if (typeof corpo?.backup !== "string") return Response.json({ erro: "backup_ausente" }, { status: 400 });
  try {
    return Response.json({ planta: await lerBackup(corpo.backup) });
  } catch {
    return Response.json({ erro: "backup_inexistente" }, { status: 404 });
  }
}
