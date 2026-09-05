import * as THREE from "three";
import { derivePlantaRefs, getPlanta } from "../scene";
import { estadoDoAcervo } from "../model-library";
import type { Lado, RotaAnimada } from "./engine";

/**
 * Instrumentação da rota do caminhão animado — existe só pra diagnóstico e
 * fica DESLIGADA por padrão: sem o interruptor, cada função aqui sai na
 * primeira linha e não custa nada dentro do laço de simulação.
 *
 * Como ligar (qualquer um dos três):
 *   - no console:  __debugRota(true)   ou   __debugRota('verboso')
 *   - na URL:      ?debugRota=1        ou   ?debugRota=verboso
 *   - persistente: localStorage.debugRota = 'verboso'  (sobrevive ao reload)
 *
 * Níveis:
 *   true       — montagem da frota + chegada/saída de cada ponto de parada
 *   'verboso'  — idem, mais uma amostra da posição a cada AMOSTRA_S de relógio
 *
 * `__rota()` devolve, a qualquer momento, a tabela do estado atual dos
 * caminhões dos dois lados — sem precisar de log ligado.
 */

export type NivelDebug = false | true | "verboso";

const AMOSTRA_S = 0.5; // no nível 'verboso', intervalo entre amostras de posição
const COR_MAN = "color:#f5a623;font-weight:bold";
const COR_AUTO = "color:#27c07a;font-weight:bold";

let nivel: NivelDebug | null = null;

function lerInterruptor(): NivelDebug {
  if (typeof window === "undefined") return false;
  const url = new URLSearchParams(window.location.search).get("debugRota");
  const guardado = (() => {
    try {
      return window.localStorage.getItem("debugRota");
    } catch {
      return null;
    }
  })();
  const v = url ?? guardado;
  if (v === null) return false;
  return v === "verboso" ? "verboso" : v !== "0" && v !== "false";
}

export function debugRota(): NivelDebug {
  if (nivel === null) nivel = lerInterruptor();
  return nivel;
}

/** `__debugRota(true | 'verboso' | false)` — liga/desliga em runtime e guarda a escolha. */
function definirNivel(v: NivelDebug): string {
  nivel = v;
  try {
    if (v === false) window.localStorage.removeItem("debugRota");
    else window.localStorage.setItem("debugRota", v === true ? "1" : v);
  } catch {
    /* modo privado: vale só nesta sessão */
  }
  return "debug da rota: " + (v === false ? "desligado" : v === true ? "ligado" : "ligado (verboso)");
}

const nomeLado = (l: Lado) => (l.auto ? "AUTO" : "MANUAL");
const corLado = (l: Lado) => (l.auto ? COR_AUTO : COR_MAN);
const n2 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const xz = (o: THREE.Object3D) => "(" + n2(o.position.x) + ", " + n2(o.position.z) + ")";

/**
 * Qual modelo virou este caminhão. Quando sai o procedural, diz também QUAL id
 * foi pedido e em que estado o acervo estava — que é a diferença entre "o id
 * não existe no manifest" e "o .glb ainda não tinha terminado de parsear
 * quando a cena foi montada".
 */
function modeloDoCaminhao(R: RotaAnimada): string {
  const id = R.tractor.userData?.acervoId as string | undefined;
  if (id) return id + " (acervo)";
  const pedido = R.root?.userData?.modeloPedido as string | undefined;
  if (!pedido) return "makeArtTruck (procedural)";
  const naMontagem = R.root?.userData?.acervoNoMomento as string | undefined;
  return "makeArtTruck (procedural) — pediu " + pedido
    + ", acervo na montagem: '" + (naMontagem ?? "?") + "'"
    + ", agora: '" + estadoDoAcervo(pedido) + "'";
}

