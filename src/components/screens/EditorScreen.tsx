"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import {
  useEditorStore,
  getRascunho,
  trocarRascunho,
  guardarHistorico,
  desfazer,
  podeDesfazer,
  limparHistorico,
  tocarTransformLeve,
} from "@/state/editor-store";
import { buscarPlanta, gravarPlanta, restaurarBackup, baixarPlanta } from "@/lib/editor-api";
import { getPlanta, setPlanta, type PlantaLayout } from "@/lib/three/scene";
import { rebuildPreview } from "@/lib/three/preview";
import { rendererAtual } from "@/lib/three/renderer";
import { editorTickRef } from "@/lib/three/tick";
import { controlesPausados } from "@/lib/three/camera";
import {
  montarCenaEditor,
  descartarCenaEditor,
  remontar,
  refazerPeca,
  aplicarTransform,
  selecionarPeca,
  atualizarAlcas,
  aplicarAparencia,
  enquadrarTudo,
  enquadrarElemento,
  renderizarEditor,
  editorRef,
} from "@/lib/three/editor/cena-editor";
import { instalarControlesEditor } from "@/lib/three/editor/controles";
import { duplicarElemento, apagarElemento } from "@/lib/three/editor/operacoes";
import { ListaElementos } from "@/components/editor/ListaElementos";
import { PainelPropriedades } from "@/components/editor/PainelPropriedades";
import { PainelAcervo } from "@/components/editor/PainelAcervo";
import { PainelCenario } from "@/components/editor/PainelCenario";
import type { AcoesEditor } from "@/components/editor/tipos";
import { Icone } from "@/components/Icone";

/**
 * Editor de planta — a tela onde os desenvolvedores do projeto editam a
 * planta, as rotas, o cenário e as texturas do jogo.
 *
 * Substitui o `3d_plant`, o editor externo que produzia o
 * `planta_layout.json` e que não existe mais no repositório (a pasta
 * `AutoLoad/3d_plant/` está vazia). Enquanto ele não existia, cada ajuste na
 * planta era feito à mão no JSON — foi assim que as seis paradas da rota do
 * caminhão foram calibradas. Este editor escreve no MESMO arquivo, o que
 * significa que ajuste feito aqui e ajuste feito à mão não se atropelam mais.
 *
 * A tela não é um `.overlay` como as outras: o canvas 3D é a mesa de trabalho,
 * e o clique precisa chegar nele (ver `#screen-editor` em globals.css).
 */
