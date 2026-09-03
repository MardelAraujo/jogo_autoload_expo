import {
  ArrowLeft, ArrowRight, Brain, CalendarClock, ChartColumn, Check, CircleCheck,
  ClipboardCheck, Cloud, Download, FileText, Fuel, Grid3x3, Map, Maximize, Megaphone,
  OctagonAlert, Pencil, Play, Pointer, Receipt, RotateCw, Save, Scale, ScanLine, ShieldCheck,
  Smartphone, Spline, Trash2, TriangleAlert, Trophy, Undo2, Upload, Wrench, X, Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Ícones monoline do design system AutoMind.
 *
 * O briefing proíbe emoji ("No emoji. Not in product, not in marketing") e manda
 * usar Lucide — que ele descreve como substituição da chapa de ícones original,
 * até a marca entregar os vetores próprios. Aqui o Lucide entra por **pacote npm**,
 * não pelo CDN que o briefing sugere: isto é um totem de estande, e uma tela que
 * depende de rede externa pra desenhar o ícone do módulo é uma tela que fica com
 * buraco quando o wi-fi da feira cai.
 *
 * O acesso é sempre por NOME, nunca importando o componente do Lucide direto na
 * tela. Dois motivos: `constants.ts` é TypeScript puro (sem JSX) e precisa nomear
 * o ícone de cada módulo e de cada alerta; e quando a AutoMind entregar o set
 * vetorial próprio, trocar o valor deste mapa troca o jogo inteiro de uma vez.
 *
 * Uma divergência consciente do briefing: ele diz que o Lucide tem ponta reta
 * ("square caps"), e não tem — o traço do Lucide é `stroke-linecap: round`.
 * Forçar ponta reta numa geometria desenhada para junta redonda deixa farpa nos
 * cantos, então fica a ponta nativa. Onde o briefing e o Lucide discordam sobre
 * o próprio Lucide, vale o Lucide.
 */
export const ICONES = {
  // os dez módulos (constants.ts → MODULOS[].icone)
  agendamento: CalendarClock,
  autochecker: ShieldCheck,
  checkin: Smartphone,
  filas: Megaphone,
  vistoria: ClipboardCheck,
  acesso: ScanLine,
  pesagem: Scale,
  carga: Fuel,
  checkout: Receipt,
  dashboard: ChartColumn,
  // o que vale ponto / placar
  estrategia: Brain,
  agilidade: Zap,
  automacao: CircleCheck,
  manual: Wrench,
  autoload: Cloud,
  troféu: Trophy,
  // simulação
  parado: OctagonAlert,
  documento: FileText,
  toque: Pointer,
  concluir: Check,
  // administração e editor de planta
  planta: Map,
  aviso: TriangleAlert,
  salvar: Save,
  exportar: Download,
  importar: Upload,
  recarregar: RotateCw,
  desfazer: Undo2,
  grade: Grid3x3,
  enquadrar: Maximize,
  apagar: Trash2,
  editar: Pencil,
  tracado: Spline,
  fechar: X,
  iniciar: Play,
  voltar: ArrowLeft,
  avancar: ArrowRight,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

/** O nome existe no mapa? Guarda para os campos `icone`/`ico` que vêm de dado. */
export function eIcone(nome: string): nome is NomeIcone {
  return nome in ICONES;
}

/**
 * Espessura por tamanho, na tabela do briefing: 1,5 px em 16/20 e 2 px de 24 pra
 * cima. É a regra que mantém o peso ÓPTICO do traço constante — 2 px num ícone de
 * 16 lê como negrito ao lado de um de 32.
 */
function espessura(tam: number): number {
  return tam <= 20 ? 1.5 : 2;
}

/**
 * O mesmo ícone de documento, como STRING de SVG.
 *
 * O console do AutoLoad (sim/auto-console.tsx) não é React: ele monta o log e o
 * chip que voa até o servidor com `createElement`/`innerHTML`, porque são
 * dezenas de nós entrando e saindo por turno e reconciliar isso pelo React
 * custaria mais do que o painel inteiro. Os dois pontos que mostravam 📄
 * precisam do desenho em texto, não em componente.
 *
 * O traçado é o `file-text` do Lucide, copiado do `__iconNode` do pacote — não
 * é desenho novo. `stroke-width` já vem convertido: 1,5 px absolutos num
 * quadro de 24 reduzido a `tam` são `1,5 × 24 / tam` em unidades do viewBox,
 * a mesma conta que o `absoluteStrokeWidth` do componente faz.
 */
export function svgDocumento(tam: number): string {
  const traco = ((1.5 * 24) / tam).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="ico-ds" width="${tam}" height="${tam}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${traco}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>` +
    `<path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`
  );
}

export function Icone({
  nome,
  tam = 24,
  className,
  title,
}: {
  nome: NomeIcone;
  /** 16, 20, 24, 32 ou 40 — a escala do briefing. Padrão 24. */
  tam?: 16 | 20 | 24 | 32 | 40;
  className?: string;
  title?: string;
}) {
  const Glifo = ICONES[nome];
  return (
    <Glifo
      className={className ? `ico-ds ${className}` : "ico-ds"}
      size={tam}
      strokeWidth={espessura(tam)}
      absoluteStrokeWidth
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
    />
  );
}
