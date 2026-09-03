import type { PlantaLayout } from "@/lib/three/scene";

// Cliente HTTP do editor de planta. Mesmo desenho de src/lib/ranking.ts: a
// tela não conhece o disco, só estas quatro chamadas; quem grava é
// /api/admin/planta, que exige a sessão de admin.

export interface PlantaDoServidor {
  planta: PlantaLayout;
  backups: string[];
}

export interface RespostaGravacao {
  ok: true;
  backup: string | null;
  bytes: number;
  elementos: number;
}

/** 401 vira `null` — a tela pede a senha em vez de mostrar erro de rede. */
export async function buscarPlanta(): Promise<PlantaDoServidor | null> {
  const r = await fetch("/api/admin/planta", { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()) as PlantaDoServidor;
}

export async function gravarPlanta(planta: PlantaLayout): Promise<RespostaGravacao | { erro: string }> {
  const r = await fetch("/api/admin/planta", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(planta),
  });
  const corpo = (await r.json().catch(() => ({ erro: "resposta_ilegivel" }))) as
    | RespostaGravacao
    | { erro: string };
  return corpo;
}

export async function restaurarBackup(backup: string): Promise<PlantaLayout | null> {
  const r = await fetch("/api/admin/planta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backup }),
  });
  if (!r.ok) return null;
  return ((await r.json()) as { planta: PlantaLayout }).planta;
}

/** Baixa a planta como arquivo — a saída de emergência quando a máquina que roda o jogo não é a que edita. */
export function baixarPlanta(planta: PlantaLayout): void {
  const blob = new Blob([JSON.stringify(planta, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "planta_layout.json";
  a.click();
  URL.revokeObjectURL(url);
}
