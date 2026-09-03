"use client";

import { useEffect, useRef } from "react";
import * as engine from "./engine";
import { ROTA_PARADAS } from "./engine";
import { svgDocumento } from "@/components/Icone";

/**
 * Porte do painel "#auto-console" (Orquestração AutoLoad) de
 * `_template_expo3d.html` (~4707-5218 / ANIMACOES_E_ASSETS.md seção 2). Espelha
 * as etapas automatizadas (módulo comprado) que o caminhão decorativo conclui —
 * `engine.ts` empurra em `sim.acQueue` na mesma hora que dispara o alerta manual
 * (`stepRotaAnimada`). Cobre só as 6 etapas com parada física (`ROTA_PARADAS`):
 * `patio`/`acesso_in`/`checkout` são etapas "virtuais" na referência (sem
 * waypoint na planta atual) e ficaram de fora deste porte.
 *
 * Igual ao original, a coreografia (nó acende, documento voa, cena troca, log
 * escreve) é DOM imperativo dentro de um único useEffect — é assim que a
 * referência faz (transições CSS por `offsetLeft` + reflow forçado), reescrever
 * em estado React só complicaria sem ganho.
 */

const AC_DOC: Record<string, [string, string]> = {
  checkin: ["E-Ticket", "portaria"],
  pesagem1: ["Ticket de tara", "ERP"],
  vistoria: ["Checklist", "nuvem"],
  carga: ["Preset", "automação da ilha"],
  pesagem2: ["Peso líquido", "ERP"],
  saida: ["Liberação", "cancela de saída"],
};
const AC_ETAPA_CURTA: Record<string, string> = {
  checkin: "portaria",
  pesagem1: "tara",
  vistoria: "vistoria",
  carga: "carga",
  pesagem2: "peso",
  saida: "saída",
};
const AC_MAX_LINHAS = 4;
// ✓ final das cenas fecha aos 1250ms (.44s + .81s de atraso) — o ciclo dá um respiro pra ele ser lido parado.
const CENA_CICLO_MS = 1300;

const n1 = (v: number) => v.toFixed(1).replace(".", ",");

// ✓ final — igual nas seis, é o que amarra a série.
const cnCheck = (x = 218, y = 34) => `<g transform="translate(${x},${y})"><g class="cn-check">
  <circle r="10" class="cheio" opacity=".16"/>
  <circle r="10" fill="none" stroke="var(--ok)" stroke-width="1.6"/>
  <path d="M-4.4 .4 L-1.2 3.8 L4.8 -3.6" fill="none" stroke="var(--ok)" stroke-width="2.4"
    stroke-linecap="round" stroke-linejoin="round"/>
</g></g>`;

// caminhão de perfil (origem = chão, frente pra direita), ~47 de largura
const cnTruck = (x: number, y: number, cls = "") => `<g transform="translate(${x},${y})"><g class="${cls}">
  <rect class="sol" x="0" y="-17" width="30" height="13" rx="3"/>
  <path class="sol" d="M32 -17 h9 l6 7 v7 h-15 z"/>
  <circle class="sol" cx="8" cy="-2" r="3.4"/>
  <circle class="sol" cx="22" cy="-2" r="3.4"/>
  <circle class="sol" cx="40" cy="-2" r="3.4"/>
</g></g>`;

const cnPlaca = (x: number, y: number, placa: string, cls = "") => `<g transform="translate(${x},${y})"><g class="cn-placa ${cls}">
  <rect class="sol" x="-27" y="-11" width="54" height="22" rx="3"/>
  <rect class="esc" x="-27" y="-11" width="54" height="7" rx="3"/>
  <text class="tx" x="0" y="6.5" text-anchor="middle">${placa}</text>
</g></g>`;