/** Ponto de referência que o jogo usa pra cada etapa (STAGE_PT de derivePlantaRefs). */
function pontoDaEtapa(stageId: string | undefined): [number, number] | null {
  if (!stageId) return null;
  try {
    return derivePlantaRefs(getPlanta()).STAGE_PT[stageId] ?? null;
  } catch {
    return null;
  }
}

function distancia(a: [number, number], x: number, z: number) {
  return Math.hypot(a[0] - x, a[1] - z);
}

/** Uma vez por lado, quando a frota é montada: modelo, curva e as paradas mapeadas. */
export function logRotaMontada(lado: Lado) {
  if (!debugRota()) return;
  const rotas = lado.rotas;
  if (!rotas.length) {
    console.warn("%c[rota] " + nomeLado(lado) + " — nenhum caminhao_animado na planta", corLado(lado));
    return;
  }
  const R = rotas[0];
  console.groupCollapsed("%c[rota] " + nomeLado(lado) + " — " + rotas.length + " caminhão(ões) na rota", corLado(lado));
  console.log("modelo:", modeloDoCaminhao(R));
  console.log("curva:", R.order.length + " pontos", n2(R.curveLen) + " un", R.closed ? "fechada" : "aberta");
  console.log("velocidade: 14 un/s (ROTA_ANIMADA_SPEED)");
  const linhas = R.order
    .filter((o) => (R.waits[o.idx] || 0) > 0)
    .map((o) => {
      const p = R.curve.getPointAt(R.closed ? o.t % 1 : Math.min(1, o.t));
      const alvo = pontoDaEtapa(o.stageId);
      return {
        etapa: o.stageId ?? "(SEM ETAPA)",
        ponto: o.idx,
        t: Math.round(o.t * 1000) / 1000,
        parada: "(" + n2(p.x) + ", " + n2(p.z) + ")",
        espera: R.waits[o.idx] + "s",
        "peça da etapa": alvo ? "(" + n2(alvo[0]) + ", " + n2(alvo[1]) + ")" : "—",
        distância: alvo ? n2(distancia(alvo, p.x, p.z)) : "—",
      };
    });
  console.table(linhas);
  const g = lado.T;
  console.log(
    "cancelas: entrada", xz(g.gateIn), "| saída", xz(g.gateOut),
    "| alcance de abertura", (g.gateIn.userData.gateCfg?.range ?? "?") + " un",
  );
  console.groupEnd();
}

/** Chegou num ponto com espera. */
export function logChegada(lado: Lado, R: RotaAnimada, clock: number) {
  if (!debugRota()) return;
  const o = R.order[R.ptr];
  const alvo = pontoDaEtapa(o.stageId);
  const d = alvo ? distancia(alvo, R.tractor.position.x, R.tractor.position.z) : null;
  console.log(
    "%c[rota] " + nomeLado(lado) + "#" + (R.indiceFrota ?? 0), corLado(lado),
    "PAROU em p" + o.idx,
    "etapa=" + (o.stageId ?? "(sem etapa)"),
    "t=" + R.tPos.toFixed(3),
    "pos=" + xz(R.tractor),
    "espera=" + R.waits[o.idx] + "s",
    d === null ? "" : "distância até a peça da etapa=" + n2(d) + " un",
    "placa=" + (R.missaoTruck?.placa ?? "—"),
    "clock=" + n2(clock) + "s",
  );
  // as cancelas só levantam o braço com o caminhão dentro de `range`; é aqui
  // que se vê se a parada ficou perto o bastante da cancela CERTA
  if (o.stageId === "checkin" || o.stageId === "saida") {
    const gate = o.stageId === "checkin" ? lado.T.gateIn : lado.T.gateOut;
    const range = (gate.userData.gateCfg?.range as number) ?? 18;
    const dg = Math.hypot(gate.position.x - R.tractor.position.x, gate.position.z - R.tractor.position.z);
    console.log(
      "%c        cancela " + (o.stageId === "checkin" ? "de entrada" : "de saída") + " " + xz(gate), corLado(lado),
      "distância=" + n2(dg) + " un", "alcance=" + range,
      dg <= range ? "→ ABRE" : "→ NÃO ABRE (longe demais)",
    );
  }
}

