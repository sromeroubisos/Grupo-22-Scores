import type { CaptainState } from '@/features/captain';
// Rutas relativas y con `.ts`, como `honours.ts`: el test de este módulo corre
// en Node sin el alias `@/`.
import { belongingTier } from '../../../../features/captain/engine/belonging.ts';
import { betrayedClubs } from '../../../../features/captain/engine/betrayal.ts';
import { resolveClub } from '../../../../features/captain/engine/promotion.ts';
import { unionName } from '../../../../features/captain/data/catalogs.ts';
import { getEvent } from '../../../../features/captain/data/events/index.ts';
import { rarityOf } from '../../../../features/captain/engine/event-selector.ts';

/**
 * EL LEGADO: QUÉ QUEDA DE VOS, LEÍDO EN CINCO IDIOMAS.
 *
 * El título de la carrera (`careerTitle.ts`) contesta UNA pregunta —qué fue lo
 * tuyo— y se queda con la respuesta más rara. Este módulo contesta otra: en qué
 * lugares quedó tu nombre, y cuánto. Un jugador puede ser ídolo de su club y
 * nadie en la selección, o tener cien caps y no ser de ningún club. Son
 * legados distintos y el rugby los recuerda por separado.
 *
 * ── Cinco ejes, cada uno con sus porqués ────────────────────────────────────
 * Ninguno es un número arbitrario: cada eje suma RENGLONES que se pueden leer
 * («Vitalicio en CASI · +55», «8 temporadas con esa camiseta · +16»), y la
 * pantalla los muestra. Si el jugador no entiende por qué es «Referente», el
 * sistema está mal.
 *
 * ── Por qué vive acá y no en el motor ───────────────────────────────────────
 * Igual que el título: es una LECTURA de la carrera, no una moneda. No consume
 * azar, no se persiste y no lo lee ninguna cuenta del motor. Cambiar un peso de
 * acá no invalida ninguna partida ni mueve el digest (CLAUDE.md de captain §1.10).
 * Todo sale de lo que el estado ya guarda —la Pertenencia por club, la vitrina,
 * los hitos, la planilla— así que no puede desincronizarse (§1.9).
 */

export type LegacyAxisId = 'club' | 'seleccion' | 'capitania' | 'vitrina' | 'longevidad';

export type LegacyLevel = 'ninguno' | 'huella' | 'referencia' | 'leyenda';

export interface LegacyReason {
    text: string;
    /** Lo que suma (o resta) este renglón. */
    points: number;
}

export interface LegacyAxis {
    id: LegacyAxisId;
    icon: string;
    /** El nombre del eje: «Club», «Selección»… El escalón lo dice `headline`. */
    label: string;
    /** 0–100. La suma de los renglones, recortada. */
    score: number;
    level: LegacyLevel;
    /** Cómo te nombran en este eje, según el escalón. Vacío en `ninguno`. */
    headline: string;
    reasons: LegacyReason[];
}

export interface Legacy {
    /** En orden fijo de declaración: la pantalla no reordena por puntaje. */
    axes: LegacyAxis[];
    /** El eje más alto. `null` si ninguno pasó de `ninguno`. */
    main: LegacyAxis | null;
}

/**
 * LOS CORTES DE ESCALÓN. PARÁMETRO LIBRE.
 *
 * La premisa: «Leyenda» es un final, no un premio por participar. Una carrera
 * normal deja huella en uno o dos ejes y es referencia en uno; leyenda en
 * alguno es una carrera grande. `legacy.test.ts` mide esa forma sobre carreras
 * autojugadas, contra la premisa y no contra la medición.
 */
export const LEGACY_LEVELS: readonly { id: LegacyLevel; min: number; labelEs: string }[] = [
    { id: 'ninguno', min: 0, labelEs: 'Sin huella' },
    { id: 'huella', min: 20, labelEs: 'Huella' },
    { id: 'referencia', min: 45, labelEs: 'Referencia' },
    { id: 'leyenda', min: 70, labelEs: 'Leyenda' },
];

