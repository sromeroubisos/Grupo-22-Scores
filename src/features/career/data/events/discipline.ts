import type { GameEvent } from '../../types/event.ts';

/**
 * DISCIPLINA — el eje que faltaba.
 *
 * El juego tenía cómo premiar (valoración, minutos, reputación) y cómo castigar
 * por el lado del cuerpo (la lesión), pero no tenía la otra forma en que un
 * jugador de rugby se pierde partidos: la tarjeta y la citación. Sin este eje,
 * "seguir jugando al límite" era gratis.
 *
 * Los partidos de suspensión salen por el mismo camino que una lesión —la
 * disponibilidad de la temporada—, así que se ven en la planilla y no sólo en el
 * relato: cuatro fechas menos son cuatro fechas de tackles menos.
 *
 * La tarjeta y los partidos son datos SEPARADOS porque en rugby no van siempre
 * juntos: una amarilla son diez minutos y ningún partido, una roja puede quedar
 * en nada si la comisión no cita, y una citación te suspende sin que el referí
 * haya visto nada.
 */
export const DISCIPLINE_EVENTS: GameEvent[] = [
    {
        id: 'dis-repeated-fouls',
        category: 'discipline',
        title: 'El referí te tiene marcado',
        text: 'Van tres infracciones tuyas en el ruck. El referí te llama, te avisa delante de todos y la próxima la cobra caro.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'keep-hard',
                label: 'Seguir jugando al límite',
                hint: 'Es tu manera de jugar. La próxima la paga el equipo.',
                outcomes: [
                    { weight: 45, effect: { tackle: 2, mental: 1, fame: 2 }, resultText: 'Seguís apretando en cada ruck y el referí no vuelve a llamarte. Tu equipo gana esa pelea.' },
                    { weight: 40, effect: { sanction: { card: 'amarilla' }, morale: -3 }, resultText: 'A los veinte minutos llega la amarilla. Diez minutos afuera mirando desde el costado.' },
                    { weight: 15, effect: { sanction: { card: 'roja', matches: 2 }, morale: -7 }, resultText: 'La segunda amarilla es roja. Te vas expulsado y la comisión te da dos partidos.' },
                ],
            },
            {
                id: 'ease-off',
                label: 'Bajar la intensidad',
                hint: 'No te echan. Tampoco te van a sentir en el contacto.',
                outcomes: [
                    { weight: 1, effect: { valoracion: -1, form: -3 }, resultText: 'Jugás el resto del partido con el freno de mano. No te sancionan y no aparecés.' },
                ],
            },
        ],
    },
    {
        id: 'dis-referee-comments',
        category: 'discipline',
        title: 'Te preguntan por el arbitraje',
        text: 'Perdieron con un try que no fue. En la zona mixta te preguntan por el referí y tenés la respuesta lista.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        minAge: 21,
        options: [
            {
                id: 'speak',
                label: 'Decir lo que pensás',
                hint: 'La tribuna te va a aplaudir. La comisión también te escucha.',
                outcomes: [
                    { weight: 30, effect: { fame: 6, mental: 1 }, resultText: 'Lo decís sin vueltas y no pasa nada. Media hinchada te hace suyo.' },
                    { weight: 70, effect: { sanction: { matches: 1, reason: 'Declaraciones sobre el arbitraje' }, fame: 3, morale: -3 }, resultText: 'La frase da la vuelta y la comisión te suspende una fecha por declaraciones.' },
                ],
            },
            {
                id: 'quiet',
                label: 'Guardarte la opinión',
                hint: 'Te ahorrás el problema y te quedás con la bronca adentro.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, morale: -2 }, resultText: 'Contestás dos frases hechas y te vas al vestuario. Alguna vez había que aprenderlo.' },
                ],
            },
        ],
    },
    {
        id: 'dis-post-match-shove',
        category: 'discipline',
        title: 'El empujón después del pitazo',
        text: 'Terminó el partido y un rival te busca. Te dice algo al oído y te empuja con el hombro.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'respond',
                label: 'Responderle',
                hint: 'El vestuario te va a bancar. La citación llega igual.',
                outcomes: [
                    { weight: 50, effect: { sanction: { matches: 1 }, fame: 2, morale: 2 }, resultText: 'Se lo devolvés y quedan cara a cara. Una fecha para cada uno y el tema termina ahí.' },
                    { weight: 50, effect: { sanction: { card: 'roja', matches: 2 }, morale: -4, fame: 3, flags: { temperamental: 1 } }, resultText: 'El referí todavía no se había ido. Roja después del partido y dos fechas.' },
                ],
            },
            {
                id: 'walk',
                label: 'Irte al vestuario',
                hint: 'No pasa nada. Te vas masticando bronca.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, morale: 1, flags: { templado: 1 } }, resultText: 'Le sostenés la mirada y seguís caminando. El capitán te lo hace notar después.' },
                ],
            },
        ],
    },
    {
        id: 'dis-citing',
        category: 'discipline',
        title: 'La citación',
        text: 'La comisión te citó por un tackle alto que el referí no vio. Hay audiencia el miércoles.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'appeal',
                label: 'Ir a defenderte',
                hint: 'Si te creen, no perdés nada. Si no, la sanción sube.',
                outcomes: [
                    { weight: 45, effect: { mental: 2, morale: 2 }, resultText: 'Llevás el video completo y muestran que el rival se agachó. Se cae la citación.' },
                    { weight: 55, effect: { sanction: { matches: 3, reason: 'Tackle alto' }, morale: -5 }, resultText: 'No les alcanza tu explicación y el agravante te cuesta una fecha más: tres partidos.' },
                ],
            },
            {
                id: 'accept',
                label: 'Aceptar la sanción',
                hint: 'Dos fechas y listo. No discutís algo que hiciste.',
                outcomes: [
                    { weight: 1, effect: { sanction: { matches: 2, reason: 'Tackle alto' }, mental: 1 }, resultText: 'Reconocés el tackle y aceptás las dos fechas. La comisión valora que no lo estires.' },
                ],
            },
        ],
    },
];
