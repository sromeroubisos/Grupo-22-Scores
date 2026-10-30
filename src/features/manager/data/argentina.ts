// Las ligas de G22 en el mundo de Rugby Manager: el sistema argentino completo
// (28 divisiones, 264 clubes) y Uruguay y Chile.
//
// Acá no se declara ningún club ni ninguna división: se LEEN.
//   · Argentina sale del canon `career/data/clubs2026/arSystem2026.ts`, el mismo
//     que usan Carrera de Rugby y El Entrenador; los colores y la ciudad, de
//     `coach/data/club-meta.generated.ts`.
//   · Uruguay y Chile salen del snapshot congelado de la base (`saClubs`).
//   · El escudo es el archivo real de `public/clubs/` cuando existe.
//
// Lo único propio de este archivo es la TRADUCCIÓN al formato del motor
// (`LeagueData`) y el grafo de ascensos y descensos como pirámides de dos niveles.
import {
    AR_DIVISIONS, AR_RATING_MAX, AR_RATING_MIN, arRatingAt, type ArDivision,
} from '../../career/data/clubs2026/arSystem2026.ts';
import { SA_CLUBS } from '../../career/data/clubs2026/saClubs.generated.ts';
import { CLUB_META } from '../../coach/data/club-meta.generated.ts';
import type { Pyramid } from '../types/index.ts';
import { colorsFor, crestPathForId } from './crests.ts';
import type { ClubData, LeagueData } from './leagues.ts';

/** Versión del contenido de este archivo; sube con el canon. Entra en el catálogo del guardado. */
export const ARGENTINA_CATALOG_VERSION = 'ar-2026.3+sa-1';

const STOP = /^(de|del|la|el|los|las|y|club|rugby|rc|r\.c\.)$/i;

