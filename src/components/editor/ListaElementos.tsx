"use client";

import { useMemo } from "react";
import { getRascunho, useEditorStore, ordinalDoTipo } from "@/state/editor-store";
import { agruparPorCategoria } from "@/lib/three/editor/operacoes";
import { diagnosticar } from "@/lib/three/editor/fabrica";
import { enquadrarElemento } from "@/lib/three/editor/cena-editor";
import { rotulo } from "./tipos";

/**
 * A planta como lista, agrupada pela `cat` de cada elemento — o mesmo índice
 * lateral do editor de referência.
 *
 * Assina `versaoEstrutura` e não `versaoTransform`: 143 linhas re-renderizando
 * a cada quadro de um arrasto é exatamente o custo que a separação das duas
 * versões existe para evitar (ver editor-store.ts).
 */
export function ListaElementos() {
  const sel = useEditorStore((s) => s.sel);
  const filtro = useEditorStore((s) => s.filtro);
  const versao = useEditorStore((s) => s.versaoEstrutura);
  const setFiltro = useEditorStore((s) => s.setFiltro);
  const selecionar = useEditorStore((s) => s.selecionar);

  const PL = getRascunho();
  const grupos = useMemo(
    () => (PL ? agruparPorCategoria(PL, filtro) : []),
    // `versao` entra de propósito: o rascunho é mutável, então a identidade de
    // PL não muda quando um elemento é acrescentado ou apagado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [PL, filtro, versao],
  );

  if (!PL) return null;
  const total = PL.elements.length;
  const mostrados = grupos.reduce((n, g) => n + g.itens.length, 0);

  return (
    <>
      <header>
        <input
          className="ed-busca"
          type="text"
          placeholder="Filtrar…"
          value={filtro}
          onChange={(ev) => setFiltro(ev.target.value)}
        />
        <div className="ed-nota" style={{ margin: "5px 0 0" }}>
          {mostrados === total ? `${total} elementos` : `${mostrados} de ${total}`}
        </div>
      </header>
      <div className="ed-rolagem">
        {grupos.map((g) => (
          <div key={g.cat}>
            <div className="ed-cat">
              {g.cat} · {g.itens.length}
            </div>
            {g.itens.map(({ idx, e }) => {
              const diag = diagnosticar(e, ordinalDoTipo(PL, idx));
              const classes = [
                "ed-item",
                idx === sel ? "sel" : "",
                diag.noJogo ? "" : "fora",
                e.locked ? "travado" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={idx}
                  className={classes}
                  title={diag.motivo || e.type}
                  onClick={() => {
                    selecionar(idx);
                    enquadrarElemento(idx);
                  }}
                >
                  <i />
                  <span className="ed-nome">{rotulo(e)}</span>
                </button>
              );
            })}
          </div>
        ))}
        {!grupos.length ? <div className="ed-vazio">Nada com esse filtro.</div> : null}
      </div>
    </>
  );
}
