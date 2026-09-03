import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

// Sessão do painel admin. Antes a senha era uma constante no bundle do
// cliente ("automind" em constants.ts) — qualquer visitante do stand que
// abrisse o DevTools zerava o ranking do dia. Agora a senha só existe como
// variável de ambiente no servidor e o que o browser recebe é um cookie
// httpOnly assinado, que ele não consegue ler nem forjar.

const COOKIE = "expo_admin";
const VALIDADE_S = 60 * 60 * 8; // um dia de feira

function segredo(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET não definida (ou curta demais). Gere uma com `node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` e ponha no .env.local.",
    );
  }
  return s;
}

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("hex");
}

// Comparação em tempo constante: um `===` em string vaza, pelo tempo de
// resposta, quantos caracteres iniciais bateram — o que permite descobrir a
// assinatura (ou a senha) byte a byte.
function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function senhaConfere(tentativa: unknown): boolean {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) {
    throw new Error("ADMIN_PASSWORD não definida no .env.local — o painel admin fica inacessível até definir.");
  }
  if (typeof tentativa !== "string") return false;
  return iguaisSeguro(tentativa, esperada);
}

export async function abrirSessaoAdmin(): Promise<void> {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_S;
  // O nonce garante que dois logins seguidos não gerem o mesmo token.
  const payload = `${expira}.${randomBytes(8).toString("hex")}`;
  const token = `${payload}.${assinar(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VALIDADE_S,
  });
}

export async function fecharSessaoAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function sessaoAdminValida(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const [expira, nonce, assinatura] = partes;
  if (!iguaisSeguro(assinatura, assinar(`${expira}.${nonce}`))) return false;
  return Number(expira) > Math.floor(Date.now() / 1000);
}

// Guarda para os handlers do painel: devolve a resposta 401 pronta quando a
// sessão não vale, ou null quando pode seguir.
export async function exigirAdmin(): Promise<Response | null> {
  if (await sessaoAdminValida()) return null;
  return Response.json({ erro: "nao_autorizado" }, { status: 401 });
}
