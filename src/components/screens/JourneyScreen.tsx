"use client";

import { useEffect } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import { AutoloadLogo } from "@/components/AutoloadLogo";
import { JORNADA_MS } from "@/lib/constants";
import { simRef, proximaRodada } from "@/lib/three/sim/engine";

// Selo de transição "Jornada Concluída" — segura a tela por JORNADA_MS, depois
// ou monta a próxima rodada (porte de encerrarTurno(), referência linha 12397:
// `if(sim.rodadaAtual < sim.rodadasTotal) proximaRodada(); else mostrarPlacar();`)
// ou segue pro placar quando o turno acabou de verdade.
export function JourneyScreen() {
  const { irPara } = useKioskStore();

  useEffect(() => {
    const t = setTimeout(() => {
      const sim = simRef.current;
      if (sim && sim.rodadaAtual < sim.rodadasTotal) {
        proximaRodada(useKioskStore.getState().sel);
        irPara("sim");
      } else {
        irPara("end");
      }
    }, JORNADA_MS);
    return () => clearTimeout(t);
  }, [irPara]);

  return (
    <div id="screen-jornada" className="overlay">
      <div className="jornada-card">
        <div className="jornada-logo">
          <AutoloadLogo />
        </div>
        <h1 className="jornada-tx">Jornada concluída</h1>
      </div>
    </div>
  );
}
