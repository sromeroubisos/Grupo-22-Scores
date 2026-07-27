import type { AttributeKey, Attributes, Player, Position } from '../types/player.ts';
import { getPosition } from '../data/positions.ts';
import { getOrigin, ALL_ORIGINS } from '../data/origins.ts';
import { computeEffectiveOvr, computeOvr, clampAttr, ovrExact } from './scoring.ts';
import { marketValue, roleAtClub } from './club-offers.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';
import { employmentCeiling, employmentRank, resolveContract } from './contracts.ts';
import { economicModelOf } from '../data/competition-levels2026.ts';
import type { StartRouteId } from '../types/career.ts';
import { pickInitialClub } from './market-routes.ts';
import { createEligibility } from './eligibility.ts';
import { countryCodeOfNationality, findCountry } from '../data/nations.ts';
import type { Rng } from './random.ts';

// El usuario solo elige posición y nacionalidad. El origen (y con él el primer
// club y la edad de debut) los resuelve el motor por debajo, según la seed.
export interface CreatePlayerInput {
    position: Position;
    /** Contrato que usa la UI: código de país del catálogo (ej. 'ar', 'gb-eng'). */
    nationalityCountryCode?: string;
    /** Alternativa por nombre (compatibilidad y tests). */
    nationality?: string;
    origin?: string; // opcional: si no viene, lo elige el motor
    nickname?: string; // opcional: si no viene, lo genera el motor
    number?: number;
    /** Desde dónde arranca. Si no viene, la ruta más dura (y la histórica). */
    startRoute?: StartRouteId;
}

/**
 * Qué fija cada ruta. Los dos ejes son INDEPENDIENTES: `employment` es el vínculo
 * económico y `squadTrack` es dónde está en el plantel. Un juvenil de academia
 * puede tener mejor vínculo que un semipro de una liga menor, y por eso no se
 * modelan como un único escalón.
 *
 * `ovrBonus` mueve el NIVEL de arranque dentro de la ventana juvenil del puesto:
 * el que entra por la puerta profesional ya es mejor que el que entrena dos veces
 * por semana después del trabajo.
 */
const ROUTE_SETUP: Record<StartRouteId, {
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    ovrBonus: number;
    ageShift: number;
}> = {
    // Trabaja o estudia, entrena cuando puede: debuta más tarde y más abajo.
    amateur: { employment: 'amateur', squadTrack: 'senior', ovrBonus: -3, ageShift: 1 },
    // Entra por la formación: entrena como profesional antes de serlo.
    development: { employment: 'amateur-compensated', squadTrack: 'development', ovrBonus: 0, ageShift: 0 },
    // Contrato desde el arranque: menos épica, más exigencia.
    professional: { employment: 'semi-professional', squadTrack: 'senior', ovrBonus: 3, ageShift: 0 },
};

