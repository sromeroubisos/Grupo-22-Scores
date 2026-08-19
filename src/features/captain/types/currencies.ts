// EL CAPITÁN — las cinco monedas.
//
// El Ídolo corre sobre cuatro números: media, idolatría, fama y plata. Acá se
// agrega una, y es la que hace que esto sea rugby y no fútbol con otra pelota:
//
//   🧠🦴 DAÑO   — el reloj real de la carrera. Dos cuentas independientes,
//                 porque la evidencia las separa: la del cuerpo se afloja con
//                 descanso, la de la cabeza no baja nunca.
//
// ── Eran seis, y por qué son cinco ──
// La sexta era ⏳ TIEMPO: seis fichas por temporada para repartir entre el
// laburo, la facultad, el club y la familia. Se fue entera, y no por un problema
// de balance sino de GÉNERO: repartir un presupuesto es contabilidad, y este es
// un juego de decisiones. En su lugar hay una carta de pretemporada —elegís un
// entrenamiento entre cuatro, sube uno o dos atributos— y las otras cuatro vías
// que las fichas alimentaban pasaron a derivarse de lo que hacés en la cancha.
// El catálogo está en `data/trainings.ts` y ahí se explica adónde fue cada una.
//
// Acá viven los TIPOS, los TIERS y las CONSTANTES. La aritmética —el orden en
// que se aplican los techos, la amortiguación, la monotonía de la cabeza— vive
// en `engine/`, porque es la parte que se puede escribir mal.

import type { CaptainStage } from './player.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · MEDIA
// ═══════════════════════════════════════════════════════════════════════════

export const OVR_MIN = 0;
export const OVR_MAX = 99;

// ═══════════════════════════════════════════════════════════════════════════
//  2 · PERTENENCIA — la idolatría del rugby
// ═══════════════════════════════════════════════════════════════════════════
//
// Se mide POR CLUB y no se lleva puesta: si te vas, la del club viejo queda
// guardada donde estaba. Volver la recupera —y eso no es licencia poética, es
// el régimen de pases de la URBA, que exceptúa del cupo al que regresa a su
// club de origen.

export type BelongingTierId = 'plantel' | 'titular' | 'referente' | 'capitan' | 'vitalicio';

export interface BelongingTier {
    id: BelongingTierId;
    /** Piso del escalón. Se entra con `valor >= min`. */
    min: number;
    labelEs: string;
    icon: string;
}

/**
 * De menor a mayor. `engine/belonging.ts` lo recorre al revés para resolver.
 *
 * ═══ LOS ESCALONES SE MIDEN EN TEMPORADAS, NO EN PUNTOS (0.28.0) ═══════════
 *
 * Estaban en 25 / 50 / 75 / 95, y esos números describían una carrera que este
 * juego NO produce. La cuenta, medida sobre 320 carreras:
 *
 *     ritmo real:            4,4 puntos por temporada en el club
 *     paso más largo medido: 4 temporadas  →  ~17 puntos
 *     dónde se retiraba:     98,1% en «Uno del plantel», 0% en «Referente»
 *
 * O sea que el segundo escalón pedía seis temporadas seguidas en el mismo club y
 * el último pedía veintidós. Un jugador con doce temporadas y dos títulos en el
 * mismo club —el caso que destapó esto— terminaba en «Titular», que en la
 * pantalla se lee como que el club no lo quiere.
 *
 * El ritmo NO se tocó: 4,4 por temporada es sano y el comentario de
 * `BELONGING_FORM_WEIGHT` explica por qué subirlo le sacaría peso a los
 * Momentos. Lo que estaba mal calibrado era la regla contra la que se mide.
 *
 * Ahora cada escalón dice cuántas temporadas cuesta, que es la unidad en la que
 * el jugador lo vive. Son ESPEJO de `BELONGING_PER_SEASON` × el factor de forma:
 * si el ritmo se mueve, estos se mueven con él.
 */
