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

/**
 * TU LUGAR EN EL PLANTEL, en cuatro escalones.
 *
 * El tipo vive acá y no en `engine/statistics.ts` —que es quien lo CALCULA— por
 * la regla de la cabecera: este archivo es la raíz del árbol de tipos y no
 * importa nada. Desde que la tarjeta de mercado dice en qué lugar del plantel
 * caerías con cada oferta, el rótulo lo necesitan también `types/event.ts` y la
 * pantalla, y ninguno de los dos puede depender del motor.
 *
 * `reserva` es Intermedia: no es que jugás poco, es que jugás en otro equipo.
 */
export type SquadRole = 'titular' | 'rotacion' | 'banco' | 'reserva';

/**
 * LA FORMA DE LA CARRERA, no su altura.
 *
 * El tipo vive acá —y no en `engine/development-profile.ts`, que es donde están
 * sus curvas— por la regla de la cabecera: este archivo es la raíz del árbol de
 * tipos y no importa nada, así que un campo de `CaptainPlayer` no puede
 * depender del motor. Al revés sí: el motor lee de acá y el sentido de la
 * dependencia se mantiene en una sola dirección.
 */
export type DevelopmentProfile = 'early' | 'normal' | 'late';

/**
 * Edad a la que arranca cualquier carrera: el pibe de juveniles que empieza a
 * entrenar con el plantel superior.
 *
 * Son DOS TEMPORADAS antes de lo que el motor daba por sentado, y no es un
 * detalle de la ficha. A los 16 no existe todavía ningún escalón representativo
 * —la ventana de la unión abre a los 17 y la del M20 a los 18
 * (`engine/national-team.ts`)— y el puesto todavía no debuta: `playingTimeOf`
 * recorta el tiempo de juego de quien está por debajo del debut de su familia.
 * O sea que las dos primeras temporadas son formación pura: se entrena, se
 * crece, y casi no se juega.
 *
 * TODO LO QUE DEPENDE DE ESTA EDAD SE DERIVA DE ACÁ (CLAUDE de captain §1.9):
 * la ventana de crecimiento de `engine/aging.ts` y el avance de la camada de
 * `data/cohort.ts` la leen en vez de repetir el número. Un 18 escrito a mano en
 * cualquiera de esos dos lugares era exactamente la derivada congelada que la
 * convención nombra: correcta el día que se escribió, silenciosamente falsa
 * desde este commit.
 */
export const START_AGE = 16;

/**
 * LA EDAD DEL DEBUT EN PRIMERA. Antes de esto se juega en JUVENILES.
 *
 * No es lo mismo que el `debut` de la familia (`data/positions.ts`): aquello es
 * la edad a la que un puesto se ASIENTA en primera —un pilar a los 20, un wing a
 * los 18— y es una afirmación sobre la curva del puesto. Esto es la puerta del
 * plantel superior, y es la misma para los quince: a los 16 y a los 17 se juega
 * en las juveniles del club, con los de tu edad, y no hay puesto que lo cambie.
 *
 * Lo que NO cambia es cuánto crecés. El motor ya separa las dos cosas
 * (`simulate-season` §4): `clubShare` es qué parte de la temporada del CLUB
 * jugaste, y `rendimiento` es cuántos minutos jugaste con la camiseta que sea —
 * y es el segundo el que te hace mejor. Las juveniles son minutos, así que el
 * pibe sigue creciendo por jugar; lo que no puede es ser titular de primera a
 * los 16 ni levantar la copa de la división mayor.
 *
 * PARÁMETRO LIBRE, y es la regla del rugby de clubes: el plantel superior es de
 * mayores. Todo lo que dependa de esta edad se DERIVA de acá (§1.9).
 */
export const FIRST_TEAM_AGE = 18;

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

