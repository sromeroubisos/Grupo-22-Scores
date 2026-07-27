// FUENTE ÚNICA del nivel deportivo y del modelo económico de cada competición.
//
// Antes esta información estaba repartida (y en desacuerdo) entre `clubs.ts`
// (`level`), `market-routes.ts` (`LEVEL_RUNG`) y `rosters2026.ts`
// (`professionalStatus`). Ahora todo se deriva de acá.
//
// TRES EJES DISTINTOS, que antes se usaban como si fueran uno:
//
//   · sportingBand  (0-8) — jerarquía DEPORTIVA global del torneo. Comparable
//     entre países. Es una CALIBRACIÓN DE GAMEPLAY, no un ranking oficial.
//   · economicModel — modelo predominante de la competición. NO define el
//     vínculo de cada jugador: una liga profesional tiene juveniles con
//     contrato de desarrollo.
//   · divisionTier — posición dentro de una escalera doméstica. NO es
//     comparable entre países (la 2ª de la URBA no equivale a la Pro D2).
//
// `rating`, `prestige` y `marketBand` siguen siendo del CLUB, no del torneo.

import type { ClubDef } from './clubs.ts';

export const COMPETITION_LEVELS_VERSION = '2026-27.2';

export type SportingBand = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type EconomicModel = 'amateur' | 'mixed' | 'professional';

export type LevelEvidence =
    | 'official' // estructura y estatus documentados por el organizador
    | 'official-structure-inferred-status' // estructura oficial, estatus económico inferido
    | 'game-calibration'; // decisión de diseño del juego

export interface CompetitionLevelProfile {
    competitionId: string;
    sportingBand: SportingBand;
    economicModel: EconomicModel;
    label: string;
    sourceUrls: readonly string[];
    evidence: LevelEvidence;
    /**
     * Fechas de temporada regular DEL EQUIPO. No son partidos jugados por el
     * jugador: de acá salen los disponibles, y el rol/las lesiones deciden
     * cuántos disputa realmente.
     */
    regularSeasonMatches: number;
    /** Evidencia del calendario, que puede ser peor que la del nivel. */
    matchesEvidence: LevelEvidence;
    /**
     * Solo ligas domésticas AR/UY/CL: la banda sale de la división real que
     * disputa el club, porque `sa-ar` agrupa cuatro categorías distintas.
     */
    bandByDivisionTier?: Readonly<Record<number, SportingBand>>;
}

const EPCR = 'https://www.epcrugby.com/champions-cup/qualification';
const LNR = 'https://www.lnr.fr/';
const PREM = 'https://www.premiershiprugby.com/';
const URC = 'https://www.unitedrugby.com/';
const SUPER = 'https://super.rugby/superrugby/';
const NZR = 'https://www.nzrugby.co.nz/';
const SARU = 'https://www.springboks.rugby/';
const JRLO = 'https://league-one.jp/en/';
const FER = 'https://ferugby.es/';
const SRA = 'https://www.superrugbyamericas.com/';
const REU = 'https://www.rugbyeurope.eu/';
const FFR = 'https://www.ffr.fr/';
const RFU = 'https://www.englandrugby.com/';

// Escalera doméstica AR/UY/CL: la banda depende de la división real.
const SA_BANDS: Readonly<Record<number, SportingBand>> = { 1: 3, 2: 2, 3: 1, 4: 0 };

