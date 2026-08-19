// EL CAPITÁN — el contrato de un TORNEO REPRESENTATIVO.
//
// Un Momento es UNA JUGADA de un partido. Un Torneo son SEIS A NUEVE PARTIDOS
// con estado que sobrevive entre uno y otro: los puntos del grupo, la llave
// armada, el comodín gastado. Esa diferencia es la que obliga a un contrato
// propio en vez de estirar `MomentDef` hasta que entre.
//
// ── LO QUE EL JUGADOR HACE, DICHO SIN VUELTAS ──────────────────────────────
// Destapa una celda por partido y sale el marcador. Eso es todo, y es
// deliberado: el torneo no es un examen de destreza sino una ESPERA. El juego
// ya tiene sesenta y cuatro minijuegos para medirte las manos; lo que no tenía
// era la tarde en que no depende de vos.
//
// De ahí sale la única decisión real del torneo, y vive en la arenga (§4).
//
// ── LAS TRES REGLAS QUE ESTE ARCHIVO IMPONE ────────────────────────────────
//
// 1. EL TORNEO SE SORTEA ENTERO AL ABRIRSE, NUNCA AL DESTAPARSE.
//    `PendingTournament` viaja al `localStorage` con TODOS los marcadores ya
//    decididos adentro, y destapar una celda solo cambia `revealed`. Es la misma
//    regla que el Setup de un Momento y por el mismo motivo: si el marcador se
//    sorteara al hacer clic, la misma celda daría distinto antes y después de un
//    F5. Acá pesa más todavía —un Momento dura una pantalla y un torneo dura
//    nueve— así que la ventana para recargar en el medio es nueve veces más
//    grande.
//
//    La excepción tiene nombre y es la llave: los cruces de una ronda no se
//    pueden sortear antes de saber quién pasó. Se sortean AL ENTRAR A LA RONDA,
//    con la semilla derivada de la ronda, y quedan escritos antes de que el
//    jugador vea nada. Nunca al destapar.
//
// 2. EL TORNEO NO TOCA EL RNG DE LA CARRERA.
//    Toda su suerte sale de `hash(semilla:torneo:temporada:ronda:idx)`, igual
//    que los Momentos. Consecuencia buscada: agregar un torneo no corre el
//    stream de nadie, así que el digest congelado se mueve solo donde un torneo
//    cambió un resultado — y no entero, por plomería.
//
// 3. EL CAMPEÓN QUE SE JUEGA LE GANA AL CAMPEÓN QUE SE SORTEA.
//    `engine/international-results.ts` decide quién gana cada torneo del mundo
//    sin simular el fixture, y está bien que lo haga: el Championship que ganó
//    Nueva Zelanda mientras vos jugabas la Primera B lo ganó Nueva Zelanda. Pero
//    el torneo que jugás vos ya tiene campeón —lo acabás de ver en la pantalla—
//    y si el sorteo lo pisara, levantarías la copa y la vitrina diría que la
//    ganó otro. La resolución vive en `engine/tournament.ts` y el consumidor es
//    `international-results.ts`, no al revés.

import type { MinigameGrade } from './minigame.ts';

import { BELONGING_TIERS } from './currencies.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LOS TORNEOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los cinco que se juegan. La academia M16 NO está acá: es un Momento suelto
 * con mecánica de memoria, no un torneo, y vive en `engine/moment-defs/academia.ts`.
 *
 * `mundial-m20` y `mundial-m20-b` son las DOS DIVISIONES del Mundial juvenil, y
 * son dos torneos y no dos modos del mismo: tienen otro campo, otro nivel y otra
 * copa. Cuál te toca lo decide tu unión, no vos (§2 bis).
 *
 * `nations-cup` es la ventana de los SELECCIONADOS A —el escalón que el juego
 * llama `a-xv` y que en pantalla se lee «Argentina XV», «Nueva Zelanda XV»—. Es
 * el que faltaba: el escalón existía, se cobraba seis fechas del club por
 * temporada, y no había un solo partido ni una sola copa del otro lado.
 */
export type TournamentId =
    | 'juvenil-m18'
    | 'm18-sudamericano'
    | 'm18-americas-norte'
    | 'm18-europa'
    | 'm18-oceania'
    | 'm18-asia'
    | 'm18-africa'
    | 'mundial-m20'
    | 'mundial-m20-b'
    | 'nations-cup'
    | 'mundial-mayor';

/** Todos, en ORDEN DE CARRERA. Se itera por acá y nunca por `Object.keys`. */
export const ALL_TOURNAMENTS: readonly TournamentId[] = [
    'juvenil-m18',
    'm18-sudamericano',
    'm18-americas-norte',
    'm18-europa',
    'm18-oceania',
    'm18-asia',
    'm18-africa',
    'mundial-m20',
    'mundial-m20-b',
    'nations-cup',
    'mundial-mayor',
];

/**
 * EL ID DE VITRINA DE UNA COPA DE TORNEO.
 *
 * Vive acá y no en el reducer porque lo escriben DOS lugares —el reducer cuando
 * la copa entra, y el retiro cuando la busca para saber con qué camiseta se
 * ganó— y una plantilla repetida en dos archivos es la clase de cosa que queda
 * desalineada sin que nada falle: la copa se guarda con un prefijo y se busca
 * con otro, y desaparece de la pantalla que se llama «la vitrina».
 */
export function tournamentCompetitionId(id: TournamentId): string {
    return `tour:${id}`;
}

/**
 * Las rondas, de la primera a la última.
 *
 * ── POR QUÉ NO HAY UNA RONDA LLAMADA `posicionamiento` ─────────────────────
 * La hubo, y estaba mal por lo que el CLAUDE.md del feature llama §1.7: el
 * nombre prometía una semántica que el cuerpo no tenía. Ningún torneo la
 * declaraba nunca en su `knockout` —el cuadro del quinto puesto jugaba `semi` y
 * `final` igual que el del título— así que su label, «Semifinal de
 * posicionamiento», era un cartel colgado en una puerta que no existía.
 *
 * El posicionamiento del M20 no es una RONDA distinta: es el mismo par de
 * rondas jugado en OTRO CUADRO. Y el cuadro no se declara, se deriva de cómo te
 * fue en el grupo (`bracketOf` en `engine/tournament.ts`). Por eso el label de
 * una ronda del M20 no sale de las dos tablas de acá abajo sino de `roundTitle`,
 * que sabe por qué puesto se juega.
 */
