import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SceneCanvas from "@/components/three/SceneCanvasLoader";

const redHatDisplay = localFont({
  src: "../../public/fonts/RedHatDisplay-latin.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-red-hat-display",
});

/**
 * A face de display do design system é a Hando, tipo comercial da Latinotype que
 * não está no repositório. O próprio briefing indica a substituta: Archivo, do
 * Google Fonts — a geométrica mais próxima, com o mesmo `a` de um andar. Se um
 * dia a Hando.ttf entrar em `public/fonts`, é só trocar o `src` daqui.
 *
 * Vem embutida como a Red Hat: o subconjunto latin, servido pelo próprio app.
 * Buscar do fonts.gstatic.com deixaria o totem na mão da rede da feira para
 * desenhar o próprio letreiro.
 */
const archivo = localFont({
  src: "../../public/fonts/Archivo-latin.woff2",
  weight: "400 800",
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "AutoLoad ExpoPostos",
  description: "Simulador AutoLoad para estande — versão web",
};

/**
 * Trava de escala do totem. O padrão do Next serve para um site; aqui a tela é
 * de 43", fica exposta o dia inteiro e ninguém tem como desfazer um acidente.
 *
 * `maximumScale`/`userScalable` fecham o zoom da PÁGINA — o duplo-toque que
 * amplia e a pinça sobre a interface. É perda zero: o único gesto de aproximar
 * que o jogo tem é a pinça sobre a maquete, que roda em JavaScript
 * (installCameraControls) sobre um canvas com `touch-action:none`, fora do
 * alcance desta trava. Sem ela, um visitante que dá dois toques rápidos num
 * botão deixa a interface ampliada e torta para o próximo da fila.
 *
 * `interactiveWidget: "resizes-content"`: quando o teclado virtual do Windows
 * sobe para preencher o cadastro, ele encolhe o quadro em vez de flutuar por
 * cima — o campo em foco continua visível, e o `height:100%` do body acompanha.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${redHatDisplay.variable} ${archivo.variable}`}>
      <body>
        <SceneCanvas />
        {children}
      </body>
    </html>
  );
}
