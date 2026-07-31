import type { NationalStatus, Player } from '../types/player.ts';
import type { EmploymentStatus } from './contracts.ts';
import { unionReputation } from '../data/nations.ts';
import { positionScarcity } from '../data/positions.ts';
import { getClub } from '../data/clubs.ts';
import { sportingBandOf } from '../data/competition-levels2026.ts';
import { internationalSeason, isPreWorldCupSeason } from '../data/international-calendar.ts';
import { computeOvr } from './scoring.ts';
import { hashSeed, rngFromState } from './random.ts';
import { canRepresent, captureFor, targetUnion } from './eligibility.ts';

export interface NationalTeamResult {
    calledUp: boolean;
    capsGained: number;
    debut: boolean; // primera convocatoria de la carrera
    /** Unión que lo convocó. null si no hubo convocatoria. */
    union: string | null;
    /** Situación al cierre de la temporada. Se guarda en el jugador y en la temporada. */
    status: NationalStatus;
    /** true si en ESTA temporada perdió la camiseta. Merece su tarjeta. */
    lostShirt: boolean;
}

function clamp(lo: number, hi: number, v: number): number {
    return Math.max(lo, Math.min(hi, v));
}

// ── Los dos umbrales ─────────────────────────────────────────────────────────
//
// EL ABANICO TIENE QUE SER ANCHO. En rugby el plantel de una unión es diminuto:
// Gales tiene unos 300 profesionales y Uruguay bastante menos. El corte para
// jugar en un tier 1 es altísimo en términos absolutos y para un tier 3 entra
// casi cualquier profesional. En fútbol hasta San Marino tiene liga propia; acá
// no. Por eso el abanico es mucho más ancho que el de un simulador de fútbol, no
// más angosto: 27 puntos entre la unión más chica y Nueva Zelanda.
//
// EL SALTO DE 61 A 74 ENTRE REP 1 Y REP 2 ES EL MÁS IMPORTANTE DE LA TABLA. Es
// la frontera que en la vida real separa al que juega un Mundial del que lo
// mira. No se suaviza para que la curva quede prolija.
//
// LA TABLA ENTERA BAJÓ 6 PUNTOS en 1.27.0, y bajó PAREJA a propósito: lo que se
// quería mover era cuánta gente llega a una selección, no la distancia entre
// uniones. Los saltos (4, 13, 4, 3, 3) y el abanico (27) quedaron intactos, así
// que ninguna frontera se corrió: seguir para Nueva Zelanda cuesta exactamente
// tres puntos más que jugar para Irlanda, igual que antes.
//
// El umbral de TITULAR no se tocó, y ésa es la mitad interesante del cambio: el
// hueco entre entrar y ser titular pasó de 4 a 10 puntos en las tres bandas de
// abajo. Entrar al plantel se hizo más fácil; ganarse el puesto, no. Se debuta
// antes y se pasa más tiempo en el banco, que es la forma que tiene el rugby de
// verdad.
//
// El umbral de TITULAR no es un segundo corte que haya que pasar para seguir
// convocado —eso lo resuelve el descuento de abajo— sino el que decide si
// arrancás de titular o entrás del banco, y con eso cuántos tests jugás.
const DEBUT_BY_REPUTATION = [57, 61, 74, 78, 81, 84] as const;
const STARTER_BY_REPUTATION = [67, 71, 84, 88, 90, 93] as const;

/**
 * Lo que paga DE MÁS el que labura de otra cosa.
 *
 * NO SE TOCÓ CUANDO LA TABLA DE DEBUT BAJÓ 6 EN 1.27.0, y por eso el amateur
 * también bajó 6: el recargo es un sobreprecio, no un umbral propio. Que se
 * moviera con la tabla habría sido dejar la ruta amateur exactamente donde
 * estaba mientras todo lo demás se abría, que es lo contrario de lo que se pidió.
 *
 * Contra un techo de ruta amateur MEDIDO en 77 (p99 73, mediana 58), el recargo
 * deja los umbrales así: rep 0 en 60 —cómoda—, rep 1 en 64 —con esfuerzo—, rep 2
 * en 82 y rep 3 para arriba en 92 y más. El interesante es rep 2: antes estaba en
 * 88 y era imposible por construcción, y ahora un amateur de pico absoluto con
 * forma y escasez a favor llega justo a rozarlo. El objetivo de 3-8% del §17 pasa
 * de inalcanzable a apenas posible, que es donde tiene que estar.
 *
 * Todo esto sale de la interacción de dos constantes, sin ningún caso especial.
 */
