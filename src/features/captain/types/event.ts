// EL CAPITÁN — la forma de una decisión.
//
// Los eventos son DATOS, no código. Para agregar contenido no se toca el
// selector: se agregan objetos al archivo de la familia que corresponda. Si
// hace falta una precondición que `requires` todavía no soporta, se extiende
// `requires` y su evaluador — nunca un `if` especial para un evento.
//
// ── Nunca una decisión de una sola opción ──
// Si el jugador no elige nada, no es una decisión: es un resultado, y va como
// tarjeta de resultado. Lo verifica `events-shape.test.ts`.
//
// ── Las probabilidades se muestran ──
// Cada opción lista sus desenlaces con su porcentaje. Elegir a ciegas entre dos
// frases no es decidir. Por eso los pesos se escriben como se van a leer —70 y
// 30, no 7 y 3— y el test verifica que sumen 100.

import type { CaptainAttributeKey, CaptainStage, PositionFamilyId, PositionGroup, SquadRole } from './player.ts';
import type { NationalStatus, SquadTrack } from './captain.ts';

export type EventCategory =
    | 'club'
    | 'personal'
    | 'seleccion'
    | 'cuerpo'
    | 'disciplina'
    | 'mercado'
    | 'veterano';

/**
 * CADA CUÁNTO PASA UNA COSA ASÍ. Es una pregunta distinta de `weight` y por eso
 * es un campo distinto.
 *
 * ── Por qué no alcanzaba con `weight` ──
 * `weight` dice cuánto pesa un evento CONTRA SUS PARES, y alcanza mientras todas
 * las tarjetas sean de la misma clase. En cuanto entra una que puede cambiar la
 * carrera, la pregunta se parte en dos:
 *
 *   · ¿cada cuánto le toca al jugador una oportunidad de oro?   ← la banda
 *   · si le toca una, ¿cuál de las que existen?                 ← el `weight`
 *
 * Con un solo sorteo ponderado las dos se contestan con el mismo número, y ahí
 * hay una trampa que conviene ver antes de pisarla: la frecuencia de una clase
 * pasa a ser LA SUMA DE LOS PESOS DE SUS MIEMBROS. O sea que escribir el noveno
 * evento de oro haría el oro un 12% más frecuente sin que nadie lo hubiera
 * decidido, y la única forma de sostener la tasa sería bajarle el peso a los
 * ocho anteriores cada vez que entra uno nuevo. Es la §1.9 del CLAUDE de
 * captain: la tasa quedaría DERIVADA del tamaño del catálogo y congelada en
 * ocho números escritos a mano.
 *
 * Con la banda aparte, agregar contenido cambia QUÉ te toca y nunca CADA CUÁNTO.
 * La frecuencia de las cuatro clases se decide en un solo lugar
 * (`RARITY_BAND`, en `engine/event-selector.ts`) y se mide en un solo test.
 *
 * ── LA RAREZA MARCA LA OPORTUNIDAD, NO LA GRAVEDAD ──
 * El sello se dibuja en la tarjeta, así que es una promesa que se le hace al
 * jugador antes de que elija. Un cruzado también «puede cambiar la trayectoria»
 * y aun así `inj-la-rodilla` se queda en `normal`: coronarlo con un 🟣 lo leería
 * como un premio. Lo raro es la puerta que se abre, no el hueso que se rompe.
 */
export type EventRarity = 'normal' | 'especial' | 'raro' | 'oro';

/**
 * Lo que un desenlace le hace a la carrera.
 *
 * NADA DE PLATA en la etapa amateur (CLAUDE.md §5): si el premio de una
 * decisión es material, se cobra en cancha con `statBoost`. `engine/money.ts`
 * ignora el delta si todavía sos amateur, así que la regla no depende de que
 * quien escriba el próximo evento se acuerde.
 */
