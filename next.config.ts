import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // O jogo roda como aplicação servida por um Node, não como pasta de HTML
  // estático: as chaves do Supabase e a senha do admin vivem no servidor
  // (src/app/api/**) e nunca entram no bundle do browser.
  //
  // Sem `output` o build é o padrão servido por `next start`, que roda em
  // qualquer Node — Vercel, VPS ou a máquina do stand. Para empacotar em
  // container, trocar por `output: "standalone"` e rodar
  // `node .next/standalone/server.js` (nesse modo `next start` não funciona).

  // Sem isto o Turbopack sobe a árvore procurando o lockfile, acha o de
  // C:\Projetos\Jogo_expopostos (fora do repo) e avisa que ignorou. A raiz do
  // projeto é esta pasta.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },

  // Abrir o jogo de OUTRO aparelho da rede — celular, tablet, a própria TV do
  // estande — para testar o toque em tela de verdade.
  //
  // O `next dev` já escuta em todas as interfaces, mas bloqueia por padrão as
  // requisições de origem diferente de `localhost` para os endpoints internos
  // (`/_next/**`, HMR). Sem esta lista a PÁGINA até abre no celular, e é por
  // isso que o sintoma engana: o que falha depois são os pedaços internos, e o
  // jogo fica pela metade sem dizer por quê.
  //
  // Vale só em desenvolvimento — `next start` ignora esta chave por completo.
  // Por isso a lista são as faixas privadas inteiras em vez do IP do momento:
  // o endereço vem de DHCP e muda de rede para rede (o do estande não será o
  // do escritório). O casamento é por segmento, então `10.*.*.*` cobre
  // 10.1.3.25 e qualquer vizinho.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.16.*.*", "172.17.*.*"],
};

export default nextConfig;
