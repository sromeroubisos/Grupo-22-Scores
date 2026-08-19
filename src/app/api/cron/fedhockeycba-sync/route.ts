/**
 * Sync del hockey de Córdoba desde fedhockeycba.com.ar.
 *
 *   GET /api/cron/fedhockeycba-sync            corrida normal
 *   GET /api/cron/fedhockeycba-sync?dry=1      plan sin escribir
 *   GET /api/cron/fedhockeycba-sync?dias=30    mirar más atrás (default 10)
 *
 * El ciclo: la API REST del WordPress dice qué posts cambiaron; de los posts
 * "FIXTURE Nº" se baja el PDF y se parsea la agenda; de las crónicas se
 * extraen los resultados; `planTournamentMatches` decide qué se crea, qué se
 * adopta y qué se actualiza; las posiciones se recalculan LOCALMENTE — de la
 * web nunca se copia una tabla, igual que con URBA.
 *
 * Qué torneos entran: los que tienen `external_id = 'fedhockeycba:{slug}'`
 * (los siembra `src/scripts/fedhockeycba-seed-vinculos.ts`). El slug es la
 * clave del encabezado con el que la federación escribe el torneo en el
 * fixture: vincular un torneo nuevo es UNA fila, no un deploy.
 *
 * Todo lo que no se entiende viaja en la respuesta (`omitidos`, `errors`):
 * la lección de FlashScore es que un scraper caído que responde "día vacío"
 * es peor que uno que grita.
 */
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchPdf,
  fetchPostsRecientes,
  pausa,
  pdfsDeFixture,
  HTTP_FORMA_INESPERADA,
  PAUSA_MS,
  type WpPost,
} from '@/lib/integrations/fedhockeycba/client.ts';
import { lineasDelPdf } from '@/lib/integrations/fedhockeycba/pdf-text.ts';
import { parseFixture, type SeccionDeFixture } from '@/lib/integrations/fedhockeycba/fixture-parser.ts';
import { extraerResultados, htmlATexto, type ResultadoDeCronica } from '@/lib/integrations/fedhockeycba/cronicas.ts';
import { planTournamentMatches, type ExistenteHockey } from '@/lib/integrations/fedhockeycba/planMatches.ts';
import { claveDeNombre, FEDHOCKEYCBA_ID_PREFIX, FEDHOCKEYCBA_PROVIDER } from '@/lib/integrations/fedhockeycba/nombres.ts';

