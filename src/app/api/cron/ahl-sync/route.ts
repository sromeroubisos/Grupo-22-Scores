/**
 * Sync del hockey del Litoral desde ahl.com.ar.
 *
 *   GET /api/cron/ahl-sync              corrida normal
 *   GET /api/cron/ahl-sync?dry=1        plan sin escribir
 *   GET /api/cron/ahl-sync?boletines=4  cuántos PDFs mirar hacia atrás (default 2)
 *
 * El ciclo: la página /boletin-competencia/ lista los PDFs semanales del más
 * nuevo al más viejo; se bajan los primeros N, se parsea la programación
 * (torneo → fecha → categoría → partidos) y `planTournamentMatches` — el
 * MISMO planificador que usa fedhockeycba — decide altas, adopciones y
 * reprogramaciones. Posiciones locales, como siempre.
 *
 * Los RESULTADOS no salen de la AHL (ella los guarda en SICAH, su intranet):
 * salen de estoeshockey.com, un sitio rosarino que publica los marcadores de
 * cada campeonato en HTML. El mapa campeonato→torneo va a mano acá
 * (CAMPEONATOS), e incluye un cruce de providers: el Interprovincial de
 * Caballeros es un torneo de fedhockeycba (lo programa Córdoba) pero sus
 * marcadores los publica estoeshockey — este cron se los acerca.
 *
 * Qué torneos entran: los que tienen `external_id = 'ahl:{slug}'` (los crea
 * `src/scripts/ahl-crear-torneos.ts`) más los cruces declarados. Todo lo no
 * entendido viaja en la respuesta: `omitidos`, `errors`, `seccionesSinTorneo`,
 * `resultadosNoResueltos`.
 */
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchPaginaBoletinCompetencia,
  fetchPdf,
  pausa,
  HTTP_FORMA_INESPERADA,
  PAUSA_MS,
} from '@/lib/integrations/ahl/client.ts';
import { lineasDelPdf } from '@/lib/integrations/fedhockeycba/pdf-text.ts';
import { parseBoletinCompetencia } from '@/lib/integrations/ahl/boletin-parser.ts';
import { planTournamentMatches, type ExistenteHockey } from '@/lib/integrations/fedhockeycba/planMatches.ts';
import type { SeccionDeFixture } from '@/lib/integrations/fedhockeycba/fixture-parser.ts';
import type { ResultadoDeCronica } from '@/lib/integrations/fedhockeycba/cronicas.ts';
import { buildMatchExternalId, claveDeNombre, AHL_ID_PREFIX, AHL_PROVIDER } from '@/lib/integrations/ahl/nombres.ts';
import {
  campeonatoSeleccionado,
  fetchResultadosCampeonato,
  parseResultados,
  type ResultadoCrudo,
} from '@/lib/integrations/ahl/estoeshockey.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BOLETINES_POR_DEFECTO = 2;
const DIVISION = '1';

/**
 * Campeonato de estoeshockey → torneo nuestro. El slug es el de los alias;
 * `externalId` explícito cuando el torneo no es del provider ahl (el
 * Interprovincial vive bajo fedhockeycba pero sus resultados salen de acá).
 */
