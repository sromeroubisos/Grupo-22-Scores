import type { CaptainState } from '../../../../features/captain/index.ts';
import {
    CAPTAIN_ENGINE_VERSION, CAPTAIN_MINIGAMES_VERSION, CAPTAIN_POSITIONS_VERSION,
    CAPTAIN_RIVALRIES_VERSION, CAPTAIN_SHOP_VERSION, COMPETITION_LEVELS_VERSION,
    INTERNATIONAL_CALENDAR_VERSION, NATIONS_VERSION, NORMALIZED_CATALOG_VERSION,
    TOURNAMENTS_VERSION, TRANSFER_RULES_VERSION, validateCaptainState,
} from '../../../../features/captain/index.ts';

// Guardado local versionado de El Capitán. Si cambia el schema del guardado, la
// versión del motor, la de los puestos o la de cualquier catálogo, el guardado
// viejo se DESCARTA entero: no se intenta migrar parcialmente un estado que el
// motor ya no sabe interpretar.
//
// Clave propia. No toca `g22-carrera-rugby`: son dos juegos distintos y una
// partida de uno no puede invalidar la del otro.
const KEY = 'g22-el-capitan';

// Schema 1: el primero. No hay guardados anteriores que descartar.
//
// Schema 2: los Momentos. `pendingMoment` y `moments` en CaptainState, y la
// fase 'moment'. Los guardados 1 SE DESCARTAN aunque el default honesto exista
// —`pendingMoment: null` y `moments: []` dejarían la partida andando— porque el
// estado quedaría mintiendo: una carrera de doce temporadas sin una sola jugada
// registrada diría que el jugador nunca tuvo un momento decisivo, y no es que
// no los tuvo: es que no existían. Preferimos que empiece de nuevo antes que
// mostrarle una trayectoria falsa.
//
// A medida que el estado crezca, cada schema nuevo se documenta ACÁ y se dice
// por qué se descartó en vez de migrarse. Es la convención de
// `carrera-rugby/careerStorage.ts` y vale la pena copiarla entera: cuando hay
// un default honesto para un campo nuevo se dice, y aun así se descarta si el
// resto del estado quedaría mintiendo.
// 3 · Se fue `time: TimeBudget` del estado y `time` de cada fila del historial,
//     y entró `training: string | null` en los dos. Una partida de schema 2 no se
//     puede migrar sin inventarle un entrenamiento a cada temporada ya jugada,
//     así que se resuelve como `'outdated'` y la UI ofrece empezar de nuevo.
// 4 · Se partió `player.potential` en `potentialBase` + `built`. Una partida de
//     schema 3 tiene el campo viejo y ninguno de los dos nuevos, así que su
//     techo se leería como `NaN` y la carrera se rompería en silencio en la
//     primera temporada. Migrarla sería posible —`potentialBase = potential`,
//     `built = 0`— pero mentiría: esa partida se jugó con cartas que no
//     construían nada, y arrancaría con la banda entera todavía disponible a
//     mitad de carrera. Se resuelve como `'outdated'`.
// 5 · Entró `pendingInjury` al estado, y con él la disponibilidad (motor
//     0.10.0). Este SÍ tiene default honesto —`0`, o sea "no arrastrás
//     ninguna lesión"— y aun así se descarta, porque el campo nuevo es la
//     parte chica del cambio: en una partida de schema 4 la columna `share`
//     de cada temporada ya jugada guarda TU LUGAR EN EL EQUIPO, y a partir de
//     acá esa misma columna guarda QUÉ PARTE DE LA TEMPORADA JUGASTE. Migrada,
//     la trayectoria mostraría dos magnitudes distintas apiladas en la misma
//     columna, con las viejas siempre más altas. Es el mismo criterio que el
//     schema 3: preferimos empezar de nuevo antes que dibujar una carrera que
//     no pasó. Se resuelve como `'outdated'`.
// 6 · LA PROGRESIÓN (motor 0.11.0). Es el schema con más campos nuevos de todos
//     y varios tienen default honesto, así que conviene decir por qué igual se
//     descarta.
//
//     Lo nuevo en el estado: `player.developmentProfile`, `awards[]`,
//     `milestones[]` y `divisions{}`; en cada fila del historial, `rating`,
//     `awards[]`, `leaguePosition`, `leagueTeams` y `divisionMove`.
//
//     `awards`, `milestones` y `divisions` se podrían migrar con listas vacías y
//     la partida seguiría andando. NO ALCANZA, por dos motivos que se suman:
//
//       · `developmentProfile` NO tiene default honesto. Es material sorteado al
//         nacer, como el techo: elegirle uno ahora sería sortearle la mitad de su
//         carrera a mitad de camino, y encima con la ventaja de saber ya cómo le
//         fue. Cualquier valor que le pongamos es una carrera distinta.
//       · las filas viejas no tienen `rating`, y ese número es el que ahora
//         decide los premios y empuja el crecimiento del año siguiente.
//         Reconstruirlo desde la planilla guardada daría un número calculado con
//         un motor que no es el que la jugó.
//
//     Y el fondo es el de siempre: una partida de schema 5 se jugó con un motor
//     donde el trabajo valía lo mismo en el Top 14 que en la Tercera, donde
//     ningún club ascendía y donde no existían premios ni hitos. Migrada,
//     mostraría una trayectoria a la que le faltan la mitad de los renglones.
//     Se resuelve como `'outdated'`.
// 7 · LA BIBLIOTECA (motor 0.12.0). Entra `lastStanding` al estado —dónde
//     terminó tu club el año pasado, que es lo que abre las copas de este— y
//     `internationalCalendarVersion` pasa a sellar el calendario DE CARRERA DE
//     RUGBY en vez del que captain tenía por su cuenta.
//
//     `lastStanding: null` es un default honesto y aun así se descarta, porque
//     lo que cambió no es el campo: es el mundo. Una partida de schema 6 se jugó
//     donde un club disputaba UN torneo por temporada, donde todas las ligas del
//     planeta tenían 22 fechas y donde nadie sumaba más de nueve caps por año.
//     Migrada, la trayectoria seguiría mostrando esas temporadas al lado de las
//     nuevas, con la columna de partidos midiendo dos cosas distintas — que es
//     exactamente el criterio del schema 5. Se resuelve como `'outdated'`.
//
// 8 · LOS MINIJUEGOS POR DORSAL (motor 0.17.0). Entra `data/minigames/` con
//     cuatro jugadas por número del 1 al 15 y cinco que le tocan a cualquiera, y
//     con eso cambian DOS formas de lo persistido:
//
//       · `PendingMoment.setup` pasa a poder llevar un `MinigameSetup`, que es un
//         sobre con el verbo adentro (`mechanic`) y los márgenes de ese verbo en
//         `play`. Una partida de schema 7 guardada en fase de Momento tiene un
//         Setup de los cinco escritos a mano y ninguna de las siete mecánicas lo
//         sabe leer.
//       · `MomentRecord.kind` pasa a poder ser un id del catálogo (`d7-cazador`)
//         además de uno de los siete viejos.
//
//     Lo segundo por sí solo se podría migrar —los ids viejos siguen existiendo,
//     así que una trayectoria vieja se dibuja igual— pero lo primero no: un
//     Momento pendiente con un Setup que ninguna mecánica entiende deja la
//     carrera trabada en la fase de Momento, que es el peor final posible. Y
//     migrar solo las partidas que NO estén en fase de Momento sería un camino
//     de dos ramas para ahorrarle el reinicio a una fracción de las partidas.
//
//     Se resuelve como `'outdated'`, que es lo que el juego ya sabe contar.
//
// 9 · LOS TORNEOS REPRESENTATIVOS (motor 0.18.0). `CaptainState` suma dos campos
//     y una fase:
//
//       · `pendingTournament` — el torneo en curso, con TODOS los marcadores ya
//         sorteados adentro. Es lo que hace que un F5 en la semifinal devuelva la
//         misma semifinal: el torneo dura hasta nueve pantallas, así que la
//         ventana para recargar en el medio es nueve veces la de un Momento.
//       · `tournaments` — los torneos jugados, para la crónica y el retiro.
//
//     Y la fase `'tournament'`, que es la que obliga al corte. Una partida de
//     schema 8 no tiene ninguno de los dos campos, y eso no se puede migrar
//     rellenando con `null` y una lista vacía: quedaría una carrera de un
//     argentino de veinticinco años que nunca jugó el Argentino Juvenil ni el
//     M20 porque en su mundo no existían, y el juego le diría que no llegó. La
//     historia que cuenta el retiro sería falsa en la única línea que el jugador
//     va a releer.
//
//     Se resuelve como `'outdated'`.
//
// 10 · LAS CASILLAS. La final de los dos Mundiales se JUEGA en vez de
//     destaparse, así que `TournamentMatch` suma `casillas: CasillasGrid | null`
//     con las nueve celdas, la tachada por Visión y LOS DOS MARCADORES adentro.
//
//     Acá el default honesto sería `null` —"esta final se destapa como antes"— y
//     aun así se descarta, porque el corte cae justo donde más duele: una partida
//     de schema 9 guardada EN LA FINAL DE UN MUNDIAL tiene el partido armado a la
//     vieja, y al cargarla la pantalla le ofrecería destapar una celda mientras
//     el motor espera que juegue nueve casillas. El jugador se quedaría mirando
//     una final que no se puede terminar.
//
//     Se resuelve como `'outdated'`.
//
// 11-12 · Sin nota propia: el corte lo trajo el motor y el estado los acompañó.
//
// 13 · LA TIENDA (motor 0.19.0). Tres campos nuevos en lo persistido:
//
//       · `player.shop` — lo que compraste, con LO QUE ENTRÓ DE VERDAD adentro
//         de cada compra (los puntos se recortan contra el techo, así que un
//         ítem que promete +4 puede haber dado +1,2).
//       · `player.injuryLoss` — el saldo que las lesiones te sacaron y que el
//         cirujano puede devolver.
//       · `income` en cada fila del historial — lo que entró ese año.
//
//     Los tres tienen default honesto —lista vacía, objeto vacío, cero— y aun
//     así se descarta, y esta vez la razón no es el estado sino LA PLATA. Una
//     partida de schema 12 se jugó cobrando `rating × 900` por temporada, que es
//     la décima parte de lo que la oferta prometía. Migrada, arrancaría la
//     tienda con un saldo de otra economía: el que firmó por 817.500 y cobró
//     81.000 tendría diez años de ahorro donde debería tener uno, o al revés
//     según cuándo firmó. La billetera mostraría un número que ninguna temporada
//     de esa carrera produjo.
//
//     Y el `income` de las filas viejas no se puede reconstruir: habría que
//     recalcular el sueldo de cada temporada con el club de entonces y con la
//     fórmula NUEVA, o sea inventar una historia económica que no pasó. Es el
//     mismo criterio del schema 5 —dos magnitudes distintas apiladas en la misma
//     columna— aplicado a la única columna que el jugador va a mirar para decidir
//     una compra.
//
//     Se resuelve como `'outdated'`.
// 14 · LA LONGEVIDAD (motor 0.20.0). Entra `player.longevity`: cuántos años se
//     aparta de la curva de su puesto, sorteado al nacer.
//
//     NO TIENE DEFAULT HONESTO, y es el mismo argumento que voltea al schema 6
//     con `developmentProfile`: es material sorteado al nacer, como el techo.
//     Ponerle un cero ahora sería sortearle la mitad de la forma de su carrera a
//     mitad de camino, y encima con la ventaja de saber ya cómo le fue.
//
//     Y aunque lo tuviera, la partida vieja se jugó con las curvas de puesto
//     corridas cuatro años hacia atrás: un wing de schema 13 tenía su tope duro
//     en 32 y ahora lo tiene en 36. Migrada, un jugador ya retirado por edad
//     seguiría en carrera, o —peor— una trayectoria de doce temporadas se leería
//     contra una curva que ninguna de esas temporadas usó.
//
//     Se resuelve como `'outdated'`.
// 15 · LA CAMISETA DE LA MAYOR (motor 0.22.0). `NationalRecord` cambia de forma
//     —suma `status`, la planilla `byUnion` y el estado de elegibilidad del
//     Reg. 8— y cada fila del historial suma `nationalStatus`, `calledUp` y
//     `lostShirt`.
//
//     Acá hay un default honesto de verdad y hay que decir por qué igual se
//     descarta. Una partida de schema 14 con caps se podría migrar a
//     `status: 'squad'`, `byUnion: { [su país]: { caps, squadCaps: caps } }` y
//     una elegibilidad con el claim de nacimiento y la captura puesta. Nada de
//     eso mentiría sobre el pasado.
//
//     Lo que no se puede reconstruir es LO QUE VIENE. Las cuatro cuentas que la
//     convocatoria necesita —si quedaste afuera estando adentro, cuántas
//     temporadas seguidas llevás a prueba, cuántas en el plantel, hace cuánto
//     perdiste la camiseta— se derivan del `nationalStatus` de cada fila, y las
//     filas viejas no lo tienen. Rellenarlas con el estado de hoy le daría al
//     que acaba de debutar doce temporadas de antigüedad en el plantel y con
//     ellas el descuento completo, o al revés: le borraría la antigüedad al que
//     lleva diez años y lo dejaría peleando contra la vara pelada a los 32.
//
//     Y los meses de registro del 8.1(c) tampoco: habría que recorrer la
//     trayectoria club por club para saber cuándo se rompió la exclusividad, o
//     sea recalcular con el motor nuevo una historia que se jugó con otro. Es el
//     criterio del schema 13 aplicado a la otra escalera.
//
//     Se resuelve como `'outdated'`.
// 16 · EL PLAZO DEL CONTRATO (motor 0.30.0). `CaptainState` suma `contract`
//     —club, temporada de inicio, años y el sueldo congelado al firmar— y cada
//     `ClubOffer` suma `years`.
//
//     Acá NO hay default honesto, y conviene decir por qué, porque `null` parece
//     uno: un profesional sin contrato es un estado que el motor nuevo no produce
//     nunca. Migrado con `null`, el jugador cobraría por el camino de emergencia
//     de `simulate-season` —`salaryFor` con la media de hoy— y encima tendría el
//     mercado abierto todos los junios, o sea que seguiría jugando con las reglas
//     viejas dentro de un motor que ya no las tiene.
//
//     Inventarle uno es peor. Habría que elegirle plazo («¿dos años?»), fecha de
//     firma («¿desde cuándo?») y sueldo, y ese último número es el que decide la
//     billetera de todas las temporadas que le queden: un contrato inventado con
//     `salaryFor` de hoy le pagaría a un veterano en declive el sueldo de su
//     mejor año, o al que acaba de explotar el de cuando era promesa. Es
//     exactamente el criterio del schema 13 —una historia económica que no
//     pasó—, esta vez hacia adelante en vez de hacia atrás.
//
//     Se resuelve como `'outdated'`.
// 17 · LOS TRES COMODINES Y EL TABLERO QUE SE ABRE (motor 0.34.0). Tres cambios
//     de forma en lo persistido, y los tres adentro del torneo:
//
//       · `PendingTournament.arengaUsed` pasa a llamarse `comodinUsed`. El campo
//         viejo decía «gastaste la arenga» y ahora hay tres comodines, así que el
//         nombre mentía (§1.5 del CLAUDE de captain).
//       · `PendingTournament.comodin` — cuál trajiste, o `null`.
//       · `MatchGrid.tachadas` — las celdas que sacó el árbitro.
//
//     Los tres tienen default honesto —el nombre viejo se puede renombrar,
//     `comodin: null` es «no elegiste» y `tachadas: []` es «no tocaste nada»— y
//     aun así se descarta, por dónde cae el corte: una partida de schema 16
//     guardada EN FASE DE TORNEO tiene la llave a medio jugar y ningún comodín
//     elegido, así que al cargarla la pantalla le preguntaría cuál se trae
//     RECIÉN AHORA, con los resultados del grupo ya a la vista. Elegir sabiendo
//     es exactamente lo que la mecánica existe para impedir, y se lo estaríamos
//     regalando justo a las partidas viejas.
//
//     Y hay una segunda mitad que no se puede migrar aunque el torneo esté
//     cerrado: `nt-la-lista-de-gira` cobra su recargo leyendo el `decisionLog`
//     (`DECLINE_MEMORY_SEASONS`), y una partida de schema 16 tiene un log donde
//     esa tarjeta no existía. El que estuvo `trial` cuatro temporadas nunca pudo
//     rechazar una gira, así que su carrera internacional se jugó contra otra
//     vara — la misma clase de desfasaje que ya voltea al schema 15.
//
//     Se resuelve como `'outdated'`.
// 18 · EL ESCALÓN DE LA TEMPORADA SE GUARDA POR ID (motor 0.37.0).
//     `CaptainSeasonEntry.track` guardaba el RÓTULO —«La mayor», «Seleccionado
//     A»— y pasa a `trackId`, que guarda el `SquadTrack`.
//
//     El cambio de forma es de una sola clave y se podría migrar traduciendo el
//     texto de vuelta al id. NO SE MIGRA, y el motivo es el rótulo del A-XV: en
//     una partida vieja dice «Seleccionado A» y hoy se llama «Argentina XV» o
//     «Kirguistán XV» según la unión, así que la tabla de traducción tendría que
//     conocer los nombres que el juego usaba en cada versión anterior. Es la
//     clase de tabla que nace correcta y envejece mal.
//
//     Y hay una segunda mitad, que es la que decide: entra la Nations Cup
//     (`TOURNAMENTS_VERSION` 0.8.0), o sea que el A-XV pasa a repartir un torneo
//     y una copa por temporada. Una carrera de schema 17 pisó ese escalón sin
//     que existiera nada del otro lado, así que su vitrina y su Cartel se
//     jugaron contra otras reglas — el mismo desfasaje que ya voltea al 15 y al
//     16. El sello de torneos la descarta igual; esto solo lo deja escrito.
//
//     Se resuelve como `'outdated'`.
const SCHEMA = 18;

