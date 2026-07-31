// EL CATÁLOGO DEL MOTOR, EN INGLÉS.
//
// Acá vive TODO lo que el motor emite como texto y no es un nombre propio: los
// puestos, los hitos, el escalafón de empleo, los movimientos de mercado, los
// arquetipos de retiro, los ejes de una decisión.
//
// La regla de este archivo es una sola y explica su forma: SE TRADUCE POR ID, no
// por texto. Un `Record<CareerArchetypeId, …>` falla en `tsc` si mañana aparece un
// arquetipo nuevo; un `Record<string, string>` indexado por la frase en español
// habría fallado en silencio, mostrando español en la pantalla en inglés. Lo único
// que se indexa por texto son las DISTINCIONES, porque el motor las emite como
// frase (ver `scoring.ts`) y hay un test que vigila que las siete estén.
//
// Los nombres propios NO se traducen y no es una omisión: un club se llama igual
// en los dos idiomas (Toulouse es Toulouse) y una competición también. Traducir
// "URBA Top 12" sería inventar un torneo que no existe.

import type { Position, PositionGroup } from '../types/player.ts';
import type { CareerMilestone, MovementKind } from '../types/career.ts';
import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';
import { ARCHETYPE_LABELS, type CareerArchetypeId } from '../engine/archetypes.ts';
import type { EventCategory } from '../types/event.ts';
import type { ImpactAxis, ChipValue } from '../engine/impact.ts';
import type { DevelopmentProfile } from '../engine/development-profile.ts';
import type { AttributeKey } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import type { Locale } from './locale.ts';
import { COUNTRY_NAMES_EN } from './countries.en.generated.ts';

// ── Puestos ──────────────────────────────────────────────────────────────────

export const POSITION_LABELS_EN: Readonly<Record<Position, string>> = {
    prop: 'Prop',
    hooker: 'Hooker',
    lock: 'Lock',
    backrow: 'Back row',
    scrumhalf: 'Scrum-half',
    flyhalf: 'Fly-half',
    centre: 'Centre',
    wing: 'Wing',
    fullback: 'Fullback',
};

export const POSITION_GROUP_LABELS_EN: Readonly<Record<PositionGroup, string>> = {
    forward: 'Forward',
    back: 'Back',
};

// ── Hitos de trayectoria ─────────────────────────────────────────────────────

export const MILESTONE_LABELS_EN: Readonly<Record<CareerMilestone, string>> = {
    'senior-debut': 'Senior debut',
    'first-compensated': 'First expenses deal',
    'first-semi-professional': 'First semi-pro contract',
    'first-professional': 'First professional contract',
    'first-elite-competition': 'First elite competition',
    'first-call-up': 'First call-up',
    'national-squad': 'Into the senior squad',
    'first-title': 'First title',
    'international-transfer': 'Move abroad',
    'return-home': 'Back home',
};

// ── Escalafón de empleo ──────────────────────────────────────────────────────

export const EMPLOYMENT_LABELS_EN: Readonly<Record<EmploymentStatus, string>> = {
    amateur: 'Amateur',
    'amateur-compensated': 'Expenses',
    'semi-professional': 'Semi-pro',
    'full-time-professional': 'Professional',
};

/** El track de academia gana sobre el vínculo, igual que en `contractLabel`. */
export const SQUAD_TRACK_LABEL_EN = 'Academy';

/**
 * Qué significa cada escalón, en una línea. Es el gemelo de `RUNG_SUMMARY` del
 * componente: el español vive allá, el inglés acá.
 */
export const RUNG_SUMMARY_EN: Readonly<Record<EmploymentStatus, string>> = {
    amateur: 'You work or study. You train when the day allows it.',
    'amateur-compensated': 'The club covers your costs. You still hold a job, but you are no longer out of pocket.',
    'semi-professional': 'Split days: you train properly, though work is still there.',
    'full-time-professional': 'Full-time, with the whole structure behind you.',
};

export const STEP_COPY_EN: Partial<Readonly<Record<EmploymentStatus, string>>> = {
    'amateur-compensated': 'The club starts covering your costs. It is not a wage yet.',
    'semi-professional': 'A part-time deal frees up hours. In exchange, the club wants you available.',
    'full-time-professional': 'Rugby becomes the job. There is no safety net underneath.',
};

// ── Mercado y movimientos ────────────────────────────────────────────────────