/** Saiu da espera e voltou a andar. */
export function logSaida(lado: Lado, R: RotaAnimada, clock: number) {
  if (!debugRota()) return;
  const o = R.order[R.ptr];
  const prox = R.order[(R.ptr + 1) % R.order.length];
  console.log(
    "%c[rota] " + nomeLado(lado) + "#" + (R.indiceFrota ?? 0), corLado(lado),
    "SEGUIU de p" + o.idx + " (" + (o.stageId ?? "sem etapa") + ")",
    "→ próximo p" + prox?.idx,
    "clock=" + n2(clock) + "s",
  );
}

/** Nível 'verboso': amostra a posição no caminho entre paradas. */
const ultimaAmostra = new WeakMap<object, number>();
export function logAndando(lado: Lado, R: RotaAnimada, clock: number) {
  if (debugRota() !== "verboso") return;
  const ant = ultimaAmostra.get(R) ?? -Infinity;
  if (clock - ant < AMOSTRA_S) return;
  ultimaAmostra.set(R, clock);
  const alvoO = R.order[R.ptr];
  const restante = Math.max(0, alvoO.t - R.tPos) * R.curveLen;
  console.log(
    "%c[rota] " + nomeLado(lado) + "#" + (R.indiceFrota ?? 0), corLado(lado),
    "andando  t=" + R.tPos.toFixed(3),
    "pos=" + xz(R.tractor),
    "rumo=" + n2((R.tractor.rotation.y * 180) / Math.PI) + "°",
    "→ p" + alvoO.idx + " (" + (alvoO.stageId ?? "passagem") + ") a " + n2(restante) + " un",
  );
}

/** `__rota()` — foto do estado atual, sem depender de log ligado. */
function snapshot(sim: { man: Lado; auto: Lado; clock: number } | null) {
  if (!sim) return "simulação não está rodando";
  const linhas: Record<string, unknown>[] = [];
  ([sim.man, sim.auto] as Lado[]).forEach((lado) => {
    lado.rotas.forEach((R) => {
      const o = R.order[R.ptr];
      linhas.push({
        lado: nomeLado(lado),
        "#": R.indiceFrota ?? 0,
        ativo: !!R.ativo,
        estado: R.state,
        t: Math.round(R.tPos * 1000) / 1000,
        pos: xz(R.tractor),
        "ponto alvo": o?.idx,
        etapa: o?.stageId ?? "—",
        "espera restante": R.state === "wait" ? n2(R.waitLeft) + "s" : "—",
        placa: R.missaoTruck?.placa ?? "—",
        // número da chamada no telão do pátio: entra 0,5 s antes do check-in
        // (ver anunciarChamada) e é o que o painel do pátio está mostrando.
        "nº": R.missaoTruck?.numero ?? "—",
        modelo: modeloDoCaminhao(R),
      });
    });
  });
  console.table(linhas);
  return "clock=" + n2(sim.clock) + "s";
}

/** Registra `__debugRota()` e `__rota()`. Chamado uma vez, quando a simulação começa. */
let instalado = false;
export function instalarConsoleRota(lerSim: () => { man: Lado; auto: Lado; clock: number } | null) {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const w = window as unknown as Record<string, unknown>;
  w.__debugRota = definirNivel;
  w.__rota = () => snapshot(lerSim());
  console.log(
    "%c[rota]%c debug disponível: %c__debugRota(true)%c ou %c__debugRota('verboso')%c para os logs, %c__rota()%c para a foto do estado.",
    "color:#f5a623;font-weight:bold", "color:inherit",
    "color:#27c07a", "color:inherit",
    "color:#27c07a", "color:inherit",
    "color:#27c07a", "color:inherit",
  );
}
