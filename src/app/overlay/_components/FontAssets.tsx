import { googleFontUrls, type OverlayFonts } from '../_lib/fonts';

/**
 * Las hojas de Google Fonts de la fuente propia (si se eligió una de ahí). Las
 * de URL e instaladas en la PC van como @font-face en el <style> de la página;
 * Dharma, Articulat, Outfit y el resto ya las carga el sitio.
 */
export default function FontAssets({ fonts }: { fonts: OverlayFonts }) {
  const urls = googleFontUrls(fonts);
  if (!urls.length) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {urls.map((href) => (
        // Fuente que elige el productor para SU overlay, no del sitio.
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  );
}
