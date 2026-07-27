import type { GameEvent } from '../../types/event.ts';

// Hitos: escenas especiales, muchas gateadas por logros de la carrera.
export const MILESTONE_EVENTS: GameEvent[] = [
    {
        id: 'mil-pro-debut',
        category: 'milestone',
        title: 'Debut profesional',
        text: 'Te toca tu primer partido como profesional. El estadio parece más grande que nunca.',
        weight: 20,
        repeatable: false,
        maxAge: 22,
        options: [
            {
                id: 'seize',
                label: 'Comerte la cancha',
                hint: 'Si sale, arrancás lanzado.',
                outcomes: [
                    { weight: 0.6, effect: { morale: 8, form: 6, fame: 4 }, resultText: 'Debut soñado. Dejás una imagen que ilusiona a todos.' },
                    { weight: 0.4, effect: { morale: 2, mental: 2 }, resultText: 'Debut con nervios, pero sumás la experiencia que no se compra.' },
                ],
            },
            {
                id: 'calm',
                label: 'Jugar tranquilo',
                hint: 'Seguro, aprendés.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, technique: 1, morale: 4 }, resultText: 'Jugás sin apuro, ordenado. Buen primer paso.' },
                ],
            },
        ],
    },
    {
        id: 'mil-100-matches',
        category: 'milestone',
        title: '100 partidos en el club',
        text: 'Llegás a los 100 partidos con la camiseta. El club prepara un homenaje.',
        weight: 12,
        repeatable: false,
        minAge: 25,
        condition: (ctx) => ctx.state.player.seasonsPlayed >= 5,
        options: [
            {
                id: 'celebrate',
                label: 'Disfrutar el homenaje',
                hint: 'Moral y arraigo.',
                outcomes: [
                    { weight: 1, effect: { morale: 8, fame: 5, mental: 1, flags: { emblema: 1 } }, resultText: 'La gente te ovaciona. Ya sos parte de la historia del club.' },
                ],
            },
        ],
    },
    {
        id: 'mil-domestic-final',
        category: 'milestone',
        title: 'Final del torneo',
        text: 'Tu equipo llega a la final. Es la oportunidad de levantar el trofeo.',
        weight: 13,
        repeatable: true,
        cooldown: 2,
        minOvr: 62,
        options: [
            {
                id: 'step-up',
                label: 'Aparecer en la final',
                hint: 'Podés ser héroe o sufrir.',
                outcomes: [
                    { weight: 0.5, effect: { titleBoost: 0.35, fame: 8, morale: 6, form: 4 }, resultText: 'Jugás un partidazo en la final. Todo se inclina a tu favor.' },
                    { weight: 0.5, effect: { titleBoost: 0.1, morale: -3, mental: 2 }, resultText: 'La final se te hace cuesta arriba, pero dejás todo.' },
                ],
            },
            {
                id: 'team-play',
                label: 'Jugar para el equipo',
                hint: 'Aporte sólido y colectivo.',
                outcomes: [
                    { weight: 1, effect: { titleBoost: 0.22, tackle: 1, mental: 1 }, resultText: 'Hacés un partido inteligente al servicio del equipo.' },
                ],
            },
        ],
    },
    {
        id: 'mil-world-cup-callup',
        category: 'milestone',
        title: 'Convocatoria al Mundial',
        text: 'Entrás en la lista para el Mundial. Es el sueño de cualquier jugador.',
        weight: 16,
        repeatable: true,
        cooldown: 3,
        minOvr: 72,
        condition: (ctx) => ctx.state.player.nationalTeam !== null && ctx.state.player.age >= 22,
        options: [
            {
                id: 'go-star',
                label: 'Ir a ser protagonista',
                hint: 'Vidriera mundial.',
                outcomes: [
                    { weight: 0.5, effect: { fame: 18, capBoost: 4, morale: 8, form: 4, flags: { mundialista: 1 } }, resultText: 'Brillás en el Mundial. El mundo entero te conoce.' },
                    { weight: 0.5, effect: { fame: 10, capBoost: 3, morale: 4, flags: { mundialista: 1 } }, resultText: 'Vivís tu Mundial. Experiencia imborrable, con altibajos.' },
                ],
            },
            {
                id: 'go-humble',
                label: 'Aportar desde donde toque',
                hint: 'Rol de equipo.',
                outcomes: [
                    { weight: 1, effect: { fame: 8, capBoost: 2, mental: 3, morale: 5, flags: { mundialista: 1 } }, resultText: 'Sumás al grupo en el Mundial, dentro y fuera de la cancha.' },
                ],
            },
        ],
    },
    {
        id: 'mil-world-cup-final',
        category: 'milestone',
        title: 'Final del Mundial',
        text: 'Lo imposible: tu selección llega a la final del Mundial. 80 minutos para la eternidad.',
        weight: 10,
        repeatable: false,
        minOvr: 74,
        condition: (ctx) => (ctx.state.player.flags['mundialista'] ?? 0) > 0,
        options: [
            {
                id: 'immortal',
                label: 'Ir por la gloria eterna',
                hint: 'La escena más grande.',
                outcomes: [
                    { weight: 0.5, effect: { fame: 25, morale: 12, mental: 3, flags: { campeon_mundo: 1, leyenda: 1 } }, resultText: '¡Campeones del mundo! Tu nombre queda tallado para siempre.' },
                    { weight: 0.5, effect: { fame: 18, morale: -6, mental: 4, flags: { finalista_mundial: 1, leyenda: 1 } }, resultText: 'Subcampeones. La final duele, pero llegaste a lo más alto.' },
                ],
            },
        ],
    },
    {
        id: 'mil-record-tries',
        category: 'milestone',
        title: 'Récord de tries',
        text: 'Estás por romper un récord histórico de tries. La marca está al alcance.',
        weight: 9,
        repeatable: false,
        positions: ['wing', 'fullback', 'centre'],
        minOvr: 70,
        condition: (ctx) => ctx.state.player.seasonsPlayed >= 6,
        options: [
            {
                id: 'chase',
                label: 'Ir por el récord',
                hint: 'Foco total en apoyar.',
                outcomes: [
                    { weight: 1, effect: { speed: 2, technique: 2, fame: 10, flags: { goleador: 1 } }, resultText: 'Rompés el récord. Tu nombre queda en los libros.' },
                ],
            },
            {
                id: 'team-first',
                label: 'El equipo primero',
                hint: 'El récord llegará solo.',
                outcomes: [
                    { weight: 1, effect: { vision: 2, mental: 2, morale: 3 }, resultText: 'Priorizás al equipo; el récord puede esperar.' },
                ],
            },
        ],
    },
    {
        id: 'mil-testimonial',
        category: 'milestone',
        title: 'Partido homenaje',
        text: 'El club organiza tu partido despedida. Ídolos y amigos vuelven para jugarlo.',
        weight: 10,
        repeatable: false,
        minAge: 34,
        condition: (ctx) => ctx.state.player.seasonsPlayed >= 10,
        options: [
            {
                id: 'enjoy',
                label: 'Disfrutarlo a pleno',
                hint: 'Cierre emotivo.',
                outcomes: [
                    { weight: 1, effect: { morale: 12, fame: 8, flags: { leyenda_club: 1 } }, resultText: 'Un estadio lleno te despide entre lágrimas y aplausos.' },
                ],
            },
        ],
    },
    {
        id: 'mil-hall-of-fame',
        category: 'milestone',
        title: 'Salón de la fama',
        text: 'Te proponen para el salón de la fama del rugby. Reconocimiento a toda una vida.',
        weight: 8,
        repeatable: false,
        minAge: 33,
        minOvr: 72,
        condition: (ctx) => ctx.state.player.caps >= 30 || ctx.state.player.titles >= 3,
        options: [
            {
                id: 'accept',
                label: 'Aceptar con orgullo',
                hint: 'Legado sellado.',
                outcomes: [
                    { weight: 1, effect: { fame: 15, morale: 8, mental: 2, flags: { salon_fama: 1, leyenda: 1 } }, resultText: 'Entrás al salón de la fama. Tu carrera ya es leyenda.' },
                ],
            },
        ],
    },
];