const AMATEUR_SURCHARGE = [3, 3, 8, 14, 20, 26] as const;

/** Vínculos que en rugby NO son profesionales: el tipo labura de otra cosa. */
const AMATEUR_EMPLOYMENT = new Set<EmploymentStatus>(['amateur', 'amateur-compensated']);

/**
 * EL DESCUENTO POR TITULARIDAD, que es la pieza clave.
 *
 * En rugby la camiseta se hereda con muchísima inercia: el que está adentro se
 * queda más de lo que su nivel justifica y el que está afuera necesita bastante
 * más que empatar para entrar. Un jugador que baja de 79 a 77 no pierde el
 * puesto de un año para el otro.
 *
 * Hace dos cosas buenas para el juego: el primer cap pasa a ser el momento
 * grande de verdad, y perder la camiseta se convierte en un evento con peso
 * propio en vez de un número que sube y baja sin que el jugador se entere.
 *
 * Es INERCIA, NO IMPUNIDAD: dos temporadas seguidas por debajo del umbral con
 * descuento y el jugador sale del plantel.
 *
 * Y LA INERCIA SE GASTA CON LOS ANOS. A igual OVR, el puesto de un jugador de 30
 * esta bajo mas presion que el de uno de 25: al de 25 lo bancan porque va a
 * mejorar, al de 30 lo miran de reojo porque atras viene otro.
 *
 * Sin el decaimiento la carrera internacional salia BIMODAL —o te lavaban en la
 * gira o te quedabas para siempre— porque el que entraba al plantel tenia un −3
 * que no se vencia nunca: 27,5% terminaba con menos de 10 caps, 44,2% con mas de
 * 60, y la franja del medio (10-30) se quedaba en 8,0% contra un objetivo de
 * 20-30%. Faltaba el que tuvo carrera internacional de verdad y perdio el puesto
 * a los 29, que es de las historias mas comunes del deporte.
 */
const SQUAD_DISCOUNT_BY_AGE: readonly { upTo: number; discount: number }[] = [
    { upTo: 27, discount: 3 },
    { upTo: 30, discount: 2 },
    { upTo: 33, discount: 1 },
];
const SQUAD_DISCOUNT_VETERAN = 0;

/** Cuanto le perdona la union por estar adentro, a esa edad. */
function squadDiscountFor(age: number): number {
    for (const tramo of SQUAD_DISCOUNT_BY_AGE) {
        if (age <= tramo.upTo) return tramo.discount;
    }
    return SQUAD_DISCOUNT_VETERAN;
}
const SEASONS_BELOW_TO_DROP = 2;

/**
 * LA PRESION DEL QUE VIENE ATRAS — la competencia por el puesto, sin simular a
 * nadie.
 *
 * El motor no modela el plantel: no hay un rival concreto que te dispute la
 * camiseta. Pero el EFECTO de esa competencia se puede escribir como un numero:
 * cuanto mas tiempo llevas con la camiseta, mas empuja el que viene atras, y
 * cuanto empuja depende de la profundidad de la union.
 *
 * POR QUE HACIA FALTA. La distribucion de caps salia bimodal: o te lavaban en la
 * gira o te quedabas para siempre. Medido tres veces, el hueco del medio (10-30
 * caps) se quedaba en 8% contra un objetivo de 20-30%, y se descarto una por una
 * cada explicacion alternativa — no era el umbral, no era el descuento, no era el
 * share. Era que nadie te sacaba el puesto: el que entraba al plantel a los 23
 * tenia el OVR subiendo hasta los 29, y ningun mecanismo propio lo empujaba
 * afuera antes de eso.
 *
 * POR QUE ESCALA CON LA REPUTACION. En rep 0 y rep 1 vale CERO, y no es una
 * simplificacion: en una union con tres profesionales no hay nadie atras
 * empujando. Las carreras internacionales largas de las uniones chicas son
 * correctas y este mecanismo no las toca.
 *
 * Se enchufa con el decaimiento del descuento por edad desde el otro lado: el
 * joven que crece le gana a la presion sin enterarse; el que se aplana a los 26
 * la pierde a los 28, con veinte caps.
 */
const PRESSURE_BY_REPUTATION = [0, 0, 0.3, 0.6, 0.9, 1.1] as const;

