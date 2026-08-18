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
 * La ventana del fin de semana abre a las 18 UTC —15:00 en Buenos Aires— y no a
 * las 21, y esa hora se pagó con una fecha entera. Estaba calibrada sobre la
 * MEDIANA, que es 19,5 h y cae cómoda adentro; el problema es que la mediana
 * esconde la cola de la izquierda. Medido sobre los 6.424 resultados de 2026: de
 * los 4.747 que URBA carga el MISMO día del partido, el 26% entra antes de las
 * 18:00 BA, y sólo la hora de las 16:00 son 966 partidos (20,3%). O sea que uno
 * de cada cuatro resultados ya estaba publicado en urba.org.ar cuando este cron
 * todavía no había abierto los ojos, y ahí se quedaba hasta la noche.
 *
 * El caso testigo es la Fecha 18 del Top 14: URBA la cargó a las 17:24 del
 * sábado 15/8, treinta y seis minutos antes de la primera corrida del día. La
 * carga más temprana que se midió en toda la temporada es a las 15:00 BA, así
 * que la ventana abre ahí y no antes — correrla más temprano son pedidos a una
 * API que todavía no tiene nada para dar.
 *
 * ── Qué dispara, y qué no hace falta disparar ──────────────────────────────
 * De los cuatro sistemas que cuelgan de un partido, sólo UNO necesita que lo
 * llamen desde acá:
 *
 *  · notificaciones — las crea el trigger `trg_g22_notify_match_finished`, que es
 *    `AFTER UPDATE OF status`. Con un UPDATE alcanza, venga de donde venga. (Por
 *    eso la carga inicial, que fue INSERT, no generó ninguna.)
 *  · prode — el cron `/api/cron/prode-scoring` sondea `matches` cada 5 minutos.
 *  · ranking — lo rehace entero el cron de los martes a las 00:00
 *    (`/api/cron/weekly-club-ranking`), leyendo los partidos terminados de la
 *    temporada. Acá se sincronizaba partido por partido: un domingo de 289
 *    partidos eran 289 sincronizaciones, cada una con su lectura previa. Y como
 *    la cuenta semanal se rehace desde cero, la cola de correcciones —el 24% de
 *    los partidos se corrige después de las 24 h— entra sola.
 *  · TABLA DE POSICIONES — no se entera sola y hay que llamarla. `matches` es la
 *    fuente, pero `tournament_standings` es una tabla MATERIALIZADA: la escribe
 *    `recalculatePhaseStandingsScopes` y nada más. Las rutas que editan un
 *    partido a mano la llaman por `recalcAffectedPhases`; este cron escribía
 *    directo contra `matches` y no llamaba a nadie, así que el resultado entraba
 *    y la tabla publicada se quedaba en la última corrida manual.
 *
 *    Se recalcula por torneo y ADENTRO del mismo presupuesto que la lectura, no
 *    al final de la corrida: el corte por tiempo se toma antes de empezar un
 *    torneo nuevo, nunca entre escribir sus partidos y recalcular su tabla. Así
 *    no existe el estado "resultado escrito, tabla sin rehacer" — lo que no
 *    entró en esta pasada sigue pendiente y lo levanta la siguiente con su diff
 *    intacto.
 *
 * No se usa `FixtureService.updateMatch`: hace ~15 sondeos de columnas por
 * llamada, y un domingo de 289 partidos son ~4.300 round-trips de más.
 */
import { NextRequest, NextResponse } from 'next/server';