// Símbolo AutoMind vetorizado — contorno único, caixa nativa 100 x 88.7.
const MARCA_D =
  "M62 54.59C61.3 54.34 61.11 53.52 60.84 52.89C60.14 51.24 59.48 49.58 58.76 47.95" +
  "C55.88 41.4 53.18 34.77 50.42 28.18C49.63 26.28 48.83 24.39 48.06 22.49" +
  "C47.75 21.72 47.46 20.63 46.58 20.4C46.31 20.5 46.11 20.61 45.94 20.85" +
  "C45.18 21.89 44.09 25.13 43.47 26.5C42.06 29.59 40.79 32.75 39.43 35.86" +
  "C38.18 38.72 36.88 41.58 35.7 44.47C35.18 45.74 33.07 49.85 33.04 50.9" +
  "C33.03 51.19 33.17 51.41 33.33 51.63C33.99 52.17 37.59 51.94 38.62 51.93" +
  "C42.12 51.91 45.95 52.09 48.91 54.19C52.2 56.53 54.15 60.31 56.06 63.77" +
  "C56.87 65.25 58.04 68.05 59.74 68.5C61.07 68.37 62.04 67.06 62.8 66.07" +
  "C64.37 64.03 65.79 61.83 67.45 59.86C69.98 56.85 72.42 53.78 75.1 50.89" +
  "C79.41 46.24 83.71 42.6 88.52 38.57C90.95 36.54 93.66 34.59 96.48 33.13" +
  "C97.47 32.61 98.95 31.69 99.87 32.76C100.27 33.74 99.46 34.38 98.83 35" +
  "C97.43 36.38 95.99 37.73 94.66 39.18C90.99 43.23 87.66 47.51 84.5 51.96" +
  "C83.42 53.48 81.07 56.35 80.69 58.07C80.33 59.71 82.05 63.07 82.71 64.66" +
  "C84.93 69.96 87.1 75.51 89.5 80.71C90.28 82.42 90.95 84.18 91.7 85.9" +
  "C92 86.61 92.49 87.41 92.14 88.17C91.98 88.4 91.82 88.57 91.53 88.65" +
  "C90.61 88.91 87.33 88.69 86.17 88.69C84.68 88.69 80.06 88.9 78.93 88.66" +
  "C78.42 88.55 77.86 88.36 77.48 87.99C76.68 87.21 76.39 85.89 75.95 84.88" +
  "C74.93 82.5 73.96 80.1 72.97 77.7C72.61 76.81 71.96 74.29 71.05 74.01" +
  "C70.85 74.08 70.73 74.1 70.57 74.25C70.09 74.72 68.56 77.78 67.99 78.64" +
  "C65.82 81.9 63.07 85.09 58.84 85.25C58.06 85.28 57.19 85.38 56.43 85.2" +
  "C51.79 84.12 49.78 81.23 47.62 77.27C46.34 74.91 45.16 72.5 43.85 70.16" +
  "C42.82 68.33 41.75 65.98 39.92 64.8C39.4 64.47 38.81 64.19 38.22 64.02" +
  "C37.03 63.7 30.68 63.62 29.38 63.82C28.41 63.97 27.5 64.52 26.93 65.33" +
  "C26 66.65 23.78 72.5 22.94 74.41C21.43 77.84 19.99 81.31 18.45 84.73" +
  "C17.93 85.89 17.53 87.74 16.33 88.37C15.06 89.04 9.54 88.7 7.8 88.69" +
  "C6.5 88.69 1.74 88.92 0.83 88.64C0.56 88.55 0.37 88.39 0.17 88.19C0 87.87 -0.04 87.52 0.03 87.16" +
  "C0.29 85.89 1.67 83.3 2.23 81.98C4.76 76.06 7.29 70.13 9.94 64.27" +
  "C13.7 55.97 17.13 47.51 20.92 39.22C22.78 35.15 24.51 31.03 26.3 26.93" +
  "C27.41 24.4 28.59 21.89 29.67 19.34C31.41 15.22 33.29 11.16 35.05 7.05" +
  "C35.73 5.47 36.83 2.19 37.95 1.04C38.95 0.01 40.38 0 41.71 0C44.3 0 46.9 0 49.49 0" +
  "C50.88 0 52.42 -0.21 53.72 0.42C54.92 1 55.38 2.22 55.91 3.35C56.96 5.62 57.94 7.93 58.92 10.23" +
  "C62.1 17.71 65.29 25.2 68.61 32.62C69.6 34.83 70.53 37.05 71.48 39.28" +
  "C71.87 40.19 72.58 41.26 72.61 42.27C72.63 43.43 71.4 44.28 70.74 45.1" +
  "C68.83 47.47 66.81 49.74 64.89 52.09C64.16 52.99 63.31 54.7 62 54.59Z";

// A marca no lugar do conferente na portaria: contorno em fio verde + gradiente varrendo.
const cnMarca = (x: number, y: number, w = 32) => {
  const s = w / 100,
    h = 88.7 * s,
    f = (v: number) => +v.toFixed(3);
  return `<defs>
    <linearGradient id="cnMarcaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#660a7a"/><stop offset="1" stop-color="#fa094e"/>
    </linearGradient>
    <clipPath id="cnMarcaClip" clipPathUnits="userSpaceOnUse">
      <rect class="cn-marca-varre" x="-3" y="-3" width="106" height="95"/>
    </clipPath>
  </defs>
  <g class="cn-marca" transform="translate(${f(x - w / 2)},${f(y - h / 2)}) scale(${f(s)})">
    <path class="cn-marca-fio" d="${MARCA_D}" fill="none" stroke="rgba(46,204,113,.55)"
      stroke-width="${f(1.6 / s)}" stroke-linejoin="round"/>
    <path d="${MARCA_D}" fill="url(#cnMarcaGrad)" clip-path="url(#cnMarcaClip)"/>
  </g>`;
};

