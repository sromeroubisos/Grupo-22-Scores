// EL CAPITÁN — el oficio del puesto. Prefijo `of-`.
//
// La familia de eventos que le habla a UN puesto y a ninguno más: el scrum del
// pilar, el cuaderno de señas del hooker, el canal del centro. Las otras cuatro
// familias del catálogo le pasan a cualquiera —el laburo, la cuota, la rodilla—
// y esta no: cada tarjeta de acá lleva `requires.families` y le llega a un
// octavo del padrón.
//
// ── POR QUÉ ES UNA FAMILIA Y NO UNA MARCA SOBRE LAS QUE YA HABÍA ────────────
// Porque es el mismo problema que `data/positions.ts` resuelve con la gloria por
// puesto, y merece la misma respuesta. Si la tarjeta grande de la carrera fuera
// siempre la misma, el pilar y el wing jugarían al mismo juego con distinto
// dibujo. Acá el pilar pelea penales de scrum, el hooker el porcentaje de su
// line-out y el wing los metros: cada uno se juega su carrera en la moneda que
// su puesto cobra.
//
// ── LAS DOS BANDAS QUE VIVEN ACÁ ────────────────────────────────────────────
// Un `raro` y un `oro` por familia, ocho y ocho. La frecuencia NO se decide en
// este archivo: se decide una sola vez en `RARITY_BAND` (`event-selector.ts`) y
// se mide en `__tests__/rarity.test.ts`. Agregar acá el noveno oro cambia QUÉ
// oro te toca, nunca cada cuánto te toca uno.
//
// ── CONTRA QUÉ CANAL SE ESCRIBE UNA TARJETA GRANDE ──────────────────────────
// Es la regla §2 del CLAUDE de captain —verificar que el motor tenga un canal
// antes de proponer la palanca— y acá hay que decirla fuerte, porque la
// intuición manda para el lado equivocado:
//
//   `fame` NO ES UN CANAL. Nadie lo lee. `generateOffers` mira `ovr`, `stage`,
//   el carril representativo y el techo doméstico; `reachableTrack` mira `ovr`
//   contra el umbral. El Cartel se muestra y se guarda, y ahí termina. Una
//   tarjeta de oro que pague en Cartel es un cartel: se ve grande y no mueve la
//   carrera. Va de yapa, nunca de premio principal.
//
//   LO QUE SÍ TRANSPORTA, y por eso es de lo que están hechos estos desenlaces:
//     · `attrs` de LA FAMILIA → media → tiempo de juego, umbral de convocatoria
//       y mercado. Recortado por el techo (`apply-decision.ts`), así que un +9
//       se convierte en +2 sin avisar: por eso acá nada pasa de +3.
//     · `playingTime` → `share` a razón de 0,12 por escalón → partidos → los
//       minutos que hacen crecer, y el puntaje que empuja el año siguiente.
//       Es la palanca más grande que tiene una decisión, y de lejos.
//     · `statBoost` → planilla → puntaje de temporada → premios y mérito.
//     · `belonging` → la cancha con tu nombre, que es el final del juego.
//
//   Y LO QUE NO EXISTE TODAVÍA: empujar la convocatoria sin pasar por la media.
//   Es deuda declarada en `simulate-season.ts`, no un olvido. Ninguna tarjeta de
//   acá promete una citación, porque el motor no la podría cumplir.

import type { CaptainEvent } from '../../types/event.ts';