/**
 * El margen de crecimiento que se sortea al nacer: media de la campana.
 * PARÁMETRO LIBRE.
 *
 * ── QUÉ MUNDO AFIRMA, Y POR QUÉ CAMBIÓ (CLAUDE de captain §1.3) ──
 * Antes valía 14, y la premisa escrita al lado era "que la mayoría de las
 * carreras termine en un club de barrio es el rugby". La premisa sigue siendo
 * cierta para el CLUB. Lo que no era cierto es lo que producía: con media 14
 * sobre una base de 52, el techo mediano quedaba en 66 y el percentil 90 en 76.
 * Medido contra las puertas del propio motor, eso cerraba el juego entero:
 *
 *     seleccionado A de Argentina (centro)   74,9   ← p88 de techo
 *     la mayor de Argentina (centro)         78,8   ← fuera de la campana
 *     Top 14 (el club más chico, r72)          66   ← justo la mediana, y solo
 *                                                     realizando el techo entero
 *
 * O sea que Europa, los caps y los torneos no eran raros: eran INALCANZABLES
 * para la práctica totalidad de la población, y el motor los tenía declarados y
 * cableados igual. Un canal que existe y nunca transporta es peor que no
 * tenerlo — es la trampa del §2 al revés.
 *
 * Con 27 el techo mediano queda cerca de 79 y el p90 cerca de 89. La pirámide
 * NO se aplana: sigue habiendo cola larga y sigue siendo el sorteo lo que más
 * pesa. Lo que cambia es que la mitad de arriba de la población puede pelear el
 * seleccionado A, y la cola puede jugar en Europa — que es el juego que el
 * catálogo de 822 clubes y 20 torneos internacionales estaba esperando.
 */
export const POTENTIAL_MEAN_GAP = 27;

/**
 * NORMAL Y NO UNIFORME, y esa es la decisión: con un sorteo plano el techo deja
 * de tener cola y todos los destinos se vuelven igual de probables. La campana
 * es lo que mantiene el 90 en la cola, que es donde vive.
 *
 * No se movió al subir la media: la DISPERSIÓN de la población no es lo que
 * estaba mal. Con desvío 8 sobre media 27, entre el percentil 10 y el 90 hay
 * veinte puntos de techo, que es la distancia entre hacer carrera en la Primera
 * A de la URBA y jugar el Top 14. Esa distancia es el juego.
 */
export const POTENTIAL_SD_GAP = 8;

/**
 * EL PISO DEL MARGEN. PARÁMETRO LIBRE.
 *
 * Era 4, y con la campana vieja producía el peor resultado posible del juego:
 * el 11,9% de los jugadores nacía con el margen mínimo —un techo de 56— y
 * llegaba a él a los 24, con once temporadas por delante donde el número solo
 * podía bajar. No era mala suerte: era el valor MÁS PROBABLE del sorteo, porque
 * `rng.normal` recortaba la cola contra el borde en vez de re-tirarla.
 *
 * Ahora son dos arreglos distintos y hacen falta los dos: el recorte se
 * reemplazó por una truncada de verdad (`engine/random.ts`), y el piso subió a
 * 18 para que la peor carrera posible siga siendo una carrera. Con base 52, un
 * margen de 18 da techo 70: alcanza para el seleccionado de tu unión y para
 * hacer carrera en un club grande, no alcanza para la mayor. Ese es el piso que
 * se quiere — el jugador que no llegó, no el jugador que no existió.
 *
 * ── Y HOY YA NO ES EL QUE MUERDE ──
 * Desde que existe `POTENTIAL_FLOOR`, el piso que corre es el otro: con base 52
 * hace falta un margen de 32 para llegar a 84, así que 18 no se alcanza nunca.
 * Queda igual y no se borra porque es el piso del MARGEN y sigue siendo la
 * garantía de último recurso: si alguien bajara el piso del techo, este vuelve a
 * morder solo. Dos pisos que miden cosas distintas, no una constante muerta.
 */
export const POTENTIAL_MIN_GAP = 18;

