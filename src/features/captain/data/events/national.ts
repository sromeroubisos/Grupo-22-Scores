// EL CAPITÁN — eventos de la vía representativa. Prefijo `nt-`.
//
// La escalera que puede volverse profesional, y la que le pelea el tiempo al
// club. Acá vive el archirrival: el otro tipo que juega en tu puesto y con el
// que se reparten una sola camiseta.

import type { CaptainEvent } from '../../types/event.ts';
import type { CaptainState } from '../../types/captain.ts';
import { availableUnions, secondFlagOf, targetUnion } from '../../engine/eligibility.ts';
import { hashSeed } from '../../engine/random.ts';
import { findCountry, getClub, hasUnion, unionName, unionReputation } from '../catalogs.ts';

export const FLAG_SWITCH_EVENT_ID = 'nt-cambiar-de-bandera';
export const TWO_FLAGS_EVENT_ID = 'nt-dos-banderas';
export const TRIAL_TOUR_EVENT_ID = 'nt-la-lista-de-gira';
// Sin tildes NI en los ids. El id es una clave —viaja al guardado, entra en el
// digest y se compara con `===`— así que un acento acá es una fuente de bugs de
// codificación a cambio de nada: el que se lee es el `title`.
export const RIVAL_BEAT_YOU_EVENT_ID = 'nt-te-saco-el-puesto';
export const RIVAL_INJURED_EVENT_ID = 'nt-se-lesiono';
export const RIVAL_LAST_EVENT_ID = 'nt-el-ultimo';

/**
 * LAS UNIONES QUE SALEN A BUSCAR JUGADORES HECHOS, en orden estable.
 *
 * Es el último recurso y no el primero: se usa sólo cuando el estado no tiene
 * nada mejor que decir (ver `callingUnionOf`). La lista son las que en el rugby
 * de verdad arman planteles con nacionalizados —Italia, España, Portugal,
 * Rumanía, Georgia, Alemania, Bélgica— más Japón, que es el caso más conocido
 * de todos y el que obliga a que la tarjeta no diga «europea».
 *
 * El orden es fijo y se elige por hash de la semilla: iterar un `Set` o
 * `Object.keys` para elegir sería no-determinismo encubierto.
 */
const SUITORS: readonly string[] = ['it', 'es', 'pt', 'ro', 'ge', 'de', 'be', 'jp'];

/**
 * QUIÉN TE ESTÁ LLAMANDO.
 *
 * Tres escalones, del que sabe más al que sabe menos, y los dos primeros salen
 * del estado en vez de inventarse:
 *
 *   1 · LA QUE YA TE GANASTE. Cinco temporadas registrado en otra unión te dan
 *       el derecho del 8.1(c) y el motor lo lleva anotado en `claims`. Si lo
 *       tenés, la que llama es ésa: no hace falta inventar a nadie cuando el
 *       reglamento ya dice quién puede.
 *   2 · DONDE JUGÁS. Al que se nacionaliza lo nacionaliza el país de su club, y
 *       eso es el rugby entero: los proyectos son del club que te tiene.
 *   3 · LA QUE SALE A BUSCARTE. Recién acá se sortea, y por hash de la semilla:
 *       la misma carrera recibe siempre el mismo llamado, hoy y en la recarga.
 *
 * NO CONSUME EL RNG del motor, y esa es la razón de que use `hashSeed` en vez
 * de pedir un `rng`: esta función se llama para DIBUJAR la tarjeta, así que
 * corre en cada render y una tirada acá correría la carrera entera.
 */
export function callingUnionOf(state: CaptainState): string | null {
    const propia = targetUnion(state.national.eligibility);

    const ganada = availableUnions(state.national.eligibility).find((u) => u !== propia);
    if (ganada) return ganada;

    const club = state.player.clubId ? getClub(state.player.clubId) : null;
    if (club && hasUnion(club.countryCode) && club.countryCode !== propia) return club.countryCode;

    const candidatas = SUITORS.filter((u) => u !== propia);
    if (candidatas.length === 0) return null;
    return candidatas[hashSeed(`bandera:${state.seed}`) % candidatas.length];
}

/**
 * La tarjeta de la otra bandera, con la unión que llama adentro.
 *
 * Se arma en el momento por el mismo motivo que las de mercado: el texto tiene
 * que decir el nombre. Lo que NO se toca es el `resultText` de los desenlaces
 * —eso sí se persiste, en `decisionLog[].text`, y entra en el digest congelado—,
 * así que la tarjeta cambia de cara sin mover una sola carrera.
 */