export interface CaptainEffect {
    /** Deltas de atributo. La ⭐ de la tarjeta sale de acá, no se declara. */
    attrs?: Partial<Record<CaptainAttributeKey, number>>;
    belonging?: number;
    fame?: number;
    money?: number;
    /** HIA positivos. Sube 🧠 y no baja nunca. */
    head?: number;
    body?: number;
    /** Escalones de 🕒 tiempo de juego. Dura UNA temporada y se apaga sola. */
    playingTime?: number;
    /** Empuje a la planilla del puesto. Dura UNA temporada. */
    statBoost?: number;
    /** Partidos de suspensión. Se descuentan de la temporada que viene. */
    sanction?: number;
    /**
     * Fechas del club que te vas a perder por ESTAR ROTO.
     *
     * No es lo mismo que `playingTime` y por eso es un campo aparte: aquello
     * mueve tu LUGAR en el equipo —el técnico te elige menos— y esto tu
     * DISPONIBILIDAD —no hay técnico que te elija, estás afuera—. La diferencia
     * importa porque el crecimiento lee los minutos de verdad: al que pierde el
     * puesto le queda la pretemporada, al que se rompe no le queda nada.
     *
     * Hermana de `sanction`: las dos son ausencia. Se separan porque la crónica
     * no puede decir "te comiste tres fechas de suspensión" cuando lo que pasó
     * fue una rodilla.
     */
    injury?: number;
    /** Contadores libres del jugador: caps declarados, HIA ocultados, lo que sea. */
    flags?: Record<string, number>;
    /** Acepta la oferta que trajo la tarjeta. Solo en eventos de mercado. */
    takeOffer?: boolean;
    /**
     * FIRMA DE NUEVO CON TU CLUB, por el sueldo y el plazo que la tarjeta mostró.
     *
     * Es un carril propio y no `takeOffer` con tu club adentro de `state.offers`,
     * porque no es lo mismo: renovar no te cuesta Pertenencia, no rescinde nada y
     * no puede resolverse por índice —tu club nunca está en la mesa—. Los términos
     * no viajan en el efecto: se recalculan con `renewalFor`, que es la misma
     * función pura que los dibujó.
     */
    renew?: boolean;
    /** Vuelve al club de origen y rescinde. */
    returnHome?: boolean;
    /**
     * VOLVÉS A TERMINAR: la vuelta es el último capítulo y no un pase más.
     *
     * Es un campo aparte de `returnHome` porque volver a casa no siempre es
     * despedirse. La tarjeta de las dos banderas te devuelve al país a los
     * veintipico para ponerte a tiro de tu unión, y ese jugador tiene media
     * carrera por delante: si el cierre viajara pegado a `returnHome`, esa
     * decisión te retiraría a los 24 sin haberlo dicho nunca.
     *
     * Lo que hace es marcar la temporada en el jugador (`FAREWELL_FLAG`). De ahí
     * salen las dos consecuencias, y las dos se DERIVAN de esa marca en vez de
     * guardarse aparte: no hay más mercado —el que volvió a terminar no está en
     * la mesa de nadie— y la temporada que viene es la última.
     */
    farewell?: boolean;
    /**
     * ACEPTA LA BANDERA QUE TE OFRECEN: te atás a la unión de la que habla la
     * tarjeta (`event.unionCode`) y desde ahí la convocatoria te mide contra ella.
     *
     * Es un VERBO del efecto y no un `if` con el id del evento adentro de
     * `apply-decision`, por la misma razón que `takeOffer` y `renew`: el día que
     * entre otra tarjeta de nacionalización —una por ascendencia, una por
     * residencia cumplida— declara esto y funciona sola. Un `if` por id habría
     * sido exactamente lo que el catálogo existe para evitar.
     *
     * La unión NO viaja adentro del efecto: sale de `event.unionCode`, que
     * `getPendingEvent` reconstruye desde el estado en cada render. Meterla en el
     * efecto obligaría a que el catálogo —que es estático— supiera de qué unión
     * habla una tarjeta que se arma en el momento.
     */
    switchUnion?: boolean;
    /** Se termina acá. */
    retire?: boolean;
}

export interface CaptainOutcome {
    /** Porcentaje. Los de una opción suman 100. */
    weight: number;
    effect: CaptainEffect;
    resultText: string;
}

