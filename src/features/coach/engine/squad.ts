// El plantel: cómo se genera, cuánto vale y cómo envejece.
//
// LAS DOS ESCALAS. El catálogo mide clubes en escala de pirámide (~4 el más chico,
// ~48 el más grande). El plantel mide jugadores en otra escala. La conversión vive
// acá y en ningún otro lado, es lineal y es INVERTIBLE — sin eso el mismo club
// valdría una cosa al generarle el plantel y otra al enfrentarlo, que es
// exactamente el bug que rugby-manager-pro documenta en argPlayable.js.

import { getCompetition } from '../data/competitions.ts';
import { FIRST_NAMES, SURNAMES } from '../data/names.ts';
import { HOMEGROWN_SHARE, PAY_REFERENCE, statusOf, type ProStatus } from '../data/professionalism.ts';
import type { Personality, PlayerDeal, PlayerStats, PositionGroup, SquadPlayer } from '../types/coach.ts';
import { hashSeed, type Rng } from './random.ts';

const PLAYER_BASE = 20.6;
const PLAYER_SLOPE = 0.92;

/** Rating de club (pirámide) → nivel de jugador. */
export function playerLevelOf(clubRating: number): number {
    return PLAYER_BASE + clubRating * PLAYER_SLOPE;
}

/** Nivel de jugador → rating de club. Es la inversa exacta de la de arriba. */
export function clubRatingOf(playerLevel: number): number {
    return (playerLevel - PLAYER_BASE) / PLAYER_SLOPE;
}

/**
 * La plantilla de 26. Los dorsales son los de verdad: el 1, el 2 y el 3 son la
 * primera línea, el 10 patea, el 9 y el 10 son los medios. El motor lee el
 * dorsal para saber quién es quién — no hay un campo "puesto" aparte que se
 * pueda desincronizar del número.
 */
const SQUAD_TEMPLATE: readonly { group: PositionGroup; number: number }[] = [
    { group: 'primera-linea', number: 1 },
    { group: 'primera-linea', number: 2 },
    { group: 'primera-linea', number: 3 },
    { group: 'segunda-linea', number: 4 },
    { group: 'segunda-linea', number: 5 },
    { group: 'tercera-linea', number: 6 },
    { group: 'tercera-linea', number: 7 },
    { group: 'tercera-linea', number: 8 },
    { group: 'medios', number: 9 },
    { group: 'medios', number: 10 },
    { group: 'fondo', number: 11 },
    { group: 'centros', number: 12 },
    { group: 'centros', number: 13 },
    { group: 'fondo', number: 14 },
    { group: 'fondo', number: 15 },
    // Banco.
    { group: 'primera-linea', number: 16 },
    { group: 'primera-linea', number: 17 },
    { group: 'segunda-linea', number: 18 },
    { group: 'tercera-linea', number: 19 },
    { group: 'medios', number: 20 },
    { group: 'medios', number: 21 },
    { group: 'centros', number: 22 },
    { group: 'fondo', number: 23 },
    // Los tres de afuera del parte: existen y juegan cuando hay lesiones.
    { group: 'primera-linea', number: 24 },
    { group: 'tercera-linea', number: 25 },
    { group: 'centros', number: 26 },
];

export const SQUAD_SIZE = SQUAD_TEMPLATE.length;

/**
 * El tope del plantel, contando a los cedidos: la plantilla de siempre. Vive
 * acá (y `transfers.ts` lo reexporta) para que el M19 (`academy.ts`) y el
 * mercado lo lean sin importarse entre sí.
 */
export const SQUAD_MAX = SQUAD_SIZE;
/**
 * El mínimo de jugadores en el club (sin los cedidos): los 23 de un partido.
 * El motor de la etapa 2 juega con cualquier cantidad (cubre un puesto vacío
 * con otro de la línea o con un pibe de apuro), pero con menos de 23 no hay
 * banco completo, y el reglamento pide primera línea de recambio. Si una salida
 * lo deja por debajo, sube uno del M19.
 */
export const SQUAD_MIN = 23;

