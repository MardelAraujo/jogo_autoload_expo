import type { PlantaElement, PlantaLayout } from "../scene";
import { camEditor } from "./cena-editor";

/**
 * As operações que mexem na LISTA de elementos (e nos traçados), separadas da
 * cena e da UI. Todas recebem o rascunho e o devolvem alterado no lugar —
 * quem chama é responsável por guardar o histórico antes e remontar a cena
 * depois. Deixar isso aqui, e não dentro do componente React, é o que permite
 * ao painel de propriedades ser só formulário.
 */

/** Tipos nativos que o jogo desenha e que fazem sentido acrescentar pelo editor. */
export interface TipoCatalogo {
  tipo: string;
  nome: string;
  cat: string;
  /** Peças que o jogo indexa por ordem (2 cancelas, 2 balanças…): acrescentar uma terceira não muda o jogo. */
  limitado?: number;
}

export const CATALOGO_NATIVO: TipoCatalogo[] = [
  { tipo: "parque_tanques", nome: "Parque de tanques", cat: "Tancagem" },
  { tipo: "bacia", nome: "Bacia de contenção", cat: "Tancagem" },
  { tipo: "pista", nome: "Pista (traçado)", cat: "Via" },
  { tipo: "cobertura", nome: "Cobertura de carga", cat: "Carregamento", limitado: 2 },
  { tipo: "balanca", nome: "Balança", cat: "Pátio", limitado: 2 },
  { tipo: "guarita", nome: "Guarita", cat: "Portaria", limitado: 2 },
  { tipo: "portaria", nome: "Portaria", cat: "Portaria", limitado: 1 },
  { tipo: "truck_center", nome: "Truck center", cat: "Pátio", limitado: 1 },
  { tipo: "cancela", nome: "Cancela", cat: "Portaria", limitado: 2 },
  { tipo: "totem", nome: "Totem de autoatendimento", cat: "Portaria", limitado: 2 },
  { tipo: "vistoria", nome: "Vistoria", cat: "Portaria", limitado: 2 },
  { tipo: "cabine_vistoria", nome: "Cabine de vistoria", cat: "Portaria" },
  { tipo: "vagas", nome: "Marcação de vagas", cat: "Pátio" },
  { tipo: "grade", nome: "Grade (cerca alta)", cat: "Perímetro" },
  { tipo: "arvore", nome: "Árvore", cat: "Paisagismo" },
  { tipo: "arbusto", nome: "Arbusto", cat: "Paisagismo" },
  { tipo: "arbusto_quadrado", nome: "Arbusto quadrado", cat: "Paisagismo" },
  { tipo: "canteiro", nome: "Canteiro", cat: "Paisagismo" },
  { tipo: "navio", nome: "Navio", cat: "Modais", limitado: 1 },
  { tipo: "ferrovia", nome: "Ferrovia", cat: "Modais", limitado: 1 },
  { tipo: "locomotiva", nome: "Locomotiva", cat: "Modais", limitado: 1 },
  { tipo: "vagao", nome: "Vagão-tanque", cat: "Modais" },
];

