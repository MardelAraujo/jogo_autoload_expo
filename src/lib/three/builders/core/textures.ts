import * as THREE from "three";

/** Desenha num canvas offscreen e devolve como THREE.CanvasTexture (repetível). */
function makeCanvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size: number) {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  draw(cnv.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Asfalto — ruído sutil de manchas claras/escuras sobre cinza-chumbo. */
function makeAsphaltTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#3a3a3f";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 1.6 + 0.4;
      const sh = 34 + Math.random() * 26;
      ctx.fillStyle = `rgba(${sh},${sh},${sh + 2},${0.22 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 30 + 14;
      const dark = Math.random() < 0.5;
      ctx.fillStyle = dark ? "rgba(14,14,16,0.10)" : "rgba(70,70,75,0.10)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 256);
}

/** Casco do tanque — chapas rebitadas + costuras + escorrimento/ferrugem + ruído. */
function makeTankBodyTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#e4e1d5";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(110,104,88,0.20)";
    ctx.lineWidth = 1;
    const seams = 14;
    for (let i = 0; i < seams; i++) {
      const x = (i / seams) * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
      const rivets = 22;
      for (let j = 0; j < rivets; j++) {
        const y = (j / rivets) * size + (size / rivets) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(70,65,55,0.22)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 0.4, y - 0.4, 0.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,250,0.18)";
        ctx.fill();
      }
    }

    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(size, size * 0.5);
    ctx.strokeStyle = "rgba(110,104,88,0.16)";
    ctx.stroke();

    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size;
      const y0 = Math.random() * size * 0.55;
      const len = size * (0.15 + Math.random() * 0.4);
      const w = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(90,85,72,${0.05 + Math.random() * 0.1})`;
      ctx.fillRect(x, y0, w, len);
    }

    for (let i = 0; i < 14; i++) {
      const x = Math.random() * size;
      const y = size * (0.55 + Math.random() * 0.45);
      const r = 3 + Math.random() * 9;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(140,80,40,0.16)");
      grad.addColorStop(1, "rgba(140,80,40,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 450; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const light = Math.random() < 0.5;
      ctx.fillStyle = light ? "rgba(255,255,250,0.035)" : "rgba(60,55,45,0.045)";
      ctx.fillRect(x, y, 2, 2);
    }
  }, 512);
}

/** Teto do tanque — nervuras radiais (linhas verticais na textura viram raios no cone). */
function makeRoofTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#e8e5da";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(110,104,88,0.24)";
    ctx.lineWidth = 1;
    const ribs = 40;
    for (let i = 0; i < ribs; i++) {
      const x = (i / ribs) * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
  }, 256);
}

/**
 * Telha metálica trapezoidal (cobertura da plataforma de carregamento) — as
 * ondas são listras VERTICAIS de propósito: a face de cima de um BoxGeometry
 * tem `u` correndo em X e `v` em Z, e a água da telha desce no sentido Z do
 * pano de telhado. Listra vertical na textura = onda no sentido do caimento,
 * como telha real. Ondas com período que divide o lado do canvas, senão a
 * emenda aparece quando a textura repete ao longo do pano.
 */
function makeCorrugatedTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#9aa2ac";
    ctx.fillRect(0, 0, size, size);
    const waves = 8;
    const step = size / waves;
    for (let i = 0; i < waves; i++) {
      const x = i * step;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(x, 0, step * 0.34, size);
      ctx.fillStyle = "rgba(52,58,66,0.30)";
      ctx.fillRect(x + step * 0.62, 0, step * 0.16, size);
      ctx.fillStyle = "rgba(38,42,48,0.16)";
      ctx.fillRect(x + step * 0.78, 0, step * 0.1, size);
    }
    for (let j = 1; j < 4; j++) {
      const y = (j / 4) * size;
      ctx.fillStyle = "rgba(48,53,60,0.28)";
      ctx.fillRect(0, y, size, 1.5);
      for (let i = 0; i < waves; i++) {
        ctx.fillStyle = "rgba(40,44,50,0.5)";
        ctx.beginPath();
        ctx.arc(i * step + step * 0.5, y + 3, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(120,86,52,0.07)" : "rgba(30,34,40,0.07)";
      ctx.fillRect(x, y, 2 + Math.random() * 5, size * (0.04 + Math.random() * 0.12));
    }
  }, 256);
}

