# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> A linha acima importa o `AGENTS.md` que o `next dev` regrava sozinho. Não a
> remova: sem ela o aviso sobre esta versão do Next some do contexto.

O `README.md` cobre variáveis de ambiente, rotas de API e deploy — leia-o antes
de mexer no servidor. Este arquivo cobre o que só se descobre lendo vários
arquivos ao mesmo tempo.

## Comandos

```bash
npm run dev          # http://localhost:3000
npm run build        # build de produção
npm start            # serve o build (PORT=8080 npm start para outra porta)
npm run lint         # eslint direto (não `next lint`)
npx tsc --noEmit     # checagem de tipos; o build não é a via mais rápida
```

Não há suíte de testes nem runner configurado — a verificação é rodar o jogo.
`scripts/extract-model-library.mjs` é ferramenta de uso único (extraiu os `.glb`
do HTML legado) e **não** deve ser re-executada.

No Windows, para derrubar o dev server mate o processo **pai** (o bin do
`next`); matar o filho faz o servidor renascer.

## Arquitetura

### Uma página, sem rotas de URL

`src/app/page.tsx` é a única página. A tela em cartaz sai de `modo` no store
Zustand (`src/state/kiosk-store.ts`), não da URL — não existe `/admin` nem
`/ranking` navegável. Consequência prática: **não dá para abrir uma tela
específica por link**; o admin se alcança segurando 1,5 s o eyebrow
"AutoMind · ExpoPostos" da `StartScreen`, e o ranking completo pelo link do
rodapé. Todas as telas menos a inicial são `dynamic()` sob demanda.

O mesmo store guarda `sel` — a configuração montada pelo visitante (módulos
ligados, modais, modelo de caminhão). É a entrada de tudo: da cena de fundo à
pontuação final.

### Um único canvas WebGL, um único loop

`src/components/three/SceneCanvas.tsx` é montado em `layout.tsx`, **acima** do
roteamento por `modo`, para sobreviver às trocas de tela. Renderer, cena e loop
`requestAnimationFrame` são singletons de módulo (`renderer.ts`, `preview.ts`,
`tick.ts`); só os listeners de câmera são instalados/desinstalados a cada
montagem, porque o Strict Mode remonta o efeito. Ao mexer nesse arquivo,
mantenha essa divisão: o que o cleanup desfaz, a montagem tem que refazer.

`tick.ts` decide o que desenhar por `modo`:

- `start`/`lead` — cena de preview em tela cheia (`preview.ts`);
- `builder` — mesma cena, recortada por scissor no visor da maquete
  (`setPreviewClipRect`) e com a câmera guiada por `maquete.ts`;
- `sim` — entrega o frame inteiro a `simTickRef.current`, que a `SimScreen`
  preenche para renderizar o split-screen manual × AutoLoad (duas cenas, dois
  scissors).

`SceneCanvasLoader.tsx` existe só para aplicar `ssr: false`: `builders/core/`
cria texturas com `document.createElement("canvas")` **no load do módulo**, o
que quebra qualquer prerender.

### A planta é dado, não código

A cena não é escrita à mão: `public/planta_layout.json` traz ~143 elementos com
tipo, posição, rotação, escala e aparência. O arquivo vinha do editor externo
3d_plant, que não existe mais no repositório (`AutoLoad/3d_plant/` está vazia);
hoje quem o edita é o **editor de planta da própria aplicação** (ver abaixo), e
de vez em quando a mão. `scene.ts` carrega isso (`loadPlanta`/`getPlanta`), deriva os pontos
de interesse em `derivePlantaRefs()` (`STAGE_PT`, tancagem, pátio, ilha) e
monta tudo em `buildTerminal()`. Elementos `lib_*` referenciam o acervo de
`.glb` em `public/models/` indexado por `manifest.json`, carregado por
`model-library.ts`.

Portanto: **mover uma peça do terminal é editar o JSON, não o TypeScript.** E
posições novas de etapa precisam existir na planta ou `derivePlantaRefs` não as
encontra.

### O editor de planta (tela `editor`)

`src/lib/three/editor/**` + `src/components/editor/**`, alcançável pelo painel
administrativo. Monta uma cena própria com **um Object3D por elemento**, no
mesmo índice de `PL.elements` — é esse pareamento que faz o clique no 3D saber
qual linha do JSON foi tocada, e é por isso que ele não reaproveita
`buildTerminal()` (que agrupa peças e não deixa rastro de origem).

