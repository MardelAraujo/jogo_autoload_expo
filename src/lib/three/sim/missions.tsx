"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gerarPlaca } from "@/lib/utils";
import { Icone } from "@/components/Icone";

/**
 * ~5 gestos consolidados no lugar dos 16 montarMissao* bespoke da referência
 * (linhas 10655-11130) — simplificação #3 do AGENTS.md do port. Cada etapa do
 * circuito (STAGES_DEF) mapeia pra UM destes gestos (em vez de dois sorteados
 * por alerta como na referência): select (toque na opção certa), timing
 * (toque no tempo certo), checklist (múltiplos toques), slider (arrastar) e
 * counter (toques em sequência) — mesma família de gesto, texto/contexto diferente
 * por etapa, o suficiente pra cada parada continuar tendo "a sua" missão.
 */
export type MissionKind = "select" | "timing" | "checklist" | "slider" | "counter";

export interface MissionConfig {
  kind: MissionKind;
  label: string;
  count?: number;
  items?: string[];
}

const CHECKLIST_VISTORIA = [
  "Pneus e lacres",
  "Aterramento do tanque",
  "EPI do motorista",
  "Extintor e sinalização",
  "Válvulas de fundo",
];

// Porte simplificado de MISSAO_POR_ETAPA (referência, linha 11131).
export const STAGE_MISSAO: Record<string, MissionConfig> = {
  checkin: { kind: "select", label: "Toque na placa correta da lista" },
  patio: { kind: "timing", label: "Chame o motorista na hora certa" },
  acesso_in: { kind: "counter", label: "Carimbar a autorização de entrada", count: 2 },
  pesagem1: { kind: "timing", label: "Trave a leitura da balança no ponto" },
  vistoria: { kind: "checklist", label: "Confira os itens de segurança", items: CHECKLIST_VISTORIA },
  carga: { kind: "counter", label: "Conectar aterramento e liberar a carga", count: 3 },
  pesagem2: { kind: "slider", label: "Arraste para confirmar a pesagem" },
  saida: { kind: "counter", label: "Carimbar a liberação de saída", count: 2 },
  checkout: { kind: "timing", label: "Emita a NF-e no ponto certo" },
};

export function MissionWidget({ config, placa, onDone }: { config: MissionConfig; placa: string; onDone: () => void }) {
  switch (config.kind) {
    case "select":
      return <SelectMission placa={placa} onDone={onDone} />;
    case "timing":
      return <TimingMission onDone={onDone} />;
    case "checklist":
      return <ChecklistMission items={config.items ?? []} onDone={onDone} />;
    case "slider":
      return <SliderMission onDone={onDone} />;
    case "counter":
      return <CounterMission count={config.count ?? 2} onDone={onDone} />;
  }
}

// ---- check-in e afins: toque na opção certa numa lista ----
function SelectMission({ placa, onDone }: { placa: string; onDone: () => void }) {
  const opcoes = useMemo(() => {
    const arr = [placa];
    const n = 3 + Math.floor(Math.random() * 3);
    while (arr.length < n) {
      const p = gerarPlaca();
      if (!arr.includes(p)) arr.push(p);
    }
    return arr.sort(() => Math.random() - 0.5);
  }, [placa]);
  const [errada, setErrada] = useState<string | null>(null);
  return (
    <>
      <div className="missao-placa-hint">Toque na placa correta da lista</div>
      <div className="missao-placas">
        {opcoes.map((p) => (
          <button
            key={p}
            type="button"
            className={`missao-placa-opt${errada === p ? " errada" : ""}`}
            disabled={errada === p}
            onClick={() => (p === placa ? onDone() : setErrada(p))}
          >
            {p}
          </button>
        ))}
      </div>
    </>
  );
}

// ---- pesagem/pátio/check-out: tocar quando o marcador entra na faixa ----
/**
 * Substituiu o "segurar". O gesto de segurar não vingava no totem: ele exige
 * que o dedo fique parado por mais de um segundo numa tela que o visitante
 * está usando às pressas, e QUALQUER coisa que interrompa o ponteiro no meio
 * — escorregar, a palma encostando, o navegador decidindo que aquilo era
 * rolagem — devolve a barra a zero sem explicar nada. Quem tocava e soltava
 * concluía que o botão estava quebrado.
 *
 * Aqui o gesto é o mesmo de todo o resto do jogo: um toque. O marcador varre
 * o trilho de ponta a ponta, e o toque só precisa cair enquanto ele cruza a
 * faixa. Errar não custa a missão — o marcador continua andando e a pessoa
 * tenta de novo; quem cobra o tempo é o limite do próprio alerta.
 *
 * A folga é deliberada: a faixa ocupa um terço do trilho e a varrida leva 1,5
 * s, então a janela de acerto é de quase meio segundo, e ela reaparece a cada
 * ida e volta. É para ser fácil — o que se pede aqui é atenção, não perícia.
 */
/** Onde a faixa de acerto começa e termina, em % do trilho. */
const QTE_ALVO_INI = 34;
const QTE_ALVO_FIM = 66;
/** Tempo de uma varrida de ponta a ponta; a volta leva o mesmo. */
const QTE_VARRIDA_MS = 1500;
/** Quanto tempo o aviso de erro fica na tela. */
const QTE_ERRO_MS = 260;

