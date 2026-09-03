import "server-only";
import { readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

// Leitura e gravação de public/planta_layout.json — o arquivo que scene.ts
// busca por HTTP no boot (loadPlanta). Fica em src/lib/server/** porque só o
// servidor toca no disco: a tela do editor manda o JSON pronto pela rota
// /api/admin/planta, que exige a sessão de admin.
//
// Até 26/08/2026 esse arquivo só era escrito por fora (o editor 3d_plant, que
// não existe mais no repositório) ou à mão — daí o .bak-20260824103619 que
// está versionado ao lado dele. O editor de dentro do jogo mantém a mesma
// convenção de backup.

const ARQUIVO = "planta_layout.json";
const PREFIXO_BAK = `${ARQUIVO}.bak-`;
const BACKUPS_MANTIDOS = 10;
/** Teto de tamanho do corpo aceito. A planta de hoje tem ~50 KB; 8 MB é folga de duas ordens de grandeza e ainda barra um POST forjado querendo encher o disco. */
const TETO_BYTES = 8 * 1024 * 1024;

function pastaPublica(): string {
  return join(process.cwd(), "public");
}

export async function lerPlanta(): Promise<unknown> {
  const bruto = await readFile(join(pastaPublica(), ARQUIVO), "utf8");
  return JSON.parse(bruto);
}

export interface PlantaValidada {
  version?: number;
  theme?: Record<string, unknown>;
  elements: unknown[];
  [k: string]: unknown;
}

/**
 * Barra o que quebraria o jogo no boot. Não valida elemento por elemento de
 * propósito: o editor é ferramenta de desenvolvedor e um tipo desconhecido
 * simplesmente não é desenhado (ver o else-if de buildTerminal). O que não
 * pode passar é a forma do arquivo — sem `elements` a cena inteira falha.
 */
export function validarPlanta(corpo: unknown): { ok: true; planta: PlantaValidada } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "planta_nao_e_objeto" };
  const p = corpo as PlantaValidada;
  if (!Array.isArray(p.elements)) return { ok: false, erro: "elements_ausente" };
  if (p.theme != null && (typeof p.theme !== "object" || Array.isArray(p.theme))) return { ok: false, erro: "theme_invalido" };
  for (const e of p.elements) {
    if (!e || typeof e !== "object") return { ok: false, erro: "elemento_nao_e_objeto" };
    const el = e as Record<string, unknown>;
    if (typeof el.type !== "string" || !el.type) return { ok: false, erro: "elemento_sem_type" };
    for (const campo of ["p", "r", "s"] as const) {
      const v = el[campo];
      if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        return { ok: false, erro: `elemento_${campo}_invalido` };
      }
    }
  }
  return { ok: true, planta: p };
}

/** Carimbo do nome de backup, no mesmo formato do .bak que já está versionado (AAAAMMDDhhmmss). */
function carimbo(agora: Date): string {
  const d = (n: number) => String(n).padStart(2, "0");
  return (
    `${agora.getFullYear()}${d(agora.getMonth() + 1)}${d(agora.getDate())}` +
    `${d(agora.getHours())}${d(agora.getMinutes())}${d(agora.getSeconds())}`
  );
}

/** Mantém só os N backups mais recentes — o editor salva com frequência e a pasta public/ é servida inteira. */
async function podarBackups(dir: string): Promise<void> {
  const nomes = (await readdir(dir)).filter((n) => n.startsWith(PREFIXO_BAK)).sort();
  await Promise.all(nomes.slice(0, Math.max(0, nomes.length - BACKUPS_MANTIDOS)).map((n) => unlink(join(dir, n)).catch(() => {})));
}

export interface ResultadoGravacao {
  backup: string | null;
  bytes: number;
}

/**
 * Grava a planta com backup do arquivo anterior. A escrita é feita num
 * `.tmp` e renomeada por cima: rename é atômico no mesmo volume, então o
 * jogo nunca chega a buscar um JSON pela metade se der F5 no meio do save.
 */
export async function gravarPlanta(planta: PlantaValidada): Promise<ResultadoGravacao> {
  const dir = pastaPublica();
  const alvo = join(dir, ARQUIVO);
  const texto = JSON.stringify(planta, null, 1);
  const bytes = Buffer.byteLength(texto, "utf8");
  if (bytes > TETO_BYTES) throw new Error("planta_grande_demais");

  let backup: string | null = null;
  try {
    const anterior = await readFile(alvo, "utf8");
    backup = `${PREFIXO_BAK}${carimbo(new Date())}`;
    await writeFile(join(dir, backup), anterior, "utf8");
  } catch {
    // primeira gravação (ou arquivo ausente) — segue sem backup
    backup = null;
  }

  const tmp = `${alvo}.tmp`;
  await writeFile(tmp, texto, "utf8");
  await rename(tmp, alvo);
  await podarBackups(dir).catch(() => {});
  return { backup, bytes };
}

/** Nomes dos backups existentes, do mais novo pro mais antigo. */
export async function listarBackups(): Promise<string[]> {
  const nomes = (await readdir(pastaPublica())).filter((n) => n.startsWith(PREFIXO_BAK));
  return nomes.sort().reverse();
}

/** Conteúdo de um backup, para o editor poder voltar atrás. O nome é conferido contra a lista — nada de path traversal vindo do corpo do request. */
export async function lerBackup(nome: string): Promise<unknown> {
  if (!(await listarBackups()).includes(nome)) throw new Error("backup_inexistente");
  return JSON.parse(await readFile(join(pastaPublica(), nome), "utf8"));
}
