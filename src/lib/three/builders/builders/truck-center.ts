import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Truck Center + estacionamento de espera — o prédio de apoio ao motorista
 * (recepção/lounge) na borda de um pátio de estacionamento marcado, onde os
 * caminhões aguardam o agendamento chamar por ordem. O painel de chamada (tela
 * de senha) fica virado pro pátio: é o "sistema chamando na ordem" em objeto.
 *
 * O prédio é modelado com relevo de fachada de verdade (embasamento, fitas de
 * janela com peitoril/verga escuros, montantes regulares, pilastras de canto,
 * platibanda com rufo, ático e condensadoras no teto) em vez de uma caixa lisa
 * com barra neon — pra ler como um prédio comercial real, não desenho.
 *
 * Montado como uma peça só: prédio + pátio + vagas + painel andam juntos quando
 * o usuário arrasta. Alguns caminhões já vêm estacionados; o resto fica livre.
 *
 * Eixos: pátio se estende em X (fileira de vagas) e Z (profundidade da vaga);
 * o prédio corre no fundo (−Z) e o painel fica no canto, encarando +Z.
 */

const LOT_W = 46;     // largura do pátio (X)
const LOT_D = 42;     // profundidade do pátio (Z) — cabe uma carreta (~23 m) na vaga + circulação
const BAY_W = 6.5;    // largura de cada vaga
const BUILD_D = 11;   // profundidade do prédio (Z)

/** Prédio comercial de dois pavimentos com relevo de fachada, marquise de entrada, ático e condensadoras. */
function addBuilding(g: THREE.Object3D, cx: number, cz: number) {
  const W = 24;
  const fH = 3.6;
  const floors = 2;
  const H = fH * floors;
  const plinth = 0.5;
  const front = cz + BUILD_D / 2;
  const y0 = plinth;

  box(W + 0.6, plinth, BUILD_D + 0.6, M.concrete, cx, plinth / 2, cz, g);   // embasamento
  box(W, H, BUILD_D, M.tankW, cx, y0 + H / 2, cz, g);                        // massa principal

  // --- fachada frontal (+z): fita de vidro por pavimento com peitoril/verga escuros ---
  const glassZ = front + 0.03;
  for (let f = 0; f < floors; f++) {
    const yb = y0 + f * fH;
    box(W - 0.6, 0.5, 0.18, M.dark, cx, yb + 0.35, front + 0.05, g);            // peitoril (spandrel)
    box(W - 1.4, fH - 1.3, 0.1, M.glass, cx, yb + fH / 2 + 0.15, glassZ, g);    // fita de vidro
  }
  box(W - 0.6, 0.4, 0.2, M.dark, cx, y0 + H - 0.1, front + 0.05, g);            // verga sob a platibanda
  // montantes verticais regulares quebrando a fita de vidro
  const mull = 9;
  for (let i = 0; i <= mull; i++) {
    const x = cx - (W - 1.4) / 2 + ((W - 1.4) / mull) * i;
    box(0.14, H - 1.0, 0.14, M.cabinetDark, x, y0 + H / 2, glassZ + 0.03, g);
  }
  // pilastras salientes de canto (tiram o aspecto de caixa lisa)
  [-1, 1].forEach((s) => box(0.7, H, BUILD_D + 0.2, M.tankW, cx + s * (W / 2 - 0.1), y0 + H / 2, cz, g));

  // --- laterais e fundo: janelas puncionadas espaçadas ---
  [-1, 1].forEach((s) => {
    for (let f = 0; f < floors; f++) {
      [-3, 3].forEach((dz) => box(0.12, 1.2, 1.6, M.glass, cx + s * (W / 2 + 0.02), y0 + f * fH + fH / 2 + 0.1, cz + dz, g));
    }
  });
  const back = cz - BUILD_D / 2 - 0.02;
  for (let f = 0; f < floors; f++) [-8, -2.7, 2.7, 8].forEach((dx) => box(1.6, 1.2, 0.12, M.glass, cx + dx, y0 + f * fH + fH / 2 + 0.1, back, g));

  // --- platibanda + rufo (coping) escuro ---
  box(W + 0.3, 0.8, BUILD_D + 0.3, M.tankW, cx, y0 + H + 0.4, cz, g);
  box(W + 0.6, 0.16, BUILD_D + 0.6, M.dark, cx, y0 + H + 0.85, cz, g);

  // --- entrada em recuo com marquise sobre colunas ---
  const ex = cx - W / 2 + 4.5;
  box(5, fH - 0.2, 0.4, M.cabinetDark, ex, y0 + (fH - 0.2) / 2, front + 0.02, g);   // portal escuro recuado
  box(3.8, fH - 0.7, 0.1, M.glass, ex, y0 + (fH - 0.7) / 2, front + 0.14, g);       // portas de vidro
  box(0.14, fH - 0.7, 0.14, M.cabinetDark, ex, y0 + (fH - 0.7) / 2, front + 0.2, g); // caixilho central
  const canY = y0 + fH - 0.2;
  box(6.2, 0.25, 3.2, M.cabinet, ex, canY, front + 1.5, g);                         // laje da marquise
  box(6.4, 0.1, 3.4, M.dark, ex, canY - 0.17, front + 1.5, g);                      // fascia da marquise
  [-2.6, 2.6].forEach((dx) => cyl(0.11, 0.13, canY, M.steel, ex + dx, canY / 2, front + 2.9, g, 8));

  // --- cobertura: ático (casa de escada) + condensadoras ---
  box(6, 2.4, 4.5, M.tankW, cx + 5.5, y0 + H + 1.2, cz - 1.5, g);
  box(6.2, 0.14, 4.7, M.dark, cx + 5.5, y0 + H + 2.42, cz - 1.5, g);
  [[-6, 1], [-2, 1.6], [2.5, -2]].forEach(([dx, dz]) => {
    box(1.6, 0.7, 1.2, M.steel, cx + dx, y0 + H + 0.55, cz + dz, g);
    box(1.4, 0.1, 1.0, M.cabinetDark, cx + dx, y0 + H + 0.92, cz + dz, g);
  });

  // --- letreiro discreto: placa clara com um único acento de logo (sem barra neon) ---
  box(8.5, 1.0, 0.18, M.cabinetDark, cx + 1, y0 + H + 0.5, front + 0.18, g);
  box(7.6, 0.62, 0.06, M.cabinet, cx + 1, y0 + H + 0.5, front + 0.29, g);
  box(0.62, 0.62, 0.1, M.ledGreen, cx - 2.4, y0 + H + 0.5, front + 0.33, g);
}

