import * as THREE from "three";
import { M } from "../core/materials";
import { box } from "./primitives";

/**
 * Pavimento do pátio — a laje de asfalto sob a área operacional.
 *
 * Existe porque o terminal era desenhado sobre a GRAMA: cada peça trazia o
 * próprio piso (o pátio do truck center, o piso sob a marcação de vagas, as
 * lajes das coberturas) e entre elas aparecia o terreno. Visto de cima, o
 * miolo do anel de rolamento e toda a volta dele eram verdes, e o terminal
 * lia como construções largadas num campo em vez de um pátio pavimentado.
 *
 * A peça é uma laje 1 x 1 m: o TAMANHO vem da escala do elemento na planta
 * (`s` = [largura, 1, profundidade]), que é como o layout dimensiona tudo. Por
 * isso a espessura fica no eixo Y, que a planta mantém em 1 — esticar o
 * pavimento não engorda a laje.
 *
 * Altura: topo em y = 0,05. Acima do terreno (y = 0), que ela precisa cobrir,
 * e abaixo de todo o resto que se apoia no chão — as faixas da marcação de
 * vagas começam em 0,071 e as pistas ficam em 0,3 e 1. Assim ela passa por
 * baixo sem disputar o z-buffer com nada.
 *
 * `castShadow` desligado de propósito: é o chão. Uma laje rasteira projetando
 * sombra só produz acne de sombra na borda.
 */
const ESPESSURA = 0.1;

export function makeApron(): THREE.Group {
  const g = new THREE.Group();
  const laje = box(1, ESPESSURA, 1, M.roadTex, 0, 0, 0, g);
  laje.castShadow = false;
  laje.receiveShadow = true;
  return g;
}
