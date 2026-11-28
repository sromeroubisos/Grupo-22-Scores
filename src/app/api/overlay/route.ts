import { NextRequest, NextResponse } from 'next/server';
import {
  OverlayFeedError,
  feedDay,
  feedPlayer,
  feedPlayoff,
  feedRound,
  feedSelectedMatches,
  feedTournamentOptions,
  parseIdList,
} from '@/lib/server/overlayFeed';
import { feedGroup, feedHome, feedLeaders, feedNews, feedStandings } from '@/lib/server/overlayFeedTables';
import { searchOverlay } from '@/lib/server/overlaySearch';

/**
 * Lectura pública para los overlays de transmisión (`/overlay/*`).
 *
 *   ?tipo=partidos&ids=<id>,<id>…          partidos elegidos, en ese orden
 *   ?tipo=fecha&torneo=<id>[&ronda=<id>]   una fecha (sin ronda: la más cercana a hoy)
 *   ?tipo=dia[&fecha=AAAA-MM-DD][&torneos=<id>,<id>]
 *   ?tipo=playoff&torneo=<id>[&fase=<id>]
 *   ?tipo=jugador&id=<id>[&torneo=<id>]
 *   ?tipo=home[&fecha=…][&deporte=rugby][&torneos=…][&vivo=1]  la home: todos los deportes y proveedores
 *   ?tipo=tabla&torneo=<id>[&fase=<id>][&grupo=<id>]
 *   ?tipo=grupo&torneo=<id>[&fase=<id>][&grupo=<id>]  una zona: sus partidos y su tabla
 *   ?tipo=goleadores&torneo=<id>[&stat=puntos|tries|goles|conversiones|penales|tarjetas][&cantidad=10]
 *   ?tipo=noticia&id=<id o link de la nota>
 *   ?tipo=opciones&torneo=<id>             fechas, fases, zonas y playoffs (para el generador)
 *   ?tipo=buscar&q=<nombre>                clubes, sus partidos cercanos y torneos (generador y panel)
 *
 * Solo devuelve lo que ya es público (partidos visibles, ficha de jugador sin
 * datos personales). Caché de CDN corta: un overlay se relee cada pocos
 * segundos y varios productores pueden estar mirando la misma fecha.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tipo = params.get('tipo') ?? '';
  const title = params.get('titulo')?.trim().slice(0, 80) || null;
  const tournament = parseIdList(params.get('torneo'), 1)[0] ?? '';

  try {
    let body: unknown;
    switch (tipo) {
      case 'partidos':
        body = await feedSelectedMatches(parseIdList(params.get('ids')), title);
        break;
      case 'fecha':
        body = await feedRound(tournament, params.get('ronda'), title);
        break;
      case 'dia':
        body = await feedDay(params.get('fecha'), parseIdList(params.get('torneos')), title);
        break;
      case 'playoff':
        body = await feedPlayoff(tournament, params.get('fase'), title);
        break;
      case 'jugador':
        body = await feedPlayer(parseIdList(params.get('id'), 1)[0] ?? '', tournament || null, title);
        break;
      case 'home':
        body = await feedHome(params.get('fecha'), params.get('deporte'), parseIdList(params.get('torneos')), params.get('vivo') === '1', title);
        break;
      case 'tabla':
        body = await feedStandings(tournament, params.get('fase'), params.get('grupo'), title);
        break;
      case 'grupo':
        body = await feedGroup(tournament, params.get('fase'), params.get('grupo'), title);
        break;
      case 'goleadores':
        body = await feedLeaders(tournament, params.get('stat'), Number(params.get('cantidad')) || 10, title);
        break;
      case 'noticia':
        body = await feedNews(params.get('id') ?? '', title);
        break;
      case 'opciones':
        body = await feedTournamentOptions(tournament);
        break;
      case 'buscar':
        body = await searchOverlay(params.get('q') ?? '');
        break;
      default:
        return NextResponse.json(
          { error: 'tipo tiene que ser partidos, fecha, dia, home, playoff, jugador, tabla, grupo, goleadores, noticia, opciones o buscar.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
    }
    // Goleadores y jugador recorren todos los partidos del torneo: cambian poco
    // y son caros, así que se cachean más.
    const slow = tipo === 'goleadores' || tipo === 'jugador' || tipo === 'noticia';
    return NextResponse.json(body, {
      headers: { 'Cache-Control': slow ? 'public, s-maxage=60, stale-while-revalidate=300' : 'public, s-maxage=3, stale-while-revalidate=10' },
    });
  } catch (error: unknown) {
    if (error instanceof OverlayFeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('[GET /api/overlay]', error);
    return NextResponse.json({ error: 'No se pudo armar el overlay.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