export function buildFlagSwitchEvent(state: CaptainState): CaptainEvent {
    const union = callingUnionOf(state);
    if (union === null) return CAMBIAR_DE_BANDERA;
    return {
        ...CAMBIAR_DE_BANDERA,
        unionCode: union,
        text: `${unionName(union)} te ofrece nacionalizarte. Jugarías el Mundial el año que viene. La tuya te tiene en carpeta y nada más.`,
    };
}

const CAMBIAR_DE_BANDERA: CaptainEvent = {
    id: FLAG_SWITCH_EVENT_ID,
    category: 'seleccion',
    title: 'La otra bandera',
    text: 'Otra unión te ofrece nacionalizarte. Jugarías el Mundial el año que viene. La tuya te tiene en carpeta y nada más.',
    weight: 6,
    // `raro` y no `especial`: es la única decisión del catálogo que el
    // propio texto declara irreversible, y parte la carrera en dos.
    rarity: 'raro',
    repeatable: false,
    requires: { tracks: ['a-xv', 'union', 'academia'], minAge: 22, minOvr: 68, needsUnion: true },
    options: [
        {
            id: 'aceptar',
            label: 'Cambiar de bandera',
            hint: 'Jugás un Mundial. No hay vuelta atrás: es para siempre.',
            outcomes: [
                // `switchUnion` es lo que hace que esto pase de verdad: agrega el
                // claim y te captura, así que a partir del año que viene la
                // convocatoria te mide contra la vara de la unión nueva. Hasta la
                // 0.33.0 esta opción pagaba fama y plata y NADA MÁS —el flag no lo
                // leía nadie—, o sea que la única decisión que el juego declara
                // irreversible no cambiaba una sola línea del estado.
                { weight: 100, effect: { fame: 8, money: 40000, switchUnion: true, flags: { 'cambio-de-bandera': 1 } }, resultText: 'Cantaste otro himno. En tu país lo entendieron a medias y en tu club no lo entendieron nada.' },
            ],
        },
        {
            id: 'decir-que-no',
            label: 'Decir que no',
            hint: 'Seguís esperando la tuya. Puede no llegar nunca.',
            outcomes: [
                { weight: 100, effect: { belonging: 5, attrs: { liderazgo: 2 }, flags: { 'dijo-que-no': 1 } }, resultText: 'Dijiste que esperabas la tuya. Salió en dos diarios y en el club lo pegaron en la cartelera.' },
            ],
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  LAS DOS BANDERAS — la única decisión de elegibilidad de la carrera
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POR QUÉ ESTA TARJETA ES LA MÁS IMPORTANTE DEL ARCHIVO ──────────────────
// La escalera representativa no tenía NI UNA decisión. Repasá sus entradas —
// media, forma, nivel del club, escasez, edad, unión, archirrival, descuento,
// inercia, presión— y son todas estado o constante: el jugador miraba. Es el
// problema de agencia una capa más arriba, y la respuesta más barata estaba ya
// escrita: `engine/eligibility.ts` modelaba el 8.1(c) entero y producía una
// CONSECUENCIA —la captura del 8.2— donde tenía que producir una ELECCIÓN.
//
// El reloj de los sesenta meses corría en silencio, el jugador se enteraba
// cuando ya había pasado, y la decisión más dramática del rugby real pasaba sin
// que nadie la tomara.
//
// ── LA TERCERA OPCIÓN ES UNA OPCIÓN DE VERDAD ──────────────────────────────
// «No elegir» no está de relleno ni para cumplir con la regla de que nunca haya
// una sola opción: es la respuesta que da la mayoría de los jugadores de verdad,
// y tiene su consecuencia declarada —te captura el que llame primero—. Un dilema
// donde postergar es legítimo es mejor dilema que uno donde hay que resolver.
//
// ── Y NINGUNA DE LAS TRES TIENE UN VERBO NUEVO ─────────────────────────────
// Esperar bloquea el llamado del club de origen mientras dure, y eso se DERIVA
// del `decisionLog` (ver `event-selector.ts`). Volver usa `returnHome`, que ya
// existía, y el reinicio de la cuenta de los sesenta meses lo hace solo
// `advanceRegistration` — o sea que la consecuencia deportiva de la decisión ya
// estaba implementada desde el día uno, esperando que alguien la preguntara.

/**
 * Los meses dichos en la unidad del juego, que son TEMPORADAS.
 *
 * `advanceRegistration` suma de a doce (`MONTHS_PER_SEASON`) porque El Capitán
 * avanza de temporada en temporada y no tiene meses. Escribir «en 10 meses
 * cumplís los 60» sería una precisión que el motor no tiene: el reloj sólo puede
 * marcar múltiplos de un año, y una tarjeta que promete meses le está mintiendo
 * al jugador sobre cuándo va a poder decidir.
 */
function temporadas(months: number): string {
    const n = Math.max(1, Math.round(months / 12));
    return n === 1 ? 'una temporada' : `${n} temporadas`;
}

function nombreDePais(code: string): string {
    return findCountry(code)?.nameEs ?? unionName(code);
}

/**
 * La tarjeta de las dos banderas, con el reloj adentro.
 *
 * Devuelve `null` cuando no hay dos banderas que contar —no hay segunda unión, o
 * ya te capturaron—. El selector ya lo filtró con `secondFlagMonths`, así que
 * esto es el cinturón sobre los tiradores: una tarjeta que no se puede armar
 * deja seguir la carrera en vez de trabarla.
 */
export function buildTwoFlagsEvent(state: CaptainState): CaptainEvent | null {
    const otra = secondFlagOf(state.national.eligibility);
    if (otra === null || otra.remaining <= 0) return DOS_BANDERAS;

    const propia = targetUnion(state.national.eligibility);
    if (propia === null) return DOS_BANDERAS;

    const home = state.homeClubId ? getClub(state.homeClubId) : null;
    const puedeVolver = home !== null && state.player.clubId !== state.homeClubId;

    const suNombre = unionName(otra.union);
    const miNombre = unionName(propia);
    const dondeVivo = nombreDePais(otra.union);

    // EL PESO DE LA OTRA, en una palabra y sacado del dato. La reputación de la
    // unión es la misma que decide la vara de la convocatoria, así que la tarjeta
    // no puede prometer un tier que el motor no vaya a cobrar.
    const tier = unionReputation(otra.union) >= 3 ? 'Es un tier 1.' : 'Es una unión chica, pero juega.';

    // NUNCA FUISTE NI AL BANCO, y se pregunta en vez de afirmarse: al que ya tuvo
    // un cap con la suya no se le puede decir eso —la captura ya lo habría
    // sacado de esta tarjeta— pero sí al que estuvo en un carril juvenil, y ahí
    // la frase tiene que cambiar o miente.
    const nuncaLlamado = state.national.bestTrack === 'club'
        ? `Nunca fuiste ni al banco de ${miNombre}.`
        : `De ${miNombre} llegaste hasta las juveniles y ahí quedaste.`;

    const opciones: CaptainEvent['options'] = [
        {
            id: 'esperar-la-otra',
            label: `Esperar a ${suNombre}`,
            hint: `${tier} ${nuncaLlamado} Si te llaman los tuyos antes, se cierra sola.`,
            outcomes: [
                {
                    weight: 100,
                    effect: { flags: { 'espera-la-otra': 1 } },
                    resultText: 'Decidiste esperar. Te quedaste donde estabas, contando temporadas como el que espera un trámite.',
                },
            ],
        },
    ];

    if (puedeVolver) {
        opciones.push({
            id: 'ponerte-a-tiro',
            label: `Ponerte a tiro de ${miNombre}`,
            clubId: state.homeClubId ?? undefined,
            hint: `Volvés al país y la cuenta de ${suNombre} se reinicia. Menos plata, menos vidriera, y los tuyos te vuelven a ver.`,
            outcomes: [
                {
                    weight: 100,
                    effect: { returnHome: true, fame: -3, belonging: 4 },
                    resultText: 'Te volviste. Cinco años de trámite quedaron en cero y no te importó demasiado.',
                },
            ],
        });
    }

    opciones.push({
        id: 'no-elegir',
        label: 'No elegir',
        hint: 'Seguís jugando y que pase lo que tenga que pasar. Te captura el que llame primero.',
        outcomes: [
            {
                weight: 100,
                effect: {},
                resultText: 'No dijiste nada. Seguiste jugando los sábados y dejaste que el reglamento decidiera por vos.',
            },
        ],
    });

    // La metadata NO se vuelve a escribir: sale de la entrada del catálogo, que
    // es la que el selector leyó para sortearla. Declarada dos veces —una acá y
    // otra allá— alcanzaría con tocar un `requires` de un lado para que el juego
    // sorteara con una regla y dibujara con otra (§1.9).
    return {
        ...DOS_BANDERAS,
        text: `Naciste en ${nombreDePais(state.player.countryCode)}. Hace ${temporadas(otra.months)} que jugás en ${dondeVivo}.`
            + ` En ${temporadas(otra.remaining)} más cumplís los cinco años del reglamento y ${suNombre} te puede convocar.`,
        unionCode: otra.union,
        options: opciones,
    };
}

/**
 * La entrada del catálogo. Es la que el selector sortea y la que
 * `events-shape.test.ts` verifica; el constructor de arriba la viste con el
 * reloj y los nombres antes de dibujarla.
 *
 * Sus opciones son las mismas TRES en versión genérica, y eso no es relleno:
 * son las que se ven si alguna vez el estado no alcanza para armar la tarjeta
 * completa, y tienen que decir lo mismo o el juego promete dos cosas distintas
 * según el camino.
 */
const DOS_BANDERAS: CaptainEvent = {
    id: TWO_FLAGS_EVENT_ID,
    category: 'seleccion',
    title: 'Tenés dos banderas',
    text: 'Hace años que jugás afuera y la cuenta del reglamento corre. Si la completás, la unión donde vivís te puede convocar.',
    weight: 10,
    // `raro` y no `oro`: la banda de oro es de tres cada cien temporadas y esta
    // tarjeta ya viene filtrada por vivir afuera con el reloj corriendo, que son
    // pocas carreras. Puesta en oro competiría con las puertas que se abren una
    // vez en la vida y encima se le llevaría el lugar a la mitad de ellas en el
    // único momento en que puede salir.
    rarity: 'raro',
    repeatable: false,
    // El reloj tiene que estar ANDANDO: con dos temporadas ya cumplidas la
    // pregunta es real, y `remaining > 0` lo garantiza el selector — no se le
    // ofrece elegir a alguien que ya no tiene nada que esperar.
    requires: { secondFlagMonths: 24, minAge: 21, needsUnion: true, awayFromHome: true },
    options: [
        {
            id: 'esperar-la-otra',
            label: 'Esperar a la otra',
            hint: 'Seguís sumando meses afuera. Si te llaman los tuyos antes, se cierra sola.',
            outcomes: [
                {
                    weight: 100,
                    effect: { flags: { 'espera-la-otra': 1 } },
                    resultText: 'Decidiste esperar. Te quedaste donde estabas, contando temporadas como el que espera un trámite.',
                },
            ],
        },
        {
            id: 'ponerte-a-tiro',
            label: 'Ponerte a tiro de la tuya',
            hint: 'Volvés al país y la cuenta se reinicia. Menos plata, menos vidriera, y los tuyos te vuelven a ver.',
            outcomes: [
                {
                    weight: 100,
                    effect: { returnHome: true, fame: -3, belonging: 4 },
                    resultText: 'Te volviste. Cinco años de trámite quedaron en cero y no te importó demasiado.',
                },
            ],
        },
        {
            id: 'no-elegir',
            label: 'No elegir',
            hint: 'Seguís jugando y que pase lo que tenga que pasar. Te captura el que llame primero.',
            outcomes: [
                {
                    weight: 100,
                    effect: {},
                    resultText: 'No dijiste nada. Seguiste jugando los sábados y dejaste que el reglamento decidiera por vos.',
                },
            ],
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  LA GIRA DEL QUE ESTÁ A PRUEBA
// ═══════════════════════════════════════════════════════════════════════════
//
// `trial` era un estado en una tabla: la convocatoria lo escribía, el jugador
// leía «seguís a prueba» y no pasaba nada más. Es literalmente lo que le pasa al
// jugador de verdad —estás en los 33 y el entrenador te dijo que vas a mirar— y
// es la decisión con la tensión mejor ubicada de todo el juego: Cartel contra
// Pertenencia, en el escalón exacto donde el rugby la pone.
//
// DECIR QUE NO CUESTA DE VERDAD. La unión se acuerda, y eso no es una frase de
// la tarjeta: `evaluateNationalTeam` le suma `DECLINE_SURCHARGE` a la vara
// durante las temporadas siguientes, leyendo el `decisionLog`. Sin esa mitad
// sería la tercera opción de una decisión de dos, que es peor que no tenerla.
export function buildTrialTourEvent(state: CaptainState): CaptainEvent {
    const union = targetUnion(state.national.eligibility);
    if (union === null) return LA_LISTA_DE_GIRA;

    return {
        ...LA_LISTA_DE_GIRA,
        text: `Entrás en la lista de ${unionName(union)}, pero el entrenador te dijo la verdad de entrada: vas a mirar.`
            + ' Son tres semanas afuera y tu club juega la definición sin vos.',
        unionCode: union,
    };
}

const LA_LISTA_DE_GIRA: CaptainEvent = {
    id: TRIAL_TOUR_EVENT_ID,
    category: 'seleccion',
    title: 'Te llevan de gira',
    text: 'Entrás en la lista, pero el entrenador te dijo la verdad de entrada: vas a mirar.'
        + ' Son tres semanas afuera y tu club juega la definición sin vos.',
    weight: 12,
    rarity: 'especial',
    repeatable: true,
    cooldown: 2,
    requires: { nationalStatus: ['trial'], needsUnion: true },
    options: [
        {
            id: 'ir-igual',
            label: 'Ir igual',
            hint: 'Dos temporadas así y entrás en serio. Te perdés la definición del club.',
            outcomes: [
                {
                    weight: 60,
                    effect: { fame: 3, belonging: -4, playingTime: -1, attrs: { liderazgo: 1 } },
                    resultText: 'Fuiste, entrenaste tres semanas con los mejores del país y jugaste veinte minutos del segundo test. Tu club perdió la definición.',
                },
                {
                    weight: 40,
                    effect: { fame: 1, belonging: -4, playingTime: -1, body: 8 },
                    resultText: 'Fuiste y no entraste ni un minuto. Volviste con el cuerpo cargado de una gira que miraste desde el banco.',
                },
            ],
        },
        {
            id: 'decir-que-no',
            label: 'Decir que no',
            hint: 'El club te lo va a agradecer. La unión también se acuerda: la próxima vara te sale más cara.',
            outcomes: [
                {
                    weight: 100,
                    effect: { belonging: 6, statBoost: 1, fame: -2 },
                    resultText: 'Dijiste que preferías jugar. Ganaste la definición con los tuyos y el cuerpo técnico de la unión lo anotó en algún lado.',
                },
            ],
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  EL ARCHIRRIVAL — de multiplicador a persona
// ═══════════════════════════════════════════════════════════════════════════
//
// Existía desde la 0.22.0 y competía de verdad: te recorta el fixture entre
// ×0,35 y ×1,25 y su marcador de caps corre solo. Pero era eso — un
// multiplicador con nombre guardado en el estado y ninguna escena. El jugador
// veía menos caps y no sabía por qué.
//
// Tres tarjetas y pasa a ser una persona. Es la mejor relación costo-beneficio
// de todo el archivo: no hay una línea de motor nueva, el estado ya lo tenía.
//
// ── EL NOMBRE VA EN EL `text` Y NUNCA EN EL `resultText` ───────────────────
// Es la regla que ya siguió `buildFlagSwitchEvent` y conviene decir por qué: el
// `resultText` se PERSISTE —termina en `decisionLog[].text` y en
// `seasons[].decisionText`— así que entra en el `stateHash` del digest
// congelado. Con el nombre adentro, el digest dependería del sorteo de apellidos
// y dejaría de medir el motor.
function conNombre(event: CaptainEvent, state: CaptainState): CaptainEvent {
    const rival = state.rival;
    // Sin archirrival la tarjeta no se puede armar, pero tampoco puede volver
    // `null`: el selector ya la sorteó y devolverla vacía trabaría la fase. Se
    // devuelve con el marcador puesto en una descripción y no en un nombre —
    // «el otro de tu puesto» es cierto siempre—, que es lo que el `requires`
    // `needsRival` ya hace improbable.
    const nombre = rival ? `${rival.name} ${rival.surname}` : 'el otro de tu puesto';
    return { ...event, text: event.text.replaceAll('{rival}', nombre) };
}

export const RIVAL_EVENT_IDS: readonly string[] = [
    RIVAL_BEAT_YOU_EVENT_ID,
    RIVAL_INJURED_EVENT_ID,
    RIVAL_LAST_EVENT_ID,
];

/**
 * Las tres del archirrival comparten constructor: lo único que se les agrega es
 * el nombre, así que tres funciones idénticas serían el mismo dato tres veces.
 *
 * Lee `state.pendingEventId` porque es el que el selector ya sorteó, que es la
 * misma fuente de la que sale cualquier otra tarjeta de este archivo. Pedirle el
 * id por parámetro obligaría al mapa de constructores a llevar una firma
 * distinta para estas tres.
 */
export function buildRivalEvent(state: CaptainState): CaptainEvent | null {
    const id = state.pendingEventId;
    if (id === null) return null;
    const base = RIVAL_EVENTS.find((e) => e.id === id);
    if (!base) return null;
    return conNombre(base, state);
}

const RIVAL_EVENTS: CaptainEvent[] = [
    {
        id: RIVAL_BEAT_YOU_EVENT_ID,
        category: 'seleccion',
        title: 'Te sacó el puesto',
        text: 'Salió la lista y está {rival}. Vos no. El entrenador no te llamó para explicarte nada, que es la forma que tienen de explicarlo todo.',
        weight: 10,
        rarity: 'especial',
        repeatable: true,
        cooldown: 4,
        // La media cruda decide quién está arriba, y `rivalAhead` la lee: la
        // tarjeta sólo tiene sentido cuando de verdad te pasó por encima.
        requires: { tracks: ['a-xv', 'nacional'], needsUnion: true, rivalAhead: true },
        options: [
            {
                id: 'entrenar-el-doble',
                label: 'Entrenar el doble',
                hint: 'Volvés en tres meses siendo otro. O te rompés.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { attrs: { aguante: 2, choque: 1 }, statBoost: 1 },
                        resultText: 'Te levantaste a las cinco todo el verano. En marzo ya no había con qué comparar.',
                    },
                    {
                        weight: 40,
                        effect: { body: 14, playingTime: -1 },
                        resultText: 'Te levantaste a las cinco todo el verano y en febrero el psoas dijo que no. Volviste en mayo.',
                    },
                ],
            },
            {
                id: 'irte-a-jugar',
                label: 'Buscar un club donde jugar',
                hint: 'Los seleccionadores miran al que juega. Se resigna dónde estás cómodo.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { playingTime: 1, belonging: -3, fame: 1 },
                        resultText: 'Dijiste en voz alta que necesitabas jugar. En el club lo escucharon y no les gustó, pero jugaste.',
                    },
                ],
            },
            {
                id: 'aguantar',
                label: 'Aguantar el año',
                hint: 'Te quedás y esperás tu turno. Un año de tu carrera.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { belonging: 4, attrs: { liderazgo: 2 }, fame: -1 },
                        resultText: 'Te bancaste el año entero sin decir una palabra. El vestuario se dio cuenta antes que el entrenador.',
                    },
                ],
            },
        ],
    },

    {
        id: RIVAL_INJURED_EVENT_ID,
        category: 'seleccion',
        title: 'Se lesionó',
        // LA TARJETA TIENE QUE INCOMODAR. Es exactamente lo que pasa y es
        // exactamente lo que nadie dice en voz alta: la lesión del otro es tu
        // temporada. El texto no lo suaviza y las opciones no ofrecen una salida
        // limpia, porque no la hay.
        text: '{rival} se rompió el cruzado en la primera fecha. Está afuera un año. La camiseta es tuya y te enteraste por el grupo del plantel.',
        weight: 8,
        rarity: 'especial',
        repeatable: true,
        cooldown: 6,
        requires: { tracks: ['a-xv', 'nacional'], needsUnion: true, needsRival: true },
        options: [
            {
                id: 'agarrarla',
                label: 'Agarrar el puesto',
                hint: 'Es tu año y lo sabés. Nadie te va a preguntar cómo llegó.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { playingTime: 2, statBoost: 2, fame: 3 },
                        resultText: 'Jugaste todos los partidos del año. Cuando le preguntaron por él en la conferencia, el entrenador contestó de vos.',
                    },
                ],
            },
            {
                id: 'ir-a-verlo',
                label: 'Ir a verlo',
                hint: 'Dos horas de auto hasta la clínica. No cambia nada de la temporada.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { playingTime: 2, statBoost: 1, attrs: { liderazgo: 3 }, fame: 1 },
                        resultText: 'Fuiste a la clínica con una camiseta firmada por el plantel. No hablaron del puesto. Jugaste igual todo el año.',
                    },
                ],
            },
        ],
    },

    {
        id: RIVAL_LAST_EVENT_ID,
        category: 'seleccion',
        title: 'El último',
        text: '{rival} anunció que se retira a fin de año. Se pelearon la misma camiseta durante quince temporadas y ahora quedás vos solo.',
        weight: 7,
        rarity: 'raro',
        repeatable: false,
        // Es la tarjeta del final y por eso pide edad y no escalón: la pelea por
        // la camiseta se cuenta entera aunque los dos hayan terminado en el club.
        requires: { minAge: 33, needsUnion: true, needsRival: true, minSeasons: 10 },
        options: [
            {
                id: 'despedirlo',
                label: 'Despedirlo como corresponde',
                hint: 'Hablás vos en la cena. Se termina una parte de tu carrera también.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { fame: 4, attrs: { liderazgo: 3 }, belonging: 3 },
                        resultText: 'Hablaste vos en la cena de despedida. Dijiste que sin él hubieras jugado el doble y valido la mitad, y la mesa se quedó callada.',
                    },
                ],
            },
            {
                id: 'seguir',
                label: 'Seguir un año más',
                hint: 'Te quedás solo en el puesto. Atrás vienen pibes de veintiuno.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { playingTime: 1, fame: 2, body: 10 },
                        resultText: 'Seguiste. Jugaste una temporada más de titular y te dolió todo, todos los lunes.',
                    },
                    {
                        weight: 45,
                        effect: { playingTime: -1, body: 12 },
                        resultText: 'Seguiste, y el que entró en su lugar no fue él sino uno de veintiuno. A vos también te empezó a tocar el banco.',
                    },
                ],
            },
        ],
    },
];