export const COMPETITION_LEVELS: readonly CompetitionLevelProfile[] = [
    // ── Banda 8 · élite mundial ──────────────────────────────────────────────
    { competitionId: 'top14', sportingBand: 8, economicModel: 'professional', label: 'Top 14', sourceUrls: [LNR, EPCR], evidence: 'official', regularSeasonMatches: 26, matchesEvidence: 'official' },
    { competitionId: 'prem', sportingBand: 8, economicModel: 'professional', label: 'Gallagher PREM', sourceUrls: [PREM, EPCR], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'urc', sportingBand: 8, economicModel: 'professional', label: 'URC', sourceUrls: [URC, EPCR], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official' },
    { competitionId: 'super-rugby', sportingBand: 8, economicModel: 'professional', label: 'Super Rugby Pacific', sourceUrls: [SUPER], evidence: 'official', regularSeasonMatches: 14, matchesEvidence: 'game-calibration' },

    // ── Banda 7 ──────────────────────────────────────────────────────────────
    { competitionId: 'jpn-d1', sportingBand: 7, economicModel: 'professional', label: 'Japan Rugby League One D1', sourceUrls: [JRLO], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official' },

    // ── Banda 6 · segunda línea profesional ──────────────────────────────────
    { competitionId: 'prod2', sportingBand: 6, economicModel: 'professional', label: 'Pro D2', sourceUrls: [LNR], evidence: 'official', regularSeasonMatches: 30, matchesEvidence: 'official' },
    { competitionId: 'championship', sportingBand: 6, economicModel: 'professional', label: 'Champ Rugby', sourceUrls: [PREM], evidence: 'official-structure-inferred-status', regularSeasonMatches: 26, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'npc', sportingBand: 6, economicModel: 'professional', label: 'NPC', sourceUrls: [NZR], evidence: 'official', regularSeasonMatches: 10, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'currie-premier', sportingBand: 6, economicModel: 'mixed', label: 'Currie Cup Premier', sourceUrls: [SARU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'jpn-d2', sportingBand: 6, economicModel: 'mixed', label: 'Japan Rugby League One D2', sourceUrls: [JRLO], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official' },

    // ── Banda 5 · profesional/regional ───────────────────────────────────────
    { competitionId: 'nationale', sportingBand: 5, economicModel: 'mixed', label: 'Nationale', sourceUrls: [FFR], evidence: 'official-structure-inferred-status', regularSeasonMatches: 26, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'sra', sportingBand: 5, economicModel: 'professional', label: 'Super Rugby Americas', sourceUrls: [SRA], evidence: 'official', regularSeasonMatches: 14, matchesEvidence: 'game-calibration' },
    { competitionId: 'super-cup', sportingBand: 5, economicModel: 'mixed', label: 'Rugby Europe Super Cup', sourceUrls: [REU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 8, matchesEvidence: 'game-calibration' },

    // ── Banda 4 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dh', sportingBand: 4, economicModel: 'mixed', label: 'División de Honor', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'currie-first', sportingBand: 4, economicModel: 'mixed', label: 'Currie Cup First Division', sourceUrls: [SARU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 10, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'jpn-d3', sportingBand: 4, economicModel: 'mixed', label: 'Japan Rugby League One D3', sourceUrls: [JRLO], evidence: 'official-structure-inferred-status', regularSeasonMatches: 12, matchesEvidence: 'official' },

    // ── Banda 3 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dhelite', sportingBand: 3, economicModel: 'mixed', label: 'División de Honor Élite', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },

    // ── Banda 2 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dhb', sportingBand: 2, economicModel: 'amateur', label: 'División de Honor B', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official-structure-inferred-status' },
    // Tercer escalón francés e inglés: estructura oficial, plantel amateur con
    // algún jugador compensado. Es el techo REALISTA de una carrera amateur.
    { competitionId: 'fr-federale1', sportingBand: 2, economicModel: 'amateur', label: 'Fédérale 1', sourceUrls: [FFR], evidence: 'game-calibration', regularSeasonMatches: 18, matchesEvidence: 'game-calibration' },
    { competitionId: 'eng-national1', sportingBand: 2, economicModel: 'amateur', label: 'National League 1', sourceUrls: [RFU], evidence: 'game-calibration', regularSeasonMatches: 26, matchesEvidence: 'game-calibration' },

    // ── Banda 1 · el piso amateur de cada pirámide ───────────────────────────
    // Sin estos escalones, elegir la ruta AMATEUR en Francia, Inglaterra, Nueva
    // Zelanda, Sudáfrica o Japón degradaba a un club profesional: el catálogo se
    // cortaba por arriba y no había dónde empezar de abajo.
    //
    // Evidencia 'game-calibration': las competiciones son reales y su lugar en
    // la pirámide es oficial, pero los rosters cargados son REPRESENTATIVOS —
    // no la lista publicada de la temporada. Se documenta en vez de disfrazarlo.
    { competitionId: 'fr-federale2', sportingBand: 1, economicModel: 'amateur', label: 'Fédérale 2', sourceUrls: [FFR], evidence: 'game-calibration', regularSeasonMatches: 18, matchesEvidence: 'game-calibration' },
    { competitionId: 'eng-national2', sportingBand: 1, economicModel: 'amateur', label: 'National League 2', sourceUrls: [RFU], evidence: 'game-calibration', regularSeasonMatches: 26, matchesEvidence: 'game-calibration' },
    { competitionId: 'nz-heartland', sportingBand: 1, economicModel: 'amateur', label: 'Heartland Championship', sourceUrls: [NZR], evidence: 'game-calibration', regularSeasonMatches: 8, matchesEvidence: 'game-calibration' },
    { competitionId: 'za-community', sportingBand: 1, economicModel: 'amateur', label: 'Community Cup', sourceUrls: [SARU], evidence: 'game-calibration', regularSeasonMatches: 10, matchesEvidence: 'game-calibration' },
    { competitionId: 'jpn-regional', sportingBand: 1, economicModel: 'amateur', label: 'Ligas regionales japonesas', sourceUrls: [JRLO], evidence: 'game-calibration', regularSeasonMatches: 10, matchesEvidence: 'game-calibration' },

    // ── Ligas domésticas AR/UY/CL · banda por división ───────────────────────
    // Argentina: el rugby de clubes es amateur por regulación de la UAR.
    {
        competitionId: 'sa-ar', sportingBand: 2, economicModel: 'amateur', label: 'Rugby doméstico argentino',
        sourceUrls: ['https://www.uar.com.ar/'], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'game-calibration', bandByDivisionTier: SA_BANDS,
    },
    // Uruguay y Chile: INFERENCIA VERSIONADA. No se encontró un marco oficial
    // que declare un estatus profesional para el rugby doméstico de clubes;
    // se modela amateur hasta tener una fuente que diga otra cosa. Las
    // franquicias de Super Rugby Americas (Peñarol, Selknam) NO entran acá:
    // tienen su propia competición y son profesionales.
    {
        competitionId: 'sa-uy', sportingBand: 2, economicModel: 'amateur', label: 'Rugby doméstico uruguayo',
        sourceUrls: ['https://www.uru.rugby/'], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'game-calibration', bandByDivisionTier: SA_BANDS,
    },
    {
        competitionId: 'sa-cl', sportingBand: 2, economicModel: 'amateur', label: 'Rugby doméstico chileno',
        sourceUrls: ['https://www.chilerugby.cl/'], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'game-calibration', bandByDivisionTier: SA_BANDS,
    },
];

const BY_ID = new Map(COMPETITION_LEVELS.map((p) => [p.competitionId, p]));

export function levelProfileOf(competitionId: string): CompetitionLevelProfile | null {
    return BY_ID.get(competitionId) ?? null;
}

/** Banda deportiva del CLUB: usa su división real cuando la competición la tiene. */
export function sportingBandOf(club: ClubDef): SportingBand {
    const profile = BY_ID.get(club.competitionId);
    if (!profile) return 0;
    if (profile.bandByDivisionTier) {
        const tier = club.divisionTier ?? 3;
        return profile.bandByDivisionTier[Math.min(4, Math.max(1, tier))] ?? profile.sportingBand;
    }
    return profile.sportingBand;
}

export function economicModelOf(club: ClubDef): EconomicModel {
    return BY_ID.get(club.competitionId)?.economicModel ?? 'amateur';
}

/** Fechas de temporada regular del EQUIPO en esa competición. */
export function regularSeasonMatchesOf(competitionId: string): number {
    return BY_ID.get(competitionId)?.regularSeasonMatches ?? 16;
}

export function competitionLabelOf(competitionId: string): string {
    return BY_ID.get(competitionId)?.label ?? competitionId;
}

/** Ids con perfil declarado. Los tests exigen que cubra todo destino posible. */
export function profiledCompetitionIds(): string[] {
    return [...BY_ID.keys()].sort();
}