/**
 * Temporadas de gracia antes de que la pauta empiece a levantarse. Entraste, te
 * bancan: la presion recien corre desde la tercera.
 *
 * BAJO DE 3 A 2 USANDO EL MARGEN QUE SOBRABA. Medido con gracia 3, la presion
 * movia masa de 60+ a 30-60 pero el `<10` no se movia ni un decimo y quedaba en
 * 24,8% contra un techo de 40%. Quince puntos de margen sin usar: adelantar la
 * caida un ano entero no lo pone en riesgo.
 *
 * LO QUE NO SE TOCA ES LA PENDIENTE, y el motivo importa. Para llenar la banda de
 * 10-30 caps en tier 1 la caida tendria que llegar en la tercera temporada de
 * plantel, con el jugador en 25 o 26 anos — y a esa edad el OVR todavia crece 2 o
 * 3 puntos por temporada contra 1,1 de presion. Nunca lo alcanza. Habria que
 * poner la pendiente en 3 por temporada, y eso reventaria el `<10` y borraria el
 * 60+ entero.
 *
 * No es que este mal calibrada: la poblacion que tendria que caer ahi esta
 * mejorando mas rapido de lo que cualquier presion razonable puede empujar. Los
 * internacionales de 10 a 30 caps del rugby real son el que se fue a una liga mas
 * debil, el que bajo de categoria con su club, el que paso a ser suplente y el
 * que se rompio: ninguno es un fenomeno de seleccion. Ver la hipotesis en
 * docs/career-engine.md §19.
 */
const PRESSURE_GRACE_SEASONS = 2;

/**
 * CAPS QUE HAY QUE JUNTAR PARA GANARSE EL DESCUENTO.
 *
 * Antes el descuento se regalaba en el debut: apenas te convocaban ya tenías −3
 * y te quedabas doce años. Por eso el modelo no producía carreras
 * internacionales distintas sino la misma carrera con distinto escudo — los tres
 * tiers daban 70,5 · 71,2 · 59,3 caps promedio, todos en la misma banda.
 *
 * Y sobre todo faltaba EL JUGADOR DE UN SOLO CAP, que es una de las figuras más
 * comunes y más tristes del deporte: lo llamaron una vez, no la pegó, no volvió.
 * No existía porque el que entraba quedaba protegido desde el primer día.
 *
 * Ahora los primeros cuatro caps son a prueba: el jugador compite contra el
 * umbral completo cada temporada. El que debutó sobre un pico transitorio —una
 * gran temporada, o el bono de proyección a los 20— se cae solo.
 *
 * Se cuenta por UNIÓN (`nationalStats`), no en total: cambiar de camiseta te
 * devuelve a prueba, que es lo que corresponde. Y se cuenta con `squadCaps`, no
 * con el total: los caps de gira de un `trial` no compran titularidad.
 */
const CAPS_TO_EARN_DISCOUNT = 5;

/**
 * EL MARGEN QUE SEPARA "TE LLEVARON DE GIRA" DE "SOS DEL PLANTEL".
 *
 * El que cruza el umbral por menos de esto entra como `trial`: juega partidos
 * secundarios y nada mas. Para pasar al plantel principal hay que volver a
 * cruzarlo con margen en una temporada posterior; si no lo logra en
 * `TRIAL_SEASONS_LIMIT`, sale.
 *
 * Es lo que produce la cola larga de caps. Antes el debut era binario y el que
 * cruzaba por un punto quedaba adentro doce anos igual que el que cruzaba por
 * diez: el 54% de los internacionales de tier 1 terminaba con mas de 60 caps y
 * el jugador de un solo cap no existia.
 *
 * ES FIJO Y NO RELATIVO, Y ESO NO ES UN DESCUIDO. Medido, el `trial` casi no
 * aparece en las uniones chicas: en rep 0 el umbral es 63 y esos jugadores
 * picotean 80+, asi que cruzan por diecisiete puntos y entran derecho al
 * plantel. Solo 1,4% de los debutantes de tier 3 pasa por la gira, contra 26,8%
 * en tier 1.
 *
 * Eso ES el fenomeno, no una falla de la formula. `trial` significa "los
 * seleccionadores todavia no estan seguros de vos", y una union con tres
 * profesionales SI esta segura: sos uno de los tres, no hay a quien descartar.
 * EL JUGADOR DE UN SOLO CAP ES UN FENOMENO DE PLANTELES PROFUNDOS. Tailandia no
 * tiene jugadores de un cap porque Tailandia no tiene con quien reemplazarlo.
 *
 * Pasar esto a un margen relativo (un % del umbral) emparejaria los tiers y
 * borraria justamente lo que distingue una carrera internacional de un tier 1 de
 * una de tier 3. No lo hagas.
 */
