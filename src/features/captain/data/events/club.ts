// EL CAPITÁN — eventos de club. Prefijo `club-`.
//
// Los que solo pueden pasar en un club argentino. No hay plata acá: hay tiempo,
// cuota social, micro y tercer tiempo.

import type { CaptainEvent } from '../../types/event.ts';

export const CLUB_EVENTS: CaptainEvent[] = [
    {
        id: 'club-lunes-a-la-manana',
        category: 'club',
        title: 'El lunes a la mañana',
        text: 'Te pegaste el sábado y el lunes entrás a laburar a las ocho. Te levantás y no te responde el hombro.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        requires: { stage: ['amateur'], needsClub: true },
        options: [
            {
                id: 'ir-roto',
                label: 'Ir roto',
                hint: 'No perdés el día. Lo vas a arrastrar toda la semana.',
                outcomes: [
                    { weight: 65, effect: { body: 6, attrs: { aguante: 1 } }, resultText: 'Aguantaste el turno completo. El martes entrenaste a media máquina y el jueves ya estabas.' },
                    { weight: 35, effect: { body: 12, playingTime: -1 }, resultText: 'Empeoró. El sábado jugaste veinte minutos y te sacaron.' },
                ],
            },
            {
                id: 'pedir-el-dia',
                label: 'Pedir el día',
                hint: 'Descansás. Te lo descuentan y el encargado toma nota.',
                outcomes: [
                    { weight: 70, effect: { body: -4 }, resultText: 'Dormiste hasta el mediodía y el sábado llegaste entero.' },
                    { weight: 30, effect: { body: -4, flags: { 'roce-laboral': 1 } }, resultText: 'Descansaste, pero el encargado te lo hizo notar delante de todos.' },
                ],
            },
        ],
    },

    {
        id: 'club-cuota-social',
        category: 'club',
        title: 'La cuota social',
        text: 'Estás atrasado tres meses. El reglamento es claro: sin la cuota al día no hay ficha ni pase.',
        weight: 6,
        repeatable: true,
        cooldown: 6,
        requires: { stage: ['amateur'], needsClub: true },
        options: [
            {
                id: 'pagarla',
                label: 'Ponerte al día',
                hint: 'Quedás en regla. Es plata que no tenés.',
                outcomes: [
                    { weight: 100, effect: { belonging: 1 }, resultText: 'Pagaste las tres cuotas de una. En la secretaría te lo agradecieron sin decirlo.' },
                ],
            },
            {
                id: 'hablar-con-el-tesorero',
                label: 'Hablar con el tesorero',
                hint: 'Podés arreglarlo de palabra. También podés quedar como el que pide.',
                outcomes: [
                    { weight: 60, effect: { belonging: 2 }, resultText: 'El tesorero te dijo que lo arreglás cuando puedas. En el club sos de la casa.' },
                    { weight: 40, effect: { belonging: -2 }, resultText: 'Te lo arreglaron, pero quedó dicho en la comisión. No es lo mismo que antes.' },
                ],
            },
        ],
    },

    {
        id: 'club-tercer-tiempo',
        category: 'club',
        title: 'El tercer tiempo',
        text: 'El plantel se queda al asado. Vos tenés parcial el lunes y no abriste la carpeta.',
        weight: 9,
        repeatable: true,
        cooldown: 2,
        requires: { stage: ['amateur'], needsClub: true, maxAge: 26 },
        options: [
            {
                id: 'quedarte',
                label: 'Quedarte',
                hint: 'Sos del grupo. El lunes vas a estudiar con la cabeza en otro lado.',
                outcomes: [
                    { weight: 100, effect: { belonging: 2, attrs: { liderazgo: 1 } }, resultText: 'Te quedaste hasta que apagaron las luces. Los de M19 se te sentaron al lado a escuchar.' },
                ],
            },
            {
                id: 'irte-a-estudiar',
                label: 'Irte a estudiar',
                hint: 'Aprobás. Te vas mientras prenden el fuego.',
                outcomes: [
                    { weight: 70, effect: { attrs: { vision: 1 } }, resultText: 'Aprobaste con lo justo. En el club nadie te dijo nada, que es peor que si te dijeran.' },
                    { weight: 30, effect: { belonging: -1 }, resultText: 'Aprobaste. El sábado siguiente el asado se armó sin avisarte.' },
                ],
            },
        ],
    },

    {
        id: 'club-dirigir-m14',
        category: 'club',
        title: 'Los sábados a la mañana',
        text: 'El club te pide que dirijas a la M14. Son treinta pibes, dos horas, todos los sábados antes de tu partido.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        requires: { stage: ['amateur'], needsClub: true, minSeasons: 2 },
        options: [
            {
                id: 'aceptar',
                label: 'Aceptar',
                hint: 'El club entero se entera. Llegás cansado a tu propio partido.',
                outcomes: [
                    { weight: 100, effect: { belonging: 4, attrs: { liderazgo: 2 }, playingTime: -1 }, resultText: 'Dirigiste todo el año. Ahora treinta pibes te saludan por el nombre y una madre te trae tortas fritas.' },
                ],
            },
            {
                id: 'no-puedo',
                label: 'Decir que no',
                hint: 'Llegás entero al sábado. Alguien lo va a tener que hacer igual.',
                outcomes: [
                    { weight: 100, effect: { playingTime: 1 }, resultText: 'Dijiste que no podías. Lo agarró un veterano que hace quince años que está en el club.' },
                ],
            },
        ],
    },

    {
        id: 'club-viaje-al-interior',
        category: 'club',
        title: 'Dieciocho horas de micro',
        text: 'El club viaja a Tucumán por el Torneo del Interior. Sale el viernes a las seis de la mañana y tu jefe no te da el día.',
        weight: 7,
        repeatable: true,
        cooldown: 4,
        requires: { stage: ['amateur'], needsClub: true },
        options: [
            {
                id: 'faltar-al-trabajo',
                label: 'Faltar al trabajo',
                hint: 'Viajás con el plantel. Del otro lado hay un jefe contando.',
                outcomes: [
                    { weight: 55, effect: { belonging: 3, playingTime: 1 }, resultText: 'Viajaste, jugaste los ochenta y volvieron el domingo a la noche. El lunes nadie dijo nada.' },
                    { weight: 45, effect: { belonging: 3, playingTime: 1, flags: { 'roce-laboral': 1 } }, resultText: 'Viajaste y jugaste. El lunes te descontaron el día y te lo dijeron delante de todos.' },
                ],
            },
            {
                id: 'quedarte',
                label: 'Quedarte',
                hint: 'El laburo tranquilo. El equipo viaja sin vos.',
                outcomes: [
                    { weight: 100, effect: { belonging: -2, playingTime: -1 }, resultText: 'Te quedaste. Volvieron con la clasificación y con una foto en el vestuario donde no estás.' },
                ],
            },
        ],
    },

    {
        id: 'club-clasico',
        category: 'club',
        title: 'El clásico',
        text: 'Se juega el clásico. Hay tres mil personas alrededor de la cancha y el club cerró la cantina temprano para que no falte nadie.',
        weight: 10,
        repeatable: true,
        cooldown: 2,
        requires: { needsClub: true },
        options: [
            {
                id: 'jugarlo-a-muerte',
                label: 'Ir a buscarlo',
                hint: 'Es el partido del año. Se juega al límite y el límite se paga.',
                outcomes: [
                    { weight: 45, effect: { belonging: 5, fame: 2, attrs: { choque: 1 } }, resultText: 'Lo ganaron sobre la hora y te sacaron en andas. Todavía te lo recuerdan en el buffet.' },
                    { weight: 35, effect: { belonging: 2, body: 8 }, resultText: 'Lo ganaron y saliste con la ceja abierta y la rodilla hinchada. Valió la pena.' },
                    { weight: 20, effect: { belonging: -1, body: 10 }, resultText: 'Lo perdieron en los últimos diez. El vestuario quedó en silencio media hora.' },
                ],
            },
            {
                id: 'jugarlo-con-cabeza',
                label: 'Jugarlo con cabeza',
                hint: 'Salís entero. En un clásico eso se nota desde afuera.',
                outcomes: [
                    { weight: 60, effect: { belonging: 1, attrs: { vision: 1 } }, resultText: 'Jugaste ordenado, sin una macana. Lo ganaron y nadie habló de vos.' },
                    { weight: 40, effect: { belonging: -2 }, resultText: 'Lo perdieron. Un veterano te dijo en el vestuario que en el clásico no se especula.' },
                ],
            },
        ],
    },

    {
        id: 'club-bautismo',
        category: 'club',
        title: 'El bautismo',
        text: 'Los veteranos quieren bautizar a los que suben de M19. Siempre se hizo así. Vos ahora sos el referente y te miran a vos.',
        weight: 6,
        rarity: 'especial',
        repeatable: false,
        requires: { stage: ['amateur'], needsClub: true, minBelonging: 35 },
        options: [
            {
                id: 'frenarlo',
                label: 'Frenarlo',
                hint: 'Los pibes te lo van a agradecer. Los veteranos, no.',
                outcomes: [
                    { weight: 70, effect: { belonging: 1, attrs: { liderazgo: 3 } }, resultText: 'Dijiste que no se hacía más y no se hizo más. Dos veteranos estuvieron un mes sin hablarte.' },
                    { weight: 30, effect: { belonging: -3, attrs: { liderazgo: 2 } }, resultText: 'Lo frenaste. El vestuario se partió en dos y tardó media temporada en pegarse.' },
                ],
            },
            {
                id: 'cambiarlo',
                label: 'Cambiarlo por otra cosa',
                hint: 'La tradición sigue sin la parte fea. Cuesta más trabajo que prohibirlo.',
                outcomes: [
                    { weight: 100, effect: { belonging: 3, attrs: { liderazgo: 2 } }, resultText: 'Los hiciste cocinar para todo el club y servir las mesas. Quedó como tradición nueva.' },
                ],
            },
            {
                id: 'dejar-que-pase',
                label: 'Dejar que pase',
                hint: 'No te metés. Después no te podés desentender.',
                outcomes: [
                    { weight: 55, effect: { belonging: 1 }, resultText: 'Se hizo como siempre. Los pibes se rieron y al lunes ya estaba olvidado.' },
                    { weight: 45, effect: { belonging: -4, fame: -2 }, resultText: 'Se les fue la mano con uno de M19. El padre llamó al club y hubo reunión de comisión.' },
                ],
            },
        ],
    },

    {
        id: 'club-la-cinta',
        category: 'club',
        title: 'La cinta',
        text: 'El entrenador te llama aparte. Quiere que seas el capitán: sos el que le va a hablar al referee y el que va a bancar al plantel cuando se venga la noche.',
        weight: 9,
        // La tarjeta que le da el nombre al juego. Entra en `especial` y no en
        // `raro` por lo que ya la gateaba: pide Pertenencia 45 y tres
        // temporadas, así que al que llega hasta acá le corresponde, y una
        // banda más escasa la volvería inalcanzable justo para el que se la ganó.
        rarity: 'especial',
        repeatable: false,
        requires: { needsClub: true, minBelonging: 45, minSeasons: 3 },
        options: [
            {
                id: 'agarrarla',
                label: 'Agarrarla',
                hint: 'Sos la voz del equipo. También sos el que da la cara cuando se pierde.',
                outcomes: [
                    { weight: 75, effect: { belonging: 6, fame: 3, attrs: { liderazgo: 3 }, flags: { capitan: 1 } }, resultText: 'Sos el capitán. Le hablás al referee, arengás en el círculo y ahora el club te mira distinto.' },
                    { weight: 25, effect: { belonging: 3, attrs: { liderazgo: 2 }, flags: { capitan: 1 }, playingTime: -1 }, resultText: 'Agarraste la cinta y te pesó. Tardaste media temporada en volver a jugar como antes.' },
                ],
            },
            {
                id: 'que-la-agarre-otro',
                label: 'Que la agarre otro',
                hint: 'Jugás liviano. La cinta no se ofrece dos veces.',
                outcomes: [
                    { weight: 100, effect: { playingTime: 1, attrs: { liderazgo: -1 } }, resultText: 'Dijiste que todavía no. Se la dieron al segunda línea y jugó la temporada de su vida.' },
                ],
            },
        ],
    },

    {
        id: 'club-la-cancha-2',
        category: 'club',
        title: 'Las luces de la cancha 2',
        text: 'El club quiere poner luces en la cancha 2 para que los infantiles entrenen de noche. Falta la mitad de la plata.',
        weight: 5,
        repeatable: true,
        cooldown: 8,
        requires: { needsClub: true, minSeasons: 4 },
        options: [
            {
                id: 'poner-la-cara',
                label: 'Poner la cara',
                hint: 'Salís a golpear puertas con la comisión. Es tiempo que no entrenás.',
                outcomes: [
                    { weight: 80, effect: { belonging: 5, playingTime: -1 }, resultText: 'Conseguiste tres sponsors chicos y las luces se prendieron en agosto. Hay una placa con los nombres.' },
                    { weight: 20, effect: { belonging: 2, playingTime: -1 }, resultText: 'No alcanzó y quedó para el año que viene. En el club valoraron igual que lo hayas intentado.' },
                ],
            },
            {
                id: 'dejarlo-a-la-comision',
                label: 'Dejarlo a la comisión',
                hint: 'Vos entrenás. Para eso está la comisión.',
                outcomes: [
                    { weight: 100, effect: {}, resultText: 'Lo resolvió la comisión sin vos. Las luces se prendieron igual.' },
                ],
            },
        ],
    },

    // ── 0.40.0 · LO QUE LE PASA AL CLUB, Y LO QUE PASA CUANDO SOS EL CAPITÁN ──
    // Tres tarjetas que faltaban en un juego de carrera de rugby: el club que se
    // cae, el entrenador que llega con otra idea y el vestuario que el capitán
    // tiene que sostener. La tercera es la primera que LEE una decisión vieja:
    // sólo aparece si agarraste la cinta, que hasta acá no tenía consecuencia.
    {
        id: 'club-la-crisis',
        category: 'club',
        title: 'El club se viene abajo',
        text: 'Se cayó el sponsor principal, se fueron tres titulares y la primera arranca la pretemporada con lo justo. En la reunión de plantel todos te miran.',
        weight: 6,
        repeatable: true,
        cooldown: 8,
        requires: { needsClub: true, minSeasons: 3, minAge: 19 },
        options: [
            {
                id: 'bancar-al-club',
                label: 'Bancar al club',
                hint: 'Te quedás a ponerle el pecho. Con menos plantel, jugás más y te rompés más.',
                outcomes: [
                    { weight: 70, effect: { belonging: 7, playingTime: 1, body: 6, attrs: { liderazgo: 1 } }, resultText: 'Jugaste todo y el club no descendió. En la cena de fin de año te aplaudieron de pie.' },
                    { weight: 30, effect: { belonging: 5, body: 10, fame: -1 }, resultText: 'Pusiste todo y no alcanzó: fue un año para olvidar. En el club no se olvidan de quién se quedó.' },
                ],
            },
            {
                id: 'pedir-el-pase',
                label: 'Pedir el pase',
                hint: 'Tu carrera primero. En el club lo van a leer como lo que es.',
                outcomes: [
                    { weight: 60, effect: { belonging: -8, fame: 2 }, resultText: 'Lo dijiste en voz alta y se supo. Te llamaron de dos clubes, y en el tuyo te dejaron de saludar.' },
                    { weight: 40, effect: { belonging: -6, playingTime: -1 }, resultText: 'Pediste el pase y nadie vino a buscarte. Volviste al plantel con menos cartel que antes.' },
                ],
            },
        ],
    },

    {
        id: 'club-el-nuevo-entrenador',
        category: 'club',
        title: 'Entrenador nuevo',
        text: 'Llega un entrenador nuevo con otra idea de juego. En la primera práctica te pone con los suplentes y te dice que tu lugar se gana de nuevo.',
        weight: 7,
        repeatable: true,
        cooldown: 6,
        requires: { needsClub: true, minAge: 19, minSeasons: 2 },
        options: [
            {
                id: 'adaptarte',
                label: 'Adaptarte a su idea',
                hint: 'Aprendés lo que te pide. Mientras tanto, otro juega en tu lugar.',
                outcomes: [
                    { weight: 70, effect: { attrs: { vision: 2 }, playingTime: -1 }, resultText: 'Te costó medio año, pero ahora entendés el juego de otra manera. Terminaste la temporada de titular.' },
                    { weight: 30, effect: { attrs: { vision: 1 }, playingTime: -2 }, resultText: 'Hiciste todo lo que pidió y no te eligió igual. Hay entrenadores que ya traen su quince.' },
                ],
            },
            {
                id: 'defender-tu-juego',
                label: 'Defender tu juego',
                hint: 'Le demostrás en la cancha que se equivoca. Si no sale, se termina la discusión.',
                outcomes: [
                    { weight: 50, effect: { playingTime: 1, fame: 2 }, resultText: 'En el tercer partido entraste a los veinte y lo diste vuelta. El lunes eras titular otra vez.' },
                    { weight: 50, effect: { playingTime: -2, belonging: -2 }, resultText: 'Chocaron en el primer video y no se volvieron a hablar. Jugaste en intermedia casi todo el año.' },
                ],
            },
        ],
    },

    {
        id: 'club-el-vestuario',
        category: 'club',
        title: 'El vestuario',
        text: 'Después de una derrota fea, dos de los grandes del plantel se van a las manos en el vestuario. Sos el capitán: todos esperan que hagas algo.',
        weight: 8,
        rarity: 'especial',
        repeatable: true,
        cooldown: 6,
        requires: { needsClub: true, flags: ['capitan'] },
        options: [
            {
                id: 'cerrar-la-puerta',
                label: 'Cerrar la puerta y hablar',
                hint: 'Lo arreglás adentro, sin la comisión. Si sale mal, queda en tu cuenta.',
                outcomes: [
                    { weight: 70, effect: { belonging: 5, attrs: { liderazgo: 2 } }, resultText: 'Hablaste media hora con la puerta cerrada. Salieron abrazados y el sábado ganaron el clásico.' },
                    { weight: 30, effect: { belonging: -2, attrs: { liderazgo: 1 }, playingTime: -1 }, resultText: 'No alcanzó con hablar. Uno de los dos se fue del club y el plantel quedó partido.' },
                ],
            },
            {
                id: 'que-decida-la-comision',
                label: 'Que decida la comisión',
                hint: 'No te ensuciás. El plantel nota que el capitán no se metió.',
                outcomes: [
                    { weight: 100, effect: { belonging: -3, attrs: { liderazgo: -1 } }, resultText: 'La comisión suspendió a los dos. En el vestuario alguien dijo que para eso no hacía falta un capitán.' },
                ],
            },
        ],
    },
];