/**
 * Las versiones que se sellan, y las dos decisiones que no son obvias.
 *
 * 1 · Se sella `NORMALIZED_CATALOG_VERSION` y no `CLUB_CATALOG_VERSION`.
 *     La compuesta ya trae adentro el snapshot sudamericano y el canon
 *     argentino (`AR_SYSTEM_VERSION`), y El Capitán se apoya en el sistema
 *     argentino mucho más que Carrera de Rugby: el Nacional de Clubes, los
 *     cupos del TDI y las divisiones de URBA e interior son la escalera del
 *     club, que es media mitad del juego. Con la compuesta, tocar
 *     `arSystem2026.ts` invalida las partidas de El Capitán solo. Carrera usa
 *     la simple por historia; acá se arranca bien de entrada.
 *
 * 2 · Se sella `INTERNATIONAL_CALENDAR_VERSION`, que desde el schema 7 es el de
 *     CARRERA DE RUGBY (`career/data/international-calendar.ts`) y entra por la
 *     puerta de `data/catalogs.ts`, igual que los clubes.
 *
 *     En el schema 6 fue brevemente una versión propia de captain, sobre un
 *     calendario de seis torneos escrito a mano. Fue un error y está contado en
 *     el changelog de la 0.12.0: el tope de caps por temporada sale de ese
 *     archivo y de ningún otro (CLAUDE.md raíz), así que un segundo calendario
 *     era una segunda respuesta a la misma pregunta.
 *
 *     Va aparte de la versión del motor por el mismo motivo que los niveles de
 *     competición: es un catálogo, no lógica. Agregar un torneo o corregir una
 *     lista de participantes no toca una línea del motor, pero cambia cuántos
 *     caps suma una unión por temporada — o sea, invalida una partida en curso
 *     igual que un cambio de reglas.
 *
 * 3 · Sigue SIN sellarse `CAREER_ENVIRONMENT_VERSION`: el escalafón de empleo es
 *     de Carrera de Rugby y captain no lo importa. El entorno de este juego sale
 *     del nivel del club (`engine/growth.ts`), que ya viaja en
 *     `COMPETITION_LEVELS_VERSION`.
 *
 * 4 · Se sella `CAPTAIN_MINIGAMES_VERSION` APARTE del motor, y es la misma
 *     decisión que ya se tomó con el calendario internacional: el catálogo de
 *     minijuegos es DATO, no lógica. Agregar el minijuego sesenta y seis o
 *     corregir el texto de un desenlace no toca una línea de motor, pero cambia
 *     qué se sortea cada temporada —o sea, invalida una partida en curso igual
 *     que un cambio de reglas—.
 *
 *     Metido adentro de `engineVersion` habría que subir la versión del motor
 *     cada vez que se toca un texto, y a los tres meses nadie sabría qué cambió
 *     de verdad. Que sea un campo propio es lo que permite leer un guardado
 *     viejo y contestar «se jugó con otro catálogo de jugadas» sin adivinar.
 */