import { fetchChampionship, fetchChampionshipList, HTTP_FORMA_INESPERADA } from '@/lib/integrations/urba/client';
import {
    buildUrbaMatchExternalId,
    categoriaDeTorneoUrba,
    parseUrbaId,
    subcategoriaDeTorneoUrba,
} from '@/lib/integrations/urba/externalId';
import { planTournamentMatches, type ExistenteEnBase } from '@/lib/integrations/urba/planMatches';
import { construirPatch, parteDelBarrido, PARTES_DEL_BARRIDO, rotarPorReloj } from '@/lib/integrations/urba/syncPlan';
import { parsearAnioPedido, PRIMER_ANIO_URBA, temporadaEnCurso } from '@/lib/integrations/urba/temporada';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Corte por tiempo, no por cantidad: un pedido a URBA promedia 617 ms —250 de
 * pausa entre pedidos y el resto de red— y hay torneos de 437 KB.
 *
 * No son 60 porque el corte se toma ANTES de empezar un torneo, nunca en el
 * medio: el último puede pasarse de largo lo que le lleve escribir sus partidos
 * y rehacer su tabla. Medido, el torneo más caro de una jornada —el que finaliza
 * seis partidos y recalcula su tabla— son unos 3 s, y una corrida con el corte
 * en 45 s terminó en 47,8. Con 48 el peor caso queda en ~52 y sobran ocho
 * segundos contra el techo.
 */
const PRESUPUESTO_MS = 48_000;

/**
 * Cuántos lugares corre el arranque de una corrida a la siguiente.
 *
 * Es una MEDIDA, no un cupo: una corrida de jornada con recálculo de posiciones
 * leyó once torneos en 47 s. Ver `rotarPorReloj` — el número tiene que parecerse
 * a lo que una corrida alcanza a hacer, porque un paso más grande que eso deja
 * torneos sin visitar por una vuelta entera.
 */
const PASO_DE_ROTACION = 11;

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
 * Los `schedule` con los que está declarado el barrido en `vercel.json`.
 *
 * Son tres, una hora entre cada uno, y esa separación no es de comodidad: de la
 * HORA sale qué parte del catálogo barre cada corrida (ver `parteDelBarrido`),
 * así que las tres juntas cubren las tres partes el mismo día. Sacar una deja un
 * tercio de los torneos esperando al día siguiente.
 *
 * Se comparan literal contra el header `x-vercel-cron-schedule`, así que si se
 * cambian allá hay que cambiarlos acá. Es feo tener el dato en dos lados; la
 * alternativa era peor, y está explicada en `resolverScope`.
 */
const SCHEDULES_BARRIDO = new Set(['0 9 * * *', '0 10 * * *', '0 11 * * *']);

