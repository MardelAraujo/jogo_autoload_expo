"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useKioskStore } from "@/state/kiosk-store";
import { aplicarCamera, ASPECT_REF } from "@/lib/three/camera";
import { simTickRef } from "@/lib/three/tick";
import { fmtMMSS, menosMovimento, tocar, type Motorista } from "@/lib/utils";
import * as engine from "@/lib/three/sim/engine";
import type { Alerta, HUDSnapshot } from "@/lib/three/sim/engine";
import { MissionWidget } from "@/lib/three/sim/missions";
import { AutoConsole } from "@/lib/three/sim/auto-console";
import { AutoloadLogo } from "@/components/AutoloadLogo";
import { BotaoVoltar } from "@/components/BotaoVoltar";
import { Icone } from "@/components/Icone";

/**
 * Tela de simulação — porte de tick()/atualizarHUD() (referência linhas
 * 12383/12615), split-screen manual×AutoLoad via scissor. O HUD é atualizado
 * por polling (~8Hz, ver `POLL_MS`) em vez de a cada frame — o motor em si
 * roda a 60Hz dentro de `simTickRef`, fora do ciclo de render do React.
 */
const POLL_MS = 120;

/** Fatia fixa do motor: 60 Hz, a mesma cadência que ele sempre teve em máquina boa. */
const PASSO_S = 1 / 60;
/** Teto de fatias por quadro — 8 dão ~133 ms, o bastante para acompanhar até
 *  ~7 FPS sem deixar um quadro atrasado virar meio segundo de trabalho de uma
 *  vez (o que travaria ainda mais a máquina que já está sofrendo). */
const MAX_PASSOS = 8;
/** Acima disto não é lentidão, é a aba ter ficado em segundo plano: descarta
 *  em vez de tentar recuperar. */
const MAX_ATRASO_S = 0.5;

