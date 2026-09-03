"use client";

import { getRascunho, useEditorStore } from "@/state/editor-store";
import { CampoNumero } from "./campos";
import type { PropsPainel } from "./tipos";

/**
 * Cenário e texturas: o que vale para a planta inteira, e não para uma peça.
 *
 * O painel é dividido por uma linha honesta — o que o jogo lê hoje e o que
 * está guardado no JSON mas nenhum ramo de `buildTerminal` consome. Sem essa
 * divisão o editor prometeria o que não entrega: mexer em `fogColor` não muda
 * nada em jogo, e descobrir isso depois de calibrar uma cor é pior do que ler
 * o aviso antes.
 */

/** As quatro cores que `applyTheme()` (core/materials.ts) sabe aplicar. */
const CORES_TEMA: { chave: "road" | "basin" | "base" | "laneMarking"; nome: string; onde: string }[] = [
  { chave: "road", nome: "Pista", onde: "asfalto das pistas e pátios" },
  { chave: "basin", nome: "Bacia", onde: "bacias de contenção" },
  { chave: "base", nome: "Base", onde: "cor do terreno sob a textura" },
  { chave: "laneMarking", nome: "Faixa", onde: "marcação central das pistas" },
];

/** Os dois valores que `fotoDoChao()` distingue — qualquer outro cai em `terrain`. */
const CHAOS = [
  { valor: "terrain", nome: "Terra (terrain.jpg)" },
  { valor: "terrain-moss", nome: "Terra com musgo (terrain-moss.jpg)" },
];

function corCss(valor: number | string | null | undefined, padrao: string): string {
  if (valor == null) return padrao;
  if (typeof valor === "string") return valor.startsWith("#") ? valor : `#${valor}`;
  return "#" + (valor >>> 0).toString(16).padStart(6, "0");
}

export function PainelCenario({ acoes }: PropsPainel) {
  useEditorStore((s) => s.versaoTransform);
  const PL = getRascunho();
  if (!PL) return null;

  const tema = (PL.theme ||= {});
  const amb = (PL.environment ||= {});
  const terreno = PL.terrain as { groundW?: number; groundD?: number; seaX?: number } | undefined;

  return (
    <>
      <div className="ed-grp">Paleta da planta</div>
      {CORES_TEMA.map(({ chave, nome, onde }) => (
        <div className="ed-linha" key={chave}>
          <label title={onde}>{nome}</label>
          <input
            type="color"
            value={corCss(tema[chave], "#ffffff")}
            onChange={(ev) => {
              acoes.antesDeMudar();
              tema[chave] = parseInt(ev.target.value.slice(1), 16);
              acoes.aparenciaMudou();
            }}
          />
          <span className="ed-nota" style={{ margin: 0, flex: 1 }}>
            {onde}
          </span>
        </div>
      ))}

      <div className="ed-grp">Textura do chão</div>
      <div className="ed-linha">
        <label>Padrão</label>
        <select
          value={tema.groundPattern === "terrain-moss" ? "terrain-moss" : "terrain"}
          onChange={(ev) => {
            acoes.antesDeMudar();
            tema.groundPattern = ev.target.value;
            acoes.aparenciaMudou();
          }}
        >
          {CHAOS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="ed-nota">
        As fotos de asfalto, concreto e terreno vivem em <code>public/textures/</code> e são carregadas por{" "}
        <code>aplicarTexturasReais()</code>. Trocar o arquivo lá troca a textura em todo o jogo — o campo
        acima só escolhe entre os dois terrenos.
      </div>

      <div className="ed-grp">Névoa</div>
      <div className="ed-linha">
        <label htmlFor="ed-fog">Névoa</label>
        <input
          id="ed-fog"
          type="checkbox"
          checked={amb.fogOn !== false}
          onChange={(ev) => {
            acoes.antesDeMudar();
            amb.fogOn = ev.target.checked;
            acoes.aparenciaMudou();
          }}
        />
        <span className="ed-nota" style={{ margin: 0 }}>
          {amb.fogOn !== false ? "ligada (420 → 760)" : "desligada"}
        </span>
      </div>

      <div className="ed-grp">Guardado, ainda sem efeito</div>
      <div className="ed-aviso">
        Os campos abaixo estão no <code>planta_layout.json</code>, mas nenhum ramo de{" "}
        <code>buildTerminal()</code> os lê. Editá-los é seguro e fica salvo — só não muda o que aparece na
        tela hoje.
      </div>
      <div className="ed-linha">
        <label>Cor da névoa</label>
        <input
          type="color"
          value={corCss(amb.fogColor, "#935f15")}
          onChange={(ev) => {
            acoes.antesDeMudar();
            amb.fogColor = ev.target.value;
            acoes.metadadoMudou();
          }}
        />
      </div>
      <div className="ed-linha">
        <label>Intensidade</label>
        <CampoNumero
          valor={amb.fogLevel ?? 0.85}
          passo={0.05}
          aoMudar={(n) => {
            acoes.antesDeMudar();
            amb.fogLevel = n;
            acoes.metadadoMudou();
          }}
        />
      </div>
      <div className="ed-linha">
        <label>Hora</label>
        <select
          value={amb.dayNight || "day"}
          onChange={(ev) => {
            acoes.antesDeMudar();
            amb.dayNight = ev.target.value;
            acoes.metadadoMudou();
          }}
        >
          <option value="day">Dia</option>
          <option value="night">Noite</option>
        </select>
      </div>
      <div className="ed-nota">
        Também guardados e não lidos: <code>terrain</code> (
        {terreno ? `${terreno.groundW}×${terreno.groundD}, mar em x=${terreno.seaX}` : "ausente"} — o jogo usa
        510×900 fixos), <code>truckSkins</code>, e por elemento <code>texture</code>, <code>alpha</code> e{" "}
        <code>board</code>.
      </div>

      <div className="ed-grp">Planta</div>
      <div className="ed-nota">
        versão {String(PL.version ?? "—")} · {PL.elements.length} elementos ·{" "}
        {Object.keys((PL.libraryRefs as Record<string, unknown>) || {}).length} referências de acervo
      </div>
    </>
  );
}