export function legacyLevelOf(score: number): LegacyLevel {
    let nivel: LegacyLevel = 'ninguno';
    for (const l of LEGACY_LEVELS) if (score >= l.min) nivel = l.id;
    return nivel;
}

const HEADLINES: Record<LegacyAxisId, Record<Exclude<LegacyLevel, 'ninguno'>, string>> = {
    club: { huella: 'Querido en el club', referencia: 'Referente del club', leyenda: 'Ídolo del club' },
    seleccion: { huella: 'Convocado', referencia: 'Internacional', leyenda: 'Figura internacional' },
    capitania: { huella: 'Voz del vestuario', referencia: 'Capitán', leyenda: 'Capitán histórico' },
    vitrina: { huella: 'Campeón', referencia: 'Ganador', leyenda: 'Multicampeón' },
    longevidad: { huella: 'Carrera completa', referencia: 'Carrera larga', leyenda: 'Eterno' },
};

const AXIS_META: Record<LegacyAxisId, { icon: string; label: string }> = {
    club: { icon: '🏟️', label: 'Club' },
    seleccion: { icon: '🌎', label: 'Selección' },
    capitania: { icon: '©️', label: 'Capitanía' },
    vitrina: { icon: '🏆', label: 'Vitrina' },
    longevidad: { icon: '⏳', label: 'Longevidad' },
};

/**
 * Lo que suma cada escalón de Pertenencia en el club de tu vida.
 * ESPEJO de `BELONGING_TIERS` (types/currencies.ts): un escalón nuevo ahí
 * necesita su renglón acá, o su club suma cero.
 */
const BELONGING_POINTS: Record<string, number> = {
    plantel: 0,
    titular: 10,
    referente: 25,
    capitan: 40,
    vitalicio: 55,
};

const BELONGING_LABEL: Record<string, string> = {
    plantel: 'Uno del plantel',
    titular: 'Titular',
    referente: 'Referente',
    capitan: 'Capitán',
    vitalicio: 'Vitalicio',
};

/** La bandera que deja la carta «La cinta» (`data/events/club.ts`). */
export const CLUB_CAPTAIN_FLAG = 'capitan';

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

function axis(id: LegacyAxisId, reasons: LegacyReason[]): LegacyAxis {
    const visibles = reasons.filter((r) => r.points !== 0);
    const score = clamp(visibles.reduce((acc, r) => acc + r.points, 0));
    const level = legacyLevelOf(score);
    return {
        id,
        icon: AXIS_META[id].icon,
        label: AXIS_META[id].label,
        score,
        level,
        headline: level === 'ninguno' ? '' : HEADLINES[id][level],
        reasons: visibles,
    };
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

function clubNameOf(state: CaptainState, id: string): string {
    try {
        return resolveClub(state.divisions, id).name;
    } catch {
        // Un club que salió del catálogo no puede tirar la pantalla de retiro.
        return 'tu club';
    }
}

function hasMilestone(state: CaptainState, id: string): boolean {
    return state.milestones.some((m) => m.id === id);
}

/**
 * EL CLUB DE TU VIDA: el de la Pertenencia más alta entre los que jugaste.
 * Empate → el de más temporadas, y después el id, para que nunca decida el
 * orden de inserción del ledger (CLAUDE.md §1).
 */
export function clubOfYourLife(state: CaptainState): string | null {
    const temporadas = (id: string) => state.history.filter((h) => h.clubId === id).length;
    const candidatos = Object.keys(state.belonging.byClub)
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ id, valor: state.belonging.byClub[id] ?? 0, temporadas: temporadas(id) }))
        .filter((c) => c.temporadas > 0);
    if (candidatos.length === 0) return state.homeClubId;
    candidatos.sort((a, b) => b.valor - a.valor || b.temporadas - a.temporadas || a.id.localeCompare(b.id));
    return candidatos[0].id;
}