export const MOVEMENT_LABELS_EN: Readonly<Record<MovementKind, string>> = {
    stay: 'Stay',
    'amateur-pass': 'Transfer',
    'inter-union-pass': 'Inter-union transfer',
    'international-pass': 'Move abroad',
    'development-invite': 'Academy',
    'semi-pro-agreement': 'Semi-pro deal',
    'professional-contract': 'Professional contract',
};

export const DIRECTION_LABELS_EN: Readonly<Record<'up' | 'down' | 'lateral', string>> = {
    up: 'A step up',
    down: 'A step down',
    lateral: 'Same level',
};

export const ROLE_LABELS_EN: Readonly<Record<'starter' | 'rotation' | 'fringe', string>> = {
    starter: 'starter',
    rotation: 'rotation',
    fringe: 'fringe',
};

/** Etiqueta del lugar en el plantel, para el título de una oferta. */
export const MOVEMENT_OPTION_EN: Readonly<Record<MovementKind, { label: (club: string) => string; hint: string }>> = {
    'amateur-pass': { label: (club) => `Transfer to ${club}`, hint: 'Change of club' },
    'inter-union-pass': { label: (club) => `Move to ${club}`, hint: 'Change of union' },
    'international-pass': { label: (club) => `Move abroad and play for ${club}`, hint: 'Move abroad' },
    'development-invite': { label: (club) => `Join the ${club} academy`, hint: 'Academy place' },
    'semi-pro-agreement': { label: (club) => `Agree terms with ${club}`, hint: 'Semi-professional deal' },
    'professional-contract': { label: (club) => `Sign for ${club}`, hint: 'Professional contract' },
    stay: { label: (club) => `Stay at ${club}`, hint: 'Loyalty and stability.' },
};

export const MOVEMENT_RESULT_EN: Readonly<Record<MovementKind, (club: string) => string>> = {
    'amateur-pass': (club) => `You make the move to ${club}. New club, new team-mates.`,
    'inter-union-pass': (club) => `You make the move to ${club}. New club, new team-mates.`,
    'international-pass': (club) => `You move abroad and start from scratch at ${club}.`,
    'development-invite': (club) => `You join the ${club} academy to fight for a place.`,
    'semi-pro-agreement': (club) => `You agree terms with ${club}.`,
    'professional-contract': (club) => `You sign for ${club}. Clean slate.`,
    stay: (club) => `You stay at ${club}.`,
};

/** Las señales que explican por qué llegó una oferta, en el orden de `offerReason`. */
export const OFFER_REASON_EN = {
    outperformsClub: 'You have been playing above your club’s level',
    starterSeasons: (seasons: number) => `You have started for ${seasons} seasons`,
    homecoming: 'They want you back home',
    pathway: 'They have been tracking you from abroad',
    hot: 'You are in form',
    youngProspect: 'They like your ceiling',
} as const;

// ── Permanencia en el club ───────────────────────────────────────────────────

export const TENURE_TIER_LABELS_EN: Readonly<Record<'referente' | 'idolo', string>> = {
    referente: 'Stalwart',
    idolo: 'Club legend',
};

/** "4th", "1st", "22nd". El español dice "4ª" y no necesita esta cuenta. */
export function ordinalEn(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}

/** Cardinales escritos, para contar temporadas sin que se lean como una cifra. */
export const SPELLED_EN: readonly string[] = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

// ── Arquetipos de retiro ─────────────────────────────────────────────────────

