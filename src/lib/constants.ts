// O nome do ícone vem do mapa de src/components/Icone.tsx, e o tipo vem de lá
// junto: assim um módulo novo com ícone inexistente não compila, em vez de
// aparecer como buraco na tela do visitante.
import type { NomeIcone } from "@/components/Icone";

export const DURACAO_TURNO = 180; // s — partida única de 3 min. A escolha de duração saiu do montador
// (sel.rodadas fica sempre em 1), então este valor É a partida inteira — não mais a fatia de uma rodada.
export const VOL_MEDIO = 30; // m³ por caminhão expedido
/**
 * Frota animada de cada lado da simulação, e o intervalo com que o lado
 * AutoLoad manda um caminhão novo para a portaria.
 *
 * O manual fica em 3 e continua liberando o próximo só quando o anterior sai do
 * check-in: a fila de alertas dele é de servidor único (promoverAlertaManual
 * ativa um alerta por vez), então caminhão a mais ali não vira caminhão
 * expedido, vira caminhão parado esperando o visitante chegar nele. E a
 * chegada um-a-um É o roteiro daquele lado.
 *
 * No AutoLoad o que muda não é onde o caminhão nasce — é de quanto em quanto
 * tempo ele chega. TODO caminhão continua nascendo no começo da rota e passando
 * por agendamento, pátio e check-in como qualquer outro; o que a automação faz
 * é encurtar o intervalo entre uma chegada e a seguinte. É literalmente o que o
 * módulo de Agendamento promete: slots de chegada em vez da rajada das 8h.
 *
 * `N_TRUCKS_AUTO` é o TAMANHO DA FROTA, não quantos aparecem de uma vez: com
 * cadência de 14 s e volta de 82,2 s, ficam ~4,8 caminhões no pátio em média e
 * 6 no pico, e o sexto só entra por volta dos 70 s de turno.
 *
 * Medido com a rota do planta_layout.json (volta de 82,2 s, 6 paradas de 3 s)
 * em 180 s de turno. "encontros/par" é a média por segundo de pares de
 * caminhões a menos de 45 u um do outro, dividida pelo número de pares — a
 * medida de aglomeração que não infla só porque a frota cresceu:
 *
 *     3, entrando um a um (como era) -> 6 expedidos | dist.mín 19 u | 0,043
 *     6, cadência de 14 s            -> 9 expedidos | dist.mín 24 u | 0,020  <- atual
 *     7, cadência de 14 s            -> 10 expedidos | dist.mín 19 u | 0,031
 *     7, cadência de 12 s            -> 11 expedidos | dist.mín 25 u | 0,024
 *
 * Repare que a configuração atual aglomera MENOS que a de hoje, e nenhum par de
 * caminhões chega tão perto quanto os de hoje chegam: quem entra espaçado por
 * 14 s entra 196 u atrás do anterior, e a volta absorve isso sem comboio. Foi
 * assim que a tentativa anterior — a frota inteira enfileirada no acesso, 0,188
 * por par — foi descartada.
 *
 * Baixar a cadência daqui ainda rende (a tabela mostra até 11), mas custa
 * caminhão na tela, render na TV do estande e ~0,1 evento/s a mais no
 * #auto-console. Se mexer, meça os encontros de novo.
 */
export const N_TRUCKS_MAN = 3;
export const N_TRUCKS_AUTO = 6;
export const CADENCIA_AUTO_S = 14;

export const JORNADA_MS = 2600;
export const AGUARDO_MS = 10000;