/**
 * Cuántos de cada puesto tiene la plantilla de 26. Desde la etapa 3 el plantel
 * cambia de tamaño (se va uno, llega otro): el M19 que completa el plantel sube
 * al puesto que más falta contra esta cuenta (`engine/transfers.ts`).
 */
export const GROUP_TARGET: Readonly<Record<PositionGroup, number>> = SQUAD_TEMPLATE.reduce(
    (acc, slot) => ({ ...acc, [slot.group]: (acc[slot.group] ?? 0) + 1 }),
    {} as Record<PositionGroup, number>,
);

const FORWARD_GROUPS: readonly PositionGroup[] = ['primera-linea', 'segunda-linea', 'tercera-linea'];

export function isForward(group: PositionGroup): boolean {
    return FORWARD_GROUPS.includes(group);
}

/** Los dorsales que ocupan una posición de primera línea en el XV: 1, 2 y 3. */
export function isFrontRowShirt(number: number): boolean {
    return number === 1 || number === 2 || number === 3;
}

/**
 * Arma el plantel de un club. Los titulares salen mejores que el banco: el
 * dorsal ordena, y por eso el 1 al 15 recibe la prima y el resto no.
 *
 * `competitionId` decide lo que cobra cada uno (`data/professionalism.ts`). Sin
 * él, el plantel es amateur.
 *
 * Los sorteos de la etapa 1 (personalidad, formado en el club, arraigo, ánimo y
 * vínculo) van DESPUÉS de los de siempre en cada jugador. Igual corren la
 * secuencia del RNG para el jugador siguiente: un plantel de la 2.0.0 no es el
 * de la 1.4.0 con la misma semilla, y no tiene por qué serlo (no hay digests
 * congelados del plantel; `career.test.ts` mide determinismo con la versión
 * vigente contra sí misma).
 */
export function generateSquad(rng: Rng, clubRating: number, clubId: string, competitionId = ''): SquadPlayer[] {
    const base = playerLevelOf(clubRating);
    const pay = payContext(competitionId);
    return SQUAD_TEMPLATE.map((slot, i) => {
        const starter = slot.number <= 15;
        const age = ageFor(rng, slot.number);
        // ±5 de dispersión, y el titular arranca dos puntos arriba. Un plantel
        // donde los 26 valen lo mismo no tiene ni titular ni suplente.
        const level = clamp(rng.normal(base + (starter ? 2 : -2.5), 5), 12, 88);
        const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
        const potential = round1(potentialFor(rng, level, age));
        const seasonsAtClub = rng.int(1, Math.max(1, Math.min(6, age - 18)));
        const homegrown = rng.chance(Math.min(0.95, HOMEGROWN_SHARE[pay.status] + (age <= 22 ? 0.1 : 0)));
        return {
            id: `${clubId}-p${i}`,
            name,
            group: slot.group,
            number: slot.number,
            age,
            level: round1(level),
            potential,
            // La certificación de primera línea no la tiene todo el que juega ahí:
            // el pibe que recién sube al 24 todavía no la sacó. De ahí sale la
            // tensión de los scrums simulados.
            frontRowCertified: slot.group === 'primera-linea' && slot.number !== 24,
            seasonsAtClub,
            morale: rng.int(55, 72),
            fatigue: 0,
            injury: 0,
            personality: drawPersonality(rng),
            homegrown,
            commitment: clamp(
                Math.round((homegrown ? rng.int(55, 85) : rng.int(30, 65)) + seasonsAtClub * 2),
                0,
                100,
            ),
            deal: initialDeal(rng, pay, slot.number, level - base),
            stats: emptyStats(),
            career: emptyStats(),
        };
    });
}

/* ------------------------------------------------------------------ */
/* Lo que cobra un jugador                                             */
/* ------------------------------------------------------------------ */

export interface PayContext {
    status: ProStatus;
    /** Escalón económico de la división, 2..5. */
    level: number;
}

export function payContext(competitionId: string): PayContext {
    return { status: statusOf(competitionId), level: getCompetition(competitionId)?.level ?? 4 };
}

export function emptyStats(): PlayerStats {
    return { apps: 0, starts: 0, tries: 0, points: 0, tackles: 0, rating: 0 };
}