export interface CaptainOption {
    id: string;
    label: string;
    /** Corto, y dice EL COSTO además del beneficio (CLAUDE.md §4). */
    hint: string;
    /**
     * El club del que habla esta opción, para que la tarjeta pueda dibujar su
     * escudo. PRESENTACIÓN PURA y opcional: sólo lo llenan las tarjetas que se
     * arman en el momento con clubes de verdad (mercado, volver a casa).
     *
     * No se persiste nada de esto — del estado sale `optionId` y la tarjeta se
     * reconstruye entera en cada render—, así que agregar el campo no toca
     * ninguna partida guardada ni el `stateHash` del digest.
     */
    clubId?: string;
    /**
     * EL SUELDO ANUAL DE ESTA OFERTA, en dólares. PRESENTACIÓN PURA, igual que
     * `clubId`, y por el mismo motivo: la tarjeta lo dibuja en grande.
     *
     * Va como número y no adentro del `hint` porque una cifra metida en una
     * frase se lee como parte de la frase. Es la magnitud que separa un contrato
     * de Super Rugby Américas de uno del Top 14 —dieciséis mil contra ochocientos
     * mil— y con el sueldo escondido en un renglón de texto gris, la decisión más
     * grande del juego se estaba tomando sin verla.
     *
     * Cero o ausente en las ofertas amateurs, que es lo correcto: ahí no hay
     * plata y la tarjeta no dibuja nada.
     */
    salary?: number;
    /**
     * POR CUÁNTOS AÑOS. PRESENTACIÓN PURA, igual que `salary`, y va pegado a él
     * porque un sueldo anual sin plazo es medio número: US$ 380.000 por un año y
     * US$ 380.000 por tres son dos ofertas distintas y la segunda vale el triple.
     *
     * Y es la única ficha de la tarjeta que habla del FUTURO LEJANO: mientras el
     * contrato corra no vas a volver a ver esta pantalla, así que el plazo es
     * también cuántos junios estás resignando.
     *
     * Ausente en las amateurs: ahí no hay papel.
     */
    contractYears?: number;
    /**
     * EN QUÉ LUGAR DEL PLANTEL CAERÍAS SI ELEGÍS ESTO. PRESENTACIÓN PURA, igual
     * que `clubId` y `salary`.
     *
     * Es la otra mitad de la decisión y faltaba entera. Un mercado donde solo se
     * ve el sueldo empuja siempre al club más grande, y el club más grande es
     * exactamente donde no vas a jugar: `playingTimeOf` reparte el tiempo de
     * juego por `ovr − clubRating`, así que el salto que mejor paga es el que te
     * sienta. Con las dos columnas a la vista —cuánto y dónde— la elección deja
     * de tener una respuesta obvia, que es todo lo que le pedimos a una decisión.
     *
     * NO SE DECLARA A MANO: sale de `playingTimeOf`, que es la misma cuenta que
     * va a correr la temporada que viene. Escribirlo en la tarjeta sería
     * prometer una cosa y hacer otra (CLAUDE.md raíz §3.1).
     */
    squadRole?: SquadRole;
    /**
     * QUIÉN TE MIRA SI FIRMÁS ACÁ. PRESENTACIÓN PURA, igual que `salary` y
     * `squadRole`, y la tercera columna que le faltaba a la decisión de mercado.
     *
     * La mesa mostraba cuánto y dónde. Lo que no decía en ninguna parte es que la
     * liga que mejor paga puede ser la que te borra de la lista de tu selección:
     * el +2 / −3 por nivel de club existía desde la 0.22.0 y era un número
     * interno. O sea que el juego cobraba una consecuencia que nunca había
     * enunciado — y desde afuera eso no se lee como una decisión difícil sino
     * como una trampa, que es el mismo argumento que obligó a escribir el aviso
     * del clásico antes de elegir y no después.
     *
     * NO SE DECLARA A MANO: sale de `selectionVisibility`, que es la misma
     * función que devuelve el delta que la convocatoria va a aplicar. Escrita
     * enfrente sería una segunda fuente de verdad, y el día que las bandas se
     * muevan la tarjeta seguiría prometiendo la visibilidad vieja (§3.1 raíz).
     */
    scouting?: { label: string; tone: 'up' | 'flat' | 'down' };
    outcomes: CaptainOutcome[];
}