export const ARCHETYPES_EN: Readonly<Record<CareerArchetypeId, { label: string; blurb: string }>> = {
    'campeon-mundo': {
        label: 'World Champion',
        blurb: 'You lifted the cup that comes around once every four years.',
    },
    'salon-fama': {
        label: 'Hall of Fame inductee',
        blurb: 'The game put you among its own, for good.',
    },
    'amateur-internacional': {
        label: 'The amateur who made the Test side',
        blurb: 'You trained after work and pulled on the Test jersey. That happens to almost nobody.',
    },
    'de-la-quinta-al-seleccionado': {
        label: 'From the fifths to the Test side',
        blurb: 'You started with no contract, training after work, and ended up representing your country.',
    },
    'un-club-toda-la-vida': {
        label: 'One club, one lifetime',
        blurb: 'One jersey from start to finish. Every time the phone rang, you said no.',
    },
    'volvio-a-casa': {
        label: 'Came home to finish',
        blurb: 'You went away to chase the career and came back to hang up the boots at the club that raised you.',
    },
    multicampeon: {
        label: 'Serial winner',
        blurb: 'You won everything that was on offer, and more than once.',
    },
    'emblema-seleccion': {
        label: 'Test-match cornerstone',
        blurb: 'Your country called you back season after season.',
    },
    'el-que-llego-tarde': {
        label: 'The late bloomer',
        blurb: 'You signed your first contract when plenty of your age group were retiring. The best was still ahead.',
    },
    'crack-generacion': {
        label: 'One of a generation',
        blurb: 'You were, without argument, one of the best in your position.',
    },
    'hasta-el-ultimo-partido': {
        label: 'Played to the last whistle',
        blurb: 'You lasted to 39, when nobody from your age group was still on a pitch. The years came for you, not the appetite.',
    },
    jerarquia: {
        label: 'A player of real class',
        blurb: 'You were up to it wherever you played.',
    },
    'se-hizo-solo': {
        label: 'Self-made',
        blurb: 'Nobody put you in an academy. You climbed rung by rung until rugby paid the bills.',
    },
    'el-que-estuvo-cerca': {
        label: 'So close to the big time',
        blurb: 'You got as far as half-living off rugby. The big contract never quite arrived.',
    },
    'amateur-de-ley': {
        label: 'Amateur to the core',
        blurb: 'You never took a peso for playing. You never missed a Saturday either.',
    },
    guerrero: {
        label: 'A warrior of a thousand battles',
        blurb: 'You lasted more seasons than most, with your body at the limit.',
    },
    entrega: {
        label: 'A career of pure graft',
        blurb: 'You left everything you had out there every time you came on.',
    },
};

// ── Ejes de una decisión ─────────────────────────────────────────────────────

export const AXIS_LABELS_EN: Readonly<Record<ImpactAxis, string>> = {
    valoracion: 'Rating',
    minutos: 'Game time',
    lesion: 'Injury',
    sancion: 'Ban',
    reputacion: 'Profile',
    seleccion: 'Test rugby',
    animo: 'Morale',
    fisico: 'Body',
    planilla: 'Stat sheet',
    titulo: 'Title',
    puesto: 'Position',
    club: 'Club',
    retiro: 'Career',
};

const CARD_LABELS_EN: Readonly<Record<'amarilla' | 'roja', string>> = {
    amarilla: 'Yellow',
    roja: 'Red',
};

const INJURY_SEVERITY_EN: Readonly<Record<'leve' | 'moderada' | 'grave', string>> = {
    leve: 'Minor',
    moderada: 'Moderate',
    grave: 'Serious',
};

const ARROW_PREFIX_EN: Readonly<Record<Extract<ChipValue, { kind: 'labelled-arrows' }>['of'], string>> = {
    risk: 'Risk',
    tests: 'Tests',
    'title-chance': 'Chance',
    load: 'Load',
};