/** Nome único dentro da planta — mesma convenção de sufixo do editor antigo. */
function nomeLivre(PL: PlantaLayout, base: string): string {
  const usados = new Set(PL.elements.map((e) => e.name).filter(Boolean));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Onde a peça nova nasce: no centro do que o desenvolvedor está olhando. */
function pontoDeEntrada(): [number, number, number] {
  return [Math.round(camEditor.alvo.x), 0, Math.round(camEditor.alvo.z)];
}

export function novoElemento(PL: PlantaLayout, tipo: string, nome: string, cat: string): number {
  const p = pontoDeEntrada();
  const e: PlantaElement = {
    type: tipo,
    cat,
    name: nomeLivre(PL, nome),
    p,
    r: [0, 0, 0],
    s: [1, 1, 1],
  };
  if (tipo === "pista") {
    // traçado inicial reto e curto, centrado na origem local (a posição vive em `p`)
    e.pista = { points: [[-24, 0], [0, 0], [24, 0]], closed: false, width: 11 };
  }
  PL.elements.push(e);
  return PL.elements.length - 1;
}

/** Cópia profunda de um elemento, deslocada para não nascer exatamente por baixo do original. */
export function duplicarElemento(PL: PlantaLayout, i: number): number | null {
  const orig = PL.elements[i];
  if (!orig) return null;
  const copia = JSON.parse(JSON.stringify(orig)) as PlantaElement;
  copia.name = nomeLivre(PL, `${orig.name || orig.type} (cópia)`);
  copia.p = [orig.p[0] + 16, orig.p[1], orig.p[2]];
  copia.locked = false;
  PL.elements.push(copia);
  return PL.elements.length - 1;
}

export function apagarElemento(PL: PlantaLayout, i: number): void {
  PL.elements.splice(i, 1);
}

// ---------------- traçado (pista e rota) ----------------

export function tracadoDe(e: PlantaElement): { points: number[][]; closed?: boolean } | null {
  if (e.type === "pista") return e.pista ?? null;
  return e.rota ?? null;
}

/** Insere um ponto: no meio do maior vão se o traçado é fechado, na ponta se é aberto (regra do editor de referência). */
export function acrescentarPonto(e: PlantaElement): number | null {
  const t = tracadoDe(e);
  if (!t) return null;
  const P = t.points;
  if (t.closed) {
    let melhor = 0;
    let maior = -1;
    for (let k = 0; k < P.length; k++) {
      const a = P[k];
      const b = P[(k + 1) % P.length];
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
      if (d > maior) {
        maior = d;
        melhor = k;
      }
    }
    const a = P[melhor];
    const b = P[(melhor + 1) % P.length];
    P.splice(melhor + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    ajustarEsperas(e, melhor + 1, 1);
    return melhor + 1;
  }
  const n = P.length;
  const a = P[n - 2] || [P[n - 1][0] - 16, P[n - 1][1]];
  const b = P[n - 1];
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  P.push([b[0] + dx * 18, b[1] + dz * 18]);
  ajustarEsperas(e, P.length - 1, 1);
  return P.length - 1;
}

export function removerPonto(e: PlantaElement, k: number): boolean {
  const t = tracadoDe(e);
  if (!t) return false;
  const minimo = t.closed ? 4 : 2;
  if (t.points.length <= minimo) return false;
  t.points.splice(k, 1);
  ajustarEsperas(e, k, -1);
  return true;
}

/** `rota.waits` é paralelo a `rota.points` — mexer num sem o outro desalinha as paradas do caminhão. */
function ajustarEsperas(e: PlantaElement, k: number, delta: 1 | -1): void {
  const waits = e.rota?.waits;
  if (!waits) return;
  if (delta === 1) waits.splice(k, 0, 0);
  else waits.splice(k, 1);
}

export function alternarLaco(e: PlantaElement): void {
  const t = tracadoDe(e);
  if (!t) return;
  t.closed = !t.closed;
}

export function setLarguraPista(e: PlantaElement, w: number): void {
  if (e.type !== "pista" || !e.pista) return;
  e.pista.width = Math.max(3, Math.min(60, w));
}

export function setEspera(e: PlantaElement, k: number, segundos: number): void {
  if (!e.rota) return;
  if (!Array.isArray(e.rota.waits)) e.rota.waits = e.rota.points.map(() => 0);
  while (e.rota.waits.length < e.rota.points.length) e.rota.waits.push(0);
  e.rota.waits[k] = Math.max(0, Math.min(60, segundos));
}

// ---------------- categorias para a lista lateral ----------------

export interface GrupoLista {
  cat: string;
  itens: { idx: number; e: PlantaElement }[];
}

/** Agrupa por `cat` preservando a ordem de primeira aparição — a mesma leitura do JSON. */
export function agruparPorCategoria(PL: PlantaLayout, filtro: string): GrupoLista[] {
  const busca = filtro.trim().toLowerCase();
  const grupos = new Map<string, GrupoLista>();
  PL.elements.forEach((e, idx) => {
    if (busca && !`${e.name || ""} ${e.type} ${e.cat || ""}`.toLowerCase().includes(busca)) return;
    const cat = e.cat || "Sem categoria";
    let g = grupos.get(cat);
    if (!g) {
      g = { cat, itens: [] };
      grupos.set(cat, g);
    }
    g.itens.push({ idx, e });
  });
  return [...grupos.values()];
}