const CAMPEONATOS: { slug: string; campeonato: number; externalId?: string }[] = [
  { slug: 'clausura-litoral-a', campeonato: 246 },
  { slug: 'clausura-litoral-b', campeonato: 247 },
  { slug: 'clausura-litoral-c', campeonato: 248 },
  { slug: 'clausura-litoral-d', campeonato: 249 },
  { slug: 'torneo-interprovincial-caballeros-2026', campeonato: 244, externalId: 'fedhockeycba:torneo-interprovincial-caballeros-2026' },
];

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secreto}`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const boletines = Math.min(10, Number(url.searchParams.get('boletines') ?? BOLETINES_POR_DEFECTO) || BOLETINES_POR_DEFECTO);
  const hoy = new Date().toISOString().slice(0, 10);

  const supabase = createAdminClient();
  const errors: string[] = [];

  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, external_id, is_visible, current_season_id')
    .like('external_id', `${AHL_ID_PREFIX}%`);
  if (errTorneos) return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  const torneos = (torneosRaw ?? []) as { id: string; name: string; external_id: string; is_visible: boolean | null; current_season_id: string | null }[];
  if (!torneos.length) {
    return NextResponse.json({
      ok: false,
      error: 'Ningún torneo tiene external_id ahl:. Correr src/scripts/ahl-crear-torneos.ts primero.',
    }, { status: 200 });
  }

  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', AHL_PROVIDER)
    .limit(2000);
  if (errAlias) return NextResponse.json({ error: `No se pudieron leer los alias (${errAlias.message})` }, { status: 500 });
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const resolverDe = (slug: string) => (clave: string) => alias.get(`${slug}|${clave}`) ?? null;

  // ── los boletines más nuevos ──────────────────────────────────────────────
  const rPagina = await fetchPaginaBoletinCompetencia();
  if (!rPagina.ok || !rPagina.data) {
    const detalle = rPagina.status === HTTP_FORMA_INESPERADA
      ? 'la página de boletines contestó algo que el conector no entiende (cambió la forma)'
      : `HTTP ${rPagina.status}`;
    return NextResponse.json({ ok: false, error: `ahl.com.ar: ${detalle}` }, { status: 502 });
  }

  const secciones: SeccionDeFixture[] = [];
  const boletinesLeidos: string[] = [];
  for (const pdfUrl of rPagina.data.pdfs.slice(0, boletines)) {
    const rPdf = await fetchPdf(pdfUrl);
    await pausa(PAUSA_MS);
    if (!rPdf.ok || !rPdf.data) { errors.push(`${pdfUrl.split('/').pop()}: PDF ${rPdf.status === HTTP_FORMA_INESPERADA ? 'irreconocible' : `HTTP ${rPdf.status}`}`); continue; }
    try {
      const parsed = parseBoletinCompetencia(await lineasDelPdf(rPdf.data));
      secciones.push(...parsed.secciones);
      boletinesLeidos.push(pdfUrl.split('/').pop() ?? pdfUrl);
    } catch (e) {
      errors.push(`${pdfUrl.split('/').pop()}: el PDF no se pudo leer (${e instanceof Error ? e.message : e})`);
    }
  }

  // ── los resultados por campeonato desde estoeshockey ─────────────────────
  const resultadosPorSlug = new Map<string, ResultadoCrudo[]>();
  for (const c of CAMPEONATOS) {
    const r = await fetchResultadosCampeonato(c.campeonato);
    await pausa(PAUSA_MS);
    if (!r.ok || !r.html) { errors.push(`estoeshockey ${c.campeonato}: HTTP ${r.status}`); continue; }
    // La guarda del selector: si el sitio deja de responder al parámetro,
    // devuelve siempre el campeonato default y los resultados serían de OTRO
    // torneo. Mejor un error que marcadores cruzados.
    if (campeonatoSeleccionado(r.html) !== c.campeonato) {
      errors.push(`estoeshockey ${c.campeonato}: la página devolvió otro campeonato — no se usan sus resultados`);
      continue;
    }
    resultadosPorSlug.set(c.slug, parseResultados(r.html));
  }

  // ── un plan por torneo: agenda del boletín + resultados de estoeshockey ──
  const resumen: unknown[] = [];
  const slugsConSeccion = new Set(secciones.map((s) => s.slug));
  let escrituras = 0;

  // Los torneos ahl: más los cruces declarados (torneos de otro provider a
  // los que estoeshockey les trae los marcadores).
  const objetivos: { row: typeof torneos[number]; slug: string }[] =
    torneos.map((row) => ({ row, slug: row.external_id.slice(AHL_ID_PREFIX.length) }));
  for (const c of CAMPEONATOS.filter((x) => x.externalId)) {
    const { data: cruzadoRaw } = await supabase
      .from('tournaments')
      .select('id, name, external_id, is_visible, current_season_id')
      .eq('external_id', c.externalId!)
      .limit(1);
    const cruzado = (cruzadoRaw as typeof torneos | null)?.[0];
    if (cruzado) objetivos.push({ row: cruzado, slug: c.slug });
    else errors.push(`${c.externalId}: torneo cruzado no encontrado`);
  }

  for (const { row: t, slug } of objetivos) {
    const seccionesDelTorneo = secciones.filter((s) => s.slug === slug);
    const resolver = resolverDe(slug);

    const crudos = resultadosPorSlug.get(slug) ?? [];
    const resultados: ResultadoDeCronica[] = [];
    const resultadosNoResueltos: string[] = [];
    for (const r of crudos) {
      const a = resolver(claveDeNombre(r.local));
      const b = resolver(claveDeNombre(r.visitante));
      if (!a || !b) {
        resultadosNoResueltos.push(`${r.local} ${r.golesLocal}:${r.golesVisitante} ${r.visitante}`);
        continue;
      }
      resultados.push({
        clubA: a, clubB: b, golesA: r.golesLocal, golesB: r.golesVisitante,
        texto: `${r.local} ${r.golesLocal}:${r.golesVisitante} ${r.visitante} (fecha ${r.fecha ?? '?'})`,
        ...(r.fecha != null && { fechaNro: r.fecha }),
      });
    }

    if (!seccionesDelTorneo.length && !resultados.length) {
      resumen.push({ torneo: t.external_id, sinNovedades: true, ...(resultadosNoResueltos.length && { resultadosNoResueltos }) });
      continue;
    }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select('id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, is_visible, season_id, round_label')
      .eq('tournament_id', t.id)
      .limit(2000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as (ExistenteHockey & { is_visible: boolean | null; season_id: string | null; round_label: string | null })[];

    // Día de cada fecha: lo dicho por los boletines y por los partidos ya
    // cargados; lo que falte se extrapola por la cadencia semanal — así un
    // resultado de la fecha 1 (cuyo boletín ya no está publicado) igual
    // encuentra un día verosímil para crear su partido.
    const diaPorFecha = new Map<number, string>();
    for (const s of seccionesDelTorneo) {
      if (s.fechaNro == null) continue;
      const previa = diaPorFecha.get(s.fechaNro);
      if (!previa || s.dia < previa) diaPorFecha.set(s.fechaNro, s.dia);
    }
    for (const m of ya) {
      const rl = /^Fecha (\d+)$/.exec(m.round_label ?? '');
      const dia = (m.date_time ?? '').slice(0, 10);
      if (!rl || !dia) continue;
      const n = Number(rl[1]);
      const previa = diaPorFecha.get(n);
      if (!previa || dia < previa) diaPorFecha.set(n, dia);
    }
    const diaDeFecha = (n: number): string | null => {
      const exacto = diaPorFecha.get(n);
      if (exacto) return exacto;
      let cercana: { k: number; dia: string } | null = null;
      for (const [k, dia] of diaPorFecha) {
        if (!cercana || Math.abs(k - n) < Math.abs(cercana.k - n)) cercana = { k, dia };
      }
      if (!cercana) return null;
      const d = new Date(`${cercana.dia}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (n - cercana.k) * 7);
      return d.toISOString().slice(0, 10);
    };

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
      buildExternalId: buildMatchExternalId,
      crearDesdeResultado: { diaDeFecha },
    });

    const fasesTocadas = new Set<string>();
    let creados = 0;
    let actualizados = 0;
    let participantesCreados = 0;

    if (!enSeco) {
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
              status: 'active', settings: { source: 'ahl-sync' },
            }]);
            if (errEntrada) errors.push(`${t.external_id}: inscripto ${clubId} pero sin entrada de temporada (${errEntrada.message})`);
            else await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
          }
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
        if ('score' in cambio.patch && cambio.phase_id) fasesTocadas.add(cambio.phase_id);
      }

      if (fasesTocadas.size) {
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        for (const fase of fasesTocadas) {
          const r = await recalculatePhaseStandingsScopes(t.id, fase, 'general');
          if (!r.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
        }
      }
      escrituras += creados + actualizados + participantesCreados;
    }

    const omitidosUnicos = [...new Map(plan.omitidos.map((o) => [`${o.motivo}|${o.detalle}`, o])).values()];
    resumen.push({
      torneo: t.external_id,
      secciones: seccionesDelTorneo.length,
      resultados: resultados.length,
      crear: enSeco ? plan.crear.length : creados,
      actualizar: enSeco ? plan.actualizar.length : actualizados,
      participantesNuevos: participantesCreados,
      sinCambios: plan.sinCambios,
      omitidos: omitidosUnicos,
      ...(resultadosNoResueltos.length && { resultadosNoResueltos }),
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

  const seccionesHuerfanas = [...slugsConSeccion].filter(
    (s) => !torneos.some((t) => t.external_id === `${AHL_ID_PREFIX}${s}`),
  );

  return NextResponse.json({
    ok: errors.length === 0,
    dry: enSeco,
    boletines: boletinesLeidos,
    torneos: resumen,
    seccionesSinTorneo: seccionesHuerfanas,
    errors,
  });
}
