// EL CAPITÁN — el catálogo de TORNEOS REPRESENTATIVOS.
//
// El catálogo como DATO. Agregar el próximo es agregar un objeto a un array: si
// para agregarlo hiciera falta tocar `engine/tournament.ts`, entonces lo que
// falta es un mecanismo nuevo — y esa conversación es la que no queremos
// saltear escribiendo un `if` con el id adentro. Es la misma regla que impone
// `data/minigames/` sobre los minijuegos y `data/events/` sobre los eventos.
//
// ── LA VERSIÓN ─────────────────────────────────────────────────────────────
// `TOURNAMENTS_VERSION` es un CAMPO PROPIO del guardado, al lado de la versión
// de los minijuegos, y no viaja adentro de `NORMALIZED_CATALOG_VERSION`.
//
// La tentación era meterla ahí —el canon argentino ya viaja así— y está mal por
// una razón de propiedad: esa constante la compone `career/data/clubs.ts`, que
// es de OTRO JUEGO. Carrera de Rugby no tiene torneos representativos, así que
// sus partidas guardadas no tienen por qué invalidarse porque El Capitán haya
// agregado el Mundial M20.
//
// Aparte de `engineVersion` por el motivo de siempre: es catálogo, no lógica.
// Corregir la fuerza de una provincia no toca una línea del motor, pero cambia
// cuántos caps y cuánto Cartel deja una carrera — o sea, invalida una partida en
// curso igual que un cambio de reglas.

import type { TournamentDef, TournamentId } from '../types/tournament.ts';

// 0.9.0 — la temporada de los diecisiete pasa a tener DOS torneos: el
// Campeonato Argentino Juvenil —que se llama M18, que es su nombre— y el
// continental M18 de tu región. Entran seis continentales, uno por región del
// mapa, así que ninguna nacionalidad se queda sin la ventana de los 17.
export const TOURNAMENTS_VERSION = '0.9.0';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LAS PROVINCIAS — el Campeonato Argentino Juvenil
// ═══════════════════════════════════════════════════════════════════════════
//
// El Argentino Juvenil no se juega contra uniones nacionales sino contra las
// OTRAS PROVINCIAS, y esa es la mitad de por qué el torneo existe: a los
// diecisiete todavía no representás a un país, representás a los tuyos. El
// continental M18 es el escalón de arriba y se juega el mismo año: de acá sale
// el equipo que va allá.
//
// Las ocho salen de `ArRegion` —el canon argentino ya reparte el país en ocho
// regiones— y NO de una lista escrita a mano. Que el mapa sea región → nombre y
// no región → región es lo único que se agrega acá: la selección se llama por su
// unión dominante, que es como se lee el Campeonato de verdad. Nadie dice "juega
// el NOA": dice "juega Tucumán".

/**
 * Cómo se llama la selección de cada región, y cuánto pesa.
 *
 * La fuerza es la jerarquía histórica del Campeonato Argentino y está puesta a
 * mano a propósito: es un dato del deporte, no una derivada de nada que el
 * motor ya tenga. Buenos Aires lo ganó casi siempre, Tucumán es el que más se
 * lo discutió, y el resto se ordena detrás.
 *
 * PARÁMETRO LIBRE (CLAUDE.md §1.9): son ocho elecciones genuinas y se discuten.
 */
export interface ProvinciaDef {
    /** La región del canon argentino. Es la clave, no el nombre. */
    region: string;
    /** Cómo se lee la selección. */
    labelEs: string;
    /** De 0 a 100. */
    strength: number;
}

export const PROVINCIAS: readonly ProvinciaDef[] = [
    { region: 'urba', labelEs: 'Buenos Aires', strength: 92 },
    { region: 'noa', labelEs: 'Tucumán', strength: 84 },
    { region: 'centro', labelEs: 'Córdoba', strength: 78 },
    { region: 'litoral', labelEs: 'Rosario', strength: 76 },
    { region: 'oeste', labelEs: 'Cuyo', strength: 70 },
    { region: 'pampeana', labelEs: 'Mar del Plata', strength: 68 },
    { region: 'nea', labelEs: 'Nordeste', strength: 62 },
    { region: 'patagonia', labelEs: 'Alto Valle', strength: 58 },
];