interface SavedCaptain {
    schema: number;
    engineVersion: string;
    positionsVersion: string;
    clubCatalogVersion: string;
    nationsVersion: string;
    competitionLevelsVersion: string;
    internationalCalendarVersion: string;
    minigamesVersion: string;
    /**
     * El catálogo de torneos representativos, y va aparte por el mismo motivo
     * que los minijuegos y el calendario: es CATÁLOGO, no lógica.
     *
     * Cambiarle la fuerza a una provincia o corregir el formato del M20 no toca
     * una línea de motor, pero cambia cuántos caps y cuánto Cartel deja una
     * carrera — o sea, invalida una partida en curso igual que un cambio de
     * reglas. Y no puede viajar adentro de `clubCatalogVersion`: esa constante
     * la compone `career/data/clubs.ts`, que es de OTRO JUEGO, y no tiene por
     * qué moverse porque El Capitán agregó un torneo.
     */
    tournamentsVersion: string;
    /**
     * EL CATÁLOGO DE LA TIENDA, y va aparte por el mismo motivo que los
     * minijuegos, el calendario y los torneos: es CATÁLOGO, no lógica.
     *
     * Corregir un precio o cambiarle el atributo a un ítem no toca una línea de
     * motor, pero cambia qué compró una partida en curso y con qué atributos la
     * sigue jugando — o sea, la invalida igual que un cambio de reglas. Y hay un
     * caso que lo hace obligatorio y no cosmético: `ShopPurchase` guarda el id
     * del ítem y no su efecto, así que un ítem que se borre del catálogo deja una
     * compra que ya no significa nada y un consumible que nunca se va a poder
     * devolver.
     */
    shopVersion: string;
    /**
     * LAS VÍAS DE CIRCULACIÓN DE JUGADORES, y va aparte por el mismo motivo que
     * los minijuegos, el calendario, los torneos y la tienda: es CATÁLOGO.
     *
     * Desde la 0.24.0 el mercado lo lee para dos cosas —de qué país es una
     * franquicia regional y cuánto hay que valer para entrar a ella— así que
     * subirle el piso a Super Rugby Américas o declarar una vía nueva cambia
     * quién te llama en una partida en curso, sin tocar una línea de motor.
     *
     * Un guardado anterior a este campo lo trae `undefined` y se resuelve como
     * `'outdated'` por sí solo, que es el resultado correcto: ese mercado se jugó
     * con otras vías.
     */
    transferRulesVersion: string;
    /**
     * LOS CLÁSICOS, y va aparte por el mismo motivo que todos los de arriba: es
     * CATÁLOGO. Agregar un par no toca una línea de motor y sin embargo cambia
     * qué pases son una traición en una partida en curso — o sea, cuánta
     * Pertenencia se puede perder de golpe y qué techos quedan bajos.
     *
     * NO sube `schema`: el salto al clásico no guarda un campo nuevo. El techo
     * del traidor se DERIVA de la trayectoria, que el estado ya tiene, así que
     * una partida vieja no tiene ningún dato que le falte. Lo único que cambia es
     * la lista contra la que esa trayectoria se lee, y para eso es este campo.
     * Un guardado anterior lo trae `undefined` y se resuelve como `'outdated'`
     * por sí solo, que es el resultado correcto: esa carrera se jugó en un mundo
     * sin clásicos.
     */
    rivalriesVersion: string;
    savedAt: number;
    state: CaptainState;
}

