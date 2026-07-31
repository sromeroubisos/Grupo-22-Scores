// Sistema doméstico (UNIÓN / región) de un club AR/UY/CL. Puro y determinístico.
//
// Cambiar de un sistema a otro es un PASE INTERUNIONES (mudanza / oportunidad),
// nunca "ascender de división": entre sistemas paralelos no hay ascenso
// institucional. Es lo que decide el TEXTO del movimiento.
//
// ── ARGENTINA: LOOKUP EXPLÍCITO, NO REGEX ───────────────────────────────────
//
// Antes la unión se adivinaba con expresiones regulares sobre el NOMBRE del
// torneo ("… de la URBA", "… Tucumano"). Con el sistema real declarado en
// `arSystem2026.ts` la región es un dato del canon, así que se lee de ahí.
//
// No es solo prolijidad. La regex se equivocaba: `/URS\b/` caía en la rama de
// Cuyo, y la URS es la Unión de Rugby del Sur —Bahía Blanca, región Pampeana—,
// así que un pase de Sociedad Sportiva a Los Tordos se leía como "pase amateur,
// misma unión" cuando son dos regiones a 1.100 km. Y `/Interior/` inventaba una
// unión `ar-interior` que no existe: el Torneo del Interior es una competencia
// federal, no una unión, y sus clubes son de cuatro provincias distintas.
//
// Uruguay y Chile siguen con la derivación por nombre porque su catálogo sigue
// siendo un sistema paraguas sin divisiones declaradas.

import type { ClubDef } from '../data/clubs.ts';
import { arRegionOf, isArDivision } from '../data/clubs2026/arSystem2026.ts';
import { isUmbrellaSystem } from './competition-identity.ts';

/** Palabras clave del nombre del torneo → clave de sistema/unión (solo UY/CL). */
const UNION_KEYWORDS: readonly (readonly [RegExp, string])[] = [
    [/Uru|Uruguay/i, 'uy-nacional'],
    [/Chile|Santiago|ARUSA/i, 'cl-nacional'],
];

/**
 * Clave del sistema doméstico (unión/región) del club.
 *
 * · División argentina → su región del canon (`ar-urba`, `ar-centro`, …).
 * · Club de un sistema paraguas (UY/CL) → se deriva del nombre del torneo; si no
 *   se puede resolver, el país entero hace de sistema (no se inventa unión).
 * · Club internacional → su propia competición.
 */
export function domesticSystemKey(club: ClubDef): string {
    if (isArDivision(club.competitionId)) {
        const region = arRegionOf(club.competitionId);
        return region !== null ? `ar-${region}` : club.competitionId;
    }
    if (!isUmbrellaSystem(club.competitionId)) return club.competitionId;
    const name = club.divisionName ?? '';
    for (const [re, key] of UNION_KEYWORDS) {
        if (re.test(name)) return key;
    }
    return club.competitionId;
}

/** ¿Dos clubes pertenecen al mismo sistema doméstico (misma unión/región)? */
export function sameDomesticSystem(a: ClubDef, b: ClubDef): boolean {
    return domesticSystemKey(a) === domesticSystemKey(b);
}
