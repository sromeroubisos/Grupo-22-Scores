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

// ═══════════════════════════════════════════════════════════════════════════
//  EL MODELO GENERATIVO — de acá sale todo jugador que exista
// ═══════════════════════════════════════════════════════════════════════════
//
// ESTAS CONSTANTES NO SON TUNING. Describen de qué está hecha la población del
// juego: cuánto margen de crecimiento se sortea al nacer y con qué dispersión.
// Tocar una acá no ajusta una pantalla ni una dificultad: mueve la distribución
// entera de jugadores, y con ella la escalera representativa, la vitrina y la
// forma de la pirámide.
//
// ── Por qué viven acá y no en el reducer ──
// Eran privadas de `captain-reducer.ts`, que es donde se sortea el jugador. Se
// mudaron cuando entró la camada sintética (`data/cohort.ts`), que las LEE para
// derivar contra quién competís. Esa lectura es lo que hace que los cupos no
// sean un umbral disfrazado: si el modelo generativo se vuelve más generoso, la
// camada se vuelve más generosa con él y el piso aguanta. Si estuvieran
// escondidas en el reducer, la camada tendría que repetirlas a mano y las dos
// copias se separarían en el primer ajuste.
//
// El corolario, y es la parte importante: CAMBIAR UNA DE ESTAS MUEVE LA CAMADA.
// Es a propósito. No las "arregles" en un lado nada más.

/** El margen de crecimiento que se sortea al nacer: media de la campana. */
export const POTENTIAL_MEAN_GAP = 14;

/**
 * NORMAL Y NO UNIFORME, y esa es la decisión: con un sorteo plano entre +10 y
 * +34, la media de techo quedaba en 73 y el 45% de los pibes terminaba jugando
 * para la mayor. Está medido. Una campana centrada en +14 deja la media de techo
 * cerca de 65 y manda los 80 a la cola, que es donde viven.
 *
 * Que la mayoría de las carreras terminen en un club de barrio no es un defecto
 * del balance: es el rugby. Y es lo que hace que llegar signifique algo.
 */
export const POTENTIAL_SD_GAP = 8;

export const POTENTIAL_MIN_GAP = 4;
export const POTENTIAL_MAX_GAP = 40;

/**
 * QUÉ FRACCIÓN DE SU MARGEN REALIZA EL JUGADOR MEDIO DEL MUNDO.
 *
 * ⚠️ NO ES UNA MEDICIÓN. Es una hipótesis de comportamiento, hermana de
 * `TYPICAL_BUILD_SHARE` en `data/cohort.ts`, y hay que tratarla con la misma
 * desconfianza: afirma cuánto de su potencial realiza la gente, no cuánto
 * realiza el simulado.
 *
 * ── Por qué NO se puede derivar del sim ──
 * La tentación es calcular `mean(ovr) / mean(potentialOf)` sobre carreras
 * simuladas y usar eso. Es CIRCULAR: la camada compuerta la escalera, la
 * escalera cambia cuánto jugás, cuánto jugás cambia cuánto crecés, y el número
 * que sacarías quedaría definido por el sim que la camada está compuertando. La
 * camada tiene que ser una afirmación EXTERNA sobre el mundo, o no es una
 * camada: es un espejo.
 *
 * ── De dónde sale el 0,70 ──
 * De una cuenta sobre la escalera, no de una regresión. Con realización 1,0 la
 * camada madura en el techo esperado del propio jugador (52+14+3 = 69), el
 * jugador típico queda en el percentil 50 y el corte del cupo de unión cae en
 * ~76,6 — ARRIBA del umbral de a-xv de Argentina (74,9), así que ese cupo no se
 * evaluaba nunca y los tres carriles de abajo daban exactamente 0,000. Con 0,70
 * la camada madura en 63,9, el corte cae en ~71,5 y se abre la franja
 * 71,5–74,9. Esa franja ES la premisa: el buen jugador de club que va convocado
 * a su unión y no llega más arriba.
 *
 * ── Plana en la edad, a propósito ──
 * No es función de la edad. `avance(edad)` en `cohortCurve` ya lleva la curva, y
 * dos curvas de edad multiplicadas dejan de ser legibles: no se puede saber cuál
 * de las dos movió un número. Una constante, un efecto.
 *
 * Banda de reautorización: [0,60 – 0,80]. Fuera de ahí no es un ajuste, es otra
 * afirmación sobre el mundo y merece su propia discusión.
 */
export const POTENTIAL_REALIZATION = 0.7;

/**
 * Cuánto techo se puede construir encima del material sorteado.
 *
 * El número sale de `docs/el-capitan-formacion.md`, que propone arrancar
 * probando ±6. Acá la banda es de una sola dirección —se construye hacia
 * arriba, no se destruye hacia abajo— porque el modo de fracaso ya lo cubre no
 * llegar al techo, y dos formas de terminar por debajo del material se pisarían.
 *
 * Es el rango entero de lo que las decisiones pueden mover el destino. Si se
 * queda corto, la palanca vuelve a ser decorativa; si se pasa, el sorteo deja de
 * significar algo y el juego se vuelve una escalera.
 */
export const POTENTIAL_BAND = 6;

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
    /**
     * EL MATERIAL QUE TE TOCÓ. Se sortea a los 18 y no lo mueve nada nunca.
     *
     * No es el techo: es la mitad sorteada del techo. La otra mitad la
     * construís, y por eso este campo no se llama `potential` — el nombre viejo
     * prometía ser el destino entero cuando solo era el reparto de cartas.
     */
    potentialBase: number;
    /**
     * LO QUE CONSTRUISTE ENCIMA DEL MATERIAL, acotado a `POTENTIAL_BAND`.
     *
     * Es el canal que el motor no tenía. Antes de que existiera, `pull` cerraba
     * la brecha contra un número fijo y toda decisión caía adentro del mismo
     * recorte: podías llegar antes a tu techo, nunca más alto. Medido, eso daba
     * `no-alcanzó-su-techo = 0` y una decisión que movía 0,1 puntos de pico
     * contra 17 del sorteo.
     *
     * Sube con lo que cuesta: hoy, la carta de pretemporada cara. Están
     * previstos como fuentes los Momentos ganados y la Formación 16–20
     * (`docs/el-capitan-formacion.md`), y por eso el campo es un acumulador
     * genérico y no "puntos de entrenamiento".
     */
    built: number;
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