/** La provincia de una región, o `null` si la región no existe. */
export function provinciaOf(region: string | null): ProvinciaDef | null {
    if (region === null) return null;
    return PROVINCIAS.find((p) => p.region === region) ?? null;
}

/**
 * La que juega el que no tiene club argentino resoluble.
 *
 * Buenos Aires y no un sorteo: el 60% del rugby argentino juega en la URBA, así
 * que es la respuesta más probable y no un default inventado. Y es un fallback
 * de verdad —el que tiene club resuelto usa el suyo— no el caso normal.
 */
export const PROVINCIA_FALLBACK = PROVINCIAS[0];

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LOS TORNEOS
// ═══════════════════════════════════════════════════════════════════════════
//
// EN ORDEN DE EDAD, y ese orden decide EN QUÉ ORDEN SE JUEGAN los que caen la
// misma temporada. Ya no decide cuál de los dos se juega: desde la 0.9.0 una
// temporada puede traer más de uno —el provincial y el continental de los
// diecisiete son el caso que lo pidió— y `tournamentDue` devuelve el primero que
// abre y que todavía no se jugó este año.

export const TOURNAMENTS: readonly TournamentDef[] = [
    // ── LOS DIECISIETE ──────────────────────────────────────────────────────
    // Solo argentinos, y no por comodidad: el Campeonato Argentino Juvenil es un
    // torneo de selecciones provinciales que no tiene equivalente en las otras
    // ciento treinta uniones. Inventarle uno a Gales para que el galés tenga
    // torneo sería inventar rugby, que es lo único que este juego no hace.
    {
        id: 'juvenil-m18',
        labelEs: 'Campeonato Argentino Juvenil M18',
        briefEs: 'Tres partidos de grupo contra las otras provincias. Después, semifinal y final.',
        trophyEs: 'Campeonato Argentino Juvenil M18',
        gate: {
            ages: [17, 17],
            unionCode: 'ar',
            regions: null,
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'provincias',
        // Las ocho regiones del canon argentino. La puerta ya la pone el catálogo.
        fieldSize: 8,
        // Se ignora con `rivalPool: 'provincias'`: las provincias no rankean.
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        // El Argentino Juvenil ELIMINA: el que no pasa el grupo se vuelve a su
        // provincia. Es la diferencia con el M20 y no un olvido — un torneo de
        // ocho no tiene con qué armar cuatro cuadros.
        placement: false,
        // Sin divisiones: el Argentino Juvenil es uno solo y no hay una B
        // provincial que exista de verdad.
        tier: null,
        knockout: ['semi', 'final'],
        // Las nueve casillas con los tres tries son de la final de un Mundial y de
        // ningún otro lado: son LO que hace distinta a esa tarde.
        casillasRounds: [],
        // LA GRILLA VA ACÁ TAMBIÉN, y la primera versión la dejó afuera.
        //
        // El argumento era la escala —«el M17 pasa rápido, un Mundial es del que
        // te acordás»— y estaba mal por una razón simple: un partido o se juega o
        // no se juega, y no puede ser que el primer torneo de tu vida sea el único
        // que se mira. Un pibe de diecisiete jugando el Argentino Juvenil no está
        // viviendo una versión abreviada del rugby.
        //
        // Lo que sigue distinguiendo a un Mundial es la ARENGA y la final en
        // casillas, que es donde la diferencia se nota sin quitarle el juego a
        // nadie.
        matchGrid: true,
        // Sin arenga: a los diecisiete no hay Liderazgo 75 en ningún lado, así
        // que declararla sería prometer un comodín que no se habilita nunca.
        arenga: false,
        // Sin partido por el tercer puesto: el que pierde la semifinal del
        // Argentino Juvenil se vuelve a su provincia el sábado a la noche.
        bronze: false,
        fameLevel: 0.4,
        baseStrength: 58,
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  LOS CONTINENTALES M18 — la otra mitad de la temporada de los 17
    // ═══════════════════════════════════════════════════════════════════════
    //
    // El año de los diecisiete tiene DOS torneos y ese es el punto: primero
    // jugás por tu provincia —o por tu unión, según de dónde seas— y de ahí sale
    // el equipo que va al continental. Son los dos escalones reales del rugby
    // juvenil y estaban contados a medias: el juego tenía el provincial argentino
    // y nada más, así que un galés o un japonés de diecisiete no tenía un solo
    // partido representativo.
    //
    // ── SEIS Y NO CINCO, Y POR QUÉ ─────────────────────────────────────────
    // El mapa de regiones del catálogo tiene ocho valores y las competencias de
    // verdad son seis, así que cada torneo declara QUÉ REGIONES junta: las islas
    // británicas juegan el europeo y el Pacífico juega el de Oceanía. El de
    // Norteamérica —el RAN M18— entra por la misma razón que los otros cinco: la
    // promesa es que ninguna nacionalidad elegible se quede sin la ventana de los
    // diecisiete, y sin él Canadá, Estados Unidos y México se quedaban afuera.
    //
    // ── LA COMPUERTA ES LA EDAD Y LA REGIÓN, Y NADA MÁS ────────────────────
    // La primera versión pedía `minTrack: 'union'` —«al continental va el que su
    // unión ya miró»— y se midió: 8 de cada 120 carreras llegaban al escalón a
    // los diecisiete, así que el 93% de los jugadores no iba a ver un solo
    // partido en esa ventana. Un torneo que casi nadie juega es contenido muerto
    // con cartel de vivo, que es exactamente lo que este catálogo evita.
    //
    // Y encima era incoherente con el vecino: el provincial argentino se le da a
    // todos los argentinos de diecisiete sin pedir escalón, y también es una
    // selección de verdad. La ventana de los diecisiete es ancha a propósito en
    // este juego — el filtro empieza en el M20, que sí pide media.
    //
    // ── EL CAMPO SON LAS UNIONES DE TU REGIÓN ──────────────────────────────
    // `rivalPool: 'region'` toma las uniones de las regiones declaradas, en orden
    // de ranking, y corta en `fieldSize`. `fieldFromRank` no lo lee nadie acá —la
    // región YA es el recorte— igual que `fieldSize` no se lee en el provincial.
    {
        id: 'm18-sudamericano',
        labelEs: 'Sudamericano M18',
        briefEs: 'Tres partidos contra los vecinos. El que pasa, juega la final.',
        trophyEs: 'Sudamericano M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            regions: ['south-america'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        fieldSize: 6,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        // Por encima del provincial y por debajo del M20: es tu primera camiseta
        // con la bandera, y todavía no la mira nadie fuera del continente.
        fameLevel: 0.5,
        baseStrength: 60,
    },
    {
        id: 'm18-americas-norte',
        labelEs: 'Americas Rugby M18',
        briefEs: 'La ventana juvenil del norte del continente. Tres partidos y la final.',
        trophyEs: 'Americas Rugby M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            regions: ['north-america'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        fieldSize: 6,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        fameLevel: 0.5,
        baseStrength: 52,
    },
    {
        id: 'm18-europa',
        labelEs: 'Europeo M18',
        briefEs: 'El torneo juvenil del continente. Tres partidos de grupo y la final.',
        trophyEs: 'Europeo M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            // Las islas británicas juegan el europeo: el mapa las separa para el
            // mercado —irse a Inglaterra no es irse a Rumania— y para un torneo
            // juvenil son el mismo continente.
            regions: ['europe', 'british-isles'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        // Más ancho que los otros: es la región con más uniones con fixture del
        // catálogo, y un campo de seis dejaría afuera a media Europa del Este.
        fieldSize: 8,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['semi', 'final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        fameLevel: 0.5,
        baseStrength: 62,
    },
    {
        id: 'm18-oceania',
        labelEs: 'Oceanía M18',
        briefEs: 'El torneo juvenil del Pacífico sur. Tres partidos y la final.',
        trophyEs: 'Oceanía M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            // Fiyi, Samoa y Tonga juegan acá: el mapa los separa de Australia y
            // Nueva Zelanda porque sus mercados no se parecen, pero el torneo
            // juvenil del Pacífico es uno solo.
            regions: ['oceania', 'pacific'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        fieldSize: 6,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        fameLevel: 0.5,
        // El más duro de los seis: acá un juvenil de diecisiete juega contra
        // Nueva Zelanda y contra Fiyi el mismo mes.
        baseStrength: 64,
    },
    {
        id: 'm18-asia',
        labelEs: 'Asiático M18',
        briefEs: 'La ventana juvenil de Asia. Tres partidos de grupo y la final.',
        trophyEs: 'Asiático M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            regions: ['asia'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        fieldSize: 6,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        fameLevel: 0.5,
        baseStrength: 52,
    },
    {
        id: 'm18-africa',
        labelEs: 'Africano M18',
        briefEs: 'La ventana juvenil de África. Tres partidos de grupo y la final.',
        trophyEs: 'Africano M18',
        gate: {
            ages: [17, 17],
            unionCode: null,
            regions: ['africa'],
            minOvr: null,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'region',
        fieldSize: 8,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        placement: false,
        tier: null,
        knockout: ['semi', 'final'],
        casillasRounds: [],
        matchGrid: true,
        arenga: false,
        bronze: false,
        fameLevel: 0.5,
        // Sudáfrica lo distorsiona hacia arriba cuando entra, pero el torneo lo
        // juegan casi siempre Kenia, Zimbabue, Namibia y Túnez.
        baseStrength: 50,
    },

    // ── EL MUNDIAL M20 ──────────────────────────────────────────────────────
    // Tres años de ventana (18, 19 y 20) y media mínima: al Mundial juvenil va
    // el que ya despuntó, no todo el que tiene la edad.
    //
    // ── EL FORMATO, QUE ES LO QUE LO HACE DISTINTO DEL MAYOR ────────────────
    // DIECISÉIS equipos, cuatro grupos de cuatro, tres partidos cada uno. Y
    // después NADIE SE VA A CASA: los dieciséis siguen jugando, y lo que el
    // grupo decide es por qué puesto.
    //
    //   3 victorias → cuadro del título   → termina 1.º, 2.º, 3.º o 4.º
    //   2 victorias → cuadro del 5.º      → 5.º a 8.º
    //   1 victoria  → cuadro del 9.º      → 9.º a 12.º
    //   0 victorias → cuadro del 13.º     → 13.º a 16.º
    //
    // Cada cuadro es una semifinal y un partido de definición: el que gana la
    // semi juega por el puesto de arriba y el que la pierde por el de abajo. O
    // sea que el que llega 3-0 y gana la semi juega LA FINAL, y si la pierde
    // juega por el tercer puesto — que es exactamente lo que pasa en el torneo
    // de verdad, y la razón de que un M20 sean CINCO partidos para todos.
    //
    // La tarde en la que se juega por el decimotercer puesto delante de
    // cuatrocientas personas es una de las cosas más ciertas del rugby juvenil,
    // y es la mitad de por qué este torneo está en el juego.
    //
    // ── DE DÓNDE SALEN LOS DIECISÉIS ────────────────────────────────────────
    // Del ranking, y eso NO es una simplificación: al M20 se entra por los
    // torneos continentales M18 del año anterior, y los que salen de ahí son
    // casi siempre los mismos dieciséis. Modelar la clasificación continental
    // sería inventar un torneo entero para reproducir una lista que el ranking
    // ya da. El recorte lo hace `rivalsFor` con `fieldFromRank` y `fieldSize`.
    //
    // ── Y NO SIEMPRE SON LOS MISMOS: HAY DOS DIVISIONES ─────────────────────
    // Los dos últimos de acá bajan a la B y los dos primeros de la B suben. Así
    // que la lista de dieciséis es de dónde ARRANCA cada unión, no una condena:
    // tu carrera puede terminar el M20 de los dieciocho en el 15.º puesto y
    // jugar el de los diecinueve en la segunda división.
    {
        id: 'mundial-m20',
        labelEs: 'Mundial M20',
        briefEs: 'Tres partidos de grupo. Nadie se va a casa: lo que se decide es por qué puesto seguís jugando.',
        trophyEs: 'Mundial M20',
        gate: {
            ages: [18, 20],
            unionCode: null,
            regions: null,
            minOvr: 58,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'uniones',
        // Dieciséis: cuatro grupos de cuatro, y cuatro cuadros de cuatro.
        fieldSize: 16,
        // Las dieciséis mejores del mundo. La franja de la B empieza donde
        // termina esta, y no hace falta escribirlo dos veces: 1 + 16 = 17.
        fieldFromRank: 1,
        groupMatches: 3,
        // SIN CORTE. Lo que el grupo reparte son cuadros, no pasajes.
        qualifyPoints: null,
        placement: true,
        // De acá no se sube —no hay nada arriba— y bajan los dos últimos. Cuáles
        // son los dos últimos sale de `fieldSize`: el 15.º y el 16.º.
        tier: {
            up: null,
            down: { places: 2, to: 'mundial-m20-b' },
        },
        knockout: ['semi', 'final'],
        // LA FINAL SE JUEGA. Ver `CasillasGrid`.
        casillasRounds: ['final'],
        matchGrid: true,
        arenga: true,
        bronze: false,
        fameLevel: 0.6,
        baseStrength: 66,
    },

    // ── EL MUNDIAL M20 B ────────────────────────────────────────────────────
    // La segunda división del Mundial juvenil: las uniones 17 a 32 del ranking.
    // Mismo formato —dieciséis, cuatro grupos, cuatro cuadros— y una diferencia
    // que lo cambia todo: acá el título vale un ascenso.
    //
    // ── POR QUÉ ES UN TORNEO Y NO UN MODO DEL OTRO ──────────────────────────
    // Porque tiene otro campo, otro nivel y otra copa. Un flag `esLaB` adentro
    // del M20 habría hecho que cada pregunta del motor —contra quién jugás,
    // cuánto pesan, qué levantás si ganás— tuviera que consultarlo, que es
    // exactamente el `if` con el id adentro que el catálogo existe para evitar.
    // Como dos objetos, la única pregunta nueva es CUÁL TE TOCA, y esa la
    // contesta la compuerta una vez por temporada.
    //
    // ── EL NIVEL, QUE ES UN PARÁMETRO LIBRE (CLAUDE.md §1.9) ────────────────
    // 58 contra los 66 de la primera. Es el mismo escalón que separa al
    // Argentino Juvenil del Mundial, y es una elección: el rugby de la 20ª del
    // mundo contra la 30ª se parece más a un Argentino Juvenil bueno que a
    // Nueva Zelanda contra Francia. Sube el piso de todos por igual; quién es
    // mejor que quién adentro lo sigue diciendo el ranking.
    {
        id: 'mundial-m20-b',
        labelEs: 'Mundial M20 B',
        briefEs: 'La segunda división del Mundial juvenil. Los dos primeros suben.',
        trophyEs: 'Mundial M20 B',
        gate: {
            ages: [18, 20],
            unionCode: null,
            regions: null,
            // Más bajo que en la primera, y por el motivo que tiene sentido en
            // rugby: el plantel de la 25ª del mundo se arma con lo que hay. Pedir
            // la misma media que la selección de Nueva Zelanda dejaría a media
            // tabla del mundo sin torneo juvenil.
            minOvr: 52,
            minTrack: null,
            everySeason: true,
        },
        rivalPool: 'uniones',
        fieldSize: 16,
        // Donde termina la primera. Es el único número que ata las dos
        // divisiones, y por eso está acá y no repetido en la de arriba.
        fieldFromRank: 17,
        groupMatches: 3,
        qualifyPoints: null,
        placement: true,
        // Suben los dos primeros. Y de acá no se baja: es la última división que
        // el juego modela, y abajo está no jugar un Mundial.
        tier: {
            up: { places: 2, to: 'mundial-m20' },
            down: null,
        },
        knockout: ['semi', 'final'],
        // EL HUECO TAMBIÉN ACÁ, y no es un copiar y pegar: la final de la B es el
        // partido del ascenso. Para una unión de la mitad de la tabla del mundo
        // esa tarde es la más grande que va a jugar un juvenil suyo, y el tablero
        // está para el partido que se recuerda — no para el que tiene más
        // audiencia.
        casillasRounds: ['final'],
        matchGrid: true,
        arenga: true,
        bronze: false,
        fameLevel: 0.6,
        baseStrength: 58,
    },

    // ── LA NATIONS CUP — LA VENTANA DE LOS SELECCIONADOS A ──────────────────
    // El escalón `a-xv` existía desde la 0.15.0 y no tenía un solo partido del
    // otro lado. La temporada le cobraba seis fechas del club —«te perdiste 6
    // fechas por la gira»— y la gira no iba a ningún lado: ni rival, ni copa, ni
    // una tarde que el jugador pudiera recordar. Un escalón sin torneo es un
    // impuesto, no una carrera.
    //
    // ── POR QUÉ SE LLAMA ASÍ, Y QUÉ ES DE VERDAD ────────────────────────────
    // La Nations Cup es el torneo de los segundos seleccionados: Argentina XV,
    // Emerging Italy, Rumanía, Namibia. No se inventa nada — es el escalón que
    // en el rugby de verdad separa al que ya está en la lista amplia del que
    // todavía juega su liga y nada más.
    //
    // El TROFEO es de la unión, como el Mundial: la vitrina lo va a colgar del
    // seleccionado y no del club, porque no lo ganó tu club.
    //
    // ── DÓNDE ENTRA EN LA REGLA DEL UNO POR AÑO ─────────────────────────────
    // Va DESPUÉS de los dos Mundiales juveniles a propósito. Un pibe de veinte
    // que llegó al A-XV tiene los dos abiertos, y el que le corresponde es el
    // M20: es su última edición y no la va a jugar nunca más. La Nations Cup lo
    // espera al año siguiente, y a los veintiuno ya no compite con nadie.
    //
    // ── EL CAMPO SON LOS QUE TIENEN SEGUNDO SELECCIONADO ────────────────────
    // Ocho, desde el 1 del ranking. No es que a la Nations Cup entren sólo las
    // ocho mejores: es que un seleccionado A lo arma la unión que tiene plantel
    // de sobra, y ésas son las de arriba. `rivalsFor` completa hacia abajo, así
    // que el jugador de una unión chica que igual llega al escalón juega su
    // ventana contra los A de las grandes — y pierde casi siempre, que es
    // exactamente lo que pasa.
    {
        id: 'nations-cup',
        labelEs: 'Nations Cup',
        briefEs: 'La ventana de los seleccionados A. Tres partidos de grupo, semifinal y final.',
        trophyEs: 'Nations Cup',
        gate: {
            ages: [20, 40],
            unionCode: null,
            regions: null,
            // Sin piso de media: el escalón YA es el piso. Al A-XV se llega por
            // el umbral de `thresholdFor`, que mide contra tu camada y contra la
            // reputación de tu unión — pedir además un número absoluto sería
            // cortar dos veces con dos varas que no se hablan.
            minOvr: null,
            minTrack: 'a-xv',
            everySeason: true,
        },
        rivalPool: 'uniones',
        fieldSize: 8,
        fieldFromRank: 1,
        groupMatches: 3,
        // ELIMINA, como el Argentino Juvenil: la ventana de los A es corta y no
        // tiene lugar para cuadros de posicionamiento. El que no pasa el grupo
        // se vuelve a su club, que además es lo que quiere su entrenador.
        qualifyPoints: 9,
        placement: false,
        // Sin divisiones: abajo de la Nations Cup no hay una B de seleccionados
        // A, hay no tener seleccionado A.
        tier: null,
        knockout: ['semi', 'final'],
        // La final en casillas es del partido que se recuerda toda la vida, y
        // ésa es la de un Mundial. Acá la final se juega en la grilla como los
        // otros cuatro partidos: es una tarde grande, no LA tarde.
        casillasRounds: [],
        matchGrid: true,
        // Con arenga, a diferencia del M17: a los veintipico el Liderazgo 75 se
        // alcanza, así que el comodín no es un cartel colgado en una puerta que
        // no abre.
        arenga: true,
        // Sin bronce, igual que el Argentino Juvenil: la Nations Cup es una
        // ventana corta de cuatro partidos y el que pierde la semi vuelve a su
        // club. El partido por el tercer puesto es un lujo de Mundial.
        bronze: false,
        // Entre el Mundial juvenil (0,6) y el mayor (1,6), y más cerca del
        // juvenil. Ganar con el seleccionado A te pone en la conversación de la
        // mayor; no te pone en la tapa.
        fameLevel: 0.9,
        // Arriba del M20 y abajo del mayor. Un seleccionado A es un plantel de
        // profesionales hechos al que le faltan los quince titulares.
        baseStrength: 68,
    },

    // ── EL MUNDIAL ──────────────────────────────────────────────────────────
    // El único que pide estar en la mayor, y el único que no se juega todos los
    // años: la edición la decide el calendario internacional y no una cuenta
    // escrita acá.
    {
        id: 'mundial-mayor',
        labelEs: 'Mundial',
        briefEs: 'Tres de grupo, octavos, cuartos, semifinal y final. Cada cuatro años, y no siempre te toca.',
        trophyEs: 'Mundial',
        gate: {
            ages: [20, 40],
            unionCode: null,
            regions: null,
            minOvr: null,
            minTrack: 'nacional',
            everySeason: false,
        },
        rivalPool: 'uniones',
        // Veinticuatro, como el Mundial de 2027.
        fieldSize: 24,
        fieldFromRank: 1,
        groupMatches: 3,
        qualifyPoints: 9,
        // El mayor ELIMINA, y ahí está la mitad de lo que lo hace el mayor: en
        // el M20 la derrota te cambia de cuadro, acá te manda a casa.
        placement: false,
        // Sin divisiones. El mayor tiene una sola y a las que no entran no las
        // espera un torneo B: las espera la clasificación de dentro de cuatro
        // años, que es otra cosa y no está modelada.
        tier: null,
        knockout: ['octavos', 'cuartos', 'semi', 'final'],
        casillasRounds: ['final'],
        matchGrid: true,
        arenga: true,
        // EL ÚNICO CON PARTIDO POR EL TERCER PUESTO, y es el formato real: en un
        // Mundial de rugby los dos que pierden la semifinal juegan el sábado
        // temprano y los dos que la ganan, a la tarde. Cuatro puestos y no dos.
        //
        // ⚠️ EL DE BRONCE NO LLEVA LAS NUEVE CASILLAS, y no hace falta decirlo
        // acá: `buildMatch` da el tablero al partido POR EL TÍTULO y a ningún
        // otro, que es la misma regla que ya cumplía el M20 con sus cuatro
        // finales del mismo día. El del tercer puesto se juega en la grilla de
        // treinta, como los otros seis del Mundial.
        bronze: true,
        fameLevel: 1.6,
        baseStrength: 74,
    },
];

const BY_ID: Partial<Record<TournamentId, TournamentDef>> = {};
for (const t of TOURNAMENTS) BY_ID[t.id] = t;

/**
 * La definición, o TIRA con el id adentro.
 *
 * No devuelve `null` a propósito: un `PendingTournament` con un id que no existe
 * es una partida guardada contra un catálogo que ya no está, y eso se resuelve
 * como `'outdated'` en la carga —no dejándolo llegar a la pantalla como una
 * llave muda que traba la carrera—. Si esto tira, el bug está en la carga.
 */
export function getTournament(id: TournamentId): TournamentDef {
    const found = BY_ID[id];
    if (!found) throw new Error(`Torneo desconocido: ${id}`);
    return found;
}
