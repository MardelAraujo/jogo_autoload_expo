import type { PlantaElement } from "@/lib/three/scene";

/**
 * O contrato entre os painéis (formulário puro) e a tela do editor (dona da
 * cena 3D, do histórico e do rascunho). Cada gancho diz o que mudou, e a tela
 * decide o que refazer — de mexer só no `position` do objeto (barato) a
 * remontar a cena inteira (caro). Os painéis não tocam em Three.js.
 */
export interface AcoesEditor {
  /** Ponto de desfazer. Chamar uma vez, antes da primeira escrita de uma operação. */
  antesDeMudar: () => void;
  /** Só posição/rotação/escala mudaram — copia para o objeto e atualiza o contorno. */
  transformMudou: (i: number) => void;
  /** A peça precisa nascer de novo (cor, traçado, largura, tipo). */
  pecaMudou: (i: number) => void;
  /** A lista mudou (adicionar, apagar, duplicar, importar) — remonta a cena. */
  estruturaMudou: (novoSel?: number | null) => void;
  /** Tema, textura do chão ou névoa mudaram. */
  aparenciaMudou: () => void;
  /** Só metadados (nome, trava) — nada a redesenhar em 3D. */
  metadadoMudou: () => void;
}

export interface PropsPainel {
  acoes: AcoesEditor;
}

/** Rótulo curto de um elemento para a lista e para o cabeçalho do painel. */
export function rotulo(e: PlantaElement): string {
  return e.name || e.type;
}
