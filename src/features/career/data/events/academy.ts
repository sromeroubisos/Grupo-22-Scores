// ⚠ ESCRITO Y SIN CABLEAR (ver el informe de la sesión).
//
// La academia se implementó entera y se REVIRTIÓ el cableado: arrancar a los 16
// agrega dos temporadas de crecimiento y el jugador toca su techo dos años
// antes, con lo que se rompen tres invariantes medidos del motor —el 8% de las
// carreras se pasaba del techo y la meseta mediana saltaba de 3 a 5 temporadas—.
// Landearla exige recalibrar la curva de progresión (docs §11), no un retoque.
//
// Este archivo queda como punto de partida de esa pasada. No lo importa nadie.

import type { GameEvent } from '../../types/event.ts';

/**
 * LOS AÑOS DE ACADEMIA (16 y 17).
 *
 * Pool propio, y por eso existe: a los 16 no hay mercado de pases, no hay
 * contrato que renegociar y no hay selección mayor que te llame. Lo que hay es
 * formación, el colegio, el primer cuerpo que se rompe y un entrenador que te
 * mira y piensa que jugás en otro puesto.
 *
 * Todos llevan `maxAge: 17`, así que ninguno puede aparecer después del debut, y
 * ninguno mueve el escalafón de empleo: en la academia se es amateur y punto.
 */
