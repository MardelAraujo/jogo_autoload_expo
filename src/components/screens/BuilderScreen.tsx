"use client";

import { useEffect, useRef, useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import { DURACAO_TURNO, MODULOS, PONTOS, STAGES_DEF } from "@/lib/constants";
import Image from "next/image";
import { MODELOS_CAMINHAO } from "@/lib/three/scene";
import { rebuildPreview } from "@/lib/three/preview";
import { setPreviewClipRect } from "@/lib/three/tick";
import {
  enterBuilderMaquete,
  exitBuilderMaquete,
  focarMaquete,
  setMaqueteLegendaListener,
  type MqLegenda,
} from "@/lib/three/maquete";
import { AutoloadLogo } from "@/components/AutoloadLogo";
import { Icone, type NomeIcone } from "@/components/Icone";
import { tocar } from "@/lib/utils";

// O que vale ponto — os mesmos três baldes que o placar final abre no fim do
// turno (ver EndScreen), pra quem lê aqui reconhecer a conta depois.
const BRIEFING_PONTOS: { ico: NomeIcone; nome: string; desc: string }[] = [
  { ico: "estrategia", nome: "Estratégia", desc: `${PONTOS.EXPEDIDO_AUTO} pts por caminhão expedido, mais ciclo curto e fechamento exato de estoque` },
  { ico: "agilidade", nome: "Agilidade", desc: `${PONTOS.TAP_RAPIDO} pts por missão resolvida rápido no lado manual — teto de ${PONTOS.TAP_CAP_TOTAL}` },
  { ico: "automacao", nome: "Automação", desc: `${PONTOS.ETAPA_AUTO} pts por etapa que o AutoLoad fecha sozinho, sem ninguém tocar` },
];

const LEGENDA_REPOUSO: MqLegenda = {
  local: "Panorâmica",
  tit: "A maquete gira sozinha",
  sub: "Toque uma estação da jornada: a câmera vai até a peça e mostra onde ela entra no terminal.",
  off: false,
};

export function BuilderScreen() {
  const irPara = useKioskStore((s) => s.irPara);
  const sel = useKioskStore((s) => s.sel);
  const setSel = useKioskStore((s) => s.setSel);
  const somAtivo = useKioskStore((s) => s.somAtivo);
  const mqScopeRef = useRef<HTMLDivElement>(null);
  const [legenda, setLegenda] = useState<MqLegenda>(LEGENDA_REPOUSO);
  const [estacaoSel, setEstacaoSel] = useState<string | null>(null);

  // porte de mostrarBuilder(): rebuildPreview() ao entrar (o resto do state já
  // foi resetado por novoJogador()/setSel via LeadScreen). Módulos ficam
  // sempre travados (sel.mods) — só o modelo de caminhão muda aqui.
  useEffect(() => {
    rebuildPreview(sel);
    setMaqueteLegendaListener((l) => {
      setLegenda(l);
      if (l.local === "Panorâmica" && l.tit === LEGENDA_REPOUSO.tit) setEstacaoSel(null);
    });
    enterBuilderMaquete();
    return () => {
      setMaqueteLegendaListener(null);
      exitBuilderMaquete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // porte de mqRect(): mede o retângulo do visor da maquete em coordenadas de
  // viewport WebGL (Y invertido) e passa pro tick() recortar o render nele.
  useEffect(() => {
    function updateClip() {
      const el = mqScopeRef.current;
      if (!el || el.offsetParent == null) {
        setPreviewClipRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 80) {
        setPreviewClipRect(null);
        return;
      }
      setPreviewClipRect({
        x: Math.round(r.left),
        y: Math.round(window.innerHeight - r.bottom),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
    updateClip();
    window.addEventListener("resize", updateClip);
    return () => {
      window.removeEventListener("resize", updateClip);
      setPreviewClipRect(null);
    };
  }, []);

  const modeloAtual = sel.modeloCaminhao || MODELOS_CAMINHAO[0].id;

  function escolherModelo(id: string) {
    setSel({ modeloCaminhao: id });
    rebuildPreview({ ...sel, modeloCaminhao: id });
  }
  function tocarEstacao(id: string, mod: string) {
    tocar("tap", somAtivo);
    setEstacaoSel(id);
    focarMaquete(id, mod, true); // módulos sempre travados no montador: ligado=true sempre
  }

  // Partida fixa: uma rodada de DURACAO_TURNO. O visitante nao escolhe mais a duracao.
  const minutos = Math.round(DURACAO_TURNO / 60);

  return (
    <div id="screen-builder" className="overlay">
      <aside id="builder-visor" aria-hidden="true">
        <div id="mq-scope" ref={mqScopeRef}>
          <span className="mq-tick tl" />
          <span className="mq-tick tr" />
          <span className="mq-tick bl" />
          <span className="mq-tick br" />
          <div id="mq-local">{legenda.local}</div>
        </div>
        <div id="mq-cap" className={legenda.off ? "off" : undefined}>
          <div id="mq-tit">{legenda.tit}</div>
          <div id="mq-sub">{legenda.sub}</div>
        </div>
        <section id="jornada">
          <div className="sec-label">A jornada do caminhão</div>
          <div id="jornada-lista" role="list">
            {STAGES_DEF.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`jn-est${estacaoSel === s.id ? " sel" : ""}`}
                role="listitem"
                aria-label={`Etapa ${i + 1}: ${s.nome}, coberta por ${MODULOS[s.mod].nome}`}
                onClick={() => tocarEstacao(s.id, s.mod)}
              >
                <span className="jn-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="jn-nm">{s.nome}</span>
                <span className="jn-mod">
                  <span className="jn-led" />
                  {MODULOS[s.mod].nome}
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>
      <div id="builder-panel">
        <header id="builder-head">
          <h1>
            Desafie o <span>Autoload</span>
          </h1>
          <p className="sub">
            Seu terminal já está de pé com o <b className="rosa">ecossistema inteiro</b> ligado. Toque uma estação da
            jornada pra ver onde cada módulo entra na planta, escolha seu caminhão e ponha o turno pra rodar.
          </p>
        </header>
        <div id="builder-live" className="sr-only" aria-live="polite" aria-atomic="true">
          {estacaoSel ? `${STAGES_DEF.find((s) => s.id === estacaoSel)?.nome} — ${legenda.tit}` : ""}
        </div>
        <div className="sec-label">Seu caminhão</div>
        <div id="builder-config">
          <div className="campo campo-modelo">
            <label id="lbl-modelo" className="sr-only">
              Modelo do caminhão
            </label>
            <div className="opt-group" id="grupo-modelo" role="radiogroup" aria-labelledby="lbl-modelo">
              {MODELOS_CAMINHAO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`opt-chip${modeloAtual === m.id ? " on" : ""}`}
                  data-modelo={m.id}
                  role="radio"
                  aria-checked={modeloAtual === m.id}
                  onClick={() => escolherModelo(m.id)}
                >
                  <Image className="opt-truck" src={m.img} alt="" width={660} height={138} unoptimized priority />
                  <span className="opt-nm">{m.nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="sec-label">O que vale ponto</div>
        <div id="briefing-pontos">
          {BRIEFING_PONTOS.map((b) => (
            <div className="bp-linha" key={b.nome}>
              <span className="bp-ico" aria-hidden="true">
                <Icone nome={b.ico} tam={32} />
              </span>
              <span className="bp-tx">
                <span className="bp-nm">{b.nome}</span>
                <span className="bp-ds">{b.desc}</span>
              </span>
            </div>
          ))}
        </div>
        <div id="builder-marca" aria-hidden="true">
          <span className="bm-logo">
            <AutoloadLogo />
          </span>
          <span className="bm-tag">Simple · Smart · Reliable</span>
        </div>
        <div id="builder-foot">
          <button className="btn-ghost" onClick={() => irPara("lead")}>
            <Icone nome="voltar" tam={20} />Voltar
          </button>
          <button className="btn-primary" onClick={() => irPara("sim")}>
            <Icone nome="iniciar" tam={20} />Iniciar operação · <span id="btn-simular-tempo">{minutos} min</span> <span className="seta-cta">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
