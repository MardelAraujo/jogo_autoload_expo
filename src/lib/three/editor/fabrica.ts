import * as THREE from "three";
import { M } from "../builders/core/materials";
import { makeTankFarm, makeLampPost, marcarTanques } from "../builders/builders/tank-farm";
import { makeGatehouse } from "../builders/builders/gatehouse";
import { makeTruckCenter } from "../builders/builders/truck-center";
import { makeScale } from "../builders/builders/scale";
import { makeBooth } from "../builders/builders/booth";
import { makeInspection, makeInspectionBooth } from "../builders/builders/inspection";
import { makeCanopy } from "../builders/builders/canopy";
import { makeTotem } from "../builders/builders/totem";
import { makeTree, makeShrub } from "../builders/builders/tree";
import { makeShip } from "../builders/builders/ship";
import { makeRail, makeLoco, makeTankCar } from "../builders/builders/rail";
import { makeFence } from "../builders/builders/fence";
import { makeApron } from "../builders/builders/apron";
import { buildLibInstance } from "../model-library";
import {
  peca,
  pecaBacia,
  pecaCancela,
  pecaVegetacao,
  pecaCaminhaoAnimado,
  pecaCaminhaoParado,
  pistaDoLayout,
  trocarSinalizacao,
  corDoElemento,
  type PlantaElement,
  type PlantaLayout,
} from "../scene";

/**
 * Uma peça 3D por elemento da planta, para o editor.
 *
 * **A fonte da verdade é `buildTerminal()` (scene.ts).** O que se vê aqui
 * precisa ser o que o jogo desenha — um editor que mostra mais do que o jogo
 * renderiza é pior que nenhum editor, porque o desenvolvedor posiciona uma
 * peça que o visitante nunca vai ver. Por isso este arquivo não inventa
 * builder nenhum: cada ramo chama exatamente a mesma função que o ramo
 * correspondente de buildTerminal chama (todas exportadas de scene.ts).
 *
 * O que muda em relação ao jogo, de propósito:
 *
 * - `buildTerminal` só coloca os dois primeiros elementos de vários tipos (as
 *   duas cancelas, as duas balanças, os dois totens…), porque
 *   derivePlantaRefs indexa por ordem. O editor desenha todos, e marca com
 *   diagnóstico os que o jogo ignoraria — senão o desenvolvedor arrasta um
 *   terceiro totem sem descobrir que ele não existe em jogo.
 * - Equipamento condicional (totem de check-in/checkout) aparece sempre; em
 *   jogo depende do módulo que o visitante contratou.
 * - `caminhao_animado` vira um caminhão, não a frota: o que se edita ali é a
 *   rota, e N cópias sobrepostas na mesma curva só atrapalham.
 */

/**
 * Tipos que buildTerminal desenha, e quantos elementos daquele tipo ele leva
 * em conta.
 *
 * Só sobraram `cancela` e `totem`. Os demais tipos estruturais passaram a ter
 * as instâncias extras desenhadas como cenário (ver EXTRAS_ESTRUTURAIS em
 * scene.ts); estes dois ficam limitados de propósito, porque carregam animação
 * e dependem do módulo que o visitante contratou.
 */
const LIMITE_DO_JOGO: Record<string, number> = {
  cancela: 2,
  totem: 2,
};

/**
 * Tipos presentes no planta_layout.json que buildTerminal não tem ramo para
 * desenhar — ficam como marcador fantasma.
 *
 * Hoje está vazio: `poste_luz` e `caminhao_fuel_estatico`, que ficavam de fora,
 * ganharam ramo (`makeLampPost()` e `pecaCaminhaoParado()`). O conjunto fica
 * porque a planta é dado editável e um tipo novo pode entrar nela a qualquer
 * momento — quando entrar, é aqui que se declara que o jogo ainda não o
 * desenha.
 */
export const TIPOS_SEM_RAMO_NO_JOGO = new Set<string>([]);

export interface DiagnosticoElemento {
  /** Falso quando o jogo não desenha este elemento (tipo sem ramo, ou instância além do limite indexado). */
  noJogo: boolean;
  motivo: string | null;
}

export function diagnosticar(e: PlantaElement, ordinal: number): DiagnosticoElemento {
  if (TIPOS_SEM_RAMO_NO_JOGO.has(e.type)) {
    return {
      noJogo: false,
      motivo: 'buildTerminal() não tem ramo para o tipo "' + e.type + '" — o jogo não desenha esta peça',
    };
  }
  const limite = LIMITE_DO_JOGO[e.type];
  if (limite != null && ordinal >= limite) {
    const quantos = limite === 1 ? "o primeiro elemento" : "os " + limite + " primeiros elementos";
    return {
      noJogo: false,
      motivo:
        "o jogo só usa " + quantos + ' do tipo "' + e.type +
        '" (derivePlantaRefs indexa por ordem); este é o ' + (ordinal + 1) + "º",
    };
  }
  return { noJogo: true, motivo: null };
}

const MARCADOR = new THREE.MeshBasicMaterial({ color: 0xfa094e, wireframe: true, transparent: true, opacity: 0.75 });

/**
 * Peça fantasma — volume selecionável e arrastável para o que o jogo não desenha.
 *
 * O material é clonado por instância de propósito. `disposeSceneContents()`
 * (renderer.ts) dá dispose em todo material que não seja da paleta `M`, e o
 * editor descarta a cena a cada remontagem: com o material compartilhado, a
 * primeira remontagem levaria junto o protótipo e os fantasmas seguintes
 * viriam de um material já descartado. Clonar custa 28 materiais minúsculos
 * na planta de hoje.
 */