function TimingMission({ onDone }: { onDone: () => void }) {
  const marcaRef = useRef<HTMLSpanElement>(null);
  /** Posição em % do trilho. Fica num ref, e não no estado, porque quem a lê é
   *  o clique — pôr no estado redesenharia o cartão 60 vezes por segundo. */
  const pos = useRef(0);
  const raf = useRef<number | null>(null);
  const feito = useRef(false);
  const erroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errou, setErrou] = useState(false);

  // Nem o quadro nem o aviso de erro podem sobreviver ao cartão:
  // resolverAlertaManual() age sobre a CABEÇA da fila, então qualquer resto
  // pendente depois da troca de alerta mexeria na missão do caminhão seguinte.
  useEffect(() => {
    const t0 = performance.now();
    const passo = (agora: number) => {
      // Ida e volta num ciclo só: a primeira metade vai de 0 a 1, a segunda
      // desfaz o caminho. Sem `transition` no CSS pelo mesmo motivo da barra
      // que existia aqui antes — o navegador interpolaria por cima do valor
      // recém-escrito, e o marcador desenhado atrasaria em relação ao que o
      // clique lê. É também o que mantém o movimento em
      // prefers-reduced-motion, onde uma transição seria zerada: aqui ele não
      // é enfeite, é a própria mecânica.
      const fase = ((agora - t0) % (QTE_VARRIDA_MS * 2)) / QTE_VARRIDA_MS;
      pos.current = (fase <= 1 ? fase : 2 - fase) * 100;
      if (marcaRef.current) marcaRef.current.style.left = `${pos.current}%`;
      raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (erroTimer.current !== null) clearTimeout(erroTimer.current);
    };
  }, []);

  function tocar() {
    if (feito.current) return;
    if (pos.current >= QTE_ALVO_INI && pos.current <= QTE_ALVO_FIM) {
      feito.current = true;
      onDone();
      return;
    }
    setErrou(true);
    if (erroTimer.current !== null) clearTimeout(erroTimer.current);
    erroTimer.current = setTimeout(() => setErrou(false), QTE_ERRO_MS);
  }

  return (
    <button type="button" className={`missao-qte${errou ? " errou" : ""}`} onClick={tocar}>
      <span className="qte-trilho">
        <span className="qte-alvo" />
        <span className="qte-marca" ref={marcaRef} />
      </span>
      <span className="qte-txt">{errou ? "fora da faixa — tente de novo" : "TOQUE na faixa"}</span>
    </button>
  );
}

// ---- vistoria: checklist de itens ----
function ChecklistMission({ items, onDone }: { items: string[]; onDone: () => void }) {
  const sorteados = useMemo(() => items.slice().sort(() => Math.random() - 0.5).slice(0, 3), [items]);
  const [marcados, setMarcados] = useState<boolean[]>(() => sorteados.map(() => false));
  // O respiro de 220 ms existe pra última marca ser VISTA antes do cartão sair.
  // Guardado num ref e cancelado na desmontagem pelo mesmo motivo das outras
  // missões: resolverAlertaManual() age sobre a cabeça da fila, e um disparo
  // atrasado depois da troca de alerta resolveria de graça a missão do
  // caminhão seguinte.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  function toggle(i: number) {
    const next = marcados.slice();
    next[i] = !next[i];
    setMarcados(next);
    if (next.every(Boolean)) timer.current = setTimeout(onDone, 220);
  }
  return (
    <>
      {sorteados.map((txt, i) => (
        <button key={txt} type="button" className={`missao-chk${marcados[i] ? " ok" : ""}`} onClick={() => toggle(i)}>
          <span className="ico">{marcados[i] ? <Icone nome="concluir" tam={16} /> : null}</span>
          {txt}
        </button>
      ))}
    </>
  );
}

// ---- pesagem final: arrastar até o fim ----
function SliderMission({ onDone }: { onDone: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const dragging = useRef(false);
  const done = useRef(false);
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || done.current || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const np = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setP(np);
    if (np >= 0.94) {
      done.current = true;
      onDone();
    }
  }
  function onUp() {
    dragging.current = false;
    if (!done.current) setP(0);
  }
  return (
    <div className="missao-slider" ref={wrapRef}>
      <div className="missao-slider-fill" style={{ width: `${p * 100}%` }} />
      <div
        className="missao-slider-thumb"
        style={{ left: `${p * 100}%` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <Icone nome="avancar" tam={16} />
      </div>
      <span className="missao-slider-txt">arraste para confirmar</span>
    </div>
  );
}

// ---- acesso/carga/saída: toques em sequência num alvo único ----
function CounterMission({ count, onDone }: { count: number; onDone: () => void }) {
  const [n, setN] = useState(0);
  function tap() {
    const next = n + 1;
    setN(next);
    if (next >= count) onDone();
  }
  return (
    <>
      <button type="button" className="missao-contador" onClick={tap}>
        <Icone nome="toque" tam={16} />TOQUE ({n}/{count})
      </button>
      <div className="missao-contador-dots">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className={i < n ? "on" : ""} />
        ))}
      </div>
    </>
  );
}
