"use client";

import { useEditorStore, getRascunho, ordinalDoTipo } from "@/state/editor-store";
import type { PlantaElement } from "@/lib/three/scene";
import { diagnosticar } from "@/lib/three/editor/fabrica";
import {
  tracadoDe,
  acrescentarPonto,
  removerPonto,
  alternarLaco,
  setLarguraPista,
  setEspera,
  duplicarElemento,
  apagarElemento,
} from "@/lib/three/editor/operacoes";
import { CampoNumero, TrioNumerico } from "./campos";
import type { PropsPainel } from "./tipos";
import { Icone } from "@/components/Icone";

const GRAU = 180 / Math.PI;

/**
 * Escreve no elemento `i` do rascunho.
 *
 * Existe por uma regra do compilador do React: um manipulador de evento não
 * pode mutar um valor que o render leu (`react-hooks/immutability`) — e o
 * rascunho é, por desenho, um objeto mutável fora do React (ver
 * editor-store.ts). Buscar o elemento aqui dentro, na hora do evento, resolve
 * as duas pontas: o compilador não vê mutação de variável do render, e a
 * escrita sempre cai no elemento que existe AGORA, não no que existia quando
 * aquele render aconteceu.
 */
function mutar(i: number, escrever: (el: PlantaElement) => void): void {
  const el = getRascunho()?.elements[i];
  if (!el) return;
  escrever(el);
}

/** `e.color` chega como número (0xrrggbb) ou string — o `<input type=color>` só aceita "#rrggbb". */
function corCss(valor: number | string | null | undefined): string {
  if (valor == null) return "#ffffff";
  if (typeof valor === "string") return valor.startsWith("#") ? valor : `#${valor}`;
  return "#" + (valor >>> 0).toString(16).padStart(6, "0");
}

