/**
 * /api/cron/urba-sync
 *
 * Mantiene al día los partidos importados de URBA. La carga inicial fue única y
 * masiva; esto es el goteo.
 *
 *   ?scope=jornada   torneos que juegan hoy o ayer (hora de Buenos Aires)
 *   ?scope=barrido   los de la temporada, en tercios: el barrido completo son
 *                    ~116 s y no entra en los 60 s de `maxDuration`
 *   &anio=2024       trae un año viejo A MANO. Ver abajo.
 *   &dry=1           reporta sin escribir una sola fila
 *
 * Autenticación: header Bearer {CRON_SECRET}.
 *
 * ── El alcance es la temporada EN CURSO, y sólo ésa ────────────────────────
 * En la base hay 811 torneos de URBA, pero 677 son de 2021-2025 y están
 * TERMINADOS: sus resultados no van a cambiar nunca más. Barrerlos cada 20
 * minutos son 677 pedidos para confirmar que nada se movió.
 *
 * Así que la rotación automática filtra por `season_id = temporadaEnCurso()`, que
 * hoy son 134 torneos — el número para el que están calibrados `POR_TANDA` y el
 * presupuesto de tiempo. Y `temporadaEnCurso()` sale del RELOJ, no de una
 * constante: acá había un `const ANIO = 2026` que el 1 de enero de 2027 habría
 * dejado de ver la temporada nueva sin que nada fallara.
 *
 * El histórico se alcanza con `?anio=2024`, explícito, para cuando URBA corrija
 * algo viejo. Nunca entra por rotación.
 *
 * Ojo con una cosa: el histórico entró OCULTO, así que la guarda de visibilidad
 * de abajo se lo saltea entero y `?anio=2024` solo devuelve 0 sin tocar nada.
 * La combinación real es `?anio=2024&ocultos=1`. No se hizo implícito a
 * propósito: el trigger de notificaciones no mira `is_visible`, así que ampliar
 * el alcance sin decirlo puede mandarle un aviso a quien tenga ese club en
 * favoritos. La respuesta lo avisa cuando pasa.
 *
 * ── Por qué estas ventanas ─────────────────────────────────────────────────
 * Medido sobre los 10.917 partidos cargados: en la URBA se juega SÓLO sábado y
 * domingo (2.935 partidos en domingo, 1.782 en sábado, cero de lunes a viernes).
 * URBA no publica marcador en vivo — `fulfilled` pasa a true recién cuando cargan
 * el resultado— así que durante el partido no hay nada que traer. La mediana de
 * publicación son 19,4 h desde la medianoche local del día del partido, o sea
 * 1 a 5 h después del final. El 76,1% queda firme dentro de las 24 h; el resto
 * se corrige más tarde, con p90 a las 399 h (16 días). De ahí salen las dos
 * ventanas de jornada y el barrido diario: la ventana levanta el 76%, el barrido
 * la cola de correcciones.
 *
 * ── Qué dispara, y qué no hace falta disparar ──────────────────────────────
 * De los tres sistemas que cuelgan de un partido, sólo UNO necesita que lo
 * llamen:
 *
 *  · notificaciones — las crea el trigger `trg_g22_notify_match_finished`, que es
 *    `AFTER UPDATE OF status`. Con un UPDATE alcanza, venga de donde venga. (Por
 *    eso la carga inicial, que fue INSERT, no generó ninguna.)
 *  · prode — el cron `/api/cron/prode-scoring` sondea `matches` cada 5 minutos.
 *  · ranking — NO se entera solo. Hay que llamarlo, y con el snapshot PREVIO:
 *    `syncClubRankingsForMatchUpdate(id)` sin él calcula `hasKnownMatchChange =
 *    false` y, si el partido ya tenía aplicación, no hace nada y sigue de largo.
 *    Una corrección de resultado quedaría ignorada en silencio — y el 24% de los
 *    partidos se corrige después de las 24 h.
 *
 * No se usa `FixtureService.updateMatch`: hace ~15 sondeos de columnas por
 * llamada, y un domingo de 289 partidos son ~4.300 round-trips de más.
 */
import { NextRequest, NextResponse } from 'next/server';

