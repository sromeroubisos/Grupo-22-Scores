// EL CAPITÁN — la escalera representativa.
//
// La segunda de las dos escaleras, y la que puede volverse profesional:
// seleccionado de tu unión → PlaDAR → Los Pumitas → Argentina XV → Los Pumas.
//
// ── Los caps valen más que los títulos ──
// Es la regla §5 del CLAUDE.md raíz y acá se hace número: el Cartel que da un
// debut con la mayor es el doble que el de un título de liga, y la cabecera
// muestra los caps antes que la vitrina.
//
// ═══════════════════════════════════════════════════════════════════════════
//  ESTE ARCHIVO TIENE DOS MITADES Y NO SE PARECEN, A PROPÓSITO
// ═══════════════════════════════════════════════════════════════════════════
//
// Los cinco escalones no contestan la misma pregunta, así que no se resuelven
// con el mismo mecanismo. Mezclarlos fue el modelo hasta la 0.21.0 y el síntoma
// era que la selección se sentía un termómetro: subías dos puntos y entrabas,
// bajabas dos y te ibas, todos los años desde cero.
//
//   ARRIBA (unión · academia · M20 · A-XV) — «¿ESTÁS ENTRE LOS MEJORES DE TU
//   CAMADA?». Es una pregunta anual y sin memoria: los tres primeros son CUPOS
//   contra la camada (`data/cohort.ts`) y el A-XV es umbral. Un plantel juvenil
//   se rearma entero cada año porque la camada entera cumple años junta.
//
//   ABAJO (la mayor) — «¿SOS DE LA CASA?». Eso tiene memoria, y la memoria ES el
//   modelo: al que está adentro lo bancan cuando baja, al que se cayó lo siguen
//   conociendo, y al que llevaron una vez de gira todavía lo están mirando. Vive
//   en la segunda mitad, con la elegibilidad del Reg. 8 adelante.
//
// La frontera está en `reachableTrack`, que devuelve como mucho `a-xv`: la
// camiseta de la mayor no se alcanza, se gana.

import type { CaptainPlayer, PositionFamilyId } from '../types/player.ts';
import type { NationalRecord, NationalStatus, Rival, SquadTrack } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { SQUAD_TRACKS } from '../types/captain.ts';
import { cohortMaturity, fitsInSquad, isCupoTrack } from '../data/cohort.ts';
import { ALL_FAMILIES, baseAttributes } from '../data/positions.ts';
import { ovrFromAttributes } from './ovr.ts';
import { hasUnion, internationalSeason, isPreWorldCupSeason, isWorldCupYear, unionName, unionReputation } from '../data/catalogs.ts';
import { FIRST_NAMES, SURNAMES } from '../data/names.ts';
import { hashSeed, rngFromState } from './random.ts';
import { canRepresent, captureFor, targetUnion } from './eligibility.ts';