export const ACADEMY_EVENTS: GameEvent[] = [
    {
        id: 'aca-school-vs-rugby',
        category: 'personal',
        title: 'El colegio y el club',
        text: 'Los entrenamientos de la academia caen justo sobre las tardes de estudio. En casa quieren que no dejes ninguna de las dos.',
        weight: 14,
        repeatable: true,
        cooldown: 1,
        maxAge: 17,
        options: [
            {
                id: 'rugby-first',
                label: 'Meterle al rugby',
                hint: 'Crecés más rápido en la cancha. El año escolar se va a hacer cuesta arriba.',
                outcomes: [
                    { weight: 3, effect: { power: 2, stamina: 2, technique: 1, morale: 4, mental: -1 }, resultText: 'Entrenás todo lo que podés. En el club lo notan; en casa, también.' },
                    { weight: 1, effect: { stamina: 2, technique: 1, fatigue: 8, morale: -2 }, resultText: 'Le metés a los dos frentes y llegás fundido a fin de año.' },
                ],
            },
            {
                id: 'school-first',
                label: 'Cumplir con el colegio',
                hint: 'Cabeza tranquila y familia contenta. Vas a llegar más crudo que tus compañeros.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, vision: 2, morale: 2, power: -1 }, resultText: 'Ordenás la semana alrededor del colegio. Al rugby llegás con menos horas y más cabeza.' },
                ],
            },
        ],
    },
    {
        id: 'aca-position-switch',
        category: 'tactical',
        title: 'El entrenador te ve en otro puesto',
        text: 'El técnico de la academia te para en un lugar que no es el tuyo. Dice que ahí vas a llegar más lejos.',
        weight: 9,
        repeatable: false,
        maxAge: 17,
        options: [
            {
                id: 'try-it',
                label: 'Probar en el puesto nuevo',
                hint: 'Aprendés un oficio distinto. Empezás de cero en algo que ya sabías hacer.',
                outcomes: [
                    { weight: 2, effect: { vision: 3, mental: 3, technique: 2, form: -4 }, resultText: 'Te adaptás rápido. Entender otro puesto te hace mejor jugador en cualquiera.' },
                    { weight: 1, effect: { mental: 2, morale: -4, form: -6 }, resultText: 'No termina de salir. Volvés a tu puesto con un par de meses perdidos y algo aprendido.' },
                ],
            },
            {
                id: 'stay',
                label: 'Quedarte donde estás',
                hint: 'Seguís puliendo lo tuyo. El técnico va a poner a otro en esa camiseta.',
                outcomes: [
                    { weight: 1, effect: { technique: 3, morale: 2, fame: -1 }, resultText: 'Le decís que no y seguís en tu puesto. Te ponés a trabajarlo el doble.' },
                ],
            },
        ],
    },
    {
        id: 'aca-first-injury',
        category: 'injury',
        title: 'El primer cuerpo roto',
        text: 'Un choque tonto en un entrenamiento y el hombro dice basta. Es la primera vez que el cuerpo te avisa.',
        weight: 8,
        repeatable: false,
        maxAge: 17,
        options: [
            {
                id: 'rest',
                label: 'Parar lo que haya que parar',
                hint: 'Volvés entero. Te perdés media temporada de juveniles.',
                outcomes: [
                    { weight: 1, effect: { forceInjury: { name: 'Hombro luxado', severity: 'leve', seasonsOut: 0.25 }, mental: 3, injuryRisk: -3 }, resultText: 'Hacés toda la recuperación sin apurarla. Volvés entero y aprendiste a escuchar el cuerpo.' },
                ],
            },
            {
                id: 'rush',
                label: 'Volver para el torneo',
                hint: 'Jugás el torneo que querías. El hombro no se termina de curar.',
                outcomes: [
                    { weight: 2, effect: { forceInjury: { name: 'Hombro luxado', severity: 'leve', seasonsOut: 0.1 }, morale: 5, injuryRisk: 6 }, resultText: 'Volvés antes de tiempo y jugás el torneo. El hombro te lo va a recordar.' },
                    { weight: 1, effect: { forceInjury: { name: 'Hombro luxado', severity: 'moderada', seasonsOut: 0.4 }, morale: -6, injuryRisk: 10 }, resultText: 'Volvés antes de tiempo y se vuelve a salir. Esta vez la recuperación es larga.' },
                ],
            },
        ],
    },
    {
        id: 'aca-gym-or-field',
        category: 'personal',
        title: 'Gimnasio o cancha',
        text: 'El preparador te arma un plan de fuerza. El entrenador quiere verte más con la pelota en la mano.',
        weight: 12,
        repeatable: true,
        cooldown: 1,
        maxAge: 17,
        options: [
            {
                id: 'gym',
                label: 'Ir al gimnasio',
                hint: 'Te ponés fuerte para aguantar primera. Vas a tocar menos la pelota.',
                outcomes: [
                    { weight: 1, effect: { power: 4, stamina: 2, technique: -1 }, resultText: 'Levantás fierros todo el invierno. Salís del vestuario con otro cuerpo.' },
                ],
            },
            {
                id: 'field',
                label: 'Quedarte en la cancha',
                hint: 'Manos y lectura de juego. Al contacto vas a llegar liviano.',
                outcomes: [
                    { weight: 1, effect: { technique: 3, vision: 3, speed: 1, power: -1 }, resultText: 'Te quedás practicando con pelota hasta que oscurece. Se te nota en las manos.' },
                ],
            },
        ],
    },
    {
        id: 'aca-captain-juveniles',
        category: 'club',
        title: 'La cinta en juveniles',
        text: 'El entrenador te ofrece la capitanía de la academia. Es cargar con el grupo, no solo con tu partido.',
        weight: 7,
        repeatable: false,
        maxAge: 17,
        options: [
            {
                id: 'take-it',
                label: 'Ponerte la cinta',
                hint: 'Aprendés a manejar un grupo. Vas a jugar pensando en los otros catorce.',
                outcomes: [
                    { weight: 1, effect: { mental: 4, vision: 2, morale: 5, fame: 2, flags: { capitan_juveniles: 1 }, fatigue: 4 }, resultText: 'Te ponés la cinta. A los 16 ya sabés lo que es hablarle a un vestuario.' },
                ],
            },
            {
                id: 'pass',
                label: 'Dejársela a otro',
                hint: 'Te concentrás en tu juego. El club va a mirar a otro para eso.',
                outcomes: [
                    { weight: 1, effect: { technique: 2, form: 4, morale: 1 }, resultText: 'Preferís ocuparte de lo tuyo. Jugás más suelto que nunca.' },
                ],
            },
        ],
    },
    {
        id: 'aca-tour',
        category: 'club',
        title: 'Gira de juveniles',
        text: 'La academia arma una gira corta para jugar contra clubes de afuera. Hay que pagar una parte del viaje.',
        weight: 8,
        repeatable: true,
        cooldown: 1,
        maxAge: 17,
        options: [
            {
                id: 'go',
                label: 'Ir a la gira',
                hint: 'Te medís contra otro rugby. En casa hay que hacer el esfuerzo.',
                outcomes: [
                    { weight: 2, effect: { technique: 2, mental: 2, fame: 3, morale: 4 }, resultText: 'Jugás tres partidos contra pibes que juegan otro rugby. Volvés distinto.' },
                    { weight: 1, effect: { mental: 3, morale: -2, fatigue: 6 }, resultText: 'La gira se hace larga y te toca mirar dos partidos desde afuera. Igual aprendés.' },
                ],
            },
            {
                id: 'stay-home',
                label: 'Quedarte',
                hint: 'No gastás y entrenás tranquilo. Los que van vuelven con ventaja.',
                outcomes: [
                    { weight: 1, effect: { stamina: 2, power: 1, morale: -2 }, resultText: 'Te quedás entrenando solo mientras el resto viaja. El verano se hace largo.' },
                ],
            },
        ],
    },
];
