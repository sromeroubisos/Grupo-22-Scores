import type { Metadata } from 'next';
import FormationOverlay from './FormationOverlay';
import FontAssets from '../../_components/FontAssets';
import { first, overlayPageCss, parseOverlayConfig, type SearchParams } from '../../_lib/config';

/**
 * Formaciones de un partido para OBS / vMix:
 *
 *   /overlay/formacion/<partido>                  los dos equipos en lista
 *   /overlay/formacion/<partido>?lado=local        un equipo (en rugby, en la cancha)
 *   /overlay/formacion/<partido>?lado=visita&vista=lista
 */

export const metadata: Metadata = {
  title: 'Overlay G22',
  robots: { index: false, follow: false },
};

export default async function FormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const config = parseOverlayConfig(query);
  const rawSide = first(query.lado);
  const side = rawSide === 'local' || rawSide === 'visita' ? rawSide : 'ambos';
  const rawView = first(query.vista);
  const view = rawView === 'cancha' || rawView === 'lista' ? rawView : 'auto';

  return (
    <>
      <style>{overlayPageCss(config.background, config.fonts)}</style>
      <FontAssets fonts={config.fonts} />
      <FormationOverlay matchId={decodeURIComponent(id)} config={config} side={side} view={view} />
    </>
  );
}