export function SimScreen() {
  const [hud, setHud] = useState<HUDSnapshot | null>(null);
  const ultimoNow = useRef(0);
  const resto = useRef(0);

  useEffect(() => {
    const sel = useKioskStore.getState().sel;
    if (!engine.simRef.current) engine.iniciarSimulacao(sel);
    tocar("ok", useKioskStore.getState().somAtivo);
    ultimoNow.current = performance.now();
    resto.current = 0;

    simTickRef.current = (renderer, dt, now) => {
      const sim = engine.simRef.current;
      if (!sim) return;
      void dt;
      // Quanto tempo REAL passou desde o quadro anterior. Não dá para usar o
      // `dt` do loop: ele chega limitado a 0,05 s (tick.ts), e esse limite é
      // justamente o que fazia o caminhão andar em câmera lenta em máquina
      // fraca — abaixo de 20 FPS cada quadro avançava no máximo 50 ms de
      // simulação enquanto o relógio do turno, que vem de `now`, seguia em
      // tempo real. O teto continua existindo lá para o preview e o editor,
      // onde ele resolve o salto de quem volta de uma aba em segundo plano.
      const dtReal = Math.min(MAX_ATRASO_S, (now - ultimoNow.current) / 1000);
      ultimoNow.current = now;

      // Passo fixo com acumulador: o motor sempre roda em fatias de PASSO_S,
      // quantas couberem no tempo que passou de verdade. Assim a simulação
      // acompanha o relógio de parede em vez de acompanhar a taxa de quadros
      // — em máquina lenta ela fica ENGASGADA, que é honesto, em vez de
      // LENTA, que parecia defeito do jogo.
      resto.current = Math.min(resto.current + dtReal, PASSO_S * MAX_PASSOS);
      let acabou = false;
      while (resto.current >= PASSO_S && !acabou) {
        resto.current -= PASSO_S;
        acabou = engine.tickSim(sim, PASSO_S, now);
      }
      if (acabou) {
        sim.man.rotas.forEach((R) => { R.parado = true; });
        sim.auto.rotas.forEach((R) => { R.parado = true; });
        tocar("fim", useKioskStore.getState().somAtivo);
        useKioskStore.getState().irPara("jornada");
        return;
      }
      const canvas = renderer.domElement;
      const W = canvas.clientWidth || window.innerWidth;
      const H = canvas.clientHeight || window.innerHeight;
      renderer.setScissorTest(true);
      const half = Math.floor(W / 2);
      // Cada lado ocupa METADE da largura, então o piso de proporção dele é
      // metade do da tela cheia — em 1920×1080 dá exatamente o aspecto que o
      // split-screen já tinha, e telas mais estreitas param de cortar o pátio.
      aplicarCamera(sim.man.camera, half / H, undefined, ASPECT_REF / 2);
      renderer.setViewport(0, 0, half, H);
      renderer.setScissor(0, 0, half, H);
      renderer.render(sim.man.scene, sim.man.camera as THREE.OrthographicCamera);
      aplicarCamera(sim.auto.camera, (W - half) / H, undefined, ASPECT_REF / 2);
      renderer.setViewport(half, 0, W - half, H);
      renderer.setScissor(half, 0, W - half, H);
      renderer.render(sim.auto.scene, sim.auto.camera as THREE.OrthographicCamera);
    };

    const poll = setInterval(() => {
      const sim = engine.simRef.current;
      setHud(sim ? engine.snapshotHUD(sim) : null);
    }, POLL_MS);

    return () => {
      simTickRef.current = null;
      clearInterval(poll);
    };
  }, []);

  if (!hud) return <div id="sim-ui" className="ativo" />;

  return (
    <div id="sim-ui" className="ativo">
      <div id="sim-topo">
        {/* Dentro da faixa, e não flutuando por cima da tela: os placares de
            cada lado penduram logo abaixo dela (.side-board), e um botão solto
            no canto cobria o da operação manual.

            `descartarSimulacao` é obrigatório aqui: o efeito de montagem só
            chama `iniciarSimulacao` quando `simRef` está vazio, então sem o
            descarte a próxima partida RETOMARIA esta, com o relógio e o placar
            de onde pararam. É o mesmo par de linhas que o "Tentar novamente"
            do fim de turno já faz. */}
        <BotaoVoltar
          para="builder"
          antes={() => {
            engine.descartarSimulacao();
            engine.endResultRef.current = null;
          }}
        />
        <div className="hud-leitura">
          <span className="l">Tempo</span>
          <span id="sim-timer" className={hud.restante <= 20 ? "acabando" : ""}>
            {fmtMMSS(hud.restante)}
          </span>
        </div>
        {hud.rodadasTotal > 1 && (
          <div className="hud-leitura" id="sim-rodada-box">
            <span className="l">Rodada</span>
            <span id="sim-rodada">
              {hud.rodadaAtual}/{hud.rodadasTotal}
            </span>
          </div>
        )}
        {/* "Total", não "Pontos": desde que cada lado passou a mostrar o
            próprio placar, este número é a SOMA dos dois (engine credita em
            `pontos` e no balde do lado no mesmo lugar — agilidade no manual,
            estratégia+etapas no AutoLoad). Com os três chamados de "pontos" a
            tela tinha três números sem relação declarada; nomeando um deles de
            total, a conta fica à vista sem nenhum elemento a mais. */}
        <div className="hud-leitura" id="sim-pontos-box">
          <span className="l">Total</span>
          <span id="sim-pontos">{hud.pontos}</span>
        </div>
      </div>

      <Placar
        id="head-man"
        valor={hud.scoreMan}
        cabecalho={
          <>
            <span className="sb-ico"><Icone nome="manual" tam={24} /></span>
            <span className="sb-lab">Operação manual</span>
          </>
        }
      />
      <Placar
        id="head-auto"
        valor={hud.scoreAuto}
        cabecalho={
          <span className="sb-logo">
            <AutoloadLogo />
          </span>
        }
      />
      <div id="divisor" />
      <div id="vs-badge">VS</div>

      <FichaMotorista placa={hud.placa} motorista={hud.motorista} />
      <div id="alertas-man">{hud.alerta && !hud.alerta.resolvido && <AlertCard alerta={hud.alerta} placa={hud.placa} />}</div>
      <AutoConsole />
    </div>
  );
}

/** Teto da contagem: um crédito grande não pode segurar o dígito mais que isso,
 *  senão a próxima tarefa chega com o painel ainda subindo a anterior. */
const CONTAGEM_MS_MAX = 900;
/** Quantas lâmpadas na marquise. Sete é o que cabe no painel sem virar fileira. */
const LAMPADAS = 7;

