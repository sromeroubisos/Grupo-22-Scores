// Las mejoras del club. Es la tienda de El Interino traducida al rugby de club:
// allá la dirigencia habilita una partida para mejoras permanentes; acá no hay
// partida especial —hay una caja, y la misma plata que pone el gimnasio es la
// que paga el micro a Tucumán—. Esa es la decisión: invertir o guardar para el
// viaje.
//
// Las mejoras son del CLUB, no del entrenador. Si cambiás de club, empezás de
// cero: el kinesiólogo que contrataste se queda donde estaba.
//
// Son datos. El efecto de cada una entra al motor en UN solo lugar, y el número
// que se muestra es el que se aplica: `UPGRADE_EFFECT` es la única fuente.

export type UpgradeId = 'kinesiologia' | 'gimnasio' | 'm19' | 'video' | 'micro';

export interface UpgradeDef {
    id: UpgradeId;
    name: string;
    /** Qué compra, en una línea. */
    text: string;
    /** El efecto, como lo lee el jugador. */
    perLevel: string;
}

/** Niveles por mejora. Tres alcanzan: el cuarto sería un club profesional. */
export const UPGRADE_MAX_LEVEL = 3;

/**
 * Lo que cuesta cada nivel, como fracción de lo que entra por cuotas en un año
 * (socios × cuota). Escala con el club: el gimnasio de un club de 900 socios
 * cuesta más que el de uno de 250, y a los dos les duele parecido.
 */
export const UPGRADE_COST_FRACTION: readonly number[] = [0.1, 0.17, 0.26];

/**
 * Lo que cuesta MANTENER cada nivel por año, como fracción de lo que entra por
 * cuotas. Antes una mejora comprada era gratis para siempre; ahora el kinesiólogo
 * cobra todos los meses, el gimnasio se rompe y el micro paga seguro y service.
 * Las que son un sueldo (kinesiología, M19, video) cuestan más que las que son
 * una cosa (gimnasio, micro).
 *
 * Medido el 2026-10-14 sobre un club medio del Top 14 (1.320 socios, 79 M de
 * cuotas): un nivel de kinesiología cuesta 1,2 M por año; las cinco al tope,
 * 14 M, una séptima parte de lo que entra. Comprar todo es una decisión, no un
 * trámite.
 */
export const UPGRADE_UPKEEP_FRACTION = {
    kinesiologia: 0.015,
    gimnasio: 0.01,
    m19: 0.015,
    video: 0.012,
    micro: 0.008,
} as const satisfies Record<UpgradeId, number>;

/** El efecto por nivel. Lo leen el motor y la pantalla: un solo número. */
export const UPGRADE_EFFECT = {
    /** Riesgo de lesión por partido que se resta (la base es 8 %). */
    kinesiologia: 0.012,
    /** Multiplicador extra del crecimiento de los que tienen 27 o menos. */
    gimnasio: 0.07,
    /**
     * Nivel extra con el que sube un libre generado cuando el M19 no alcanza.
     * Desde la etapa 4 la mejora además suma crecimiento al M19, un candidato y
     * un punto de observación por nivel (`engine/academy.ts`).
     */
    m19: 2,
    /** Rating de equipo, todas las temporadas. */
    video: 0.5,
    /** Fracción del costo de los viajes que se ahorra. */
    micro: 0.1,
} as const satisfies Record<UpgradeId, number>;

export const UPGRADES: readonly UpgradeDef[] = [
    {
        id: 'kinesiologia',
        name: 'Kinesiología',
        text: 'Un kinesiólogo los martes y los jueves, y otro en la cancha los sábados.',
        perLevel: 'Menos lesiones en cada partido.',
    },
    {
        id: 'gimnasio',
        name: 'Gimnasio',
        text: 'Fierros, una sala cerrada y un preparador físico con horario.',
        perLevel: 'Los que tienen 27 o menos crecen más rápido.',
    },
    {
        id: 'm19',
        name: 'Entrenador del M19',
        text: 'Alguien rentado para la juvenil, en vez de un padre que da una mano.',
        perLevel: 'El M19 crece más, la jornada de captación tiene un chico y un punto de observación más, y el libre que sube de apuro llega más hecho.',
    },
    {
        id: 'video',
        name: 'Analista de video',
        text: 'Los partidos del rival cortados por jugada antes del sábado.',
        perLevel: 'El equipo rinde un poco más todos los fines de semana.',
    },
    {
        id: 'micro',
        name: 'Micro propio',
        text: 'Un micro usado a nombre del club, en vez de alquilar uno por viaje.',
        perLevel: 'Los viajes salen más baratos, sobre todo los del Interior.',
    },
];

export function getUpgrade(id: string): UpgradeDef | null {
    return UPGRADES.find((u) => u.id === id) ?? null;
}