`editor/fabrica.ts` espelha o despacho por tipo de `buildTerminal()` e chama os
**mesmos** builders — leia o cabeçalho dele antes de mexer em qualquer um dos
dois lados. O que o jogo não desenha aparece como esqueleto rosa e leva aviso
no painel, de propósito: um editor que mostra mais do que o jogo faz o
desenvolvedor posicionar peça invisível.

Ele desenha pelo `editorTickRef` (mesmo contrato de `simTickRef`), para
`tick.ts` não arrastar a árvore do editor para o bundle do visitante, e usa
`controlesPausados` (`camera.ts`) para desligar os controles de câmera
compartilhados enquanto está aberto.

Gravar é `PUT /api/admin/planta` (exige sessão de admin): valida a forma do
arquivo, guarda backup carimbado e escreve num `.tmp` renomeado por cima. Ou
seja, **o app agora escreve a planta que lê** — `setPlanta()` troca a versão em
vigor sem F5.

### Materiais compartilhados — nunca dar `dispose()`

`M` (`builders/core/materials.ts`) é uma paleta única compartilhada por
preview, lado manual e lado AutoLoad. Liberar cena é sempre por
`disposeSceneContents()` (`renderer.ts`), que pula os materiais de `M` e os
clones do acervo (`userData.doAcervo`, que compartilham geometria com o
template). Sprites de rótulo, ao contrário, criam canvas+textura próprios e
**precisam** ser liberados — foi o vazamento que travava o kiosk ao longo do
dia da feira.

### Regras do jogo em um arquivo

`src/lib/constants.ts` concentra a modelagem: os 10 `MODULOS`, as 9 etapas de
`STAGES_DEF` e a tabela `PONTOS`. Duas invariantes:

- as etapas são declaradas pelo helper `stage(id, nome, mod, autoS,
  extraManualS, ...)` — o tempo manual é sempre o automatizado **mais** um
  acréscimo, nunca dois números soltos. Um `console.error` de boot vigia isso.
- a ordem de `STAGES_DEF` é ao mesmo tempo a trilha na tela e o circuito na
  maquete. Reordenar mexe nos dois.

A pontuação tem dois baldes deliberados: estratégia (escolha de módulos e
modais, escala forte) e agilidade (toque rápido, teto baixo em
`TAP_CAP_TOTAL`).

### Motor da simulação

`src/lib/three/sim/engine.ts` roda a 60 Hz dentro do `simTickRef`, **fora** do
ciclo de render do React. O estado vive em refs mutáveis de módulo (`simRef`,
`endResultRef`), não no Zustand, porque é lido e escrito a cada frame; a
`SimScreen` faz polling de `snapshotHUD()` a ~8 Hz para o HUD. Cada parada do
circuito (`ROTA_PARADAS`) dispara no lado manual um alerta com uma das cinco
missões de `missions.tsx`, e no lado automatizado um evento na fila do
`auto-console.tsx`.

### Fronteira cliente/servidor

`src/lib/server/**` importa `server-only`: se uma tela importar esses arquivos,
**o build falha**. É por isso que `src/lib/tipos.ts` existe — tipos partilhados
não podem morar junto das credenciais, nem via `import type`. As telas falam
com o banco só por `src/lib/ranking.ts` → `/api/**`.

Nenhuma variável tem prefixo `NEXT_PUBLIC_`, e isso é intencional: é esse
prefixo que embutiria a chave do Supabase no bundle do browser.

O ranking ao vivo é SSE (`/api/ranking/stream`) alimentado por um hub único no
servidor (`server/ranking-hub.ts`, guardado em `globalThis` para o hot reload
não deixar um polling órfão). Dar Supabase Realtime a cada kiosk exigiria
devolver a chave do banco ao cliente.

## Herança do porte

Boa parte de `src/lib/three/**` é porte do arquivo único
`autoload_expo3d.html`, e os comentários citam números de linha de lá. Esse
arquivo NÃO está neste repositório: ficou arquivado no de origem
(`Gui250/Jogo-Autoload`, em `legacy/ExpoPostos/`) e não recebe alterações. As
referências de linha são arqueologia — servem para entender de onde veio um
trecho, não são um lugar para editar em paralelo.

`three` está fixado em **0.128** — API antiga. Cor é tratada à mão com
`convertSRGBToLinear()`, `GLTFLoader` vem de `three/examples/jsm/`, e nada de
`outputColorSpace`/`ColorManagement` da versão moderna. Antes de usar uma API
do Three lembrada de outro projeto, confirme que existe nessa versão.