import { fetchChampionship, fetchChampionshipList } from '@/lib/integrations/urba/client';
import { categoriaDeTorneoUrba, parseUrbaId, subcategoriaDeTorneoUrba } from '@/lib/integrations/urba/externalId';
import { planTournamentMatches, type ExistenteEnBase } from '@/lib/integrations/urba/planMatches';
import { construirPatch, rotarPorReloj } from '@/lib/integrations/urba/syncPlan';
import { parsearAnioPedido, PRIMER_ANIO_URBA, temporadaEnCurso } from '@/lib/integrations/urba/temporada';
import { getMatchRankingSnapshot, syncClubRankingsForMatchUpdate } from '@/lib/server/clubRankings';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Corte por tiempo, no por cantidad: un pedido a URBA promedia 617 ms y hay
 *  torneos de 437 KB. Con 45 s queda margen para el cierre dentro de los 60. */
const PRESUPUESTO_MS = 45_000;
const POR_TANDA = 50;

function autorizado(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[urba-sync] CRON_SECRET sin definir — se permite en desarrollo');
            return true;
        }
        return false;
    }
    return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * El `schedule` con el que está declarado el barrido en `vercel.json`.
 *
 * Se compara literal contra el header `x-vercel-cron-schedule`, así que si se
 * cambia allá hay que cambiarlo acá. Es feo tener el dato en dos lados; la
 * alternativa era peor, y está explicada en `resolverScope`.
 */
const SCHEDULE_BARRIDO = '0 9 * * *';

/**
 * De dónde sale el `scope`, y por qué no alcanza con el query string.
 *
 * Las entradas de `vercel.json` lo pasan por URL
 * (`/api/cron/urba-sync?scope=barrido`), pero **Vercel no documenta el query
 * string en el `path` de un cron**: la referencia sólo dice que el path arranca
 * con `/` y muestra ejemplos con segmentos, no con `?`. Puede que funcione; no
 * está prometido.
 *
 * Y el modo de falla, si algún día deja de pasarlo, es de los que no avisan:
 * `scope` ausente cae en 'jornada', que es el valor por defecto, así que **el
 * barrido diario se convertiría en una jornada más** y seguiría respondiendo
 * `ok: true`. El cron en verde y la cola de correcciones sin levantar — el 24%
 * de los partidos de URBA se corrige después de las 24 h, y ésa es justo la
 * parte que el barrido existe para traer.
 *
 * Así que cuando el query string no viene, el scope sale del header
 * `x-vercel-cron-schedule`, que Vercel SÍ documenta y que existe precisamente
 * para distinguir invocaciones que comparten path. El query string sigue
 * mandando cuando está: es lo que permite dispararlo a mano con curl.
 */
function resolverScope(url: URL, request: NextRequest): {
    scope: 'jornada' | 'barrido';
    scopeDesde: 'query' | 'schedule' | 'default';
} {
    const pedido = url.searchParams.get('scope');
    if (pedido) {
        return { scope: pedido === 'barrido' ? 'barrido' : 'jornada', scopeDesde: 'query' };
    }

    const schedule = request.headers.get('x-vercel-cron-schedule');
    if (schedule) {
        return { scope: schedule === SCHEDULE_BARRIDO ? 'barrido' : 'jornada', scopeDesde: 'schedule' };
    }

    return { scope: 'jornada', scopeDesde: 'default' };
}

const diaBA = (iso: string | Date) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));