export type LoadResult =
    | { kind: 'none' }
    | { kind: 'ok'; state: CaptainState }
    | { kind: 'outdated' }; // había una partida pero es de una versión incompatible

/**
 * Devuelve `false` cuando no se pudo guardar.
 *
 * Que la partida siga en memoria es lo correcto —no explota— pero callarse no
 * lo es: el jugador está invirtiendo temporadas en una carrera que se le va a
 * evaporar al cerrar la pestaña y no tiene forma de enterarse. Con el booleano,
 * la pantalla puede avisar una vez y que él decida si sigue igual.
 */
export function saveCaptain(state: CaptainState): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const payload: SavedCaptain = {
            schema: SCHEMA,
            engineVersion: CAPTAIN_ENGINE_VERSION,
            positionsVersion: CAPTAIN_POSITIONS_VERSION,
            clubCatalogVersion: NORMALIZED_CATALOG_VERSION,
            nationsVersion: NATIONS_VERSION,
            competitionLevelsVersion: COMPETITION_LEVELS_VERSION,
            internationalCalendarVersion: INTERNATIONAL_CALENDAR_VERSION,
            minigamesVersion: CAPTAIN_MINIGAMES_VERSION,
            tournamentsVersion: TOURNAMENTS_VERSION,
            shopVersion: CAPTAIN_SHOP_VERSION,
            transferRulesVersion: TRANSFER_RULES_VERSION,
            rivalriesVersion: CAPTAIN_RIVALRIES_VERSION,
            savedAt: Date.now(),
            state,
        };
        window.localStorage.setItem(KEY, JSON.stringify(payload));
        return true;
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): la partida sigue en
        // memoria y el que llama avisa.
        return false;
    }
}

