import type { Metadata } from 'next';
import LinkWatch from '../../_components/LinkWatch';
import { checkOverlayLink } from '../../_lib/linkGate';
import ManualOverlay from './ManualOverlay';
import FontAssets from '../../_components/FontAssets';
import { applyPlan, overlayPageCss, parseOverlayConfig, type SearchParams } from '../../_lib/config';

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
  const asked = parseOverlayConfig(query, { style: 'marcador' });

  const gate = await checkOverlayLink(query, `/overlay/manual/${id}`);
  // Lo que pide la URL, recortado al plan del dueño del enlace.
  const config = applyPlan(asked, gate.status === 'ok' ? gate.plan : 'basico');

  return (
    <>
      <style>{overlayPageCss(config.background, config.fonts)}</style>
      <FontAssets fonts={config.fonts} />
      <LinkWatch gate={gate} brand={config.brand}>
        <ManualOverlay id={decodeURIComponent(id)} config={config} />
      </LinkWatch>
    </>
  );
}