type Cena = { svg: string; legenda: string };

function cenaCheckin(placa: string): Cena {
  return {
    legenda: "Placa lida — E-Ticket validado",
    svg: `
    <rect class="sol" x="14" y="14" width="20" height="42" rx="4"/>
    <rect class="esc" x="18" y="19" width="12" height="14" rx="2"/>
    <path class="lin" d="M24 36 v8 M18 56 h12"/>
    ${cnPlaca(98, 32, placa)}
    <g transform="translate(98,32)"><g class="cn-scan">
      <rect class="cheio" x="-1.6" y="-15" width="3.2" height="30" rx="1.6" opacity=".85"/>
    </g></g>
    ${cnMarca(167, 34, 32)}
    ${cnCheck()}`,
  };
}

function cenaTara(_placa: string): Cena {
  const tara = n1(13.6 + Math.random() * 1.8);
  return {
    legenda: "Tara conferida e lançada no ERP",
    svg: `
    ${cnTruck(24, 46, "cn-assenta")}
    <rect class="sol" x="12" y="47" width="86" height="7" rx="2"/>
    <path class="lin" d="M20 54 v4 M90 54 v4"/>
    <rect class="sol" x="112" y="16" width="74" height="36" rx="4"/>
    <text class="tx peq" x="149" y="28" text-anchor="middle">TARA</text>
    <g class="cn-rolando"><text class="tx" x="149" y="44" text-anchor="middle">88,8 t</text></g>
    <g transform="translate(149,44)"><g class="cn-fecha">
      <text class="tx forte" x="0" y="0" text-anchor="middle">${tara} t</text></g></g>
    ${cnCheck()}`,
  };
}

function cenaVistoria(): Cena {
  const item = (y: number, cls: string) => `
    <rect class="esc" x="38" y="${y - 6}" width="11" height="11" rx="2"/>
    <path class="lin marcado cn-tick ${cls}" d="M40.5 ${y - 0.6} l2.6 3 l4.4 -6"/>
    <rect class="esc" x="55" y="${y - 2.5}" width="34" height="4" rx="2"/>`;
  return {
    legenda: "Checklist assinado no dispositivo",
    svg: `
    <rect class="sol" x="28" y="8" width="70" height="52" rx="5"/>
    <text class="tx peq" x="38" y="20">VISTORIA</text>
    ${item(32, "")}${item(45, "cn-d1")}${item(56, "cn-d2")}
    <text class="tx forte" x="150" y="30" text-anchor="middle">3 / 3</text>
    <text class="tx peq" x="150" y="42" text-anchor="middle">CONFORMES</text>
    ${cnCheck()}`,
  };
}

function cenaCarga(): Cena {
  return {
    legenda: "Aterramento OK — preset travado",
    svg: `
    <rect class="sol" x="10" y="14" width="28" height="38" rx="4"/>
    <rect class="esc" x="14" y="19" width="20" height="11" rx="2"/>
    <path class="lin cn-desenha" d="M38 26 C 58 26, 60 36, 84 36"/>
    <path class="lin" d="M24 52 v6 h22"/>
    <path class="lin marcado" d="M50 44 v10 M44 54 h12 M46 58 h8 M48 62 h4"/>
    <g transform="translate(50,50)"><g class="cn-faisca">
      <path class="lin marcado" d="M-5 0 h10 M0 -5 v10 M-3.5 -3.5 l7 7 M3.5 -3.5 l-7 7"/>
    </g></g>
    <rect class="esc" x="84" y="16" width="94" height="34" rx="6"/>
    <g transform="translate(87,47)"><g class="cn-nivel">
      <rect class="cheio" x="0" y="-24" width="88" height="24" rx="4" opacity=".34"/>
    </g></g>
    <rect class="lin" x="84" y="16" width="94" height="34" rx="6"/>
    <text class="tx peq" x="131" y="60" text-anchor="middle">PRESET 30 m³</text>
    ${cnCheck()}`,
  };
}

