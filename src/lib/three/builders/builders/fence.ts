import * as THREE from "three";
import { M } from "../core/materials";
import { box, cyl, instanced } from "./primitives";

/**
 * Cerca do perímetro — alambrado industrial.
 *
 * Substitui o `objects/grade.glb` que vinha congelado do editor externo: um
 * gradil de ripas brancas verticais, que de longe virava uma faixa branca
 * lisa e de perto lembrava cerca de jardim, não terminal de combustível.
 *
 * Aqui o painel é o que se vê num terminal de verdade: mureta de concreto,
 * montantes galvanizados, pano de tela (losango), braço inclinado pra fora
 * com três fios de arame farpado e, de tantos em tantos painéis, a placa da
 * marca.
 *
 * MEDIDAS: o painel tem de ocupar o mesmo espaço do .glb antigo, senão os 12
 * elementos `grade` já posicionados na planta deixariam vãos entre si — 40 m
 * de comprimento em x (de -20 a 20), base em y = 0, ~4 m de altura, centrado
 * na origem. Quem edita continua encaixando um painel no outro de 40 em 40.
 */

const COMP = 40;       // comprimento do painel (x) — o mesmo do .glb antigo
const MURETA_H = 0.45; // mureta de concreto
const MURETA_D = 0.34;
const TELA_H = 2.9;    // pano de alambrado
const VAO = 4;         // distância entre montantes
const R_POSTE = 0.085;
const BRACO_ANG = Math.PI / 4; // inclinação do braço do arame farpado

/** Um painel de 40 m. `comPlaca` põe a placa da marca no meio do pano. */
function makeFence(comPlaca = true) {
  const g = new THREE.Group();

  // --- mureta de concreto: fecha o vão de baixo (bicho, resíduo, enxurrada) ---
  const mureta = box(COMP, MURETA_H, MURETA_D, M.plinth, 0, MURETA_H / 2, 0, g);
  mureta.receiveShadow = true;

  const yBase = MURETA_H;
  const topoTela = yBase + TELA_H;
  const postes = COMP / VAO + 1;

  // --- montantes ---
  instanced(new THREE.CylinderGeometry(R_POSTE, R_POSTE, TELA_H + 0.12, 8), M.galv, postes, (i, m) => {
    m.makeTranslation(-COMP / 2 + i * VAO, yBase + (TELA_H + 0.12) / 2, 0);
  }, g);

  // --- braços do arame farpado: um "Y" no topo de cada montante ---
  // Dois braços, um pra cada lado, e não um só inclinado pra fora. Um braço só
  // obrigaria a saber, painel a painel, qual lado é o "de fora" — e as 12
  // grades da planta vêm com rotações herdadas de copiar e colar, que em
  // Euler XYZ dão exatamente a MESMA matriz ([0,π/2,0] e [-π,π/2,-π] são a
  // mesma rotação): o dado nunca registrou essa intenção. O Y também é o
  // arremate comum quando a cerca divide duas áreas controladas, que é o caso
  // aqui — do lado de fora fica o estacionamento de visitantes, não a rua.
  const compBraco = 0.62;
  const braco = new THREE.CylinderGeometry(0.055, 0.055, compBraco, 6);
  const rot = [1, -1].map((lado) => new THREE.Matrix4().makeRotationX(BRACO_ANG * lado));
  instanced(braco, M.galvDark, postes * 2, (i, m) => {
    const lado = i % 2 === 0 ? 1 : -1;
    m.copy(rot[i % 2]);
    m.setPosition(
      -COMP / 2 + Math.floor(i / 2) * VAO,
      topoTela + Math.cos(BRACO_ANG) * compBraco / 2,
      lado * Math.sin(BRACO_ANG) * compBraco / 2,
    );
  }, g);

  // --- travessas: uma no topo do pano, uma no meio ---
  [topoTela, yBase + TELA_H * 0.52].forEach((y) => {
    const t = cyl(0.055, 0.055, COMP, M.galv, 0, y, 0, g, 6);
    t.rotation.z = Math.PI / 2;
    t.castShadow = false;
  });

  // --- pano de alambrado ---
  // Sombra desligada de propósito: o recorte por alphaTest não chega ao mapa
  // de sombra em toda combinação de material, e o risco de a cerca projetar
  // um retângulo preto sólido de 40 m no pátio é pior que ficar sem a sombra
  // rendilhada, que a esta distância de câmera ninguém leria mesmo.
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(COMP, TELA_H), M.chainLink);
  tela.position.set(0, yBase + TELA_H / 2, 0);
  tela.castShadow = false;
  tela.receiveShadow = true;
  g.add(tela);

  // --- arame farpado: dois fios sobre cada braço do Y ---
  const pontaY = topoTela + Math.cos(BRACO_ANG) * compBraco;
  const pontaZ = Math.sin(BRACO_ANG) * compBraco;
  [1, -1].forEach((lado) => {
    [0.55, 1].forEach((t) => {
      const fio = cyl(0.022, 0.022, COMP, M.galvDark, 0, topoTela + (pontaY - topoTela) * t, lado * pontaZ * t, g, 4);
      fio.rotation.z = Math.PI / 2;
      fio.castShadow = false;
    });
  });

  // --- placa da marca ---
  // Duas faces impressas, uma pra cada lado, e a moldura no meio. Com uma face
  // só, quem olha a cerca pelo lado de dentro do terminal vê a placa de costas
  // — e metade dos painéis da planta está justamente virada pra dentro.
  if (comPlaca) {
    const yPlaca = yBase + TELA_H * 0.55;
    box(3.4, 1.8, 0.05, M.galvDark, 0, yPlaca, 0, g).castShadow = false;
    [1, -1].forEach((lado) => {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), M.fenceSign);
      face.position.set(0, yPlaca, lado * 0.04);
      face.rotation.y = lado > 0 ? 0 : Math.PI;
      g.add(face);
    });
  }

  return g;
}

export { makeFence, COMP as COMPRIMENTO_CERCA };
