import type { GameEvent } from '../../types/event.ts';

// Requiere estar en el radar de la selección (OVR alto). Corren en paralelo al club.
export const NATIONAL_TEAM_EVENTS: GameEvent[] = [
    {
        id: 'nt-first-callup-nerves',
        category: 'national-team',
        title: 'Primera concentración',
        text: 'Te citan por primera vez a la selección mayor. El vestuario impone respeto.',
        weight: 14,
        repeatable: false,
        minOvr: 66,
        condition: (ctx) => ctx.state.player.nationalTeam === null,
        options: [
            {
                id: 'humble',
                label: 'Entrar de perfil bajo',
                hint: 'Te ganás al grupo de a poco.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, morale: 4, capBoost: 1 }, resultText: 'Escuchás, trabajás y te hacés un lugar sin ruido.' },
                ],
            },
            {
                id: 'bold',
                label: 'Mostrarte desde el arranque',
                hint: 'Arriesgás, pero podés acelerar.',
                outcomes: [
                    { weight: 0.55, effect: { fame: 6, capBoost: 2, morale: 3 }, resultText: 'Te animás y dejás una imagen fuerte en el cuerpo técnico.' },
                    { weight: 0.45, effect: { morale: -3 }, resultText: 'Quisiste destacarte de más y no cayó del todo bien.' },
                ],
            },
        ],
    },
    {
        id: 'nt-eligibility-switch',
        category: 'national-team',
        title: 'Otra bandera te llama',
        text: 'Por tu ascendencia, otra selección más poderosa te tantea. Es una decisión de vida.',
        weight: 7,
        repeatable: false,
        minOvr: 70,
        maxAge: 27,
        options: [
            {
                id: 'switch',
                label: 'Cambiar de selección',
                hint: 'Más vidriera, menos raíces.',
                outcomes: [
                    { weight: 1, effect: { fame: 12, capBoost: 2, flags: { cambio_bandera: 1 }, morale: -4 }, resultText: 'Cambiás de camiseta internacional. Más foco, sensaciones encontradas.' },
                ],
            },
            {
                id: 'stay',
                label: 'Quedarte con la tuya',
                hint: 'Identidad por sobre todo.',
                outcomes: [
                    { weight: 1, effect: { morale: 8, mental: 2, flags: { identidad: 1 } }, resultText: 'Elegís tu bandera de siempre. El país te lo reconoce.' },
                ],
            },
        ],
    },
    {
        id: 'nt-captaincy',
        category: 'national-team',
        title: 'Capitán de tu país',
        text: 'El head coach te ofrece la capitanía de la selección. Es lo más alto.',
        weight: 8,
        repeatable: false,
        minOvr: 76,
        minAge: 27,
        condition: (ctx) => ctx.state.player.nationalTeam !== null,
        options: [
            {
                id: 'accept',
                label: 'Aceptar y liderar',
                hint: 'Leyenda en construcción.',
                outcomes: [
                    { weight: 1, effect: { mental: 5, vision: 3, fame: 14, flags: { capitan_nacional: 1 }, capBoost: 1 }, resultText: 'Te ponés la número de capitán del seleccionado. Historia pura.' },
                ],
            },
            {
                id: 'decline',
                label: 'Ceder el rol',
                hint: 'Preferís jugar sin la mochila.',
                outcomes: [
                    { weight: 1, effect: { morale: 2, technique: 1 }, resultText: 'Preferís aportar sin la cinta. El grupo te valora igual.' },
                ],
            },
        ],
    },
    {
        id: 'nt-tour-vs-rest',
        category: 'national-team',
        title: 'Gira de fin de año',
        text: 'Hay una gira larga con la selección justo cuando venís al límite físico.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        condition: (ctx) => ctx.state.player.nationalTeam !== null,
        options: [
            {
                id: 'go',
                label: 'Ir a la gira',
                hint: 'Más caps, más fatiga.',
                outcomes: [
                    { weight: 1, effect: { capBoost: 3, fame: 5, fatigue: 12, injuryRisk: 3 }, resultText: 'Te subís al avión. Sumás tests, pero terminás fundido.' },
                ],
            },
            {
                id: 'rest',
                label: 'Pedir descanso',
                hint: 'Cuidás el cuerpo, resignás caps.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -12, morale: -3 }, resultText: 'Te bajás para recuperar. El técnico lo entiende, a medias.' },
                ],
            },
        ],
    },
    {
        id: 'nt-bench-role',
        category: 'national-team',
        title: 'Suplente en la selección',
        text: 'En tu país hay un fenómeno en tu puesto. Te toca pelear desde el banco.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        condition: (ctx) => ctx.state.player.nationalTeam !== null,
        options: [
            {
                id: 'fight',
                label: 'Pelear el puesto',
                hint: 'Entrenás para desbancarlo.',
                outcomes: [
                    { weight: 0.5, effect: { technique: 3, mental: 2, capBoost: 1 }, resultText: 'Le hacés partido en cada práctica y te ganás minutos.' },
                    { weight: 0.5, effect: { morale: -4, mental: 1 }, resultText: 'El titular no afloja. Te toca esperar tu momento.' },
                ],
            },
            {
                id: 'accept-role',
                label: 'Aceptar el rol de impacto',
                hint: 'Especializarte como revulsivo.',
                outcomes: [
                    { weight: 1, effect: { stamina: 2, speed: 1, capBoost: 2, flags: { revulsivo: 1 } }, resultText: 'Te hacés experto en entrar y cambiar partidos.' },
                ],
            },
        ],
    },
    {
        id: 'nt-media-pressure',
        category: 'national-team',
        title: 'La presión del hincha',
        text: 'El país entero opina de vos antes de un test decisivo. Las redes arden.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        condition: (ctx) => ctx.state.player.nationalTeam !== null,
        options: [
            {
                id: 'ignore',
                label: 'Aislarte del ruido',
                hint: 'Cabeza fría.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, morale: 2 }, resultText: 'Te desconectás de las redes y jugás liberado.' },
                ],
            },
            {
                id: 'feed',
                label: 'Usar la presión a favor',
                hint: 'Doble filo.',
                outcomes: [
                    { weight: 0.55, effect: { form: 6, fame: 5 }, resultText: 'La presión te enciende y respondés en la cancha.' },
                    { weight: 0.45, effect: { form: -5, morale: -4 }, resultText: 'El ruido te mete en la cabeza y no rendís.' },
                ],
            },
        ],
    },
    {
        id: 'nt-retire-international',
        category: 'national-team',
        title: 'Retiro de la selección',
        text: 'Ya sos veterano. Podés dar un paso al costado en la selección para cuidar tu club.',
        weight: 8,
        repeatable: false,
        minAge: 33,
        condition: (ctx) => ctx.state.player.nationalTeam !== null,
        options: [
            {
                id: 'retire-nt',
                label: 'Retirarte del seleccionado',
                hint: 'Alargás tu carrera de club.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -15, injuryRisk: -6, morale: 3, flags: { retiro_seleccion: 1 } }, resultText: 'Le decís adiós a la selección. Tu club gana un jugador más entero.' },
                ],
            },
            {
                id: 'keep',
                label: 'Seguir mientras el cuerpo aguante',
                hint: 'Más caps, más desgaste.',
                outcomes: [
                    { weight: 1, effect: { capBoost: 2, fatigue: 6, fame: 3 }, resultText: 'Seguís dando el presente con tu país hasta donde el cuerpo diga.' },
                ],
            },
        ],
    },
];
