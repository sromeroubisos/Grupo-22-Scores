import type { GameEvent } from '../../types/event.ts';

// Incluye los ÚNICOS cambios de posición del juego, gateados y excepcionales
// (tercera↔segunda, centro→wing), tal como pide el spec.
export const TACTICAL_EVENTS: GameEvent[] = [
    {
        id: 'tac-playstyle',
        category: 'tactical',
        title: 'Definí tu estilo',
        text: 'El entrenador te pide que te especialices en un perfil de juego.',
        weight: 15,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'physical',
                label: 'Perfil físico',
                hint: 'Potencia y tackle.',
                outcomes: [
                    { weight: 1, effect: { power: 3, tackle: 2 }, resultText: 'Te volvés un jugador de choque, difícil de frenar y de pasar.' },
                ],
            },
            {
                id: 'creative',
                label: 'Perfil creativo',
                hint: 'Visión y técnica.',
                outcomes: [
                    { weight: 1, effect: { vision: 3, technique: 2 }, resultText: 'Te transformás en un jugador de lectura, el que arma el juego.' },
                ],
            },
            {
                id: 'explosive',
                label: 'Perfil explosivo',
                hint: 'Velocidad y quiebre.',
                outcomes: [
                    { weight: 1, effect: { speed: 3, technique: 1 }, resultText: 'Apostás al uno contra uno y al cambio de ritmo.' },
                ],
            },
        ],
    },
    {
        id: 'tac-goal-kicking',
        category: 'tactical',
        title: 'Hacerte cargo de los palos',
        text: 'El equipo necesita un pateador. Podés dedicarle horas a la patada a los palos.',
        weight: 11,
        repeatable: false,
        positions: ['flyhalf', 'fullback', 'scrumhalf', 'centre'],
        options: [
            {
                id: 'take-kicks',
                label: 'Ser el pateador',
                hint: 'Sube patada; responsabilidad.',
                outcomes: [
                    { weight: 1, effect: { kick: 5, mental: 2, flags: { pateador: 1 } }, resultText: 'Te quedás con la responsabilidad de los palos. Horas y horas de práctica.' },
                ],
            },
            {
                id: 'leave-kicks',
                label: 'Dejárselo a otro',
                hint: 'Menos presión.',
                outcomes: [
                    { weight: 1, effect: { technique: 1 }, resultText: 'Preferís enfocarte en otras facetas del juego.' },
                ],
            },
        ],
    },
    {
        id: 'tac-defense-system',
        category: 'tactical',
        title: 'Líder de la defensa',
        text: 'El coach de defensa quiere que organices la línea. Es un rol de mucha lectura.',
        weight: 10,
        repeatable: false,
        minOvr: 64,
        options: [
            {
                id: 'organize',
                label: 'Organizar la defensa',
                hint: 'Tackle, visión y liderazgo.',
                outcomes: [
                    { weight: 1, effect: { tackle: 3, vision: 2, mental: 1 }, resultText: 'Te volvés la voz de la línea defensiva.' },
                ],
            },
            {
                id: 'attack-focus',
                label: 'Enfocarte en atacar',
                hint: 'Priorizás lo ofensivo.',
                outcomes: [
                    { weight: 1, effect: { speed: 2, technique: 1 }, resultText: 'Elegís poner tu energía en el ataque.' },
                ],
            },
        ],
    },
    {
        id: 'tac-set-piece',
        category: 'tactical',
        title: 'Especialista de formación fija',
        text: 'Podés volverte clave en scrum y line, el trabajo sucio que gana partidos.',
        weight: 10,
        repeatable: false,
        positions: ['prop', 'hooker', 'lock', 'backrow'],
        options: [
            {
                id: 'specialize',
                label: 'Dominar la formación fija',
                hint: 'Potencia, técnica y resistencia.',
                outcomes: [
                    { weight: 1, effect: { power: 2, technique: 2, stamina: 2, flags: { especialista_fija: 1 } }, resultText: 'Te hacés dueño del scrum y el line. Oro puro para el equipo.' },
                ],
            },
            {
                id: 'mobile',
                label: 'Ser un forward móvil',
                hint: 'Velocidad y juego abierto.',
                outcomes: [
                    { weight: 1, effect: { speed: 3, stamina: 1 }, resultText: 'Apostás a moverte por toda la cancha como un back más.' },
                ],
            },
        ],
    },
    {
        id: 'tac-switch-lock',
        category: 'tactical',
        title: 'Reconversión a segunda línea',
        text: 'El cuerpo técnico ve que tu físico rinde más en la segunda línea que en la tercera.',
        weight: 5,
        repeatable: false,
        minAge: 26,
        positions: ['backrow'],
        options: [
            {
                id: 'switch',
                label: 'Cambiar a segunda línea',
                hint: 'Cambio de posición excepcional.',
                outcomes: [
                    { weight: 1, effect: { changePosition: 'lock', power: 3, tackle: 2, flags: { reconvertido: 1 } }, resultText: 'Te reconvertís en segunda línea. Nueva vida, nuevo rol.' },
                ],
            },
            {
                id: 'stay',
                label: 'Seguir de tercera',
                hint: 'Fiel a tu puesto.',
                outcomes: [
                    { weight: 1, effect: { tackle: 2, stamina: 1 }, resultText: 'Te quedás en la tercera línea, donde te sentís cómodo.' },
                ],
            },
        ],
    },
    {
        id: 'tac-switch-wing',
        category: 'tactical',
        title: 'De centro a wing',
        text: 'Perdiste un poco de físico pero tu velocidad sigue intacta. El wing te espera.',
        weight: 5,
        repeatable: false,
        minAge: 29,
        positions: ['centre'],
        options: [
            {
                id: 'switch',
                label: 'Pasar a wing',
                hint: 'Cambio de posición excepcional.',
                outcomes: [
                    { weight: 1, effect: { changePosition: 'wing', speed: 3, flags: { reconvertido: 1 } }, resultText: 'Te corrés al wing. Menos choque, más espacios para tu velocidad.' },
                ],
            },
            {
                id: 'stay',
                label: 'Seguir de centro',
                hint: 'Aguantar el choque.',
                outcomes: [
                    { weight: 1, effect: { power: 2, tackle: 1 }, resultText: 'Te bancás el centro un tiempo más.' },
                ],
            },
        ],
    },
    {
        id: 'tac-leadership-group',
        category: 'tactical',
        title: 'Grupo de líderes',
        text: 'El equipo arma un grupo chico para tomar decisiones en cancha. Te quieren adentro.',
        weight: 9,
        repeatable: false,
        minAge: 27,
        minOvr: 66,
        options: [
            {
                id: 'join',
                label: 'Sumarte al grupo',
                hint: 'Visión y mental.',
                outcomes: [
                    { weight: 1, effect: { vision: 3, mental: 3, fame: 3 }, resultText: 'Entrás al comité de líderes. Tu palabra pesa en cancha.' },
                ],
            },
            {
                id: 'pass',
                label: 'Dejarlo pasar',
                hint: 'Jugar sin cargos.',
                outcomes: [
                    { weight: 1, effect: { technique: 2 }, resultText: 'Preferís liderar solo con el ejemplo.' },
                ],
            },
        ],
    },
];