export async function GET(request: NextRequest) {
    if (!autorizado(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const arrancoEn = Date.now();
    const url = new URL(request.url);
    const { scope, scopeDesde } = resolverScope(url, request);
    const enSeco = url.searchParams.get('dry') === '1';
    const incluirOcultos = url.searchParams.get('ocultos') === '1';

    // El año pedido. Un `?anio` inválido es 400 y no una corrida vacía: devolver
    // 0 torneos escondería el error de tipeo detrás de un 200 en verde.
    const pedido = parsearAnioPedido(url.searchParams.get('anio'));
    if (!pedido) {
        return NextResponse.json({
            error: `anio inválido: se espera un año entre ${PRIMER_ANIO_URBA} y ${temporadaEnCurso()}`,
        }, { status: 400 });
    }
    const { anio: ANIO, esHistorico } = pedido;

    const supabase = createAdminClient() as any;

    // Contabilidad honesta: cada contador cuenta filas REALES, no intenciones.
    // El incidente de fixture-sync fue exactamente eso — el contador sumaba y la
    // escritura no existía, y el endpoint respondía ok con 340 sincronizados.
    let written = 0;          // partidos creados
    let updated = 0;          // partidos actualizados
    let skipped = 0;          // sin cambios, o fuera de la lista blanca
    const errors: string[] = [];
    let torneosLeidos = 0;
    let finalizados = 0;      // los que pasan a 'final' en esta pasada
    let rankingSincronizado = 0;
    // El torneo nuevo NO se crea: se reporta. Pero se reporta con la categoría y
    // la subcategory ya derivadas, para que quien lo dé de alta no las invente:
    // una `subcategory` en null lo deja fuera de la navegación por grados sin
    // que nadie se entere, y una categoría distinta rompe el triple de sus clubes.
    const torneosNuevos: Array<{
        urba_id: number; nombre: string;
        categoria: string | null; subcategory: string | null;
    }> = [];
    const detalle: Array<Record<string, unknown>> = [];

    try {
        // ── a qué torneos les toca ──────────────────────────────────────────
        const { data: torneosRaw, error: errTorneos } = await supabase
            .from('tournaments')
            // `subcategory` viaja hasta el plan: de ella sale el horario por defecto
            // cuando URBA no informa hora (`HORARIO_POR_SUBCATEGORIA`).
            .select('id, name, external_id, is_visible, status, subcategory')
            .like('external_id', 'urba:%')
            // El corte por temporada va en la CONSULTA y no en un filtro de abajo:
            // así los 677 del histórico no viajan ni se cuentan en ningún contador.
            .eq('season_id', String(ANIO));
        if (errTorneos) throw new Error(`no se pudieron leer los torneos: ${errTorneos.message}`);

        const torneosCrudo = (torneosRaw ?? []) as Array<{ id: string; name: string; external_id: string; is_visible: boolean; status: string | null; subcategory: string | null }>;

        // ── un torneo ARCHIVADO no se sincroniza, ni con `ocultos=1` ──────────
        // Son los torneos-fase que se fusionaron: sus partidos ya no le
        // pertenecen —viven en el torneo de la temporada, bajo una fase de
        // playoff— pero la fila se conserva para que su `external_id` siga
        // tomado y nadie lo vuelva a dar de alta.
        //
        // Si el cron los tomara, buscaria sus partidos por `tournament_id`, no
        // encontraria ninguno —se mudaron— y los insertaria de nuevo: la
        // fusion deshecha en silencio, y por duplicado. `ocultos=1` es para
        // "oculto pero real", no para "retirado", asi que esta guarda no la
        // levanta ningun parametro.
        const archivados = torneosCrudo.filter((t) => t.status === 'archived');
        const torneos = torneosCrudo.filter((t) => t.status !== 'archived');
        // Guarda de visibilidad. El trigger de notificaciones NO mira `is_visible`
        // —ni del partido ni del torneo—, así que pasar a 'final' un partido de un
        // torneo sin publicar le manda el aviso a quien tenga ese club en favoritos.
        // Medido: 18 usuarios hoy. Mientras los 126 torneos sigan ocultos, el cron
        // no los toca. Cuando Santi los publique, entran solos.
        const enAlcance = incluirOcultos ? torneos : torneos.filter((t) => t.is_visible);
        const ocultosSalteados = torneos.length - enAlcance.length;

        // La categoría del triple sale del NOMBRE DEL TORNEO, no de
        // `stg_urba_torneos`. Esa tabla es staging de trabajo y sólo tiene los 134
        // de 2026: leyéndola, un `?anio=2024` fallaba en los 127 torneos con
        // "sin categoría" y no traía nada. Verificado sobre los 811 de la base:
        // `categoriaDeTorneoUrba(name)` los resuelve todos, y coincide con lo que
        // daba staging en los 134 — cero diferencias.
        const categoriaPorId = new Map<number, string>();
        for (const t of torneos) {
            const id = parseUrbaId(t.external_id);
            const cat = categoriaDeTorneoUrba(t.name);
            if (id != null && cat) categoriaPorId.set(id, cat);
        }

        // El mapeo de clubes, una sola vez. Son 1.539 triples y no cambian dentro
        // de una corrida; pedirlo por torneo serían 50 lecturas idénticas.
        const mapeo = new Map<string, string>();
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await supabase
                .from('club_external_ids')
                .select('external_id, club_id')
                .eq('provider', 'urba')
                .range(desde, desde + 999);
            if (error) throw new Error(`no se pudo leer club_external_ids: ${error.message}`);
            const filas = (data ?? []) as Array<{ external_id: string; club_id: string }>;
            for (const f of filas) mapeo.set(f.external_id, f.club_id);
            if (filas.length < 1000) break;
        }

        let candidatos = enAlcance;
        if (scope === 'jornada') {
            const hoy = diaBA(new Date());
            const ayer = diaBA(new Date(Date.now() - 86_400_000));
            const { data: conPartido } = await supabase
                .from('matches')
                .select('tournament_id, date_time')
                .like('external_id', 'urba:%')
                .gte('date_time', `${ayer}T00:00:00.000Z`)
                .lt('date_time', `${hoy}T23:59:59.999Z`);
            const juegan = new Set(
                ((conPartido ?? []) as Array<{ tournament_id: string; date_time: string }>)
                    .filter((m) => [hoy, ayer].includes(diaBA(m.date_time)))
                    .map((m) => m.tournament_id),
            );
            candidatos = enAlcance.filter((t) => juegan.has(t.id));
        } else {
            // Barrido en tercios: 134 torneos son ~116 s y el techo son 60.
            const tercio = Math.floor(Date.now() / 3_600_000) % 3;
            candidatos = enAlcance.filter((t) => (parseUrbaId(t.external_id) ?? 0) % 3 === tercio);
        }
        const tanda = rotarPorReloj(candidatos, POR_TANDA, Date.now());

        // ── torneos nuevos: se avisan, NO se crean ──────────────────────────
        const lista = await fetchChampionshipList(ANIO);
        if (lista.ok && lista.data) {
            const conocidos = new Set(torneos.map((t) => parseUrbaId(t.external_id)));
            for (const c of lista.data) {
                if (conocidos.has(Number(c.id))) continue;
                const nombre = String(c.name ?? '');
                torneosNuevos.push({
                    urba_id: Number(c.id),
                    nombre,
                    categoria: categoriaDeTorneoUrba(nombre),
                    subcategory: subcategoriaDeTorneoUrba(nombre),
                });
            }
        } else {
            errors.push(`no se pudo leer la lista de torneos de ${ANIO} (HTTP ${lista.status})`);
        }

        // ── el goteo ────────────────────────────────────────────────────────
        for (const t of tanda) {
            if (Date.now() - arrancoEn > PRESUPUESTO_MS) break;

            const urbaId = parseUrbaId(t.external_id);
            const categoria = urbaId == null ? undefined : categoriaPorId.get(urbaId);
            if (urbaId == null || !categoria) { errors.push(`${t.external_id}: no se pudo derivar la categoría de "${t.name}"`); continue; }

            // Sin caché de disco: acá el objetivo es justamente ver lo que cambió.
            const r = await fetchChampionship(urbaId);
            if (!r.ok || !r.data) { errors.push(`${t.external_id}: HTTP ${r.status}`); continue; }
            torneosLeidos++;

            const { data: yaRaw, error: errYa } = await supabase
                .from('matches')
                .select('id, external_id, date_time, venue, status, score, round_label, phase_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated')
                .eq('tournament_id', t.id)
                .like('external_id', 'urba:%');
            if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }

            const ya = (yaRaw ?? []) as Array<ExistenteEnBase & { id: string; external_id: string; phase_id: string | null; is_visible: boolean | null }>;
            const existentes = new Map<string, ExistenteEnBase>(ya.map((m) => [m.external_id, m]));
            const porExternal = new Map(ya.map((m) => [m.external_id, m]));
            // Un partido nuevo hereda la fase de sus hermanos: sin `phase_id` no
            // entra en la tabla de posiciones de los 8 torneos que tienen fases.
            const faseDelTorneo = ya.find((m) => m.phase_id)?.phase_id ?? null;
            // Y hereda la visibilidad, en vez de traer un default propio. La
            // publicación la decide una persona, torneo por torneo; el conector
            // sólo copia lo que ya rige para los hermanos. Un `false` fijo acá
            // dejaría el partido reprogramado invisible en un torneo publicado,
            // sin error y sin aviso.
            const visibleEnEsteTorneo = ya.some((m) => m.is_visible === true);

            const { data: partsRaw } = await supabase
                .from('tournament_participants').select('club_id').eq('tournament_id', t.id);
            const plan = planTournamentMatches({
                championship: r.data as any,
                tournamentId: t.id,
                categoria,
                subcategory: t.subcategory,
                resolverClub: (triple: string) => mapeo.get(triple) ?? null,
                existentes,
                participantesYaEnBase: new Set(((partsRaw ?? []) as Array<{ club_id: string }>).map((p) => p.club_id)),
            });

            // altas
            for (const fila of plan.crear) {
                if (enSeco) { written++; detalle.push({ torneo: t.external_id, accion: 'crear', external_id: fila.external_id }); continue; }
                const { error } = await supabase.from('matches').insert([{
                    ...fila, sport_id: 'rugby', is_visible: visibleEnEsteTorneo, phase_id: faseDelTorneo,
                }]);
                if (error) { errors.push(`${fila.external_id}: alta falló (${error.message})`); continue; }
                written++;
            }

            // actualizaciones
            for (const cambio of plan.actualizar) {
                const actual = porExternal.get(cambio.fila.external_id);
                const patch = construirPatch(cambio, actual?.status);
                if (!patch) { skipped++; continue; }
                if (enSeco) {
                    updated++;
                    if (patch.seFinaliza) finalizados++;
                    detalle.push({ torneo: t.external_id, external_id: patch.external_id, cambios: patch.cambios, seFinaliza: patch.seFinaliza });
                    continue;
                }

                // El snapshot PREVIO, antes de escribir. Es lo que le permite al
                // ranking distinguir "cambió" de "no lo sé", y sin él una corrección
                // sobre un partido ya aplicado se ignora sin ruido.
                const previo = actual?.id ? await getMatchRankingSnapshot(actual.id) : null;

                const { error } = await supabase.from('matches')
                    .update(patch.patch).eq('external_id', patch.external_id);
                if (error) { errors.push(`${patch.external_id}: update falló (${error.message})`); continue; }
                updated++;
                if (patch.seFinaliza) finalizados++;

                if (actual?.id) {
                    try {
                        await syncClubRankingsForMatchUpdate(actual.id, previo);
                        rankingSincronizado++;
                    } catch (e) {
                        errors.push(`${patch.external_id}: el ranking no se pudo sincronizar (${e instanceof Error ? e.message : String(e)})`);
                    }
                }
            }
            skipped += plan.sinCambios;
        }

        if (!enSeco && (written > 0 || updated > 0)) {
            try { await invalidateMatchesFeedCaches(supabase); }
            catch (e) { errors.push(`no se pudo invalidar la caché del feed (${e instanceof Error ? e.message : String(e)})`); }
        }

        const elapsed = Date.now() - arrancoEn;
        console.log(`[urba-sync] anio=${ANIO}${esHistorico ? ' (HISTÓRICO, a pedido)' : ''} scope=${scope}(${scopeDesde})${enSeco ? ' (en seco)' : ''} torneos=${torneosLeidos}/${tanda.length} written=${written} updated=${updated} skipped=${skipped} errors=${errors.length} en ${elapsed}ms`);

        // El trabajo no se pudo hacer: 500. Un contador en verde con la escritura
        // caída es peor que un cron en rojo — de eso salió la regla.
        const noSePudo = torneosLeidos === 0 && tanda.length > 0;
        return NextResponse.json({
            ok: !noSePudo && errors.length === 0,
            // `scopeDesde` dice de dónde salió el scope. Si un día dice "schedule",
            // Vercel dejó de pasar el query string y el header lo salvó.
            scope, scopeDesde, dry: enSeco,
            // Que la respuesta diga QUÉ temporada se sincronizó, siempre. Sin esto,
            // una corrida sobre el año equivocado se ve idéntica a una correcta.
            anio: ANIO,
            esHistorico,
            torneosDeLaTemporada: torneos.length,
            // Que se vea cuantos quedaron afuera por estar fusionados, en vez
            // de que el total baje sin explicacion.
            ...(archivados.length ? { torneosArchivados: archivados.length } : {}),
            // El histórico entró oculto, así que la guarda de visibilidad se lo
            // come entero y la corrida devuelve 0 sin que falle nada. Antes de
            // que alguien mire un `ok: true` con `updated: 0` y crea que URBA no
            // cambió nada, que lo diga la respuesta.
            ...(candidatos.length === 0 && ocultosSalteados > 0 ? {
                nota: `los ${ocultosSalteados} torneos de ${ANIO} están ocultos y la guarda de visibilidad los saltea. `
                    + 'Para sincronizarlos igual, agregá &ocultos=1.',
            } : {}),
            written, updated, skipped, errors,
            torneosEnAlcance: candidatos.length,
            torneosLeidos,
            torneosOcultosSalteados: ocultosSalteados,
            finalizados,
            rankingSincronizado,
            torneosNuevos,
            elapsed,
            ...(enSeco ? { detalle: detalle.slice(0, 200) } : {}),
        }, { status: noSePudo ? 500 : 200 });
    } catch (error) {
        console.error('[urba-sync] falló:', error);
        return NextResponse.json({
            ok: false, scope, scopeDesde, dry: enSeco,
            written, updated, skipped,
            errors: [...errors, error instanceof Error ? error.message : String(error)],
            elapsed: Date.now() - arrancoEn,
        }, { status: 500 });
    }
}