export type RoundId = 'grupos' | 'octavos' | 'cuartos' | 'semi' | 'final';

/**
 * El label de la ronda EN UN TORNEO SIN CUADROS.
 *
 * En el M20 hay cuatro cuadros y una semifinal no dice nada sin decir por qué
 * puesto se juega, así que ahí manda `roundTitle`. Estas dos tablas son la
 * respuesta del torneo que elimina: el Argentino Juvenil y el Mundial mayor.
 */
export const ROUND_LABEL: Record<RoundId, string> = {
    grupos: 'Fase de grupos',
    octavos: 'Octavos de final',
    cuartos: 'Cuartos de final',
    semi: 'Semifinal',
    final: 'La final',
};

/** El label corto, para la llave donde no entra el largo. */
export const ROUND_SHORT: Record<RoundId, string> = {
    grupos: 'Grupos',
    octavos: '8vos',
    cuartos: 'Cuartos',
    semi: 'Semi',
    final: 'Final',
};

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA COMPUERTA — quién entra
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUÉ HACE FALTA PARA QUE EL TORNEO APAREZCA.
 *
 * Todo declarado y nada en un `if`: agregar un torneo es agregar un objeto, y
 * es la misma regla que el catálogo de eventos y el de minijuegos. Un torneo que
 * necesite una condición que esto no expresa se agrega ACÁ y en su evaluador
 * (`engine/tournament-gate.ts`), nunca con un caso especial adentro del motor.
 */
export interface TournamentGate {
    /** Edades en que se juega, inclusive las dos puntas. */
    ages: readonly [number, number];
    /**
     * La unión, si el torneo es de una sola. EN MINÚSCULA.
     *
     * `null` es "el de tu unión, sea cual sea". El M17 lleva `'ar'` porque es el
     * Campeonato Argentino Juvenil y no existe fuera de acá; los dos Mundiales
     * llevan `null` porque un galés juega el suyo.
     *
     * ⚠️ MINÚSCULA, y está dicho porque ya se pagó: `RUGBY_UNIONS` indexa por
     * código ISO en minúscula (`ar`, `uy`, `cl`) y `player.countryCode` guarda esa
     * misma forma. Un `'AR'` acá no rompe nada ruidosamente — simplemente la
     * compuerta no abre nunca, y el torneo desaparece del juego sin que falle una
     * línea. Hay un test que lo vigila.
     */
    unionCode: string | null;
    /**
     * LAS REGIONES QUE JUEGAN ESTE TORNEO. `null` es "no mira la región".
     *
     * Es la puerta de los continentales M18: el Sudamericano lo juegan las
     * uniones de Sudamérica y el de Oceanía las de Oceanía y el Pacífico. Es una
     * LISTA y no una región sola porque el mapa de regiones del catálogo parte
     * cosas que un torneo junta —las islas británicas están separadas de Europa,
     * y el Pacífico de Oceanía— y un torneo por cada mitad sería inventar
     * competencias que no existen.
     *
     * La región de una unión sale de `regionOfCountry`, que es el mismo mapa que
     * usa el mercado: escribir acá una lista de países sería la segunda fuente de
     * verdad de siempre (§1.9).
     */
    regions: readonly string[] | null;
    /** Media mínima. `null` es sin piso. */
    minOvr: number | null;
    /**
     * Escalón representativo, si hace falta estar en un plantel.
     *
     * El Mundial mayor lo pide —no se juega un Mundial sin estar en la mayor— y
     * los dos Mundiales juveniles no: a la academia y al M20 se entra por edad y
     * por media, que es como se entra de verdad.
     *
     * ⚠️ SE COMPARA POR IGUALDAD Y NO POR ORDEN, así que el nombre `minTrack`
     * miente un poco y se deja dicho: `a-xv` no es «casi nacional». Son dos
     * planteles distintos y el convocado de la mayor no juega además la ventana
     * de los A. El evaluador está en `engine/tournament-gate.ts` y es el único
     * lugar donde esta regla vive.
     */
    minTrack: 'union' | 'm20' | 'a-xv' | 'nacional' | null;
    /**
     * ¿Se juega todos los años?
     *
     * El Mundial mayor no: cae cada cuatro y el calendario ya sabe cuáles. Los
     * juveniles sí. Cuando es `false`, la edición la decide
     * `data/catalogs.ts` y no una cuenta escrita acá — una cuenta escrita acá
     * sería la derivada congelada de siempre (CLAUDE.md §1.9).
     */
    everySeason: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 bis · LAS DIVISIONES — el ascenso y el descenso
// ═══════════════════════════════════════════════════════════════════════════
//
// El Mundial juvenil son DOS torneos: la primera división con las dieciséis
// mejores uniones, y la segunda con las dieciséis que siguen. Los dos primeros
// de la B suben y los dos últimos de la A bajan, así que la división de tu unión
// no es un dato fijo del catálogo: es algo que se GANA y se PIERDE jugando, y
// cambia entre una edición y la siguiente.
//
// ── LO QUE NO SE GUARDA, Y POR QUÉ ─────────────────────────────────────────
// La división de tu unión NO es un campo de `CaptainState`. Se DERIVA de dos
// cosas que el estado ya tiene: el ranking mundial de tu unión —que dice dónde
// arrancás— y los M20 que ya jugaste, que están enteros en `state.tournaments`
// con sus partidos adentro.
//
// Es el §1.9 del CLAUDE.md del feature, y acá el argumento es más fuerte que de
// costumbre: un campo `division` guardado sería una segunda fuente de verdad que
// se desincroniza con UN solo camino que se olvide de actualizarla —y el síntoma
// sería un jugador que baja a la B y al año siguiente juega la A igual, o peor,
// una copa de la A en la vitrina de alguien que jugaba la B—. Derivada, eso no
// se puede escribir.
//
// ── LO QUE ESTE MODELO NO SIMULA, DICHO ANTES DE QUE SE NOTE ───────────────
// El ascenso y el descenso de las OTRAS TREINTA uniones. Sube y baja tu unión y
// nadie más, porque la única edición que el juego simula es la tuya: las demás
// salen de la franja del ranking, que no se mueve.
//
// Es la misma decisión que la regla 3 de la cabecera de este archivo —el campeón
// que se juega le gana al campeón que se sortea— y el costo está acotado a
// propósito: el campo tiene siempre dieciséis equipos porque `rivalsFor` toma la
// franja y completa, así que subir ocupa un lugar de arriba y bajar deja uno
// libre sin que haga falta contarle a nadie quién lo llenó.

export interface TournamentTier {
    /**
     * A DÓNDE SE SUBE, y con qué puestos.
     *
     * `places: 2` es "los dos primeros suben". `null` en la primera división,
     * que no tiene a dónde subir.
     */
    up: { places: number; to: TournamentId } | null;
    /**
     * A DÓNDE SE BAJA, y con cuántos puestos del fondo.
     *
     * `places: 2` es "los dos últimos bajan", y cuáles son los dos últimos sale
     * de `fieldSize` y no de un número escrito: en un torneo de dieciséis son el
     * 15.º y el 16.º, y en uno de veinticuatro serían otros.
     */
    down: { places: number; to: TournamentId } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LA DEFINICIÓN
// ═══════════════════════════════════════════════════════════════════════════

export interface TournamentDef {
    id: TournamentId;
    /** Cómo se llama en la pantalla. */
    labelEs: string;
    /** La línea de abajo del título: qué es esto. */
    briefEs: string;
    /** El nombre del trofeo, para la vitrina. */
    trophyEs: string;
    gate: TournamentGate;

