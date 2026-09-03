// Camada de acesso a dados do lado do browser. Nenhuma destas funções fala com
// o Supabase: todas passam pelos handlers em src/app/api/**, que rodam no
// servidor e são os únicos que têm as credenciais do banco.

import type { Lead, LeadRow, RankingEntry } from "./tipos";

export type { Lead, LeadRow, RankingEntry };

// Uma partida perdida por falha de rede é irritante mas não fatal; travar a
// tela do kiosk esperando o servidor é pior. Então tudo aqui registra o erro e
// segue — mesma postura que o código tinha com os erros do Supabase.
async function pedir<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, init);
    if (!r.ok) {
      console.error(`[api] ${init?.method || "GET"} ${url} -> ${r.status}`);
      return fallback;
    }
    return (await r.json()) as T;
  } catch (e) {
    console.error(`[api] ${init?.method || "GET"} ${url} falhou:`, e);
    return fallback;
  }
}

function json(metodo: string, corpo: unknown): RequestInit {
  return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
}

// ------------------------------------------------------------------ ranking

export function carregarRankingDia(dia?: string): Promise<RankingEntry[]> {
  return pedir<RankingEntry[]>(`/api/ranking${dia ? `?dia=${encodeURIComponent(dia)}` : ""}`, undefined, []);
}

export async function salvarRankingDia(entrada: Omit<RankingEntry, "dia">): Promise<void> {
  await pedir("/api/ranking", json("POST", entrada), null);
}

// -------------------------------------------------------------------- leads

export async function confirmarLead(lead: Lead): Promise<void> {
  await pedir("/api/leads", json("POST", lead), null);
}

export async function atualizarLeadPosJogo(whats: string, pontos: number): Promise<void> {
  await pedir("/api/leads/pos-jogo", json("PUT", { whats, pontos }), null);
}

// -------------------------------------------------------------------- admin
// Estas quatro dependem do cookie de sessão; sem ele o servidor responde 401 e
// elas devolvem o fallback.

export async function loginAdmin(senha: string): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/login", json("POST", { senha }));
    return r.ok;
  } catch (e) {
    console.error("[api] login admin falhou:", e);
    return false;
  }
}

export async function sessaoAdminAtiva(): Promise<boolean> {
  const r = await pedir<{ autenticado: boolean }>("/api/admin/login", undefined, { autenticado: false });
  return r.autenticado;
}

export async function logoutAdmin(): Promise<void> {
  await pedir("/api/admin/login", { method: "DELETE" }, null);
}

export function fetchLeads(): Promise<LeadRow[]> {
  return pedir<LeadRow[]>("/api/admin/leads", undefined, []);
}

export async function zerarRankingDia(): Promise<void> {
  await pedir("/api/admin/ranking", { method: "DELETE" }, null);
}

// O CSV é montado no servidor; aqui só se dispara o download. Vai por fetch em
// vez de um link direto pra conseguir avisar quando a sessão caducou, em vez
// de baixar um arquivo com o JSON do 401 dentro.
export async function baixarCSV(): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/export");
    if (!r.ok) {
      console.error(`[api] export -> ${r.status}`);
      return false;
    }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "leads.csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  } catch (e) {
    console.error("[api] export falhou:", e);
    return false;
  }
}
