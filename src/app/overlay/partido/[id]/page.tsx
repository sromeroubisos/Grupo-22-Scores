import type { Metadata } from 'next';
import MatchOverlay from './MatchOverlay';
import FontAssets from '../../_components/FontAssets';
import { overlayPageCss, parseOverlayConfig, type SearchParams } from '../../_lib/config';

/**
 * Overlay de un partido para OBS / vMix / Streamlabs / cualquier programa con
 * "Browser Source": una URL por partido que se actualiza sola con lo que carga
 * el planillero en g22scores.
 *
 *   estilo=tarjeta  (por defecto) la tarjeta G22 con escudos, marcador, anotadores y placas
 *   estilo=marcador el marcador chico de esquina
 *   estilo=barra    el zócalo ancho abajo
 *
 * Todo lo demás (posición, escala, ciclo de aparición, colores, chroma) se
 * configura por la URL: ver `_lib/config.ts`. El generador en `/overlay` la arma.
 */

export const metadata: Metadata = {
  title: 'Overlay G22',
  robots: { index: false, follow: false },
};

export default async function OverlayMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const config = parseOverlayConfig(query, { style: 'tarjeta' });

  return (
    <>
      <style>{overlayPageCss(config.background, config.fonts)}</style>
      <FontAssets fonts={config.fonts} />
      <MatchOverlay matchId={decodeURIComponent(id)} config={config} />
    </>
  );
}
