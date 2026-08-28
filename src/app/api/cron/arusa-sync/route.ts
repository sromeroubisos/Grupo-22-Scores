/**
 * Sync del rugby de Santiago desde arusa.cl (Leverade).
 *
 *   GET /api/cron/arusa-sync                       corrida normal
 *   GET /api/cron/arusa-sync?dry=1                 plan sin escribir
 *   GET /api/cron/arusa-sync?slug=top-10-de-arusa  una sola competencia
 *   GET /api/cron/arusa-sync?todo=1                sin saltear fechas cerradas
 *
 * ARUSA juega sábado Y domingo, de 12 a 20 de Santiago —medido sobre los 996
 * partidos de 2026—, y carga los marcadores durante la tarde y la noche. Por
 * eso el `vercel.json` lo llama cada dos horas los dos días mientras se juega
 * (16-22 UTC) y otra vez de madrugada, cuando ya terminó todo (0-4 UTC del día
 * siguiente), más una repesca diaria a las 15 UTC.
 *
 * ── Las ventanas en hora de Santiago, y el cambio de hora ──────────────────
 * Vercel agenda en UTC y Chile cambia de huso, así que la misma entrada cae en
 * horas distintas según el mes. En 2026 el salto a horario de verano es el
 * DOMINGO 6 DE SEPTIEMBRE (de UTC-4 a UTC-3):
 *
 *   entrada              invierno (UTC-4)          verano (UTC-3)
 *   0 15 * * *           11:00                     12:00
 *   0 16-22/2 * * 6,0    12 · 14 · 16 · 18         13 · 15 · 17 · 19
 *   0 0-4/2 * * 0,1      20 · 22 · 00              21 · 23 · 01
 *
 * Las dos columnas aguantan y por eso no hay nada que compensar. Lo que importa
 * no es la apertura sino la COLA: el último partido del sábado arranca 21:00 y
 * termina cerca de las 22:40, y lo levanta la corrida de las 00:00 en invierno o
 * la de las 23:00 y 01:00 en verano. Del lado de la apertura, un partido de las
 * 12:00 no termina hasta las 13:40 y ARUSA carga más tarde todavía, así que la
 * hora que se pierde en verano no cuesta un resultado.
 *
 * El `dayOfWeek` engaña igual que en URBA: el `0` de la ventana de madrugada es
 * la noche del SÁBADO, no la del domingo — la del domingo es el `1`. Corrido a
 * hora de Santiago, sábado y domingo quedan cubiertos igual, de las 11 de la
 * mañana a la medianoche.
 *
 * Qué toca: NO borra ni duplica. `planArusaMatches` empareja cada partido de
 * la fuente con el que ya está y solo corrige lo que ARUSA sabe mejor — hora,
 * cancha, marcador, puntos de tabla y si el partido quedó POSTERGADO. Cuando
 * algún parche mueve un resultado, se rehace la tabla de posiciones de esa
 * fase; si no, no se toca nada más.
 *
 * Ojo con el postergado y el salteo de fechas de más abajo: mientras el partido
 * no sea `final` su fecha nunca se da por cerrada, así que se la sigue pidiendo
 * hasta que ARUSA la reprograme o la juegue. Es a propósito — es justo la fecha
 * que todavía puede moverse.
 *
 * El mapa de abajo está a mano y no en la base a propósito: ARUSA publica 13
 * competencias por temporada y casi todas con más de una rama, así que qué
 * entra a G22 es una decisión, no un descubrimiento. Cada rama declarada va a
 * la fase del torneo que se llama igual.
 *
 * Qué club es cada equipo lo dice `club_external_ids` (`provider = 'arusa'`,
 * `external_id` = id de equipo de Leverade), NO el nombre: "PWCC" es el primer
 * equipo en Primera y el B en Cuarta.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCabecera, fetchPartidosDeGrupo } from '@/lib/integrations/arusa/client.ts';
import {
  construirResolver,
  normalizarNombre,
  planArusaMatches,
  rotarCompetencias,
  type PartidoExistente,
} from '@/lib/integrations/arusa/sync.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Cada rama son ~18 llamadas a Leverade con su pausa de cortesía. Las cuatro
// divisiones de mayores medían 31s; con las Intermedias y los juveniles la
// corrida crece, así que el techo va holgado.
export const maxDuration = 300;

/** Competencia de ARUSA → torneo de G22, y qué ramas de esa competencia entran. */
const TORNEOS: { lev: string; slug: string; ramas: string[] }[] = [
  // Mayores. En Cuarta la rama de fase regular NO se llama "Titulares": el
  // nombre lo pone cada competencia a mano y acá quedó "Fase Regular".
  { lev: '1328550', slug: 'top-10-de-arusa', ramas: ['Titulares'] },
  { lev: '1328552', slug: 'segunda-division-de-arusa', ramas: ['Titulares'] },
  { lev: '1328553', slug: 'tercera-division-de-arusa', ramas: ['Titulares'] },
  { lev: '1328554', slug: 'cuarta-division-de-arusa', ramas: ['Fase Regular'] },

  // Intermedias: la segunda rama de la MISMA competencia de mayores, con los
  // mismos clubes y otro plantel. Van a torneos aparte porque tienen su tabla.
  { lev: '1328550', slug: 'intermedia-de-primera-de-arusa', ramas: ['Intermedia'] },
  { lev: '1328552', slug: 'intermedia-de-segunda-de-arusa', ramas: ['Intermedia'] },
  { lev: '1328553', slug: 'intermedia-de-tercera-de-arusa', ramas: ['Intermedia'] },

  { lev: '1329068', slug: 'femenino-xv-de-arusa', ramas: ['Fase Regular'] },

  // Juveniles. Los de Segunda no son una liga sola: después de la fase regular
  // el plantel se parte en zonas, y cada zona es su propia fase.
  { lev: '1332975', slug: 'm18-primera-de-arusa', ramas: ['Torneo M18'] },
  { lev: '1332976', slug: 'm16-primera-de-arusa', ramas: ['Torneo M16'] },
  { lev: '1332977', slug: 'm14-primera-de-arusa', ramas: ['Torneo M14'] },
  { lev: '1332978', slug: 'm13-primera-de-arusa', ramas: ['Torneo M13'] },
  { lev: '1332982', slug: 'm18-segunda-de-arusa', ramas: ['Clausura M18', 'Zona 1', 'Zona 2'] },
  { lev: '1332984', slug: 'm16-segunda-de-arusa', ramas: ['Torneo M16', 'Zona 1', 'Zona 2'] },
  { lev: '1332985', slug: 'm14-segunda-de-arusa', ramas: ['Torneo M14', '2da Rueda M14'] },
];