export function PainelPropriedades({ acoes }: PropsPainel) {
  const sel = useEditorStore((s) => s.sel);
  const ponto = useEditorStore((s) => s.ponto);
  const modoTracado = useEditorStore((s) => s.modoTracado);
  // assinatura fina: só este painel re-renderiza durante o arrasto
  useEditorStore((s) => s.versaoTransform);
  const selecionar = useEditorStore((s) => s.selecionar);
  const selecionarPonto = useEditorStore((s) => s.selecionarPonto);
  const setModoTracado = useEditorStore((s) => s.setModoTracado);

  const PL = getRascunho();
  const e = PL && sel != null ? PL.elements[sel] : null;

  if (!PL || sel == null || !e) {
    return (
      <div className="ed-vazio">
        Nenhum elemento selecionado.
        <br />
        Clique numa peça da planta ou escolha na lista à esquerda.
      </div>
    );
  }

  const i = sel;
  const diag = diagnosticar(e, ordinalDoTipo(PL, i));
  const traco = tracadoDe(e);
  const ehPista = e.type === "pista";
  const ehRota = !!e.rota;
  const travado = !!e.locked;

  function mudarTransform(campo: "p" | "r" | "s", eixo: 0 | 1 | 2, n: number) {
    acoes.antesDeMudar();
    mutar(i, (el) => {
      el[campo][eixo] = n;
    });
    acoes.transformMudou(i);
  }

  return (
    <>
      <div className="ed-tipo">{e.type}</div>
      <div className="ed-cabeca">{e.name || "(sem nome)"}</div>

      {!diag.noJogo ? <div className="ed-aviso"><Icone nome="aviso" tam={16} />{diag.motivo}</div> : null}

      <div className="ed-grp">Identificação</div>
      <div className="ed-linha">
        <label>Nome</label>
        <input
          type="text"
          value={e.name || ""}
          onChange={(ev) => {
            const v = ev.target.value;
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.name = v;
            });
            acoes.metadadoMudou();
          }}
        />
      </div>
      <div className="ed-linha">
        <label>Categoria</label>
        <input
          type="text"
          value={e.cat || ""}
          onChange={(ev) => {
            const v = ev.target.value;
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.cat = v;
            });
            acoes.metadadoMudou();
          }}
        />
      </div>
      <div className="ed-linha">
        <label htmlFor="ed-trava">Travado</label>
        <input
          id="ed-trava"
          type="checkbox"
          checked={travado}
          onChange={(ev) => {
            const v = ev.target.checked;
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.locked = v;
            });
            acoes.metadadoMudou();
          }}
        />
        <span className="ed-nota" style={{ margin: 0 }}>
          {travado ? "não arrasta no 3D" : "arrastável"}
        </span>
      </div>

      {ehRota ? (
        <div className="ed-nota">
          Este elemento não usa posição própria: em jogo o caminhão nasce sobre a curva da rota. Mova os
          pontos do traçado, e use a escala para o tamanho do caminhão.
        </div>
      ) : (
        <>
          <div className="ed-grp">Posição</div>
          <TrioNumerico
            valores={e.p}
            passo={1}
            desabilitado={travado}
            aoMudar={(eixo, n) => mudarTransform("p", eixo, n)}
          />

          <div className="ed-grp">Rotação Y</div>
          <div className="ed-linha">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round(e.r[1] * GRAU)}
              disabled={travado}
              onChange={(ev) => mudarTransform("r", 1, Number(ev.target.value) / GRAU)}
            />
            <div style={{ width: 62, flex: "none" }}>
              <CampoNumero
                valor={Math.round(e.r[1] * GRAU * 10) / 10}
                passo={5}
                desabilitado={travado}
                aoMudar={(n) => mudarTransform("r", 1, n / GRAU)}
              />
            </div>
          </div>
          <details>
            <summary className="ed-nota" style={{ cursor: "pointer" }}>
              rotação X e Z (graus)
            </summary>
            <div className="ed-tri" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div className="ed-eixo">X</div>
                <CampoNumero
                  valor={Math.round(e.r[0] * GRAU * 10) / 10}
                  passo={5}
                  desabilitado={travado}
                  aoMudar={(n) => mudarTransform("r", 0, n / GRAU)}
                />
              </div>
              <div>
                <div className="ed-eixo">Z</div>
                <CampoNumero
                  valor={Math.round(e.r[2] * GRAU * 10) / 10}
                  passo={5}
                  desabilitado={travado}
                  aoMudar={(n) => mudarTransform("r", 2, n / GRAU)}
                />
              </div>
            </div>
          </details>
        </>
      )}

      <div className="ed-grp">Escala</div>
      <TrioNumerico
        valores={e.s}
        passo={0.05}
        desabilitado={travado}
        aoMudar={(eixo, n) => mudarTransform("s", eixo, n)}
      />
      <div className="ed-linha">
        <label>Uniforme</label>
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.01}
          value={e.s[0]}
          disabled={travado}
          onChange={(ev) => {
            const n = Number(ev.target.value);
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.s = [n, n, n];
            });
            acoes.transformMudou(i);
          }}
        />
      </div>

      <div className="ed-grp">Cor</div>
      <div className="ed-linha">
        <input
          type="color"
          value={corCss(e.color)}
          onChange={(ev) => {
            const cor = parseInt(ev.target.value.slice(1), 16);
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.color = cor;
            });
            acoes.pecaMudou(i);
          }}
        />
        <button
          className="btn-ghost"
          onClick={() => {
            acoes.antesDeMudar();
            mutar(i, (el) => {
              el.color = null;
            });
            acoes.pecaMudou(i);
          }}
        >
          Sem cor própria
        </button>
      </div>
      <div className="ed-nota">
        Sem cor própria, a peça usa a paleta do tema (aba <b>Cenário</b>).
      </div>

      {traco ? (
        <>
          <div className="ed-grp">{ehPista ? "Traçado da pista" : "Rota do caminhão"}</div>
          <div className="ed-acoes" style={{ marginTop: 0 }}>
            <button className={modoTracado ? "ed-on" : ""} onClick={() => setModoTracado(!modoTracado)}>
              <Icone nome={modoTracado ? "concluir" : "editar"} tam={16} />
              {modoTracado ? "Concluir traçado" : "Editar traçado"}
            </button>
          </div>
          {modoTracado ? (
            <div className="ed-nota">
              Arraste as <b style={{ color: "var(--primary)" }}>bolinhas</b> no 3D. Verde = ponta de curva
              aberta, âmbar = parada com espera. Clique fora das alças orbita a câmera.
            </div>
          ) : null}

          {ehPista && e.pista ? (
            <div className="ed-linha">
              <label>Largura</label>
              <CampoNumero
                valor={e.pista.width ?? 11}
                passo={0.5}
                aoMudar={(n) => {
                  acoes.antesDeMudar();
                  mutar(i, (el) => setLarguraPista(el, n));
                  acoes.pecaMudou(i);
                }}
              />
            </div>
          ) : null}

          <div className="ed-acoes" style={{ marginTop: 6 }}>
            <button
              onClick={() => {
                acoes.antesDeMudar();
                let k: number | null = null;
                mutar(i, (el) => {
                  k = acrescentarPonto(el);
                });
                acoes.pecaMudou(i);
                if (k != null) selecionarPonto(k);
              }}
            >
              ＋ ponto
            </button>
            <button
              disabled={ponto == null}
              onClick={() => {
                if (ponto == null) return;
                acoes.antesDeMudar();
                let tirou = false;
                mutar(i, (el) => {
                  tirou = removerPonto(el, ponto);
                });
                if (tirou) {
                  selecionarPonto(null);
                  acoes.pecaMudou(i);
                }
              }}
            >
              － ponto
            </button>
            <button
              onClick={() => {
                acoes.antesDeMudar();
                mutar(i, (el) => alternarLaco(el));
                acoes.pecaMudou(i);
              }}
            >
              <Icone nome="tracado" tam={16} />{traco.closed ? "Abrir" : "Fechar"}
            </button>
          </div>

          <div className="ed-nota">
            {traco.points.length} pontos · {traco.closed ? "laço fechado" : "curva aberta"}
          </div>
          <div className="ed-pontos">
            {traco.points.map((_, k) => {
              const espera = !!(e.rota?.waits && e.rota.waits[k] > 0);
              return (
                <button
                  key={k}
                  className={`ed-ponto${ponto === k ? " sel" : ""}${espera ? " espera" : ""}`}
                  onClick={() => selecionarPonto(ponto === k ? null : k)}
                  title={espera ? `parada de ${e.rota!.waits![k]}s` : "sem parada"}
                >
                  {k}
                </button>
              );
            })}
          </div>

          {ehRota && ponto != null ? (
            <div className="ed-linha">
              <label>Espera (s)</label>
              <CampoNumero
                valor={e.rota?.waits?.[ponto] ?? 0}
                passo={1}
                aoMudar={(n) => {
                  acoes.antesDeMudar();
                  mutar(i, (el) => setEspera(el, ponto, n));
                  acoes.pecaMudou(i);
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="ed-acoes">
        <button
          className="ed-dup"
          onClick={() => {
            acoes.antesDeMudar();
            const novo = duplicarElemento(PL, i);
            acoes.estruturaMudou(novo);
          }}
        >
          ⧉ Duplicar
        </button>
        <button
          className="ed-perigo"
          onClick={() => {
            acoes.antesDeMudar();
            apagarElemento(PL, i);
            selecionar(null);
            acoes.estruturaMudou(null);
          }}
        >
          <Icone nome="apagar" tam={16} />Apagar
        </button>
      </div>
    </>
  );
}