/** Los vínculos se redondean a 500: nadie cobra 21.837 por mes. */
function roundPay(v: number): number {
    return Math.round(v / 500) * 500;
}

/**
 * El vínculo con el que arranca un jugador.
 *
 * - Amateur: nadie cobra. Un titular claramente mejor que el resto puede tener
 *   una beca, que es lo único que un club amateur ofrece para retener.
 * - Viáticos: los 23 del parte cobran viático; los tres de afuera, nada. El
 *   monto se mueve poco con el nivel: es transporte y comida, no un sueldo.
 * - Semiprofesional: los 23 tienen contrato, el monto escala con el nivel; los
 *   pibes de afuera del parte tienen beca.
 *
 * `levelRel` es el nivel del jugador menos el nivel base del club.
 */
export function initialDeal(rng: Rng, pay: PayContext, number: number, levelRel: number): PlayerDeal {
    if (pay.status === 'amateur') {
        if (number <= 15 && levelRel >= 5 && rng.chance(0.35)) {
            return { kind: 'beca', monthly: roundPay(PAY_REFERENCE.becaMensual * rng.float(0.8, 1.2)), years: 1 };
        }
        return { kind: 'amateur', monthly: 0, years: 0 };
    }
    if (pay.status === 'viaticos') {
        if (number > 23) return { kind: 'amateur', monthly: 0, years: 0 };
        const ref = PAY_REFERENCE.viaticoMensual[pay.level] ?? PAY_REFERENCE.viaticoMensual[4];
        const byLevel = 0.85 + clamp(levelRel, -6, 8) * 0.03;
        return { kind: 'viatico', monthly: roundPay(ref * byLevel * rng.float(0.9, 1.1)), years: rng.int(1, 2) };
    }
    if (number > 23) {
        return { kind: 'beca', monthly: roundPay(PAY_REFERENCE.becaMensual * rng.float(0.8, 1.2)), years: 1 };
    }
    const { min, max } = PAY_REFERENCE.contratoMensual;
    const t = clamp((levelRel + 8) / 18, 0, 1);
    return { kind: 'contrato', monthly: roundPay((min + (max - min) * t) * rng.float(0.9, 1.1)), years: rng.int(1, 3) };
}

/**
 * El vínculo NEUTRO, sin azar: el de referencia para ese dorsal y ese estatus.
 * Es para una partida guardada antes de que existieran los vínculos — el
 * migrador no puede sortear nada sin correr la carrera.
 */
export function neutralDeal(pay: PayContext, number: number): PlayerDeal {
    if (pay.status === 'amateur') return { kind: 'amateur', monthly: 0, years: 0 };
    if (pay.status === 'viaticos') {
        if (number > 23) return { kind: 'amateur', monthly: 0, years: 0 };
        const ref = PAY_REFERENCE.viaticoMensual[pay.level] ?? PAY_REFERENCE.viaticoMensual[4];
        return { kind: 'viatico', monthly: roundPay(ref * 0.85), years: 1 };
    }
    if (number > 23) return { kind: 'beca', monthly: PAY_REFERENCE.becaMensual, years: 1 };
    const { min, max } = PAY_REFERENCE.contratoMensual;
    return { kind: 'contrato', monthly: roundPay((min + max) / 2), years: 1 };
}

/** Lo que el plantel cobra en un año: la suma de los vínculos por doce. */
export function payrollOf(squad: readonly Pick<SquadPlayer, 'deal'>[]): number {
    return squad.reduce((sum, p) => sum + Math.max(0, p.deal?.monthly ?? 0) * 12, 0);
}

const PERSONALITY_WEIGHTS: readonly { id: Personality; weight: number }[] = [
    { id: 'conflictivo', weight: 8 },
    { id: 'leal', weight: 18 },
    { id: 'lider', weight: 10 },
    { id: 'profesional', weight: 22 },
    { id: 'ambicioso', weight: 18 },
    { id: 'tranquilo', weight: 24 },
];

export const PERSONALITIES: readonly Personality[] = PERSONALITY_WEIGHTS.map((p) => p.id);

export function drawPersonality(rng: Rng): Personality {
    return rng.weighted(PERSONALITY_WEIGHTS, (p) => p.weight).id;
}

