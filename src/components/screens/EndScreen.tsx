"use client";

import { useEffect, useRef, useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import * as engine from "@/lib/three/sim/engine";
import type { CompRow, EndResult } from "@/lib/three/sim/engine";
import { RankingList } from "@/components/RankingList";
import { Icone, type NomeIcone } from "@/components/Icone";
import { fmtMMSS, menosMovimento } from "@/lib/utils";

/** Uma linha do comparativo já resolvida: quem tem número, quem ganha, e de
 *  quanto foi a diferença. Os dois cartões leem a MESMA lista — é o que garante
 *  que a terceira métrica de um esteja na altura da terceira métrica do outro. */
type Linha = CompRow & { temM: boolean; temA: boolean; ganhaA: boolean; ganhaM: boolean };

function resolver(comp: CompRow[]): Linha[] {
  return comp.map((l) => {
    const temM = l.m !== null && l.m !== undefined;
    const temA = l.a !== null && l.a !== undefined;
    // só há vencedor quando os dois lados têm número e eles diferem.
    const disputa = temM && temA && l.m !== l.a;
    const ganhaA = disputa && (l.menos ? l.a! < l.m! : l.a! > l.m!);
    return { ...l, temM, temA, ganhaA, ganhaM: disputa && !ganhaA };
  });
}

/** Conta de 0 ate `alvo` e devolve o valor corrente. O placar chega com os
 *  numeros subindo, em vez de ja resolvido — o mesmo principio da cascata das
 *  metricas, so que aplicado ao numero em si. Quem pediu menos movimento no
 *  sistema recebe o valor final direto, sem contagem. */
function useContagem(alvo: number | null, atrasoMs: number): number | null {
  // o estado JA nasce no valor final quando o sistema pede menos movimento —
  // resolver isso no inicializador, e nao num setState dentro do efeito, evita
  // o render em cascata que o lint (com razao) reclama.
  const [n, setN] = useState<number | null>(alvo === null ? null : menosMovimento() ? alvo : 0);
  useEffect(() => {
    if (alvo === null || menosMovimento()) return;
    const DUR = 720;
    let raf = 0;
    let t0 = 0;
    function passo(t: number) {
      if (!t0) t0 = t;
      const p = (t - t0 - atrasoMs) / DUR;
      if (p < 0) {
        raf = requestAnimationFrame(passo);
        return;
      }
      const e = Math.min(1, p);
      // easeOutCubic: o numero desacelera na chegada, como o resto das animacoes
      setN(Math.round(alvo! * (1 - Math.pow(1 - e, 3))));
      if (e < 1) raf = requestAnimationFrame(passo);
    }
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, atrasoMs]);
  return n;
}

/** Uma metrica de um dos lados. Componente proprio (e nao um trecho do .map)
 *  porque a contagem e um hook, e hook nao pode nascer dentro de laco. */
function Metrica({ l, lado, i }: { l: Linha; lado: "man" | "aut"; i: number }) {
  const tem = lado === "man" ? l.temM : l.temA;
  const perde = lado === "man" ? l.ganhaA : l.ganhaM;
  const bruto = lado === "man" ? l.m : l.a;
  const texto = lado === "man" ? l.tm : l.ta;
  // so conta o que e numero inteiro na tela: "2m30" e "—" nao sobem, seria
  // contar um formato, nao um valor.
  const contavel = /^\d+$/.test(texto) && bruto !== null && bruto !== undefined;
  const contado = useContagem(contavel ? bruto! : null, i * 90 + 200);

  // percentual quando ha base pra comparar; diferenca crua quando o manual
  // nao expediu nada (dividir por zero nao e "infinito por cento", e "↑ 9").
  // Seta de traco, nao triangulo cheio: o design system so admite a
  // familia →/↗/› no texto, e icone cheio ele nao tem.
  const seta = l.ganhaA || l.ganhaM ? (l.a! > l.m! ? "↑" : "↓") : "";
  const delta =
    seta && (l.m! > 0 ? `${Math.abs(Math.round(((l.a! - l.m!) / l.m!) * 100))}%` : `${Math.abs(l.a! - l.m!)}`);

  return (
    <div
      className={`pl-met${tem ? "" : " vazio"}${perde ? " perde" : ""}`}
      style={{ ["--i" as string]: i } as React.CSSProperties}
    >
      <div className="pl-lab">{l.nome}</div>
      <div className="pl-linha">
        <span className="pl-val">{contavel && contado !== null ? contado : texto}</span>
        {lado === "aut" && delta && (
          <span className={`pl-delta${l.ganhaA ? " melhor" : ""}`}>
            {seta} {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/** O placar do lado, no alto do cartao. E a primeira coisa que o cartao diz,
 *  porque e a unica que o HUD vinha dizendo o turno inteiro: o visitante acabou
 *  de ver esses dois numeros subindo nos dois paineis de fliperama, e o placar
 *  final tem que confirma-los, nao substitui-los por outra conta.
 *
 *  Conta de zero como as metricas de baixo — mesmo `useContagem`, e o primeiro
 *  da cascata (atraso 0), entao ele chega antes e o resto entra atras. */
function PontosLado({ pontos }: { pontos: number }) {
  const contado = useContagem(pontos, 0);
  return (
    <div className="pl-pts">
      <div className="pl-lab">Pontos</div>
      <div className="pl-pts-n">{contado ?? pontos}</div>
    </div>
  );
}

/** Um lado do placar. O cabecalho nomeia a MODALIDADE — "Manual" ou "AutoLoad" —
 *  com o simbolo num selo vazado (so contorno, sem preenchimento, como todo o
 *  resto da chapa monoline). Depois vem o placar do lado, e so entao as
 *  metricas de operacao. O cartao do manual mostra so o numero; o do
 *  AutoLoad carrega o delta, porque a diferenca e o argumento dele. */
function LadoPlacar({ lado, ico, titulo, pontos, linhas }:
  { lado: "man" | "aut"; ico: NomeIcone; titulo: string; pontos: number; linhas: Linha[] }) {
  return (
    <div className={`pl-card ${lado}`}>
      <div className="pl-tit">
        <span className="pl-selo" aria-hidden="true">
          <Icone nome={ico} tam={24} />
        </span>
        <span className="pl-modo">{titulo}</span>
      </div>
      <PontosLado pontos={pontos} />
      {linhas.map((l, i) => (
        <Metrica key={l.nome} l={l} lado={lado} i={i} />
      ))}
    </div>
  );
}

/**
 * Quanto tempo o placar fica na tela sem ninguém tocar antes de chamar o
 * próximo visitante. Eram 60s, e no estande isso saía cedo demais: o grupo
 * ainda está lendo o comparativo, apontando o delta do AutoLoad e tirando foto
 * quando a tela se troca sozinha. Cinco minutos é o tempo de uma conversa de
 * balcão — e qualquer toque na tela zera a contagem de novo, então quem já
 * acabou não espera por ela: sai pelo "Sair".
 */
const SEG_OCIOSO = 300;

/** Porte de mostrarPlacar()/novoJogador() — referência linhas 12411/12524. */
export function EndScreen() {
  const { irPara, resetSel, currentLead, rankingCache, refreshRanking } = useKioskStore();
  const [result, setResult] = useState<EndResult | null>(engine.endResultRef.current);
  const [count, setCount] = useState(SEG_OCIOSO);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sel = useKioskStore.getState().sel;
    engine.finalizarTurno(sel, currentLead).then((r) => {
      setResult(r);
      refreshRanking();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function novoJogador() {
    engine.descartarSimulacao();
    engine.endResultRef.current = null;
    resetSel();
    irPara("start");
  }

  useEffect(() => {
    const id = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (count <= 0) {
      novoJogador();
      setCount(SEG_OCIOSO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (!result) {
    return (
      <div id="screen-end" className="overlay">
        <div className="overlay-card">
          <h1>Placar</h1>
          <div className="sub">Calculando o resultado do turno…</div>
        </div>
      </div>
    );
  }

  const linhas = resolver(result.comp);

  return (
    <div id="screen-end" className="overlay" onPointerDown={() => setCount(SEG_OCIOSO)}>
      <div className="overlay-card">
        <h1>Placar{currentLead ? `, ${currentLead.nome.split(" ")[0]}` : ""}</h1>
        <div className="ganho-badge">
          <span className="n">{result.ganho[0]}</span>
          <span className="t">{result.ganho[1]}</span>
          {result.veredito && <span className="veredito">{result.veredito}</span>}
        </div>
        <div className="pts-breakdown">
          <div>
            <Icone nome="estrategia" tam={20} />Estratégia <span style={{ color: "var(--steel)" }}>(módulos, modais, fechamento, ciclo)</span>
            <b>{result.breakdown.estrategia} pts</b>
          </div>
          <div>
            <Icone nome="agilidade" tam={20} />Agilidade <span style={{ color: "var(--steel)" }}>(toques rápidos)</span>
            <b>{result.breakdown.agilidade} pts</b>
          </div>
          <div>
            <Icone nome="automacao" tam={20} />Etapas automatizadas <span style={{ color: "var(--steel)" }}>(concluídas pelo AutoLoad)</span>
            <b>{result.breakdown.etapas} pts</b>
          </div>
        </div>
        <div className="placar-duo">
          <LadoPlacar lado="man" ico="manual" titulo="Manual" pontos={result.placar.man} linhas={linhas} />
          <LadoPlacar lado="aut" ico="autoload" titulo="AutoLoad" pontos={result.placar.auto} linhas={linhas} />
        </div>
        {/* Fica FORA dos dois cartoes, e nao embaixo do numero do manual: com
            uma linha a mais so de um lado, as metricas dos dois cartoes saiam
            de altura e a comparacao lado a lado — que e a razao de existir do
            .placar-duo — se perdia. Aqui embaixo, centrada, ela explica os dois
            de uma vez. Sem essa frase o visitante ve 77 e 188 nos cartoes e
            depois se acha no ranking com 77, sem entender por que. */}
        <div className="pl-nota">
          O ranking do dia conta os seus <b>{result.placar.man} pontos manuais</b> — o que o AutoLoad fez sozinho
          não disputa com ninguém.
        </div>
        {/* Os chips de módulo saíram: dez etiquetas repetindo o que o visitante
            acabou de montar competiam com os dois cartões, que são o que o
            placar tem a dizer. Fica só o aviso do caso vazio — sem nenhum
            módulo aceso os dois lados rodam igual, e sem essa frase o placar
            fica inexplicável. */}
        {!result.mods.length && (
          <div className="mods-usados">
            <span style={{ color: "var(--ink-dim)", fontSize: 12.5 }}>
              Nenhum módulo aceso — o lado direito rodou igual ao manual. Desafie o AutoLoad de novo e compare.
            </span>
          </div>
        )}
        <RankingList entries={rankingCache} destaqueWhats={currentLead?.whats} topN={8} />
        <div id="end-auto">
          Próximo visitante em <span>{fmtMMSS(count)}</span>
        </div>
        <div id="end-foot">
          <button className="btn-ghost" onClick={novoJogador}>
            Sair
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              engine.descartarSimulacao();
              engine.endResultRef.current = null;
              irPara("builder");
            }}
          >
            <Icone nome="recarregar" tam={20} />Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