/**
 * Painel de chamada de senha — gantry de dois postes com um letreiro de matriz
 * (a fila de senhas) virado pro pátio (+Z). Gabinete escuro, sem faixa acesa
 * chamativa: só a tela informa.
 *
 * A matriz não é mais textura decorativa: é um canvas próprio desta instância,
 * e quem escreve nele é a simulação (anunciarChamada, em sim/engine.ts) meio
 * segundo antes do caminhão chegar no check-in. Devolve a função de escrita;
 * makeTruckCenter a pendura no userData do grupo para o buildTerminal alcançar.
 *
 * Canvas próprio, e não compartilhado, porque os dois lados do split-screen
 * chamam caminhões diferentes ao mesmo tempo. Por isso o material vai marcado
 * com `texturaPropria`: `material.dispose()` NÃO libera a textura, e um canvas
 * vazado por cena por turno é o tipo de vazamento que já travou o kiosk.
 */
function addCallBoard(g: THREE.Object3D, x: number, z: number): (numero: number | null) => void {
  const postH = 4.4;
  [-2.6, 2.6].forEach((dx) => {
    box(0.5, 0.3, 0.5, M.concrete, x + dx, 0.15, z, g);
    cyl(0.18, 0.22, postH, M.cabinetDark, x + dx, postH / 2, z, g, 8);
  });
  box(6.6, 0.35, 0.45, M.cabinetDark, x, postH, z, g);            // travessa
  const panelY = postH + 1.7;
  box(6.8, 3.2, 0.45, M.cabinetDark, x, panelY, z, g);           // gabinete do painel

  const cnv = document.createElement("canvas");
  cnv.width = 460;
  cnv.height = 200;
  const ctx = cnv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cnv);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.userData.texturaPropria = tex;
  box(6.2, 2.7, 0.1, mat, x, panelY, z + 0.26, g);               // matriz (fila de senhas)
  box(6.8, 0.2, 0.5, M.cabinetDark, x, panelY + 1.7, z, g);      // rufo fino

  // O dígito ocupa quase toda a altura da matriz de propósito. Com o terminal
  // inteiro em quadro esta face tem ~51 x 22 px na TV do estande; um número
  // menor que isso existiria sem ser lido, que é o mesmo que não existir.
  const escrever = (numero: number | null) => {
    ctx.fillStyle = "#0a1018";
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#4d6b87";
    ctx.font = "bold 26px Consolas, 'Courier New', monospace";
    ctx.fillText("CHAMANDO", 16, 24);
    ctx.textAlign = "center";
    ctx.fillStyle = numero === null ? "#1e3550" : "#3ee08a";
    ctx.font = "bold 180px Consolas, 'Courier New', monospace";
    ctx.fillText(numero === null ? "--" : String(numero), cnv.width / 2, 118);
    tex.needsUpdate = true;
  };
  escrever(null);
  return escrever;
}