/** La personalidad de un jugador guardado antes del esquema 6: por hash del id, sin RNG. */
export function personalityByHash(id: string): Personality {
    const total = PERSONALITY_WEIGHTS.reduce((s, p) => s + p.weight, 0);
    let r = hashSeed(`personalidad:${id}`) % total;
    for (const p of PERSONALITY_WEIGHTS) {
        r -= p.weight;
        if (r < 0) return p.id;
    }
    return 'tranquilo';
}

/** Un jugador que subió del M19 (o reemplazó a uno) lleva la temporada en el id. */
const ACADEMY_ID = /-s\d+-[nr]\d+$/;

/**
 * Completa a un jugador guardado antes del esquema 6 con valores neutros y
 * DETERMINISTAS: sin RNG, para que migrar no corra la carrera. Lo que ya tiene
 * se respeta. Formado en el club: el que subió del M19 (su id lo dice) o el que
 * lleva cuatro temporadas o más.
 */
export function completePlayer(p: SquadPlayer, competitionId: string): SquadPlayer {
    const raw = p as Partial<SquadPlayer>;
    const seasonsAtClub = typeof raw.seasonsAtClub === 'number' ? raw.seasonsAtClub : 1;
    const homegrown = typeof raw.homegrown === 'boolean' ? raw.homegrown : ACADEMY_ID.test(p.id) || seasonsAtClub >= 4;
    return {
        ...p,
        seasonsAtClub,
        morale: typeof raw.morale === 'number' ? raw.morale : 60,
        fatigue: typeof raw.fatigue === 'number' ? raw.fatigue : 0,
        injury: typeof raw.injury === 'number' ? raw.injury : 0,
        personality: raw.personality ?? personalityByHash(p.id),
        homegrown,
        commitment:
            typeof raw.commitment === 'number'
                ? raw.commitment
                : clamp(40 + seasonsAtClub * 6 + (homegrown ? 10 : 0), 0, 100),
        deal: raw.deal ?? neutralDeal(payContext(competitionId), p.number),
        stats: raw.stats ?? emptyStats(),
        career: raw.career ?? emptyStats(),
    };
}

/**
 * Lo que vale un jugador en el mercado. DERIVADO, no se guarda: sale del nivel,
 * la edad, el techo y el contrato. `null` donde no existe: en el amateur y en los
 * viáticos no hay pase (doc 2.1 y 2.2: "solo se muestra donde existe de verdad:
 * en el exterior y en `semipro`").
 *
 * Un titular de 60 con 25 años y dos años de contrato vale ~3,6 M, unos tres
 * años de su sueldo: es la proporción de un pase de la URBA a un club del
 * exterior de segunda línea.
 */
export function marketValue(player: SquadPlayer, status: ProStatus): number | null {
    if (status !== 'semipro') return null;
    const over = Math.max(0, player.level - 20);
    const ageFactor = player.age <= 23 ? 1.2 : player.age <= 27 ? 1 : player.age <= 30 ? 0.8 : 0.55;
    const headroom = Math.max(0, player.potential - player.level);
    const contract = player.deal.kind === 'contrato' ? 0.85 + 0.1 * Math.max(0, player.deal.years) : 0.7;
    return Math.round((over * over * 2000 * ageFactor * (1 + headroom * 0.02) * contract) / 50_000) * 50_000;
}

/** Los pibes tienen los dorsales altos; el XV titular está en su mejor edad. */
function ageFor(rng: Rng, number: number): number {
    if (number >= 24) return rng.int(19, 22);
    if (number >= 16) return rng.int(20, 30);
    return rng.int(21, 33);
}

/**
 * Techo. A los 19 todavía hay diez puntos por delante; a los 30 el techo es lo
 * que ya sos. Nunca por debajo del nivel actual: un jugador no tiene un techo
 * más bajo que su presente.
 */
function potentialFor(rng: Rng, level: number, age: number): number {
    const headroom = Math.max(0, (28 - age) * rng.float(0.8, 1.9));
    return clamp(level + headroom, level, 92);
}

