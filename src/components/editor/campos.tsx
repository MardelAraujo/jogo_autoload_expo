"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo numérico que aguenta ser editado E atualizado de fora.
 *
 * Um `<input value={n}>` puro não serve aqui: enquanto o desenvolvedor digita
 * "-" ou "1." o valor ainda não é um número, e reescrever o campo a cada
 * tecla apagaria o que ele acabou de digitar. Ao mesmo tempo o campo precisa
 * acompanhar o arrasto da peça no 3D, que muda o mesmo número 60 vezes por
 * segundo. A saída é o texto viver aqui dentro e só ser sobrescrito de fora
 * quando o campo NÃO está com o foco.
 */
export function CampoNumero({
  valor,
  passo = 1,
  titulo,
  desabilitado,
  aoMudar,
}: {
  valor: number;
  passo?: number;
  titulo?: string;
  desabilitado?: boolean;
  aoMudar: (n: number) => void;
}) {
  const [texto, setTexto] = useState(() => formatar(valor));
  const focado = useRef(false);

  useEffect(() => {
    if (!focado.current) setTexto(formatar(valor));
  }, [valor]);

  return (
    <input
      type="number"
      step={passo}
      title={titulo}
      value={texto}
      disabled={desabilitado}
      onFocus={() => {
        focado.current = true;
      }}
      onBlur={() => {
        focado.current = false;
        setTexto(formatar(valor));
      }}
      onChange={(ev) => {
        setTexto(ev.target.value);
        const n = Number(ev.target.value);
        if (Number.isFinite(n)) aoMudar(n);
      }}
    />
  );
}

/** Três casas no máximo, sem zeros à toa — a planta guarda coordenadas com 14 casas e o campo não precisa mostrá-las. */
export function formatar(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

/** Trio X/Y/Z rotulado, o arranjo que posição, rotação e escala repetem. */
export function TrioNumerico({
  rotulos = ["X", "Y", "Z"],
  valores,
  passo = 1,
  desabilitado,
  aoMudar,
}: {
  rotulos?: [string, string, string] | string[];
  valores: [number, number, number];
  passo?: number;
  desabilitado?: boolean;
  aoMudar: (eixo: 0 | 1 | 2, n: number) => void;
}) {
  return (
    <div className="ed-tri">
      {([0, 1, 2] as const).map((k) => (
        <div key={k}>
          <div className="ed-eixo">{rotulos[k]}</div>
          <CampoNumero
            valor={valores[k]}
            passo={passo}
            desabilitado={desabilitado}
            aoMudar={(n) => aoMudar(k, n)}
          />
        </div>
      ))}
    </div>
  );
}