export const BELONGING_TIERS: readonly BelongingTier[] = [
    { id: 'plantel', min: 0, labelEs: 'Uno del plantel', icon: '▫️' },
    // ~3 temporadas. El que completó un ciclo corto ya no es uno más.
    { id: 'titular', min: 13, labelEs: 'Titular', icon: '👏' },
    // ~7 temporadas en tu club, ~9 afuera. Media carrera en la misma camiseta, y
    // donde cae el caso del reporte: doce temporadas en Toulon con el descuento
    // del exterior dan ~40.
    { id: 'referente', min: 30, labelEs: 'Referente', icon: '💙' },
    // ~11 temporadas en tu club, ~15 afuera. Que la misma carrera valga un
    // escalón más en casa que en Francia NO es un efecto colateral: es lo que
    // `BELONGING_ABROAD_FACTOR` existe para decir.
    { id: 'capitan', min: 48, labelEs: 'Capitán', icon: '⭐' },
    // ~16 temporadas, y con el amortiguador de los últimos tramos, más. Sigue
    // siendo el final del juego: casi nadie pasa toda su carrera en un club.
    { id: 'vitalicio', min: 70, labelEs: 'Vitalicio', icon: '🗿' },
];

export const BELONGING_MIN = 0;
export const BELONGING_MAX = 100;

/**
 * Sin un solo título con el club, la Pertenencia topea acá.
 * No hay cancha con tu nombre sin haber ganado algo.
 *
 * ESPEJO DE LOS ESCALONES: va entre «Capitán» y «Vitalicio». Sin título llegás a
 * ser el capitán del club y no llegás a que le pongan tu nombre a la cancha. Si
 * `BELONGING_TIERS` se mueve, este número se mueve con él o la invariante se
 * rompe en silencio —con los escalones nuevos y el 80 viejo, un jugador sin un
 * solo título podía terminar Vitalicio—.
 */
export const BELONGING_CAP_NO_TITLES = 60;

/**
 * Si te fuiste al clásico rival, el techo baja acá y no vuelve a subir.
 *
 * ESPEJO DE LOS ESCALONES: justo por debajo de «Referente». El que se fue al
 * rival puede ser Titular y no pasa de ahí, por más que vuelva y gane todo.
 */
export const BELONGING_CAP_RIVAL_JUMP = 29;

/** Desde acá, cada ganancia rinde la mitad: los últimos diez cuestan el doble. */
export const BELONGING_DAMPEN_FROM = 60;
export const BELONGING_DAMPEN_FACTOR = 0.5;

/**
 * En el exterior la Pertenencia rinde menos. La cancha con tu nombre se hace en
 * tu club: ocho años en Francia no la construyen, aunque tampoco la borran.
 *
 * ── ERA 0,5, Y ESTABA CONTANDO DOS VECES LA MISMA REGLA (0.23.0) ────────────
 * «Ocho años en Francia no construyen tu cancha» es una afirmación sobre TU
 * CLUB, y de esa se encarga el congelamiento, que ahora deja quieta la cuenta
 * del club que dejaste mientras dure el contrato. El factor la repetía sobre
 * OTRO ledger —el del club donde estás parado—, donde no dice nada verdadero:
 * la hinchada de Kobe no descuenta a la mitad al que juega ahí porque haya
 * nacido en Buenos Aires.
 *
 * Queda como DESCUENTO y no como mitad: emigrar sigue siendo el camino que menos
 * construye, y eso lo tiene que decir un número. Medido, un tramo profesional
 * pasó de 2,97 a 4,45 puntos por temporada contra 4,74 del amateur en su club, y
 * las dos bandas que vigilan la premisa —`las dos escaleras se pelean de verdad`
 * y `el vitalicio es un final`— se quedaron adentro.
 */
export const BELONGING_ABROAD_FACTOR = 0.75;