/**
 * Cuántos entran al XV por grupo. Es la composición real de un equipo de rugby y
 * no un "los mejores quince": no se puede formar con ocho terceras líneas.
 *
 * De acá sale la escasez de puesto, que es de las cosas más ciertas del deporte
 * y no tiene equivalente en el fútbol. Un lateral se improvisa; un hooker no.
 */
export const XV_SHAPE: Readonly<Record<PositionGroup, number>> = {
    'primera-linea': 3,
    'segunda-linea': 2,
    'tercera-linea': 3,
    medios: 2,
    centros: 2,
    fondo: 3,
};

/** Los quince que juegan: los mejores de cada grupo, en la cantidad que va. */
export function startingXV(squad: readonly SquadPlayer[]): SquadPlayer[] {
    const out: SquadPlayer[] = [];
    for (const group of Object.keys(XV_SHAPE).sort() as PositionGroup[]) {
        const pool = squad
            .filter((p) => p.group === group)
            .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
        out.push(...pool.slice(0, XV_SHAPE[group]));
    }
    return out;
}

/**
 * El rating del EQUIPO, en escala de pirámide, listo para enfrentarlo con el de
 * un rival del catálogo. El pack y la línea, con el pack pesando más: en rugby el
 * que gana la delantera gana el partido.
 *
 * Se compone POR PUESTO y no tomando los ocho forwards de mayor nivel, y la
 * diferencia importa: con "los ocho mejores", mejorarle seis puntos al pilar
 * titular podía no mover una coma —porque el pilar no entraba entre esos ocho— y
 * la tarjeta que prometía un equipo mejor no cambiaba nada. Lo atrapó
 * `career.test.ts`.
 */
export function teamRating(squad: readonly SquadPlayer[]): number {
    return lineupRating(startingXV(squad).map((p) => ({ group: p.group, level: p.level })));
}

/**
 * El rating de un XV ya armado, puesto por puesto. `group` es el del PUESTO que
 * ocupa (un tercera línea que juega de segunda cuenta en el pack con su nivel
 * ya castigado por jugar fuera de puesto). Es la misma cuenta de `teamRating`.
 */
export function lineupRating(xv: readonly { group: PositionGroup; level: number }[]): number {
    const pack = avg(xv.filter((p) => isForward(p.group)).map((p) => p.level));
    const line = avg(xv.filter((p) => !isForward(p.group)).map((p) => p.level));
    return clubRatingOf(pack * 0.55 + line * 0.45);
}

/**
 * El aporte del banco: cuánto mejor (o peor) que los titulares son los tres
 * primeros cambios. Un banco corto no aporta nada y encima cuesta.
 */
export function benchImpact(squad: readonly SquadPlayer[]): number {
    const bench = squad.filter((p) => p.number >= 16 && p.number <= 23).map((p) => p.level).sort(desc);
    const starters = squad.filter((p) => p.number <= 15).map((p) => p.level);
    if (bench.length === 0 || starters.length === 0) return 0;
    return (avg(bench.slice(0, 3)) - avg(starters)) * 0.15;
}

/** ¿Hay reemplazo certificado de primera línea entre los suplentes? */
export function hasFrontRowCover(squad: readonly SquadPlayer[], bancoCorto: boolean): boolean {
    return squad.some(
        (p) => p.frontRowCertified && p.number >= 16 && p.number <= (bancoCorto ? 19 : 23),
    );
}

/**
 * Cierra la temporada sobre el plantel: todos cumplen un año, los jóvenes
 * crecen hacia su techo, los veteranos aflojan, y el que se pasa de rosca cuelga
 * los botines y deja lugar a uno del M19.
 *
 * `formacion` es el atributo del entrenador y `estructura` la del club: los dos
 * multiplican el crecimiento, no lo reemplazan. Un buen formador en un club sin
 * canchas sigue siendo mejor que uno malo, pero no hace milagros.
 */
