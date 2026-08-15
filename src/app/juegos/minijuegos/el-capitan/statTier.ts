// EL CAPITÁN — EL ESCALAFÓN DE COLOR DE LAS ESTADÍSTICAS.
//
// Un 58 y un 91 se dibujaban con la misma tinta. El número decía todo y no decía
// nada: para saber si 76 de pegada era mucho o poco había que acordarse de la
// escala, y la escala no está escrita en ninguna pantalla. El color la escribe
// sin gastar un renglón — se lee de un vistazo y desde lejos, que es como se
// mira una ficha en el teléfono.
//
// ── Los cortes ───────────────────────────────────────────────────────────────
//   < 60   blanco    · todavía no hay nada que festejar
//   60-74  bronce    · ya sos alguien en tu división
//   75-79  plata     · te mira gente de afuera
//   80-89  oro       · sos de los mejores del país
//   90+    violeta   · élite, y se nota
//
// El tramo 70-75 lo cubre el bronce por decisión: el pedido dejaba ese hueco sin
// escalón y un valor sin color no existe. Estirar el bronce es lo conservador
// —el escalón de abajo nunca infla— contra adelantar la plata cinco puntos.
//
// ── Por qué esto vive en `app/` y no en el motor ─────────────────────────────
// No es una regla del juego: no cambia un resultado, no entra en el `stateHash`
// y no se persiste. Es la voz de la pantalla, igual que `decisionImpact.ts`. El
// motor no tiene por qué enterarse de que hay colores, y por eso este módulo no
// importa nada de `features/captain/**` ni de React: se prueba solo.
//
// ── Por qué devuelve una CLAVE y no una clase ────────────────────────────────
// El CSS module lo resuelve el componente (`styles[statTierClass(v)]`). Si acá
// se importara `capitan.module.css`, el archivo dejaría de poder correr en un
// test de Node —que es exactamente lo que hace `statTier.test.ts`.

/** Los cinco escalones, del más alto al más bajo. */
export type StatTierId = 'elite' | 'oro' | 'plata' | 'bronce' | 'base';

export interface StatTier {
    id: StatTierId;
    /** Desde qué valor manda este escalón (inclusive). */
    min: number;
    labelEs: string;
    /** La clave del CSS module. La resuelve quien pinta, no este módulo. */
    className: string;
}

/**
 * ORDENADOS DE MAYOR A MENOR, y no es cosmético: `statTier` devuelve el PRIMERO
 * que el valor alcanza, así que el orden es la lógica. Al revés, todo caería en
 * `base`.
 */
export const STAT_TIERS: readonly StatTier[] = [
    { id: 'elite', min: 90, labelEs: 'Élite', className: 'tierElite' },
    { id: 'oro', min: 80, labelEs: 'Oro', className: 'tierOro' },
    { id: 'plata', min: 75, labelEs: 'Plata', className: 'tierPlata' },
    { id: 'bronce', min: 60, labelEs: 'Bronce', className: 'tierBronce' },
    { id: 'base', min: 0, labelEs: 'Base', className: 'tierBase' },
];

/** El último de la lista es la red: siempre hay un escalón, nunca `undefined`. */
const BASE = STAT_TIERS[STAT_TIERS.length - 1];

/**
 * En qué escalón cae un valor.
 *
 * Un `NaN` o un negativo caen en `base` por construcción: `NaN >= 0` es falso,
 * así que ninguna comparación acierta y queda la red. Una ficha rota se pinta
 * como una ficha floja, no revienta la pantalla.
 */
export function statTier(value: number): StatTier {
    return STAT_TIERS.find((t) => value >= t.min) ?? BASE;
}

/** Atajo para el lugar donde se usa: `styles[statTierClass(valor)]`. */
export function statTierClass(value: number): string {
    return statTier(value).className;
}