/** Poste de iluminação tipo cobra (braço + luminária), na beira do pátio. */
function addLightPole(g: THREE.Object3D, x: number, z: number, armDir: number) {
  box(0.5, 0.3, 0.5, M.concrete, x, 0.15, z, g);
  cyl(0.12, 0.16, 7.5, M.cabinetDark, x, 3.75, z, g, 8);
  box(2.2, 0.16, 0.16, M.cabinetDark, x + armDir * 1.1, 7.5, z, g);        // braço
  box(1.0, 0.22, 0.5, M.cabinetDark, x + armDir * 2.1, 7.45, z, g);        // luminária
  box(0.8, 0.06, 0.4, M.ledAmber, x + armDir * 2.1, 7.33, z, g);           // lente
}

function makeTruckCenter() {
  const g = new THREE.Group();

  // pavimento asfáltico do pátio
  box(LOT_W, 0.14, LOT_D, M.roadTex, 0, 0.07, 0, g);

  const buildZ = -LOT_D / 2 + BUILD_D / 2;
  addBuilding(g, -LOT_W / 2 + 13, buildZ);
  g.userData.chamarNoTelao = addCallBoard(g, LOT_W / 2 - 6, -LOT_D / 2 + 3);

  // --- vagas de espera: linhas pintadas no piso ---
  // as vagas ocupam a frente do pátio; a faixa junto ao prédio (−Z) é via de
  // circulação. Os traços dividem cada BAY_W e um batente fecha o fundo da vaga.
  const bays = Math.floor(LOT_W / BAY_W);
  const x0 = -bays * BAY_W / 2;
  const bayZ0 = -LOT_D / 2 + BUILD_D + 2;   // fundo da vaga (logo à frente do prédio)
  const bayZ1 = LOT_D / 2 - 1;              // boca da vaga (frente do pátio)
  const bayCz = (bayZ0 + bayZ1) / 2;
  instanced(
    new THREE.BoxGeometry(0.18, 0.02, bayZ1 - bayZ0),
    M.line,
    bays + 1,
    (i, m) => m.makeTranslation(x0 + i * BAY_W, 0.15, bayCz),
    g,
  );
  box(bays * BAY_W, 0.16, 0.2, M.line, 0, 0.15, bayZ0, g); // batente de fundo

  // As vagas ficam VAZIAS aqui de propósito.
  //
  // O builder já estacionou quatro caminhões próprios (`makeTruck`) nelas, mas
  // a planta posiciona os seus, do acervo, exatamente neste pátio — são os
  // quatro `caminhao_fuel_estatico` em volta de x=-104. Enquanto a peça vinha
  // do .glb congelado o conflito não aparecia, porque aquela exportação não
  // trazia os caminhões; assim que o jogo passou a desenhar o builder, as vagas
  // ficaram com dois caminhões cada, um por cima do outro — e o do builder é um
  // volume bruto de bloco e cilindro, do lado do modelo detalhado do acervo.
  // Quem estaciona é a planta; o pátio entrega só o piso e a demarcação.

  addLightPole(g, -LOT_W / 2 + 6, LOT_D / 2 - 4, 1);
  addLightPole(g, LOT_W / 2 - 6, LOT_D / 2 - 4, -1);

  return g;
}

export { makeTruckCenter };
