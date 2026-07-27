// Sistema doméstico (UNIÓN / región) de un club AR/UY/CL. Puro y determinístico.
//
// El motor agrupa el rugby sudamericano en tres ligas paraguas (sa-ar/uy/cl),
// pero dentro de cada país conviven DECENAS de uniones cuyos torneos son
// PARALELOS: la URBA, Córdoba, Cuyo, el Litoral, el NOA, etc. Cambiar de una a
// otra es un PASE INTERUNIONES (mudanza / oportunidad), nunca "ascender de
// división": no hay ascenso institucional entre sistemas paralelos.
//
// La unión no viene como columna en el snapshot; se deriva del NOMBRE del torneo
// real (`divisionName`), que sí la nombra ("... de la URBA", "... Tucumano").
// Es una derivación versionada y explícita, no un hash.

import type { ClubDef } from '../data/clubs.ts';
import { isUmbrellaSystem } from './competition-identity.ts';

/** Palabras clave del nombre del torneo → clave de sistema/unión. Orden importa. */
const UNION_KEYWORDS: readonly (readonly [RegExp, string])[] = [
    [/URBA/i, 'ar-urba'],
    [/del Centro|Cordob|Súper 9|Super 9/i, 'ar-cordoba'],
    [/Tucuman|Tucumán/i, 'ar-tucuman'],
    [/Norte Grande|NOA|Salt|Juju/i, 'ar-noa'],
    [/Mendoza|Cuyo|del Oeste|URS\b/i, 'ar-cuyo'],
    [/Litoral|Rosario|Santa\s?Fe/i, 'ar-litoral'],
    [/URNE|Nordeste|Corrientes|Chaco|Misiones/i, 'ar-urne'],
    [/Pampeano|Pampa/i, 'ar-pampeana'],
    [/Mar del Plata|Marplatense/i, 'ar-mdp'],
    [/Chubut|Patag[oó]nico|Austral|Comahue|Valle/i, 'ar-patagonia'],
    [/ARUSA|del Sur\b/i, 'ar-sur'],
    [/Interior/i, 'ar-interior'],
    [/Uru|Uruguay/i, 'uy-nacional'],
    [/Chile|Santiago|ARUSA/i, 'cl-nacional'],
];

/**
 * Clave del sistema doméstico (unión/región) del club. Para clubes
 * internacionales es su propia competición. Para AR/UY/CL sale del torneo real;
 * si no se puede resolver la unión, cae al país (sa-ar/uy/cl) como sistema único.
 */
export function domesticSystemKey(club: ClubDef): string {
    if (!isUmbrellaSystem(club.competitionId)) return club.competitionId;
    const name = club.divisionName ?? '';
    for (const [re, key] of UNION_KEYWORDS) {
        if (re.test(name)) return key;
    }
    // Sin unión resoluble: el país entero hace de sistema (no se inventa unión).
    return club.competitionId;
}

/** ¿Dos clubes pertenecen al mismo sistema doméstico (misma unión/región)? */
export function sameDomesticSystem(a: ClubDef, b: ClubDef): boolean {
    return domesticSystemKey(a) === domesticSystemKey(b);
}