/**
 * EL TECHO DEL MARGEN. PARÁMETRO LIBRE.
 *
 * 43 sobre una base de 49–55 permite llegar a 92–98, y `OVR_MAX` (99) recorta
 * lo que se pase. Es el jugador que sale una vez por generación, y tiene que
 * existir: sin él la vitrina del juego —Mundial, Seis Naciones, Champions Cup—
 * queda declarada y vacía.
 */
export const POTENTIAL_MAX_GAP = 43;

/**
 * EL PISO DEL TECHO. PARÁMETRO LIBRE, y de los que definen el juego.
 *
 * Nadie nace en El Capitán con un destino por debajo de 84. No es lo mismo que
 * `POTENTIAL_MIN_GAP`, que es un piso del MARGEN y por lo tanto un piso relativo
 * a la base del puesto: con margen mínimo 18 sobre una base de 52, el peor
 * destino posible era 70, y 70 es un jugador que no puede pelear nada de lo que
 * el catálogo declara. Este piso es ABSOLUTO y se mide en el techo, que es la
 * unidad en la que están escritas las puertas del motor.
 *
 * ── Qué mundo afirma (CLAUDE de captain §1.3) ──
 * Que en este juego el material NO es lo que te cierra la puerta. Todos los que
 * empiezan podrían, en el papel, llegar arriba: lo que decide es cuántas
 * temporadas te alcanzan para acercarte, y eso lo deciden el entorno, el cuerpo
 * y las decisiones (`engine/growth.ts` — el lazo converge, lo que se acaba es el
 * tiempo). El fracaso sigue existiendo y sigue siendo el modo normal, pero pasa
 * a ser «no llegué», nunca «no me tocó».
 *
 * ── Cómo se aplica, y por qué no como un `Math.max` ──
 * Se aplica MOVIENDO EL PISO DE LA TRUNCADA (`potentialGapMin`), no recortando
 * el resultado. Recortar apila en 84 exacto a todo el que hubiera sacado menos
 * —el mismo error que ya se pagó con `rng.normal` recortando contra el borde y
 * volviendo el mínimo el valor más probable del juego— y encima haría del piso
 * la moda de la población. Truncando, la campana se re-tira dentro de la banda
 * que queda y el techo sigue teniendo forma.
 *
 * ── La consecuencia que NO se puede olvidar ──
 * Sube la población entera, así que sube también la camada sintética: los cupos
 * y los umbrales de `engine/national-team.ts` se miden contra `cohortMaturity`,
 * que deriva de este mismo modelo. Es a propósito y es lo que mantiene la
 * pirámide: si el piso subiera solo para el jugador, la selección se llenaría en
 * dos temporadas.
 */
export const POTENTIAL_FLOOR = 84;

/**
 * El piso del MARGEN para una base dada: el que hace falta para que el techo
 * llegue a `POTENTIAL_FLOOR`. DERIVADA — no se escribe, se calcula.
 *
 * Queda acotado por `POTENTIAL_MAX_GAP` por seguridad: un piso por encima del
 * techo del margen dejaría a la truncada sin banda de dónde sacar el número.
 */
export function potentialGapMin(startOvr: number): number {
    return Math.min(
        POTENTIAL_MAX_GAP,
        Math.max(POTENTIAL_MIN_GAP, POTENTIAL_FLOOR - startOvr),
    );
}

function normalPdf(z: number): number {
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Φ, por la aproximación de Abramowitz–Stegun 26.2.17. Error < 7,5e-8. */
function normalCdf(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.319381530
        + t * (-0.356563782
            + t * (1.781477937
                + t * (-1.821255978
                    + t * 1.330274429))));
    const cola = normalPdf(z) * poly;
    return z >= 0 ? 1 - cola : cola;
}