    /**
     * CONTRA QUIÉNES SE JUEGA.
     *
     * Declarado y no inferido de la compuerta. La primera versión preguntaba
     * `gate.unionCode === 'AR'` adentro del motor para decidir si los rivales
     * eran provincias o uniones, y eso está mal por dos motivos: mete un país
     * escrito a mano en el motor —que no tiene por qué saber que Argentina
     * existe— y hace que la compuerta signifique DOS cosas, así que un torneo
     * argentino de selecciones nacionales sería inexpresable.
     */
    rivalPool: 'provincias' | 'uniones' | 'region';
    /**
     * CUÁNTOS EQUIPOS LO JUEGAN. Es una PUERTA, y existe por una lección ya
     * pagada en este repo.
     *
     * La primera versión sorteaba el rival entre las ciento treinta y una
     * uniones con fixture, ponderando por cercanía de fuerza. El resultado fue
     * un Mundial M20 de Argentina contra Senegal, Nepal e Islas Cook: 35-9,
     * 61-12, 41-6.
     *
     * Y la causa NO era el peso de cercanía. Era el VOLUMEN: hay cinco uniones
     * fuertes y ciento veinte flojas, así que aunque cada flojita pese menos, en
     * conjunto ganan por cantidad. Es el mismo bicho que el CLAUDE.md de Carrera
     * de Rugby documenta con el sudafricano que recibía ofertas de la Tercera de
     * la URBA, y ahí está escrita la medicina:
     *
     *   «Cuando un mercado se desbalancea por volumen, la respuesta es una
     *    puerta, no un multiplicador más grande: el multiplicador se vuelve a
     *    quedar corto con el próximo catálogo nacional que entre.»
     *
     * La puerta acá es la de verdad: a un Mundial no entran las ciento treinta y
     * una: entran las que clasificaron. Dieciséis en el M20, veinticuatro en el
     * mayor. Con el campo acotado, el peso de cercanía vuelve a hacer lo suyo
     * ADENTRO de un grupo de rivales que tiene sentido.
     *
     * Se ignora cuando `rivalPool` es `'provincias'`: ese campo ya son ocho.
     */
    fieldSize: number;
    /**
     * DESDE QUÉ PUESTO DEL RANKING SALE EL CAMPO. `1` es "los mejores".
     *
     * Con `fieldSize` define una FRANJA: la primera división del M20 son las
     * uniones 1 a 16 y la segunda las 17 a 32. Es lo que hace que las dos
     * divisiones no compartan un solo rival, y sale de un número declarado en vez
     * de un `if` que pregunte cuál es la B.
     *
     * La franja es de dónde sale el campo, NO quién está adentro: a la primera
     * división se puede llegar desde el puesto 25 subiendo, y ahí tu unión ocupa
     * un lugar de la franja de arriba sin pertenecerle por ranking. Por eso el
     * recorte de `rivalsFor` toma la franja y COMPLETA con los que siguen: el
     * campo tiene siempre `fieldSize` equipos, estés donde estés.
     */
    fieldFromRank: number;
    /** Cuántos partidos de grupo. Tres en los cuatro torneos. */
    groupMatches: number;
    /**
     * PUNTOS PARA PASAR, o `null` si en este torneo no hay corte.
     *
     * ⚠️ ACÁ ESTÁ EL ÚNICO NÚMERO QUE SE TRADUJO DE FÚTBOL A RUGBY, y se deja
     * dicho porque es el que se va a querer discutir.
     *
     * El diseño original pedía CUATRO puntos, que en fútbol —3 por ganar— son
     * "una victoria y un empate": dos de tres partidos salidos bien. En rugby la
     * tabla es otra: 4 por ganar, 2 por empatar, y los dos bonus (§5). Con esa
     * tabla, cuatro puntos son UNA VICTORIA SOLA y el grupo deja de ser un
     * corte. Nueve es lo que preserva la tensión que el cuatro tenía: dos
     * victorias, o una victoria y dos bonus bien peleados.
     *
     * Si se quiere el cuatro literal, se cambia este número y nada más.
     *
     * ── POR QUÉ PUEDE SER `null`, Y POR QUÉ NO ALCANZABA CON DEJARLO EN 9 ────
     * El M20 no tiene corte: los dieciséis siguen jugando y lo que el grupo
     * decide es EN QUÉ CUADRO (`placement`). Dejarlo en 9 habría sido un número
     * que nadie lee y que el próximo que abra el archivo va a creer — la mentira
     * con fecha de vencimiento del §1.9. `null` dice la verdad: acá no se corta.
     */
    qualifyPoints: number | null;
    /**
     * ¿EL GRUPO REPARTE CUADROS EN VEZ DE ELIMINAR?
     *
     * Declarado, y antes era `def.id === 'mundial-m20'` adentro del motor con un
     * comentario que juraba lo contrario. Es el §1.5 exacto —el nombre y el
     * cuerpo diciendo cosas distintas— y se pagó igual que las otras cinco
     * veces: `hasPlacement` decía «se pregunta por el DATO y no por el id» y
     * preguntaba por el id.
     *
     * ── QUÉ SIGNIFICA EN NÚMEROS ────────────────────────────────────────────
     * Que el torneo se parta en cuadros de `2 ** knockout.length` equipos, uno
     * por cada cantidad de victorias posible en el grupo. En el M20: dieciséis
     * equipos, cuatro grupos de cuatro, tres partidos, y de ahí salen CUATRO
     * cuadros de cuatro —el del título, el del 5.º, el del 9.º y el del 13.º—.
     * Nadie se va a casa y todos terminan con un puesto exacto del 1 al 16.
     *
     * Ninguno de esos números se escribe: los tres —tamaño del cuadro, cuántos
     * cuadros, qué puesto le toca a cada uno— salen de `groupMatches` y de
     * `knockout` en `engine/tournament.ts`. Un catálogo que los repitiera sería
     * la derivada congelada de siempre.
     */
    placement: boolean;
    /**
     * LA DIVISIÓN: con quién se asciende y con quién se desciende.
     *
     * `null` en el torneo que no tiene otra división abajo ni arriba, que hoy son
     * el Argentino Juvenil y el Mundial mayor.
     *
     * Ver §2 bis para cómo se resuelve en qué división está una unión, que es la
     * parte que no se guarda.
     */
    tier: TournamentTier | null;
    /** Las rondas de eliminación, en orden. Vacío no existe: todos definen algo. */
    knockout: readonly RoundId[];
    /**
     * LAS RONDAS QUE SE JUEGAN EN CASILLAS en vez de destaparse.
     *
     * Hoy es la final de los dos Mundiales, y es una LISTA y no un booleano para
     * que mover el juego a la semifinal —o sacarlo— sea editar este renglón.
     *
     * Por qué la final y nada más: porque el juego de las casillas dura seis o
     * siete clics, y siete partidos así serían cuarenta y cinco. Está pensado
     * para el partido que el jugador va a recordar, y ponerlo en todos lo
     * gastaría. El resto del torneo sigue siendo la espera, que es lo que hace
     * que la final se sienta otra cosa.
     */
    casillasRounds: readonly RoundId[];
    /**
     * ¿SUS PARTIDOS SE JUEGAN EN LA GRILLA DE TREINTA?
     *
     * Hoy los tres dicen que sí, y el campo existe igual: es la declaración de
     * que un torneo PUEDE no usarla, y el día que entre uno que se resuelva de
     * otra forma —una gira, un seven— la respuesta está en el catálogo y no en un
     * `if` con el id adentro.
     *
     * Hubo una versión donde el Argentino Juvenil lo tenía en `false` "por
     * escala". Estaba mal: un partido o se juega o no se juega, y el primero de
     * tu vida no puede ser el único que se mira desde afuera.
     *
     * La final de un Mundial NO usa esta grilla: usa las nueve casillas. Un
     * partido lleva una cosa o la otra, nunca las dos.
     */
    matchGrid: boolean;
    /**
     * ¿SE HABILITA LA ARENGA?
     *
     * Falso en el M17 por decisión de diseño y no por olvido: el umbral de
     * Liderazgo que la abre no lo alcanza nadie a los diecisiete, así que un
     * comodín declarado ahí sería contenido muerto con cartel de contenido vivo.
     * Que aparezca recién en el M20 la convierte en un ascenso.
     */
    arenga: boolean;
    /**
     * ¿EL QUE PIERDE LA SEMIFINAL JUEGA POR EL TERCER PUESTO?
     *
     * Es la tercera forma que puede tener el final de un torneo, y las tres ya
     * conviven en el catálogo sin un solo `if` con un id adentro:
     *
     *   · `placement: true`  — nadie se va a casa y todos siguen jugando por su
     *     puesto. Es el M20: cuatro cuadros de cuatro.
     *   · `placement: false, bronze: false` — elimina de verdad. Es el Argentino
     *     Juvenil y la Nations Cup: perdiste la semi, se terminó.
     *   · `placement: false, bronze: true`  — elimina hasta la semifinal y ahí
     *     abre DOS partidos: la final y el del tercer puesto. Es el Mundial, y
     *     es el formato real de un Mundial de rugby.
     *
     * ── POR QUÉ UN CAMPO Y NO UNA RONDA NUEVA EN `RoundId` ─────────────────
     * Porque el partido por el tercer puesto NO es otra ronda: se juega el mismo
     * día que la final y es el mismo escalón del cuadro. Lo que cambia es POR QUÉ
     * SE JUEGA, y eso ya se deriva de si ganaste la semi. Una ronda
     * `'tercer-puesto'` obligaría a `matchesInRound`, a `roundAfter` y a las dos
     * tablas de rótulos a aprender un caso nuevo para expresar algo que el
     * historial de partidos ya contesta solo (§1.9).
     *
     * ⚠️ PIDE UNA RONDA ANTES DE LA ÚLTIMA. Con `knockout: ['final']` no hay
     * semifinal que perder y el campo no significa nada; `bronzeFrom` devuelve
     * `null` y el torneo se comporta como si fuera `false`.
     */
    bronze: boolean;
    /**
     * CUÁNTO CARTEL DEJA ESTE TORNEO, como multiplicador.
     *
     * Estaba DEDUCIDO adentro de `rewardOf` con un ternario que preguntaba
     * `minTrack === 'nacional' ? 1.6 : minOvr !== null ? 0.6 : 0.4`, y ése es el
     * §1.7 del CLAUDE de captain esperando cobrarse: la variable se llamaba
     * `nivel` y el cuerpo preguntaba «¿tiene piso de media?». Las dos preguntas
     * dan lo mismo para los cuatro torneos que había y dejan de darlo con el
     * quinto — la Nations Cup no pide media, y con el ternario habría cobrado lo
     * que el Argentino Juvenil de los diecisiete.
     *
     * Los cuatro valores viejos se conservan EXACTOS a propósito: este campo no
     * recalibra nada, sólo deja de deducir lo que ahora se declara.
     *
     * PARÁMETROS LIBRES (§1.9). La escala: el que sale campeón del mundo con la
     * mayor sale en la tapa; el que sale campeón del Argentino Juvenil sale en el
     * grupo de WhatsApp del club.
     */
    fameLevel: number;
    /**
     * Fuerza base de los rivales, de 0 a 100, antes del ranking.
     *
     * Es el NIVEL DEL TORNEO: un Mundial M20 no se juega contra los mismos que
     * el Campeonato Argentino Juvenil aunque los dos tengan tres partidos de
     * grupo. Sube el piso de todos los rivales por igual; quién es mejor que
     * quién dentro del torneo lo sigue diciendo el ranking mundial.
     */
    baseStrength: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA ARENGA DEL CAPITÁN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EL COMODÍN, Y LA REGLA QUE LO HACE BUENO.
 *
 * Uno solo por torneo. Y NO VALE EN LA FINAL.
 *
 * La prohibición es el diseño entero, así que vale escribir por qué: sin ella,
 * la decisión es "guardarla para la final" y no es una decisión — es una
 * instrucción, y todo el mundo la sigue igual. Con ella, la pregunta pasa a ser
 * EN QUÉ RONDA QUEMARLA: la gastás en octavos porque te tocó un cruce feo y
 * llegás a la final sin nada, o te la guardás para la semi y rezás que el
 * octavo salga solo.
 *
 * No hay respuesta correcta, y por eso es una decisión.
 *
 * ── Qué hace, en números ──
 * No da vuelta un partido: EMPUJA. Suma `ARENGA_PUSH` a tu fuerza para ese
 * partido antes de que el marcador se sortee, que es como un vestuario empuja de
 * verdad. Un empujón que ganara solo convertiría el torneo en "acordate de
 * apretar el botón".
 */
export const ARENGA_LIDERAZGO = 75;
export const ARENGA_PUSH = 14;

// ═══════════════════════════════════════════════════════════════════════════
//  4 bis · LOS TRES COMODINES — la decisión que le faltaba al cuadro
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL PROBLEMA ────────────────────────────────────────────────────────────
// Un torneo son cinco partidos y todo lo demás ya está sorteado cuando la
// pantalla se dibuja: el jugador destapa. La arenga era la única pregunta y
// llegaba tarde —recién en eliminatorias— así que la fase de grupos entera, que
// es más de la mitad del torneo, no pedía nada.
//
// Con tres comodines la decisión pasa a ser DOBLE y arranca antes del primer
// partido: cuál me traigo, y cuándo lo quemo. Ninguna de las dos tiene respuesta
// obvia — el que trae la arenga no puede rehacer el partido que perdió en el
// grupo, y el que trae el cambio de plan llega a la final sin empujón.
//
// ── LOS TRES TIENEN CANAL, Y ESO NO ERA GRATIS ─────────────────────────────
// El §2 del CLAUDE de captain pide verificar que el motor pueda transportar una
// palanca ANTES de diseñarla encima, y acá se cobró: el segundo comodín iba a
// ser «la charla con el árbitro: anula una tarjeta», y un partido de torneo NO
// TIENE TARJETAS. `TournamentMatch` guarda puntos, tries, palos, grilla y tu
// nota — no hay disciplina adentro de un torneo, así que esa palanca no movía
// nada y habría quedado como un botón que no hace lo que dice.
//
// Se cambió el EFECTO y se conservó la escena: el capitán habla con el árbitro y
// el partido se le abre, que en el motor es tacharle celdas perdedoras a la
// grilla. Es el mismo verbo que ya usa la Visión en la final (`CasillasGrid`
// .tachada) y por lo tanto un canal probado — comprar información no es comprar
// la respuesta.
export type ComodinId = 'arenga' | 'arbitro' | 'plan';

export interface ComodinDef {
    id: ComodinId;
    labelEs: string;
    /** Qué hace, en una línea. */
    briefEs: string;
    /** Qué pide para poder traerlo. */
    requiresEs: string;
    /** Qué se resigna al traerlo. El §4 del CLAUDE raíz pide el costo, no el beneficio. */
    costEs: string;
}

/**
 * LO QUE PIDE CADA UNO.
 *
 * `ARBITRO_BELONGING` es DERIVADO y no escrito: «ser capitán» ya está definido
 * en `BELONGING_TIERS`, y escribir 48 acá sería la mentira con fecha de
 * vencimiento del §1.9 — los cinco pisos de la Pertenencia ya se movieron una
 * vez, en la 0.28.0, y este número se habría quedado apuntando al escalón
 * equivocado sin que nada avisara.
 */
export const ARBITRO_BELONGING = BELONGING_TIERS.find((t) => t.id === 'capitan')!.min;
export const PLAN_VISION = 80;

/**
 * CUÁNTAS CELDAS PERDEDORAS TE SACA EL ÁRBITRO.
 *
 * Sobre una grilla de treinta, seis es un empujón que se siente y no da vuelta
 * nada: el que iba a perder por poco pasa a tener chance, y el que iba a perder
 * por veinte sigue perdiendo. Es el mismo criterio que `ARENGA_PUSH` —empujar,
 * no ganar— porque si no el torneo se convierte en «acordate de apretar el
 * botón», que es exactamente lo que estos tres vinieron a evitar.
 */
export const ARBITRO_TACHADAS = 6;

/**
 * EL CATÁLOGO, en ORDEN CANÓNICO. Se itera por acá y nunca por las claves de un
 * objeto (CLAUDE.md raíz §1).
 *
 * El orden es el de la escalera que los abre —Liderazgo, cinta, Visión— y no el
 * de cuánto valen: cuál conviene depende del torneo y del cuadro, y ordenarlos
 * por potencia sería el juego contestando la pregunta que le está haciendo al
 * jugador.
 */
export const COMODINES: readonly ComodinDef[] = [
    {
        id: 'arenga',
        labelEs: 'La arenga',
        briefEs: 'Empujás el partido que viene. No lo da vuelta: empuja.',
        requiresEs: `Liderazgo ${ARENGA_LIDERAZGO}`,
        costEs: 'No vale en la final ni en la fase de grupos.',
    },
    {
        id: 'arbitro',
        labelEs: 'La charla con el árbitro',
        briefEs: 'El partido se te abre: salen seis celdas perdedoras de la grilla.',
        requiresEs: 'Ser capitán de tu club',
        costEs: 'Sólo sirve en un partido con grilla, y no en la final.',
    },
    {
        id: 'plan',
        labelEs: 'El cambio de plan',
        briefEs: 'Rehacés un partido de grupos que ya perdiste.',
        requiresEs: `Visión ${PLAN_VISION}`,
        costEs: 'Sólo en la fase de grupos: en eliminatorias no hay revancha.',
    },
];

export function getComodin(id: ComodinId): ComodinDef {
    const def = COMODINES.find((c) => c.id === id);
    // Un id que no existe es un dato mal cargado y no un caso borde: se rompe
    // ruidosamente en vez de devolver el primero de la lista, que es la trampa
    // del índice del §1.5.
    if (!def) throw new Error(`Comodín desconocido: ${id}`);
    return def;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 · UN PARTIDO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los puntos de la tabla, como los reparte el rugby y no el fútbol.
 *
 * Los dos bonus son de las cosas más propias del deporte y entran porque hacen
 * legible una derrota: perder por cinco puntos y perder por cuarenta no dejan lo
 * mismo, y en la tabla del grupo se nota.
 */
export const WIN_POINTS = 4;
export const DRAW_POINTS = 2;
/** Bonus ofensivo: cuatro tries o más. */
export const TRY_BONUS_TRIES = 4;
/** Bonus defensivo: perder por siete o menos. */
export const LOSS_BONUS_MARGIN = 7;

/** Cómo terminó, desde tu lado. */
export type MatchResult = 'ganado' | 'empatado' | 'perdido';

/**
 * LA DEFINICIÓN A LOS PALOS.
 *
 * En rugby un cruce empatado va a suplementario y después a una competencia de
 * pateadores — no a "penales", que es la palabra del otro deporte. El nombre
 * importa: es el mismo criterio que llama `club` a lo que el fútbol llama
 * equipo.
 *
 * Cinco patadas por lado, y si siguen iguales, muerte súbita. Se sortea con el
 * partido y viaja adentro, por la regla 1 de la cabecera.
 */
export interface KickOff {
    /** Cada patada, en orden: `true` si entró. */
    tuyas: boolean[];
    rivales: boolean[];
    /** Cuántas destapó el jugador. La pantalla las va mostrando de a una. */
    revealed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA GRILLA DEL PARTIDO — treinta formas en que podía salir
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SEIS POR CINCO, Y ELEGÍS UNA.
 *
 * Treinta celdas, cada una con un resultado atrás. Tocás una y esa es tu tarde.
 * No hay una segunda elección: un partido, una celda.
 *
 * ── LA PROPORCIÓN ES LA PROBABILIDAD, Y AHÍ VIVE TODO ──────────────────────
 * Las treinta NO son mitad y mitad. Se reparten según lo que ese cruce vale de
 * verdad: contra un rival muy inferior, veintiséis esconden victoria y cuatro
 * derrota; contra el número uno del mundo, al revés. La grilla es una lotería
 * CARGADA, y lo que la carga es la diferencia de fuerza —tu selección, tu media
 * adentro, el ranking del de enfrente—.
 *
 * Eso es lo que hace que sea un partido y no un volado: el jugador no ve los
 * números, pero la mano viene con el peso puesto desde antes de tocar.
 *
 * ── POR QUÉ NUNCA ES TREINTA A CERO ────────────────────────────────────────
 * Los extremos están acotados: siempre hay al menos dos de cada lado. Una grilla
 * de treinta victorias diría «no podés perder», y eso es mentira sobre el
 * deporte —el favorito pierde, es la mitad de por qué se juegan los partidos—.
 * El tope deja un 7% de sorpresa en el peor cruce, que es aproximadamente lo que
 * pasa en el rugby de selecciones.
 *
 * ── LO QUE SE GUARDA, Y POR QUÉ NO SON TREINTA MARCADORES ──────────────────
 * Se guardan las treinta CELDAS (victoria sí o no) y DOS marcadores: el de ganar
 * y el de perder. Treinta marcadores completos serían ciento veinte números por
 * partido y hasta ochocientos por torneo en el `localStorage`, para que el
 * jugador vea exactamente uno. Nadie puede mirar atrás de las otras
 * veintinueve, así que no hay nada que mentir.
 */
export interface MatchGrid {
    /** Treinta celdas: `true` esconde victoria. La proporción es la probabilidad. */
    celdas: boolean[];
    /** La que tocó, o `null` mientras no eligió. */
    elegida: number | null;
    /**
     * LAS CELDAS QUE TE SACÓ EL ÁRBITRO, por índice y en orden creciente.
     *
     * SIEMPRE SON PERDEDORAS, y es todo el punto — el mismo que ya hacía
     * `CasillasGrid.tachada` con la Visión en la final: no te dice dónde está la
     * victoria, te saca posibilidades malas del tablero. Comprar información no
     * es comprar la respuesta.
     *
     * Vacía en los partidos donde no se quemó el comodín, que son casi todos. Va
     * en el partido y no en el torneo porque se gasta en UNO: guardarla arriba
     * obligaría a recordar además en cuál, que es el mismo dato dicho dos veces.
     */
    tachadas: number[];
    siGana: { puntos: number; puntosRival: number; tries: number; triesRival: number };
    siPierde: { puntos: number; puntosRival: number; tries: number; triesRival: number };
}

/** Seis columnas por cinco filas. El alto y el ancho los lee la pantalla. */
export const GRID_COLS = 6;
export const GRID_ROWS = 5;
export const GRID_TOTAL = GRID_COLS * GRID_ROWS;

/**
 * El piso y el techo de victorias en la grilla.
 *
 * Dos de treinta es un 6,7%: la sorpresa que el rugby tiene de verdad. Sin este
 * tope, un cruce muy desparejo produciría una grilla de un solo color y el
 * jugador tocaría una celda sabiendo el resultado.
 */
export const GRID_MIN_WINS = 2;

// ═══════════════════════════════════════════════════════════════════════════
//  5 bis · LAS CASILLAS — la final que no se destapa, se juega
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA FINAL DEL MUNDO, EN NUEVE CASILLAS.
 *
 * Nueve ataques de los últimos veinte minutos. TRES terminan en try. Tenés N
 * pelotas: elegís por dónde ir, y cada elección se destapa sola. Encontrás los
 * tres antes de quedarte sin pelotas y son campeones del mundo.
 *
 * ── ACÁ NO HAY HABILIDAD, Y ES A PROPÓSITO ─────────────────────────────────
 * Las casillas son indistinguibles, así que cualquier orden de elección tiene
 * exactamente la misma probabilidad. No existe "jugarlo bien", y eso NO es un
 * defecto: es el juego diciendo dónde vive el azar.
 *
 * Si los quince Momentos de El Capitán fueran todos de destreza, el juego sería
 * un examen. Que la final del Mundial se defina en algo que no se puede dominar
 * es lo que hace que clavar un line-out se sienta ganado y no obligatorio.
 *
 * ── LO QUE COMPRA EL ATRIBUTO ES INFORMACIÓN, NO PODER ─────────────────────
 * Y esta es la parte que no usábamos en ningún lado. En los otros sesenta y
 * cinco minijuegos el atributo compra un RECURSO —una ventana más ancha, más
 * tiempo para mirar la seña, más tolerancia—. Acá compra SABER: con Visión alta,
 * el juego te tacha gratis una casilla VACÍA antes de empezar. No te dice dónde
 * están los tries: te saca una posibilidad mala del tablero.
 *
 * Y se nota en la cuenta, que es lo que lo hace valer:
 *
 *     P(encontrar los tres) = C(vacías, tiros − 3) / C(casillas, tiros)
 *
 *     │              │ 5 pelotas │ 6 pelotas │ 7 pelotas │
 *     │ 9 casillas   │   11,9%   │   23,8%   │   41,7%   │
 *     │ 8 (con Visión)│  17,9%   │   35,7%   │   62,5%   │
 *
 * La casilla tachada vale entre 6 y 21 puntos porcentuales. No es un adorno: es
 * la diferencia entre perder siete de cada ocho finales y ganar cinco de cada
 * ocho. Las pretemporadas que subieron Visión cinco años atrás SE VEN ahí.
 *
 * ── Y LO QUE COMPRA EL RIVAL ES CUÁNTAS PELOTAS TENÉS ──────────────────────
 * Si el azar fuera lo único, el número uno del mundo y el que entró raspando
 * ganarían la final con la misma frecuencia, y el torneo entero dejaría de
 * significar algo en su último partido. La fuerza relativa decide los TIROS —
 * cinco, seis o siete— que es donde la tabla de arriba tiene toda su pendiente.
 */
export interface CasillasGrid {
    /** Nueve casillas: `true` es try escondido. Sorteadas al armar el partido. */
    celdas: boolean[];
    /**
     * EL MINUTO EN QUE ARRANCA, para la línea de partido.
     *
     * Presentación pura: no entra en ninguna cuenta. Se deriva con `hashSeed` y
     * NO con el rng —así no consume una tirada y no corre el stream de nadie—
     * pero vive en el estado igual, porque tiene que ser el mismo minuto antes y
     * después de un F5.
     */
    minuto: number;
    /** Las que ya tocaste, EN ORDEN. La pantalla las dibuja destapadas. */
    abiertas: number[];
    /** La que te tachó la Visión, o `null`. Siempre es una vacía. */
    tachada: number | null;
    /** Cuántas pelotas tenés en total. */
    tiros: number;
    /**
     * Los dos marcadores, sorteados los DOS al armar el partido.
     *
     * Es la única forma de que el jugador decida de verdad sin romper la regla 1
     * del contrato: el torneo se sortea entero al abrirse. Si el marcador se
     * armara al terminar las casillas, un F5 en el medio de la final devolvería
     * otro partido. Con los dos adentro, lo que las casillas eligen es CUÁL de
     * los dos pasó — y eso sobrevive a cualquier recarga.
     */
    siGana: { puntos: number; puntosRival: number; tries: number; triesRival: number };
    siPierde: { puntos: number; puntosRival: number; tries: number; triesRival: number };
}

/** Cuántas casillas y cuántas esconden un try. */
export const CASILLAS_TOTAL = 9;
export const CASILLAS_TRIES = 3;

/**
 * La Visión que hace falta para que te tachen una casilla.
 *
 * Es el mismo escalón que la arenga pide de Liderazgo, y no por comodidad: las
 * dos son la recompensa de haber entrenado algo que no se ve en la planilla, y
 * que valgan lo mismo hace que elegir entre las dos sea una decisión de
 * pretemporada y no una cuenta.
 */
export const CASILLAS_VISION = 75;

export interface TournamentMatch {
    round: RoundId;
    /** Código de la unión rival, para el escudo y el ranking. */
    rivalCode: string;
    /** Cómo se lee el rival. Copiado al armar: no se resuelve el catálogo al leer. */
    rivalName: string;
    /** Tus puntos y los de él. Sorteados al armar la ronda, no al destapar. */
    puntos: number;
    puntosRival: number;
    /** Tries tuyos, para el bonus ofensivo y para la crónica. */
    tries: number;
    triesRival: number;
    /** La definición a los palos, si el cruce quedó empatado. */
    palos: KickOff | null;
    /**
     * LAS CASILLAS, si este partido se JUEGA en vez de destaparse.
     *
     * `null` en los ocho de cada nueve partidos que son una celda y nada más.
     * Distinto de `null` solo en las rondas que el torneo declara en
     * `casillasRounds` — hoy, la final de los dos Mundiales.
     */
    casillas: CasillasGrid | null;
    /**
     * LA GRILLA DE TREINTA, si este partido se juega eligiendo una celda.
     *
     * `null` en el Argentino Juvenil, que se destapa derecho. Distinto de `null`
     * en todos los partidos de los dos Mundiales MENOS la final, que tiene su
     * propio tablero de nueve. Un partido nunca lleva las dos cosas.
     */
    grid: MatchGrid | null;
    /** ¿Ya lo destapó? Es lo ÚNICO que cambia al hacer clic. */
    revealed: boolean;
    /** ¿Quemó la arenga acá? */
    arenga: boolean;
    /**
     * TU PARTIDO, no el del equipo.
     *
     * El torneo lo gana el plantel, pero la nota es tuya: es lo que después se
     * convierte en caps, en Cartel y en la línea de la crónica. Sale de tu media
     * contra el nivel del torneo, con la misma escala de cuatro que los
     * minijuegos para que "clavarla" signifique lo mismo en todo el juego.
     */
    tuya: MinigameGrade;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6 · EL TORNEO EN CURSO — lo que viaja al guardado
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON PURO Y OBLIGATORIO: vive adentro de `CaptainState` y de ahí va al
 * `localStorage`. Nada de `Date`, `Map`, `Set` ni funciones (CLAUDE.md §2).
 *
 * No guarda el `TournamentDef`: guarda el `id` y lo resuelve contra el catálogo,
 * que es la misma regla que el club y el entrenamiento. Retocar el texto de un
 * torneo no puede invalidar una partida en curso.
 */
export interface PendingTournament {
    id: TournamentId;
    /** Temporada de la carrera en que se juega. */
    season: number;
    /** La semilla del torneo. Derivada, nunca tomada del stream de la carrera. */
    seed: number;
    /** Tu unión. Copiada al abrir: si te cambia la elegibilidad, este torneo ya arrancó. */
    unionCode: string;
    /** Todos los partidos jugados y el de ahora, en orden. */
    matches: TournamentMatch[];
    /** En qué ronda está. */
    round: RoundId;
    /**
     * EL PARTIDO QUE ESTÁ ABIERTO EN LA GRILLA, o `null`.
     *
     * Es índice en `matches`. Vive en el estado y no en la pantalla porque tiene
     * que sobrevivir al F5: si estuviera en un `useState`, recargar en la mitad
     * de la grilla te devolvería al cuadro y podrías volver a entrar — o sea,
     * volver a elegir el mismo partido. El estado es lo único que no se puede
     * repetir con una recarga.
     */
    playing: number | null;
    /**
     * EL COMODÍN QUE TRAJISTE, o `null` mientras no lo elegiste.
     *
     * Se elige ANTES del primer partido y es la mitad de la decisión doble: cuál
     * me traigo, y cuándo lo quemo. Vive en el torneo y no en el estado del
     * jugador porque es por torneo — el año que viene se vuelve a elegir, con
     * otro cuadro enfrente.
     *
     * `null` también cuando el torneo no ofrece ninguno (el M17) o cuando el
     * jugador no alcanza ni un requisito: ahí no hay pregunta que hacer y la
     * pantalla no la hace.
     */
    comodin: ComodinId | null;
    /**
     * ¿YA LO GASTASTE?
     *
     * Se llamaba `arengaUsed` cuando la arenga era el único, y ese nombre pasó a
     * mentir en cuanto entraron tres: el campo no dice «gastaste la arenga»,
     * dice «gastaste EL comodín, sea cual sea». Es el §1.5 del CLAUDE de captain
     * —el nombre y la cosa dicen lo mismo o no dicen nada— y por eso se renombró
     * en vez de dejarlo andando: `arengaUsed === true` en un torneo donde se
     * quemó el cambio de plan es exactamente la clase de línea que sobrevive a
     * la revisión porque leerla con atención confirma el nombre.
     */
    comodinUsed: boolean;
    /**
     * Dónde terminó. `null` mientras siga vivo.
     *
     * `'campeon'` es el único que reparte trofeo. `'eliminado'` guarda la ronda
     * en `finalRound` para que la crónica pueda decir hasta dónde llegaste, que
     * es la mitad de lo que un torneo deja.
     *
     * ⚠️ EN UN TORNEO CON CUADROS, `'eliminado'` NO QUIERE DECIR ELIMINADO. En
     * el M20 nadie se va a casa: los tres valores de acá contestan solamente
     * «¿ganaste la final del título, la perdiste, o ninguna de las dos?». El
     * puesto exacto —del 1 al 16— no se guarda porque se deriva de los partidos
     * (`finalPlace` en `engine/tournament.ts`), y guardarlo sería una segunda
     * fuente de verdad que un torneo mal cerrado dejaría mintiendo para siempre.
     *
     * Queda dicho porque hay una consecuencia viva: `FAME_BY_OUTCOME` paga por
     * este campo, así que hoy el que sale tercero del mundo cobra lo mismo que
     * el que sale decimosexto. Es una calibración pendiente y no un olvido —esos
     * números se midieron contra el digest y no se mueven a ojo—.
     */
    outcome: 'campeon' | 'finalista' | 'eliminado' | null;
    /** La ronda en que se terminó. Para la crónica y para el hito. */
    finalRound: RoundId | null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  7 · LO QUE EL TORNEO LE DEJA A LA CARRERA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El saldo, cerrado a los carriles que el motor ya tiene.
 *
 * Es el mismo criterio que `MomentDeltas` y por el mismo motivo: sin un tipo
 * cerrado, el próximo torneo inventa su propio contador y a los tres meses nadie
 * sabe cuáles existen. Lo que un torneo puede mover son estos cinco.
 */
export interface TournamentReward {
    /** Caps, y solo si el torneo es de la mayor. Los juveniles no dan caps. */
    caps: number;
    fame: number;
    /** Pertenencia con tu club: volver campeón del mundo se nota en el buffet. */
    belonging: number;
    /** El trofeo, si salieron campeones. */
    title: string | null;
    /** La línea de la crónica. */
    text: string;
}
