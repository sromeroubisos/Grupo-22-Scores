// Construye los `ClubDef` argentinos desde el canon (`arSystem2026.ts`),
// heredando del snapshot real lo que el canon no puede saber: el `sourceId` con
// el que se pide el ESCUDO.
//
// Por qué existe este archivo separado del canon: el canon es datos puros y no
// debe depender de una foto de Supabase. Acá vive el cruce, que sí depende, y
// además REPORTA lo que no pudo resolver en vez de taparlo — un club nuevo sin
// escudo es aceptable y está declarado; un club existente que perdió el escudo
// porque el nombre no matcheó, no.

import type { ClubDef } from '../clubs.ts';
import { CATALOG_SEASON } from './rosters2026.ts';
import { SA_CLUBS } from './saClubs.generated.ts';
import type { ArDivision } from './arSystem2026.ts';
import {
    AR_DIVISIONS,
    AR_SNAPSHOT_ALIAS,
    AR_SNAPSHOT_UNPLACED,
    arPrestigeOf,
    arRatingAt,
} from './arSystem2026.ts';

/** Palabras de relleno que no distinguen a un club de otro. */
const NOISE = new Set([
    'club', 'rugby', 'rc', 'crc', 'sc', 'cs', 'ca', 'asoc', 'asociacion',
    'de', 'del', 'la', 'el', 'los', 'las',
]);

/**
 * Nombre normalizado para cruzar canon con catálogo real. Se caen los acentos,
 * la puntuación, las palabras de relleno y los tokens de UNA letra — que es lo
 * que convierte "Argentino R.C." en "argentino".
 */
export function normalizeArName(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1 && !NOISE.has(word))
        .join('');
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Sigla del club para espacios chicos. Descarta las palabras de relleno. */
function shortNameOf(name: string): string {
    const words = name
        .split(/[^A-Za-zÀ-ÿ0-9]+/)
        .filter((w) => w.length > 0 && !/^(de|del|la|el|los|las|y|xv|rc|cs|sc|ca)$/i.test(w));
    if (words.length >= 2) return words.slice(0, 4).map((w) => w[0].toUpperCase()).join('');
    const compact = name.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
    return compact.slice(0, 3).toUpperCase();
}

export interface ArCatalogReport {
    clubs: ClubDef[];
    /** Clubes del canon que encontraron su fila real y conservan el escudo. */
    matched: number;
    /** Clubes del canon que no existen en el catálogo real (sin escudo, declarado). */
    created: string[];
    /** Filas reales AR que ninguna división del canon reclamó. */
    unclaimed: string[];
    /** Alias que apunta a un nombre que ya no existe en el snapshot. */
    brokenAliases: string[];
    /** Un nombre del canon que normaliza igual que dos filas reales distintas. */
    ambiguous: string[];
}

function clubFrom(
    division: ArDivision,
    name: string,
    index: number,
    real: ClubDef | null,
): ClubDef {
    const rating = arRatingAt(division, index);
    return {
        // El id de un club que ya existía NO cambia: es la clave con la que se
        // pide el escudo y con la que quedó escrito en partidas y comparativas.
        id: real ? real.id : `ar-${slugify(name)}`,
        labelEs: name,
        league: division.competitionId,
        prestige: arPrestigeOf(division, name, index),
        name,
        shortName: shortNameOf(name),
        countryCode: 'ar',
        region: 'south-america',
        competitionId: division.competitionId,
        level: 'amateur',
        rating,
        // El rugby de clubes argentino no tiene estructura profesional detrás:
        // banda de mercado 1 para todos, del Top 14 al último local.
        marketBand: 1,
        professionalStatus: 'amateur',
        source: 'canon-ar',
        sourceId: real ? real.sourceId : null,
        seasonVersion: CATALOG_SEASON,
        divisionName: division.label,
        divisionTier: division.canonLevel,
    };
}

function buildArCatalog(): ArCatalogReport {
    const realAr = SA_CLUBS.filter((c) => c.countryCode === 'ar');
    const byExactName = new Map(realAr.map((c) => [c.name, c]));

    const byNormalized = new Map<string, ClubDef[]>();
    for (const club of realAr) {
        const key = normalizeArName(club.name);
        const list = byNormalized.get(key) ?? [];
        list.push(club);
        byNormalized.set(key, list);
    }

    const clubs: ClubDef[] = [];
    const created: string[] = [];
    const brokenAliases: string[] = [];
    const ambiguous: string[] = [];
    const claimed = new Set<string>();
    const usedIds = new Set<string>();
    let matched = 0;

    for (const division of AR_DIVISIONS) {
        division.clubs.forEach((name, index) => {
            let real: ClubDef | null = null;
            const alias = AR_SNAPSHOT_ALIAS[name];

            if (alias !== undefined) {
                real = byExactName.get(alias) ?? null;
                if (real === null) brokenAliases.push(`${name} → ${alias}`);
            } else {
                const hits = byNormalized.get(normalizeArName(name)) ?? [];
                // Dos filas con el mismo nombre normalizado son dos clubes
                // distintos: sin alias no se elige por sorteo, se reporta.
                if (hits.length > 1) ambiguous.push(name);
                else if (hits.length === 1) real = hits[0];
            }

            if (real) {
                matched++;
                claimed.add(real.id);
            } else {
                created.push(name);
            }

            const club = clubFrom(division, name, index, real);
            if (usedIds.has(club.id)) {
                // Id repetido = bug de datos. Se reporta como ambigüedad en vez
                // de renombrar en silencio y dejar dos clubes indistinguibles.
                ambiguous.push(`${name} (id repetido: ${club.id})`);
                return;
            }
            usedIds.add(club.id);
            clubs.push(club);
        });
    }

    const expectedUnplaced = new Set(AR_SNAPSHOT_UNPLACED);
    const unclaimed = realAr
        .filter((c) => !claimed.has(c.id) && !expectedUnplaced.has(c.name))
        .map((c) => c.name)
        .sort();

    return {
        // Orden estable por id: el orden del catálogo no puede depender del
        // recorrido de las divisiones (CLAUDE.md §1).
        clubs: clubs.sort((a, b) => a.id.localeCompare(b.id)),
        matched,
        created: created.sort(),
        unclaimed,
        brokenAliases: brokenAliases.sort(),
        ambiguous: ambiguous.sort(),
    };
}

export const AR_CATALOG: ArCatalogReport = buildArCatalog();

/** Los clubes argentinos del motor, ya resueltos. */
export const AR_CLUBS: ClubDef[] = AR_CATALOG.clubs;
