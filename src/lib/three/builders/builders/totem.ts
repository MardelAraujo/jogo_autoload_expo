import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl } from "./primitives";

/**
 * Totem de acesso — a coluna com tela e leitor de cartão/tag ao lado da
 * cancela, onde o motorista para pra se identificar. Pequeno de propósito
 * (~2,4 m), no mesmo registro estilizado do resto.
 *
 * A tela (`M.screen`) e o leitor usam material MeshBasic: são elementos
 * "acesos", devem brilhar mesmo no lado de sombra. A tela fica levemente
 * inclinada pra trás, virada pro motorista — o totem nasce com a face de
 * atendimento em +z, então quem posiciona gira pra encarar a pista.
 */
function makeTotem(opts?: { entry?: boolean }) {
  const { entry = true } = opts || {};
  const g = new THREE.Group();

  // base / sapata
  box(1.0, 0.25, 0.9, M.concrete, 0, 0.12, 0, g);
  cyl(0.1, 0.14, 0.5, M.cabinetDark, -0.42, 0.35, -0.35, g, 6); // pezinho de fixação

  // corpo
  const bodyH = 2.0;
  const body = box(0.7, bodyH, 0.5, M.cabinet, 0, 0.25 + bodyH / 2, 0, g);
  body.castShadow = true;
  box(0.74, 0.35, 0.54, entry ? M.ledGreen : M.ledRed, 0, 0.25 + bodyH - 0.1, 0, g); // faixa colorida de topo (entrada/saída)

  // capuz superior (protege a tela do sol/chuva)
  const cap = box(0.82, 0.12, 0.66, M.cabinetDark, 0, 0.25 + bodyH + 0.02, 0.06, g);
  cap.rotation.x = -0.18;

  // tela inclinada, virada pro motorista (+z)
  const screen = box(0.56, 0.7, 0.05, M.screen, 0, 0.25 + bodyH - 0.55, 0.27, g);
  screen.rotation.x = -0.18;
  box(0.62, 0.78, 0.04, M.cabinetDark, 0, 0.25 + bodyH - 0.55, 0.24, g); // moldura

  // leitor de cartão/tag (nicho que brilha) + bandeja
  box(0.3, 0.16, 0.08, M.ledAmber, 0, 0.25 + bodyH - 1.15, 0.27, g);
  box(0.4, 0.06, 0.22, M.cabinetDark, 0, 0.25 + bodyH - 1.32, 0.3, g);

  // interfone / alto-falante
  cyl(0.07, 0.07, 0.04, M.cabinetDark, 0.2, 0.25 + bodyH - 0.55, 0.27, g, 8).rotation.x = Math.PI / 2;

  return g;
}

export { makeTotem };