/** Temporadas jugadas en un club que no es de tu país. */
export function seasonsAbroad(state: CaptainState): number {
    return state.history.filter((h) => {
        if (!h.clubId) return false;
        try {
            return resolveClub(state.divisions, h.clubId).countryCode !== state.player.countryCode;
        } catch {
            return false;
        }
    }).length;
}

export function legacyOf(state: CaptainState): Legacy {
    // ── 🏟️ Ídolo del club ──────────────────────────────────────────────────
    const club = clubOfYourLife(state);
    const clubReasons: LegacyReason[] = [];
    if (club) {
        const nombre = clubNameOf(state, club);
        const tier = belongingTier(state.belonging.byClub[club] ?? 0);
        clubReasons.push({ text: `${BELONGING_LABEL[tier]} en ${nombre}`, points: BELONGING_POINTS[tier] ?? 0 });

        const temporadas = state.history.filter((h) => h.clubId === club).length;
        clubReasons.push({
            text: `${plural(temporadas, 'temporada', 'temporadas')} con esa camiseta`,
            points: Math.min(20, temporadas * 2),
        });

        const copas = state.titles.filter((t) => t.kind === 'club' && t.clubId === club).length;
        clubReasons.push({ text: `${plural(copas, 'título', 'títulos')} con el club`, points: Math.min(24, copas * 8) });

        if (club === state.homeClubId) {
            clubReasons.push({ text: 'Es tu club formador', points: 5 });
            if (hasMilestone(state, 'vuelta-a-casa')) {
                clubReasons.push({ text: 'Te fuiste y volviste', points: 7 });
            }
        }
    }
    if (betrayedClubs(state).size > 0) {
        clubReasons.push({ text: 'Te fuiste al clásico rival', points: -15 });
    }

    // ── 🌎 Figura internacional ─────────────────────────────────────────────
    const caps = state.national.caps;
    const copasNacionales = state.titles.filter((t) => t.kind === 'national').length;
    const mejores = state.awards.filter((a) => a.id === 'mejor-del-mundo').length;
    const ideales = state.awards.filter((a) => a.id === 'xv-ideal').length;
    // Los caps pesan por cuarto de punto: en este juego un internacional de
    // carrera entera pasa los cien, y el eje tiene que separar al que llegó del
    // que fue la camiseta. Las copas incluyen las juveniles, por eso pesan poco.
    const seleccionReasons: LegacyReason[] = [
        { text: `${caps} caps con ${unionName(state.player.countryCode)}`, points: Math.min(40, Math.round(caps * 0.25)) },
        { text: `${plural(copasNacionales, 'copa', 'copas')} con la selección`, points: Math.min(16, copasNacionales * 4) },
        { text: `Mejor jugador del mundo ×${mejores}`, points: Math.min(24, mejores * 8) },
        { text: `XV ideal ×${ideales}`, points: Math.min(12, ideales * 3) },
    ];
    if (caps === 0 && state.national.bestTrack !== 'club') {
        seleccionReasons.push({ text: 'Pasaste por los seleccionados de tu unión', points: 8 });
    }

    // ── ©️ Capitanía ─────────────────────────────────────────────────────────
    // La cinta del club es una DECISIÓN (la carta «La cinta»); la de la
    // selección es un hito que se gana. Las dos pesan igual: el rugby no
    // distingue al capitán de un club grande del de la mayor por la camiseta.
    const cintaClub = (state.player.flags[CLUB_CAPTAIN_FLAG] ?? 0) > 0;
    const cintaSeleccion = hasMilestone(state, 'capitan-de-la-seleccion');
    const maxPertenencia = Math.max(0, ...Object.values(state.belonging.byClub));
    const liderazgo = state.player.attrs.liderazgo;
    const capitaniaReasons: LegacyReason[] = [
        { text: 'Te dieron la cinta en tu club', points: cintaClub ? 30 : 0 },
        { text: 'Capitán de la selección', points: cintaSeleccion ? 30 : 0 },
        {
            text: 'El vestuario te siguió: llegaste a Capitán en un club',
            points: ['capitan', 'vitalicio'].includes(belongingTier(maxPertenencia)) ? 15 : 0,
        },
        { text: `Liderazgo ${liderazgo}`, points: Math.max(0, Math.min(25, liderazgo - 55)) },
    ];

    // ── 🏆 Vitrina ──────────────────────────────────────────────────────────
    const copasClub = state.titles.filter((t) => t.kind === 'club').length;
    const vitrinaReasons: LegacyReason[] = [
        // El título de club pesa más que la copa de selección porque la vitrina
        // nacional incluye las juveniles, que se ganan de a varias.
        { text: `${plural(copasClub, 'título', 'títulos')} de club`, points: copasClub * 10 },
        { text: `${plural(copasNacionales, 'copa', 'copas')} con la selección`, points: copasNacionales * 6 },
    ];

    // ── ⏳ Longevidad ──────────────────────────────────────────────────────
    // Se cuenta desde primera: las temporadas juveniles no son carrera larga.
    const enPrimera = seasonsInFirstTeam(state);
    const partidos = state.history.reduce((acc, h) => acc + h.matchesPlayed, 0);
    // Se cuenta lo que pasa de una carrera completa: en este juego doce
    // temporadas en primera y doscientos partidos son lo normal, no lo largo.
    const longevidadReasons: LegacyReason[] = [
        { text: `${plural(enPrimera, 'temporada', 'temporadas')} en primera`, points: Math.min(40, Math.max(0, (enPrimera - 12) * 4)) },
        { text: `${partidos} partidos`, points: Math.min(30, Math.max(0, Math.round((partidos - 200) / 5))) },
    ];
    if (state.player.retired && state.player.age >= 36) {
        longevidadReasons.push({ text: `Jugaste hasta los ${state.player.age}`, points: state.player.age >= 38 ? 15 : 8 });
    }

    const axes = [
        axis('club', clubReasons),
        axis('seleccion', seleccionReasons),
        axis('capitania', capitaniaReasons),
        axis('vitrina', vitrinaReasons),
        axis('longevidad', longevidadReasons),
    ];

    // Empate → gana el que va antes en la lista: el club antes que la
    // selección, que es el orden en que el rugby construye un nombre.
    let main: LegacyAxis | null = null;
    for (const a of axes) if (a.level !== 'ninguno' && (main === null || a.score > main.score)) main = a;

    return { axes, main };
}