export const NATIONAL_EVENTS: CaptainEvent[] = [
    {
        id: 'nt-primera-convocatoria',
        category: 'seleccion',
        title: 'Te llaman de la unión',
        text: 'Te citaron al seleccionado de tu unión. Son tres semanas de concentración y el Seven de la República en Paraná al final.',
        weight: 9,
        rarity: 'especial',
        repeatable: false,
        requires: { tracks: ['union', 'academia', 'm20', 'a-xv', 'nacional'], needsUnion: true },
        options: [
            {
                id: 'ir',
                label: 'Ir',
                hint: 'Te ven los seleccionadores. Tu club juega tres fechas sin vos.',
                outcomes: [
                    { weight: 65, effect: { fame: 4, attrs: { velocidad: 1, aguante: 1 }, belonging: -1 }, resultText: 'Jugaste el Seven de la República y llegaste a cuartos. Volviste al club con tres kilos menos y otra cabeza.' },
                    { weight: 35, effect: { fame: 2, body: 6, belonging: -1 }, resultText: 'Fuiste y jugaste poco. Volviste con un tobillo hinchado y la sensación de haber ido a mirar.' },
                ],
            },
            {
                id: 'quedarte-en-el-club',
                label: 'Quedarte en el club',
                hint: 'Tres fechas con los tuyos. La unión no llama dos veces.',
                outcomes: [
                    { weight: 100, effect: { belonging: 4, fame: -2 }, resultText: 'Dijiste que no. Jugaste las tres fechas con tu club y en el buffet te lo agradecieron toda la temporada.' },
                ],
            },
        ],
    },

    {
        id: 'nt-pladar',
        category: 'seleccion',
        title: 'El gimnasio del PlaDAR',
        text: 'Te abren las puertas del plan de alto rendimiento. Gimnasio cinco veces por semana, nutricionista y un plan de tres años.',
        weight: 8,
        rarity: 'especial',
        repeatable: false,
        requires: { tracks: ['academia', 'm20', 'a-xv', 'nacional'], maxAge: 22, needsUnion: true },
        options: [
            {
                id: 'entrar',
                label: 'Entrar',
                hint: 'Es la puerta al camino representativo. Se te va el año entero.',
                outcomes: [
                    { weight: 80, effect: { attrs: { choque: 2, aguante: 3 }, fame: 3, playingTime: -1 }, resultText: 'Subiste seis kilos de músculo en un año. Volviste a tu club siendo otro jugador.' },
                    { weight: 20, effect: { attrs: { aguante: 1 }, body: 10, playingTime: -1 }, resultText: 'El plan te pasó por encima. Terminaste el año con una lumbalgia que arrastraste seis meses.' },
                ],
            },
            {
                id: 'no-entrar',
                label: 'Seguir a tu ritmo',
                hint: 'Jugás tu temporada completa. La puerta se cierra sola con los años.',
                outcomes: [
                    { weight: 100, effect: { belonging: 3, playingTime: 1 }, resultText: 'Seguiste entrenando en el club con los de siempre. Jugaste la temporada completa.' },
                ],
            },
        ],
    },

    {
        id: 'nt-el-puesto',
        category: 'seleccion',
        title: 'El puesto',
        text: 'Tu archirrival volvió de la lesión y el entrenador tiene que elegir. Entra uno de los dos.',
        weight: 9,
        repeatable: true,
        cooldown: 3,
        requires: { tracks: ['a-xv', 'nacional'], needsUnion: true },
        options: [
            {
                id: 'hablar-con-el-dt',
                label: 'Hablar con el entrenador',
                hint: 'Le decís lo que pensás. Puede sonar a que estás pidiendo.',
                outcomes: [
                    { weight: 50, effect: { fame: 2, playingTime: 1 }, resultText: 'Te escuchó, te dijo dos cosas concretas y las corregiste. Arrancaste de titular.' },
                    { weight: 50, effect: { playingTime: -1 }, resultText: 'Te escuchó y te dijo que el puesto se gana en la cancha. Arrancaste en el banco.' },
                ],
            },
            {
                id: 'ganartelo',
                label: 'Ganártelo en la cancha',
                hint: 'Sin hablar, solo jugando. Si no rendís, no hay excusa.',
                outcomes: [
                    { weight: 55, effect: { playingTime: 1, statBoost: 2, fame: 2 }, resultText: 'Hiciste dos partidos que no se discuten. El puesto quedó tuyo sin que nadie tuviera que decirlo.' },
                    { weight: 45, effect: { playingTime: -1 }, resultText: 'No te salió. Entró él y jugó bien, que es lo peor que podía pasar.' },
                ],
            },
            {
                id: 'ofrecerte-al-banco',
                label: 'Ofrecerte para el banco',
                hint: 'Entrás igual, veinte minutos. Se resigna la titularidad.',
                outcomes: [
                    { weight: 100, effect: { playingTime: -1, attrs: { liderazgo: 2 }, fame: 1 }, resultText: 'Le dijiste que entrabas de donde hiciera falta. Jugaste los últimos veinte de todos los partidos y el vestuario tomó nota.' },
                ],
            },
        ],
    },

    // Las tarjetas que se arman en el momento viven arriba, como constantes, y
    // acá entran las mismas referencias para que el selector las sortee como a
    // cualquier otra. Lo que el constructor les agrega es el dato que el
    // catálogo no puede tener: de quién es la bandera, cuánto marca el reloj,
    // cómo se llama el que te sacó el puesto.
    CAMBIAR_DE_BANDERA,
    DOS_BANDERAS,
    LA_LISTA_DE_GIRA,
    ...RIVAL_EVENTS,

    {
        id: 'nt-la-gira',
        category: 'seleccion',
        title: 'La gira',
        text: 'Seis semanas afuera por la ventana de noviembre. Tres tests, dos husos horarios y un cumpleaños en tu casa que te vas a perder.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        requires: { tracks: ['nacional'], needsUnion: true },
        options: [
            {
                id: 'ir-completo',
                label: 'Ir a todo',
                hint: 'Tres caps. Volvés en diciembre con el cuerpo hecho pedazos.',
                outcomes: [
                    { weight: 70, effect: { fame: 5, body: 14, attrs: { liderazgo: 1 } }, resultText: 'Jugaste los tres tests. Volviste en diciembre sin poder correr y con tres caps más.' },
                    { weight: 30, effect: { fame: 3, body: 20, playingTime: -1 }, resultText: 'Jugaste dos y en el tercero te rompiste el aductor. Diciembre y enero enteros en camilla.' },
                ],
            },
            {
                id: 'pedir-descanso',
                label: 'Pedir que te bajen',
                hint: 'Llegás entero a la temporada de tu club. El entrenador anota quién pidió.',
                outcomes: [
                    { weight: 60, effect: { body: -10, belonging: 3, fame: -2 }, resultText: 'Te bajaron de la gira y descansaste seis semanas. Volviste al club como nuevo.' },
                    { weight: 40, effect: { body: -10, belonging: 3, fame: -5 }, resultText: 'Te bajaron. Entró otro, jugó los tres tests y el puesto dejó de ser tuyo.' },
                ],
            },
        ],
    },

    {
        id: 'nt-el-seven',
        category: 'seleccion',
        title: 'Te llaman del seven',
        text: 'El seleccionado de seven te quiere en el circuito. Seis torneos por año, aviones, Dubái y Ciudad del Cabo. Y unos Juegos Olímpicos.',
        weight: 6,
        // Te saca del quince por una temporada entera y con una ventana de edad
        // que no vuelve a abrirse: elegir mal acá se paga hasta el retiro.
        rarity: 'raro',
        repeatable: false,
        requires: { tracks: ['union', 'academia', 'm20'], minAge: 19, maxAge: 25, needsUnion: true },
        options: [
            {
                id: 'ir-al-seven',
                label: 'Irte al seven',
                hint: 'Aviones y una medalla posible. No jugás el torneo de tu club.',
                outcomes: [
                    { weight: 55, effect: { fame: 10, attrs: { velocidad: 3, aguante: 3 }, belonging: -6, playingTime: -2 }, resultText: 'Diste la vuelta al mundo dos veces y volviste corriendo más rápido que nadie. Tu club jugó el año entero sin vos.' },
                    { weight: 45, effect: { fame: 5, attrs: { velocidad: 2 }, belonging: -6, body: 12, playingTime: -2 }, resultText: 'El circuito te comió. Volviste con las rodillas gastadas y sin haber entrado en los doce de los Juegos.' },
                ],
            },
            {
                id: 'quedarte-en-el-quince',
                label: 'Quedarte en el quince',
                hint: 'Seguís tu carrera de club. El seven no vuelve a llamar a los veintiséis.',
                outcomes: [
                    { weight: 100, effect: { belonging: 3, playingTime: 1 }, resultText: 'Te quedaste en el quince. Jugaste tu temporada completa y el seven se llevó a otro.' },
                ],
            },
        ],
    },
];