/** Dois dígitos no mínimo — "07" é placar de fliperama, "7" é um número solto. */
function almofada(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * O placar de um lado, agora como painel de fliperama.
 *
 * Antes era uma pílula deitada ("Pontos 40") pendurada sob o rótulo do lado.
 * Legível, mas muda sem que ninguém veja: o número trocava entre dois quadros e
 * quem estava olhando o pátio — que é onde a ação acontece — perdia o crédito.
 * Num estande de feira o placar é metade do espetáculo, e ele não pode depender
 * de o visitante estar olhando exatamente para ele no instante certo.
 *
 * Então o painel virou um instrumento com quatro camadas, de cima pra baixo:
 * marquise de lâmpadas, cabeçalho do lado, mostrador e legenda. O mostrador é
 * preto de verdade, com os dígitos "88" apagados atrás do valor — é o truque do
 * display de sete segmentos, e é o que faz o número existir mesmo quando um
 * caminhão branco passa por baixo.
 *
 * E toda tarefa concluída ANUNCIA: o dígito sobe contando (não salta), um "+N"
 * verde flutua pra cima e o mostrador dá um flash na cor do lado. O verde é
 * proposital e é o único da tela — vermelho é alarme do manual e rosa é a
 * marca; ganho precisava de uma terceira voz, e verde é a que todo mundo já lê
 * como "entrou".
 *
 * O gatilho é a PRÓPRIA variação do placar, não um evento do motor: o HUD já
 * chega aqui por polling (ver `POLL_MS`), e qualquer coisa que credite ponto —
 * toque rápido no manual, etapa automatizada, caminhão expedido — passa por
 * este número. Nada no motor precisa saber que existe uma animação.
 */
function Placar({ id, valor, cabecalho }: { id: string; valor: number; cabecalho: React.ReactNode }) {
  const [mostrado, setMostrado] = useState(valor);
  const [ganho, setGanho] = useState(0);
  // dois contadores em vez de flags booleanas: trocar o `key` remonta o
  // elemento, e remontar é o que faz uma animação CSS rodar DE NOVO. É o
  // `void offsetWidth` da referência, dito em React.
  const [credito, setCredito] = useState(0);   // sobe quando o ponto entra (dispara o "+N")
  const [remate, setRemate] = useState(0);     // sobe quando a contagem chega (dispara flash e pulso)
  // o valor que está no dígito AGORA, que não é o do placar enquanto ele sobe.
  const exibido = useRef(valor);
  const anterior = useRef(valor);
  const raf = useRef(0);

  useEffect(() => {
    const delta = valor - anterior.current;
    anterior.current = valor;
    if (delta === 0) return;

    setGanho(delta);
    setCredito((c) => c + 1);

    const aplicar = (n: number) => {
      exibido.current = n;
      setMostrado(n);
    };

    if (menosMovimento()) {
      aplicar(valor);
      setRemate((r) => r + 1);
      return;
    }

    // parte de onde o dígito ESTÁ, não de onde o placar estava: com dois
    // créditos em sequência a contagem emenda em vez de voltar atrás.
    const de = exibido.current;
    const curso = valor - de;
    const dur = Math.min(CONTAGEM_MS_MAX, 250 + Math.abs(curso) * 18);
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      // easeOutCubic — a mesma desaceleração de chegada do resto do sistema
      aplicar(Math.round(de + curso * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(passo);
      else setRemate((r) => r + 1);
    };
    raf.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf.current);
  }, [valor]);

  const digitos = almofada(mostrado);

  return (
    <div className="side-board" id={id}>
      <div className="sb-lights" aria-hidden="true">
        {Array.from({ length: LAMPADAS }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="sb-head">{cabecalho}</div>
      <div className="sb-display">
        {/* só existem depois do primeiro crédito: montados de saída, eles
            piscariam uma vez no início do turno, com o placar ainda em zero. */}
        {remate > 0 && <span className="sb-flash" key={`f${remate}`} aria-hidden="true" />}
        {credito > 0 && (
          <span className="sb-ganho" key={`g${credito}`} aria-hidden="true">
            {ganho > 0 ? `+${ganho}` : ganho}
          </span>
        )}
        <span className="sb-stack">
          {/* os segmentos apagados do display: dão fundo ao número e mantêm a
              largura fixa, então o painel não respira a cada dígito novo. */}
          <span className="sb-fantasma" aria-hidden="true">{"8".repeat(digitos.length)}</span>
          <span className={`sb-n${remate > 0 ? " bate" : ""}`} key={`n${remate}`}>
            {digitos}
          </span>
        </span>
      </div>
      <div className="sb-cap">Pontos</div>
    </div>
  );
}

/**
 * Ficha de quem está no balcão — porte de atualizarMissaoCanto() (referência
 * linha 11206), que tinha ficado pra trás: o CSS (#missao-canto) e o dado
 * (MissaoTruck.motorista, gerado a cada ciclo em engine.ts) já estavam aqui, só
 * faltava a tela.
 *
 * Responde "QUEM é esse caminhão" — o que FAZER continua dito só pelo cartão da
 * missão, embaixo à esquerda. Por isso não se toca (pointer-events:none no CSS)
 * e é aria-hidden: para o leitor de tela seria repetição do alerta, que já
 * anuncia a placa.
 *
 * A animação de entrada é re-disparada pelo `key`: caminhão novo, placa nova,
 * elemento novo — o React remonta e a `.pop` roda de novo, sem o
 * `void offsetWidth` que a referência precisava fazer à mão.
 */
function FichaMotorista({ placa, motorista }: { placa: string; motorista: Motorista | null }) {
  return (
    <div id="missao-canto" className={motorista ? "pop" : "vazio"} key={placa || "vazio"} aria-hidden="true">
      <div className="mc-eyebrow">Motorista</div>
      {motorista ? (
        <>
          <div className="mc-placa">{placa}</div>
          <div className="mc-nome">{motorista.nome}</div>
          <div className="mc-dados">
            <b>CPF</b>
            <span>{motorista.cpf}</span>
            <b>CNH</b>
            <span>{motorista.cnh}</span>
          </div>
        </>
      ) : (
        <div className="mc-nome">Aguardando o próximo caminhão…</div>
      )}
    </div>
  );
}

/** Cartão do alerta manual ativo — porte simplificado (sem DOM próprio) de spawnAlerta/travarAlerta. */
function AlertCard({ alerta, placa }: { alerta: Alerta; placa: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [alerta]);
  void tick; // só pra forçar o re-render do "parado há Ns" abaixo

  const key = `${alerta.stage.id}-${alerta.t0}`;
  const parado = Math.max(0, Math.floor(engine.simRef.current!.clock - alerta.t0));

  return (
    <div className={`alerta alerta-missao${alerta.vencido ? " travado critico" : ""}`}>
      <div className="cab">
        <span className="ico"><Icone nome={alerta.stage.alerta.ico} tam={16} /></span>
        {alerta.vencido ? <Icone nome="parado" tam={16} className="ico-parado" /> : null}
        {/* nenhuma frase de STAGES_DEF nomeia a placa hoje — a identidade do
            caminhão mora na ficha do canto. O replace fica porque `tx` continua
            sendo um molde, e o "PARADO:" é estado da tarefa, não identidade. */}
        <span>{(alerta.vencido ? "PARADO: " : "") + alerta.stage.alerta.tx.replace("{placa}", placa)}</span>
      </div>
      <div className="desc">{alerta.stage.alerta.acao}</div>
      <div className="acao" key={key}>
        {alerta.missao ? (
          <MissionWidget config={alerta.missao} placa={placa} onDone={() => engine.resolverAlertaManual()} />
        ) : (
          <button type="button" className="missao-hold" onClick={() => engine.resolverAlertaManual()}>
            TOQUE para resolver
          </button>
        )}
      </div>
      {alerta.vencido ? (
        <div className="parado">
          parado há <span className="p-n">{parado}s</span> — a fila não anda
        </div>
      ) : (
        <CountdownBar limite={alerta.limite} alertKey={key} />
      )}
    </div>
  );
}

function CountdownBar({ limite, alertKey }: { limite: number; alertKey: string }) {
  const [shrink, setShrink] = useState(false);
  useEffect(() => {
    setShrink(false);
    const id = requestAnimationFrame(() => setShrink(true));
    return () => cancelAnimationFrame(id);
  }, [alertKey]);
  return (
    <div className="barra">
      <div style={{ width: shrink ? "0%" : "100%", transitionDuration: `${limite}s` }} />
    </div>
  );
}