export function ageSquad(
    rng: Rng,
    squad: readonly SquadPlayer[],
    clubRating: number,
    formacion: number,
    estructura: number,
    clubId: string,
    season: number,
    /**
     * Lo que ponen las mejoras del club: crecimiento extra de los jóvenes
     * (gimnasio) y nivel extra del pibe que sube (entrenador del M19). Cero sin
     * mejoras, que es exactamente el comportamiento de antes.
     */
    club: { growth?: number; academyBonus?: number; competitionId?: string; replaceRetired?: boolean } = {},
): SquadPlayer[] {
    const growthFactor = (0.6 + formacion / 12) * (0.7 + estructura / 160) * (1 + (club.growth ?? 0));
    const academyBonus = club.academyBonus ?? 0;
    const out: SquadPlayer[] = [];

    for (const p of squad) {
        const age = p.age + 1;
        // A los 33 el retiro empieza a ser una posibilidad real y a los 37 es un
        // hecho. No cuelga los botines nadie por sorpresa a los 26.
        const retires = age >= 37 || (age >= 33 && rng.chance((age - 32) * 0.16));
        if (retires) {
            // Desde la etapa 4 el cierre (`run-season.ts`) pide NO reemplazarlo
            // acá: el lugar lo cubre el M19 de verdad (`academy.ts`). Sin la
            // opción, el comportamiento de siempre (lo usan los tests).
            if (club.replaceRetired !== false) {
                out.push(promoteFromAcademy(rng, p, clubRating, clubId, season, academyBonus, club.competitionId ?? ''));
            }
            continue;
        }

        let level = p.level;
        if (age <= 27) {
            level += Math.max(0, p.potential - p.level) * rng.float(0.1, 0.28) * growthFactor;
        } else if (age >= 31) {
            level -= (age - 30) * rng.float(0.5, 1.4);
        } else {
            // La meseta de los 28 a los 30: se mueve poco, para arriba o para abajo.
            level += rng.float(-0.4, 0.8);
        }

        out.push({
            ...p,
            age,
            // EL TECHO MANDA. El ajuste de la meseta es chico pero no mira el
            // potencial, así que a un jugador que ya estaba en su tope lo pasaba
            // por unas décimas. Es el mismo invariante que en Carrera de Rugby y
            // lo mide `career.test.ts`.
            level: round1(clamp(level, 10, p.potential)),
            seasonsAtClub: p.seasonsAtClub + 1,
        });
    }

    return out;
}

/** El que se retira deja su dorsal a un pibe del M19: bajo nivel, techo alto. */
export function promoteFromAcademy(
    rng: Rng,
    slot: Pick<SquadPlayer, 'group' | 'number'>,
    clubRating: number,
    clubId: string,
    season: number,
    bonus = 0,
    competitionId = '',
): SquadPlayer {
    const base = playerLevelOf(clubRating);
    // El bonus va DESPUÉS del sorteo: no consume RNG, así que sin mejora el pibe
    // sale idéntico al de antes.
    const level = clamp(rng.normal(base - 8, 4) + bonus, 10, 70);
    const age = rng.int(19, 21);
    return {
        id: `${clubId}-s${season}-n${slot.number}`,
        name: `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
        group: slot.group,
        number: slot.number,
        age,
        level: round1(level),
        potential: round1(potentialFor(rng, level, age)),
        // Recién subido: todavía no tiene la certificación de primera línea.
        frontRowCertified: false,
        seasonsAtClub: 1,
        ...rookieExtras(rng, competitionId, slot.number, level - base),
    };
}

/**
 * Lo que trae un pibe que sube: formado en el club, con ganas y con el vínculo
 * más bajo de su dorsal. Los sorteos van después de los de siempre.
 */
export function rookieExtras(
    rng: Rng,
    competitionId: string,
    number: number,
    levelRel: number,
): Pick<SquadPlayer, 'morale' | 'fatigue' | 'injury' | 'personality' | 'homegrown' | 'commitment' | 'deal' | 'stats' | 'career'> {
    return {
        morale: rng.int(60, 75),
        fatigue: 0,
        injury: 0,
        personality: drawPersonality(rng),
        homegrown: true,
        commitment: rng.int(60, 85),
        deal: initialDeal(rng, payContext(competitionId), number, Math.min(levelRel, -6)),
        stats: emptyStats(),
        career: emptyStats(),
    };
}

const desc = (a: number, b: number) => b - a;

function avg(xs: readonly number[]): number {
    return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}