const ATTR_KEYS: AttributeKey[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'];

// ── Banda de OVR juvenil ─────────────────────────────────────────────────────
// Un prospecto arranca MUY por debajo del profesional consolidado. La ventana
// por posición refleja que un pilar de 18 está más lejos del nivel senior que
// un wing de 18 (el scrum se aprende con años; la velocidad ya está).
export const YOUTH_OVR_MIN = 34;
export const YOUTH_OVR_MAX = 46;

const YOUTH_OVR_WINDOW: Record<Position, [number, number]> = {
    prop: [34, 40],
    lock: [34, 41],
    hooker: [35, 41],
    backrow: [36, 42],
    flyhalf: [37, 44],
    centre: [37, 44],
    scrumhalf: [38, 45],
    fullback: [38, 45],
    wing: [39, 46],
};

// Margen de crecimiento típico hasta el techo. Los puestos que arrancan más
// abajo son los que más recorrido tienen: a los 27 un pilar y un wing valen
// parecido, pero llegaron por caminos distintos.
/**
 * Recorrido de OVR que se le promete al jugador por encima de su nivel inicial.
 *
 * Bajó en 1.9.0 exactamente la `equilibriumHeadroom` de cada puesto. No es un
 * rebalanceo: el objetivo INTERNO de crecimiento sigue valiendo lo mismo que
 * antes (`potential + headroom` = el viejo `potential`), así que los picos
 * logrados quedan donde estaban. Lo que cambió es que el número declarado como
 * techo es ahora el que la carrera alcanza de verdad, en vez de uno 10-15 puntos
 * más alto que nadie tocaba nunca.
 */
const GROWTH_ROOM: Record<Position, number> = {
    prop: 32, // 44 − 12
    lock: 33, // 43 − 10
    hooker: 30, // 42 − 12
    backrow: 30, // 41 − 11
    flyhalf: 27, // 39 − 12
    centre: 24, // 39 − 15
    scrumhalf: 24, // 38 − 14
    fullback: 27, // 38 − 11
    wing: 24, // 37 − 13
};

// Los topes bajaron con GROWTH_ROOM en 1.9.0. Tienen que seguir la misma escala
// que el potencial declarado: un piso de 52 sobre un techo REAL le inventaría un
// potencial inalcanzable justo al jugador flojo, que es a quien menos le sirve.
export const POTENTIAL_MIN = 44;
export const POTENTIAL_MAX = 91;

// Pool de apodos internos (el usuario no elige apodo; el motor asigna uno).
const NICKNAME_POOL = [
    'Mateo', 'Tomás', 'Lucas', 'Benjamín', 'Santino', 'Joaquín', 'Bautista', 'Thiago',
    'Valentín', 'Ramiro', 'Facundo', 'Ignacio', 'Gael', 'Lautaro', 'Dante', 'Bruno',
];

function generateNickname(rng: Rng): string {
    return rng.pick(NICKNAME_POOL);
}

/**
 * Lleva el OVR del prospecto EXACTAMENTE al objetivo desplazando por igual los
 * atributos que puntúan en esa posición. Como esos pesos suman 100, el OVR se
 * mueve lo mismo que el desplazamiento. Los atributos de peso 0 (la patada de
 * un pilar) quedan intactos: no tiene sentido hundirlos.
 * Conserva el PERFIL de la posición: el wing sigue siendo el más rápido.
 */
function shiftToTargetOvr(attributes: Attributes, position: Position, targetOvr: number): void {
    const weights = getPosition(position).weights;
    const shift = targetOvr - ovrExact(attributes, position);
    for (const key of ATTR_KEYS) {
        if (weights[key] > 0) attributes[key] = clampAttr(attributes[key] + shift);
    }
}

export function createPlayer(input: CreatePlayerInput, rng: Rng): Player {
    const pos = getPosition(input.position);
    const startRoute: StartRouteId = input.startRoute ?? 'amateur';
    const setup = ROUTE_SETUP[startRoute];
    // Origen automático por seed cuando no se especifica (flujo simplificado).
    const origin = getOrigin(input.origin ?? rng.pick(ALL_ORIGINS));

    // Atributos = base de posición + sesgo de origen + ruido de "prospecto".
    // Definen el PERFIL; el NIVEL lo fija después la normalización a la banda.
    const attributes = {} as Attributes;
    for (const key of ATTR_KEYS) {
        const base = pos.base[key];
        const mod = origin.attributeMods[key] ?? 0;
        attributes[key] = clampAttr(base + mod + rng.float(-3, 3));
    }

    // Talento juvenil: dónde cae dentro de la ventana de su posición.
    const [lo, hi] = YOUTH_OVR_WINDOW[input.position];
    const talent = rng.normal(0.5, 0.18, 0, 1);
    // La ruta desplaza el NIVEL de arranque, no la ventana del puesto: un wing
    // sigue arrancando por encima de un pilar, venga de donde venga.
    const targetOvr = Math.max(
        YOUTH_OVR_MIN,
        Math.min(YOUTH_OVR_MAX, Math.round(lo + (hi - lo) * talent) + setup.ovrBonus),
    );
    shiftToTargetOvr(attributes, input.position, targetOvr);

    // Potencial OCULTO: techo alcanzable. Correlaciona con el talento juvenil
    // pero no lo determina — un tardío puede explotar y una promesa quedarse.
    const roomFactor = rng.normal(1, 0.22, 0.45, 1.35);
    const potential = Math.max(
        POTENTIAL_MIN,
        Math.min(POTENTIAL_MAX, Math.round(targetOvr + GROWTH_ROOM[input.position] * roomFactor)),
    );

    const number = input.number ?? rng.pick(pos.numbers);
    // La UI manda el CÓDIGO; el nombre queda para mostrar y para compatibilidad.
    const fromCode = input.nationalityCountryCode ? findCountry(input.nationalityCountryCode) : null;
    const nationality = fromCode?.nameEs ?? input.nationality ?? origin.defaultNationality;

    // Primer club por RUTA: nacionalidad → país → escalón de entrada de esa
    // escalera. Nunca un sorteo global por tier (así no aparece un argentino
    // de 18 debutando en Wellington porque cayó ese tier).
    // La ruta ACOTA el universo de clubes por modelo económico; el rng sigue
    // eligiendo el club concreto dentro de ese universo, que es lo que hace que
    // dos carreras de la misma ruta no sean la misma carrera.
    const placement = pickInitialClub(nationality, origin.id, origin.startTier, rng, startRoute);
    const club = placement.club;

    // La UI solo pregunta nacionalidad: el país de nacimiento sale de ahí
    // (8.1(a)) y NO se inventa ascendencia. Una nacionalidad que el motor no
    // modela sigue siendo identidad válida, pero no genera selección ficticia.
    const nationalityCountryCode = fromCode?.code ?? countryCodeOfNationality(nationality);

    const player: Player = {
        nickname: input.nickname ?? generateNickname(rng),
        position: input.position,
        number,
        nationality,
        origin: origin.id,

        age: origin.startAge + setup.ageShift,
        club: club.id,
        league: club.league,
        role: 'fringe',
        nationalTeam: null,

        eligibility: createEligibility(nationalityCountryCode),

        // Vínculo y track iniciales: los resuelve el modelo económico + lo que
        // el jugador vale. Un juvenil en club profesional entra como desarrollo.
        employment: 'amateur',
        squadTrack: 'senior',
        entryMode: 'domestic-senior',
        startRouteModel: 'amateur',
        routeDowngraded: false,
        competitiveBandReached: 0,
        milestonesReached: [],

        attributes,
        potential,
        dynamics: {
            morale: origin.moraleStart,
            form: 50,
            fatigue: 8,
            fame: origin.fameStart,
            injuryRisk: 12,
        },

        caps: 0,
        titles: 0,
        seasonsPlayed: 0,
        injuries: [],
        usedEventIds: [],
        flags: { ...(origin.flags ?? {}) },
        retired: false,
        retirementReason: null,
    };

    // Rol inicial según OVR efectivo vs prestigio del primer club.
    const effective = computeEffectiveOvr(player);
    player.role = roleAtClub(effective, club.prestige);
    const contract = resolveContract({
        club,
        age: player.age,
        value: marketValue(player, effective),
        potential,
        ovr: computeOvr(attributes, input.position),
        role: player.role,
    });
    player.employment = contract.employment;
    player.squadTrack = contract.track;

    // LA RUTA MANDA sobre el contrato derivado: el jugador eligió en qué mundo
    // quiere jugar, y esa elección no puede quedar pisada por el cálculo de
    // valor de mercado. El techo del club sigue siendo un techo real, eso sí:
    // un club amateur no puede sostener un vínculo semiprofesional.
    const ceiling = employmentCeiling(economicModelOf(club));
    player.employment = employmentRank(setup.employment) > employmentRank(ceiling) ? ceiling : setup.employment;
    player.squadTrack = setup.squadTrack;

    // Un migrante a una liga cuyo piso ya es profesional entra por academia:
    // no debuta como senior full-time (regla de países sin liga propia).
    if (placement.entryMode === 'external-development') {
        player.squadTrack = 'development';
    }
    player.entryMode = placement.entryMode;
    player.startRouteModel = placement.resolvedModel;
    player.routeDowngraded = placement.routeDowngraded;

    return player;
}
