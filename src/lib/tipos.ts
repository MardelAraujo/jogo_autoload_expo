// Tipos compartilhados entre o browser e os handlers do servidor. Ficam
// isolados aqui porque src/lib/server/** é "server-only" e não pode ser
// importado pelas telas, nem mesmo por `import type`.

export interface Lead {
  nome: string;
  empresa: string;
  whats: string;
  cargo?: string;
  email?: string;
}

export interface LeadRow extends Lead {
  dia: string;
  lgpd_ts: string;
  jogos?: number;
  melhor_pontos?: number;
}

export interface RankingEntry {
  whats: string;
  nome: string;
  empresa: string;
  pontos: number;
  carregados: number;
  mods: string[];
  dia: string;
}