/**
 * De dónde sale el `scope`, y por qué NO viene por query string.
 *
 * Las entradas de `vercel.json` llevaban el scope en la URL
 * (`/api/cron/urba-sync?scope=barrido`) y con esa forma **Vercel no invocó el
 * cron ni una sola vez**: el fin de semana del 16-17/8 pasaron ~40 ventanas
 * programadas sin una escritura, con URBA ya publicado y el endpoint sano,
 * mientras los otros cinco crons del proyecto —paths sin query— corrían normal.
 * La referencia nunca documentó `?` en el `path` (sus ejemplos parametrizan con
 * segmentos), y "no documentado" resultó ser "no se invoca". Encima el silencio
 * es total: nada falla, nada se loguea, y el catálogo se queda quieto.
 *
 * Así que las entradas van con el path pelado y el scope de una invocación de
 * Vercel sale del header `x-vercel-cron-schedule`, que SÍ está documentado y
 * existe precisamente para distinguir schedules que comparten path. El query
 * string sigue mandando cuando está: es lo que permite dispararlo a mano con
 * curl, y por eso `scope` ausente cae en 'jornada' recién como último recurso.
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
        return { scope: SCHEDULES_BARRIDO.has(schedule) ? 'barrido' : 'jornada', scopeDesde: 'schedule' };
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
    /**
     * Los partidos que URBA sacó de su fixture se borran, y se borran SOLOS.
     *
     * La regla del conector es que manda la API: un partido que URBA ya no lista
     * no existe. Cuando rehacen un fixture —borran las fechas publicadas y las
     * vuelven a crear con ids nuevos— dejarlos era quedarse con el viejo y el
     * nuevo a la vez: `urba:2025278` tenía 55 partidos que la API no lista y 45
     * distintos que sí, sin un solo id en común.
     *
     * Automático no quiere decir sin frenos, y son tres:
     *  · un partido con resultado NO se borra nunca, ni siquiera acá: si tiene
     *    marcador, o lo cargó una persona o URBA lo movió de torneo, y las dos
     *    cosas piden que las mire alguien. Se reportan y quedan;
     *  · un torneo que llega sin un solo partido no cuenta como fixture vacío
     *    (ver `fixtureVacioSospechoso`);
     *  · un payload que no se entiende ni siquiera llega hasta acá: el cliente lo
     *    corta antes (ver `HTTP_FORMA_INESPERADA`).
     *
     * `&huerfanos=conservar` lo apaga para una corrida puntual.
     */
    const borrarHuerfanos = url.searchParams.get('huerfanos') !== 'conservar';
    /**
     * Modo recálculo: rehacer la tabla de todos los torneos en alcance y NO
     * pedirle nada a URBA.
     *
     * El cron recalcula lo que toca, que es lo correcto para la rotación: una
     * tabla que nadie movió no necesita rehacerse. Pero eso deja una puerta
     * cerrada — una tabla que quedó vieja por algo que pasó FUERA del conector
     * no se arregla sola NUNCA, porque el partido ya está bien y no hay diff que
     * dispare nada. Encontrado así: los partidos de Primera "A" coincidían uno a
     * uno con la API y su tabla publicada era del 11 de julio, un mes vieja.
     *
     * No le pide nada a URBA a propósito, y no es un ahorro: es que no hay nada
     * que preguntar. La tabla sale de `matches`, que ya está sincronizada. Sin el
     * pedido —850 ms por torneo entre la pausa de cortesía y la red— una parte
     * entera entra en una sola corrida en vez de en cuatro.
     */
    const soloRecalcular = url.searchParams.get('posiciones') === 'todas';

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
    let participantesCreados = 0;
    let tablasRecalculadas = 0;   // fases de posiciones rehechas
    let filasDePosiciones = 0;    // filas escritas en tournament_standings
    let huerfanosBorrados = 0;
    let cortadoPorPresupuesto = false;
    /**
     * Partidos que están en la base y URBA ya no lista para ese torneo.
     *
     * Pasa cuando URBA rehace un fixture: borra las fechas publicadas y las
     * vuelve a crear con ids nuevos. Sin esto el conector daba de alta las
     * nuevas y dejaba las viejas, o sea que el torneo terminaba con el fixture
     * DUPLICADO y la tabla de posiciones contando dos veces. Medido el
     * 2026-08-09: `urba:2025278` tenía 55 partidos en base y 45 distintos en la
     * API, sin un solo id en común.
     */
    const huerfanos: Array<{ torneo: string; external_id: string; status: string | null; jugado: boolean }> = [];
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
            .select('id, name, external_id, is_visible, subcategory')
            .like('external_id', 'urba:%')
            // El corte por temporada va en la CONSULTA y no en un filtro de abajo:
            // así los 677 del histórico no viajan ni se cuentan en ningún contador.
            .eq('season_id', String(ANIO));
        if (errTorneos) throw new Error(`no se pudieron leer los torneos: ${errTorneos.message}`);

        const torneos = (torneosRaw ?? []) as Array<{ id: string; name: string; external_id: string; is_visible: boolean; subcategory: string | null }>;
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
            // El rango va con un día de más de cada lado porque los bordes se
            // comparan en UTC y el filtro fino, abajo, en hora de Buenos Aires:
            // un partido del sábado a las 21 BA es domingo 00:00Z, y con el
            // rango ajustado al día UTC se caía del listado.
            const desde = new Date(Date.parse(`${ayer}T00:00:00.000Z`) - 86_400_000).toISOString();
            const hasta = new Date(Date.parse(`${hoy}T00:00:00.000Z`) + 2 * 86_400_000).toISOString();
            const { data: conPartido, error: errJornada } = await supabase
                .from('matches')
                .select('tournament_id, date_time')
                .like('external_id', 'urba:%')
                .gte('date_time', desde)
                .lt('date_time', hasta)
                // El default de PostgREST son 1.000 filas y un domingo grande de
                // URBA son 289: hoy sobra, pero el corte silencioso dejaría
                // torneos afuera sin un solo aviso, así que va explícito.
                .limit(5000);
            // Un error acá dejaba `juegan` vacío, y la corrida respondía ok con
            // cero torneos en alcance: idéntica a un domingo sin partidos.
            if (errJornada) throw new Error(`no se pudo resolver la jornada: ${errJornada.message}`);
            const juegan = new Set(
                ((conPartido ?? []) as Array<{ tournament_id: string; date_time: string }>)
                    .filter((m) => [hoy, ayer].includes(diaBA(m.date_time)))
                    .map((m) => m.tournament_id),
            );
            candidatos = enAlcance.filter((t) => juegan.has(t.id));
        } else {
            // Barrido por partes: 134 torneos son ~116 s y el techo son 60. La
            // parte sale del DÍA — con la hora, y corriendo el barrido una vez
            // por día, siempre caía la misma. Ver `parteDelBarrido`.
            //
            // `&parte=N` la fuerza. Existe para el día que haya que pasar por
            // TODOS los torneos ya mismo —un arreglo del conector que cambia lo
            // que se escribe, por ejemplo— sin esperar tres días a que el ciclo
            // dé la vuelta. Un valor fuera de rango se ignora y manda el reloj:
            // un tipeo no puede dejar el barrido barriendo la nada.
            const pedida = Number(url.searchParams.get('parte'));
            const parte = Number.isInteger(pedida) && pedida >= 0 && pedida < PARTES_DEL_BARRIDO
                ? pedida
                : parteDelBarrido(Date.now());
            candidatos = enAlcance.filter(
                (t) => (parseUrbaId(t.external_id) ?? 0) % PARTES_DEL_BARRIDO === parte,
            );
        }
        /**
         * El orden de la tanda.
         *
         * En la sincronización sale del reloj: no importa por dónde se empiece
         * mientras todos entren en la vuelta (ver `rotarPorReloj`).
         *
         * En el modo recálculo, no. Ahí lo que se busca es sacarse de encima las
         * tablas viejas, y la rotación por reloj sólo avanza cada 20 minutos: dos
         * corridas seguidas rehacen las MISMAS trece y la cola no se mueve.
         * Ordenando por la tabla más vieja primero, cada corrida ataca lo peor que
         * queda y la siguiente encuentra otra cosa — converge sin depender de que
         * pase el tiempo. El torneo sin una sola fila va primero de todos.
         */
        let tanda = rotarPorReloj(candidatos, PASO_DE_ROTACION, Date.now());
        if (soloRecalcular) {
            const masVieja = new Map<string, string>();
            for (let desde = 0; ; desde += 1000) {
                const { data, error } = await supabase
                    .from('tournament_standings')
                    .select('tournament_id, last_updated')
                    .in('tournament_id', candidatos.map((t) => t.id))
                    .range(desde, desde + 999);
                if (error) throw new Error(`no se pudo leer la antigüedad de las tablas: ${error.message}`);
                const filas = (data ?? []) as Array<{ tournament_id: string; last_updated: string | null }>;
                for (const f of filas) {
                    const previo = masVieja.get(f.tournament_id);
                    const valor = f.last_updated ?? '';
                    // La MÁS NUEVA del torneo: si una sola fase se rehizo hoy, el
                    // torneo no es el más urgente de la lista.
                    if (previo === undefined || valor > previo) masVieja.set(f.tournament_id, valor);
                }
                if (filas.length < 1000) break;
            }
            tanda = [...candidatos].sort((a, b) =>
                (masVieja.get(a.id) ?? '').localeCompare(masVieja.get(b.id) ?? ''));
        }

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
            // El torneo nuevo no se crea solo —la publicación y la navegación las
            // decide una persona—, pero tampoco puede quedar sólo en el JSON de
            // una respuesta que nadie abre: un torneo que URBA agrega y acá no
            // existe no se sincroniza nunca, y el cron sigue en verde.
            if (torneosNuevos.length > 0) {
                console.warn(`[urba-sync] URBA tiene ${torneosNuevos.length} torneos de ${ANIO} que no están en la base y NO se sincronizan: `
                    + torneosNuevos.map((t) => `${t.urba_id} "${t.nombre}"`).join(' · '));
            }
        } else {
            errors.push(lista.status === HTTP_FORMA_INESPERADA
                ? `la lista de torneos de ${ANIO} llegó con una forma que el conector no entiende`
                : `no se pudo leer la lista de torneos de ${ANIO} (HTTP ${lista.status})`);
        }

        /**
         * El acantilado del 1 de enero.
         *
         * `temporadaEnCurso()` sale del reloj, así que el 1 de enero el cron pasa
         * solo a la temporada nueva. Eso es lo que se quiere — pero los torneos de
         * esa temporada los da de alta una persona, y hasta que lo haga la consulta
         * devuelve CERO torneos, la tanda queda vacía, y `noSePudo` —que sólo mira
         * `tanda.length > 0`— da false. O sea: el cron respondería `ok: true` con
         * todo en cero, todos los días, hasta que alguien se diera cuenta.
         *
         * Con torneos en la lista de URBA y ninguno en la base, eso no es un día
         * tranquilo: es una temporada sin cargar. Va en rojo.
         */
        const temporadaSinCargar = torneos.length === 0 && (lista.data?.length ?? 0) > 0;
        if (temporadaSinCargar) {
            errors.push(`no hay un solo torneo de ${ANIO} en la base y URBA publica ${lista.data?.length}. `
                + 'La temporada nueva no se dio de alta: hasta que se cargue, el cron no tiene nada que sincronizar.');
        }

        // ── el goteo ────────────────────────────────────────────────────────
        for (const t of tanda) {
            // El corte va acá y en ningún otro lado: entre torneo y torneo, nunca
            // entre escribir los partidos de uno y rehacer su tabla. Lo que no
            // entra en esta pasada queda pendiente entero y la próxima lo ve igual.
            if (Date.now() - arrancoEn > PRESUPUESTO_MS) { cortadoPorPresupuesto = true; break; }

            // ── modo recálculo: la tabla sale de `matches`, no de URBA ──────
            if (soloRecalcular) {
                /**
                 * Las fases se sacan de los PARTIDOS, no de `tournament_phases`.
                 *
                 * Un torneo puede tener una fase declarada y todavía vacía —el Top
                 * 14 tiene "Playoffs" desde marzo y se juega en noviembre—, y
                 * recalcularla no devuelve una tabla vacía: devuelve una tabla de
                 * CEROS, una fila por participante. Recorriendo las fases
                 * declaradas, este modo le publicó al Top 14 una tabla de playoffs
                 * con catorce equipos en cero. El camino de la sincronización nunca
                 * tuvo el problema porque sólo toca fases donde escribió algo.
                 */
                const { data: fasesRaw, error: errFases } = await supabase
                    .from('matches').select('phase_id').eq('tournament_id', t.id)
                    .not('phase_id', 'is', null).limit(2000);
                if (errFases) { errors.push(`${t.external_id}: no se pudieron leer las fases (${errFases.message})`); continue; }
                torneosLeidos++;
                const conPartidos = [...new Set(((fasesRaw ?? []) as Array<{ phase_id: string }>).map((m) => m.phase_id))];
                for (const f of conPartidos.map((id) => ({ id }))) {
                    if (enSeco) { tablasRecalculadas++; continue; }
                    try {
                        const res = await recalculatePhaseStandingsScopes(t.id, f.id, 'general');
                        if (!res.ok) { errors.push(`${t.external_id}: la tabla de la fase ${f.id} no se pudo recalcular`); continue; }
                        tablasRecalculadas += res.scopes_recalculated;
                        filasDePosiciones += res.rows_calculated;
                    } catch (e) {
                        errors.push(`${t.external_id}: el recálculo falló (${e instanceof Error ? e.message : String(e)})`);
                    }
                }
                continue;
            }

            const urbaId = parseUrbaId(t.external_id);
            const categoria = urbaId == null ? undefined : categoriaPorId.get(urbaId);
            if (urbaId == null || !categoria) { errors.push(`${t.external_id}: no se pudo derivar la categoría de "${t.name}"`); continue; }

            // Sin caché de disco: acá el objetivo es justamente ver lo que cambió.
            const r = await fetchChampionship(urbaId);
            if (!r.ok || !r.data) {
                // Un cambio de forma de la API se arregla tocando el conector y una
                // caída se arregla esperando: el error tiene que decir cuál es.
                errors.push(r.status === HTTP_FORMA_INESPERADA
                    ? `${t.external_id}: URBA contestó algo que el conector no entiende (cambió la forma del payload)`
                    : `${t.external_id}: HTTP ${r.status}`);
                continue;
            }
            torneosLeidos++;

            const { data: yaRaw, error: errYa } = await supabase
                .from('matches')
                // `is_visible` se lee porque de él sale la visibilidad que hereda
                // un partido nuevo. Faltaba en esta lista y se usaba abajo: el
                // campo llegaba `undefined`, `visibleEnEsteTorneo` daba false
                // siempre, y una fecha reprogramada entraba INVISIBLE en un
                // torneo publicado. Sin error y sin aviso, que es lo peor.
                .select('id, external_id, date_time, venue, status, score, round_label, phase_id, is_visible, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated')
                .eq('tournament_id', t.id)
                .like('external_id', 'urba:%')
                .limit(2000);
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

            const { data: partsRaw, error: errParts } = await supabase
                .from('tournament_participants').select('club_id').eq('tournament_id', t.id).limit(2000);
            // Sin participantes el motor de posiciones descarta TODOS los partidos
            // del torneo: leerlos mal no puede pasar por alto.
            if (errParts) { errors.push(`${t.external_id}: no se pudieron leer los participantes (${errParts.message})`); continue; }

            const plan = planTournamentMatches({
                championship: r.data as any,
                tournamentId: t.id,
                categoria,
                subcategory: t.subcategory,
                resolverClub: (triple: string) => mapeo.get(triple) ?? null,
                existentes,
                participantesYaEnBase: new Set(((partsRaw ?? []) as Array<{ club_id: string }>).map((p) => p.club_id)),
            });

            // Las fases que este torneo va a tener que recalcular. Se junta acá,
            // sobre los partidos que REALMENTE se escriben, y no al final sobre
            // el torneo entero: recalcular una fase que no se tocó es leer toda
            // su tabla para reescribirla igual.
            const fasesTocadas = new Set<string>();

            // ── participantes que faltan ────────────────────────────────────
            // Un club que se suma al torneo entra en `tournament_participants` o
            // no existe para la tabla: `StandingsEngine.buildTableRows` arma el
            // mapa desde los participantes y DESCARTA el partido si le falta
            // alguno de los dos, sin error. Esto se calculaba y no se escribía.
            for (const p of plan.participantesCrear) {
                if (enSeco) {
                    participantesCreados++;
                    detalle.push({ torneo: t.external_id, accion: 'participante', club_id: p.club_id });
                    continue;
                }
                const { error } = await supabase.from('tournament_participants').insert([p]);
                if (error) { errors.push(`${t.external_id}: no se pudo inscribir a ${p.club_id} (${error.message})`); continue; }
                participantesCreados++;
                if (faseDelTorneo) fasesTocadas.add(faseDelTorneo);
            }

            // altas
            for (const fila of plan.crear) {
                if (enSeco) { written++; detalle.push({ torneo: t.external_id, accion: 'crear', external_id: fila.external_id }); continue; }
                const { error } = await supabase.from('matches').insert([{
                    ...fila, sport_id: 'rugby', is_visible: visibleEnEsteTorneo, phase_id: faseDelTorneo,
                }]);
                if (error) { errors.push(`${fila.external_id}: alta falló (${error.message})`); continue; }
                written++;
                if (faseDelTorneo) fasesTocadas.add(faseDelTorneo);
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

                const { error } = await supabase.from('matches')
                    .update(patch.patch).eq('external_id', patch.external_id);
                if (error) { errors.push(`${patch.external_id}: update falló (${error.message})`); continue; }
                updated++;
                if (patch.seFinaliza) finalizados++;
                // La fase del partido que se tocó, que puede no ser la del torneo:
                // un torneo con fase regular y playoff tiene dos tablas.
                if (actual?.phase_id) fasesTocadas.add(actual.phase_id);

                // El ranking ya no se sincroniza partido por partido: lo levanta
                // entero el cron del martes a las 00:00. Un barrido de URBA que
                // finalizaba 340 partidos disparaba 340 sincronizaciones, cada una
                // con su propia lectura previa.
            }
            skipped += plan.sinCambios;

            // ── lo que URBA sacó del fixture ────────────────────────────────
            const idsDeUrba = new Set<string>();
            for (const ronda of (r.data.rounds ?? [])) {
                for (const m of (ronda.matches ?? [])) idsDeUrba.add(buildUrbaMatchExternalId(m.id));
            }
            // La guarda que hace que esto no sea un arma. Un torneo que llega SIN
            // un solo partido y tiene partidos en la base no es un fixture que se
            // vació: es una respuesta rara —o una API que cambió— y tomarla al pie
            // de la letra convierte el torneo entero en "huérfano". Con
            // `huerfanos=borrar` eso sería borrarlo. El caso legítimo —URBA saca
            // fechas— siempre deja las demás en pie.
            const fixtureVacioSospechoso = idsDeUrba.size === 0 && ya.length > 0;
            if (fixtureVacioSospechoso) {
                errors.push(`${t.external_id}: URBA devolvió el torneo sin un solo partido y en la base hay ${ya.length}. No se marca ningún huérfano.`);
            }
            const sobran = fixtureVacioSospechoso ? [] : ya.filter((m) => !idsDeUrba.has(m.external_id));
            for (const m of sobran) {
                const jugado = String(m.status ?? '').toLowerCase() === 'final';
                huerfanos.push({ torneo: t.external_id, external_id: m.external_id, status: m.status, jugado });
                // Un partido con resultado no se borra ni con el flag: si tiene
                // marcador, o lo cargó una persona o URBA lo publicó y después lo
                // movió de torneo. Las dos cosas piden que las mire alguien.
                if (!borrarHuerfanos || jugado || enSeco) continue;
                const { error } = await supabase.from('matches').delete().eq('id', m.id);
                if (error) { errors.push(`${m.external_id}: no se pudo borrar el huérfano (${error.message})`); continue; }
                huerfanosBorrados++;
                if (m.phase_id) fasesTocadas.add(m.phase_id);
            }

            // ── y la tabla de posiciones de este torneo ─────────────────────
            // Va acá, con los partidos de ESTE torneo ya escritos, y se espera.
            // `tournament_standings` es materializada: sin esta llamada el
            // resultado entra en `matches` y la tabla publicada no se mueve.
            for (const phaseId of fasesTocadas) {
                try {
                    const res = await recalculatePhaseStandingsScopes(t.id, phaseId, 'general');
                    if (!res.ok) { errors.push(`${t.external_id}: la tabla de la fase ${phaseId} no se pudo recalcular`); continue; }
                    tablasRecalculadas += res.scopes_recalculated;
                    filasDePosiciones += res.rows_calculated;
                } catch (e) {
                    errors.push(`${t.external_id}: el recálculo de posiciones falló (${e instanceof Error ? e.message : String(e)})`);
                }
            }
        }

        if (!enSeco && (written > 0 || updated > 0)) {
            try { await invalidateMatchesFeedCaches(supabase); }
            catch (e) { errors.push(`no se pudo invalidar la caché del feed (${e instanceof Error ? e.message : String(e)})`); }
        }

        const elapsed = Date.now() - arrancoEn;
        console.log(`[urba-sync] anio=${ANIO}${esHistorico ? ' (HISTÓRICO, a pedido)' : ''} scope=${scope}(${scopeDesde})${enSeco ? ' (en seco)' : ''} torneos=${torneosLeidos}/${tanda.length} written=${written} updated=${updated} skipped=${skipped} tablas=${tablasRecalculadas} filas=${filasDePosiciones} huerfanos=${huerfanos.length} errors=${errors.length} en ${elapsed}ms${cortadoPorPresupuesto ? ' (cortado por presupuesto)' : ''}`);

        // El trabajo no se pudo hacer: 500. Un contador en verde con la escritura
        // caída es peor que un cron en rojo — de eso salió la regla. La temporada
        // sin cargar entra por la misma puerta: ahí no hay nada que leer, y por
        // eso mismo `tanda.length > 0` no lo agarra.
        const noSePudo = (torneosLeidos === 0 && tanda.length > 0) || temporadaSinCargar;
        return NextResponse.json({
            ok: !noSePudo && errors.length === 0,
            // `scopeDesde` dice de dónde salió el scope. Si un día dice "schedule",
            // Vercel dejó de pasar el query string y el header lo salvó.
            scope, scopeDesde, dry: enSeco,
            // Que la respuesta diga que esta corrida NO habló con URBA: si no,
            // un `updated: 0` se lee como "no cambió nada allá".
            ...(soloRecalcular ? { modo: 'recalculo (sin pedirle nada a URBA)' } : {}),
            // Que la respuesta diga QUÉ temporada se sincronizó, siempre. Sin esto,
            // una corrida sobre el año equivocado se ve idéntica a una correcta.
            anio: ANIO,
            esHistorico,
            torneosDeLaTemporada: torneos.length,
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
            participantesCreados,
            // Lo que hace que el resultado llegue a la tabla publicada. Un
            // `updated > 0` con `tablasRecalculadas: 0` significa que los partidos
            // entraron y las posiciones se quedaron atrás: es el síntoma exacto
            // del bug que este contador existe para hacer visible.
            tablasRecalculadas,
            filasDePosiciones,
            // `true` cuando quedaron torneos sin mirar. No es un error: la próxima
            // corrida los toma. Sí es la señal de que el presupuesto quedó corto
            // si aparece en todas.
            cortadoPorPresupuesto,
            huerfanos: huerfanos.slice(0, 100),
            huerfanosTotal: huerfanos.length,
            huerfanosBorrados,
            // Los que quedaron son los que tienen resultado, y ésos no se borran
            // solos por diseño. Que la respuesta los nombre: es lo único de todo
            // esto que pide que lo mire una persona.
            ...(huerfanos.some((h) => h.jugado) ? {
                notaHuerfanos: `${huerfanos.filter((h) => h.jugado).length} partidos con resultado están en la base y URBA ya no los lista. `
                    + 'No se borran automáticamente: o los cargó alguien a mano, o URBA los movió de torneo.',
            } : {}),
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