export const LOGO_AUTOLOAD_SVG =
  '<svg viewBox="0 0 1920 592" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M190.38,554.22C85.33,554.22-.13,468.75-.13,363.7c0-90.05,73.25-163.29,163.29-163.29,60.02,0,108.86,48.84,108.86,108.86h-108.86c-30.01,0-54.43,24.42-54.43,54.43,0,45.02,36.62,81.65,81.65,81.65,75.03,0,136.07-61.05,136.07-136.08,0-90.03-73.25-163.29-163.29-163.29V37.13c150.06,0,272.15,122.09,272.15,272.14,0,135.07-109.88,244.94-244.93,244.94Z"/><path d="M683.2,232.69c-28.15-16.6-65.14-16.1-96.52,1.28l-9.91,5.5,10.98,19.81,9.92-5.48c24.39-13.52,52.75-14.13,74.02-1.59,16.73,9.85,28.02,27.2,33.02,50.11-29.19-16.13-64.05-18-92.98-4.08-25.26,12.17-40.34,34.67-40.34,60.21,0,43.63,36.58,66.47,72.72,66.47,22.31,0,43.19-8.17,58.79-23.02,12.49-11.89,27.38-33.79,27.38-70.71,0-45.63-16.72-80.62-47.09-98.5ZM707.63,331.65c-.19,48.76-31.99,70.59-63.51,70.59-24.1,0-50.06-13.7-50.06-43.79,0-16.87,10.03-31.38,27.51-39.79,8.92-4.3,20.01-6.89,31.95-6.89,17.07,0,35.85,5.31,52.47,18.56l1.63,1.32Z"/><path d="M1623.19,232.69c-28.15-16.6-65.13-16.1-96.5,1.28l-9.93,5.5,10.99,19.81,9.91-5.48c24.39-13.52,52.76-14.13,74.02-1.59,16.72,9.85,28.03,27.2,33.02,50.11-29.17-16.13-64.05-18-92.98-4.08-25.26,12.17-40.34,34.67-40.34,60.21,0,43.63,36.59,66.47,72.72,66.47,22.31,0,43.19-8.17,58.79-23.02,12.49-11.89,27.39-33.79,27.39-70.71,0-45.63-16.72-80.62-47.1-98.5ZM1647.63,331.65c-.19,48.76-32,70.59-63.52,70.59-24.1,0-50.06-13.7-50.06-43.79,0-16.87,10.04-31.38,27.51-39.79,8.93-4.3,20.02-6.89,31.96-6.89,17.06,0,35.85,5.31,52.47,18.56l1.63,1.32Z"/><path d="M1031.2,398.02c-15.65,5.65-27.23,5.97-34.4.93-13.01-9.13-14.51-37.16-14.51-57.44v-97.94h47.71v-22.66h-47.71v-40.87h-22.67v161.47c0,29.19,2.87,61.05,24.15,75.99,7.24,5.09,15.91,7.64,25.93,7.64,8.73,0,18.48-1.95,29.19-5.82l10.66-3.84-7.7-21.31-10.66,3.85Z"/><path d="M1148.09,221.18c-63.67,0-86.27,54.88-86.27,101.85s22.6,101.87,86.27,101.87,86.27-54.88,86.27-101.87-22.6-101.85-86.27-101.85ZM1148.09,402.24c-60.54,0-63.6-65.97-63.6-79.2s3.07-79.19,63.6-79.19,63.6,65.97,63.6,79.19-3.07,79.2-63.6,79.2Z"/><path d="M1406.93,221.18c-63.67,0-86.25,54.88-86.25,101.85s22.58,101.87,86.25,101.87,86.27-54.88,86.27-101.87-22.6-101.85-86.27-101.85ZM1406.93,402.24c-60.52,0-63.59-65.97-63.59-79.2s3.07-79.19,63.59-79.19,63.6,65.97,63.6,79.19-3.07,79.2-63.6,79.2Z"/><path d="M898.35,336.66c0,43.5-19.11,65.57-56.79,65.57s-56.78-22.07-56.78-65.57v-108.93h-22.66v108.93c0,56.07,28.96,88.24,79.45,88.24s79.46-32.17,79.46-88.24v-108.93h-22.67v108.93Z"/><rect x="1266.17" y="139.37" width="22.66" height="278.71"/><path d="M1838.35,139.37v110.59c-13.71-17.13-34.29-28.78-63.6-28.78-63.67,0-86.27,54.88-86.27,101.85s22.6,101.87,86.27,101.87,86.27-54.88,86.27-101.87v-183.66h-22.66ZM1774.75,402.24c-60.54,0-63.6-65.97-63.6-79.2s3.07-79.19,63.6-79.19,63.6,65.97,63.6,79.19-3.07,79.2-63.6,79.2Z"/><path d="M1905.86,167.39l-3.44-8.43h-1.89v8.43h-3.97v-20.72h5.74c4.77,0,7.04,2.3,7.04,6.2,0,2.59-.92,4.44-3.13,5.28l3.9,9.24h-4.24ZM1900.52,155.68h2.03c1.76,0,2.81-.85,2.81-2.86s-1.05-2.88-2.81-2.88h-2.03v5.74ZM1902.35,174.68c-9.73,0-17.65-7.91-17.65-17.65s7.93-17.65,17.65-17.65,17.65,7.93,17.65,17.65-7.91,17.65-17.65,17.65ZM1902.35,142.25c-8.14,0-14.78,6.63-14.78,14.78s6.63,14.78,14.78,14.78,14.79-6.62,14.79-14.78-6.63-14.78-14.79-14.78Z"/></svg>';