/** Brita do leito ferroviário — pedregulho angular claro/escuro sobre cinza. */
function makeBallastTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#6e6c68";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1.4 + Math.random() * 3.4;
      const sh = 78 + Math.random() * 72;
      ctx.fillStyle = `rgb(${sh},${sh - 3},${sh - 9})`;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.55);
      ctx.lineTo(x - r * 0.85, y + r);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = "rgba(28,27,25,0.35)";
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, 256);
}

/** Dormente de madeira creosotada — veio longitudinal escuro e rachaduras. */
function makeSleeperTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#5b4839";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * size;
      const h = 0.5 + Math.random() * 2.2;
      ctx.fillStyle = Math.random() < 0.6 ? "rgba(36,26,18,0.34)" : "rgba(124,100,76,0.22)";
      ctx.fillRect(0, y, size, h);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(24,17,11,0.5)";
    for (let i = 0; i < 9; i++) {
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(Math.random() * size * 0.3, y);
      ctx.lineTo(size * 0.5 + Math.random() * size * 0.5, y + (Math.random() - 0.5) * 7);
      ctx.stroke();
    }
  }, 128);
}

/**
 * Casco do vagão-tanque — aço escovado com costuras de solda circunferenciais.
 * O casco é um CylinderGeometry deitado (eixo em z), e o UV do cilindro tem
 * `u` dando a volta na circunferência e `v` ao longo do eixo. Por isso: linha
 * horizontal na textura = anel de solda em volta do casco; linha vertical =
 * escovado no sentido do comprimento.
 */
function makeRailCarTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#b4bac2";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * size;
      const a = 0.04 + Math.random() * 0.09;
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(88,94,102,${a})`;
      ctx.fillRect(x, 0, 1 + Math.random(), size);
    }
    const seams = 4;
    for (let i = 0; i < seams; i++) {
      const y = (i / seams) * size + size / (seams * 2);
      ctx.fillStyle = "rgba(68,74,82,0.45)";
      ctx.fillRect(0, y, size, 2);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(0, y + 2, size, 1);
    }
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = "rgba(74,66,56,0.10)";
      ctx.fillRect(x, y, 2 + Math.random() * 3, size * (0.05 + Math.random() * 0.18));
    }
  }, 256);
}

/**
 * Faixa zebrada de advertência (meio-fio dos diques) — amarelo e preto a 45°.
 * As listras são desenhadas com período que divide o lado do canvas, senão
 * a emenda aparece quando a textura se repete ao longo do meio-fio.
 */
function makeHazardTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#e5b41b";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#23262b";
    ctx.lineWidth = size / 13;
    const step = size / 4;
    for (let i = -4; i <= 8; i++) {
      const o = i * step;
      ctx.beginPath();
      ctx.moveTo(o, -size * 0.2);
      ctx.lineTo(o - size * 1.2, size * 1.2);
      ctx.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(40,36,28,0.14)";
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }, 128);
}

/** Gramado — verde com variação de tom e talos curtos, pra não virar chapado. */
function makeGrassTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#5f7d3c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 7;
      const g0 = 96 + Math.random() * 52;
      ctx.fillStyle = `rgba(${g0 * 0.62},${g0},${g0 * 0.42},0.30)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const h = 2 + Math.random() * 4;
      ctx.strokeStyle = Math.random() < 0.5 ? "rgba(126,166,74,0.5)" : "rgba(52,74,34,0.45)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - h);
      ctx.stroke();
    }
  }, 256);
}

/** Piso de concreto do dique — juntas de dilatação e manchas. */
function makePadTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#b3b3b6";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(90,90,95,0.09)";
      ctx.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    ctx.strokeStyle = "rgba(96,96,100,0.55)";
    ctx.lineWidth = 1.5;
    [0.5].forEach((f) => {
      ctx.beginPath();
      ctx.moveTo(f * size, 0);
      ctx.lineTo(f * size, size);
      ctx.moveTo(0, f * size);
      ctx.lineTo(size, f * size);
      ctx.stroke();
    });
  }, 256);
}

