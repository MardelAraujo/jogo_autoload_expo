"use client";

import { useEffect, useMemo, useState } from "react";
import { carregarManifest, type ModelLibraryEntry } from "@/lib/three/model-library";
import { getRascunho, useEditorStore } from "@/state/editor-store";
import { CATALOGO_NATIVO, novoElemento } from "@/lib/three/editor/operacoes";
import type { PropsPainel } from "./tipos";
import { Icone } from "@/components/Icone";

/**
 * De onde saem peças novas.
 *
 * Dois caminhos, e a diferença importa: os **tipos nativos** são os que
 * `buildTerminal` tem ramo próprio para desenhar (tanque, bacia, cancela…),
 * alguns deles limitados a uma ou duas instâncias porque o jogo os indexa por
 * ordem. O **acervo** são os 46 `.glb` de public/models — entram como
 * `lib_<id>`, o ramo genérico do jogo, que aceita qualquer quantidade.
 *
 * Quando em dúvida, acervo: é o caminho que não tem teto.
 */
export function PainelAcervo({ acoes }: PropsPainel) {
  const [acervo, setAcervo] = useState<Record<string, ModelLibraryEntry> | null>(null);
  const [busca, setBusca] = useState("");
  const selecionar = useEditorStore((s) => s.selecionar);

  useEffect(() => {
    let vivo = true;
    void carregarManifest().then((lib) => {
      if (vivo) setAcervo(lib);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const termo = busca.trim().toLowerCase();

  const nativos = useMemo(
    () => CATALOGO_NATIVO.filter((t) => !termo || `${t.nome} ${t.tipo} ${t.cat}`.toLowerCase().includes(termo)),
    [termo],
  );

  const porCategoria = useMemo(() => {
    if (!acervo) return [];
    const grupos = new Map<string, { id: string; m: ModelLibraryEntry }[]>();
    Object.entries(acervo).forEach(([id, m]) => {
      if (termo && !`${m.name} ${id} ${m.cat}`.toLowerCase().includes(termo)) return;
      const lista = grupos.get(m.cat) || [];
      lista.push({ id, m });
      grupos.set(m.cat, lista);
    });
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [acervo, termo]);

  function adicionar(tipo: string, nome: string, cat: string) {
    const PL = getRascunho();
    if (!PL) return;
    acoes.antesDeMudar();
    const idx = novoElemento(PL, tipo, nome, cat);
    acoes.estruturaMudou(idx);
    selecionar(idx);
  }

  /** Quantas instâncias deste tipo já existem — o aviso de teto só faz sentido com o número. */
  function quantos(tipo: string): number {
    const PL = getRascunho();
    return PL ? PL.elements.filter((e) => e.type === tipo).length : 0;
  }

  return (
    <>
      <input
        className="ed-busca"
        type="text"
        placeholder="Buscar peça…"
        value={busca}
        onChange={(ev) => setBusca(ev.target.value)}
      />
      <div className="ed-nota">A peça nasce no centro do que a câmera está mostrando.</div>

      <div className="ed-grp">Tipos nativos</div>
      {nativos.map((t) => {
        const n = quantos(t.tipo);
        const cheio = t.limitado != null && n >= t.limitado;
        return (
          <button
            key={t.tipo}
            className="ed-add"
            onClick={() => adicionar(t.tipo, t.nome, t.cat)}
            title={
              cheio
                ? `o jogo só usa ${t.limitado} deste tipo — a peça nova entra na planta mas não será desenhada`
                : t.tipo
            }
          >
            <span>{t.nome}</span>
            <span className="ed-id">
              {cheio ? <><Icone nome="aviso" tam={16} />{`${n}/${t.limitado}`}</> : t.cat}
            </span>
          </button>
        );
      })}

      <div className="ed-grp">Acervo 3D</div>
      {!acervo ? <div className="ed-nota">Carregando o manifesto do acervo…</div> : null}
      {porCategoria.map(([cat, itens]) => (
        <div key={cat}>
          <div className="ed-cat" style={{ margin: "10px 0 3px" }}>
            {cat}
          </div>
          {itens.map(({ id, m }) => (
            <button key={id} className="ed-add" onClick={() => adicionar(`lib_${id}`, m.name, m.cat)} title={id}>
              <span>{m.name}</span>
              <span className="ed-id">{id.split("/")[1]}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