const TRIAL_MARGIN = 3;
const TRIAL_SEASONS_LIMIT = 2;

/**
 * MEDIO DESCUENTO PARA EL QUE CAYÓ.
 *
 * Sin esto, `dropped` era un camino de ida por construcción: el que perdía la
 * camiseta tenía que volver a ganarle al umbral COMPLETO a una edad en la que ya
 * venía declinando, y de 149 caídas volvían cero. Eso no es perder el puesto: es
 * un sinónimo tardío de retirarse de la selección.
 *
 * La unión ya lo conoce. Durante tres temporadas después de la caída le
 * reconoce un punto — alcanza para que el que recupera nivel vuelva, y no
 * alcanza para que vuelva el que se apagó.
 */
const DROPPED_DISCOUNT = 3;
const DROPPED_DISCOUNT_SEASONS = 3;

/**
 * Ventana de edad para ENTRAR al plantel. Al que ya está adentro no lo saca un
 * cumpleaños sino el umbral: la caída de OVR más el escalón de edad de abajo lo
 * empujan afuera solo.
 *
 * Medido: con el tope de 35 aplicado también al que estaba adentro, la edad
 * promedio al perder la camiseta era 35,3 y NADIE volvía nunca — el `dropped`
 * era un sinónimo de "cumplió 36", no de "perdió el nivel", y la promesa de que
 * se puede volver quedaba vacía.
 */
const MIN_ENTRY_AGE = 19;
const MAX_ENTRY_AGE = 35;

/**
 * El alivio del umbral en la temporada PREVIA al Mundial: las listas son de 33 y
 * entra gente que otro año no entraría. El año de Mundial lo dice el calendario
 * (`data/international-calendar.ts`), que es el único que sabe de fechas.
 */
const WORLD_CUP_RELIEF = 2;

// ── Cuántos tests hay: SALE DEL CALENDARIO, no de una tabla ──────────────────
//
// Acá vivía `TESTS_BY_REPUTATION`, que decía "una tier 1 juega 11-13 tests y una
// rep 0 juega 4-5". Era una aproximación sin fixture detrás, y era una SEGUNDA
// fuente de verdad sobre algo que el calendario ya contesta mejor: Tailandia
// juega tres partidos porque el Asia Rugby Championship son tres partidos.
//
// Ahora los partidos disponibles salen de `internationalMatches(unión, temporada)`
// y de ningún otro lado.

/** Fracción de los tests disponibles que juega cada uno. Ahí trabaja el umbral de titular. */
const SHARE_STARTER = [0.75, 0.90] as const;
const SHARE_SQUAD = [0.30, 0.50] as const;

/**
 * EL QUE TODAVÍA ESTÁ A PRUEBA JUEGA MENOS.
 *
 * Entre el debut y los cinco caps de `CAPS_TO_EARN_DISCOUNT` el jugador está en
 * la lista pero no es de la casa: entra del banco, se pierde alguna ventana. Sin
 * esta banda, la segunda temporada de un debutante daba el mismo salto que la de
 * un titular consolidado y el período de prueba se notaba sólo en el umbral.
 */
const SHARE_UNPROVEN = [0.20, 0.40] as const;

/**
 * El que va de gira juega BUENA PARTE de los pocos partidos secundarios que hay.
 *
 * Aca vivia `SHARE_DEBUT = [0.08, 0.35]`, que acotaba el debut aplicando una
 * fraccion chica sobre el fixture COMPLETO. Con el estado `trial` eso paso a ser
 * doble contabilidad: el pool del debutante ya esta acotado por el calendario
 * --solo partidos secundarios-- y volver a recortarlo por fraccion lo dejaba en
 * cero caps la mitad de las veces. Se saca, y la fraccion de aca es alta a
 * proposito: si te llevaron a la gira, jugas la gira.
 */
const SHARE_TRIAL = [0.5, 1] as const;

