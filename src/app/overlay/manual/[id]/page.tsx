import type { Metadata } from 'next';
import ManualOverlay from './ManualOverlay';
import FontAssets from '../../_components/FontAssets';
import { overlayPageCss, parseOverlayConfig, type SearchParams } from '../../_lib/config';

/**
 * Overlay MANUAL para OBS / vMix: un marcador o un titular que el productor
 * maneja desde su panel (`/overlay/control/<id>`), sin cargar nada en G22.
 * Sale centrado (se escala y se ubica en el programa de transmisión); con
 * `estilo=tarjeta` o `estilo=barra` usa las otras piezas.
 */

export const metadata: Metadata = {
  title: 'Overlay G22',
  robots: { index: false, follow: false },
};

export default async function ManualOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const config = parseOverlayConfig(query, { style: 'marcador' });

  return (
    <>
      <style>{overlayPageCss(config.background, config.fonts)}</style>
      <FontAssets fonts={config.fonts} />
      <ManualOverlay id={decodeURIComponent(id)} config={config} />
    </>
  );
}
