/**
 * El planificador del import de ARUSA: dados los partidos de la fuente y los
 * que ya están en la base, decide qué tocar. No escribe nada y no sabe de
 * Supabase — así lo usan igual el script de mano (`src/scripts/arusa-torneo.ts`)
 * y el cron (`/api/cron/arusa-sync`), y se puede probar sin red.
 *
 * La regla de oro: NO borra ni duplica. Cada partido de ARUSA busca su fila por
 * el par de clubes; solo da de alta lo que no encuentra.
 */
import type { PartidoArusa } from './client.ts';

/**
 * Alias por NOMBRE, para el primer equipo de mayores de cada club. Es el último
 * recurso: el mapeo bueno es por id de equipo de Leverade, guardado en
 * `club_external_ids` con `provider = 'arusa'`.
 *
 * Por qué no alcanza el nombre: "PWCC" es el primer equipo en Primera y el B en
 * Cuarta, y "Old Boys" son tres fichas distintas según la categoría. El nombre
 * no dice cuál; el id de equipo sí, porque Leverade da uno por inscripción.
 */
export const ALIAS_CLUBES: Record<string, string> = {
    'uc': 'universidad-catolica',
    'old macks': 'old-mackayans',
    'old boys': 'old-boys-r-c',
    'sporting rc': 'sporting-r-c',
    'cda': 'cd-alumni',
    'all brads a': 'all-brads',
};

/** Un equipo de la fuente: el id es lo que identifica, el nombre es para leer. */
export interface EquipoArusa {
    id: string;
    nombre: string;
}

/**
 * La categoría de edad de un torneo de ARUSA, leída de su NOMBRE.
 *
 * Es la ÚNICA fuente de `tournaments.age_grade` para ARUSA: la usa el alta
 * (`arusa-crear-torneo.ts`) y la usa el backfill (`arusa-grado-juvenil.ts`).
 * Si cada uno la calculara por su cuenta, el torneo que entre mañana quedaría
 * clasificado distinto que los siete de hoy, y en silencio.
 *
 * Por qué importa: `resolveTournamentAudience` mira el grado ANTES que el
 * nombre, así que un `Mayores` heredado del torneo modelo manda a la M18 a la
 * portada de mayores aunque se llame "M18 Primera de ARUSA".
 *
 * Devuelve null para las competencias de mayores, que no tienen número en el
 * nombre: ahí el grado lo pone quien la da de alta.
 */
export function gradoDeEdadArusa(nombre: string): string | null {
    const m = nombre.match(/\b[MU]\s*-?\s*(\d{1,2})\b/i);
    return m ? `M${m[1]}` : null;
}

/** `m18-segunda` → `M18 Segunda`, `intermedia` → `Intermedia`. */
export function rotuloDeSufijo(sufijo: string): string {
    return sufijo.split('-')
        .map((t) => (/^m\d+$/.test(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)))
        .join(' ');
}

/**
 * El nombre de la ficha de una filial. La categoría va EN el nombre, como en
 * la URBA ("Albatros Intermedia", "San Andrés M19"): sin eso, un club con
 * ocho equipos aparece ocho veces como "PWCC" en el buscador y no hay forma de
 * saber cuál es cuál.
 */
export function nombreDeFilial(nombreArusa: string, sufijo: string | null): string {
    if (!sufijo) return nombreArusa;
    const rotulo = rotuloDeSufijo(sufijo);
    const yaEsta = normalizarNombre(nombreArusa).split(' ');
    const faltan = normalizarNombre(rotulo).split(' ').filter((t) => !yaEsta.includes(t));
    if (!faltan.length) return nombreArusa;
    return `${nombreArusa} ${rotulo}`;
}