// pdfjs necesita Node de verdad, y el sync no se cachea.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIAS_POR_DEFECTO = 10;
/** La división del PDF que alimenta los torneos vinculados (primera). */
const DIVISION = '1';

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET?.trim();
  // En dev sin CRON_SECRET pasa, como el resto de los crons.
  if (!secreto) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secreto}`;
}

/** Los boletines son administrativos (sanciones) pero ADJUNTAN el fixture semanal. */
const esPostDeBoletin = (p: WpPost) => /BOLET[ÍI]N/i.test(p.titulo);

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const dias = Number(url.searchParams.get('dias') ?? DIAS_POR_DEFECTO) || DIAS_POR_DEFECTO;
  const hoy = new Date().toISOString().slice(0, 10);

  const supabase = createAdminClient();
  const errors: string[] = [];

  // ── torneos vinculados y alias de equipos ────────────────────────────────
  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, external_id, is_visible, current_season_id')
    .like('external_id', `${FEDHOCKEYCBA_ID_PREFIX}%`);
  if (errTorneos) return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  const torneos = (torneosRaw ?? []) as { id: string; name: string; external_id: string; is_visible: boolean | null; current_season_id: string | null }[];
  if (!torneos.length) {
    return NextResponse.json({
      ok: false,
      error: 'Ningún torneo tiene external_id fedhockeycba:. Correr src/scripts/fedhockeycba-seed-vinculos.ts primero.',
    }, { status: 200 });
  }

  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', FEDHOCKEYCBA_PROVIDER)
    .limit(2000);
  if (errAlias) return NextResponse.json({ error: `No se pudieron leer los alias (${errAlias.message})` }, { status: 500 });
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const resolverDe = (slug: string) => (clave: string) => alias.get(`${slug}|${clave}`) ?? null;

  // ── qué cambió en el WordPress ───────────────────────────────────────────
  const rPosts = await fetchPostsRecientes();
  if (!rPosts.ok || !rPosts.data) {
    const detalle = rPosts.status === HTTP_FORMA_INESPERADA
      ? 'el WordPress contestó algo que el conector no entiende (cambió la forma)'
      : `HTTP ${rPosts.status}`;
    return NextResponse.json({ ok: false, error: `fedhockeycba.com.ar: ${detalle}` }, { status: 502 });
  }
  const corte = Date.now() - dias * 86_400_000;
  const recientes = rPosts.data.filter((p) => Date.parse(p.modified) >= corte);

  // ── fixtures: PDF → secciones. El PDF puede venir en un post propio
  // ("FIXTURE Nº 09") o adjunto al boletín semanal; el filtro es por el
  // nombre del archivo. El mismo archivo puede colgar de dos posts (el pre
  // boletín y el boletín): se baja una sola vez.
  const secciones: SeccionDeFixture[] = [];
  const fixtureLeidos: string[] = [];
  const pdfsVistos = new Set<string>();
  for (const post of recientes) {
    for (const pdfUrl of pdfsDeFixture(post.contenidoHtml)) {
      if (pdfsVistos.has(pdfUrl)) continue;
      pdfsVistos.add(pdfUrl);
      const rPdf = await fetchPdf(pdfUrl);
      await pausa(PAUSA_MS);
      if (!rPdf.ok || !rPdf.data) { errors.push(`"${post.titulo}": PDF ${rPdf.status === HTTP_FORMA_INESPERADA ? 'irreconocible' : `HTTP ${rPdf.status}`} (${pdfUrl})`); continue; }
      try {
        const parsed = parseFixture(await lineasDelPdf(rPdf.data));
        secciones.push(...parsed.secciones);
        fixtureLeidos.push(pdfUrl.split('/').pop() ?? pdfUrl);
      } catch (e) {
        errors.push(`"${post.titulo}": el PDF no se pudo leer (${e instanceof Error ? e.message : e})`);
      }
    }
  }

  // ── crónicas: HTML → texto (la resolución de resultados es por torneo) ───
  const cronicas = recientes
    .filter((p) => !esPostDeBoletin(p) && !/\bFIXTURE\b/i.test(p.titulo))
    .map((p) => ({ titulo: p.titulo, texto: htmlATexto(p.contenidoHtml) }));

  // ── un plan por torneo ───────────────────────────────────────────────────
  const resumen: unknown[] = [];
  const slugsConSeccion = new Set(secciones.map((s) => s.slug));
  let escrituras = 0;

  for (const t of torneos) {
    const slug = t.external_id.slice(FEDHOCKEYCBA_ID_PREFIX.length);
    const seccionesDelTorneo = secciones.filter((s) => s.slug === slug);
    const resolver = resolverDe(slug);

    const resultados: ResultadoDeCronica[] = [];
    for (const c of cronicas) resultados.push(...extraerResultados(c.texto, resolver, claveDeNombre));

    if (!seccionesDelTorneo.length && !resultados.length) {
      resumen.push({ torneo: t.external_id, sinNovedades: true });
      continue;
    }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select('id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, is_visible, season_id')
      .eq('tournament_id', t.id)
      .limit(2000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as (ExistenteHockey & { is_visible: boolean | null; season_id: string | null })[];

    // Un partido nuevo hereda de sus hermanos la fase, la visibilidad y la
    // temporada: la publicación la decide una persona, el conector la copia.
    // Un torneo RECIÉN creado no tiene hermanos: ahí la fase sale de sus
    // tournament_phases y la visibilidad y temporada del propio torneo.
    let faseDelTorneo = ya.find((m) => m.phase_id)?.phase_id ?? null;
    if (!faseDelTorneo) {
      const { data: fases } = await supabase
        .from('tournament_phases')
        .select('id, order_index')
        .eq('tournament_id', t.id)
        .order('order_index', { ascending: true })
        .limit(1);
      faseDelTorneo = (fases as { id: string }[] | null)?.[0]?.id ?? null;
    }
    const visibleEnEsteTorneo = ya.length ? ya.some((m) => m.is_visible === true) : t.is_visible === true;
    const seasonDelTorneo = ya.find((m) => m.season_id)?.season_id ?? t.current_season_id ?? null;

    const { data: partsRaw, error: errParts } = await supabase
      .from('tournament_participants').select('club_id').eq('tournament_id', t.id).limit(2000);
    if (errParts) { errors.push(`${t.external_id}: no se pudieron leer los participantes (${errParts.message})`); continue; }
    const yaParticipan = new Set(((partsRaw ?? []) as { club_id: string }[]).map((p) => p.club_id));

    const plan = planTournamentMatches({
      slug,
      secciones: seccionesDelTorneo,
      division: DIVISION,
      resultados,
      resolverClub: resolver,
      existentes: ya,
      hoy,
    });

    const fasesTocadas = new Set<string>();
    let creados = 0;
    let actualizados = 0;
    let participantesCreados = 0;

    if (!enSeco) {
      // participantes que faltan: sin la fila, el motor de posiciones descarta
      // el partido sin error y sin aviso. Y sin su inscripción de temporada
      // (team_season_entries) la PÁGINA del torneo tampoco lo lista — la FK
      // circular se cierra en 3 pasos, igual que en los imports históricos.
      const faltan = [...plan.clubesInvolucrados].filter((c) => !yaParticipan.has(c));
      if (faltan.length) {
        const { data: nombresRaw } = await supabase.from('clubs').select('id, name').in('id', faltan);
        const nombres = new Map(((nombresRaw ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        for (const clubId of faltan) {
          const participantId = globalThis.crypto.randomUUID();
          const { error } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: t.id, season_id: seasonDelTorneo,
            club_id: clubId, name: nombres.get(clubId) ?? clubId, type: 'club', status: 'active',
          }]);
          if (error) { errors.push(`${t.external_id}: no se pudo inscribir a ${clubId} (${error.message})`); continue; }
          if (seasonDelTorneo) {
            const entryId = globalThis.crypto.randomUUID();
            const { error: errEntrada } = await supabase.from('team_season_entries').insert([{
              id: entryId, season_id: seasonDelTorneo, tournament_id: t.id,
              club_id: clubId, team_id: null, source_participant_id: participantId,
              status: 'active', settings: { source: 'fedhockeycba-sync' },
            }]);
            if (errEntrada) errors.push(`${t.external_id}: inscripto ${clubId} pero sin entrada de temporada (${errEntrada.message})`);
            else await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
          }
          // Sin la asignación de fase el club no entra a la tabla de
          // posiciones aunque tenga partidos (loadPhaseScopedParticipants).
          if (faseDelTorneo) {
            const { error: errFase } = await supabase.from('tournament_phase_participants').insert([{
              id: globalThis.crypto.randomUUID(), tournament_id: t.id, season_id: seasonDelTorneo,
              phase_id: faseDelTorneo, participant_id: participantId, group_id: null, status: 'active',
            }]);
            if (errFase) errors.push(`${t.external_id}: inscripto ${clubId} pero sin asignación de fase (${errFase.message})`);
          }
          participantesCreados++;
          if (faseDelTorneo) fasesTocadas.add(faseDelTorneo);
        }
      }

      for (const alta of plan.crear) {
        const { error } = await supabase.from('matches').insert([{
          ...alta,
          tournament_id: t.id,
          sport_id: 'field-hockey',
          is_visible: visibleEnEsteTorneo,
          phase_id: faseDelTorneo,
          season_id: seasonDelTorneo,
        }]);
        if (error) { errors.push(`${alta.external_id}: alta falló (${error.message})`); continue; }
        creados++;
        if (alta.status === 'final' && faseDelTorneo) fasesTocadas.add(faseDelTorneo);
      }

      for (const cambio of plan.actualizar) {
        const { error } = await supabase.from('matches').update(cambio.patch).eq('id', cambio.id);
        if (error) { errors.push(`${t.external_id} ${cambio.id}: update falló (${error.message})`); continue; }
        actualizados++;
        // Sólo un resultado mueve la tabla; una reprogramación no.
        if ('score' in cambio.patch && cambio.phase_id) fasesTocadas.add(cambio.phase_id);
      }

      if (fasesTocadas.size) {
        // Import diferido: la cadena de standings arrastra módulos `server-only`
        // que sólo resuelven dentro de Next, y el dry-run corre también por tsx.
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        for (const fase of fasesTocadas) {
          const r = await recalculatePhaseStandingsScopes(t.id, fase, 'general');
          if (!r.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
        }
      }
      escrituras += creados + actualizados + participantesCreados;
    }

    // El mismo PDF cuelga del pre boletín y del boletín: el plan es
    // idempotente pero el reporte repetiría cada omitido dos veces.
    const omitidosUnicos = [...new Map(plan.omitidos.map((o) => [`${o.motivo}|${o.detalle}`, o])).values()];

    resumen.push({
      torneo: t.external_id,
      secciones: seccionesDelTorneo.length,
      resultadosDeCronicas: resultados.length,
      crear: enSeco ? plan.crear.length : creados,
      actualizar: enSeco ? plan.actualizar.length : actualizados,
      participantesNuevos: participantesCreados,
      sinCambios: plan.sinCambios,
      omitidos: omitidosUnicos,
      // En seco el plan entero viaja en la respuesta: es la única forma de
      // revisar QUÉ escribiría antes de dejarlo correr solo.
      ...(enSeco && {
        detalleCrear: plan.crear.map((a) => `${a.external_id} → ${a.status} ${a.date_time}${a.score ? ` ${a.score.home}-${a.score.away}` : ''}`),
        detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })),
      }),
    });
  }

  if (escrituras > 0) {
    try {
      const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
      await invalidateMatchesFeedCaches(supabase);
    } catch {
      errors.push('No se pudieron invalidar los cachés del feed');
    }
  }

  // Un fixture bajado que no matchea con NINGÚN torneo vinculado es la señal
  // de que la federación cambió un encabezado: mejor un aviso que el silencio.
  const seccionesHuerfanas = [...slugsConSeccion].filter(
    (s) => !torneos.some((t) => t.external_id === `${FEDHOCKEYCBA_ID_PREFIX}${s}`),
  );

  return NextResponse.json({
    ok: errors.length === 0,
    dry: enSeco,
    posts: { revisados: recientes.length, fixtures: fixtureLeidos, cronicas: cronicas.length },
    torneos: resumen,
    seccionesSinTorneo: seccionesHuerfanas,
    errors,
  });
}