// ── CÓMO TE FUE EN EL AÑO, del lado de la hinchada ──────────────────────────
//
// PARÁMETRO LIBRE los tres. La temporada que te quedás vale distinto según cómo
// jugaste: un año de 8,2 construye casi el doble que uno de 5,5. El eje es el
// puntaje de la temporada (`engine/season-rating.ts`), que ya viene normalizado
// por puesto —un pilar de la Tercera puede sacar 8,2—, así que acá no hay que
// volver a normalizar nada.
//
// OJO CON EL TAMAÑO: esto modula SOLO el término de la temporada, que es el más
// chico de los tres. El grueso del rendimiento ya entraba por los Momentos, que
// pagan Pertenencia directamente por jugarlos bien. Subir estos números para
// que "el rendimiento pese" no arregla nada que los Momentos no estén haciendo
// ya, y en cambio le saca peso a quedarse, que es la premisa del juego.

/** Cuánto mueve al multiplicador cada punto de puntaje por encima del pivote. */
export const BELONGING_FORM_WEIGHT = 0.3;

/** Un año malo construye, pero a la mitad. No resta: jugar mal no es irse. */
export const BELONGING_FORM_MIN = 0.5;

/** Un año excepcional vale por dos. */
export const BELONGING_FORM_MAX = 2;

/**
 * Firmar profesional te saca del plantel del club, y por eso pega el doble que
 * un pase cualquiera en el fútbol. No es una penalidad de diseño: el reglamento
 * URBA dice que quien firma contrato profesional no puede jugar competencia
 * organizada por la URBA hasta acreditar la rescisión.
 */
export const BELONGING_PRO_PENALTY = -15;

export interface BelongingLedger {
    /**
     * Pertenencia por club. `Record` de claves dinámicas: cualquier elección
     * que lo recorra ORDENA PRIMERO (CLAUDE.md §1).
     */
    byClub: Record<string, number>;
    /** Mientras tengas contrato profesional, la del club queda quieta. */
    frozen: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · CARTEL — la fama, pero de rugby
// ═══════════════════════════════════════════════════════════════════════════

export const FAME_MIN = 0;
export const FAME_MAX = 100;

// ═══════════════════════════════════════════════════════════════════════════
//  4 · PLATA
// ═══════════════════════════════════════════════════════════════════════════
//
// En dólares, y SOLO existe después de firmar profesional. La puerta no está
// acá: está en `engine/money.ts`, en una función que ignora el delta si la
// etapa es amateur. La invariante tiene que vivir en el código, no en la
// disciplina de quien escriba el próximo evento.

export const MONEY_MIN = 0;

/** Lo que el amateur tiene, toda su etapa amateur. */
export const MONEY_START = 0;

// ═══════════════════════════════════════════════════════════════════════════
//  5 · CABEZA Y CUERPO — el reloj real
// ═══════════════════════════════════════════════════════════════════════════
//
// Por qué son dos y no una: la evidencia las separa. El estudio prospectivo en
// Brain (2025) encontró que la carga de síntomas correlacionó con el NÚMERO DE
// CONMOCIONES, no con la duración de la carrera; el neuropatológico de Glasgow
// encontró que cada año adicional de carrera sube el riesgo un 14%. Dos causas,
// dos horizontes, dos contadores.

export interface DamageLedger {
    /** Conmociones. SUBE Y NO BAJA. Nunca. Lo garantiza `engine/damage.ts`. */
    cabeza: number;
    /** Desgaste físico. Se administra: descanso, kinesiología, aguante. */
    cuerpo: number;
    /** Cuántos HIA diste positivo. Visible desde el primer partido. */
    hia: number;
}

export const HEAD_MAX = 100;
export const BODY_MIN = 0;
export const BODY_MAX = 100;

/** Lo que suma la cabeza por cada HIA positivo. */
export const HEAD_PER_HIA = 12;

// ═══════════════════════════════════════════════════════════════════════════
//  Etapa
// ═══════════════════════════════════════════════════════════════════════════

/** Reexportado para que quien lee las monedas no tenga que ir a buscarlo. */
export type { CaptainStage };
