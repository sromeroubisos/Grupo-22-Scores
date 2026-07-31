// EL CAPITÁN — el jugador.
//
// Este archivo es la base del árbol de tipos y NO IMPORTA NADA. Todo lo demás
// de captain/ cuelga de acá: `data/positions.ts` lo lee para declarar las ocho
// familias, `types/currencies.ts` para saber en qué etapa está la carrera, y
// `types/captain.ts` para armar el estado. La dependencia va siempre en un solo
// sentido —data → types, nunca al revés— así que no hay ciclo posible.

/**
 * Las OCHO familias de puesto.
 *
 * No son los quince puestos: son las ocho maneras distintas de jugar al rugby
 * que el juego modela. Un 1 y un 3 empujan igual y se retiran a la misma edad;
 * un 11 y un 15 corren igual. Partirlos en quince sería quince tablas de pesos
 * para calibrar donde alcanzan ocho.
 *
 * El dorsal sí se elige, y vive en `CaptainPlayer.number`: es lo que distingue
 * al pilar izquierdo del derecho sin partir la familia en dos.
 */
export type PositionFamilyId =
    | 'primera-linea'
    | 'hooker'
    | 'segunda-linea'
    | 'tercera-linea'
    | 'medio-scrum'
    | 'apertura'
    | 'centro'
    | 'wing-fullback';

export type PositionGroup = 'forward' | 'back';

/**
 * LOS ATRIBUTOS. Dieciocho, más `aguante`.
 *
 * Cada familia declara CUÁLES CUATRO le cuentan para la media (y `liderazgo` es
 * siempre uno de los cuatro). El jugador lleva las diecinueve claves igual: un
 * pase de segunda a tercera línea cambia qué se mira, no qué existe, y así el
 * cambio de puesto no obliga a migrar el guardado.
 *
 * `aguante` NO ENTRA EN LA MEDIA de nadie. No es una excepción que haya que
 * recordar: no está en las cuatro de ninguna familia, así que queda afuera por
 * construcción y no por un `if` que alguien pueda borrar.
 *
 * ── Por qué en español ──
 * Es una ruptura deliberada con `career/data/positions.ts`, que usa
 * `power/speed/technique`. Acá no se puede: "salida", "pegada" y "gambeta" no
 * tienen equivalente en inglés que alguien de este proyecto reconozca, y
 * traducirlas inventa vocabulario que después nadie sabe leer. El costo está
 * medido y aceptado: estas claves SE PERSISTEN, así que renombrar una cuesta
 * subir el SCHEMA del guardado.
 */
export type CaptainAttributeKey =
    // Pack cerrado
    | 'empuje'
    | 'choque'
    | 'manos'
    | 'lanzamiento'
    | 'salto'
    | 'trabajo'
    // Contacto y breakdown
    | 'tackle'
    | 'robo'
    | 'defensa'
    // Manejo y patada
    | 'salida'
    | 'patada'
    | 'pegada'
    | 'vision'
    // Espacio abierto
    | 'quiebre'
    | 'velocidad'
    | 'gambeta'
    | 'juegoAereo'
    // Transversal: la única que le cuenta a las ocho familias
    | 'liderazgo'
    // Transversal que NO cuenta para la media
    | 'aguante';

export type CaptainAttributes = Record<CaptainAttributeKey, number>;

/**
 * La etapa de la carrera, y con ella la moneda que corre.
 *
 * En amateur la plata no se mueve —el rugby de club no paga, el jugador paga la
 * cuota— y el recurso escaso es el Tiempo. Al firmar profesional se da vuelta:
 * aparece el sueldo y desaparecen las fichas. Ese cambio de moneda ES la señal
 * de que cambiaste de vida, así que el tipo vive acá y no escondido en el motor.
 */
export type CaptainStage = 'amateur' | 'professional';

/** Edad a la que arranca cualquier carrera: el pibe que sube de M19 a primera. */
export const START_AGE = 18;

export interface CaptainPlayer {
    name: string;
    surname: string;
    age: number;
    family: PositionFamilyId;
    /** Dorsal dentro de la familia. Un pilar es 1 o 3, y no es lo mismo. */
    number: number;
    attrs: CaptainAttributes;
    /**
     * La media. Es DERIVADA de `attrs` y de los pesos de la familia: se guarda
     * congelada para que la trayectoria muestre el número que el jugador vio en
     * su momento, pero la fuente de verdad son los atributos. Se recalcula con
     * `engine/ovr.ts`, nunca a mano.
     */
    ovr: number;
    potential: number;
    /** Id del catálogo de clubes. `null` mientras no tenga club resuelto. */
    clubId: string | null;
    /** País de origen, en el código del catálogo de países. */
    countryCode: string;
    retired: boolean;
    retirementReason: string | null;
    /**
     * Contadores libres: caps, títulos con el club, HIA declarados, lo que la
     * carrera vaya necesitando llevar. Es un `Record` de claves dinámicas, así
     * que cualquier elección que lo recorra ORDENA PRIMERO (CLAUDE.md §1).
     */
    flags: Record<string, number>;
}
