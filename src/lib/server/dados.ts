import "server-only";
import { sbServer } from "./supabase";
import { hojeStr, diaValido } from "./dia";
import type { Lead, LeadRow, RankingEntry } from "../tipos";

// Toda conversa com o Supabase acontece aqui. As telas não sabem que existe um
// Supabase: elas falam com /api/**, e é este módulo que traduz.

// ---------------------------------------------------------------- validação
// O corpo dos POST vem da rede e não pode ser confiado. Antes, com o insert
// saindo direto do browser, dava pra mandar `pontos: 999999` pelo console e
// liderar o ranking do dia; agora tudo passa por aqui.

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function inteiro(v: unknown, min: number, max: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function parseLead(body: unknown): Lead | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const lead: Lead = {
    nome: texto(b.nome, 120),
    empresa: texto(b.empresa, 120),
    whats: texto(b.whats, 40),
    cargo: texto(b.cargo, 120) || undefined,
    email: texto(b.email, 160) || undefined,
  };
  // Mesma exigência mínima que a LeadScreen já fazia no cliente.
  if (!lead.nome || !lead.whats) return null;
  return lead;
}

export function parseRanking(body: unknown): Omit<RankingEntry, "dia"> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const nome = texto(b.nome, 120);
  if (!nome) return null;
  return {
    nome,
    whats: texto(b.whats, 40),
    empresa: texto(b.empresa, 120),
    pontos: inteiro(b.pontos, 0, 100_000),
    carregados: inteiro(b.carregados, 0, 10_000),
    mods: Array.isArray(b.mods) ? b.mods.slice(0, 40).map((m) => texto(m, 60)).filter(Boolean) : [],
  };
}

// ------------------------------------------------------------------ ranking

export async function carregarRankingDia(dia: string | null): Promise<RankingEntry[]> {
  const { data, error } = await sbServer()
    .from("expo_ranking")
    .select("*")
    .eq("dia", diaValido(dia))
    .order("pontos", { ascending: false });
  if (error) {
    console.error("[ranking] falha ao carregar:", error);
    return [];
  }
  // Mantém só a melhor pontuação por jogador (whats, ou nome quando o whats
  // não foi informado) — mesma regra da versão anterior.
  const best = new Map<string, RankingEntry>();
  (data as unknown as RankingEntry[]).forEach((e) => {
    const k = e.whats || e.nome;
    if (!best.has(k) || best.get(k)!.pontos < e.pontos) best.set(k, e);
  });
  return [...best.values()].sort((a, b) => b.pontos - a.pontos);
}

export async function salvarRankingDia(entrada: Omit<RankingEntry, "dia">): Promise<void> {
  const { error } = await sbServer().from("expo_ranking").insert({ ...entrada, dia: hojeStr() });
  if (error) console.error("[ranking] falha ao salvar:", error);
}

export async function zerarRankingDia(): Promise<void> {
  const { error } = await sbServer().from("expo_ranking").delete().eq("dia", hojeStr());
  if (error) console.error("[ranking] falha ao zerar:", error);
}

// -------------------------------------------------------------------- leads

// `email` e `cargo` são colunas relativamente novas em expo_leads. Se o banco
// do stand ainda não tiver recebido o ALTER TABLE, o PostgREST devolve
// PGRST204/42703 e o insert INTEIRO falha — o lead se perderia por causa de
// dois campos acessórios. Nesse caso, e só nele, regrava sem os dois: a
// captação não pode depender da migração ter sido feita.
// 23505 = já existe (whats já cadastrado hoje) — não é erro, é esperado.
export async function confirmarLead(lead: Lead): Promise<void> {
  const reg = { ...lead, dia: hojeStr(), lgpd_ts: new Date().toISOString() };
  const { error } = await sbServer().from("expo_leads").insert(reg);
  if (!error || error.code === "23505") return;
  if (error.code === "PGRST204" || error.code === "42703") {
    console.warn("[leads] expo_leads sem as colunas email/cargo — regravando sem elas. Falta rodar o ALTER TABLE.", error);
    const { email, cargo, ...base } = reg;
    void email;
    void cargo;
    const { error: e2 } = await sbServer().from("expo_leads").insert(base);
    if (e2 && e2.code !== "23505") console.error("[leads] falha no fallback:", e2);
    return;
  }
  console.error("[leads] falha ao inserir:", error);
}

export async function atualizarLeadPosJogo(whats: string, pontos: number): Promise<void> {
  const sb = sbServer();
  const { data } = await sb.from("expo_leads").select("jogos, melhor_pontos").eq("whats", whats).single();
  if (!data) return;
  const atual = data as { jogos?: number; melhor_pontos?: number };
  await sb
    .from("expo_leads")
    .update({
      jogos: (atual.jogos || 0) + 1,
      melhor_pontos: Math.max(atual.melhor_pontos || 0, pontos),
    })
    .eq("whats", whats);
}

export async function listarLeads(): Promise<LeadRow[]> {
  const { data, error } = await sbServer().from("expo_leads").select("*");
  if (error) {
    console.error("[leads] falha ao listar:", error);
    return [];
  }
  return data as unknown as LeadRow[];
}

// -------------------------------------------------------------------- export

// O CSV passa a ser montado no servidor: é o único lugar que ainda pode ler a
// tabela inteira de leads, e assim o browser recebe só o arquivo pronto.
export async function montarCSV(): Promise<string> {
  const esc = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const sb = sbServer();
  const [{ data: leads }, { data: rank }] = await Promise.all([
    sb.from("expo_leads").select("*"),
    sb.from("expo_ranking").select("*").order("dia").order("pontos", { ascending: false }),
  ]);
  let csv = "\ufeffnome;empresa;cargo;whatsapp;email;dia;lgpd_ts;jogos;melhor_pontos\r\n";
  ((leads as unknown as LeadRow[]) || []).forEach((l) => {
    csv += [l.nome, l.empresa, l.cargo, l.whats, l.email, l.dia, l.lgpd_ts, l.jogos || 0, l.melhor_pontos || 0]
      .map(esc)
      .join(";") + "\r\n";
  });
  let diaAtual: string | null = null;
  ((rank as unknown as RankingEntry[]) || []).forEach((e) => {
    if (e.dia !== diaAtual) {
      diaAtual = e.dia;
      csv += "\r\n" + esc("ranking " + diaAtual) + "\r\n";
    }
    csv += [e.nome, e.empresa, e.whats, e.pontos, e.carregados, (e.mods || []).join("|")].map(esc).join(";") + "\r\n";
  });
  return csv;
}

export { hojeStr };