function clamp(lo: number, hi: number, v: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function clamp01(value: number): number {
    return clamp(0, 1, value);
}

/**
 * Puntos de media que el seleccionador perdona por lo escaso del puesto.
 *
 * El wing paga: hay quince que valen lo mismo. La primera línea cobra: se
 * aprende en años y una lesión deja a la unión sin nadie.
 */
// La banda es de dos puntos y no de cuatro. Con la anterior —de +3 a −1— el
// seleccionado terminaba siendo todo forwards: los backs promediaban CERO caps
// por carrera. Está medido. La escasez tiene que inclinar la balanza, no cerrar
// la puerta: Los Pumas tienen wings.
const SCARCITY: Record<PositionFamilyId, number> = {
    'primera-linea': 2,
    hooker: 2,
    'segunda-linea': 1,
    'tercera-linea': 0,
    'medio-scrum': 1,
    apertura: 1,
    centro: 0,
    'wing-fullback': 0,
};

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA ESCALERA JUVENIL — hasta el A-XV
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Media que pide cada escalón, MEDIDA CONTRA LA CAMADA y no contra un número.
 *
 * ── Por qué son offsets y ya no una tabla (CLAUDE de captain §1.9) ──
 * Era una tabla escrita a mano —union 60, academia 63,5, M20 67, A-XV 71— y su
 * propio comentario decía de dónde salía: «calibrado contra la distribución real
 * de techos del motor, campana con media cerca de 65». O sea que era una
 * DERIVADA de `POTENTIAL_MEAN_GAP`, congelada como parámetro. Vale el día que se
 * escribe y es silenciosamente falsa desde que la población se mueve — y la
 * población se mueve, para eso existe `built`.
 *
 * Se cobró en 0.13.0: al subir la campana (techo mediano 66 → 80), la tabla
 * vieja dejaba al 58,9% de las carreras llegando a la mayor.
 *
 *     union −3,9 · academia −0,4 · M20 +3,1 · seleccionado A +7,1
 *
 * LA MAYOR YA NO ESTÁ EN ESTA TABLA. Tenía su offset (+10,1) hasta la 0.21.0 y
 * ahora se decide con la vara de la segunda mitad, que es otra cosa entera. Si
 * volvés a agregarla acá, mirá primero por qué se fue.
 */
const THRESHOLD_OFFSET: Record<Exclude<SquadTrack, 'club' | 'nacional'>, number> = {
    union: -3.9,
    academia: -0.4,
    m20: 3.1,
    'a-xv': 7.1,
};

/** Cuánto sube el listón por cada punto de reputación de la unión (0–5). */
const REPUTATION_WEIGHT: Record<Exclude<SquadTrack, 'club' | 'nacional'>, number> = {
    union: 0.6,
    academia: 0.8,
    m20: 1.0,
    'a-xv': 1.3,
};

/** Ventanas de edad. Fuera de rango, el escalón no existe para vos. */
const AGE_WINDOW: Partial<Record<SquadTrack, [number, number]>> = {
    union: [17, 40],
    academia: [17, 21],
    m20: [18, 20],
};

/**
 * LOS ESCALONES QUE SE LLAMAN IGUAL EN LAS CIENTO TREINTA Y UNA UNIONES.
 *
 * EL A-XV NO ESTÁ ACÁ, y su ausencia es el mecanismo. El segundo seleccionado se
 * llama por el país —Argentina XV, Nueva Zelanda XV, Kirguistán XV— así que su
 * rótulo no es un dato de esta tabla: es una función del país. Sacarlo del
 * `Record` hace que el compilador rechace cualquier `TRACK_LABEL[track]` con un
 * `SquadTrack` cualquiera y obligue a pasar por `trackLabelOf`, que sabe de dónde
 * sos.
 *
 * Es el §1.5 aplicado antes de que se cobre. «Seleccionado A» decía este renglón,
 * y era exactamente la falla de las cinco veces anteriores: un nombre plausible
 * que la revisión confirma leyéndolo —suena a algo— y que en pantalla nombra otra
 * cosa. El jugador leía «te faltan 8 puntos para la vara de Argentina» y abajo
 * «jugaste 6 partidos con Seleccionado A», o sea que el juego le decía que no
 * había llegado a la selección y que había jugado con una selección.
 */
const FIXED_TRACK_LABEL: Record<Exclude<SquadTrack, 'a-xv'>, string> = {
    club: 'Solo el club',
    union: 'Seleccionado de tu unión',
    academia: 'Academia / PlaDAR',
    m20: 'M20',
    nacional: 'La mayor',
};

/**
 * CÓMO SE LEE UN ESCALÓN, con el país adentro cuando hace falta.
 *
 * El país sale de `unionName` —la misma tabla que nombra a la unión en el resto
 * del juego— y no de `findCountry`: el A-XV es un seleccionado de la UNIÓN, y en
 * el único lugar donde las dos tablas difieren la que manda es ésta.
 */
export function trackLabelOf(track: SquadTrack, countryCode: string): string {
    if (track === 'a-xv') return `${unionName(countryCode)} XV`;
    return FIXED_TRACK_LABEL[track];
}

export function trackIndex(track: SquadTrack): number {
    return SQUAD_TRACKS.indexOf(track);
}

export function higherTrack(a: SquadTrack, b: SquadTrack): SquadTrack {
    return trackIndex(a) >= trackIndex(b) ? a : b;
}

/** La media que te pide un escalón juvenil, con tu unión y tu puesto descontados. */
export function thresholdFor(
    track: Exclude<SquadTrack, 'club' | 'nacional'>,
    player: CaptainPlayer,
): number {
    const rep = unionReputation(player.countryCode);
    // La camada de TU puesto: el arranque de la plantilla es el mismo que usa
    // `reachableTrack` para los cupos, así que los cuatro escalones se miden
    // contra la misma población y no contra dos.
    const camada = cohortMaturity(ovrFromAttributes(player.family, baseAttributes(player.family)));
    return camada + THRESHOLD_OFFSET[track] + rep * REPUTATION_WEIGHT[track] - SCARCITY[player.family];
}

/**
 * Hasta dónde llega la escalera juvenil esta temporada. NUNCA devuelve `nacional`.
 *
 * Se recorre de arriba hacia abajo y gana el primero que alcanzás: nadie juega
 * el M20 si ya está en el A-XV. Sin unión —hay países sin federación— no hay
 * escalera y te quedás en el club, que es la verdad y no un castigo.
 *
 * Quién termina en `nacional` lo decide `evaluateNationalTeam`, y el orden en
 * `simulate-season` es ese: primero hasta dónde llegás solo, después si la mayor
 * te llama. Un convocado de la mayor no juega además el A-XV.
 */
export function reachableTrack(player: CaptainPlayer, rivalOvr: number | null = null): SquadTrack {
    if (!hasUnion(player.countryCode)) return 'club';

    const escalones: Exclude<SquadTrack, 'club' | 'nacional'>[] = ['a-xv', 'm20', 'academia', 'union'];
    for (const track of escalones) {
        const ventana = AGE_WINDOW[track];
        if (ventana && (player.age < ventana[0] || player.age > ventana[1])) continue;

        // Los tres de abajo son CUPOS: hay treinta camisetas de Pumitas y no
        // infinitas, así que no alcanza con superar un número — hay que estar
        // entre los mejores de tu camada EN TU PUESTO.
        if (isCupoTrack(track)) {
            const arranque = ovrFromAttributes(player.family, baseAttributes(player.family));
            if (fitsInSquad(track, player.family, player.ovr, arranque, player.age, rivalOvr)) return track;
            continue;
        }

        if (player.ovr >= thresholdFor(track, player)) return track;
    }
    return 'club';
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA MAYOR — la camiseta, no el escalón
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ LAS TABLAS DE ESTA MITAD VIENEN DE CARRERA DE RUGBY, MEDIDAS CONTRA OTRA
// POBLACIÓN. Están portadas tal como se calibraron allá porque el diseño las
// pidió con esos números, y los dos motores NO reparten los mismos techos: acá
// `POTENTIAL_FLOOR` empuja el techo mediano a ~84 y allá la campana es bastante
// más baja. O sea que la misma vara corta distinto.
//
// El instrumento que lo dice es `__tests__/national-gates.test.ts`, que no tiene
// bandas de calibración justamente para poder leer esto sin que se ponga rojo el
// día que alguien mueva un umbral a propósito. Lo que ese barrido mida es lo que
// hay que discutir, y la respuesta —si hace falta— NO es empujar una tabla a
// mano: es anclarla a `cohortMaturity`, que es lo que la primera mitad de este
// archivo ya hace y por el motivo del §1.9.

/**
 * LOS DOS UMBRALES, por reputación de la unión (0–5).
 *
 * EL ABANICO TIENE QUE SER ANCHO. En rugby el plantel de una unión es diminuto:
 * Gales tiene unos 300 profesionales y Uruguay bastante menos. El corte para
 * jugar en un tier 1 es altísimo en términos absolutos y para un tier 3 entra
 * casi cualquier profesional. En fútbol hasta San Marino tiene liga propia; acá
 * no. Por eso el abanico es más ancho y no más angosto: 27 puntos entre la unión
 * más chica y Nueva Zelanda.
 *
 * EL SALTO DE 61 A 74 ENTRE REP 1 Y REP 2 ES EL MÁS IMPORTANTE DE LA TABLA. Es
 * la frontera que en la vida real separa al que juega un Mundial del que lo
 * mira. No se suaviza para que la curva quede prolija.
 *
 * El umbral de TITULAR no es un segundo corte que haya que pasar para seguir
 * convocado —eso lo resuelve el descuento— sino el que decide si arrancás de
 * titular o entrás del banco, y con eso cuántos tests jugás.
 *
 * ── EL HUECO BAJÓ DE DIEZ A CINCO (0.35.0) ─────────────────────────────────
 * Era de diez puntos en las cuatro bandas de abajo y de nueve en las dos de
 * arriba, con el argumento de que «se debuta antes y se pasa más tiempo en el
 * banco, que es la forma que tiene el rugby». El argumento sigue siendo cierto y
 * lo que cambió es cuánto: cinco puntos separan al que entra del que arranca, y
 * cuatro en las dos de élite.
 *
 * Es una decisión de diseño tomada a mano y conviene decirlo así en vez de
 * inventarle una derivación: el que ya cruzó la vara de su unión pasaba
 * demasiadas temporadas en el banco antes de que el hueco se cerrara solo por
 * crecimiento, y con el descuento protegiéndolo de todos modos, esas temporadas
 * no producían tensión — producían espera.
 *
 * ⚠️ MUEVE CAPS, NO CONVOCATORIAS. Bajar esto no llama a nadie que no estuviera
 * llamado: cambia la fracción del fixture (`SHARE_STARTER` contra `SHARE_SQUAD`)
 * del que YA está adentro. Si lo que hay que mover es quién entra, la perilla es
 * `DEBUT_BY_REPUTATION` y el ancla de más abajo — son dos cosas distintas y
 * confundirlas es tocar la que no era.
 */
const DEBUT_BY_REPUTATION = [57, 61, 74, 78, 81, 84] as const;
const STARTER_BY_REPUTATION = [62, 66, 79, 83, 85, 88] as const;

/**
 * ═══ LAS TABLAS SE USAN COMO ESTÁN. NO HAY TRADUCCIÓN DE ESCALA ═══════════
 *
 * El valor de selección se compara DIRECTO contra los números de arriba: con 78
 * te convoca Argentina, con 83 arrancás de titular, con 92 te convoca siendo
 * amateur. Lo que dice la tabla es lo que pasa, y esa es la decisión de diseño.
 *
 * ── HUBO UN ANCLAJE Y SE SACÓ EN LA 0.36.0 ────────────────────────────────
 * Entre la 0.21.0 y la 0.35.0 estas tablas NO se usaban como estaban: se
 * traducían con `enEscalaDeLaVara`, que las anclaba a `cohortMaturity` con un
 * factor de 0,3. El argumento era que venían portadas de Carrera de Rugby —otra
 * población, otros techos— y la medición que lo sostenía está abajo, porque
 * sigue siendo cierta y hay que poder volver a leerla:
 *
 *     `national-gates.test.ts`, 480 carreras argentinas (rep 3, vara 78):
 *     techo medio 88 · valor de selección en el pico: mediana 95,4
 *     CON LA TABLA LITERAL LLEGAN A LA MAYOR ~480 DE 480
 *
 * O sea: la vara de 78 queda bastante por debajo del pico del jugador mediano de
 * este motor, y por lo tanto la cruza casi todo el mundo. Eso NO es un bug ni un
 * descuido: es la consecuencia conocida y aceptada de que la tabla mande.
 *
 * ⚠️ SI LA PIRÁMIDE HAY QUE VOLVER A CERRARLA, LA PERILLA NO ES ÉSTA. La causa
 * de que casi todos crucen 78 es que `POTENTIAL_FLOOR` mete a TODOS los techos
 * en [84, 99]: la población de este juego es angosta y alta, así que cualquier
 * vara por debajo de 84 la cruza casi entera. Lo que hay que discutir es el piso
 * del techo —o el `POTENTIAL_BAND`—, no volver a poner un factor acá. Un anclaje
 * es una tabla que dice una cosa y hace otra, y eso ya costó un ciclo de
 * confusión: la pantalla decía «te faltan 11» a un jugador de 87 contra una vara
 * documentada en 78.
 *
 * ── LO QUE ESTO LE DEVUELVE A LAS OTRAS CINCO CONSTANTES ───────────────────
 * El descuento, el alivio del Mundial, la presión, el margen de la gira y el
 * recargo del rechazo eran «puntos de tabla» y valían 0,3 puntos de valor cada
 * uno. Ahora valen lo que dicen: un descuento de 3 es tres puntos de valor. La
 * inercia de la camiseta pesa TRES VECES Y MEDIA más que antes, y es lo
 * correcto — esos números se escribieron pensando en la escala de la tabla.
 */
/**
 * Lo que paga DE MÁS el que labura de otra cosa.
 *
 * Es un SOBREPRECIO y no un umbral propio: si la tabla de debut se mueve, esto
 * no se mueve con ella. El interesante es rep 2 —la frontera del tier 1—, donde
 * el recargo de 8 puntos deja la vara en 82: un amateur de pico absoluto, con
 * forma y escasez a favor, llega justo a rozarlo. Que sea apenas posible es
 * exactamente donde tiene que estar.
 */
const AMATEUR_SURCHARGE = [3, 3, 8, 14, 20, 26] as const;

/**
 * EL DESCUENTO POR ESTAR ADENTRO, que es la pieza clave.
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
 * Es INERCIA, NO IMPUNIDAD: dos temporadas seguidas por debajo y salís.
 *
 * Y LA INERCIA SE GASTA CON LOS AÑOS. A igual media, el puesto de uno de 30 está
 * bajo más presión que el de uno de 25: al de 25 lo bancan porque va a mejorar,
 * al de 30 lo miran de reojo porque atrás viene otro. Sin el decaimiento la
 * carrera internacional sale BIMODAL —o te lavan en la gira o te quedás para
 * siempre— y falta el que tuvo carrera de verdad y perdió el puesto a los 29,
 * que es de las historias más comunes del deporte.
 */
const SQUAD_DISCOUNT_BY_AGE: readonly { upTo: number; discount: number }[] = [
    { upTo: 27, discount: 3 },
    { upTo: 30, discount: 2 },
    { upTo: 33, discount: 1 },
];
const SQUAD_DISCOUNT_VETERAN = 0;

function squadDiscountFor(age: number): number {
    for (const tramo of SQUAD_DISCOUNT_BY_AGE) {
        if (age <= tramo.upTo) return tramo.discount;
    }
    return SQUAD_DISCOUNT_VETERAN;
}

/**
 * LA PRESIÓN DEL QUE VIENE ATRÁS — la competencia por el puesto, sin simular a
 * nadie.
 *
 * Cuanto más tiempo llevás con la camiseta, más empuja el que viene atrás, y
 * cuánto empuja depende de la PROFUNDIDAD de la unión.
 *
 * EN REP 0 Y REP 1 VALE CERO, y no es una simplificación: en una unión con tres
 * profesionales no hay nadie atrás empujando. Las carreras internacionales
 * largas de las uniones chicas son correctas y este mecanismo no las toca.
 *
 * Se enchufa con el decaimiento del descuento desde el otro lado: el joven que
 * crece le gana a la presión sin enterarse; el que se aplana a los 26 la pierde
 * a los 28, con veinte caps.
 *
 * Ojo con confundirla con el archirrival: son dos cosas distintas y las dos
 * existen. La presión es LA UNIÓN —cuánta gente hay atrás en abstracto— y el
 * archirrival es UN TIPO CON NOMBRE que se reparte el fixture con vos. La
 * primera te sube la vara; el segundo te saca partidos.
 */
const PRESSURE_BY_REPUTATION = [0, 0, 0.3, 0.6, 0.9, 1.1] as const;

/** Temporadas de gracia antes de que la vara empiece a levantarse. Entraste, te bancan. */
const PRESSURE_GRACE_SEASONS = 3;

/**
 * EL TOPE DE LA PRESIÓN, Y POR QUÉ HACÍA FALTA (0.28.0).
 *
 * Sin tope, `(squadSeasons − gracia) × peso` CRECE PARA SIEMPRE, y el descuento
 * que lo compensa vale 3 como máximo y encima decae con la edad. Hacé el álgebra
 * (§1.6 del CLAUDE de captain): para cualquier unión de rep ≥ 2 existe un número
 * de temporadas a partir del cual la presión supera al descuento, y de ahí en
 * adelante la vara sube sola todos los años. O sea que el mecanismo no modelaba
 * competencia por el puesto: GARANTIZABA la expulsión, y lo único que el nivel
 * del jugador decidía era en qué temporada.
 *
 * Está medido lo que costaba: la permanencia media en el plantel era de 2,4
 * temporadas contra un ciclo de Mundial de 4 años, así que el 96% de las
 * carreras no jugaba un Mundial NUNCA — ni las de media 90, que lo jugaban una
 * de cada cuatro. Un jugador puede sostener la camiseta una década y perderla
 * por nivel o por edad; no por llevar mucho tiempo.
 *
 * DERIVADA del descuento máximo de `SQUAD_DISCOUNT_BY_AGE`: la presión puede
 * comerse el descuento entero del que está adentro, y no más.
 *
 * ── ERA UN 3 ESCRITO A MANO, Y ESO ES EL §1.9 ──────────────────────────────
 * El comentario decía «ESPEJO … si aquel se mueve, este se mueve con él», que es
 * exactamente la mentira con fecha de vencimiento: nada lo movía. Un espejo que
 * se mantiene a mano no es un espejo, es una copia — y el día que el descuento
 * pasara a 4, la presión iba a seguir topeada en 3 sin que nada avisara, con el
 * álgebra del §1.6 volviendo a garantizar la expulsión que este tope vino a
 * cerrar. Se calcula y listo.
 *
 * ⚠️ HAY UNA SOLA UNIDAD Y ES LA DE LA TABLA. El descuento, el alivio del
 * Mundial, la presión, `TRIAL_MARGIN` y el recargo del rechazo son diferencias
 * en la misma moneda que `DEBUT_BY_REPUTATION`, y desde que el anclaje se fue
 * (0.36.0) esa moneda es TAMBIÉN la del valor de selección. O sea: un descuento
 * de 3 son tres puntos de valor, no 0,9 como valía antes. Los cinco pesan más
 * que en toda la historia previa del motor y es a propósito — se escribieron
 * pensando en la escala de la tabla.
 */
const PRESSURE_MAX = SQUAD_DISCOUNT_BY_AGE.reduce(
    (max, tramo) => Math.max(max, tramo.discount),
    SQUAD_DISCOUNT_VETERAN,
);

/**
 * CAPS DE PLANTEL QUE HAY QUE JUNTAR PARA GANARSE EL DESCUENTO.
 *
 * Si el descuento se regalara en el debut, apenas te convocan ya tenés −3 y te
 * quedás doce años: el modelo no produciría carreras internacionales distintas
 * sino la misma carrera con distinto escudo.
 *
 * Los primeros cinco caps son a prueba: competís contra la vara completa todas
 * las temporadas. El que debutó sobre un pico transitorio —una gran temporada, o
 * el bono de proyección a los 20— se cae solo.
 *
 * Se cuentan con `squadCaps` y por UNIÓN: los caps de gira de un `trial` no
 * compran titularidad.
 */
const CAPS_TO_EARN_DISCOUNT = 5;

/**
 * EL MARGEN QUE SEPARA «TE LLEVARON DE GIRA» DE «SOS DEL PLANTEL».
 *
 * El que cruza la vara por menos de esto entra como `trial`: juega partidos
 * secundarios y nada más. Para pasar al plantel principal hay que volver a
 * cruzarla con margen; si no lo logra en `TRIAL_SEASONS_LIMIT`, sale.
 *
 * ES FIJO Y NO RELATIVO, Y NO ES UN DESCUIDO. En una unión chica la vara está en
 * 57 y esos jugadores picotean 80: cruzan por veinte puntos y entran derecho al
 * plantel. Eso ES el fenómeno y no una falla de la fórmula — `trial` significa
 * «los seleccionadores todavía no están seguros de vos», y una unión con tres
 * profesionales SÍ está segura: sos uno de los tres, no hay a quién descartar.
 * EL JUGADOR DE UN SOLO CAP ES UN FENÓMENO DE PLANTELES PROFUNDOS.
 *
 * Pasarlo a un margen relativo emparejaría los tiers y borraría justamente lo
 * que distingue una carrera internacional de un tier 1 de una de tier 3.
 */
const TRIAL_MARGIN = 3;
const TRIAL_SEASONS_LIMIT = 2;

/**
 * MEDIO DESCUENTO PARA EL QUE CAYÓ.
 *
 * Sin esto, `dropped` es un camino de ida por construcción: el que pierde la
 * camiseta tiene que volver a ganarle a la vara COMPLETA a una edad en la que ya
 * viene declinando, y no vuelve nadie. Eso no es perder el puesto: es un
 * sinónimo tardío de retirarse de la selección.
 *
 * La unión ya lo conoce. Durante tres temporadas le reconoce el descuento —
 * alcanza para que vuelva el que recupera nivel, y no alcanza para que vuelva el
 * que se apagó.
 */
const DROPPED_DISCOUNT = 3;
const DROPPED_DISCOUNT_SEASONS = 3;

/**
 * LO QUE CUESTA HABERLE DICHO QUE NO A UNA GIRA.
 *
 * Es el reverso exacto del descuento y por eso vale lo mismo que el máximo de
 * aquél: el que está adentro se gana tres puntos de inercia por ser de la casa,
 * y el que dejó plantada una convocatoria los paga. La simetría no es estética,
 * es lo que hace que la decisión sea legible — «decir que no te cuesta un año de
 * inercia» se entiende, y un número suelto no.
 *
 * ── SIN ESTO, LA TARJETA ERA UNA DECISIÓN DE UNA SOLA OPCIÓN ───────────────
 * El §3 del CLAUDE raíz prohíbe escribir una decisión de una opción, y una de
 * dos donde una no tiene consecuencia es lo mismo con más pasos: si «decir que
 * no» sólo paga Pertenencia y no cuesta nada del lado de la selección, no hay
 * nada que sopesar. El `hint` de la tarjeta lo dice con todas las letras —«la
 * próxima vara te sale más cara»— y esta constante es lo que lo hace verdad.
 *
 * SE OLVIDA. La unión se acuerda dos temporadas y después no: un rechazo que
 * pesara para siempre convertiría una decisión en un castigo, y el que la eligió
 * a los 24 no tendría carrera internacional nunca más por una gira de tres
 * semanas.
 */
const DECLINE_SURCHARGE = SQUAD_DISCOUNT_BY_AGE.reduce(
    (max, tramo) => Math.max(max, tramo.discount),
    SQUAD_DISCOUNT_VETERAN,
);
export const DECLINE_MEMORY_SEASONS = 2;

/**
 * Ventana de edad para ENTRAR al plantel. Al que ya está adentro no lo saca un
 * cumpleaños sino la vara: la caída de media más el escalón de edad lo empujan
 * afuera solos.
 *
 * Con el tope de arriba aplicado también al que está adentro, `dropped` pasa a
 * ser un sinónimo de «cumplió 36» en vez de «perdió el nivel», y la promesa de
 * que se puede volver queda vacía.
 */
const MIN_ENTRY_AGE = 19;
const MAX_ENTRY_AGE = 35;

/**
 * El alivio de la vara alrededor del Mundial: las listas son de 33 y entra gente
 * que otro año no entraría. El año lo dice el calendario (`data/catalogs.ts`),
 * que es el único que sabe de fechas.
 *
 * ── ESTABA UNA TEMPORADA CORRIDA (0.28.0) ──────────────────────────────────
 * Se pedía sólo `isPreWorldCupSeason`, o sea el año ANTERIOR al Mundial. Pero la
 * lista de 33 que el comentario describe es la del Mundial, y la convocatoria
 * que decide quién lo juega es la de ESE año: `gateOpen` abre el torneo con
 * `isWorldCupYear(season − 1)` y la convocatoria corre con el mismo índice. El
 * alivio bajaba la vara justo el año en que no se podía jugar, y la dejaba
 * entera el año en que sí.
 *
 * Ahora corre en las dos: la previa, cuando el cuerpo técnico arma el grupo, y
 * la del Mundial, cuando se firma la lista.
 */
const WORLD_CUP_RELIEF = 2;

/** Fracción del fixture que juega cada uno. Ahí trabaja el umbral de titular. */
const SHARE_STARTER = [0.75, 0.90] as const;
const SHARE_SQUAD = [0.30, 0.50] as const;

/**
 * EL QUE TODAVÍA ESTÁ A PRUEBA JUEGA MENOS.
 *
 * Entre el debut y los cinco caps del descuento estás en la lista pero no sos de
 * la casa: entrás del banco, te perdés alguna ventana. Sin esta banda, la
 * segunda temporada de un debutante da el mismo salto que la de un titular
 * consolidado y el período de prueba se nota sólo en la vara.
 */
const SHARE_UNPROVEN = [0.20, 0.40] as const;

/**
 * El que va de gira juega BUENA PARTE de los pocos partidos secundarios que hay.
 *
 * Es alta a propósito: el pool del que está a prueba ya viene acotado por el
 * calendario —sólo partidos secundarios— y volver a recortarlo por fracción lo
 * dejaría en cero caps la mitad de las veces. Si te llevaron a la gira, jugás la
 * gira.
 */
const SHARE_TRIAL = [0.5, 1] as const;

/**
 * Cuando la unión no tiene fixture secundario esa temporada, el que está a
 * prueba entra igual desde el banco en el torneo principal, acotado.
 *
 * No es un parche: en una unión rep 0 el torneo regional ES todo el calendario y
 * no hay ninguna gira a la que llevarlo. Sin esto, esas uniones no pueden
 * debutar a nadie.
 */
const TRIAL_BENCH_FALLBACK = 2;

// ── La puerta ────────────────────────────────────────────────────────────────
//
// Sólo para el que NO está en el plantel. El que está adentro y se sostiene por
// encima de su vara con descuento va convocado: eso ES la inercia. El azar vive
// acá, en la puerta, para que el que está justo en la vara entre a veces y a
// veces no.
const ENTRY_BASE = 0.12;
const ENTRY_SLOPE = 0.10;
const ENTRY_FAME = 0.002;

function repOf(unionCode: string | null): number {
    return clamp(0, 5, unionReputation(unionCode));
}

/** Nivel para DEBUTAR en esa selección con ese vínculo. EN PUNTOS DE TABLA. */
export function debutLevel(unionCode: string | null, amateur: boolean): number {
    const rep = repOf(unionCode);
    return DEBUT_BY_REPUTATION[rep] + (amateur ? AMATEUR_SURCHARGE[rep] : 0);
}

/**
 * Nivel para arrancar de TITULAR. No lleva el recargo del amateur: ese se paga
 * sólo para entrar. Una vez que la unión te capturó ya demostraste que jugás a
 * ese nivel, y se te mide con la regla de cualquiera.
 */
export function starterLevel(unionCode: string | null): number {
    return STARTER_BY_REPUTATION[repOf(unionCode)];
}

/**
 * LA VARA DICHA EN VALOR DE SELECCIÓN, que es la unidad que el jugador ve.
 *
 * Existe para el instrumento y para la pantalla: adentro del motor todo se
 * compara en puntos de tabla, pero «te faltan tres puntos de media» sólo
 * significa algo en la escala del juego.
 */
export function selectionBarOf(unionCode: string | null, amateur: boolean): number {
    return debutLevel(unionCode, amateur);
}

// ── Los modificadores del valor de selección ─────────────────────────────────

/**
 * FORMA, 0 a +3. Rendiste por encima de lo que se esperaba de tu media.
 *
 * Entra el puntaje de la temporada PASADA, y no puede ser otro: la convocatoria
 * se resuelve al principio del año —los caps son fechas del club que te vas a
 * perder, así que hay que saberlas antes— y el puntaje de ESTA temporada todavía
 * no existe. Es la misma verdad del deporte: te llaman por lo que hiciste.
 *
 * `RATING_PIVOT` (6,6) ES la línea de base, ya normalizada por puesto en
 * `season-rating.ts`, así que acá no hay que volver a normalizar nada. Sin
 * temporada anterior —la primera— la forma no suma ni resta.
 */
const RATING_PIVOT = 6.6;
const RATING_TOP = 9.9;

function formBonus(lastRating: number | null): number {
    if (lastRating === null) return 0;
    return clamp(0, 3, ((lastRating - RATING_PIVOT) / (RATING_TOP - RATING_PIVOT)) * 3);
}

/**
 * NIVEL DEL CLUB, +2 / −3.
 *
 * En rugby el seleccionador mira DÓNDE jugás, no sólo cuánto valés. El que se
 * fue a una liga menor pierde la camiseta aunque su media no baje, y eso le pone
 * un contrapeso deportivo a la decisión de mercado, que hoy no lo tenía.
 *
 * Se resuelve por banda deportiva: banda ≥ 7 son las cuatro grandes más Japón
 * D1, y banda ≤ 2 es lo que queda por debajo de la primera división de
 * cualquier país.
 */
const ELITE_BAND = 7;
const BELOW_TOP_DIVISION_BAND = 2;

/**
 * QUIÉN TE MIRA SI JUGÁS AHÍ. Es el `clubLevelBonus` con su frase al lado.
 *
 * ── POR QUÉ DEVUELVE LAS DOS COSAS JUNTAS ──────────────────────────────────
 * El +2 / −3 existía desde la 0.22.0 y era un número interno: el mercado
 * mostraba sueldo, plazo y lugar en el plantel, y no decía en ninguna parte que
 * la liga que mejor paga puede ser la que te borra de la lista. O sea que el
 * juego cobraba una consecuencia que nunca había enunciado, y desde afuera eso
 * no se lee como una decisión difícil sino como una trampa — es el mismo
 * argumento que ya obligó a escribir `clasicoHint` antes de elegir.
 *
 * La frase sale de ACÁ y no del archivo de la tarjeta, y esa es la única forma
 * de que no mienta: es la misma función la que devuelve el delta que la
 * convocatoria va a aplicar y el renglón que el jugador va a leer. Escrita
 * enfrente, en `data/events/market.ts`, sería una segunda fuente de verdad sobre
 * la misma pregunta, y el día que las bandas se muevan la tarjeta seguiría
 * prometiendo la visibilidad vieja (CLAUDE.md raíz §3.1).
 */
export interface SelectionVisibility {
    /** Lo que le suma o le resta al valor de selección. */
    delta: number;
    /** La frase de la tarjeta. Corta y en el idioma del deporte. */
    label: string;
    tone: 'up' | 'flat' | 'down';
}

export function selectionVisibility(band: number | null, amateur: boolean): SelectionVisibility {
    if (band === null) return { delta: 0, label: 'Sin club resuelto: no te ve nadie.', tone: 'flat' };
    if (band >= ELITE_BAND) return { delta: 2, label: 'Te ven todas las semanas.', tone: 'up' };
    // El castigo por jugar abajo NO se le cobra al amateur: el recargo del
    // amateurismo ya cotiza exactamente eso, y el amateur juega en clubes de
    // banda baja por definición. Cobrárselo dos veces lo deja peleando contra una
    // vara seis puntos más alta que la del profesional del mismo club.
    //
    // Y por eso la frase del amateur tampoco es la del profesional que baja: al
    // amateur no lo castiga la liga, lo castiga el vínculo, y decirle que ahí no
    // lo ven sería cobrarle dos veces también en la pantalla.
    if (band <= BELOW_TOP_DIVISION_BAND) {
        return amateur
            ? { delta: 0, label: 'Te ven poco, y lo que pesa es que sos amateur.', tone: 'flat' }
            : { delta: -3, label: 'Ningún seleccionador ve un partido de esa liga.', tone: 'down' };
    }
    return { delta: 0, label: 'Te ven de vez en cuando.', tone: 'flat' };
}

function clubLevelBonus(band: number | null, amateur: boolean): number {
    return selectionVisibility(band, amateur).delta;
}

/**
 * EDAD, proporcional a LO QUE TE FALTA PARA TU TECHO.
 *
 * Las uniones no eligen por lo que sos: eligen por lo que vas a ser. Un pibe de
 * 20 con 65 y techo 84 se convoca aunque hoy no rinda como un titular, porque el
 * que lo mira ve los diecinueve puntos que le faltan.
 *
 * La proyección se APAGA de a poco y no de golpe: con dos tramos planos el debut
 * sale bimodal —o cruzás a los 20 por proyección o esperás a los 27 por media
 * pura— y la franja de 22 a 26 queda vacía.
 *
 * El techo sigue siendo OCULTO: se usa acá adentro y nunca se muestra. Es la
 * misma regla que `potentialBase`, que el jugador recién ve en el retiro.
 */
const YOUNG_HEADROOM_FACTOR = 0.85;
const YOUNG_HEADROOM_CAP = 18;
const PROJECTION_ENDS_AT = 28;
const FULL_PROJECTION_UNTIL = 24;

function ageBonus(age: number, ovr: number, potential: number): number {
    const headroom = Math.max(0, potential - ovr);
    if (age >= MIN_ENTRY_AGE && age <= FULL_PROJECTION_UNTIL) {
        return Math.min(YOUNG_HEADROOM_CAP, headroom * YOUNG_HEADROOM_FACTOR);
    }
    if (age > FULL_PROJECTION_UNTIL && age < PROJECTION_ENDS_AT) {
        const fade = (PROJECTION_ENDS_AT - age) / (PROJECTION_ENDS_AT - FULL_PROJECTION_UNTIL);
        return Math.min(YOUNG_HEADROOM_CAP * fade, headroom * YOUNG_HEADROOM_FACTOR * fade);
    }
    // El otro extremo: el veterano se apaga en dos tramos en vez de caerse de un
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

// ═══════════════════════════════════════════════════════════════════════════
//  2 bis · POR QUÉ NO — la línea que el jugador sí puede leer
// ═══════════════════════════════════════════════════════════════════════════
//
// La convocatoria era aritmética pura: valor contra vara, y el jugador se
// enteraba del resultado sin enterarse nunca de la causa. Pero el momento más
// grande de una vida de rugby es la lista que se cuelga, y una lista que no te
// incluye tiene SIEMPRE un motivo que alguien te dice en el vestuario.
//
// ── LO QUE ESTA FUNCIÓN NO ES ──────────────────────────────────────────────
// No es el desglose. No expone el descuento, la inercia ni la presión, y no
// tiene que hacerlo: seis números y sus signos no son una explicación, son la
// fórmula mostrada. Lo que hace falta es UNA causa, la dominante, dicha en el
// idioma del deporte — «jugando en esa liga no te van a ver» le dice al jugador
// exactamente qué hacer, y `clubLevel: −3` no le dice nada.
//
// ── EL ORDEN ES LA DECISIÓN ENTERA ─────────────────────────────────────────
// Gana la causa que el jugador PUEDE MOVER, y entre las que no puede, la que
// explica más metros de la brecha. Por eso la liga va antes que el nivel: al que
// le faltan dos puntos de media y juega en la B, decirle «te faltan dos puntos»
// es cierto y es inútil — los va a conseguir y va a seguir sin que lo llamen.
export type SelectionBlocker =
    | 'sin-fixture'
    | 'sin-union'
    | 'muy-joven'
    | 'muy-grande'
    | 'liga'
    | 'amateur'
    | 'presion'
    | 'nivel'
    | 'suerte'
    | 'a-prueba'
    | 'archirrival'
    | 'rechazo';

export interface SelectionDiagnosis {
    blocker: SelectionBlocker;
    /** La frase, tal como se lee. Una sola, sin fórmula adentro. */
    text: string;
}

/**
 * Los puntos que faltan. Es una resta y nada más, y eso es nuevo: hasta la
 * 0.35.0 había que multiplicar por el factor del anclaje para pasar de puntos de
 * tabla a puntos de valor, y las dos escalas convivían. Con la tabla literal hay
 * una sola unidad en toda la mitad de abajo del archivo.
 */
function faltanEnValor(nivel: number, bar: number): number {
    return Math.max(1, Math.round(bar - nivel));
}

export interface DiagnosisInputs {
    value: SelectionValueBreakdown;
    /** Tu nivel y la vara, LOS DOS en puntos de tabla. */
    nivel: number;
    bar: number;
    union: string | null;
    amateur: boolean;
    age: number;
    /** Cuánto de la vara es presión del que viene atrás. */
    pressure: number;
    status: NationalStatus;
    rival: Rival | null;
    /** Temporadas seguidas a prueba que ya lleva cerradas. */
    trialSeasons: number;
    /** Cuánto de la vara es el recargo por haber rechazado una gira. */
    declineSurcharge: number;
}

export function diagnoseSelection(input: DiagnosisInputs): SelectionDiagnosis {
    const {
        value, nivel, bar, union, amateur, age, pressure, status, rival, trialSeasons, declineSurcharge,
    } = input;
    const nombre = union === null ? 'tu unión' : unionName(union);

    if (union === null) {
        return {
            blocker: 'sin-union',
            text: 'No hay selección para la que seas elegible. Tu carrera es la del club, y no es poco.',
        };
    }

    // El que está a prueba no está afuera: está adentro a medias, y lo que
    // necesita saber es cuánto le queda de plazo. Va antes que todo lo demás
    // porque es el único caso donde la respuesta a «por qué no» es «todavía».
    if (status === 'trial') {
        const quedan = Math.max(1, TRIAL_SEASONS_LIMIT - trialSeasons);
        return {
            blocker: 'a-prueba',
            text: `Te llevan de gira y te miran. Te queda ${quedan === 1 ? 'una temporada' : `${quedan} temporadas`} para convencerlos.`,
        };
    }

    if (age < MIN_ENTRY_AGE) {
        return { blocker: 'muy-joven', text: `${nombre} no debuta a nadie antes de los ${MIN_ENTRY_AGE}.` };
    }
    if (age > MAX_ENTRY_AGE) {
        return { blocker: 'muy-grande', text: 'A esta edad ya no se debuta. La puerta se cerró sin hacer ruido.' };
    }

    // ── LA BRECHA, Y QUIÉN SE LLEVA LA CULPA ────────────────────────────────
    const falta = bar - nivel;

    if (falta > 0) {
        // EL RECHAZO VA PRIMERO DE TODO, y es la única causa que el jugador
        // eligió con la mano: si la brecha entera es el recargo de la gira que
        // dejó plantada, cualquier otra explicación sería el juego ocultando la
        // consecuencia de una decisión que él tomó y que la tarjeta le advirtió.
        if (declineSurcharge > 0 && falta <= declineSurcharge) {
            return {
                blocker: 'rechazo',
                text: `Te bajaste de una gira y en ${nombre} se acuerdan. Va a costar un par de temporadas.`,
            };
        }
        // Después la liga: es la única causa que el jugador puede corregir en la
        // ventana de pases de este mismo junio, y la única que vuelve inútil a
        // cualquier otra corrección.
        if (value.clubLevel < 0) {
            return {
                blocker: 'liga',
                text: 'Jugando en esa liga no te van a ver, juegues como juegues.',
            };
        }
        // El vínculo: se le dice al amateur sólo cuando el recargo ES la brecha.
        // Si le faltan quince puntos, el problema no es que trabaje de otra cosa.
        if (amateur && falta <= AMATEUR_SURCHARGE[repOf(union)]) {
            return {
                blocker: 'amateur',
                text: `Tenés el nivel. Lo que no tenés es el vínculo: ${nombre} no arma su plantel con jugadores que entrenan a la noche.`,
            };
        }
        // La presión: el que viene atrás. Sólo cuando explica la brecha entera,
        // porque si no es una excusa y el jugador la va a leer como tal.
        if (pressure > 0 && falta <= pressure) {
            return {
                blocker: 'presion',
                text: `Seguís valiendo lo mismo y la vara subió igual: atrás viene otro y en ${nombre} lo saben.`,
            };
        }
        // ── LAS DOS PUNTAS, Y AHORA CIERRAN CONTRA LA TABLA ─────────────────
        // Se muestran las dos y no la resta sola: «te faltan 9» flotando solo es
        // ilegible, y era peor cuando la vara efectiva no coincidía con la
        // documentada. Con la tabla literal, el número que dice esta línea para
        // Argentina es 78 — el mismo que está escrito arriba en
        // `DEBUT_BY_REPUTATION` y el mismo del doc de diseño. La pantalla, el
        // motor y el papel dicen por fin lo mismo.
        //
        // Y se dice VALOR DE SELECCIÓN y no «media», porque no es la media: son
        // los cinco modificadores de `selectionValue` ya aplicados, y llamarlo
        // media dejaría al jugador comparando contra el número de su cabecera.
        return {
            blocker: 'nivel',
            text: `Tu valor de selección es ${Math.round(value.total)} y la vara de ${nombre} está en `
                + `${Math.round(bar)}. Te faltan ${faltanEnValor(nivel, bar)}.`,
        };
    }

    // ── ESTÁS ARRIBA DE LA VARA Y NO ENTRASTE ───────────────────────────────
    // Dos causas y son distintas: el puesto está lleno (la puerta, que es azar
    // sobre el margen) o hay UN tipo con nombre que se lo quedó. Se prefiere al
    // archirrival cuando existe y está por encima, porque una causa con nombre y
    // apellido se recuerda y un «no entró» no.
    if (rival !== null && rival.ovr >= value.total) {
        const caps = rival.caps > 0
            ? ` Lleva ${rival.caps} ${rival.caps === 1 ? 'cap' : 'caps'}.`
            : '';
        return {
            blocker: 'archirrival',
            text: `${rival.name} ${rival.surname} juega en tu puesto y hoy lo eligen a él.${caps}`,
        };
    }
    return {
        blocker: 'suerte',
        text: 'Tenés el nivel. Lo que falta es que alguien se lesione.',
    };
}

/** Lo que el valor de selección necesita saber del año, y nada más. */
export interface SelectionInputs {
    /** El puntaje de la temporada PASADA, o `null` si es la primera. */
    lastRating: number | null;
    /** Banda deportiva del club de esta temporada. `null` sin club resuelto. */
    clubBand: number | null;
    /** Amateur: el rugby de club no le paga y el seleccionador lo sabe. */
    amateur: boolean;
    /** El techo de hoy. Oculto: entra en la cuenta y no se muestra nunca. */
    potential: number;
}

/**
 * VALOR DE SELECCIÓN — contra esto se compara la vara.
 *
 * Se construye sobre la MEDIA CRUDA y no sobre ninguna media efectiva, por tres
 * razones en orden de peso:
 *
 *   1. Una sola escala en toda la feature. El `minOvr` de los eventos y las
 *      compuertas de los torneos comparan contra cruda; que la convocatoria
 *      comparara contra otra cosa es el tipo de desajuste que genera bugs que
 *      nadie encuentra.
 *   2. La forma se contaría dos veces.
 *   3. Auditable. Con los modificadores nombrados, cuando el número no da se ve
 *      cuál lo mueve — y el desglose es lo que la pantalla puede mostrar.
 *
 * El cuerpo y la cabeza quedan AFUERA de la decisión a propósito. Si la
 * convocatoria se siente desconectada del estado del jugador, se agregan acá
 * como modificadores nombrados. Nada de entradas escondidas.
 */
export function selectionValue(player: CaptainPlayer, inputs: SelectionInputs): SelectionValueBreakdown {
    const ovr = player.ovr;
    const form = formBonus(inputs.lastRating);
    const clubLevel = clubLevelBonus(inputs.clubBand, inputs.amateur);
    const scarcity = SCARCITY[player.family];
    const age = ageBonus(player.age, ovr, inputs.potential);
    return { ovr, form, clubLevel, scarcity, age, total: ovr + form + clubLevel + scarcity + age };
}

export interface NationalCallContext extends SelectionInputs {
    /** Semilla de la carrera. Con la temporada siembra el rng LOCAL de convocatoria. */
    careerSeed: number;
    /** Índice de temporada del CALENDARIO (desde 0), no el número de la carrera. */
    seasonIndex: number;
    /** El Cartel. Abre un poco la puerta al que ya tiene nombre. */
    fame: number;
    /** El otro tipo que juega en tu puesto. Se reparte el fixture con vos. */
    rival: Rival | null;
    /** ¿La temporada pasada quedaste afuera ESTANDO en el plantel? */
    missedLastSeason: boolean;
    /** Temporadas desde que perdiste la camiseta, o `null` si nunca la perdiste. */
    seasonsSinceLostShirt: number | null;
    /** Temporadas consecutivas cerradas a prueba. */
    trialSeasons: number;
    /** Temporadas consecutivas en el plantel principal (`squad` o `starter`). */
    squadSeasons: number;
    /**
     * ¿LE DIJISTE QUE NO A UNA GIRA HACE POCO?
     *
     * DERIVADO del `decisionLog` por quien llama, y no un campo guardado: el
     * historial ya congela qué se eligió y en qué temporada, así que un contador
     * aparte sería una segunda fuente de verdad sobre algo que el estado
     * contiene (CLAUDE.md raíz §2). Es la misma decisión que `missedLastSeason`
     * y las otras tres cuentas de la convocatoria.
     */
    declinedRecently: boolean;
}

export interface NationalTeamResult {
    calledUp: boolean;
    capsGained: number;
    /** Primera convocatoria de la carrera. Merece su tarjeta. */
    debut: boolean;
    /** La unión que te convocó. `null` si no hubo convocatoria. */
    union: string | null;
    status: NationalStatus;
    /** `true` si en ESTA temporada perdiste la camiseta. También merece la suya. */
    lostShirt: boolean;
    /** Lo que sumó el archirrival. Su marcador corre esté donde esté el tuyo. */
    rivalCaps: number;
    /** El desglose, para que la pantalla pueda decir por qué. */
    value: SelectionValueBreakdown | null;
    /** La vara que había que cruzar, con todo ya aplicado. */
    bar: number | null;
    /**
     * LA CAUSA DOMINANTE, en una línea que se lee.
     *
     * Sale con la convocatoria y no se calcula después en la pantalla, porque
     * acá adentro están las tres cosas que la pantalla no puede reconstruir: la
     * vara con todo aplicado, cuánto de esa vara es presión, y si la puerta se
     * tiró y salió mal. Recalcularla afuera sería una segunda cuenta de la misma
     * pregunta, con dos respuestas posibles el día que una de las dos se quede
     * vieja (CLAUDE.md raíz §3.1).
     *
     * `null` cuando el jugador está adentro y titular: ahí no hay nada que
     * explicar y una línea de más leería como una excusa.
     */
    diagnosis: SelectionDiagnosis | null;
}

/**
 * LA CONVOCATORIA DE LA MAYOR.
 *
 * Muta `national` —el estado del jugador con su unión— y devuelve lo que hay que
 * contar. Los caps NO se suman acá: los registra `simulate-season` en
 * `national.byUnion`, porque son por camiseta. Sumarlos en dos lugares sería la
 * forma más rápida de que un cambio de elegibilidad deje el total de una unión
 * contando partidos de la otra.
 *
 * TODO EL AZAR SALE DE UN RNG LOCAL re-sembrado desde
 * `semilla:national-call:temporada`. El stream principal de la carrera no se
 * toca, así que el movimiento del digest congelado se puede atribuir al cambio
 * de reglas y no a un corrimiento de tiradas. Es la misma decisión que la
 * semilla de un Momento y la de un torneo.
 */
export function evaluateNationalTeam(
    player: CaptainPlayer,
    national: NationalRecord,
    ctx: NationalCallContext,
): NationalTeamResult {
    const status = national.status;
    const rng = rngFromState(hashSeed(`${ctx.careerSeed}:national-call:${ctx.seasonIndex}`));

    const afuera = (
        next: NationalStatus,
        lostShirt = false,
        diagnosis: SelectionDiagnosis | null = null,
    ): NationalTeamResult => {
        national.status = next;
        return {
            calledUp: false,
            capsGained: 0,
            debut: false,
            union: null,
            status: next,
            lostShirt,
            rivalCaps: 0,
            value: null,
            bar: null,
            diagnosis,
        };
    };

    // La unión a la que aspirás sale del estado de elegibilidad y NO de
    // `player.countryCode`: una nacionalidad sin unión modelada no genera
    // selección, y una captura previa manda sobre la nacionalidad.
    const union = targetUnion(national.eligibility);
    if (union === null || !canRepresent(national.eligibility, union)) {
        return afuera(status, false, {
            blocker: 'sin-union',
            text: 'No hay selección para la que seas elegible. Tu carrera es la del club, y no es poco.',
        });
    }

    // EL FIXTURE MANDA, y se resuelve antes que cualquier otra cosa. Si la unión
    // no juega nada esta temporada no hay lista, no hay plantel y no hay caps que
    // repartir. No es un borde a parchear: Rusia figura en el catálogo de uniones
    // y no juega ninguna competición porque está suspendida.
    const fixture = internationalSeason(union, ctx.seasonIndex);
    if (fixture.matches <= 0) {
        return afuera(status, false, {
            blocker: 'sin-fixture',
            text: `${unionName(union)} no jugó nada este año. No hubo lista que integrar.`,
        });
    }

    const inSquad = status === 'squad' || status === 'starter';
    const onTrial = status === 'trial';

    const value = selectionValue(player, ctx);
    // ACÁ Y NADA MÁS QUE ACÁ SE CAMBIA DE ESCALA. De esta línea para abajo todo
    // —vara, descuento, alivio, presión, margen de la gira, pendiente de la
    // puerta— habla en puntos de la tabla, tal como fue calibrada.
    const nivel = value.total;
    const enVentanaDeMundial = isWorldCupYear(ctx.seasonIndex) || isPreWorldCupSeason(ctx.seasonIndex);
    const relief = enVentanaDeMundial ? WORLD_CUP_RELIEF : 0;

    // El descuento entero protege al que está adentro. Al que cayó hace poco le
    // queda el suyo: la unión lo conoce, pero el puesto ya no es suyo. El que
    // está a prueba no tiene ninguno — para eso está a prueba.
    const recentlyDropped = status === 'dropped'
        && ctx.seasonsSinceLostShirt !== null
        && ctx.seasonsSinceLostShirt < DROPPED_DISCOUNT_SEASONS;
    // La titularidad SE GANA, y se gana con caps DE PLANTEL: los de gira no
    // cuentan. Son los de ESTA unión, no el total de la carrera.
    const squadCaps = national.byUnion[union]?.squadCaps ?? 0;
    const proven = squadCaps >= CAPS_TO_EARN_DISCOUNT;
    const discount = inSquad && proven
        ? squadDiscountFor(player.age)
        : recentlyDropped ? DROPPED_DISCOUNT : 0;
    // La vara se levanta SÓLO para el que ya está en el plantel: el que está a
    // prueba tiene su propia puerta y no hace falta empujarlo dos veces.
    const pressure = inSquad
        ? Math.min(
            PRESSURE_MAX,
            Math.max(0, ctx.squadSeasons - PRESSURE_GRACE_SEASONS) * PRESSURE_BY_REPUTATION[repOf(union)],
        )
        : 0;
    // EL RECARGO DEL QUE DIJO QUE NO va del lado de la vara y no de la puerta, y
    // esa ubicación es la decisión: en la puerta sólo le pegaría al que pelea por
    // entrar, y el rechazo tiene que costarle también —sobre todo— al que ya
    // estaba adentro y se bajó. Es el reverso del descuento y vive en su misma
    // línea, en puntos de tabla como todo lo de acá abajo.
    const declineSurcharge = ctx.declinedRecently ? DECLINE_SURCHARGE : 0;
    const bar = debutLevel(union, ctx.amateur) - discount - relief + pressure + declineSurcharge;

    // La puerta de edad es de ENTRADA. El veterano que ya está adentro se
    // sostiene mientras el nivel le dé, y el escalón de edad se lo va comiendo.
    const ageOk = inSquad
        ? player.age >= MIN_ENTRY_AGE
        : player.age >= MIN_ENTRY_AGE && player.age <= MAX_ENTRY_AGE;

    const rivalCaps = rivalCapsThisSeason(ctx.rival, union, fixture.matches, rng);

    // LA CAUSA, armada UNA vez y con todo ya aplicado. Se calcula acá —después
    // de la vara y antes de cualquier salida— porque las tres entradas que no se
    // pueden reconstruir desde afuera (la vara final, cuánta de ella es presión,
    // y el estado con el que se entró al año) están vivas exactamente en este
    // punto y en ninguno posterior: `afuera` ya pisó `national.status`.
    const diagnosis = diagnoseSelection({
        value,
        nivel,
        bar,
        union,
        amateur: ctx.amateur,
        age: player.age,
        pressure,
        status,
        rival: ctx.rival,
        trialSeasons: ctx.trialSeasons,
        declineSurcharge,
    });

    /**
     * Al que está a prueba se le acaba el tiempo.
     *
     * Sale con `lostShirt` en FALSE a propósito: nunca tuvo la camiseta. Perder
     * el puesto y no pasar la prueba son dos cosas distintas, y mezclarlas
     * arruina las dos — la tarjeta «te dejaron afuera» le saldría a alguien que
     * jamás estuvo en el plantel.
     */
    const seLeAcabo = (): NationalTeamResult => {
        const seAcabo = ctx.trialSeasons + 1 >= TRIAL_SEASONS_LIMIT;
        // Y acá la causa NO es la del diagnóstico general: al que se le venció el
        // plazo no le falta un punto de media, le faltó tiempo. Decirle «te
        // faltan dos puntos» el año en que lo dan de baja sería contestar la
        // pregunta que no hizo.
        const out = seAcabo
            ? afuera('dropped', false, {
                blocker: 'a-prueba',
                text: `Se te acabó el plazo. ${unionName(union)} miró para otro lado.`,
            })
            : afuera('trial', false, diagnosis);
        return { ...out, rivalCaps };
    };

    if (!ageOk || nivel < bar) {
        if (onTrial) return seLeAcabo();
        if (!inSquad) return { ...afuera(status, false, diagnosis), rivalCaps };
        // Estando adentro: la primera temporada por debajo es de gracia y la
        // SEGUNDA SEGUIDA te deja afuera. Las dos temporadas no se cuentan con un
        // contador sino con `missedLastSeason`, que ya dice «venías en el plantel
        // y el año pasado no fuiste»: si eso es cierto y este año tampoco das,
        // van dos. Un contador guardado sería una segunda fuente de verdad sobre
        // algo que el historial ya congela.
        const out = ctx.missedLastSeason
            ? afuera('dropped', true, diagnosis)
            : afuera('squad', false, diagnosis);
        return { ...out, rivalCaps };
    }

    // El que ya está adentro y se sostiene, va. El que pelea por entrar, tira.
    if (!inSquad) {
        const chance = clamp01(ENTRY_BASE + (nivel - bar) * ENTRY_SLOPE + ctx.fame * ENTRY_FAME);
        if (!rng.chance(chance)) {
            if (onTrial) return seLeAcabo();
            // Cruzaste la vara y la puerta no se abrió: el puesto está lleno. Es
            // el único camino que llega acá con `nivel >= bar`, así que el
            // diagnóstico ya dice «tenés el nivel» o nombra al archirrival —
            // por eso no hace falta un texto propio.
            return { ...afuera(status, false, diagnosis), rivalCaps };
        }
    }

    // CRUZAR POR POCO NO ES SER DEL PLANTEL. El que pasa la vara por menos de
    // `TRIAL_MARGIN` va de gira y nada más; para entrar al plantel principal hay
    // que cruzarla con margen. Al que ya está adentro no se lo vuelve a mandar de
    // gira: para eso está el descuento.
    const withMargin = nivel - bar >= TRIAL_MARGIN;
    const next: NationalStatus = inSquad || withMargin
        ? (nivel >= starterLevel(union) - relief ? 'starter' : 'squad')
        : 'trial';
    // Sigue a prueba y ya cumplió su plazo: se le acabó, aunque haya cruzado.
    if (next === 'trial' && onTrial && ctx.trialSeasons + 1 >= TRIAL_SEASONS_LIMIT) {
        return {
            ...afuera('dropped', false, {
                blocker: 'a-prueba',
                text: `Volviste a quedar justo, y el plazo no espera. ${unionName(union)} cerró la carpeta.`,
            }),
            rivalCaps,
        };
    }

    const debut = national.debutSeason === null;
    if (debut) {
        // Debut internacional: la unión te CAPTURA (Reg. 8.2).
        captureFor(national.eligibility, union);
    }
    national.status = next;

    // Qué parte del fixture jugás, y de QUÉ fixture. El que está a prueba sólo ve
    // los partidos secundarios; el del plantel ve todo.
    const available = next === 'trial'
        ? (fixture.secondaryMatches > 0
            ? fixture.secondaryMatches
            : Math.min(TRIAL_BENCH_FALLBACK, fixture.primaryMatches))
        : fixture.matches;
    if (available <= 0) return { ...afuera(status, false, diagnosis), rivalCaps };

    const [shareLo, shareHi] = next === 'trial'
        ? SHARE_TRIAL
        : next === 'starter' ? SHARE_STARTER : !proven ? SHARE_UNPROVEN : SHARE_SQUAD;

    // EL ARCHIRRIVAL SE LLEVA SU PARTE. En cada convocatoria entra uno de los dos:
    // si está mejor que vos te come la lista, y si está peor la camiseta es tuya.
    // Entra multiplicando la fracción y no la vara, y esa separación importa —
    // la vara es la unión mirándote, y esto es un tipo concreto sacándote fechas.
    const share = clamp(0.1, 1, rng.float(shareLo, shareHi) * rivalFactor(ctx.rival, value.total));

    // EL TOPE DURO. Nadie suma más caps en una temporada que partidos jugó su
    // unión — ni por evento, ni por archirrival, ni por redondeo.
    const caps = Math.min(available, Math.max(1, Math.round(available * share)));

    return {
        calledUp: true,
        capsGained: caps,
        debut,
        union,
        status: next,
        lostShirt: false,
        rivalCaps,
        value,
        bar,
        // AL TITULAR NO SE LE EXPLICA NADA, y esa es la regla entera: la línea
        // existe para contestar «¿por qué no?», así que al que arrancó de
        // titular no le corresponde ninguna. Al del banco sí — «tenés el nivel,
        // falta que alguien se lesione» es exactamente su año.
        diagnosis: next === 'starter' ? null : diagnosis,
    };
}

/**
 * Cuánto te recorta el archirrival la parte que ibas a jugar.
 *
 * Entre 0,35 y 1,25: el que le saca diez puntos de valoración juega todo lo que
 * el escalón le da, y el que va diez abajo mira desde el banco. Que el tope de
 * arriba pase de 1 es lo que hace que ganarle la pulseada se note — y el tope
 * duro del fixture está aplicado después, así que no puede desbordar.
 */
function rivalFactor(rival: Rival | null, value: number): number {
    if (rival === null) return 1;
    return clamp(0.35, 1.25, 0.8 + (value - rival.ovr) * 0.06);
}

/**
 * LOS CAPS DEL ARCHIRRIVAL, que corren estés donde estés.
 *
 * Es una presencia, no una reacción (`types/captain.ts`): su marcador no mira el
 * tuyo. Si su nivel le alcanza para la vara de la unión, juega su parte del
 * fixture; si no, no juega. Por eso el año que te lesionás no «hereda» tus caps
 * y el año que sos titular él sigue sumando los suyos — que es exactamente lo
 * que pasa con dos tipos del mismo puesto en un plantel de treinta.
 *
 * Se lo mide sin recargo de amateur: no sabemos dónde juega, y suponerle un
 * vínculo sería inventarle una carrera que el motor no simula.
 */
function rivalCapsThisSeason(
    rival: Rival | null,
    union: string,
    fixtureMatches: number,
    rng: Rng,
): number {
    if (rival === null || fixtureMatches <= 0) return 0;
    const bar = debutLevel(union, false);
    if (rival.ovr < bar) return 0;
    const [lo, hi] = rival.ovr >= starterLevel(union) ? SHARE_STARTER : SHARE_SQUAD;
    return Math.min(fixtureMatches, Math.max(1, Math.round(fixtureMatches * rng.float(lo, hi))));
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LO QUE CADA CARRIL DEJA EN LA TEMPORADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CUÁNTOS PARTIDOS SE JUEGAN EN CADA CARRIL QUE NO ES LA MAYOR.
 *
 * Existía el escalón y no existían los partidos: el juego decía «Seleccionado A»
 * en la cabecera y la temporada seguía contando sólo las fechas del club, así que
 * una convocatoria no se veía en ningún número.
 *
 * NO SON CAPS y por eso no tocan `national.caps`: un cap es de la mayor, y esa
 * distinción es de las que el rugby no perdona. Son partidos: cuentan para la
 * planilla, para el desgaste y para el tope de treinta, igual que los del club.
 *
 * Los números salen del calendario real de cada carril:
 *   · unión   — el Argentino de Mayores, cuatro fechas
 *   · academia— el torneo de desarrollo de la franquicia
 *   · M20     — el Mundial M20 son cinco partidos, y son CINCO desde 1988
 *   · A-XV    — Súper Rugby Américas / Nations Cup, una ventana corta
 */
const REPRESENTATIVE_MATCHES: Record<Exclude<SquadTrack, 'club' | 'nacional'>, number> = {
    union: 4,
    academia: 5,
    m20: 5,
    'a-xv': 6,
};

/**
 * Y CUÁNTAS FECHAS DEL CLUB TE CUESTA CADA UNO.
 *
 * Los dos juveniles no cuestan nada: el M20 y la academia se juegan en la ventana
 * de verano, cuando el club no juega. Los dos de mayores sí, y uno a uno como los
 * caps — el Argentino y la ventana del A-XV caen adentro de la temporada del club
 * y te sacan de esa fecha.
 */
const REPRESENTATIVE_CLUB_COST: Record<Exclude<SquadTrack, 'club' | 'nacional'>, number> = {
    union: 1,
    academia: 0,
    m20: 0,
    'a-xv': 1,
};

export function representativeMatchesOf(track: SquadTrack): number {
    if (track === 'club' || track === 'nacional') return 0;
    return REPRESENTATIVE_MATCHES[track];
}

/** Las fechas del club que se pierden por jugar ese carril. */
export function representativeClubCostOf(track: SquadTrack): number {
    if (track === 'club' || track === 'nacional') return 0;
    return REPRESENTATIVE_MATCHES[track] * REPRESENTATIVE_CLUB_COST[track];
}

/** El registro vacío con el que arranca cualquier carrera. */
export function emptyNational(eligibility: NationalRecord['eligibility']): NationalRecord {
    return {
        track: 'club',
        bestTrack: 'club',
        caps: 0,
        debutSeason: null,
        status: 'uncapped',
        byUnion: {},
        eligibility,
    };
}

/** Registra los caps de la temporada en la planilla de esa unión. */
export function recordCaps(national: NationalRecord, union: string, caps: number, inSquad: boolean): void {
    const fila = national.byUnion[union] ?? { caps: 0, squadCaps: 0 };
    fila.caps += caps;
    if (inSquad) fila.squadCaps += caps;
    national.byUnion[union] = fila;
}

/**
 * El archirrival: nació el mismo año que vos y juega en tu puesto.
 *
 * Arranca apenas por encima —para que la pelea exista desde el principio— y
 * después crece solo, sin depender de lo que hagas vos. Es una presencia, no una
 * reacción.
 */
export function createRival(player: CaptainPlayer, rng: Rng): Rival {
    return {
        name: rng.pick(FIRST_NAMES),
        surname: rng.pick(SURNAMES),
        ovr: player.ovr + rng.int(1, 5),
        caps: 0,
    };
}

/**
 * El rival también envejece.
 *
 * Sube parejo hasta el pico y después afloja, con su propio ruido. No mira lo que
 * hiciste vos: si lo hiciera, el juego se volvería una goma que siempre te empata,
 * y eso se nota.
 */
export function ageRival(rival: Rival, age: number, rng: Rng): Rival {
    const delta = age < 26 ? rng.float(1.1, 2.6)
        : age < 30 ? rng.float(-0.2, 0.8)
            : rng.float(-2.4, -0.4);
    return {
        ...rival,
        ovr: Math.min(99, Math.max(30, Math.round(rival.ovr + delta))),
    };
}