/** Gates duros. Todos se evalúan en cascada y cualquiera que falle deja fuera. */
export interface EventRequirements {
    stage?: CaptainStage[];
    tracks?: SquadTrack[];
    minAge?: number;
    maxAge?: number;
    minOvr?: number;
    maxOvr?: number;
    families?: PositionFamilyId[];
    group?: PositionGroup;
    minBelonging?: number;
    maxBelonging?: number;
    /** Temporadas jugadas como mínimo. Para que los hitos no salgan el primer año. */
    minSeasons?: number;
    /** Necesita tener club. */
    needsClub?: boolean;
    /** Necesita unión con selección. */
    needsUnion?: boolean;
    /** Necesita estar lejos del club de origen. */
    awayFromHome?: boolean;
    /**
     * QUÉ SOS PARA TU UNIÓN. No es lo mismo que `tracks` y por eso es un campo
     * aparte: aquél dice en qué plantel estás este año y esto, qué sos para la
     * camiseta — el que está `trial` y el titular comparten el escalón
     * `nacional` y no comparten una sola tarjeta.
     */
    nationalStatus?: NationalStatus[];
    /** Necesita que exista el archirrival. */
    needsRival?: boolean;
    /**
     * EL ARCHIRRIVAL TIENE QUE ESTAR POR ENCIMA (o por debajo, con `false`).
     *
     * Se compara contra la MEDIA CRUDA y no contra el valor de selección, y esa
     * decisión importa: `Rival.ovr` es una media y compararla contra un valor
     * con forma, edad y liga adentro sería comparar dos unidades distintas
     * porque las dos se llaman «puntos». La convocatoria hace su propia cuenta
     * con `rivalFactor`, que es otra pregunta.
     */
    rivalAhead?: boolean;
    /**
     * MESES DE REGISTRO ACUMULADOS EN UNA UNIÓN QUE NO ES LA TUYA (8.1(c)).
     *
     * Es la precondición de la tarjeta de las dos banderas y está escrita como
     * precondición GENERAL y no como un `if` con el id adentro del selector, que
     * es la regla del §3 del CLAUDE raíz: el día que entre una segunda tarjeta
     * de elegibilidad —una por ascendencia, una por residencia cumplida— declara
     * esto y funciona sola.
     */
    secondFlagMonths?: number;
}

export interface CaptainEvent {
    /** Prefijo de familia + kebab-case, único. Lo verifica el test de forma. */
    id: string;
    category: EventCategory;
    title: string;
    text: string;
    /** Probabilidad relativa DENTRO DE SU BANDA de rareza. */
    weight: number;
    /**
     * Ausente es `normal`, y ese es el default correcto: el grueso del catálogo
     * es la vida del club, y una tarjeta que no declara nada tiene que caer ahí
     * en vez de colarse en una banda escasa por olvido.
     */
    rarity?: EventRarity;
    repeatable: boolean;
    /** Temporadas hasta que puede repetirse. Solo con `repeatable`. */
    cooldown?: number;
    requires?: EventRequirements;
    options: CaptainOption[];
    /**
     * LA UNIÓN DE LA QUE HABLA ESTA TARJETA, para que se dibuje su BANDERA.
     *
     * PRESENTACIÓN PURA y opcional, igual que `clubId` en una opción y por el
     * mismo motivo: sólo lo llenan las tarjetas que se arman en el momento
     * (`buildFlagSwitchEvent`), del estado sale el `eventId` y la tarjeta se
     * reconstruye entera en cada render. No se persiste nada, así que agregar el
     * campo no toca ninguna partida guardada ni el `stateHash` del digest.
     *
     * Existe porque «una unión te ofrece nacionalizarte» sin decir cuál es la
     * decisión más grande del juego tomada a ciegas: cambiar de bandera es para
     * siempre y el jugador tiene derecho a ver de quién es la bandera.
     */
    unionCode?: string;
}