const CAMPOS = 'id,date_time,venue,status,score,home_club_id,away_club_id,home_base_points,'
  + 'home_bonus_points,away_base_points,away_bonus_points,points_autocalculated,points_override_reason,'
  + 'round_label,external_id,phase_id,season_id';


const clave = (s: string) => normalizarNombre(s).replace(/ /g, '');

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'arusa-sync'))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const soloSlug = url.searchParams.get('slug');
  // Sin `todo=1` se saltean las fechas ya cerradas (ver más abajo).
  const completo = url.searchParams.get('todo') === '1';
  const DIAS_DE_GRACIA = 21;
  const corte = Date.now() - DIAS_DE_GRACIA * 24 * 60 * 60 * 1000;
  // El arranque rota entre corridas: con orden fijo, una falla a mitad de
  // camino dejaba siempre las mismas competencias del final sin sincronizar.
  const objetivos = rotarCompetencias(soloSlug ? TORNEOS.filter((t) => t.slug === soloSlug) : TORNEOS, Date.now());
  if (!objetivos.length) {
    return NextResponse.json({ ok: false, error: `No hay ninguna competencia declarada con slug=${soloSlug}` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const errors: string[] = [];
  const resumen: unknown[] = [];
  let escrituras = 0;

  // El mapa equipo→club es global: una sola lectura para toda la corrida.
  const { data: equivRaw, error: errEquiv } = await supabase
    .from('club_external_ids').select('external_id, club_id').eq('provider', 'arusa').limit(2000);
  if (errEquiv) return NextResponse.json({ error: `No se pudo leer club_external_ids (${errEquiv.message})` }, { status: 500 });
  const equivalencias = (equivRaw ?? []) as { external_id: string; club_id: string }[];

  for (const objetivo of objetivos) {
    const { data: torneosRaw, error: errTorneo } = await supabase
      .from('tournaments').select('id, name, slug, current_season_id').eq('slug', objetivo.slug).limit(1);
    if (errTorneo) { errors.push(`${objetivo.slug}: no se pudo leer el torneo (${errTorneo.message})`); continue; }
    const torneo = (torneosRaw as { id: string; name: string; slug: string; current_season_id: string | null }[] | null)?.[0];
    if (!torneo) { errors.push(`${objetivo.slug}: el torneo no existe en la base`); continue; }

    let cabecera;
    try {
      cabecera = await fetchCabecera(objetivo.lev);
    } catch (e) {
      errors.push(`${objetivo.slug}: arusa.cl no contestó (${e instanceof Error ? e.message : e})`);
      continue;
    }

    const { data: partsRaw, error: errParts } = await supabase
      .from('tournament_participants').select('club_id, clubs(name, short_name)')
      .eq('tournament_id', torneo.id).limit(500);
    if (errParts) { errors.push(`${objetivo.slug}: no se pudieron leer los participantes (${errParts.message})`); continue; }
    const paraResolver = ((partsRaw ?? []) as { club_id: string; clubs: { name: string; short_name: string | null } | null }[])
      .map((p) => ({ club_id: p.club_id, nombre: p.clubs?.name, corto: p.clubs?.short_name }));

    const { data: fasesRaw, error: errFases } = await supabase
      .from('tournament_phases').select('id, name, season_id')
      .eq('tournament_id', torneo.id).order('order_index', { ascending: true });
    if (errFases) { errors.push(`${objetivo.slug}: no se pudieron leer las fases (${errFases.message})`); continue; }
    const fases = (fasesRaw ?? []) as { id: string; name: string; season_id: string | null }[];

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches').select(CAMPOS).eq('tournament_id', torneo.id).limit(2000);
    if (errYa) { errors.push(`${objetivo.slug}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as unknown as (PartidoExistente & { phase_id: string | null })[];

    const porRama: unknown[] = [];
    const fasesTocadas = new Map<string, string | null>();
    let actualizados = 0;
    let creados = 0;

    for (const nombreRama of objetivo.ramas) {
      const rama = cabecera.grupos.find((g) => clave(g.nombre) === clave(nombreRama));
      if (!rama) {
        errors.push(`${objetivo.slug}: la competencia ${objetivo.lev} no tiene la rama "${nombreRama}" ` +
          `(hay: ${cabecera.grupos.map((g) => g.nombre).join(', ')})`);
        continue;
      }
      // La fase se empareja por nombre; los torneos cargados antes de que
      // hubiera varias ramas tienen una sola fase, "Regular Season".
      const fase = fases.find((f) => clave(f.name) === clave(rama.nombre))
        ?? (fases.length === 1 && objetivo.ramas.length === 1 ? fases[0] : undefined);
      if (!fase) {
        errors.push(`${objetivo.slug}: la rama "${rama.nombre}" no tiene fase equivalente ` +
          `(fases: ${fases.map((f) => f.name).join(', ')})`);
        continue;
      }

      // Una fecha CERRADA no se vuelve a pedir: todos sus partidos están
      // finales y se jugaron hace más de tres semanas. Cada fecha es un
      // request y un torneo tiene 18; corriendo cada dos horas los sábados,
      // releer las de abril no aporta nada. El margen es generoso a propósito:
      // si ARUSA corrige un marcador viejo, la corrida siguiente lo agarra
      // igual mientras esté dentro de la ventana. Con `?todo=1` se piden todas.
      const cerradas = new Set<string>();
      if (!completo) {
        const porFecha = new Map<string, { todosFinales: boolean; ultima: number }>();
        for (const m of ya.filter((x) => x.phase_id === fase.id)) {
          const rotulo = m.round_label;
          if (!rotulo) continue;
          const previa = porFecha.get(rotulo) ?? { todosFinales: true, ultima: 0 };
          previa.todosFinales &&= m.status === 'final';
          previa.ultima = Math.max(previa.ultima, m.date_time ? new Date(m.date_time).getTime() : 0);
          porFecha.set(rotulo, previa);
        }
        for (const [rotulo, d] of porFecha) {
          if (d.todosFinales && d.ultima && d.ultima < corte) cerradas.add(rotulo);
        }
      }

      let partidos;
      try {
        partidos = await fetchPartidosDeGrupo(rama.id, cabecera.equipos, {
          saltear: (nombreFecha) => cerradas.has(nombreFecha),
        });
      } catch (e) {
        errors.push(`${objetivo.slug} / ${rama.nombre}: no se pudieron leer los partidos (${e instanceof Error ? e.message : e})`);
        continue;
      }

      const plan = planArusaMatches({
        partidos,
        existentes: ya.filter((m) => m.phase_id === fase.id),
        resolverClub: construirResolver({ equivalencias, participantes: paraResolver, ramaId: rama.id }),
        plantillaDeAlta: {
          tournament_id: torneo.id,
          phase_id: fase.id,
          season_id: fase.season_id ?? torneo.current_season_id ?? null,
          sport_id: 'rugby',
          sport: 'rugby',
          is_visible: true,
          review_status: 'approved',
        },
        nuevoId: () => globalThis.crypto.randomUUID(),
      });

      if (!enSeco) {
        for (const cambio of plan.actualizar) {
          const { error } = await supabase.from('matches').update(cambio.patch).eq('id', cambio.id);
          if (error) { errors.push(`${objetivo.slug} ${cambio.rotulo}: update falló (${error.message})`); continue; }
          actualizados += 1;
          if (cambio.tocaResultado) fasesTocadas.set(fase.id, fase.season_id);
        }
        for (const alta of plan.crear) {
          const { error } = await supabase.from('matches').insert([alta]);
          if (error) { errors.push(`${objetivo.slug}: alta falló (${error.message})`); continue; }
          creados += 1;
          fasesTocadas.set(fase.id, fase.season_id);
        }
      }

      porRama.push({
        rama: rama.nombre,
        fase: fase.name,
        enLaFuente: partidos.filter((p) => !p.libre && !p.anulado).length,
        jugados: partidos.filter((p) => p.jugado).length,
        actualizar: plan.actualizar.length,
        crear: plan.crear.length,
        sinCambios: plan.sinCambios,
        ...(cerradas.size && { fechasSalteadas: cerradas.size }),
        ...(plan.localiaCorregida && { localiaCorregida: plan.localiaCorregida }),
        ...(plan.clubesSinMapa.length && { equiposSinClub: plan.clubesSinMapa }),
        ...(plan.huerfanos.length && { sinParEnArusa: plan.huerfanos.length }),
        ...(enSeco && { detalle: plan.actualizar.map((c) => `${c.rotulo} · ${c.cambios.join(', ')}`) }),
      });
    }

    if (fasesTocadas.size) {
      const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
      for (const [faseId, seasonId] of fasesTocadas) {
        const r = await recalculatePhaseStandingsScopes(torneo.id, faseId, 'general', seasonId ?? torneo.current_season_id ?? null);
        if (!r.ok) errors.push(`${objetivo.slug}: el recálculo de la fase ${faseId} falló`);
      }
    }
    escrituras += actualizados + creados;

    resumen.push({
      torneo: torneo.slug,
      competencia: cabecera.nombre,
      ...(enSeco ? {} : { actualizados, creados }),
      tablasRehechas: fasesTocadas.size,
      ramas: porRama,
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

  // La respuesta del cron no la lee nadie: si un error no queda en el log de
  // la función, la competencia que falló se queda atrasada en silencio.
  if (errors.length) {
    console.error(`[arusa-sync] ${errors.length} error(es) en la corrida (escrituras: ${escrituras}):\n  ${errors.join('\n  ')}`);
  }

  return NextResponse.json({ ok: errors.length === 0, dry: enSeco, completo, torneos: resumen, errors });
}