/**
 * Braço de cancela — chevrons diagonais vermelho/branco. A textura é aplicada
 * num box comprido (o braço), com `u` correndo no comprimento; as faixas saem
 * a 45° e com período que divide o lado do canvas, senão a emenda salta quando
 * a textura repete ao longo do braço.
 */
function makeBoomTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#d92d20";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#f4f4f4";
    ctx.strokeStyle = "#f4f4f4";
    const bands = 4;
    const step = size / bands;
    ctx.lineWidth = step * 0.5;
    for (let i = -1; i <= bands; i++) {
      const o = i * step;
      ctx.beginPath();
      ctx.moveTo(o, 0);
      ctx.lineTo(o + size, size);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  }, 128);
}

/** Tela de totem — mostrador escuro com "linhas" claras sugerindo texto/UI, pra ler como display aceso. */
function makeScreenTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#0d2a3a";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#12405a";
    ctx.fillRect(0, 0, size, size * 0.2);
    ctx.fillStyle = "rgba(126,210,240,0.85)";
    for (let i = 0; i < 6; i++) {
      const y = size * (0.32 + i * 0.1);
      ctx.fillRect(size * 0.12, y, size * (0.4 + Math.random() * 0.4), size * 0.035);
    }
    ctx.fillStyle = "#27c07a";
    ctx.fillRect(size * 0.12, size * 0.82, size * 0.3, size * 0.1);
  }, 128);
}

/** Rampa da escada helicoidal — listras escuras sugerindo degraus. */
function makeTreadTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#34323a";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y = (i / n) * size;
      ctx.fillRect(0, y, size, (size / n) * 0.3);
    }
  }, 64);
}

/**
 * Decalque da marca no costado do tanque — canvas TRANSPARENTE, aplicado num
 * anel fino de cilindro por fora da chapa (ver builders/tank.ts). Fica
 * transparente em vez de entrar na textura do casco porque o casco repete em
 * volta do tanque inteiro: qualquer logo desenhado ali apareceria carimbado
 * 14 vezes na circunferência.
 *
 * O canvas é bem mais largo que alto porque cobre um arco de ~65° do
 * costado — o texto precisa dessa proporção pra não sair esticado quando a
 * geometria curva a UV.
 */
// Proporção do decalque do tanque: é a da própria arte (801×216 px). Ao casar
// a moldura do decalque com a caixa do logotipo, a marca ocupa o retângulo
// inteiro sem margem sobrando e sem esticar — quem decide o tamanho aparente
// é só o arco de costado que a geometria pede (ver geometriaLogo em tank.ts).
// Se a arte for trocada por outra de proporção diferente, este número muda
// junto, senão o logotipo entra deformado.
const LOGO_TANQUE_ASPECTO = 801 / 216;

/** Azul da marca AutoLoad, medido na arte: a cor sólida mais frequente do PNG. */
const AZUL_AUTOLOAD = [104, 182, 201] as const;
/** Sombra do decalque no tanque — o mesmo azul rebaixado, pra marca não flutuar sobre o costado creme. */
const SOMBRA_AUTOLOAD = "rgba(24,66,79,0.34)";

/**
 * A marca AutoLoad recortada, pronta pra ser carimbada em qualquer superfície.
 *
 * A arte (`/marca/autoload.png`) vem com FUNDO BRANCO OPACO, não com alfa —
 * conferido pixel a pixel: os quatro cantos são 255,255,255,255. Carimbá-la
 * direto deixa um retângulo branco em volta, com cara de adesivo. Aqui o
 * branco vira transparência: como a arte é uma cor chapada sobre branco, o
 * alfa de cada pixel sai de quanto o canal vermelho se afastou do branco (255
 * no fundo, 104 na marca), o que preserva a suavização das curvas do símbolo,
 * e o RGB é repintado com o azul da identidade.
 *
 * A imagem chega por rede e as texturas dos builders nascem SÍNCRONAS (no load
 * do módulo). Daí o formato de callback: quem pede desenha o que já sabe
 * desenhar e completa com a marca quando ela chega. O recorte roda UMA vez, e
 * o canvas resultante é compartilhado pelos dois usos — costado do tanque e
 * placa da cerca —, que só o redimensionam.
 */
