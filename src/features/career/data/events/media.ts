import type { GameEvent } from '../../types/event.ts';

export const MEDIA_EVENTS: GameEvent[] = [
    {
        id: 'med-sponsor',
        category: 'media',
        title: 'Contrato con una marca',
        text: 'Una marca deportiva te ofrece ser su cara. Plata y exposición, también compromisos.',
        weight: 11,
        repeatable: true,
        cooldown: 4,
        minOvr: 62,
        options: [
            {
                id: 'sign',
                label: 'Firmar el contrato',
                hint: 'Fama arriba, algo de distracción.',
                outcomes: [
                    { weight: 1, effect: { fame: 10, morale: 4, form: -1, flags: { imagen: 1 } }, resultText: 'Te volvés imagen de la marca. Tu cara está en todos lados.' },
                ],
            },
            {
                id: 'reject',
                label: 'Rechazar por foco',
                hint: 'Menos ruido, más cancha.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, form: 2 }, resultText: 'Preferís no comprometer tu agenda. Todo el foco al juego.' },
                ],
            },
        ],
    },
    {
        id: 'med-controversy',
        category: 'media',
        title: 'Polémica en redes',
        text: 'Un comentario tuyo se malinterpreta y explota en las redes. Tenés que manejarlo.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        minOvr: 60,
        options: [
            {
                id: 'apologize',
                label: 'Aclarar y pedir disculpas',
                hint: 'Bajás el fuego rápido.',
                outcomes: [
                    { weight: 1, effect: { fame: -2, morale: 2, mental: 1 }, resultText: 'Salís a aclarar con humildad. El tema se desinfla.' },
                ],
            },
            {
                id: 'double-down',
                label: 'Redoblar la apuesta',
                hint: 'Arriesgado: puede salir muy mal.',
                outcomes: [
                    { weight: 0.45, effect: { fame: 8, flags: { rebelde: 1 } }, resultText: 'Te plantás y una parte del público te banca fuerte.' },
                    { weight: 0.55, effect: { fame: -6, morale: -6 }, resultText: 'La cosa escala y te complica dentro y fuera de la cancha.' },
                ],
            },
        ],
    },
    {
        id: 'med-documentary',
        category: 'media',
        title: 'Documental sobre tu carrera',
        text: 'Una productora quiere seguirte de cerca toda una temporada.',
        weight: 8,
        repeatable: false,
        minOvr: 70,
        options: [
            {
                id: 'accept',
                label: 'Abrir las puertas',
                hint: 'Enorme exposición.',
                outcomes: [
                    { weight: 0.6, effect: { fame: 14, morale: 3 }, resultText: 'El documental te vuelve figura popular más allá del rugby.' },
                    { weight: 0.4, effect: { fame: 8, form: -3 }, resultText: 'Las cámaras te exponen y a veces incomodan el vestuario.' },
                ],
            },
            {
                id: 'decline',
                label: 'Cuidar tu intimidad',
                hint: 'Perfil bajo.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, morale: 2 }, resultText: 'Preferís mantener tu vida puertas adentro.' },
                ],
            },
        ],
    },
    {
        id: 'med-punditry',
        category: 'media',
        title: 'Columna en un medio',
        text: 'Un diario te ofrece escribir una columna semanal de análisis.',
        weight: 8,
        repeatable: false,
        minAge: 30,
        options: [
            {
                id: 'write',
                label: 'Escribir la columna',
                hint: 'Visión y fama; te expone a opinar.',
                outcomes: [
                    { weight: 1, effect: { vision: 2, fame: 6, flags: { comunicador: 1 } }, resultText: 'Tu mirada del juego suma seguidores y respeto.' },
                ],
            },
            {
                id: 'no',
                label: 'No opinar en público',
                hint: 'Evitás quilombos.',
                outcomes: [
                    { weight: 1, effect: { mental: 1 }, resultText: 'Preferís no dar munición a la polémica.' },
                ],
            },
        ],
    },
    {
        id: 'med-fan-club',
        category: 'media',
        title: 'La gente te adopta',
        text: 'Los hinchas arman una peña con tu nombre. El cariño popular crece.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        minOvr: 64,
        options: [
            {
                id: 'embrace',
                label: 'Abrazar a la gente',
                hint: 'Moral y fama.',
                outcomes: [
                    { weight: 1, effect: { morale: 6, fame: 6, flags: { idolo: 1 } }, resultText: 'Devolvés el cariño y te ganás a la tribuna para siempre.' },
                ],
            },
            {
                id: 'distant',
                label: 'Mantener distancia',
                hint: 'Preservás tu espacio.',
                outcomes: [
                    { weight: 1, effect: { mental: 1, fame: 1 }, resultText: 'Agradecés a la distancia; preferís tu intimidad.' },
                ],
            },
        ],
    },
    {
        id: 'med-transfer-rumor',
        category: 'media',
        title: 'Rumores de pase',
        text: 'La prensa te da como salido del club. El vestuario y los hinchas preguntan.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'deny',
                label: 'Bajar los rumores',
                hint: 'Tranquilizás el ambiente.',
                outcomes: [
                    { weight: 1, effect: { morale: 3, mental: 1, flags: { leal: 1 } }, resultText: 'Ponés paños fríos. El grupo agradece la claridad.' },
                ],
            },
            {
                id: 'fuel',
                label: 'Dejar la puerta abierta',
                hint: 'Presionás por una mejora.',
                outcomes: [
                    { weight: 0.5, effect: { fame: 5, morale: 2, flags: { ambicioso: 1 } }, resultText: 'No desmentís nada. El club se mueve para retenerte.' },
                    { weight: 0.5, effect: { morale: -4, form: -3 }, resultText: 'El ruido te desconcentra y enfría al vestuario.' },
                ],
            },
        ],
    },
    {
        id: 'med-charity',
        category: 'media',
        title: 'Causa solidaria',
        text: 'Te invitan a liderar una campaña solidaria de alto impacto.',
        weight: 8,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'lead',
                label: 'Ponerle la cara',
                hint: 'Imagen y moral.',
                outcomes: [
                    { weight: 1, effect: { fame: 5, morale: 5, mental: 1, flags: { compromiso: 1 } }, resultText: 'La campaña vuela y te muestra como un tipo de bien.' },
                ],
            },
            {
                id: 'support',
                label: 'Ayudar sin exponerte',
                hint: 'Aporte silencioso.',
                outcomes: [
                    { weight: 1, effect: { morale: 3 }, resultText: 'Ayudás desde atrás, sin cámaras.' },
                ],
            },
        ],
    },
];
