import "server-only";

// O "dia da feira" era calculado com a data local do browser do kiosk. No
// servidor isso não serve: um host em UTC virava o dia às 21h de Brasília e
// partiria o ranking no meio da tarde. Aqui o dia é sempre o do fuso do
// evento, independente de onde o servidor esteja hospedado.
const TZ = process.env.TZ_EVENTO || "America/Sao_Paulo";

export function hojeStr(): string {
  // en-CA formata como YYYY-MM-DD, que é exatamente o formato gravado na
  // coluna `dia` desde a versão HTML.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Aceita só o formato YYYY-MM-DD; qualquer outra coisa vira o dia de hoje.
// Evita que um `?dia=` arbitrário chegue cru no filtro do PostgREST.
export function diaValido(v: string | null): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hojeStr();
}