export interface Modulo {
  icone: NomeIcone;
  nome: string;
  plat: string;
  desc: string;
  sem: string;
  com: string;
}

export const MODULOS: Record<string, Modulo> = {
  agendamento: { icone: "agendamento", nome: "Agendamento", plat: "AutoLoad", desc: "Slots de chegada — fim da rajada na portaria",
    sem: "Todo mundo chega junto e a portaria trava", com: "Ninguém mais espera a rajada das 8h" },
  autochecker: { icone: "autochecker", nome: "AutoChecker", plat: "AutoChecker", desc: "Documentos validados antes de sair da base",
    sem: "Doc vencido só aparece na portaria", com: "Caminhão só sai da base com doc válido" },
  checkin: { icone: "checkin", nome: "Check-in Self-service", plat: "AutoLoad", desc: "Totem valida E-Ticket, motorista e placa",
    sem: "Atendente digita placa e motorista", com: "Balcão livre — o motorista se atende" },
  filas: { icone: "filas", nome: "Controle de Filas", plat: "AutoLoad", desc: "Chamada automática — ninguém vai a pé no pátio",
    sem: "Um funcionário vai a pé chamar cada motorista", com: "Ninguém atravessa o pátio a pé" },
  vistoria: { icone: "vistoria", nome: "Vistoria Digital", plat: "AutoLoad", desc: "Checklists dinâmicos no dispositivo móvel",
    sem: "Checklist em papel, arquivado numa pasta", com: "Nada de pasta: foto e histórico no ato" },
  acesso: { icone: "acesso", nome: "Controle de Acesso", plat: "AutoLoad", desc: "LPR + cancelas automáticas",
    sem: "Porteiro anota a placa e sobe a cancela", com: "Cancela abre sem porteiro na guarita" },
  pesagem: { icone: "pesagem", nome: "Pesagem Integrada", plat: "AutoLoad", desc: "Balança no sistema + recálculo de PBTC",
    sem: "Peso vai do visor pra planilha", com: "Zero digitação entre balança e sistema" },
  carga: { icone: "carga", nome: "Automação de Carga", plat: "AutoLoad", desc: "Preset travado + intertravamentos de segurança",
    sem: "Nada impede carregar sem aterramento", com: "Impossível carregar sem aterrar" },
  checkout: { icone: "checkout", nome: "Check-out & NF-e", plat: "AutoLoad", desc: "Documento fiscal sai no totem, sem sala de espera",
    sem: "Motorista espera a NF-e na sala", com: "Sala de espera vazia" },
  dashboard: { icone: "dashboard", nome: "Dashboard & Inventário", plat: "AutoLoad", desc: "Telemetria ao vivo + fechamento exato de estoque",
    sem: "Fechamento de estoque no caderno", com: "Estoque fecha sozinho no fim do turno" },
};
export const ORDEM_MODS = Object.keys(MODULOS);

/**
 * O cartão do alerta diz O QUE FAZER; QUEM é o caminhão fica na ficha do canto
 * (#missao-canto / FichaMotorista). Por isso nenhum `tx` daqui nomeia a placa:
 * ela aparecia nos dois lugares e a mesma linha era lida duas vezes.
 *
 * A troca tem uma consequência de jogo, e é de propósito: a missão do check-in
 * pede pra tocar a placa certa numa lista, e agora a ÚNICA fonte dessa placa é
 * a ficha. Deixou de ser leitura da mesma linha e virou conferência de verdade
 * — mas isso faz da ficha peça obrigatória da tela, não decoração.
 *
 * O `{placa}` continua sendo substituído em quem renderiza (AlertCard): o campo
 * segue sendo um molde, só não há mais frase que use o marcador.
 */