/**
 * Cuando la union no tiene fixture secundario esa temporada, el que esta a
 * prueba entra igual desde el banco en el torneo principal, acotado.
 *
 * No es un parche: en una union rep 0 el torneo regional ES todo el calendario,
 * y no hay ninguna gira a la que llevarlo. Sin esto, Tailandia no podia debutar
 * a nadie y la banda de rep 0 se caia de 99% a nada.
 */
const TRIAL_BENCH_FALLBACK = 2;

// ── Probabilidad de entrar ───────────────────────────────────────────────────
//
// Sólo para el que NO está en el plantel. El que está adentro y se sostiene por
// encima de su umbral con descuento va convocado: eso es la inercia. El azar
// vive acá, en la puerta, para que el que está justo en el umbral entre a veces
// y a veces no.
const ENTRY_BASE = 0.12;
const ENTRY_SLOPE = 0.10;
const ENTRY_FAME = 0.002;

function repOf(unionCode: string | null): number {
    return clamp(0, 5, unionReputation(unionCode));
}

/** Nivel para DEBUTAR en esa selección con ese vínculo. */
export function debutLevel(unionCode: string | null, employment: EmploymentStatus): number {
    const rep = repOf(unionCode);
    return DEBUT_BY_REPUTATION[rep] + (AMATEUR_EMPLOYMENT.has(employment) ? AMATEUR_SURCHARGE[rep] : 0);
}

/**
 * Nivel para arrancar de TITULAR. No lleva el recargo del amateur: ese se paga
 * sólo para entrar. Una vez que la unión lo capturó, el tipo ya demostró que
 * juega a ese nivel y se lo mide con la regla de cualquiera.
 */
export function starterLevel(unionCode: string | null): number {
    return STARTER_BY_REPUTATION[repOf(unionCode)];
}

// ── Los modificadores del valor de selección ─────────────────────────────────

/**
 * FORMA, 0 a +3. Rindió por encima de la línea de base de su puesto.
 *
 * `dynamics.form` ya viene normalizada por puesto —sale del rating de la
 * temporada, que `statistics.ts` calcula contra el perfil de la posición— así
 * que 50 ES la línea de base y no hay que volver a normalizar acá.
 */
function formBonus(form: number): number {
    return clamp(0, 3, ((form - 50) / 40) * 3);
}

/**
 * NIVEL DEL CLUB, +2 / −3.
 *
 * En rugby el seleccionador mira DÓNDE jugás, no sólo cuánto valés. El que se
 * fue a una liga menor pierde la camiseta aunque su OVR no baje, y eso le pone
 * un contrapeso deportivo a la decisión de mercado, que hoy no lo tenía.
 *
 * Se resuelve por banda deportiva y no por `divisionTier` porque el tier sólo
 * está poblado en las escaleras sudamericanas: banda ≥ 7 son las cuatro grandes
 * más Japón D1, y banda ≤ 2 es lo que queda por debajo de la primera división
 * de cualquier país (Fédérale, National League, Heartland, DH-B, y las
 * divisiones inferiores de AR/UY/CL).
 */
const ELITE_BAND = 7;
const BELOW_TOP_DIVISION_BAND = 2;

function clubLevelBonus(clubId: string, employment: EmploymentStatus): number {
    const band = sportingBandOf(getClub(clubId));
    if (band >= ELITE_BAND) return 2;
    // El castigo por jugar abajo NO se le cobra al amateur: el recargo del
    // amateurismo ya cotiza exactamente eso, y el amateur juega en clubes de
    // banda baja por definición. Cobrárselo dos veces lo dejaba peleando contra
    // un umbral seis puntos más alto que el del profesional del mismo club, y
    // hundía la ruta amateur al 2% de convocatoria en uniones sin profesionales.
    if (band <= BELOW_TOP_DIVISION_BAND && !AMATEUR_EMPLOYMENT.has(employment)) return -3;
    return 0;
}

/**
 * EDAD, proporcional a LO QUE LE FALTA PARA SU TECHO.
 *
 * Las uniones no eligen por lo que sos: eligen por lo que vas a ser. Un pibe de
 * 20 con 65 y techo 74 se convoca en su unión aunque hoy no rinda como un
 * titular, porque el que lo mira ve los nueve puntos que le faltan.
 *
 * Antes era un +2 fijo con `potential >= 80`. Quedaba corto y angosto por los dos
 * lados: el portón terminaba midiendo el OVR PICO, que llega a los 27, y por eso
 * el internacional de un tier 1 debutaba a los 27-28 —cuando los de verdad
 * debutan entre los 21 y los 24— y la cola de prospectos se caía a 7,3%.
 *
 * `potential` sigue siendo OCULTO: se usa acá adentro, nunca se muestra.
 */
