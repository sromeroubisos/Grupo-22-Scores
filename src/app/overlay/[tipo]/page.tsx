import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { OverlayFeedKind } from '@/lib/overlay/overlayFeedTypes';
import FeedOverlay from '../_components/FeedOverlay';
import FontAssets from '../_components/FontAssets';
import { first, overlayPageCss, parseOverlayConfig, type SearchParams } from '../_lib/config';

/**
 * Overlays de transmisión alimentados por `/api/overlay`:
 *
 *   /overlay/partidos?ids=<id>,<id>        partidos elegidos
 *   /overlay/fecha?torneo=<id>[&ronda=<id>] una fecha (sin ronda: la de hoy)
 *   /overlay/dia[?fecha=AAAA-MM-DD][&torneos=<id>,<id>]
 *   /overlay/playoff?torneo=<id>[&fase=<id>][&copa=1]
 *   /overlay/jugador?id=<id>[&torneo=<id>]
 *   /overlay/home[?deporte=rugby][&torneos=…][&vivo=1]   la home: todos los deportes
 *   /overlay/tabla?torneo=<id>[&fase=<id>][&grupo=<id>]
 *   /overlay/goleadores?torneo=<id>[&stat=puntos|tries|goles|…][&cantidad=10]
 *   /overlay/noticia?id=<link de la nota>
 *
 * Más los parámetros de presentación comunes (pos, escala, mostrar/ocultar,
 * filas, rotar, fondo, prueba…), ver `_lib/config.ts`. El generador en
 * `/overlay` arma estas URLs.
 */

export const metadata: Metadata = {
  title: 'Overlay G22',
  robots: { index: false, follow: false },
};

const KINDS: Record<string, OverlayFeedKind> = {
  partidos: 'partidos',
  fecha: 'fecha',
  dia: 'dia',
  home: 'home',
  tabla: 'tabla',
  goleadores: 'goleadores',
  noticia: 'noticia',
  playoff: 'playoff',
  jugador: 'jugador',
};

/** Solo los parámetros de DATOS viajan a la API; los de presentación se quedan acá. */
const DATA_PARAMS = ['ids', 'torneo', 'ronda', 'fecha', 'torneos', 'fase', 'grupo', 'id', 'titulo', 'deporte', 'vivo', 'stat', 'cantidad'];

export default async function OverlayFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ tipo }, query] = await Promise.all([params, searchParams]);
  const kind = KINDS[tipo];
  if (!kind) notFound();

  const config = parseOverlayConfig(query, {
    rows: kind === 'partidos' ? 6 : kind === 'tabla' ? 10 : kind === 'goleadores' ? 5 : 7,
  });

  const dataQuery = new URLSearchParams();
  for (const key of DATA_PARAMS) {
    const value = first(query[key]);
    if (value) dataQuery.set(key, value);
  }

  return (
    <>
      <style>{overlayPageCss(config.background, config.fonts)}</style>
      <FontAssets fonts={config.fonts} />
      <FeedOverlay kind={kind} query={dataQuery.toString()} config={config} />
    </>
  );
}