/**
 * Carga la partida. Devuelve `outdated` (y limpia la clave) cuando el guardado
 * existe pero pertenece a otra versión: así la UI puede avisar sin romper.
 *
 * Una partida vieja NUNCA explota. Si no se puede migrar, se ofrece empezar de
 * nuevo con un mensaje claro (CLAUDE.md §2).
 */
export function loadCaptain(): LoadResult {
    if (typeof window === 'undefined') return { kind: 'none' };
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return { kind: 'none' };

        const parsed = JSON.parse(raw) as Partial<SavedCaptain>;
        const compatible =
            parsed.schema === SCHEMA
            && parsed.engineVersion === CAPTAIN_ENGINE_VERSION
            && parsed.positionsVersion === CAPTAIN_POSITIONS_VERSION
            && parsed.clubCatalogVersion === NORMALIZED_CATALOG_VERSION
            && parsed.nationsVersion === NATIONS_VERSION
            && parsed.competitionLevelsVersion === COMPETITION_LEVELS_VERSION
            && parsed.internationalCalendarVersion === INTERNATIONAL_CALENDAR_VERSION
            && parsed.minigamesVersion === CAPTAIN_MINIGAMES_VERSION
            && parsed.tournamentsVersion === TOURNAMENTS_VERSION
            && parsed.shopVersion === CAPTAIN_SHOP_VERSION
            && parsed.transferRulesVersion === TRANSFER_RULES_VERSION
            && parsed.rivalriesVersion === CAPTAIN_RIVALRIES_VERSION;

        if (!compatible || !parsed.state) {
            clearCaptain();
            return { kind: 'outdated' };
        }

        // ── Y LA SEGUNDA PREGUNTA, que las doce versiones no contestan ──────
        // Aquéllas dicen «¿es de este motor?». Ésta dice «¿cierra consigo
        // mismo?», y son distintas: un guardado puede traer las doce versiones
        // correctas y un agujero adentro —una lista recortada, una migración a
        // medias— y entonces el motor no falla, DERIVA OTRA COSA en silencio. La
        // división del Mundial juvenil es el caso: con una edición faltante el
        // jugador aparece en la B sin haber descendido.
        //
        // Corre acá, una sola vez, antes de que el jugador vea nada. De la carga
        // en adelante el reducer sólo agrega ediciones autorizadas, así que la
        // invariante no se puede romper jugando.
        const problema = validateCaptainState(parsed.state);
        if (problema !== null) {
            clearCaptain();
            return { kind: 'outdated' };
        }

        return { kind: 'ok', state: parsed.state };
    } catch {
        clearCaptain();
        return { kind: 'outdated' };
    }
}

/** Borra SOLO la partida de El Capitán. No toca ninguna otra clave. */
export function clearCaptain(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // no-op
    }
}