const LOGO_LARG = 1024;
const LOGO_ALT = Math.round(LOGO_LARG / LOGO_TANQUE_ASPECTO);
let marcaPronta: HTMLCanvasElement | null = null;
let marcaPedida = false;
const naFilaDaMarca: ((c: HTMLCanvasElement) => void)[] = [];

function comMarcaAutoLoad(usar: (marca: HTMLCanvasElement) => void) {
  if (marcaPronta) return usar(marcaPronta);
  naFilaDaMarca.push(usar);
  if (marcaPedida) return;
  marcaPedida = true;

  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = LOGO_LARG;
    c.height = LOGO_ALT;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, LOGO_LARG, LOGO_ALT);
    const dados = ctx.getImageData(0, 0, LOGO_LARG, LOGO_ALT);
    const px = dados.data;
    const [r, g, b] = AZUL_AUTOLOAD;
    for (let k = 0; k < px.length; k += 4) {
      const alfa = (255 - px[k]) / (255 - r); // 0 no branco, 1 na marca
      px[k] = r;
      px[k + 1] = g;
      px[k + 2] = b;
      px[k + 3] = Math.max(0, Math.min(255, Math.round(alfa * 255)));
    }
    ctx.putImageData(dados, 0, 0);
    marcaPronta = c;
    naFilaDaMarca.splice(0).forEach((f) => f(c));
  };
  img.src = "/marca/autoload.png";
}

/**
 * Carimba a marca engrossada de ~2 px.
 *
 * O símbolo é uma massa sólida e aguenta qualquer distância; a palavra
 * "autoload" é de traço fino, e traço fino em textura tem um problema
 * conhecido: a mipmap tira a média do traço com o vazio em volta, o alfa médio
 * despenca e a palavra desbota até sumir muito antes do símbolo. Redesenhar a
 * silhueta deslocada de 1 px nas oito direções antes do traço original engorda
 * o traço sem mexer na forma das letras — é o ajuste que faz uma arte pensada
 * pra papel funcionar na escala em que o jogo mostra a peça.
 */
function carimbarMarca(
  ctx: CanvasRenderingContext2D,
  marca: HTMLCanvasElement,
  x: number,
  y: number,
  larg: number,
  alt: number,
) {
  const e = Math.max(1, Math.round(larg / 512));
  for (let dx = -e; dx <= e; dx += e) {
    for (let dy = -e; dy <= e; dy += e) {
      if (dx || dy) ctx.drawImage(marca, x + dx, y + dy, larg, alt);
    }
  }
  ctx.drawImage(marca, x, y, larg, alt);
}

/**
 * Decalque da marca no costado do tanque.
 *
 * O ajuste pro cenário é uma sombra: a mesma silhueta em azul escuro,
 * deslocada meio ponto percentual, por baixo. Sem ela o azul claro da marca
 * encosta no creme do tanque com pouca diferença de luminância e some a partir
 * de uns 40 m de câmera; com ela a marca segura a borda sem que a cor da
 * identidade precise ser alterada.
 *
 * A textura sai vazia e é pintada quando a arte chega — o `alphaTest` do
 * material faz o decalque simplesmente não aparecer nos primeiros quadros, em
 * vez de piscar um retângulo.
 */
function makeTankLogoTexture() {
  const W = LOGO_LARG;
  const H = LOGO_ALT;
  const cnv = document.createElement("canvas");
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  comMarcaAutoLoad((marca) => {
    ctx.clearRect(0, 0, W, H);
    const desloca = Math.round(W * 0.005);
    ctx.drawImage(marca, desloca, desloca, W, H);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = SOMBRA_AUTOLOAD;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    carimbarMarca(ctx, marca, 0, 0, W, H);
    tex.needsUpdate = true;
  });

  return tex;
}