export const OFICIO_EVENTS: CaptainEvent[] = [
    // ═══════════════════════════════════════════════════════════════════════
    //  PRIMERA LÍNEA — empuje · choque · manos · liderazgo
    //  La gloria son penales de scrum ganados.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-primera-el-pilar-de-la-mayor',
        category: 'club',
        title: 'Ochenta minutos contra un Puma',
        text: 'Un pilar de la mayor está volviendo de una lesión y lo mandaron a jugar el amistoso de pretemporada. Le toca tu lado del scrum.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['primera-linea'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'ir-a-buscarlo',
                label: 'Ir a buscarlo en cada entrada',
                hint: 'Ochenta minutos al límite. El cuerpo te lo va a cobrar en marzo.',
                outcomes: [
                    { weight: 45, effect: { attrs: { empuje: 2, choque: 1 }, body: 9 }, resultText: 'Le aguantaste seis scrums y en el séptimo lo hiciste caminar para atrás. Terminaste sin poder levantar los brazos.' },
                    { weight: 55, effect: { attrs: { empuje: 1 }, body: 14 }, resultText: 'Te pasó por encima toda la tarde. Aprendiste más en ochenta minutos que en dos temporadas, y a un precio parecido.' },
                ],
            },
            {
                id: 'estudiarlo',
                label: 'Estudiarle la entrada',
                hint: 'Aprendés cómo se hace. Vas a perder los scrums de hoy.',
                outcomes: [
                    { weight: 100, effect: { attrs: { empuje: 1, manos: 1, liderazgo: 1 } }, resultText: 'Te pasaste el partido mirándole el pie de apoyo y la cadera. En abril ya lo estabas haciendo vos.' },
                ],
            },
            {
                id: 'pedirle-que-te-ensene',
                label: 'Buscarlo en el tercer tiempo',
                hint: 'Te lleva una hora de charla. El partido lo jugás como puedas.',
                outcomes: [
                    { weight: 70, effect: { attrs: { empuje: 1, liderazgo: 2 }, belonging: 3 }, resultText: 'Se quedó dos horas con vos y con los dos pibes de M19 que se acercaron. Volvió al año siguiente por su cuenta.' },
                    { weight: 30, effect: { attrs: { liderazgo: 1 }, belonging: 1 }, resultText: 'Te dio diez minutos y se fue con los suyos. Los diez minutos igual te sirvieron.' },
                ],
            },
        ],
    },

    {
        id: 'of-primera-el-scrum-que-mira-alguien',
        category: 'club',
        title: 'El hombre del sombrero',
        text: 'El entrenador de forwards de la unión vino a ver al segunda línea de ellos. Va por el cuarto scrum parado atrás del ingoal, y no está mirando al segunda línea de ellos.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['primera-linea'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'dominar-cada-entrada',
                label: 'Dominar cada entrada',
                hint: 'Todo a una carta: el scrum. Si se te cae uno, lo vio.',
                outcomes: [
                    { weight: 60, effect: { attrs: { empuje: 2, choque: 1 }, playingTime: 2, statBoost: 3, fame: 4 }, resultText: 'Ganaste cuatro penales de scrum en veinte minutos. Se fue antes del final y a la semana llamó al club.' },
                    { weight: 40, effect: { attrs: { empuje: 1 }, playingTime: 1, statBoost: 1, body: 8 }, resultText: 'Ganaste dos y perdiste uno feo sobre el final. Anotó las tres cosas.' },
                ],
            },
            {
                id: 'ordenar-al-pack',
                label: 'Ordenar al pack',
                hint: 'Te ve conduciendo y no empujando. Los penales se los lleva el pack.',
                outcomes: [
                    { weight: 100, effect: { attrs: { empuje: 1, liderazgo: 2 }, playingTime: 1, statBoost: 2, belonging: 4 }, resultText: 'Acomodaste la segunda línea, cambiaste el ángulo de entrada y el pack no perdió un scrum en todo el segundo tiempo. Eso también se anota.' },
                ],
            },
            {
                id: 'jugar-tu-partido',
                label: 'Jugar tu partido',
                hint: 'Sin nada raro. La chance queda para el que se anime.',
                outcomes: [
                    { weight: 100, effect: { attrs: { empuje: 1 }, playingTime: 1 }, resultText: 'Jugaste como jugás siempre, ni mejor ni peor. Se fue en el entretiempo y no volvió.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  HOOKER — lanzamiento · empuje · choque · liderazgo
    //  La gloria es el porcentaje de line-out propio, y los tries de maul.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-hooker-el-cuaderno',
        category: 'club',
        title: 'El cuaderno',
        text: 'Un hooker que se retiró hace ocho años te para en el buffet con un cuaderno espiralado. Adentro están todas las señas y todos los line-outs que jugó en quince temporadas.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['hooker'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'aprenderlo-entero',
                label: 'Aprenderlo entero',
                hint: 'Un invierno de cuaderno. Vas a llegar tarde a la pretemporada.',
                outcomes: [
                    { weight: 75, effect: { attrs: { lanzamiento: 3 }, playingTime: -1 }, resultText: 'Te pasaste julio y agosto copiando señas. Arrancaste el torneo con medio paso menos y el line-out más limpio de tu vida.' },
                    { weight: 25, effect: { attrs: { lanzamiento: 1 }, playingTime: -1 }, resultText: 'Era el cuaderno de otro rugby: la mitad de las jugadas ya no se juegan. De la otra mitad sacaste dos.' },
                ],
            },
            {
                id: 'quedarte-con-tres',
                label: 'Quedarte con tres jugadas',
                hint: 'Tres que salen seguro. El resto del cuaderno se lo devolvés.',
                outcomes: [
                    { weight: 100, effect: { attrs: { lanzamiento: 1, liderazgo: 1 }, statBoost: 2 }, resultText: 'Elegiste tres y las machacaste hasta que salieron dormido. Una de las tres terminó siendo el try de maul de todo el año.' },
                ],
            },
            {
                id: 'darselo-al-plantel',
                label: 'Fotocopiarlo para el plantel',
                hint: 'Lo aprenden los forwards enteros. Deja de ser una ventaja tuya.',
                outcomes: [
                    { weight: 100, effect: { attrs: { liderazgo: 2 }, belonging: 5 }, resultText: 'Repartiste veinte fotocopias y los saltadores se lo estudiaron. El viejo lloró en el asado de fin de año.' },
                ],
            },
        ],
    },

    {
        id: 'of-hooker-el-lanzamiento-de-la-final',
        category: 'club',
        title: 'Line-out a cinco metros',
        text: 'Minuto 78 de la final. Están dos abajo y la tocaste al lateral en el ingoal de ellos. El line-out es tuyo y hay tres mil personas calladas.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['hooker'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'al-fondo',
                label: 'Al fondo, al cuatro',
                hint: 'Si sale, es el try. Es el lanzamiento más largo que tenés.',
                outcomes: [
                    { weight: 55, effect: { attrs: { lanzamiento: 2, liderazgo: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Fue al fondo, la bajaron limpia y el maul entró entero. Todavía hay una foto de esa jugada en el pasillo del club.' },
                    { weight: 45, effect: { attrs: { lanzamiento: 1 }, playingTime: -1, belonging: -2 }, resultText: 'Se fue diez centímetros larga y la agarraron ellos. Terminó ahí.' },
                ],
            },
            {
                id: 'al-primer-salto',
                label: 'Al uno, corto y rápido',
                hint: 'Casi no falla. Te deja el maul a cinco metros y a empujar.',
                outcomes: [
                    { weight: 80, effect: { attrs: { lanzamiento: 1, empuje: 1, choque: 1 }, playingTime: 1, statBoost: 2, belonging: 3 }, resultText: 'Salió limpio, armaron el maul y lo empujaron seis metros. Te tocó a vos apoyarla abajo de cuatro tipos.' },
                    { weight: 20, effect: { attrs: { empuje: 1 }, belonging: -1 }, resultText: 'Salió limpio y el maul no se movió un metro. Los penalizaron a ellos por tirarlo, y el reloj ya estaba en rojo.' },
                ],
            },
            {
                id: 'bajarlo-a-scrum',
                label: 'Pedir scrum',
                hint: 'El pack decide. Se resigna la jugada preparada de todo el año.',
                outcomes: [
                    { weight: 100, effect: { attrs: { empuje: 1, liderazgo: 2 }, playingTime: 1, belonging: 2 }, resultText: 'Miraste al pack y pediste scrum. No lo ganaron, pero cuando en el club hablan de esa final hablan de que pediste scrum.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  SEGUNDA LÍNEA — salto · choque · trabajo · liderazgo
    //  La gloria son line-outs ganados, y robados.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-segunda-el-que-te-lee',
        category: 'club',
        title: 'Te leen las señas',
        text: 'El segunda línea de ellos te viene robando dos line-outs por partido desde hace un mes. Alguien les está pasando el código, o te lo están leyendo en la cancha.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['segunda-linea'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'cambiar-el-codigo',
                label: 'Cambiar el código entero',
                hint: 'No te leen más. El plantel va a tardar un mes en aprenderlo.',
                outcomes: [
                    { weight: 65, effect: { attrs: { trabajo: 2, liderazgo: 1 }, statBoost: 2 }, resultText: 'Rehiciste el código con el hooker en dos semanas. No volvieron a robarte uno en toda la temporada.' },
                    { weight: 35, effect: { attrs: { trabajo: 1 }, statBoost: -1, playingTime: -1 }, resultText: 'El código nuevo era mejor y nadie se lo acordaba. Perdieron cuatro line-outs propios en la fecha siguiente.' },
                ],
            },
            {
                id: 'ganarle-en-el-aire',
                label: 'Ganárselo en el aire',
                hint: 'Sin cambiar nada, saltando más. Es contra el mejor del torneo.',
                outcomes: [
                    { weight: 50, effect: { attrs: { salto: 2, choque: 1 } }, resultText: 'Te levantaron medio segundo antes toda la tarde y no llegó a una. Se lo dijiste con la mirada y nada más.' },
                    { weight: 50, effect: { attrs: { salto: 1 }, body: 10 }, resultText: 'Te ganó tres y en la última te llevó puesto en el aire. Caíste de espalda y seguiste jugando.' },
                ],
            },
            {
                id: 'usarlo-de-carnada',
                label: 'Usarlo de carnada',
                hint: 'Le dejás leer una y le jugás la otra. Hay que perder una a propósito.',
                outcomes: [
                    { weight: 100, effect: { attrs: { trabajo: 1, liderazgo: 2 }, statBoost: 2 }, resultText: 'Le regalaste el primero del segundo tiempo y saltó como un resorte. Los tres siguientes fueron al fondo, con él todavía en el aire.' },
                ],
            },
        ],
    },

    {
        id: 'of-segunda-la-noche-del-robo',
        category: 'club',
        title: 'El line-out de ellos',
        text: 'Última jugada. Están uno arriba y tienen line-out propio a treinta metros. Si la aseguran, la tiran afuera y se terminó.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['segunda-linea'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'ir-al-robo',
                label: 'Ir al robo',
                hint: 'Es la única forma de que siga el partido. Si te elevás y no está, quedan sin cobertura.',
                outcomes: [
                    { weight: 45, effect: { attrs: { salto: 2, trabajo: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Leíste el pie del hooker, te elevaron en el dos y la bajaste con las dos manos. Lo que pasó después ya no importa: la jugada es esa.' },
                    { weight: 55, effect: { attrs: { salto: 1 }, playingTime: -1, belonging: -1 }, resultText: 'Te elevaste en el dos y fue al cuatro. La tiraron afuera con el reloj en rojo.' },
                ],
            },
            {
                id: 'presionar-el-maul',
                label: 'Esperar el maul y voltearlo',
                hint: 'Más seguro que el robo. Si lo hacés mal es penal y ni siquiera queda tiempo.',
                outcomes: [
                    { weight: 60, effect: { attrs: { choque: 1, trabajo: 2 }, playingTime: 1, statBoost: 2, belonging: 3 }, resultText: 'Los dejaste armar, entraste por el costado y lo giraste. Penal para ustedes y una jugada más de vida.' },
                    { weight: 40, effect: { attrs: { choque: 1 }, sanction: 1, belonging: -2 }, resultText: 'Lo agarraste antes de que se armara y el referee cobró obstrucción. Amarilla, y el partido terminó con vos afuera.' },
                ],
            },
            {
                id: 'armar-la-defensa',
                label: 'Bajar a armar la línea',
                hint: 'Si la aseguran no hay nada que hacer. Al menos no se pierde por un robo mal salido.',
                outcomes: [
                    { weight: 100, effect: { attrs: { trabajo: 1, liderazgo: 2 }, playingTime: 1, belonging: 2 }, resultText: 'Bajaste y acomodaste a los tres cuartos gritando. La tiraron afuera igual y en el vestuario nadie te reprochó nada.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  TERCERA LÍNEA — tackle · robo · choque · liderazgo
    //  La gloria son turnovers, y metros post-contacto.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-tercera-el-especialista',
        category: 'club',
        title: 'El tipo que vive del piso',
        text: 'Vino a dar una clínica un openside que jugó ochenta partidos profesionales. Dos horas de breakdown, y hay lugar para seis.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['tercera-linea'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'el-timing',
                label: 'Pedirle el tiempo del robo',
                hint: 'Robás más. También te van a cobrar más penales mientras aprendés.',
                outcomes: [
                    { weight: 70, effect: { attrs: { robo: 3 } }, resultText: 'Dos horas mirando el pie de apoyo del portador y nada más. Terminaste el año con seis turnovers más que el anterior.' },
                    { weight: 30, effect: { attrs: { robo: 2 }, sanction: 1 }, resultText: 'Aprendiste a llegar antes y todavía no a soltar. Te costó una amarilla en agosto.' },
                ],
            },
            {
                id: 'la-altura-del-tackle',
                label: 'Pedirle la altura del tackle',
                hint: 'Menos riesgo de audiencia. No suma un solo turnover.',
                outcomes: [
                    { weight: 100, effect: { attrs: { tackle: 2, choque: 1 } }, resultText: 'Se pasó las dos horas bajándote quince centímetros. Nunca más te citaron por un tackle alto.' },
                ],
            },
            {
                id: 'traer-a-los-pibes',
                label: 'Darle tu lugar a los de M19',
                hint: 'Se llenan las seis plazas con juveniles. Vos mirás desde afuera.',
                outcomes: [
                    { weight: 100, effect: { attrs: { robo: 1, liderazgo: 2 }, belonging: 5 }, resultText: 'Miraste las dos horas parado atrás del alambrado. Algo aprendiste igual, y el club se enteró de quién había cedido el lugar.' },
                ],
            },
        ],
    },

    {
        id: 'of-tercera-el-robo-de-la-temporada',
        category: 'club',
        title: 'Ellos con la pelota, ustedes con dos puntos',
        text: 'Minuto 79. Están dos arriba y ellos van por la fase catorce a diez metros de tu ingoal. El próximo ruck es el partido.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['tercera-linea'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'meter-las-manos',
                label: 'Meter las manos',
                hint: 'Es el turnover que gana el partido. También es el penal que lo pierde.',
                outcomes: [
                    { weight: 50, effect: { attrs: { robo: 2, choque: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Llegaste parado, apoyaste el hombro contra el ruck y la levantaste con las dos manos. El referee levantó el brazo para tu lado y se acabó.' },
                    { weight: 50, effect: { attrs: { robo: 1 }, playingTime: -1, belonging: -2 }, resultText: 'Te fuiste medio segundo tarde y no soltaste. Penal, tres puntos y la cara del vestuario.' },
                ],
            },
            {
                id: 'tacklear-y-levantarse',
                label: 'Tacklear y levantarte',
                hint: 'Lo más seguro que hay. No corta la fase: hay que aguantar dos más.',
                outcomes: [
                    { weight: 70, effect: { attrs: { tackle: 2, choque: 1 }, playingTime: 1, statBoost: 2, belonging: 3 }, resultText: 'Tackleaste, te levantaste y volviste a tacklear. En la dieciséis la tiraron adelante solos.' },
                    { weight: 30, effect: { attrs: { tackle: 1 }, body: 12, belonging: -1 }, resultText: 'Aguantaste tres fases más y en la última te pasaron por arriba de las piernas. Try abajo de los palos.' },
                ],
            },
            {
                id: 'ordenar-la-linea',
                label: 'Ordenar la línea y esperar',
                hint: 'Nadie se sale del sistema. Si abren para afuera, hay que llegar corriendo.',
                outcomes: [
                    { weight: 100, effect: { attrs: { tackle: 1, liderazgo: 2 }, playingTime: 1, belonging: 2 }, resultText: 'Gritaste que nadie saliera y no salió nadie. Se les acabaron las ideas en la fase dieciocho.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  MEDIO SCRUM — salida · patada · visión · liderazgo
    //  La gloria son tries desde la base, y metros de kick.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-medio-el-nueve-que-se-va',
        category: 'club',
        title: 'Se va el nueve',
        text: 'El titular de los últimos siete años se va a jugar afuera. En el club dan por hecho que la camiseta es tuya, y todavía no jugaste veinte partidos en primera.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['medio-scrum'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'pedirle-el-manual',
                label: 'Pedirle que te deje todo',
                hint: 'Dos meses de charlas antes de que se vaya. Es admitir que no lo tenías.',
                outcomes: [
                    { weight: 100, effect: { attrs: { salida: 2, vision: 1 }, belonging: 3 }, resultText: 'Se sentaron ocho martes seguidos con un cuaderno y los videos del año. Te dejó dicho hasta cómo hablarle a cada forward.' },
                ],
            },
            {
                id: 'jugar-a-tu-manera',
                label: 'Jugar a tu manera desde el primer día',
                hint: 'El equipo se acomoda a vos. Vas a perder los primeros partidos.',
                outcomes: [
                    { weight: 55, effect: { attrs: { salida: 2, patada: 1 }, statBoost: 2 }, resultText: 'Jugaste más rápido de lo que el pack venía acostumbrado y en la cuarta fecha ya lo habían agarrado. El torneo cambió de ritmo.' },
                    { weight: 45, effect: { attrs: { salida: 1 }, playingTime: -1 }, resultText: 'Los forwards llegaban tarde a todos los rucks y las pelotas salían sucias. Te sacaron dos fechas para acomodar.' },
                ],
            },
            {
                id: 'pelearla-en-la-cancha',
                label: 'No dar nada por hecho',
                hint: 'Te la ganás como si hubiera otro. Nadie te va a regalar la camiseta.',
                outcomes: [
                    { weight: 100, effect: { attrs: { salida: 1, vision: 1, liderazgo: 1 }, playingTime: 1 }, resultText: 'Entrenaste la pretemporada como si estuvieras peleando el puesto con alguien. Cuando arrancó el torneo la nueve ya era tuya y nadie discutió nada.' },
                ],
            },
        ],
    },

    {
        id: 'of-medio-el-partido-en-tus-manos',
        category: 'club',
        title: 'Ruck a cinco metros, no queda tiempo',
        text: 'Ruck a cinco metros del ingoal de ellos, un punto abajo, y el reloj está en rojo. La próxima jugada es la última del partido y la vas a elegir vos.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['medio-scrum'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'ir-vos',
                label: 'Ir vos por el costado ciego',
                hint: 'Están todos mirando al pack. Si te agarran, ahí se terminó.',
                outcomes: [
                    { weight: 50, effect: { attrs: { salida: 2, vision: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Amagaste el pase, saliste solo por el ciego y apoyaste antes de que se dieran vuelta. Dos metros y catorce años de rugby.' },
                    { weight: 50, effect: { attrs: { salida: 1 }, playingTime: -1, belonging: -2 }, resultText: 'El octavo de ellos no se comió el amague y te esperó. Te agarró en el aire a un metro de la línea.' },
                ],
            },
            {
                id: 'el-pick-and-go',
                label: 'Meter al pack de a uno',
                hint: 'Tres pick and go y están adentro. Si se pierde la pelota, no hay otra.',
                outcomes: [
                    { weight: 65, effect: { attrs: { salida: 1, liderazgo: 2 }, playingTime: 1, statBoost: 2, belonging: 4 }, resultText: 'Los fuiste metiendo de a uno y a la tercera el octavo se cayó adentro. Un try feo, de esos que en el club se cuentan mejor que los lindos.' },
                    { weight: 35, effect: { attrs: { liderazgo: 1 }, belonging: -1 }, resultText: 'Al segundo pick and go se les cayó adelante. Knock on, y nadie tuvo que explicar nada.' },
                ],
            },
            {
                id: 'abrirla',
                label: 'Abrirla a los tres cuartos',
                hint: 'Hay un wing solo del otro lado. Son cuatro pases y cualquiera se cae.',
                outcomes: [
                    { weight: 55, effect: { attrs: { vision: 2, patada: 1 }, playingTime: 1, statBoost: 2, belonging: 3 }, resultText: 'La sacaste limpia y llegó a la punta con el wing entrando de afuera hacia adentro. No lo tocó nadie.' },
                    { weight: 45, effect: { attrs: { vision: 1 }, playingTime: -1, belonging: -1 }, resultText: 'El tercer pase salió a los pies y la levantaron ellos. Cuatro pases era uno más de los que había.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  APERTURA — pegada · visión · tackle · liderazgo
    //  La gloria son los puntos, y el porcentaje al palo.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-apertura-el-pateador',
        category: 'club',
        title: 'El que arregla pateadores',
        text: 'Hay un tipo en Buenos Aires que arregla pateadores. Cobra caro, atiende los martes a las siete de la mañana y vos entrenás los martes a la noche.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['apertura'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'ir-todos-los-martes',
                label: 'Ir todos los martes',
                hint: 'Se te arregla la pegada. Son cuatro horas de viaje y un año sin dormir los lunes.',
                outcomes: [
                    { weight: 75, effect: { attrs: { pegada: 3 }, playingTime: -1 }, resultText: 'Te cambió el punto de contacto y la carrera de aproximación. Pasaste del 68 al 81 por ciento en una temporada.' },
                    { weight: 25, effect: { attrs: { pegada: 1 }, playingTime: -1, body: 8 }, resultText: 'Te desarmó la técnica en marzo y te la terminó de armar en octubre. En el medio pateaste peor que nunca.' },
                ],
            },
            {
                id: 'la-cabeza',
                label: 'Pedirle la rutina de la cabeza',
                hint: 'Una sola visita, para los tres que definen. La técnica queda como está.',
                outcomes: [
                    { weight: 100, effect: { attrs: { pegada: 1, liderazgo: 1, vision: 1 } }, resultText: 'Te dio una rutina de once segundos y la orden de no mirar nunca a la tribuna. Los últimos cinco minutos dejaron de existir.' },
                ],
            },
            {
                id: 'quedarte-pateando-solo',
                label: 'Quedarte pateando solo',
                hint: 'Cien pelotas por semana, gratis y en tu cancha. Nadie te corrige nada.',
                outcomes: [
                    { weight: 60, effect: { attrs: { pegada: 2 }, belonging: 3 }, resultText: 'Cien pelotas los miércoles con el utilero juntándolas. Lo que no te arregló el tipo te lo arregló la repetición.' },
                    { weight: 40, effect: { attrs: { pegada: 1 }, belonging: 2 }, resultText: 'Cien pelotas por semana repitiendo el mismo error. Se te hizo costumbre antes de que alguien te lo dijera.' },
                ],
            },
        ],
    },

    {
        id: 'of-apertura-la-ultima-patada',
        category: 'club',
        title: 'Penal desde la derecha, no queda tiempo',
        text: 'Penal a cuarenta metros contra el viento, desde la derecha. Están dos abajo y el referee ya avisó que es la última.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['apertura'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'patear-a-los-palos',
                label: 'A los palos',
                hint: 'Tres puntos y lo dan vuelta. Cuarenta metros contra el viento son cuarenta metros contra el viento.',
                outcomes: [
                    { weight: 45, effect: { attrs: { pegada: 2, liderazgo: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'La pusiste tres metros adentro del palo izquierdo. No la miraste: te diste vuelta cuando todavía estaba subiendo.' },
                    { weight: 55, effect: { attrs: { pegada: 1 }, playingTime: -1, belonging: -2 }, resultText: 'Le pegaste bien y el viento la abrió sobre el final. Pegó en el palo y picó para afuera.' },
                ],
            },
            {
                id: 'al-lateral',
                label: 'Al lateral y line-out',
                hint: 'Le das el partido al pack, que viene ganando el line-out todo el día. Vos no decidís más nada.',
                outcomes: [
                    { weight: 55, effect: { attrs: { vision: 1, liderazgo: 2 }, playingTime: 1, statBoost: 2, belonging: 4 }, resultText: 'La clavaste a dos metros de la bandera. Ganaron el line-out, armaron el maul y entraron sin que vos tocaras la pelota.' },
                    { weight: 45, effect: { attrs: { liderazgo: 1 }, belonging: -1 }, resultText: 'La clavaste donde querías y el line-out se les cayó por primera vez en toda la tarde. Así se terminó.' },
                ],
            },
            {
                id: 'jugarlo-rapido',
                label: 'Jugarlo rápido',
                hint: 'Están todos caminando para atrás. Si sale mal no hay line-out ni patada.',
                outcomes: [
                    { weight: 40, effect: { attrs: { vision: 2, pegada: 1 }, playingTime: 1, statBoost: 2, belonging: 3 }, resultText: 'Lo tomaste antes de que se acomodaran y les entraste por un hueco de quince metros. La jugada más rápida del año.' },
                    { weight: 60, effect: { attrs: { vision: 1 }, playingTime: -1, belonging: -2 }, resultText: 'Lo tomaste rápido y el número siete estaba parado ahí. Turnover, y el partido terminó con la pelota de ellos.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  CENTRO — choque · quiebre · defensa · liderazgo
    //  La gloria son quiebres de línea, y metros post-contacto.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-centro-tu-canal',
        category: 'club',
        title: 'Te están jugando a vos',
        text: 'Es el cuarto partido seguido que atacan tu canal. No es casualidad: alguien vio algo en un video y lo pasó.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['centro'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'estudiar-el-video',
                label: 'Sentarte con el video',
                hint: 'Vas a encontrar qué es. Son cuatro noches y ya sabés que te van a doler.',
                outcomes: [
                    { weight: 75, effect: { attrs: { defensa: 2, liderazgo: 1 } }, resultText: 'Salías veinte centímetros antes que el trece y ahí se abría el hueco. Cuatro noches para encontrar veinte centímetros.' },
                    { weight: 25, effect: { attrs: { defensa: 1 } }, resultText: 'Miraste cuatro partidos y no encontraste nada raro. Lo que había era que el diez de ellos leía bien, y eso no se arregla mirando video.' },
                ],
            },
            {
                id: 'salir-a-buscarlos',
                label: 'Salir a buscarlos',
                hint: 'Que jugar tu canal les cueste caro. Un tackle que erres es un try.',
                outcomes: [
                    { weight: 50, effect: { attrs: { choque: 2, defensa: 1 }, statBoost: 2 }, resultText: 'Saliste a comerte al doce en las tres primeras y dejaron de venir. El resto del año atacaron para el otro lado.' },
                    { weight: 50, effect: { attrs: { choque: 1 }, body: 10, playingTime: -1 }, resultText: 'Saliste dos veces y las dos te pasaron por adentro. La tercera te quedaste, y ya era tarde.' },
                ],
            },
            {
                id: 'hablarlo-con-el-trece',
                label: 'Acomodarlo con el trece',
                hint: 'Se arregla entre los dos. Hay que resignar el intervalo de afuera.',
                outcomes: [
                    { weight: 100, effect: { attrs: { defensa: 1, liderazgo: 2 }, belonging: 3 }, resultText: 'Se juntaron media hora antes de cada entrenamiento durante un mes. Dejaron de atacar el canal cuando dejó de existir.' },
                ],
            },
        ],
    },

    {
        id: 'of-centro-el-intervalo',
        category: 'club',
        title: 'El intervalo',
        text: 'Se abrió. El doce de ellos salió tarde y hay tres metros de aire entre el diez y el trece. Falta un minuto y están cuatro abajo.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['centro'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'meterse-en-el-hueco',
                label: 'Meterte en el hueco',
                hint: 'Son cuarenta metros de campo abierto. Si el fullback llega, no hay apoyo detrás tuyo.',
                outcomes: [
                    { weight: 55, effect: { attrs: { quiebre: 2, choque: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Entraste al hueco a toda velocidad, le pusiste el hombro al fullback y caíste con la pelota abajo del cuerpo. Cuarenta metros que en el club todavía se cuentan.' },
                    { weight: 45, effect: { attrs: { quiebre: 1 }, body: 8, belonging: -1 }, resultText: 'Entraste y el fullback te llegó a los quince metros. No había nadie atrás tuyo para el pase.' },
                ],
            },
            {
                id: 'fijar-y-pasar',
                label: 'Fijar al trece y pasarla',
                hint: 'El wing entra solo si el pase llega. Perdés vos la jugada.',
                outcomes: [
                    { weight: 65, effect: { attrs: { quiebre: 1, liderazgo: 2 }, playingTime: 1, statBoost: 2, belonging: 4 }, resultText: 'Le clavaste los ojos al trece hasta que se comió el amague y la soltaste a la altura del pecho. El wing entró sin que lo tocaran.' },
                    { weight: 35, effect: { attrs: { quiebre: 1 }, belonging: -1 }, resultText: 'El trece no se comió nada y leyó el pase. La cortó en el aire y se fue de contra.' },
                ],
            },
            {
                id: 'ir-al-contacto',
                label: 'Ir al contacto y armar',
                hint: 'Se asegura la posesión y quedan cinco fases más. Se cierra el hueco que se abrió solo.',
                outcomes: [
                    { weight: 100, effect: { attrs: { choque: 2, liderazgo: 1 }, playingTime: 1, statBoost: 2, belonging: 2 }, resultText: 'Elegiste el contacto, ganaste ocho metros post-contacto y la pelota salió limpia. Entraron cuatro fases más tarde por el otro lado.' },
                ],
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  WING Y FULLBACK — velocidad · gambeta · juego aéreo · liderazgo
    //  La gloria son los tries, y los metros ganados.
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'of-wing-los-cien-metros',
        category: 'club',
        title: 'El entrenador de atletismo',
        text: 'Un entrenador de atletismo del club de al lado te vio correr y te dijo que corrés mal. Te ofrece tres meses de pista, martes y jueves, en el horario del rugby.',
        weight: 10,
        rarity: 'raro',
        repeatable: false,
        requires: { families: ['wing-fullback'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'tres-meses-de-pista',
                label: 'Tres meses de pista',
                hint: 'Vas a correr más rápido. No vas a tocar una pelota en todo el verano.',
                outcomes: [
                    { weight: 70, effect: { attrs: { velocidad: 3 }, playingTime: -1 }, resultText: 'Te cambió el braceo y la salida de los primeros diez metros. En marzo no te alcanzaba nadie, y te faltaban dos meses de pelota.' },
                    { weight: 30, effect: { attrs: { velocidad: 1, aguante: 1 }, playingTime: -1, body: 8 }, resultText: 'Tres meses de pista y un isquiotibial en la última semana. Llegaste al torneo corriendo igual que antes y con miedo.' },
                ],
            },
            {
                id: 'los-martes-nada-mas',
                label: 'Solo los martes',
                hint: 'Media pista y medio rugby. No te va a arreglar la técnica entera.',
                outcomes: [
                    { weight: 100, effect: { attrs: { velocidad: 1, gambeta: 1 } }, resultText: 'Fuiste doce martes y aprendiste a frenar y volver a arrancar. No sos más rápido: cambiás de dirección sin perder nada.' },
                ],
            },
            {
                id: 'el-juego-aereo',
                label: 'Pedirle el salto',
                hint: 'La pelota alta es lo que te cuesta. La velocidad se queda como está.',
                outcomes: [
                    { weight: 100, effect: { attrs: { juegoAereo: 2, velocidad: 1 } }, resultText: 'Te enseñó a llegar con la pierna de adelante y a subir la rodilla. Dejaste de mirar hacia arriba con miedo.' },
                ],
            },
        ],
    },

    {
        id: 'of-wing-la-corrida',
        category: 'club',
        title: 'La agarraste en tu ingoal',
        text: 'Te tiraron un kick largo y la levantaste dentro de tu propio ingoal. Adelante hay ochenta metros y trece tipos parados esperando el envío de vuelta.',
        weight: 10,
        rarity: 'oro',
        repeatable: false,
        requires: { families: ['wing-fullback'], needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'salir-corriendo',
                label: 'Salir corriendo',
                hint: 'Están todos adelantados por el kick. Si te agarran adentro del veintidós, es try de ellos.',
                outcomes: [
                    { weight: 45, effect: { attrs: { velocidad: 2, gambeta: 1 }, playingTime: 2, statBoost: 3, belonging: 6, fame: 5 }, resultText: 'Saliste por el medio, quebraste al primero y después ya no te agarró nadie. Ochenta metros sin un pase, y el club entero de pie antes de que llegaras a la mitad.' },
                    { weight: 55, effect: { attrs: { velocidad: 1 }, playingTime: -1, belonging: -2 }, resultText: 'Te agarraron a los quince metros y salió el ruck para el lado de ellos. Dos fases después estaban apoyando.' },
                ],
            },
            {
                id: 'buscar-el-apoyo',
                label: 'Correr y buscar el apoyo',
                hint: 'Veinte metros y la soltás. La corrida entera queda para otro.',
                outcomes: [
                    { weight: 70, effect: { attrs: { velocidad: 1, gambeta: 1, liderazgo: 1 }, playingTime: 1, statBoost: 2, belonging: 4 }, resultText: 'Corriste hasta que apareció el fullback por adentro y se la dejaste con las dos manos. Terminó apoyando él y te fue a buscar al medio de la cancha.' },
                    { weight: 30, effect: { attrs: { velocidad: 1 }, belonging: -1 }, resultText: 'Corriste veinte metros y no llegó nadie. La tuviste que soltar mal y se perdió adelante.' },
                ],
            },
            {
                id: 'devolverla',
                label: 'Devolverla larga',
                hint: 'Se sale del veintidós y se juega desde el line-out. Es la pelota que estaban esperando.',
                outcomes: [
                    { weight: 100, effect: { attrs: { juegoAereo: 2, liderazgo: 1 }, playingTime: 1, belonging: 2 }, resultText: 'La pusiste cuarenta metros arriba y afuera. Nadie se acuerda de esa patada, y era la jugada correcta.' },
                ],
            },
        ],
    },
];
