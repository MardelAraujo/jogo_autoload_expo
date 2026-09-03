import { LOGO_AUTOLOAD_SVG } from "@/lib/constants";

// currentColor no fill — herda a cor de texto do elemento que a envolve
// (branco no cartão de fundo escuro, cinza na tarja de módulos).
export function AutoloadLogo({ id, className }: { id?: string; className?: string }) {
  return <span id={id} className={className} dangerouslySetInnerHTML={{ __html: LOGO_AUTOLOAD_SVG }} />;
}