export interface StageAlerta {
  ico: NomeIcone;
  tx: string;
  acao: string;
}

export interface Stage {
  id: string;
  nome: string;
  mod: string;
  dur: [number, number]; // [manual, automatizado]
  alerta: StageAlerta;
}

// Regra de negócio: o processo MANUAL é sempre mais lento que o automatizado —
// cada etapa declara o tempo automatizado (autoS) e um acréscimo fixo somado
// só no lado manual (extraManualS), nunca os dois tempos soltos.
function stage(id: string, nome: string, mod: string, autoS: number, extraManualS: number, alerta: StageAlerta): Stage {
  return { id, nome, mod, dur: [+(autoS + extraManualS).toFixed(2), autoS], alerta };
}

// Ordem = ordem da trilha de orquestração na tela = ordem do circuito na maquete.
export const STAGES_DEF: Stage[] = [
  stage("checkin", "Check-in na portaria", "checkin", 1.6, 4.4,
    { ico: "autochecker", tx: "Conferir os documentos e liberar o caminhão", acao: "TOQUE para atender no balcão" }),
  stage("patio", "Pátio / chamada", "filas", 2, 6,
    { ico: "filas", tx: "Motorista aguardando chamada no pátio", acao: "TOQUE para mandar o funcionário a pé" }),
  stage("acesso_in", "Acesso de entrada", "acesso", 1.2, 2.8,
    { ico: "acesso", tx: "Liberar a entrada na área operacional", acao: "TOQUE para abrir a cancela" }),
  stage("pesagem1", "Pesagem inicial", "pesagem", 2, 4,
    { ico: "pesagem", tx: "Ler a tara na balança e conferir o PBTC", acao: "TOQUE para lançar o peso na planilha" }),
  stage("vistoria", "Vistoria de entrada", "vistoria", 2.4, 3.6,
    { ico: "vistoria", tx: "Checklist de vistoria no papel", acao: "TOQUE para vistoriar" }),
  stage("carga", "Carregamento na ilha", "carga", 8, 4,
    { ico: "carga", tx: "Caminhão sem aterramento conectado!", acao: "TOQUE para conectar e liberar a carga" }),
  stage("pesagem2", "Pesagem final", "pesagem", 1.6, 3.4,
    { ico: "pesagem", tx: "Conferir o peso final na balança", acao: "TOQUE para validar" }),
  // Check-out ANTES da cancela: o motorista pega a nota e só então a cancela
  // abre — a NF-e é o que autoriza a saída, não o contrário. A ordem desta
  // lista é a trilha da tela e a numeração das etapas; o circuito do caminhão
  // é outro dado (ROTA_PARADAS, em sim/engine.ts), e `checkout` nem está nele,
  // então trocar estas duas não mexe na simulação.
  stage("checkout", "Check-out & NF-e", "checkout", 2, 5,
    { ico: "checkout", tx: "Motorista esperando a NF na sala", acao: "TOQUE para emitir a nota" }),
  stage("saida", "Acesso de saída", "acesso", 1.2, 2.8,
    { ico: "acesso", tx: "Abrir a cancela de saída", acao: "TOQUE para liberar" }),
];

STAGES_DEF.forEach((s) => {
  if (s.dur[0] <= s.dur[1]) {
    console.error(`[STAGES_DEF] "${s.id}": manual (${s.dur[0]}s) deveria ser maior que automatizado (${s.dur[1]}s)`);
  }
});

// Dois "baldes" de pontuação: estratégia (escolha de módulos/modais, escala
// forte) e agilidade (toque rápido, teto baixo).
export const PONTOS = {
  EXPEDIDO_AUTO: 100, TAP_RAPIDO: 5, TAP_CAP_TOTAL: 80, FECHAMENTO_EXATO: 100,
  MODAL_MAR: 40, MODAL_FERRO: 50, MODAL_DUTO: 15, INCIDENTE: 20, CICLO_META_S: 75, CICLO_META_BONUS: 80,
  ETAPA_AUTO: 5,
};