/** Un signo menos de verdad (U+2212), igual que en español: alinea con los dígitos. */
function signedEn(value: number, decimals: 0 | 1): string {
    return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(decimals)}`;
}

function arrowsOf(steps: number, up: boolean): string {
    return (up ? '↑' : '↓').repeat(steps);
}

/**
 * El valor de una ficha, escrito en inglés desde el descriptor del motor.
 *
 * No parsea el español: lee `ChipValue`, que es el mismo dato del que sale el
 * texto en español. Por eso un caso nuevo rompe el `switch` en compilación en
 * vez de aparecer sin traducir en pantalla.
 */
export function chipValueEn(detail: ChipValue): string {
    switch (detail.kind) {
        case 'signed':
            return signedEn(detail.amount, detail.decimals);
        case 'arrows':
            return arrowsOf(detail.steps, detail.up);
        case 'labelled-arrows':
            return `${ARROW_PREFIX_EN[detail.of]} ${arrowsOf(detail.steps, detail.up)}`;
        case 'injury':
            return INJURY_SEVERITY_EN[detail.severity];
        case 'sanction': {
            const parts: string[] = [];
            if (detail.card) parts.push(CARD_LABELS_EN[detail.card]);
            if (detail.matches > 0) parts.push(`${detail.matches} ${detail.matches === 1 ? 'match' : 'matches'}`);
            return parts.length > 0 ? parts.join(' · ') : 'Citing';
        }
        case 'selection-risk':
            return `Jersey at risk · ${detail.seasons === 1 ? '1 season' : `${detail.seasons} seasons`}`;
        case 'stat':
            return detail.stat === 'tries'
                ? `${signedEn(detail.amount, 0)} ${Math.abs(detail.amount) === 1 ? 'try' : 'tries'}`
                : `${signedEn(detail.amount, 0)} tackles`;
        case 'position':
            return POSITION_LABELS_EN[detail.position];
        case 'club-change':
            return 'Change of club';
        case 'retire':
            return 'You end your career';
    }
}

// ── Categorías de evento ─────────────────────────────────────────────────────

export const EVENT_CATEGORY_EN: Readonly<Record<EventCategory, string>> = {
    club: 'Club',
    injury: 'Injury',
    'national-team': 'Test rugby',
    personal: 'Personal',
    tactical: 'Tactics',
    media: 'Press',
    milestone: 'Milestone',
    discipline: 'Discipline',
};

// ── Distinciones ─────────────────────────────────────────────────────────────

/**
 * Se indexa POR TEXTO y es la única tabla de este archivo que lo hace: el motor
 * emite las distinciones como frase (`scoring.ts`), no como id. `premios.ts` ya
 * hace lo mismo para colgarles el ícono, y hay un test que falla si aparece una
 * distinción que ninguna de las dos tablas conoce.
 */
export const DISTINCTIONS_EN: Readonly<Record<string, string>> = {
    'Campeón del Mundo': 'World Champion',
    'Finalista del Mundial': 'World Cup finalist',
    'Salón de la Fama': 'Hall of Fame',
    'Capitán de la selección': 'Test captain',
    'Mejor jugador del mundo': 'World Player of the Year',
    'XV ideal del año': 'Team of the Year',
    'Mejor de la temporada local': 'Domestic Player of the Season',
};

// ── Perfil de desarrollo y retiro ────────────────────────────────────────────

export const PROFILE_REVEAL_EN: Readonly<Record<DevelopmentProfile, string>> = {
    early: 'Matured early: even as a kid you played like a veteran.',
    normal: 'Grew steadily, season after season.',
    late: 'Matured late: you kept improving past 30.',
};

/**
 * Las cuatro causas de `retirementReason`, indexadas por texto por el mismo
 * motivo que las distinciones: el motor las emite como frase y viajan en
 * `player.retirementReason`, que SÍ se persiste. Traducirlas al renderizar es lo
 * que permite que una partida guardada en español se lea en inglés.
 */
export const RETIREMENT_REASONS_EN: Readonly<Record<string, string>> = {
    'Se retira por el paso de los años': 'Retires with the years finally catching up',
    'Una lesión grave le cortó la carrera': 'A serious injury cut the career short',
    'El cuerpo dijo basta': 'The body had had enough',
    'Se retira en lo más alto, cuando quiso': 'Retires at the top, on their own terms',
};

// ── Planilla ─────────────────────────────────────────────────────────────────

export const ATTRIBUTE_LABELS_EN: Readonly<Record<AttributeKey, string>> = {
    power: 'Power',
    speed: 'Pace',
    technique: 'Technique',
    tackle: 'Tackling',
    kick: 'Kicking',
    vision: 'Vision',
    mental: 'Mentality',
    stamina: 'Stamina',
};

export const STAT_LABELS_EN: Readonly<Record<keyof SeasonStats, string>> = {
    tries: 'Tries',
    tackles: 'Tackles',
    metres: 'Metres',
    assists: 'Try assists',
    lineBreaks: 'Line breaks',
    turnovers: 'Turnovers',
    kicksAtGoal: 'Shots at goal',
    kicksMade: 'Goals',
    lineoutsWon: 'Lineouts',
    metresKicked: 'Kicking metres',
    scrumsWon: 'Scrums',
    conversionsMade: 'Conversions',
    penaltiesMade: 'Penalties',
    dropGoals: 'Drop goals',
    points: 'Points',
};

/**
 * La CUARTA ranura de la planilla. Se indexa por el texto en español porque
 * `secondaryStatLabel` se CONGELA en cada temporada de la trayectoria
 * (`CareerSeasonEntry`): una partida guardada trae la etiqueta en español, y la
 * regla del proyecto es no tocar el estado para arreglar la presentación.
 */
export const SECONDARY_STAT_LABELS_EN: Readonly<Record<string, string>> = {
    Tackles: 'Tackles',
    Metros: 'Metres',
    'Al palo': 'Goal %',
};

// ── Uniones y países ─────────────────────────────────────────────────────────

export { COUNTRY_NAMES_EN };

/** Nombre del país/unión en el idioma pedido. Sin traducción, queda el original. */
export function countryNameIn(code: string | null, fallbackEs: string, locale: Locale): string {
    if (locale === 'es' || code === null) return fallbackEs;
    return COUNTRY_NAMES_EN[code] ?? fallbackEs;
}

// ── Helpers por idioma ───────────────────────────────────────────────────────
//
// Cada uno recibe el valor en español ya resuelto por el motor y lo cambia sólo
// si el idioma es inglés. Es lo que permite que un componente escriba
// `positionLabel(pos, locale)` sin un `if` en cada renglón.

export function positionLabel(position: Position, labelEs: string, locale: Locale): string {
    return locale === 'en' ? POSITION_LABELS_EN[position] : labelEs;
}

export function employmentLabel(status: EmploymentStatus, labelEs: string, locale: Locale): string {
    return locale === 'en' ? EMPLOYMENT_LABELS_EN[status] : labelEs;
}

export function contractLabelIn(employment: EmploymentStatus, track: SquadTrack, labelEs: string, locale: Locale): string {
    if (locale === 'es') return labelEs;
    return track === 'development' ? SQUAD_TRACK_LABEL_EN : EMPLOYMENT_LABELS_EN[employment];
}

export function milestoneLabel(milestone: CareerMilestone, labelEs: string, locale: Locale): string {
    return locale === 'en' ? MILESTONE_LABELS_EN[milestone] : labelEs;
}

export function archetypeIn(id: CareerArchetypeId, labelEs: string, blurbEs: string, locale: Locale): { label: string; blurb: string } {
    return locale === 'en' ? ARCHETYPES_EN[id] : { label: labelEs, blurb: blurbEs };
}

/**
 * Índice inverso de los arquetipos, del español a su id.
 *
 * Es el ÚNICO lugar donde se traduce un arquetipo por texto, y existe por el
 * recibo del token compartido: cuando el motor cambió, del titular sólo queda la
 * frase que se guardó al compartir. Se construye desde `ARCHETYPE_LABELS`, así
 * que no puede desincronizarse de las reglas.
 */
const ARCHETYPE_BY_LABEL_ES: ReadonlyMap<string, CareerArchetypeId> = new Map(
    (Object.entries(ARCHETYPE_LABELS) as [CareerArchetypeId, string][]).map(([id, label]) => [label, id]),
);

export function archetypeLabelIn(labelEs: string, locale: Locale): string {
    if (locale === 'es') return labelEs;
    const id = ARCHETYPE_BY_LABEL_ES.get(labelEs);
    return id === undefined ? labelEs : ARCHETYPES_EN[id].label;
}

export function chipValueIn(detail: ChipValue, valueEs: string, locale: Locale): string {
    return locale === 'en' ? chipValueEn(detail) : valueEs;
}

export function axisLabel(axis: ImpactAxis, labelEs: string, locale: Locale): string {
    return locale === 'en' ? AXIS_LABELS_EN[axis] : labelEs;
}

export function distinctionLabel(labelEs: string, locale: Locale): string {
    return locale === 'en' ? (DISTINCTIONS_EN[labelEs] ?? labelEs) : labelEs;
}

export function retirementReasonIn(reasonEs: string | null, locale: Locale): string | null {
    if (reasonEs === null || locale === 'es') return reasonEs;
    return RETIREMENT_REASONS_EN[reasonEs] ?? reasonEs;
}

export function profileRevealIn(profile: DevelopmentProfile, textEs: string, locale: Locale): string {
    return locale === 'en' ? PROFILE_REVEAL_EN[profile] : textEs;
}

export function secondaryStatLabelIn(labelEs: string, locale: Locale): string {
    return locale === 'en' ? (SECONDARY_STAT_LABELS_EN[labelEs] ?? labelEs) : labelEs;
}

/**
 * Una distinción, en el idioma elegido. Se indexa por el TEXTO en español porque
 * es lo que emite el motor (`scoring.ts`) y lo que queda guardado en la carrera.
 */
export function distinctionIn(labelEs: string, locale: Locale): string {
    return locale === 'en' ? (DISTINCTIONS_EN[labelEs] ?? labelEs) : labelEs;
}

export function tenureTierLabelIn(id: 'referente' | 'idolo', labelEs: string, locale: Locale): string {
    return locale === 'en' ? TENURE_TIER_LABELS_EN[id] : labelEs;
}

export function eventCategoryIn(category: EventCategory, locale: Locale): string {
    if (locale === 'en') return EVENT_CATEGORY_EN[category];
    switch (category) {
        case 'club': return 'Club';
        case 'injury': return 'Lesión';
        case 'national-team': return 'Selección';
        case 'personal': return 'Personal';
        case 'tactical': return 'Táctica';
        case 'media': return 'Prensa';
        case 'milestone': return 'Hito';
        case 'discipline': return 'Disciplina';
        default: return 'Decisión';
    }
}
