"use client";

import { useKioskStore, type Modo } from "@/state/kiosk-store";
import { Icone } from "@/components/Icone";

/**
 * A seta de voltar do fluxo do visitante — sempre no mesmo canto, em toda tela
 * que dá pra atravessar sem querer.
 *
 * Fica FIXA na viewport, e não dentro da moldura de cada tela, porque as três
 * telas onde ela aparece têm molduras diferentes (cartão centrado no lead,
 * painel à direita no builder, HUD de turno na simulação): âncora na tela é o
 * único jeito de ela cair no mesmo lugar nas três.
 *
 * `antes` existe para a simulação, que precisa descartar o turno em curso antes
 * de sair — sem isso o motor continuaria vivo e a próxima partida retomaria a
 * anterior em vez de começar do zero.
 */
export function BotaoVoltar({ para, antes }: { para: Modo; antes?: () => void }) {
  const irPara = useKioskStore((s) => s.irPara);
  return (
    <button
      className="btn-voltar"
      aria-label="Voltar"
      title="Voltar"
      onClick={() => {
        antes?.();
        irPara(para);
      }}
    >
      <Icone nome="voltar" tam={24} />
    </button>
  );
}