/**
 * Tela de alambrado — losangos claros sobre fundo transparente, usada ao
 * mesmo tempo como `map` e como `alphaMap` do pano da cerca.
 *
 * O arame é MUITO mais grosso do que seria em escala (uma malha real tem
 * losango de 5 cm; aqui cada um dá ~1,2 m). É de propósito: a mipmap faz a
 * média do alfa de blocos inteiros, e um arame fino de 2 px vira alfa ~0,05 a
 * poucos metros de câmera — a cerca simplesmente sumia, sobrando só os
 * montantes e as travessas, como um corrimão. Com o arame grosso a média
 * continua alta e a tela sobrevive à distância, que é a única em que o jogo a
 * mostra.
 *
 * O desenho tem de fechar nas quatro bordas (o último losango encosta no
 * primeiro), senão a repetição deixa uma emenda visível a cada painel. Por
 * isso o passo é size/N exato e as linhas vão de -size a 2*size.
 */
function makeChainLinkTexture() {
  return makeCanvasTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "square";
    const passo = size / 4;
    for (const [dy, cor, largura] of [
      [2, "rgba(26,30,36,0.85)", 11],
      [0, "rgba(226,232,240,0.98)", 9],
    ] as const) {
      ctx.strokeStyle = cor;
      ctx.lineWidth = largura;
      ctx.beginPath();
      for (let i = -4; i <= 8; i++) {
        ctx.moveTo(i * passo, -size + dy);
        ctx.lineTo(i * passo + 2 * size, size + dy);
        ctx.moveTo(i * passo, size * 2 + dy);
        ctx.lineTo(i * passo + 2 * size, dy);
      }
      ctx.stroke();
    }
  }, 128);
}

/**
 * Placa da marca na cerca do perímetro.
 *
 * Formato 2:1 porque é o formato da chapa (3,2 × 1,6 m em builders/fence.ts).
 * A versão anterior desenhava num canvas QUADRADO, e canvas quadrado numa
 * chapa 2:1 estica tudo ao dobro na horizontal — a marca saía deformada, o que
 * só não gritava porque a placa aparece pequena.
 *
 * Fundo escuro e frio, não o roxo/rosa que estava aqui: aquele vinha da paleta
 * da AutoMind, e a marca que a placa carrega agora é a da AutoLoad. Azul claro
 * sobre ardósia é a combinação que sobra legível na única escala em que esta
 * placa é vista de fato, que é pequena e de longe.
 */
function makeFenceSignTexture() {
  const W = 512;
  const H = 256;
  const cnv = document.createElement("canvas");
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  function fundo() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16303c");
    grad.addColorStop(1, "#0b1b23");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(104,182,201,0.55)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }

  function legenda() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(226,240,244,0.72)";
    ctx.font = `700 ${Math.round(H * 0.13)}px "Red Hat Display", system-ui, sans-serif`;
    ctx.fillText("ÁREA RESTRITA", W / 2, H * 0.76);
    ctx.textAlign = "start";
  }

  // desenha já o que é síncrono: sem a arte, a placa fica escura com a
  // legenda, que é melhor do que um retângulo vazio nos primeiros quadros
  fundo();
  legenda();

  comMarcaAutoLoad((marca) => {
    fundo();
    const larg = W * 0.74;
    const alt = larg / LOGO_TANQUE_ASPECTO;
    carimbarMarca(ctx, marca, (W - larg) / 2, H * 0.36 - alt / 2, larg, alt);
    legenda();
    tex.needsUpdate = true;
  });

  return tex;
}

export {
  makeCanvasTexture,
  makeTankLogoTexture,
  LOGO_TANQUE_ASPECTO,
  makeChainLinkTexture,
  makeFenceSignTexture,
  makeAsphaltTexture,
  makeTankBodyTexture,
  makeRoofTexture,
  makeCorrugatedTexture,
  makeBallastTexture,
  makeSleeperTexture,
  makeRailCarTexture,
  makeHazardTexture,
  makeGrassTexture,
  makePadTexture,
  makeBoomTexture,
  makeScreenTexture,
  makeTreadTexture,
};