const YOUNG_HEADROOM_FACTOR = 0.85;
const YOUNG_HEADROOM_CAP = 18;
/** Edad a la que la proyección se apaga del todo y sólo cuenta lo que rendís. */
const PROJECTION_ENDS_AT = 28;
const FULL_PROJECTION_UNTIL = 24;

function ageBonus(age: number, ovr: number, potential: number): number {
    const headroom = Math.max(0, potential - ovr);
    if (age >= 19 && age <= FULL_PROJECTION_UNTIL) {
        return Math.min(YOUNG_HEADROOM_CAP, headroom * YOUNG_HEADROOM_FACTOR);
    }
    if (age > FULL_PROJECTION_UNTIL && age < PROJECTION_ENDS_AT) {
        // La proyección se APAGA de a poco, no de golpe. Con dos tramos planos
        // —uno hasta los 21 y otro hasta los 24— el debut salía bimodal: o
        // cruzabas a los 20 por proyección o esperabas a los 27 por OVR puro, y
        // la franja 22-26 quedaba vacía (11% cuando el objetivo era 50-60%).
        const fade = (PROJECTION_ENDS_AT - age) / (PROJECTION_ENDS_AT - FULL_PROJECTION_UNTIL);
        return Math.min(YOUNG_HEADROOM_CAP * fade, headroom * YOUNG_HEADROOM_FACTOR * fade);
    }
    // El otro extremo: el veterano se APAGA en dos tramos en vez de caerse de un
    // precipicio el día que cumple años.
    if (age >= 36) return -5;
    if (age >= 33) return -2;
    return 0;
}

export interface SelectionValueBreakdown {
    ovr: number;
    form: number;
    clubLevel: number;
    scarcity: number;
    age: number;
    total: number;
}

/**
 * VALOR DE SELECCIÓN — contra esto se comparan los umbrales.
 *
 * Se construye sobre el OVR CRUDO y no sobre `computeEffectiveOvr` por tres
 * razones, en orden de peso:
 *
 *   1. Una sola escala en toda la feature. El `minOvr` de los eventos compara
 *      contra crudo; que la convocatoria comparara contra el efectivo era el
 *      tipo de desajuste que genera bugs que nadie encuentra.
 *   2. La forma se contaba dos veces: `computeEffectiveOvr` ya suma
 *      `forma × 0,04`, que es casi exactamente el modificador de forma de acá.
 *   3. Auditable. Con los modificadores nombrados, cuando el número no da se ve
 *      cuál lo mueve.
 *
 * Moral y fatiga quedan AFUERA de la decisión a propósito. Si la convocatoria se
 * siente desconectada del estado del jugador, se agregan acá como modificadores
 * nombrados — no volviendo al helper compartido. Nada de entradas escondidas.
 */
export function selectionValue(player: Player): SelectionValueBreakdown {
    const ovr = computeOvr(player.attributes, player.position);
    const form = formBonus(player.dynamics.form);
    const clubLevel = clubLevelBonus(player.club, player.employment);
    const scarcity = positionScarcity(player.position, player.number);
    const age = ageBonus(player.age, ovr, player.potential);
    return { ovr, form, clubLevel, scarcity, age, total: ovr + form + clubLevel + scarcity + age };
}

export interface NationalCallContext {
    /** Semilla de la carrera. Con la temporada siembra el rng LOCAL de convocatoria. */
    careerSeed: number;
    /** Índice de la temporada que se está simulando. */
    seasonIndex: number;
    /**
     * Modulador de la fracción de tests que juega, salido de decisiones (gira,
     * rol de banco). 1 = sin efecto. Los caps siguen saliendo de UN SOLO lugar:
     * un evento puede mover cuánto juega, nunca sumar caps por su cuenta.
     */
    testShare: number;
    /**
     * ¿La temporada pasada quedó afuera ESTANDO en el plantel? Sale de
     * `state.seasons`, no de un contador: la temporada guarda su `nationalStatus`
     * y si fue convocada, y con eso alcanza.
     */
    missedLastSeason: boolean;
    /**
     * Temporadas transcurridas desde que perdió la camiseta, o null si nunca la
     * perdió. Sale de `state.seasons`, que ya congela el `lostShirt` de cada
     * temporada: no hace falta guardar un contador.
     */
    seasonsSinceLostShirt: number | null;
    /**
     * Puntos que una decisión le descuenta a la valoración de selección esta
     * temporada. Es la única vía por la que un evento puede sacarte del plantel,
     * y lo hace a través del umbral, no escribiendo el estado.
     */
    selectionPenalty: number;
    /**
     * Temporadas consecutivas cerradas con estado `trial`. Sale de
     * `state.seasons`, que congela el `nationalStatus` de cada una: no hace falta
     * guardar un contador que pueda desincronizarse.
     */
    trialSeasons: number;
    /**
     * Temporadas consecutivas en el plantel principal (`squad` o `starter`).
     *
     * Sale de `state.seasons` y no de un contador guardado, y eso ademas resuelve
     * gratis el reinicio: una temporada fuera del plantel corta la racha, asi que
     * el que cae y vuelve arranca de nuevo con sus tres temporadas de gracia.
     */
    squadSeasons: number;
}