function cenaLiquido(): Cena {
  const bruto = 38 + Math.random() * 4,
    tara = 13.6 + Math.random() * 1.8;
  return {
    legenda: "Peso líquido fechado no ERP",
    svg: `
    ${cnTruck(12, 50)}
    <rect class="sol" x="8" y="51" width="56" height="6" rx="2"/>
    <rect class="sol" x="74" y="8" width="118" height="52" rx="5"/>
    <g class="cn-surge"><text class="tx peq" x="82" y="24">BRUTO</text>
      <text class="tx" x="184" y="24" text-anchor="end">${n1(bruto)} t</text></g>
    <g class="cn-surge cn-d2"><text class="tx peq" x="82" y="37">TARA</text>
      <text class="tx" x="184" y="37" text-anchor="end">${n1(tara)} t</text></g>
    <path class="lin cn-desenha cn-d3" d="M82 43 h102"/>
    <text class="tx peq" x="82" y="55">LÍQUIDO</text>
    <g transform="translate(184,55)"><g class="cn-fecha">
      <text class="tx forte" x="0" y="0" text-anchor="end">${n1(bruto - tara)} t</text></g></g>
    ${cnCheck()}`,
  };
}

function cenaCancela(placa: string): Cena {
  return {
    legenda: "Cancela liberada — saída registrada",
    svg: `
    <path class="lin" d="M6 58 H200"/>
    <rect class="sol" x="143" y="34" width="7" height="24" rx="2"/>
    <g transform="translate(143,40)"><g class="cn-braco">
      <rect class="sol" x="-34" y="-2.6" width="34" height="5.2" rx="2.6"/>
      <rect class="cheio" x="-26" y="-2.6" width="7" height="5.2" opacity=".5"/>
      <rect class="cheio" x="-12" y="-2.6" width="7" height="5.2" opacity=".5"/>
    </g></g>
    <rect class="sol" x="160" y="22" width="16" height="30" rx="4"/>
    <circle class="cn-luz-v" fill="#e74c3c" cx="168" cy="31" r="4.4"/>
    <circle class="cn-luz-g" fill="var(--ok)" cx="168" cy="43" r="4.4"/>
    ${cnTruck(70, 58, "cn-entra")}
    <text class="tx peq" x="10" y="18">${placa}</text>
    ${cnCheck(218, 20)}`,
  };
}

const CENA_POR_ETAPA: Record<string, (placa: string) => Cena> = {
  checkin: cenaCheckin,
  pesagem1: cenaTara,
  vistoria: cenaVistoria,
  carga: cenaCarga,
  pesagem2: cenaLiquido,
  saida: cenaCancela,
};