export function EditorScreen() {
  const irPara = useKioskStore((s) => s.irPara);
  const selKiosk = useKioskStore((s) => s.sel);

  const carregado = useEditorStore((s) => s.carregado);
  const erro = useEditorStore((s) => s.erro);
  const sel = useEditorStore((s) => s.sel);
  const ponto = useEditorStore((s) => s.ponto);
  const modoTracado = useEditorStore((s) => s.modoTracado);
  const grade = useEditorStore((s) => s.grade);
  const aba = useEditorStore((s) => s.aba);
  const sujo = useEditorStore((s) => s.sujo);
  const status = useEditorStore((s) => s.status);
  const salvando = useEditorStore((s) => s.salvando);
  const backups = useEditorStore((s) => s.backups);
  const versaoEstrutura = useEditorStore((s) => s.versaoEstrutura);

  const [statusEhErro, setStatusEhErro] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const remontaPendente = useRef<number | null>(null);

  // ---------------- ações que os painéis chamam ----------------
  // Ficam num ref para não recriar o objeto a cada render (os controles do
  // ponteiro são instalados uma vez só e capturam estas funções).
  const acoes: AcoesEditor = {
    antesDeMudar: () => guardarHistorico(),
    transformMudou: (i) => {
      aplicarTransform(i);
      useEditorStore.getState().tocarTransform();
    },
    pecaMudou: (i) => {
      refazerPeca(i);
      atualizarAlcas(useEditorStore.getState().sel, useEditorStore.getState().ponto);
      useEditorStore.getState().tocarTransform();
    },
    estruturaMudou: (novoSel) => {
      const PL = getRascunho();
      if (PL) remontar(PL);
      const s = useEditorStore.getState();
      if (novoSel !== undefined) s.selecionar(novoSel);
      s.tocarEstrutura();
      selecionarPeca(useEditorStore.getState().sel);
    },
    aparenciaMudou: () => {
      const PL = getRascunho();
      if (!PL) return;
      aplicarAparencia(PL);
      useEditorStore.getState().tocarTransform();
      // A paleta `M` é compartilhada, então quase tudo repinta na hora — mas
      // a pista CLONA `M.road` na hora em que é construída (pistaDoLayout), e
      // essa cópia não acompanha. Remontar resolve; adiar evita remontar 143
      // peças a cada passo do color picker.
      if (remontaPendente.current) window.clearTimeout(remontaPendente.current);
      remontaPendente.current = window.setTimeout(() => {
        remontaPendente.current = null;
        const atual = getRascunho();
        if (!atual) return;
        remontar(atual);
        selecionarPeca(useEditorStore.getState().sel);
        atualizarAlcas(useEditorStore.getState().sel, useEditorStore.getState().ponto);
      }, 260);
    },
    metadadoMudou: () => useEditorStore.getState().tocarEstrutura(),
  };
  const acoesRef = useRef(acoes);
  acoesRef.current = acoes;

  // ---------------- carregar a planta e montar a cena ----------------
  const carregar = useCallback(async () => {
    const resposta = await buscarPlanta();
    if (!resposta) {
      useEditorStore.getState().falhar("sem_sessao");
      return;
    }
    limparHistorico();
    useEditorStore.getState().abrir(resposta.planta, resposta.backups);
    enquadrarTudo();
    montarCenaEditor(resposta.planta);
  }, []);

  useEffect(() => {
    controlesPausados.current = true;
    // Pluga o render do editor no loop rAF único do app — o mesmo contrato
    // que sim/engine.ts usa com `simTickRef` (ver tick.ts).
    editorTickRef.current = (renderer) => renderizarEditor(renderer);
    void carregar();
    return () => {
      editorTickRef.current = null;
      controlesPausados.current = false;
      if (remontaPendente.current) window.clearTimeout(remontaPendente.current);
      descartarCenaEditor();
      // A paleta de materiais é global: o que o editor repintou continuaria
      // valendo nas telas do jogo. Devolver o tema do arquivo em vigor é o
      // que fecha essa porta.
      try {
        aplicarAparencia(getPlanta());
      } catch {
        // planta ainda não carregada — nada a devolver
      }
      useEditorStore.getState().fechar();
    };
  }, [carregar]);

  // ---------------- controles de ponteiro no canvas do app ----------------
  useEffect(() => {
    if (!carregado) return;
    const canvas = rendererAtual()?.domElement;
    if (!canvas) return;
    return instalarControlesEditor(canvas, {
      estado: () => {
        const s = useEditorStore.getState();
        const PL = getRascunho();
        return {
          sel: s.sel,
          modoTracado: s.modoTracado,
          travado: (i: number) => !!PL?.elements[i]?.locked,
        };
      },
      aoSelecionar: (i) => useEditorStore.getState().selecionar(i),
      aoSelecionarPonto: (i) => useEditorStore.getState().selecionarPonto(i),
      antesDeMudar: () => guardarHistorico(),
      aoMudar: () => tocarTransformLeve(),
      aoSoltar: () => useEditorStore.getState().tocarTransform(),
    });
  }, [carregado]);

  // ---------------- seleção, alças e grade refletidas no 3D ----------------
  useEffect(() => {
    selecionarPeca(sel);
    atualizarAlcas(modoTracado ? sel : null, ponto);
  }, [sel, ponto, modoTracado, versaoEstrutura]);

  // Entrar no modo traçado reenquadra pelo traçado: as alças de uma rota se
  // espalham pelo terminal inteiro, e o enquadramento da peça mostra só o
  // caminhão.
  useEffect(() => {
    if (modoTracado && sel != null) enquadrarElemento(sel);
  }, [modoTracado, sel]);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed) ed.grade.visible = grade;
  }, [grade, carregado, versaoEstrutura]);

  // ---------------- teclado ----------------
  useEffect(() => {
    function emCampo(alvo: EventTarget | null): boolean {
      const el = alvo as HTMLElement | null;
      return !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    }
    function onKey(ev: KeyboardEvent) {
      if (emCampo(ev.target)) return;
      const s = useEditorStore.getState();
      const PL = getRascunho();
      if (!PL) return;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        aoDesfazer();
        ev.preventDefault();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        void salvar();
        ev.preventDefault();
        return;
      }
      if (ev.key === "Escape") {
        if (s.modoTracado) s.setModoTracado(false);
        else s.selecionar(null);
        return;
      }
      if (s.sel == null) return;
      const e = PL.elements[s.sel];
      if (!e) return;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d") {
        guardarHistorico();
        const novo = duplicarElemento(PL, s.sel);
        acoesRef.current.estruturaMudou(novo);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Delete") {
        guardarHistorico();
        apagarElemento(PL, s.sel);
        acoesRef.current.estruturaMudou(null);
        ev.preventDefault();
        return;
      }
      if (e.locked) return;

      const passo = ev.shiftKey ? 6 : 1;
      let mexeu = true;
      if (ev.key === "ArrowLeft") e.p[0] -= passo;
      else if (ev.key === "ArrowRight") e.p[0] += passo;
      else if (ev.key === "ArrowUp") e.p[2] -= passo;
      else if (ev.key === "ArrowDown") e.p[2] += passo;
      else if (ev.key.toLowerCase() === "q") e.r[1] += Math.PI / 12;
      else if (ev.key.toLowerCase() === "e") e.r[1] -= Math.PI / 12;
      else mexeu = false;
      if (!mexeu) return;
      guardarHistorico();
      acoesRef.current.transformMudou(s.sel);
      ev.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- aviso de saída com alteração pendente ----------------
  useEffect(() => {
    if (!sujo) return;
    function aviso(ev: BeforeUnloadEvent) {
      ev.preventDefault();
    }
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  // ---------------- comandos da barra ----------------
  function anunciar(texto: string, ehErro = false) {
    setStatusEhErro(ehErro);
    useEditorStore.getState().setStatus(texto);
  }

  async function salvar() {
    const PL = getRascunho();
    if (!PL) return;
    const s = useEditorStore.getState();
    s.setSalvando(true);
    anunciar("gravando…");
    const r = await gravarPlanta(PL);
    s.setSalvando(false);
    if ("erro" in r) {
      anunciar(`falhou: ${r.erro}`, true);
      return;
    }
    s.marcarSalvo();
    anunciar(`salvo · ${r.elementos} elementos · ${(r.bytes / 1024).toFixed(1)} KB${r.backup ? " · backup feito" : ""}`);
    // O jogo lê a planta de um cache de módulo; sem isto, voltar para o
    // montador ainda mostraria a planta antiga até um F5. Cópia profunda de
    // propósito: continuar editando o rascunho não pode mexer no que o jogo
    // já considera "em vigor".
    setPlanta(JSON.parse(JSON.stringify(PL)) as PlantaLayout);
    rebuildPreview(selKiosk);
    const novo = await buscarPlanta();
    if (novo) s.setBackups(novo.backups);
  }

  async function recarregar() {
    if (sujo && !window.confirm("Descartar as alterações não salvas e recarregar do disco?")) return;
    anunciar("recarregando…");
    await carregar();
    anunciar("planta recarregada do disco");
  }

  function aoDesfazer() {
    const PL = desfazer();
    if (!PL) {
      anunciar("nada para desfazer");
      return;
    }
    remontar(PL);
    const s = useEditorStore.getState();
    s.selecionar(null);
    s.tocarEstrutura();
    anunciar("desfeito");
  }

  function importar(ev: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const json = JSON.parse(String(leitor.result)) as PlantaLayout;
        if (!Array.isArray(json.elements)) throw new Error("sem elements");
        guardarHistorico();
        trocarRascunho(json);
        remontar(json);
        const s = useEditorStore.getState();
        s.selecionar(null);
        s.tocarEstrutura();
        anunciar(`importado · ${json.elements.length} elementos (ainda não salvo)`);
      } catch {
        anunciar("arquivo inválido — não é um planta_layout.json", true);
      }
    };
    leitor.readAsText(arquivo);
  }

  async function carregarBackup(nome: string) {
    if (!nome) return;
    const PL = await restaurarBackup(nome);
    if (!PL) {
      anunciar("backup não encontrado", true);
      return;
    }
    guardarHistorico();
    trocarRascunho(PL);
    remontar(PL);
    const s = useEditorStore.getState();
    s.selecionar(null);
    s.tocarEstrutura();
    anunciar(`${nome} carregado no rascunho (ainda não salvo)`);
  }

  function sair() {
    if (sujo && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    irPara("admin");
  }

  // ---------------- telas de exceção ----------------
  if (erro) {
    return (
      <div id="screen-editor">
        <div className="ed-centro">
          <div className="ed-painel">
            <h2>Editor de planta</h2>
            <p>
              {erro === "sem_sessao"
                ? "Sessão de administrador ausente ou expirada. Entre pelo painel administrativo para abrir o editor."
                : erro}
            </p>
            <button className="btn-primary" onClick={() => irPara("admin")}>
              Ir para o painel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!carregado) {
    return (
      <div id="screen-editor">
        <div className="ed-centro">
          <div className="ed-painel">
            <h2>Editor de planta</h2>
            <p>Carregando o planta_layout.json…</p>
          </div>
        </div>
      </div>
    );
  }

  const PL = getRascunho();

  return (
    <div id="screen-editor">
      <div className="ed-painel ed-lista">
        <ListaElementos />
      </div>

      <div className="ed-painel ed-barra">
        <div className="ed-titulo">
          Editor <span>de planta</span>
        </div>
        <button className="btn-primary" onClick={() => void salvar()} disabled={salvando || !sujo}>
          {salvando ? "Gravando…" : <><Icone nome="salvar" tam={20} />Salvar</>}
        </button>
        <button onClick={() => void recarregar()}><Icone nome="recarregar" tam={20} />Recarregar</button>
        <button onClick={aoDesfazer} disabled={!podeDesfazer()}>
          <Icone nome="desfazer" tam={20} />Desfazer
        </button>
        <div className="ed-sep" />
        <button className={grade ? "ed-on" : ""} onClick={() => useEditorStore.getState().setGrade(!grade)}>
          <Icone nome="grade" tam={20} />Grade
        </button>
        <button
          onClick={() => {
            enquadrarTudo();
          }}
        >
          <Icone nome="enquadrar" tam={20} />Enquadrar
        </button>
        <div className="ed-sep" />
        <button onClick={() => PL && baixarPlanta(PL)}><Icone nome="exportar" tam={20} />Exportar</button>
        <button onClick={() => arquivoRef.current?.click()}><Icone nome="importar" tam={20} />Importar</button>
        <select
          defaultValue=""
          onChange={(ev) => {
            void carregarBackup(ev.target.value);
            ev.target.value = "";
          }}
          title="Carregar um backup no rascunho"
        >
          <option value="">Backups…</option>
          {backups.map((b) => (
            <option key={b} value={b}>
              {b.replace("planta_layout.json.bak-", "")}
            </option>
          ))}
        </select>
        <div className="ed-sep" />
        <button className="ed-perigo" onClick={sair}>
          <Icone nome="fechar" tam={20} />Fechar
        </button>
        <input ref={arquivoRef} type="file" accept="application/json" hidden onChange={importar} />
        <div className="ed-estado">
          <div className={sujo ? "sujo" : "ok"}>{sujo ? "● alterações não salvas" : "● em dia com o disco"}</div>
          {status ? <div className={statusEhErro ? "err" : ""}>{status}</div> : null}
        </div>
      </div>

      <div className="ed-painel ed-props">
        <div className="ed-abas">
          {(["propriedades", "acervo", "cenario"] as const).map((a) => (
            <button
              key={a}
              className={aba === a ? "ed-on" : ""}
              onClick={() => useEditorStore.getState().setAba(a)}
            >
              {a === "propriedades" ? "Peça" : a === "acervo" ? "Acervo" : "Cenário"}
            </button>
          ))}
        </div>
        <div className="ed-corpo">
          {aba === "propriedades" ? <PainelPropriedades acoes={acoes} /> : null}
          {aba === "acervo" ? <PainelAcervo acoes={acoes} /> : null}
          {aba === "cenario" ? <PainelCenario acoes={acoes} /> : null}
        </div>
      </div>

      <div className="ed-painel ed-ajuda">
        <b>clique</b> seleciona · <b>arraste</b> move (Shift encaixa na grade) · <b>vazio</b> orbita ·{" "}
        <b>botão direito</b> ou <b>Espaço</b> passeia · <b>scroll</b> zoom · <b>setas</b> movem ·{" "}
        <b>Q/E</b> giram · <b>Del</b> apaga · <b>Ctrl+D</b> duplica · <b>Ctrl+Z</b> desfaz ·{" "}
        <b>Ctrl+S</b> salva
      </div>
    </div>
  );
}