export function normalizarNombre(nombre: string): string {
    return nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Hora local de Santiago → UTC. El offset se MIDE en esa fecha con `Intl`, no
 * se asume: Chile vuelve al horario de verano a principios de septiembre y la
 * última fecha del torneo cae del otro lado del cambio.
 */
export function aUtcDesdeZona(localSql: string, zona: string): string {
    const [dia, hora] = localSql.split(' ');
    const [Y, M, D] = dia.split('-').map(Number);
    const [hh, mm, ss] = (hora ?? '00:00:00').split(':').map(Number);
    const tentativa = Date.UTC(Y, M - 1, D, hh, mm, ss || 0);

    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zona, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const offset = (t: number) => {
        const p = Object.fromEntries(dtf.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
        const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
        return comoUtc - t;
    };
    const primera = tentativa - offset(tentativa);
    return new Date(tentativa - offset(primera)).toISOString();
}

/**
 * Los puntos de tabla que publica ARUSA vienen enteros por equipo, con los
 * bonus ya sumados. La base la manda el resultado (4/2/0) y el resto es bonus.
 */
export function repartirPuntos(propios: number, ajenos: number, tabla: number | null) {
    const base = propios > ajenos ? 4 : propios === ajenos ? 2 : 0;
    if (tabla === null) return { base, bonus: 0 };
    // El total de la fuente MANDA; el 4/2/0 solo sirve para repartirlo entre
    // base y bonus. Cuando no alcanza —en M13 y M14 ARUSA publica otra cosa,
    // un 1 por partido ganado en vez de puntos de tabla— se guarda tal cual
    // antes que inventar un sistema que esa categoría no usa.
    if (tabla >= base) return { base, bonus: tabla - base };
    return { base: tabla, bonus: 0 };
}

/**
 * El resolver equipo→club, con las dos fuentes en orden de confianza:
 *
 *   1. `club_external_ids` (`provider = 'arusa'`, `external_id` = id de equipo
 *      de Leverade). Es la verdad: distingue el primer equipo del B y la M18
 *      Azul de la Blanca, que comparten nombre o club.
 *   2. el nombre contra los participantes de ESE torneo, más `ALIAS_CLUBES`.
 *      Es el resto para los torneos cargados antes de que existiera el mapa
 *      por id, y para el alta de un torneo cuyos equipos todavía no se
 *      escribieron.
 */
export const CLAVE_EQUIPO = (teamId: string) => `equipo:${teamId}`;
export const CLAVE_CLUB = (clubLeveradeId: string) => `club:${clubLeveradeId}`;
/**
 * Un equipo DENTRO de una rama. Hace falta porque Leverade cuelga los `team`
 * de la competencia, no del grupo: en Primera hay diez equipos y esos mismos
 * diez juegan Titulares, Intermedia y Pre-Intermedia. Sin la rama, el mapa no
 * puede decir que la Intermedia de PWCC es `pwcc-intermedia` y la de Titulares
 * es `pwcc`.
 */
export const CLAVE_EQUIPO_RAMA = (ramaId: string, teamId: string) => `equipo:${teamId}@rama:${ramaId}`;

export function construirResolver(opts: {
    /** Las filas crudas de `club_external_ids` con `provider = 'arusa'`. */
    equivalencias: Array<{ external_id: string; club_id: string }>;
    participantes: Array<{ club_id: string | null; nombre?: string | null; corto?: string | null }>;
    /** La rama que se está importando; manda sobre el mapa por equipo suelto. */
    ramaId?: string | null;
}): (equipo: EquipoArusa) => string | null {
    const porEquipo = new Map(opts.equivalencias.map((e) => [e.external_id, e.club_id]));
    const porNombre = new Map<string, string>();
    for (const p of opts.participantes) {
        if (!p.club_id) continue;
        porNombre.set(normalizarNombre(p.club_id.replace(/-/g, ' ')), p.club_id);
        if (p.nombre) porNombre.set(normalizarNombre(p.nombre), p.club_id);
        if (p.corto) porNombre.set(normalizarNombre(p.corto), p.club_id);
    }
    return (equipo: EquipoArusa) => {
        const enRama = opts.ramaId ? porEquipo.get(CLAVE_EQUIPO_RAMA(opts.ramaId, equipo.id)) : undefined;
        if (enRama) return enRama;
        const porId = porEquipo.get(CLAVE_EQUIPO(equipo.id));
        if (porId) return porId;
        const n = normalizarNombre(equipo.nombre);
        const directo = porNombre.get(n);
        if (directo) return directo;
        const alias = ALIAS_CLUBES[n];
        return alias ? (porNombre.get(normalizarNombre(alias.replace(/-/g, ' '))) ?? alias) : null;
    };
}

export interface PartidoExistente {
    id: string;
    date_time: string | null;
    venue: string | null;
    status: string | null;
    score: { home?: number; away?: number } | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home_base_points: number | null;
    home_bonus_points: number | null;
    away_base_points: number | null;
    away_bonus_points: number | null;
    round_label: string | null;
    external_id: string | null;
}

export interface CambioArusa {
    id: string;
    patch: Record<string, unknown>;
    cambios: string[];
    rotulo: string;
    /** El parche trae marcador nuevo: hay que rehacer la tabla de posiciones. */
    tocaResultado: boolean;
}

export interface PlanArusa {
    actualizar: CambioArusa[];
    crear: Array<Record<string, unknown>>;
    emparejados: number;
    sinCambios: number;
    localiaCorregida: number;
    clubesSinMapa: string[];
    /** Filas de la base que ARUSA no tiene. Se dejan como están, pero se avisan. */
    huerfanos: PartidoExistente[];
}

/** Lo que la fila de `matches` debería decir según ARUSA. */
export function filaSegunArusa(p: PartidoArusa, local: string, visita: string): Record<string, unknown> {
    const casa = p.jugado ? repartirPuntos(p.puntosLocal!, p.puntosVisita!, p.tablaLocal) : { base: 0, bonus: 0 };
    const fuera = p.jugado ? repartirPuntos(p.puntosVisita!, p.puntosLocal!, p.tablaVisita) : { base: 0, bonus: 0 };
    return {
        date_time: p.inicioLocal ? aUtcDesdeZona(p.inicioLocal, p.zona) : null,
        venue: p.cancha,
        status: p.jugado ? 'final' : 'scheduled',
        score: { home: p.puntosLocal ?? 0, away: p.puntosVisita ?? 0 },
        home_club_id: local,
        away_club_id: visita,
        home_base_points: casa.base,
        home_bonus_points: casa.bonus,
        away_base_points: fuera.base,
        away_bonus_points: fuera.bonus,
        // Manda el número oficial: la regla del torneo (try bonus + derrota por
        // menos de 7) discrepa con ARUSA en los bordes, y la tabla tiene que
        // dar igual que la de la web.
        points_autocalculated: false,
        points_override_reason: 'Puntos oficiales de ARUSA',
        round_label: p.fecha,
        external_id: `arusa:${p.id}`,
    };
}

function mismoMarcador(actual: { home?: number; away?: number } | null, nuevo: { home: number; away: number }): boolean {
    return (actual?.home ?? null) === nuevo.home && (actual?.away ?? null) === nuevo.away;
}

function distancia(fila: PartidoExistente, objetivo: unknown): number {
    if (!fila.date_time || typeof objetivo !== 'string') return Number.MAX_SAFE_INTEGER;
    return Math.abs(new Date(fila.date_time).getTime() - new Date(objetivo).getTime());
}

export function planArusaMatches(opts: {
    partidos: PartidoArusa[];
    existentes: PartidoExistente[];
    /** Recibe el EQUIPO, no el nombre: el mismo rótulo es otro club según la competencia. */
    resolverClub: (equipo: EquipoArusa) => string | null;
    /** Campos fijos de una fila nueva (torneo, fase, temporada, deporte…). */
    plantillaDeAlta: Record<string, unknown>;
    nuevoId: () => string;
}): PlanArusa {
    const { partidos, existentes, resolverClub, plantillaDeAlta, nuevoId } = opts;

    const porPar = new Map<string, PartidoExistente[]>();
    const porParSinOrden = new Map<string, PartidoExistente[]>();
    for (const m of existentes) {
        const orden = `${m.home_club_id}|${m.away_club_id}`;
        const suelto = [m.home_club_id, m.away_club_id].sort().join('|');
        (porPar.get(orden) ?? porPar.set(orden, []).get(orden)!).push(m);
        (porParSinOrden.get(suelto) ?? porParSinOrden.set(suelto, []).get(suelto)!).push(m);
    }

    const usados = new Set<string>();
    const plan: PlanArusa = {
        actualizar: [], crear: [], emparejados: 0, sinCambios: 0,
        localiaCorregida: 0, clubesSinMapa: [], huerfanos: [],
    };
    const sinMapa = new Set<string>();

    for (const p of partidos) {
        if (p.libre || p.anulado || !p.local || !p.visita) continue;

        const local = resolverClub(p.local);
        const visita = resolverClub(p.visita);
        if (!local) sinMapa.add(`${p.local.nombre} (equipo ${p.local.id})`);
        if (!visita) sinMapa.add(`${p.visita.nombre} (equipo ${p.visita.id})`);
        if (!local || !visita) continue;

        const deseado = filaSegunArusa(p, local, visita);
        const rotulo = `${p.fecha} — ${p.local.nombre} vs ${p.visita.nombre}`;

        // Entre varios candidatos gana el de fecha más cercana: en un ida y
        // vuelta el mismo par juega dos veces, y agarrar el primero de la lista
        // le encajaría a la fecha 4 el partido de la 13.
        const cerca = (cands: PartidoExistente[]) => cands
            .filter((m) => !usados.has(m.id))
            .sort((a, b) => distancia(a, deseado.date_time) - distancia(b, deseado.date_time))[0];

        let fila = cerca(porPar.get(`${local}|${visita}`) ?? []);
        let invertido = false;
        if (!fila) {
            fila = cerca(porParSinOrden.get([local, visita].sort().join('|')) ?? []);
            invertido = Boolean(fila);
        }

        if (!fila) {
            plan.crear.push({ id: nuevoId(), ...plantillaDeAlta, ...deseado });
            continue;
        }

        usados.add(fila.id);
        plan.emparejados += 1;
        if (invertido) plan.localiaCorregida += 1;

        const patch: Record<string, unknown> = {};
        const cambios: string[] = [];
        let tocaResultado = false;
        for (const [campo, valor] of Object.entries(deseado)) {
            const actual = (fila as unknown as Record<string, unknown>)[campo];
            const igual = campo === 'score'
                ? mismoMarcador(actual as { home?: number; away?: number } | null, valor as { home: number; away: number })
                : campo === 'date_time'
                    ? actual != null && new Date(actual as string).toISOString() === valor
                    : actual === valor;
            if (igual) continue;
            patch[campo] = valor;
            if (campo === 'score') {
                const a = actual as { home?: number; away?: number } | null;
                const n = valor as { home: number; away: number };
                cambios.push(`marcador ${a?.home ?? '–'}-${a?.away ?? '–'} → ${n.home}-${n.away}`);
                tocaResultado = true;
            } else if (campo === 'status') { cambios.push(`estado ${actual} → ${valor}`); tocaResultado = true; }
            else if (campo === 'date_time') cambios.push('horario');
            else if (campo === 'venue') cambios.push('cancha');
            else if (campo === 'round_label') cambios.push('fecha');
            else if (campo === 'home_club_id' || campo === 'away_club_id') { cambios.push('localía al revés'); tocaResultado = true; }
            else if (campo.endsWith('_points')) { cambios.push('puntos de tabla'); tocaResultado = true; }
            // Cualquier otro campo se nombra igual: un parche sin motivo visible
            // es un parche que nadie puede revisar.
            else cambios.push(campo);
        }

        if (Object.keys(patch).length) plan.actualizar.push({ id: fila.id, patch, cambios, rotulo, tocaResultado });
        else plan.sinCambios += 1;
    }

    plan.clubesSinMapa = [...sinMapa];
    plan.huerfanos = existentes.filter((m) => !usados.has(m.id));
    return plan;
}
