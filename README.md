# ExpoPostos — Desafio AutoLoad V4

> **Este repositório é o jogo, e nada mais.** A versão HTML única que rodou até
> 21/08/2026 e os protótipos 3D anteriores ficaram no repositório de origem
> (`Gui250/Jogo-Autoload`, em `legacy/`), arquivados desde 24/08/2026. Aqui não
> existe nada além da aplicação — ela roda sozinha.


O jogo do stand, rodando como **aplicação servida por um Node**. O browser
recebe as telas e a cena 3D; o banco fica atrás do servidor.

## Subir

```bash
npm install
cp .env.example .env.local   # e preencha (veja abaixo)
npm run dev                  # desenvolvimento, http://localhost:3000
```

Produção:

```bash
npm run build
npm start                    # http://localhost:3000
PORT=8080 npm start          # outra porta
```

Para expor na rede do stand, basta que a máquina aceite conexões na porta — os
outros dispositivos acessam por `http://<ip-da-maquina>:3000`.

## Variáveis de ambiente

Todas ficam **só no servidor**. Nenhuma tem o prefixo `NEXT_PUBLIC_`, que é o
que faria o Next embutir o valor no bundle do browser.

| Variável | Para quê |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave usada pelo servidor para ler e escrever no banco |
| `ADMIN_PASSWORD` | Senha do painel administrativo |
| `ADMIN_SESSION_SECRET` | Assina o cookie de sessão do admin (≥16 caracteres) |
| `TZ_EVENTO` | Fuso que define o "dia" do ranking (padrão `America/Sao_Paulo`) |

Gerar um `ADMIN_SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Como as telas falam com o banco

As telas não conhecem o Supabase. Elas chamam as rotas abaixo, e só o servidor
tem as credenciais:

| Rota | Método | O que faz |
| --- | --- | --- |
| `/api/ranking` | GET | Ranking do dia (`?dia=YYYY-MM-DD` opcional) |
| `/api/ranking` | POST | Grava a pontuação de uma partida |
| `/api/leads` | POST | Grava o lead do visitante |
| `/api/leads/pos-jogo` | PUT | Soma a partida ao lead (jogos, melhor pontuação) |
| `/api/admin/login` | GET/POST/DELETE | Estado da sessão · entrar · sair |
| `/api/admin/leads` | GET | Lista de leads — **exige sessão** |
| `/api/admin/export` | GET | CSV de leads + ranking — **exige sessão** |
| `/api/admin/ranking` | DELETE | Zera o ranking do dia — **exige sessão** |
| `/api/admin/planta` | GET/PUT/POST | Planta em vigor · grava a planta editada · lê um backup — **exige sessão** |

Os POST são validados no servidor (`parseLead`, `parseRanking` em
`src/lib/server/dados.ts`): campos são truncados e `pontos`/`carregados` têm
teto, para um POST forjado não conseguir gravar lixo nem um placar absurdo.

O painel administrativo autentica contra `ADMIN_PASSWORD` e recebe um cookie
`httpOnly` assinado por HMAC, válido por 8 horas. O browser não consegue ler
nem forjar esse cookie, e a senha nunca chega ao cliente.

## Onde fica o quê

```
src/app/api/**            rotas do servidor (as únicas que falam com o banco)
src/lib/server/**         credenciais, sessão do admin, queries — "server-only"
src/lib/ranking.ts        cliente HTTP usado pelas telas
src/lib/tipos.ts          tipos compartilhados entre os dois lados
src/components/screens/** as telas do kiosk
src/lib/three/**          cena, builders e o motor da simulação (roda no browser)
src/lib/three/editor/**   editor de planta (cena editável, controles, operações)
src/components/editor/**  os painéis do editor
```

## Editor de planta

A tela `editor` — botão **🛠 Editor de planta** no painel administrativo, depois
do login — edita a planta, as rotas, o cenário e as texturas do jogo, dentro do
próprio jogo. Ocupa o lugar do `3d_plant`, o editor externo que gerava o
`planta_layout.json` e que não existe mais no repositório.

| | |
| --- | --- |
| **Selecionar** | clique na peça, ou na lista à esquerda (agrupada por categoria) |
| **Mover** | arraste a peça (Shift encaixa na grade de 1 unidade) · setas · campos numéricos |
| **Girar / escalar** | Q e E · o painel da direita |
| **Traçado** | pistas e a rota do caminhão viram bolinhas arrastáveis; dá para acrescentar e tirar pontos, abrir e fechar o laço, e ajustar a espera de cada parada |
| **Acrescentar** | aba *Acervo* — os 22 tipos nativos e os 46 modelos de `public/models/**` |
| **Cenário** | aba *Cenário* — as quatro cores do tema, a textura do chão e a névoa |
| **Câmera** | arraste no vazio orbita · botão direito (ou Espaço) passeia · scroll dá zoom |
| **Desfazer** | Ctrl+Z, até 40 passos |
| **Salvar** | Ctrl+S — grava `public/planta_layout.json` e guarda um backup `.bak-AAAAMMDDhhmmss` (os 10 mais recentes) |

Também dá para exportar e importar o JSON pelo navegador, e recarregar um
backup no rascunho antes de decidir se salva.

Duas coisas que o editor conta e que valem saber:

- Peças marcadas em **âmbar** na lista (e desenhadas como um esqueleto rosa no
  3D) são as que **o jogo não desenha** — ou porque `buildTerminal()` não tem
  ramo para o tipo (`poste_luz`, `caminhao_fuel_estatico`), ou porque o jogo só
  usa as primeiras instâncias daquele tipo (uma `ferrovia`, duas `cancela`…).
  Na planta de hoje são 14 elementos.
- A aba *Cenário* separa o que o jogo lê do que está guardado no JSON e nenhum
  ramo consome (`environment.fogColor`, `fogLevel`, `dayNight`, `terrain`,
  `truckSkins`, e por elemento `texture`, `alpha`, `board`).

Como a gravação é no disco do servidor, o editor precisa de uma máquina que
sirva o app com a pasta `public/` gravável — a de desenvolvimento ou a do
stand. Num destino somente-leitura (Vercel), use *Exportar* e leve o arquivo.

`src/lib/server/**` importa `server-only`: se uma tela importar esses arquivos
por engano, **o build falha** — é o que impede as credenciais de voltarem ao
bundle do cliente.

## Deploy

Como não há `output` no `next.config.ts`, o build padrão roda com `next start`
em qualquer Node — Vercel, VPS ou a máquina do stand. Para empacotar em
container, trocar por `output: "standalone"` e rodar
`node .next/standalone/server.js` (nesse modo `next start` não funciona).

Em qualquer destino, as cinco variáveis de ambiente acima precisam estar
definidas no servidor.