/**
 * LA MEDIA DEL MARGEN QUE DE VERDAD SE SORTEA para una base dada. DERIVADA.
 *
 * `POTENTIAL_MEAN_GAP` es la media de la campana ANTES de truncar. Con el piso
 * de `potentialGapMin` mordiendo la mitad de abajo, la media de lo que sale del
 * sorteo es otra —más alta— y quien necesite «cuánto crece un jugador típico»
 * tiene que usar ESTA y no aquella. La camada de `data/cohort.ts` es el caso: si
 * leyera la media de la campana, describiría una población que ya no existe y
 * los cupos se abrirían solos.
 *
 * Es la fórmula cerrada de la normal truncada, no una simulación: acá no hay
 * `rng` ni puede haberlo — dos llamadas con la misma base tienen que dar el
 * mismo número, hoy y dentro de seis meses.
 */
export function expectedPotentialGap(startOvr: number): number {
    const min = potentialGapMin(startOvr);
    const alpha = (min - POTENTIAL_MEAN_GAP) / POTENTIAL_SD_GAP;
    const beta = (POTENTIAL_MAX_GAP - POTENTIAL_MEAN_GAP) / POTENTIAL_SD_GAP;
    const masa = normalCdf(beta) - normalCdf(alpha);
    // Sin masa la banda es un punto: el margen es el piso y no hay nada que
    // promediar. Pasa solo si alguien deja el piso pegado al techo.
    if (masa <= 1e-9) return min;
    return POTENTIAL_MEAN_GAP + POTENTIAL_SD_GAP * ((normalPdf(alpha) - normalPdf(beta)) / masa);
}

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
 *
 * ── POR QUÉ BAJÓ A 0,60 CON EL PISO DEL TECHO (§1.8) ────────────────────────
 * Lo que este juego quiere fijo es una TASA —«llegar a la mayor es raro», y la
 * banda dice 10–30%—, no este parámetro. El parámetro es lo que la produce, y la
 * regla es calibrar la tasa y derivar el parámetro, nunca al revés.
 *
 * `POTENTIAL_FLOOR` movió la población entera hacia arriba y, sobre todo, la
 * COMPRIMIÓ: los picos de media pasaron de repartirse entre 75 y 93 a apretarse
 * entre 80 y 92. Con la población apretada, un punto de camada mueve treinta
 * puntos de tasa, y con 0,70 sobre el margen nuevo la camada maduraba en 79,3 y
 * la puerta de la mayor quedaba en 93,2 — arriba del percentil 90 de los techos
 * que el propio motor sortea. Nadie entraba nunca.
 *
 * Medido sobre 160 carreras, con el piso puesto:
 *
 *     0,70 → 0,00 llegan a la mayor      0,60 → 0,14      0,56 → 0,38
 *
 * 0,60 es el borde de la banda declarada arriba y se queda ahí a propósito: si
 * la próxima vez hiciera falta salirse, ya no es calibración —es admitir que la
 * realización dejó de ser una constante y pasó a depender del tamaño del margen,
 * que es una afirmación distinta sobre el mundo y merece su propio commit.
 */
export const POTENTIAL_REALIZATION = 0.6;

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

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE COMPRASTE
// ═══════════════════════════════════════════════════════════════════════════
//
// El catálogo vive en `data/shop.ts` y las reglas en `engine/shop.ts`; acá está
// solo la FORMA de lo que se guarda, porque este archivo es la raíz del árbol de
// tipos y no importa nada.
//
// Lo comprado cuelga del JUGADOR y no del estado, y la razón es concreta: el
// techo de la media lo levanta lo que compraste (`engine/ovr.ts`), y
// `potentialOf` recibe un jugador. Colgarlo del estado obligaría a pasarle dos
// argumentos a la función más llamada del motor para no ganar nada.

/** Puntos de atributo que DE VERDAD entraron, con el recorte del techo adentro. */
export interface ShopGain {
    attr: CaptainAttributeKey;
    points: number;
}