export function AutoConsole() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const semMovimento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

    let acDocs = 0;
    let acUltimoNo: HTMLElement | null = null;
    let cenaAtiva: { id: string; t0: number } | null = null;
    let lastSeq = 0;
    let rodadaAtual = 0;

    function limparPalco() {
      cenaAtiva = null;
      const palco = $("#ac-palco");
      if (!palco) return;
      palco.setAttribute("data-cena", "");
      $("#ac-cena")!.innerHTML = "";
      $("#ac-legenda")!.textContent = "";
    }

    function montarConsoleAuto() {
      acDocs = 0;
      acUltimoNo = null;
      $("#ac-cont")!.textContent = "0 documentos";
      $("#ac-log")!.innerHTML = "";
      limparPalco();
      const trilha = $("#ac-trilha")!;
      trilha.innerHTML =
        ROTA_PARADAS.map((id) => `<div class="ac-no" data-et="${id}"><i></i><b>${AC_ETAPA_CURTA[id] || id}</b></div>`).join("") +
        '<div class="ac-no servidor" data-et="__srv"><i></i><b>sistemas</b></div>';
    }

    function desenharCena(stId: string, placa: string, agora: number) {
      const palco = $("#ac-palco"),
        svg = $<SVGSVGElement>("#ac-cena");
      if (!palco || !svg || !CENA_POR_ETAPA[stId]) return;
      const { svg: markup, legenda } = CENA_POR_ETAPA[stId](placa);
      palco.setAttribute("data-cena", ""); // reset + reflow: sem isso a cena repetida não reinicia a animação
      svg.innerHTML = markup;
      $("#ac-legenda")!.textContent = legenda;
      void palco.offsetWidth;
      palco.setAttribute("data-cena", stId);
      cenaAtiva = { id: stId, t0: agora };
    }

    function tocarCena(stId: string, placa: string) {
      if (!CENA_POR_ETAPA[stId]) return;
      if (cenaAtiva && cenaAtiva.id === stId) return;
      desenharCena(stId, placa, performance.now());
    }

    function repetirCena(stId: string, placa: string) {
      if (!cenaAtiva || cenaAtiva.id !== stId) return;
      const agora = performance.now();
      if (agora - cenaAtiva.t0 < CENA_CICLO_MS) return;
      desenharCena(stId, placa, agora);
    }

    function acender(no: HTMLElement) {
      if (acUltimoNo && acUltimoNo !== no) {
        acUltimoNo.classList.remove("ativo");
        acUltimoNo.classList.add("feito");
      }
      no.classList.remove("feito");
      no.classList.remove("ativo");
      void no.offsetWidth;
      no.classList.add("ativo");
      acUltimoNo = no;
    }

    function escreverLinha(rotulo: string, alvo: string) {
      const log = $("#ac-log")!;
      const el = document.createElement("div");
      el.className = "ac-linha";
      el.innerHTML = `<span>${rotulo}</span><span class="alvo">${alvo}</span><span class="ok esperando">···</span>`;
      log.appendChild(el);
      while (log.children.length > AC_MAX_LINHAS) log.firstChild!.remove();
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 680);
      }, 9100);
      return el;
    }

    function confirmarLinha(el: HTMLElement) {
      const ok = el.querySelector<HTMLElement>(".ok");
      if (!ok) return;
      ok.classList.remove("esperando");
      ok.textContent = "✓ " + (0.2 + Math.random() * 0.4).toFixed(1).replace(".", ",") + " s";
    }

    function autoEtapa(stId: string, placa: string, registrar: boolean) {
      const trilha = $("#ac-trilha")!;
      const no = trilha.querySelector<HTMLElement>(`.ac-no[data-et="${stId}"]`);
      const srv = trilha.querySelector<HTMLElement>(".ac-no.servidor");
      if (!no || !srv) return;
      acender(no);
      tocarCena(stId, placa);
      const [doc, destino] = AC_DOC[stId] || ["Registro", "ERP"];
      const linha = registrar ? escreverLinha(`${svgDocumento(14)} ${doc}`, `${placa} → ${destino}`) : null;
      acDocs++;
      $("#ac-cont")!.textContent = acDocs + (acDocs === 1 ? " documento" : " documentos");

      // voo é o gesto central do painel; sem movimento, o log conta a mesma coisa na hora
      if (semMovimento()) {
        if (linha) confirmarLinha(linha);
        acender(srv);
        return;
      }
      const x0 = no.offsetLeft + no.offsetWidth / 2,
        x1 = srv.offsetLeft + srv.offsetWidth / 2;
      const chip = document.createElement("span");
      chip.className = "ac-doc";
      chip.innerHTML = svgDocumento(14);
      chip.style.left = x0 - 6 + "px";
      trilha.appendChild(chip);
      chip.getBoundingClientRect(); // reflow: sem isso a transição não parte de x0
      chip.style.left = x1 - 6 + "px";
      setTimeout(() => {
        chip.style.opacity = "0";
        acender(srv);
        if (linha) confirmarLinha(linha);
        setTimeout(() => chip.remove(), 290);
      }, 730);
    }

    montarConsoleAuto();

    const poll = setInterval(() => {
      const sim = engine.simRef.current;
      if (!sim) return;
      if (sim.rodadaAtual !== rodadaAtual) {
        rodadaAtual = sim.rodadaAtual;
        lastSeq = 0;
        montarConsoleAuto();
      }
      sim.acQueue
        .filter((e) => e.seq > lastSeq)
        .forEach((e) => {
          lastSeq = e.seq;
          autoEtapa(e.stageId, e.placa, Math.random() < 0.5);
        });
      if (cenaAtiva) repetirCena(cenaAtiva.id, engine.snapshotHUD(sim).placa);
    }, 130);

    return () => clearInterval(poll);
  }, []);

  return (
    <div id="auto-console" ref={rootRef}>
      <div className="ac-head">
        <span className="ac-led" />
        Orquestração AutoLoad
        <span className="cont" id="ac-cont">
          0 documentos
        </span>
      </div>
      <div className="ac-palco" id="ac-palco" data-cena="">
        <svg className="ac-cena" id="ac-cena" viewBox="0 0 240 68" preserveAspectRatio="xMidYMid meet" aria-hidden="true" />
        <span className="ac-legenda" id="ac-legenda" />
      </div>
      <div className="ac-trilha" id="ac-trilha" />
      <div className="ac-log" id="ac-log" />
    </div>
  );
}
