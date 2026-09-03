"use client";

import { useMemo, useRef, useState } from "react";
import { gerarPlaca } from "@/lib/utils";
import { Icone } from "@/components/Icone";

/**
 * ~5 gestos consolidados no lugar dos 16 montarMissao* bespoke da referência
 * (linhas 10655-11130) — simplificação #3 do AGENTS.md do port. Cada etapa do
 * circuito (STAGES_DEF) mapeia pra UM destes gestos (em vez de dois sorteados
 * por alerta como na referência): select (toque na opção certa), hold
 * (segurar), checklist (múltiplos toques), slider (arrastar) e counter
 * (toques em sequência) — mesma família de gesto, texto/contexto diferente
 * por etapa, o suficiente pra cada parada continuar tendo "a sua" missão.
 */
export type MissionKind = "select" | "hold" | "checklist" | "slider" | "counter";

export interface MissionConfig {
  kind: MissionKind;
  label: string;
  holdMs?: number;
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
  patio: { kind: "hold", label: "Segure para chamar o motorista no pátio", holdMs: 1100 },
  acesso_in: { kind: "counter", label: "Carimbar a autorização de entrada", count: 2 },
  pesagem1: { kind: "hold", label: "Segure para ler a balança", holdMs: 1300 },
  vistoria: { kind: "checklist", label: "Confira os itens de segurança", items: CHECKLIST_VISTORIA },
  carga: { kind: "counter", label: "Conectar aterramento e liberar a carga", count: 3 },
  pesagem2: { kind: "slider", label: "Arraste para confirmar a pesagem" },
  saida: { kind: "counter", label: "Carimbar a liberação de saída", count: 2 },
  checkout: { kind: "hold", label: "Segure para emitir a NF-e", holdMs: 1300 },
};

export function MissionWidget({ config, placa, onDone }: { config: MissionConfig; placa: string; onDone: () => void }) {
  switch (config.kind) {
    case "select":
      return <SelectMission placa={placa} onDone={onDone} />;
    case "hold":
      return <HoldMission ms={config.holdMs ?? 1100} onDone={onDone} />;
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

// ---- pesagem/pátio/check-out: segurar até completar ----
function HoldMission({ ms, onDone }: { ms: number; onDone: () => void }) {
  const [segurando, setSegurando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function start() {
    if (timer.current) return;
    setSegurando(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setSegurando(false);
      onDone();
    }, ms);
  }
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSegurando(false);
  }
  return (
    <button
      type="button"
      className={`missao-hold${segurando ? " segurando" : ""}`}
      style={{ ["--hold-ms" as string]: `${ms}ms` } as React.CSSProperties}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <span className="hold-fill" />
      <span className="hold-txt">SEGURE para confirmar</span>
    </button>
  );
}

// ---- vistoria: checklist de itens ----
function ChecklistMission({ items, onDone }: { items: string[]; onDone: () => void }) {
  const sorteados = useMemo(() => items.slice().sort(() => Math.random() - 0.5).slice(0, 3), [items]);
  const [marcados, setMarcados] = useState<boolean[]>(() => sorteados.map(() => false));
  function toggle(i: number) {
    const next = marcados.slice();
    next[i] = !next[i];
    setMarcados(next);
    if (next.every(Boolean)) setTimeout(onDone, 220);
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
