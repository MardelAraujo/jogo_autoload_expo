"use client";

import dynamic from "next/dynamic";
import { useKioskStore } from "@/state/kiosk-store";
import { StartScreen } from "@/components/screens/StartScreen";

// Só a tela inicial precisa estar pronta no primeiro load; as demais são
// buscadas sob demanda quando o visitante navega até elas.
const LeadScreen = dynamic(() => import("@/components/screens/LeadScreen").then((m) => m.LeadScreen));
const BuilderScreen = dynamic(() => import("@/components/screens/BuilderScreen").then((m) => m.BuilderScreen));
const SimScreen = dynamic(() => import("@/components/screens/SimScreen").then((m) => m.SimScreen));
const JourneyScreen = dynamic(() => import("@/components/screens/JourneyScreen").then((m) => m.JourneyScreen));
const EndScreen = dynamic(() => import("@/components/screens/EndScreen").then((m) => m.EndScreen));
const AdminScreen = dynamic(() => import("@/components/screens/AdminScreen").then((m) => m.AdminScreen));
const RankingScreen = dynamic(() => import("@/components/screens/RankingScreen").then((m) => m.RankingScreen));
// O editor de planta carrega a árvore inteira de src/lib/three/editor/** e só
// interessa a quem administra — fora do caminho do visitante, como as demais.
const EditorScreen = dynamic(() => import("@/components/screens/EditorScreen").then((m) => m.EditorScreen));

const SCREENS = {
  start: StartScreen,
  lead: LeadScreen,
  builder: BuilderScreen,
  sim: SimScreen,
  jornada: JourneyScreen,
  end: EndScreen,
  admin: AdminScreen,
  ranking: RankingScreen,
  editor: EditorScreen,
};

export default function Home() {
  const modo = useKioskStore((s) => s.modo);
  const Screen = SCREENS[modo];
  return <Screen />;
}