/**
 * UNA COMPRA. Se guarda entera y no un resumen: de acá salen la vitrina de la
 * tienda, el vencimiento de los consumibles y —lo que obliga a guardarla— la
 * DEVOLUCIÓN EXACTA de lo que un consumible prestó.
 *
 * `applied` no es derivable del catálogo: los puntos se recortan contra el techo
 * al comprar, así que un ítem que promete +4 puede haber entrado como +1,2. Sin
 * el número aplicado, devolverlo al vencer restaría lo que el ítem decía y no lo
 * que había dado, y el jugador terminaría peor de lo que empezó.
 */
export interface ShopPurchase {
    id: string;
    /** La temporada en que se compró. Con esto se limita "una por temporada". */
    season: number;
    /** El atributo que eligió el jugador, cuando el ítem se lo pide. */
    attr: CaptainAttributeKey | null;
    applied: ShopGain[];
    /**
     * Temporadas que le quedan al efecto. `null` = para siempre.
     *
     * Baja de a una al CERRAR la temporada y, cuando llega a cero, la compra se
     * borra de la lista y sus puntos se devuelven. Por eso un consumible vencido
     * no deja rastro: se puede volver a comprar, que es todo el punto de que sea
     * un consumible.
     */
    seasonsLeft: number | null;
}

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
     * EL MATERIAL QUE TE TOCÓ. Se sortea al crear el jugador (`START_AGE`) y no
     * lo mueve nada nunca.
     *
     * No es el techo: es la mitad sorteada del techo. La otra mitad la
     * construís, y por eso este campo no se llama `potential` — el nombre viejo
     * prometía ser el destino entero cuando solo era el reparto de cartas.
     */
    potentialBase: number;
    /**
     * LA FORMA DE LA CARRERA: precoz, parejo o tardío.
     *
     * Se sortea al nacer junto con el material y NO TOCA EL TECHO: toca cuándo
     * se llega. El precoz explota de pibe y se estabiliza joven; el tardío
     * arranca lento y sigue creciendo pasados los treinta.
     *
     * Va escondido toda la partida —como `potentialBase`— y se revela en el
     * retiro. El tipo y las curvas viven en `engine/development-profile.ts`; acá
     * solo se guarda cuál te tocó.
     */
    developmentProfile: DevelopmentProfile;
    /**
     * CUÁNTO TE DURA, en años de apartamiento de la curva de tu puesto.
     *
     * El otro eje de la forma de la carrera, y el que faltaba: sin él, todos los
     * wings de todas las partidas se retiraban a la misma edad. Se sortea al
     * nacer junto con el material y el perfil, y como ellos NO TOCA EL TECHO —un
     * jugador longevo no llega más alto, llega durante más tiempo.
     *
     * Positivo ensancha la meseta y corre el declive y los dos topes hacia
     * adelante; negativo los adelanta. Acotado por `LONGEVITY_MIN/MAX`, y
     * siempre por debajo del tope del juego (`CAREER_HARD_CAP`).
     *
     * Escondido toda la partida y revelado en el retiro, igual que el perfil. El
     * reparto y la resolución de la curva viven en
     * `engine/development-profile.ts`; acá solo se guarda cuánto te tocó.
     */
    longevity: number;
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
    /**
     * LO QUE COMPRASTE, en orden de compra. Vacío hasta el primer contrato: el
     * rugby de club no paga y sin plata no hay tienda.
     */
    shop: ShopPurchase[];
    /**
     * LO QUE TE SACARON LAS LESIONES, atributo por atributo y acumulado.
     *
     * Existe porque hay una compra que lo devuelve —el cirujano de rodilla— y
     * "devolver lo que te sacó la lesión" no se puede calcular de otra manera:
     * la regresión es aleatoria dentro de una banda, así que el número que se
     * perdió no está escrito en ningún catálogo. Es un `Record` de claves
     * dinámicas: quien lo recorra ORDENA PRIMERO (CLAUDE.md §1).
     *
     * Se vacía cuando la cirugía lo devuelve, y vuelve a llenarse con la
     * siguiente lesión. No es un histórico: es el saldo pendiente.
     */
    injuryLoss: Partial<Record<CaptainAttributeKey, number>>;
}
