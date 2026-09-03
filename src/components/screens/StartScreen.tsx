"use client";

import { useEffect, useRef, useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import { tocar } from "@/lib/utils";
import { AutoloadLogo } from "@/components/AutoloadLogo";
import { RankingList } from "@/components/RankingList";

export function StartScreen() {
  const irPara = useKioskStore((s) => s.irPara);
  const somAtivo = useKioskStore((s) => s.somAtivo);
  const toggleSom = useKioskStore((s) => s.toggleSom);
  const rankingCache = useKioskStore((s) => s.rankingCache);
  const refreshRanking = useKioskStore((s) => s.refreshRanking);
  const admHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [admSegurando, setAdmSegurando] = useState(false);

  useEffect(() => {
    refreshRanking();
  }, [refreshRanking]);

  function comecar() {
    tocar("ok", somAtivo);
    irPara("lead");
  }

  // Entrada do painel administrativo: segurar 1,5 s no eyebrow. É de propósito
  // que não haja botão — o visitante do stand não pode achar isso sem querer.
  //
  // O que faltava era robustez, não discrição. O eyebrow é uma tira de ~12 px
  // de altura, e o gesto cancelava no `pointerleave`: um tremor de um pixel
  // durante o segundo e meio, ou o dedo rolando sobre o vidro, saía da tira e
  // matava a contagem — dava a impressão de que o gesto não existia. Com
  // `setPointerCapture` o ponteiro fica preso ao elemento até soltar, então
  // sair da caixa deixa de importar e o `pointerleave` some daqui.
  function admHoldStart(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setAdmSegurando(true);
    // Busca o chunk do painel DURANTE o segundo e meio de espera. `AdminScreen`
    // é um next/dynamic: sem isto, o import só começa quando o timer dispara, e
    // o React segura a tela inicial no ar enquanto baixa — medido em 3,5 s na
    // primeira vez, em dev. O operador segura, solta, continua vendo o menu
    // inicial e conclui que o gesto não funcionou. Mesmo especificador de
    // módulo que o de page.tsx, então é o mesmo chunk, não um segundo.
    void import("@/components/screens/AdminScreen");
    admHoldTimer.current = setTimeout(() => irPara("admin"), 1500);
  }
  function admHoldEnd(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setAdmSegurando(false);
    if (admHoldTimer.current) clearTimeout(admHoldTimer.current);
  }

  return (
    <div id="screen-start" className="overlay">
      <div id="start-menu">
        <span className="mq-tick tl" /><span className="mq-tick tr" />
        <span className="mq-tick bl" /><span className="mq-tick br" />
        <div
          className={`eyebrow eyebrow-adm${admSegurando ? " adm-segurando" : ""}`}
          title="Segure 1,5 s para abrir o painel administrativo"
          onPointerDown={admHoldStart}
          onPointerUp={admHoldEnd}
          onPointerCancel={admHoldEnd}
        >
          AutoMind · ExpoPostos
        </div>
        <AutoloadLogo id="start-logo" />
        <h1>Desafio Autoload Cloud</h1>
        <div className="sub">
          Desafie o AutoLoad: tome as decisões do turno e descubra se a sua operação supera a eficiência dele.
        </div>
        <button id="btn-comecar" className="btn-primary" onClick={comecar}>
          Começar <span className="seta-cta">→</span>
        </button>
        <div id="ranking-inicio">
          <RankingList entries={rankingCache} topN={3} />
        </div>
        <div id="start-rodape">
          <label className="lgpd">
            <input type="checkbox" checked={somAtivo} onChange={toggleSom} />
            <span>Sons</span>
          </label>
          <span className="adm-link" onClick={() => irPara("ranking")}>
            Ranking completo
          </span>
        </div>
      </div>
    </div>
  );
}