/**
 * La selección corre EN PARALELO al club.
 *
 * Todo el azar de acá sale de un rng LOCAL re-sembrado desde
 * `semilla:national-call:temporada`. El stream principal no se toca, así que el
 * movimiento del digest congelado se puede atribuir al cambio de reglas y no a
 * un corrimiento de tiradas.
 */
export function evaluateNationalTeam(player: Player, ctx: NationalCallContext): NationalTeamResult {
    const status = player.nationalStatus;
    const outside = (next: NationalStatus, lostShirt = false): NationalTeamResult => {
        player.nationalStatus = next;
        return { calledUp: false, capsGained: 0, debut: false, union: null, status: next, lostShirt };
    };

    // Unión a la que se aspira. Sale del estado de elegibilidad, NO de
    // `player.nationality`: una nacionalidad sin unión modelada no genera
    // selección, y una captura previa manda sobre la nacionalidad.
    const union = targetUnion(player.eligibility);
    if (union === null || !canRepresent(player.eligibility, union)) return outside(status);

    // EL FIXTURE MANDA, y se resuelve antes que cualquier otra cosa. Si la unión
    // no juega nada esta temporada no hay lista, no hay plantel y no hay caps que
    // repartir. No es un borde a parchear: Rusia figura en el catálogo de uniones
    // y no juega ninguna competición porque está suspendida.
    if (internationalSeason(union, ctx.seasonIndex).matches <= 0) return outside(status);

    const inSquad = status === 'squad' || status === 'starter';
    const onTrial = status === 'trial';
    // El castigo que dejo una decision (perder el puesto tras una mala temporada
    // o una lesion larga) entra ACA y no seteando el estado: los caps y el
    // `nationalStatus` los escribe esta funcion y nadie mas.
    const value = selectionValue(player).total - ctx.selectionPenalty;
    const relief = isPreWorldCupSeason(ctx.seasonIndex) ? WORLD_CUP_RELIEF : 0;

    // El descuento entero protege al que esta adentro. Al que cayo hace poco le
    // queda medio: la union lo conoce, pero el puesto ya no es suyo. El que esta
    // a prueba no tiene ninguno -- para eso esta a prueba.
    const recentlyDropped = status === 'dropped'
        && ctx.seasonsSinceLostShirt !== null
        && ctx.seasonsSinceLostShirt < DROPPED_DISCOUNT_SEASONS;
    // La titularidad SE GANA, y se gana con caps DE PLANTEL: los de gira no
    // cuentan. Son los de ESTA union, no el total de la carrera.
    const squadCaps = player.nationalStats[union]?.squadCaps ?? 0;
    const proven = squadCaps >= CAPS_TO_EARN_DISCOUNT;
    const discount = inSquad && proven ? squadDiscountFor(player.age) : recentlyDropped ? DROPPED_DISCOUNT : 0;
    // La pauta se levanta SOLO para el que ya esta en el plantel: el que esta a
    // prueba tiene su propia puerta y no hace falta empujarlo dos veces.
    const pressure = inSquad
        ? Math.max(0, ctx.squadSeasons - PRESSURE_GRACE_SEASONS) * PRESSURE_BY_REPUTATION[repOf(union)]
        : 0;
    const bar = debutLevel(union, player.employment) - discount - relief + pressure;
    // La puerta de edad es de ENTRADA. El veterano que ya esta adentro se
    // sostiene mientras el nivel le de, y el escalon de edad se lo va comiendo.
    const ageOk = inSquad
        ? player.age >= MIN_ENTRY_AGE
        : player.age >= MIN_ENTRY_AGE && player.age <= MAX_ENTRY_AGE;

    /**
     * Al que esta a prueba se le acaba el tiempo.
     *
     * Sale con `lostShirt` en FALSE a proposito: nunca tuvo la camiseta. Perder
     * el puesto y no pasar la prueba son dos cosas distintas, y mezclarlas
     * arruinaba las dos — la tarjeta "Te dejaron afuera de la gira" le salia a
     * alguien que jamas estuvo en el plantel, y la tasa de retorno se iba a 81%
     * porque contaba pruebas fallidas como caidas.
     */
    const trialTimeout = (): NationalTeamResult =>
        ctx.trialSeasons + 1 >= TRIAL_SEASONS_LIMIT ? outside('dropped') : outside('trial');

    if (!ageOk || value < bar) {
        if (onTrial) return trialTimeout();
        if (!inSquad) return outside(status);
        // Estando adentro: la primera temporada por debajo es de gracia y la
        // segunda seguida lo deja afuera de la gira.
        return ctx.missedLastSeason ? outside('dropped', true) : outside('squad');
    }

    const rng = rngFromState(hashSeed(`${ctx.careerSeed}:national-call:${ctx.seasonIndex}`));

    // El que ya esta adentro y se sostiene, va. El que pelea por entrar tira.
    if (!inSquad) {
        const chance = clamp(0, 1, ENTRY_BASE + (value - bar) * ENTRY_SLOPE + player.dynamics.fame * ENTRY_FAME);
        if (!rng.chance(chance)) return onTrial ? trialTimeout() : outside(status);
    }

    // CRUZAR POR POCO NO ES SER DEL PLANTEL. El que pasa el umbral con menos de
    // `TRIAL_MARGIN` puntos va de gira y nada mas; para entrar al plantel
    // principal hay que cruzarlo con margen. Al que ya esta adentro no se lo
    // vuelve a mandar de gira: para eso esta el descuento.
    const withMargin = value - bar >= TRIAL_MARGIN;
    const next: NationalStatus = inSquad || withMargin
        ? (value >= starterLevel(union) - relief ? 'starter' : 'squad')
        : 'trial';
    // Sigue a prueba y ya cumplio su plazo: se le acabo, aunque haya cruzado.
    // Sin `lostShirt`, por lo mismo que `trialTimeout`: nunca tuvo la camiseta.
    if (next === 'trial' && onTrial && ctx.trialSeasons + 1 >= TRIAL_SEASONS_LIMIT) {
        return outside('dropped');
    }

    const debut = status === 'uncapped';
    if (debut) {
        // Debut internacional: la union lo CAPTURA (Reg. 8.2).
        captureFor(player.eligibility, union);
        player.nationalTeam = union;
        player.dynamics.fame = Math.min(100, player.dynamics.fame + 8);
    }
    player.nationalStatus = next;

    // Que parte del fixture juega, y de QUE fixture. El que esta a prueba solo
    // ve los partidos secundarios; el del plantel ve todo.
    const fixture = internationalSeason(union, ctx.seasonIndex);
    const available = next === 'trial'
        ? (fixture.secondaryMatches > 0
            ? fixture.secondaryMatches
            : Math.min(TRIAL_BENCH_FALLBACK, fixture.primaryMatches))
        : fixture.matches;
    if (available <= 0) return outside(status);

    const starter = next === 'starter';
    const [shareLo, shareHi] = next === 'trial'
        ? SHARE_TRIAL
        : starter ? SHARE_STARTER : !proven ? SHARE_UNPROVEN : SHARE_SQUAD;
    const share = clamp(0.1, 1, rng.float(shareLo, shareHi) * ctx.testShare);
    // EL TOPE DURO. Nadie suma mas caps en una temporada que partidos jugo su
    // union -- ni por evento, ni por `testShare`, ni por redondeo.
    const caps = Math.min(available, Math.max(1, Math.round(available * share)));

    // Los caps NO se suman acá: los registra `simulate-season` en
    // `player.nationalStats[union]`, porque son por UNIÓN. Sumarlos en dos
    // lugares era la forma más rápida de que un cambio de elegibilidad dejara
    // el total de una camiseta contando partidos de la otra.
    return { calledUp: true, capsGained: caps, debut, union, status: next, lostShirt: false };
}