/** Las iniciales del nombre oficial: "Universitario de La Plata" → "ULP". */
export function codeOf(name: string): string {
    const words = name.split(/[\s.]+/).filter((w) => w.length > 0 && !STOP.test(w));
    if (words.length >= 2) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
    return (words[0] ?? name).replace(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase();
}

const REP_MIN = 22;
const REP_SPAN = 48;

/** Fuerza de la escala amateur (24..52) → reputación del motor (22..70). */
function reputationOf(rating: number, min: number, max: number): number {
    const t = Math.min(1, Math.max(0, (rating - min) / (max - min)));
    return Math.round(REP_MIN + t * REP_SPAN);
}

/** Nivel del canon → `tier` del motor. Ligas de club por encima de 1 son semi-pro en la simulación. */
function tierOf(canonLevel: number): 2 | 3 | 4 {
    return canonLevel <= 2 ? 2 : canonLevel <= 5 ? 3 : 4;
}

const SOUTH_SEASON = { startMonth: 3, startDay: 7, northOrSouth: 'south' } as const;

function argentineLeague(division: ArDivision): LeagueData {
    const clubs: ClubData[] = division.clubs.map((name, index) => {
        const meta = CLUB_META[name];
        if (!meta) throw new Error(`"${name}" está en el canon y no en club-meta: corré scripts/build-coach-canon-meta.ts`);
        return {
            name,
            shortName: codeOf(name),
            city: meta.city || 'Argentina',
            baseReputation: reputationOf(arRatingAt(division, index), AR_RATING_MIN, AR_RATING_MAX),
            catalogId: meta.id,
            crest: crestPathForId(meta.id),
            primaryColor: meta.c1,
            secondaryColor: meta.c2,
        };
    });
    return {
        name: division.label,
        shortName: division.label,
        countryCode: 'ARG',
        countryName: 'Argentina',
        region: 'south_america',
        tier: tierOf(division.canonLevel),
        federationName: 'Unión Argentina de Rugby',
        salaryCap: null,
        ...SOUTH_SEASON,
        sharedCountry: true,
        hasPlayoff: division.canonLevel === 1,
        playoffTeams: division.canonLevel === 1 ? 4 : 0,
        clubs,
    };
}

export const AR_LEAGUES: LeagueData[] = AR_DIVISIONS.map(argentineLeague);

// ── Uruguay y Chile ─────────────────────────────────────────────────────────

interface SouthAmericanSpec {
    key: string;
    name: string;
    countryCode: 'URU' | 'CHI';
    countryName: string;
    federationName: string;
    tier: 2 | 3;
    pick: (c: (typeof SA_CLUBS)[number]) => boolean;
}

const SOUTH_AMERICAN_SPECS: SouthAmericanSpec[] = [
    {
        key: 'uy', name: 'Súper Uruguayo de Clubes', countryCode: 'URU', countryName: 'Uruguay',
        federationName: 'Unión de Rugby del Uruguay', tier: 2,
        pick: (c) => c.countryCode === 'uy',
    },
    {
        key: 'cl-primera', name: 'Primera División de ARUSA', countryCode: 'CHI', countryName: 'Chile',
        federationName: 'Federación de Rugby de Chile', tier: 2,
        pick: (c) => c.countryCode === 'cl' && !c.divisionName,
    },
    {
        key: 'cl-segunda', name: 'Segunda División de ARUSA', countryCode: 'CHI', countryName: 'Chile',
        federationName: 'Federación de Rugby de Chile', tier: 3,
        pick: (c) => c.countryCode === 'cl' && !!c.divisionName,
    },
];

function southAmericanLeague(spec: SouthAmericanSpec): LeagueData {
    const clubs: ClubData[] = SA_CLUBS
        .filter(spec.pick)
        .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
        .map((c) => {
            const colors = colorsFor(c.name);
            return {
                name: c.name,
                shortName: codeOf(c.name),
                city: spec.countryName,
                baseReputation: reputationOf(c.rating, AR_RATING_MIN, AR_RATING_MAX),
                catalogId: c.id,
                crest: crestPathForId(c.id),
                primaryColor: colors.primary,
                secondaryColor: colors.secondary,
            };
        });
    return {
        name: spec.name,
        shortName: spec.name,
        countryCode: spec.countryCode,
        countryName: spec.countryName,
        region: 'south_america',
        tier: spec.tier,
        federationName: spec.federationName,
        salaryCap: null,
        ...SOUTH_SEASON,
        sharedCountry: true,
        hasPlayoff: false,
        playoffTeams: 0,
        clubs,
    };
}

export const SOUTH_AMERICA_LEAGUES: LeagueData[] = SOUTH_AMERICAN_SPECS.map(southAmericanLeague);

// ── Ascensos y descensos ────────────────────────────────────────────────────

/**
 * Una pirámide de DOS niveles por cada `relegatesTo` del canon. No se encadenan en
 * una sola porque el grafo del canon es un árbol (varias divisiones suben a la
 * misma) y una pirámide es una lista. El motor calcula las tablas de todos los
 * pares sobre la temporada que terminó y después mueve los clubes, así que los
 * pares no se pisan entre sí.
 */
export const ARGENTINA_PYRAMIDS: Pyramid[] = (() => {
    const byId = new Map(AR_DIVISIONS.map((d) => [d.competitionId, d]));
    const out: Pyramid[] = [];
    for (const top of AR_DIVISIONS) {
        const bottom = top.relegatesTo ? byId.get(top.relegatesTo) : undefined;
        if (!bottom) continue;
        out.push({
            id: `pyr-${top.competitionId}`,
            name: `${top.label} ↔ ${bottom.label}`,
            confederationId: 'sudamerica_rugby',
            gender: 'men',
            ageCategory: 'senior',
            levels: [
                { competitionShortName: top.label, promotionSlots: top.promotionSlots ?? 0, relegationSlots: top.relegationSlots ?? 0 },
                { competitionShortName: bottom.label, promotionSlots: bottom.promotionSlots ?? 0, relegationSlots: bottom.relegationSlots ?? 0 },
            ],
        });
    }
    out.push({
        id: 'pyr-cl',
        name: 'Primera ↔ Segunda de ARUSA',
        confederationId: 'sudamerica_rugby',
        gender: 'men',
        ageCategory: 'senior',
        levels: [
            { competitionShortName: 'Primera División de ARUSA', promotionSlots: 0, relegationSlots: 1 },
            { competitionShortName: 'Segunda División de ARUSA', promotionSlots: 1, relegationSlots: 0 },
        ],
    });
    return out;
})();
