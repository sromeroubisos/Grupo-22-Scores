// EL CAPITÁN — eventos de la vía representativa. Prefijo `nt-`.
//
// La escalera que puede volverse profesional, y la que le pelea el tiempo al
// club. Acá vive el archirrival: el otro tipo que juega en tu puesto y con el
// que se reparten una sola camiseta.

import type { CaptainEvent } from '../../types/event.ts';

export const NATIONAL_EVENTS: CaptainEvent[] = [
    {
        id: 'nt-primera-convocatoria',
        category: 'seleccion',
        title: 'Te llaman de la unión',
        text: 'Te citaron al seleccionado de tu unión. Son tres semanas de concentración y el Seven de la República en Paraná al final.',
        weight: 9,
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

    {
        id: 'nt-cambiar-de-bandera',
        category: 'seleccion',
        title: 'La otra bandera',
        text: 'Una unión europea te ofrece nacionalizarte. Jugarías el Mundial el año que viene. La tuya te tiene en carpeta y nada más.',
        weight: 6,
        repeatable: false,
        requires: { tracks: ['a-xv', 'union', 'academia'], minAge: 22, minOvr: 68, needsUnion: true },
        options: [
            {
                id: 'aceptar',
                label: 'Cambiar de bandera',
                hint: 'Jugás un Mundial. No hay vuelta atrás: es para siempre.',
                outcomes: [
                    { weight: 100, effect: { fame: 8, money: 40000, flags: { 'cambio-de-bandera': 1 } }, resultText: 'Cantaste otro himno. En tu país lo entendieron a medias y en tu club no lo entendieron nada.' },
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
    },

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