function marcadorFantasma(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = MARCADOR.clone();
  const caixa = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 6), mat);
  caixa.position.y = 4;
  g.add(caixa);
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 6), mat);
  haste.position.y = 4;
  g.add(haste);
  g.userData.fantasma = true;
  return g;
}

export interface CtxFabrica {
  PL: PlantaLayout;
  /** Índice do elemento entre os do mesmo tipo — decide entrada/saída das cancelas e dos totens. */
  ordinal: number;
}

/**
 * Constrói a peça de um elemento. Devolve null quando o modelo do acervo
 * ainda não terminou de parsear e não há substituto procedural — quem chama
 * troca por um fantasma, para o elemento continuar selecionável.
 */
export function construirPeca(e: PlantaElement, ctx: CtxFabrica): THREE.Object3D | null {
  const { ordinal } = ctx;
  switch (e.type) {
    // ---- instalações fixas (o mesmo peca() de buildTerminal) ----
    case "parque_tanques":
      return marcarTanques(peca("structures/parque-tanques", makeTankFarm));
    case "portaria":
      return peca("structures/portaria", makeGatehouse);
    case "truck_center":
      return makeTruckCenter(); // builder nativo, não o .glb congelado — ver scene.ts
    case "balanca":
      return peca("structures/balanca", makeScale);
    case "guarita":
      return peca("structures/guarita", makeBooth);
    case "vistoria":
      return makeInspection(); // builder nativo, não o .glb congelado — ver scene.ts
    case "cobertura":
      return makeCanopy(); // builder nativo, não o .glb congelado — ver scene.ts
    case "navio":
      return peca("vehicles/navio", makeShip);
    case "ferrovia":
      return peca("structures/ferrovia", makeRail);
    case "locomotiva":
      return peca("vehicles/locomotiva", makeLoco);
    case "vagao":
      return peca("vehicles/vagao", makeTankCar);

    // ---- cancela e totem: a variante depende da ordem na planta ----
    case "cancela":
      return pecaCancela({ dir: 1, len: 8, entry: ordinal === 0 });
    case "totem": {
      const entrada = ordinal === 0;
      const g = peca("objects/totem", () => makeTotem({ entry: entrada }));
      return entrada ? g : trocarSinalizacao(g, M.ledGreen as THREE.Material & { color: THREE.Color }, M.ledRed);
    }

    // ---- peças do laço genérico de buildTerminal ----
    case "pista":
      return e.pista ? pistaDoLayout(e.pista, e.color) : null;
    case "bacia":
      return pecaBacia();
    // `e.seed` vem do layout: o editor sorteia uma vez e grava, para a mata
    // sair sempre igual. Passar adiante é o que faz a árvore no editor ser a
    // mesma árvore do jogo.
    case "arvore":
      return pecaVegetacao("plants/arvore", makeTree, e.seed);
    case "arbusto":
      return pecaVegetacao("plants/arbusto", makeShrub, e.seed);
    case "arbusto_quadrado":
      return buildLibInstance("plants/arbusto-quadrado");
    case "canteiro":
      return buildLibInstance("plants/canteiro");
    case "vagas":
      return buildLibInstance("objects/vagas");
    case "pavimento":
      return makeApron();
    case "grade":
      return makeFence();
    case "cabine_vistoria":
      return makeInspectionBooth();
    case "poste_luz":
      return makeLampPost();
    case "caminhao_fuel_estatico":
      return pecaCaminhaoParado();
    case "caminhao_animado":
      return pecaCaminhaoAnimado(e.rota, null, "trucks/fuel-truck-style-adapted");
    default:
      if (e.type.startsWith("lib_")) {
        const assetId = e.type.slice(4);
        return buildLibInstance(assetId) || (assetId.startsWith("plants/") ? makeShrub() : null);
      }
      return null;
  }
}

/** Elementos cujo transform vive no traçado (rota/pista), não em `e.p`. */
export function transformNoTracado(tipo: string): boolean {
  return tipo === "caminhao_animado";
}

/**
 * Peça pronta para a cena do editor: construída, transformada e colorida como
 * em jogo, com o diagnóstico gravado em userData.
 */
export function pecaDoElemento(e: PlantaElement, ctx: CtxFabrica): THREE.Object3D {
  const diag = diagnosticar(e, ctx.ordinal);
  const g = (diag.noJogo ? construirPeca(e, ctx) : null) || marcadorFantasma();
  // caminhao_animado não usa e.p: em jogo o caminhão nasce sobre a curva da
  // rota e só a escala do elemento é aplicada (ver buildTerminal).
  if (transformNoTracado(e.type)) {
    // A escala vai no caminhão, não no grupo: o grupo é o referencial da
    // curva, e escalá-lo moveria o caminhão ao longo da rota em vez de
    // aumentá-lo (é o que buildTerminal faz, ver o ramo caminhao_animado).
    const R = g.userData.rotaAnimada as { tractor?: THREE.Object3D; trailer?: THREE.Object3D } | undefined;
    R?.tractor?.scale.set(e.s[0], e.s[1], e.s[2]);
    R?.trailer?.scale.set(e.s[0], e.s[1], e.s[2]);
  } else {
    g.position.set(e.p[0], e.p[1], e.p[2]);
    g.rotation.set(e.r[0], e.r[1], e.r[2]);
    g.scale.set(e.s[0], e.s[1], e.s[2]);
  }
  corDoElemento(g, e);
  g.userData.diagnostico = diag;
  return g;
}
