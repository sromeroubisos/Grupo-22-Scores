// EL CAPITÁN — las seis monedas.
//
// El Ídolo corre sobre cuatro números: media, idolatría, fama y plata. Acá son
// seis, y las dos que se agregan son las que hacen que esto sea rugby y no
// fútbol con otra pelota:
//
//   ⏳ TIEMPO   — el recurso escaso del amateur. No hay plata que administrar:
//                 hay seis fichas por temporada y el laburo, la facultad, el
//                 club y la familia te las piden todas.
//   🧠🦴 DAÑO   — el reloj real de la carrera. Dos cuentas independientes,
//                 porque la evidencia las separa: la del cuerpo se afloja con
//                 descanso, la de la cabeza no baja nunca.
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

/** De menor a mayor. `engine/belonging.ts` lo recorre al revés para resolver. */
export const BELONGING_TIERS: readonly BelongingTier[] = [
    { id: 'plantel', min: 0, labelEs: 'Uno del plantel', icon: '▫️' },
    { id: 'titular', min: 25, labelEs: 'Titular', icon: '👏' },
    { id: 'referente', min: 50, labelEs: 'Referente', icon: '💙' },
    { id: 'capitan', min: 75, labelEs: 'Capitán', icon: '⭐' },
    { id: 'vitalicio', min: 95, labelEs: 'Vitalicio', icon: '🗿' },
];

export const BELONGING_MIN = 0;
export const BELONGING_MAX = 100;

/**
 * Sin un solo título con el club, la Pertenencia topea en 80.
 * No hay cancha con tu nombre sin haber ganado algo.
 */
export const BELONGING_CAP_NO_TITLES = 80;

/** Si te fuiste al clásico rival, el techo baja a 49 y no vuelve a subir. */
export const BELONGING_CAP_RIVAL_JUMP = 49;

/** Desde 85 para arriba, cada ganancia rinde la mitad: los últimos quince cuestan. */
export const BELONGING_DAMPEN_FROM = 85;
export const BELONGING_DAMPEN_FACTOR = 0.5;

/**
 * En el exterior la Pertenencia rinde la mitad. La cancha con tu nombre se hace
 * en tu club: ocho años en Francia no la construyen, aunque tampoco la borran.
 */
export const BELONGING_ABROAD_FACTOR = 0.5;

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
//  5 · TIEMPO — seis fichas por temporada
// ═══════════════════════════════════════════════════════════════════════════

export const TIME_TOKENS_PER_SEASON = 6;

export type TimeSlot = 'entrenar' | 'trabajar' | 'club' | 'familia' | 'gimnasio';

/**
 * ORDEN CANÓNICO. Se itera SIEMPRE por acá y nunca por `Object.keys(spent)`:
 * el orden de inserción de un objeto es una fuente de no-determinismo
 * encubierta (CLAUDE.md §1).
 */
export const TIME_SLOTS: readonly TimeSlot[] = ['entrenar', 'trabajar', 'club', 'familia', 'gimnasio'];

export interface TimeSlotDef {
    id: TimeSlot;
    labelEs: string;
    /** Qué te da. Corto, y dice el costo tanto como el beneficio. */
    hint: string;
}

export const TIME_SLOT_DEFS: Record<TimeSlot, TimeSlotDef> = {
    entrenar: { id: 'entrenar', labelEs: 'Entrenar', hint: 'Subís más rápido. Llegás más cansado.' },
    trabajar: { id: 'trabajar', labelEs: 'Trabajar o estudiar', hint: 'Estabilidad. Sin esto, la crisis te saca del rugby.' },
    club: { id: 'club', labelEs: 'El club', hint: 'El asado, los infantiles, el micro. Pertenencia barata.' },
    familia: { id: 'familia', labelEs: 'Familia y descanso', hint: 'Menos desgaste, cabeza fría.' },
    gimnasio: { id: 'gimnasio', labelEs: 'Gimnasio del PlaDAR', hint: 'La puerta al camino representativo. Solo si te convocaron.' },
};

export interface TimeBudget {
    /** Cuántas fichas hay para repartir esta temporada. */
    total: number;
    /** Las cinco ranuras SIEMPRE presentes, en 0 al arrancar. JSON sin sorpresas. */
    spent: Record<TimeSlot, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6 · CABEZA Y CUERPO — el reloj real
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
