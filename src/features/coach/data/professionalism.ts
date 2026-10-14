// El estatus económico de cada división: qué cobra un jugador de primera.
//
// El rugby argentino de clubes NO es uno solo. En la base nadie cobra nada: se
// juega por el club, y lo único que el club puede ofrecer para retener a alguien
// es una BECA (estudio, un trabajo conseguido por un socio). En los escalones del
// medio hay VIÁTICOS: transporte y comida, un monto mensual que no es un sueldo y
// no genera pase. Y en la élite de la rama porteña, el Top 14, hay contratos
// SEMIPROFESIONALES con sueldo y duración. La tabla es la 2.1 de
// `docs/el-entrenador-v2.md`, decisión del usuario del 2026-10-14.
//
// Es CATÁLOGO, no lógica: tiene su propia versión (`PROFESSIONALISM_VERSION`) y
// entra en el guardado dentro de `COMPETITION_CATALOG_VERSION`.
//
// ESCALA DE LOS MONTOS. La economía del juego está en la escala de su cuota
// social: `CUOTA_ANUAL` = 60.000 por año, unos 5.000 por mes. Una cuota real de
// un club de la URBA en 2026 ronda los 40.000 a 60.000 por mes, así que el juego
// corre más o menos diez veces por debajo de los pesos de la calle. Los montos de
// abajo están en ESA escala para que el presupuesto cierre con el resto de la
// caja; al lado va lo que equivalen en pesos reales de 2026.

export const PROFESSIONALISM_VERSION = '1.0.0';

export type ProStatus = 'amateur' | 'viaticos' | 'semipro';

/**
 * Las divisiones que no son amateur. Todo lo que no está acá es amateur: es la
 * regla por omisión a propósito, porque una división nueva del canon tiene que
 * arrancar sin sueldos hasta que alguien la clasifique.
 */
const BY_COMPETITION: Readonly<Record<string, ProStatus>> = {
    'ar-urba-top14': 'semipro',
    'ar-urba-primera-a': 'viaticos',
    'ar-urba-primera-b': 'viaticos',
    'ar-centro-top10': 'viaticos',
    'ar-litoral-top10': 'viaticos',
    'ar-oeste-oro': 'viaticos',
    'ar-noa-a': 'viaticos',
    'ar-nea-a': 'viaticos',
    'ar-pampeana-a': 'viaticos',
    'ar-patagonia-regional': 'viaticos',
};

export function statusOf(competitionId: string): ProStatus {
    return BY_COMPETITION[competitionId] ?? 'amateur';
}

export const STATUS_LABEL: Readonly<Record<ProStatus, string>> = {
    amateur: 'Amateur',
    viaticos: 'Viáticos',
    semipro: 'Semiprofesional',
};

/**
 * Montos mensuales de referencia, en la escala del juego.
 *
 * - Beca: 12.500 por mes (≈ 125.000 reales de 2026: una cuota universitaria
 *   privada o medio alquiler compartido). Solo para retener: no a todos.
 * - Viático: 22.000 por mes en un escalón alto (Primera A y B, los Top 10, la
 *   Copa de Oro; ≈ 220.000 reales: nafta, SUBE y comida de cuatro entrenamientos
 *   y un partido por semana) y 16.000 en el escalón regional (NOA A, NEA A,
 *   Pampeano A, Patagónico), donde las distancias son las mismas y el club
 *   recauda menos.
 * - Contrato semiprofesional: de 45.000 a 150.000 por mes (≈ 450.000 a 1,5
 *   millones reales): el suplente que estudia y el titular que vive del rugby
 *   con un trabajo de medio día.
 */
export const PAY_REFERENCE = {
    becaMensual: 12_500,
    /** Por escalón económico de la división (`CompetitionDef.level`). */
    viaticoMensual: { 2: 22_000, 3: 22_000, 4: 16_000, 5: 16_000 } as Readonly<Record<number, number>>,
    contratoMensual: { min: 45_000, max: 150_000 },
} as const;

/**
 * El cuerpo técnico de primera por año: entrenador, ayudantes, preparador
 * físico, analista. En el amateur es un viático para el preparador y poco más;
 * en el semiprofesional es un staff con sueldo. ≈ ×10 en pesos reales.
 */
export const COACHING_STAFF_ANNUAL: Readonly<Record<ProStatus, number>> = {
    amateur: 1_200_000,
    viaticos: 3_000_000,
    semipro: 7_200_000,
};

/** Qué tan seguido un jugador de este estatus nace en el club (antes de la edad). */
export const HOMEGROWN_SHARE: Readonly<Record<ProStatus, number>> = {
    amateur: 0.75,
    viaticos: 0.6,
    semipro: 0.45,
};