/** Primera empieza a los 18 (`FIRST_TEAM_AGE`); lo de antes es juveniles. */
function seasonsInFirstTeam(state: CaptainState): number {
    return state.history.filter((h) => h.age >= 18).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// EL OBJETIVO DE LA CARRERA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LO QUE TE PROPUSISTE AL EMPEZAR.
 *
 * Se elige en el registro y se juzga al retirarte: es la vara contra la que se
 * mide la carrera. El mismo final —doce temporadas en un club, dos títulos—
 * es un objetivo cumplido para el que quería ser ídolo y una deuda para el que
 * quería jugar afuera.
 *
 * Se guarda como bandera en `player.flags` (`objetivo-<id>`), que es un mapa
 * libre que el motor ya persiste —el mismo precedente que la despedida—. Así
 * no se agrega un campo al estado, no sube `schema` y ninguna partida en curso
 * queda inválida. El motor no la lee: el objetivo no cambia los dados, cambia
 * contra qué se mide la carrera.
 */
export type CareerGoalId = 'idolo' | 'titulos' | 'seleccion' | 'exterior' | 'longeva';

export { GOAL_FLAG_PREFIX } from '../../../../features/captain/types/captain.ts';
import { GOAL_FLAG_PREFIX } from '../../../../features/captain/types/captain.ts';

/** Apodos reales de las selecciones que los tienen. El resto se nombra por la unión. */
const NICKNAMES: Record<string, string> = {
    ar: 'Los Pumas',
    uy: 'Los Teros',
    cl: 'Los Cóndores',
    br: 'Los Tupís',
    nz: 'los All Blacks',
    za: 'los Springboks',
    au: 'los Wallabies',
    fj: 'los Flying Fijians',
};

export interface CareerGoal {
    id: CareerGoalId;
    icon: string;
    label: string;
    /** Qué pide y qué resigna. CLAUDE.md §4: el hint dice el costo. */
    hint: string;
}

export function careerGoals(countryCode: string | null): CareerGoal[] {
    const seleccion = countryCode
        ? NICKNAMES[countryCode] ?? `la mayor de ${unionName(countryCode)}`
        : 'tu selección';
    return [
        { id: 'idolo', icon: '🏟️', label: 'Ser ídolo de tu club', hint: 'Llegar a Capitán en un club. Las ofertas de afuera van a tentar.' },
        { id: 'titulos', icon: '🏆', label: 'Ganar títulos', hint: 'Seis títulos. Ir donde se gana, aunque haya que mudarse.' },
        { id: 'seleccion', icon: '🌎', label: `Llegar a ${seleccion}`, hint: 'Veinticinco caps. Se pelean con el nivel y con el rival del puesto.' },
        { id: 'exterior', icon: '✈️', label: 'Jugar en el exterior', hint: 'Cuatro temporadas afuera. La Pertenencia en casa se resiente.' },
        { id: 'longeva', icon: '⏳', label: 'Una carrera larga', hint: 'Diecinueve temporadas en primera. Las conmociones acortan la cuenta.' },
    ];
}

export function goalFlagOf(id: CareerGoalId): string {
    return `${GOAL_FLAG_PREFIX}${id}`;
}

export function goalOf(state: CaptainState): CareerGoal | null {
    const goals = careerGoals(state.player.countryCode);
    return goals.find((g) => (state.player.flags[goalFlagOf(g.id)] ?? 0) > 0) ?? null;
}

/**
 * LAS VARAS. PARÁMETRO LIBRE, medidas contra la premisa de que un objetivo se
 * cumple más o menos en la mitad de las carreras que lo PERSIGUEN y en pocas de
 * las que van para otro lado (`legacy.test.ts`). Los hints de `careerGoals` las
 * nombran: si se mueve una, se mueve su hint.
 */
export const TITLES_GOAL = 6;
export const CAPS_GOAL = 25;
export const ABROAD_GOAL = 4;
export const LONG_GOAL = 19;

export type GoalStatus = 'cumplido' | 'a-medias' | 'pendiente';

export interface GoalProgress {
    goal: CareerGoal;
    status: GoalStatus;
    /** Dónde estás, en una línea: «2 títulos · la meta es 4»… */
    line: string;
}

/**
 * CÓMO VAS. Sirve igual a mitad de carrera —la cabecera lo muestra— que al
 * retirarte, donde `pendiente` pasa a leerse como «no se dio».
 *
 * Las varas son PARÁMETRO LIBRE y están puestas en el idioma del rugby, no del
 * legado: «cuatro títulos», «cuatro temporadas afuera». Un objetivo que se
 * explicara con el puntaje de un eje sería una vara que el jugador no ve.
 */
export function goalProgressOf(state: CaptainState): GoalProgress | null {
    const goal = goalOf(state);
    if (!goal) return null;

    switch (goal.id) {
        case 'idolo': {
            const club = clubOfYourLife(state);
            const tier = belongingTier(club ? state.belonging.byClub[club] ?? 0 : 0);
            const nombre = club ? clubNameOf(state, club) : 'tu club';
            const status: GoalStatus = tier === 'vitalicio' || tier === 'capitan'
                ? 'cumplido'
                : tier === 'referente' ? 'a-medias' : 'pendiente';
            return { goal, status, line: `${BELONGING_LABEL[tier]} en ${nombre} · la meta es Capitán` };
        }
        case 'titulos': {
            const n = state.titles.length;
            return {
                goal,
                status: n >= TITLES_GOAL ? 'cumplido' : n >= 2 ? 'a-medias' : 'pendiente',
                line: `${plural(n, 'título', 'títulos')} · la meta es ${TITLES_GOAL}`,
            };
        }
        case 'seleccion': {
            const caps = state.national.caps;
            return {
                goal,
                status: caps >= CAPS_GOAL ? 'cumplido' : caps >= 1 ? 'a-medias' : 'pendiente',
                line: caps > 0 ? `${caps} caps · la meta es ${CAPS_GOAL}` : 'Todavía sin debut en la mayor',
            };
        }
        case 'exterior': {
            const afuera = seasonsAbroad(state);
            return {
                goal,
                status: afuera >= ABROAD_GOAL ? 'cumplido' : afuera >= 1 ? 'a-medias' : 'pendiente',
                line: `${plural(afuera, 'temporada', 'temporadas')} afuera · la meta es ${ABROAD_GOAL}`,
            };
        }
        case 'longeva': {
            const enPrimera = seasonsInFirstTeam(state);
            return {
                goal,
                status: enPrimera >= LONG_GOAL ? 'cumplido' : enPrimera >= LONG_GOAL - 4 ? 'a-medias' : 'pendiente',
                line: `${plural(enPrimera, 'temporada', 'temporadas')} en primera · la meta es ${LONG_GOAL}`,
            };
        }
    }
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, { live: string; final: string }> = {
    cumplido: { live: 'Cumplido', final: 'Cumplido' },
    'a-medias': { live: 'En camino', final: 'A medias' },
    pendiente: { live: 'Pendiente', final: 'No se dio' },
};

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE TE MARCÓ
// ═══════════════════════════════════════════════════════════════════════════

export interface ChronicleEntry {
    season: number;
    kind: 'hito' | 'decision';
    /** El título de la carta, para las decisiones. `null` en los hitos. */
    title: string | null;
    text: string;
}

/**
 * LA CRÓNICA CORTA: los hitos y las decisiones que no fueron rutina.
 *
 * Una carrera toma treinta y pico de decisiones; listarlas todas convierte el
 * retiro en un acta. Entran las de las cartas que NO son de la banda común
 * —especial, rara, de oro—, que son las que el juego ya marca como momentos, y
 * todos los hitos. El mercado no entra: los pases ya los cuenta la trayectoria,
 * camiseta por camiseta.
 *
 * Orden: por temporada, y dentro de la temporada el hito antes que la decisión
 * (el hito es lo que pasó; la decisión, lo que hiciste con eso). Estable: no
 * depende del orden de inserción de nada que no sea la propia carrera.
 */
export function chronicleOf(state: CaptainState): ChronicleEntry[] {
    const hitos: ChronicleEntry[] = state.milestones.map((m) => ({
        season: m.season,
        kind: 'hito',
        title: null,
        text: m.text,
    }));

    const decisiones: ChronicleEntry[] = [];
    for (const d of state.decisionLog) {
        const evento = getEvent(d.eventId);
        if (!evento || rarityOf(evento) === 'normal' || evento.category === 'mercado') continue;
        decisiones.push({ season: d.season, kind: 'decision', title: evento.title, text: d.text });
    }

    const peso = (e: ChronicleEntry) => (e.kind === 'hito' ? 0 : 1);
    return [...hitos, ...decisiones]
        .map((e, i) => ({ e, i }))
        .sort((a, b) => a.e.season - b.e.season || peso(a.e) - peso(b.e) || a.i - b.i)
        .map(({ e }) => e);
}
