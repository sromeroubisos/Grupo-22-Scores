// EL CAPITÁN — el cuerpo y la cabeza. Prefijos `inj-`, `dis-`, `vet-`.
//
// Los números que justifican que esto exista: 76 lesiones por 1.000 horas de
// juego, unas 47 por club y temporada; severidad media de 38 días; el tackle
// causando la mitad de todas; la conmoción como lesión número uno con el 24%
// del total. No incluirlo sería como hacer un juego de fútbol sin tarjetas.
//
// ── El protocolo de conmoción no se banaliza ──
// Es la regla §5 del CLAUDE.md. `inj-te-pegaste` tiene una opción de ocultar el
// golpe, y tiene que tenerla: si el juego castigara siempre y de inmediato, se
// convertiría en un afiche y el jugador dejaría de sentir el dilema. Pero
// callarse nunca es gratis, el contador 🧠 no baja jamás, y el epílogo se
// escribe con probabilidad y no con sentencia — porque en la vida real tampoco
// es seguro. En el estudio prospectivo de 2025 la cognición de los ex jugadores
// a los 44 era prácticamente normal y no hubo un solo caso de CTE probable; lo
// que sí estaba muy elevado era la salud mental, con depresión clínica en el
// 28,5% contra el 3,1% de los controles.

import type { CaptainEvent } from '../../types/event.ts';

export const BODY_EVENTS: CaptainEvent[] = [
    // ── Conmoción ───────────────────────────────────────────────────────────
    {
        id: 'inj-te-pegaste',
        category: 'cuerpo',
        title: 'Te pegaste',
        text: 'Fue un choque de cabezas en un ruck y seguiste jugando. A la noche te levantaste mareado y nadie vio nada. El sábado se juega el clásico.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        requires: { stage: ['amateur'] },
        options: [
            {
                id: 'decirlo',
                label: 'Decirlo',
                hint: 'Tres semanas afuera como mínimo. Te perdés el clásico.',
                outcomes: [
                    { weight: 100, effect: { head: 1, playingTime: -2, flags: { 'hia-declarados': 1 } }, resultText: 'Lo dijiste y te pararon veintiún días. Te perdiste el clásico y lo miraste desde el alambrado.' },
                ],
            },
            {
                id: 'callarte',
                label: 'Callarte',
                hint: 'Jugás el clásico. Si te volvés a pegar es peor, y mucho.',
                outcomes: [
                    { weight: 62, effect: { belonging: 3, playingTime: 1, flags: { 'hia-ocultados': 1 } }, resultText: 'Jugaste el clásico y lo ganaron. No te volvió a pasar en todo el año.' },
                    { weight: 38, effect: { head: 2, body: 12, playingTime: -2, flags: { 'hia-ocultados': 1 } }, resultText: 'Jugaste el clásico y a los veinte minutos te llevaste otro golpe. Estuviste dos meses con dolor de cabeza y sin poder mirar una pantalla.' },
                ],
            },
        ],
    },

    {
        id: 'inj-hia',
        category: 'cuerpo',
        title: 'HIA',
        text: 'Minuto 54 de la final. El protector bucal instrumentado mandó la alerta al médico independiente y no quedó en cámara. Vos no sentís nada. Están tres puntos arriba.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        requires: { stage: ['professional'] },
        options: [
            {
                id: 'ir-al-hia',
                label: 'Salir al HIA',
                hint: 'Doce minutos afuera. Si das positivo, no volvés en doce días.',
                outcomes: [
                    { weight: 55, effect: { playingTime: -1 }, resultText: 'Diste negativo y volviste a los doce minutos. Ganaron por tres.' },
                    { weight: 45, effect: { head: 1, playingTime: -1, flags: { 'hia-declarados': 1 } }, resultText: 'Diste positivo y no volviste. Doce días de protocolo y una final que miraste desde el vestuario.' },
                ],
            },
            {
                id: 'discutirlo',
                label: 'Discutirlo con el médico',
                hint: 'No es tuya la decisión, y lo sabés. Podés hacerle perder tiempo.',
                outcomes: [
                    { weight: 100, effect: { head: 1, playingTime: -1, fame: -2, flags: { 'hia-declarados': 1 } }, resultText: 'El protocolo no es tuyo: te sacaron igual y encima quedó la discusión filmada. Diste positivo.' },
                ],
            },
        ],
    },

    // ── Lesiones ────────────────────────────────────────────────────────────
    {
        id: 'inj-hombro',
        category: 'cuerpo',
        title: 'El hombro',
        text: 'Se te sale hace tres meses y ya sabés cómo acomodarlo solo. El médico dice que hay que operar. Faltan ocho fechas.',
        weight: 7,
        repeatable: true,
        cooldown: 6,
        options: [
            {
                id: 'operarte',
                label: 'Operarte ahora',
                hint: 'Volvés entero el año que viene. Se te termina esta temporada.',
                outcomes: [
                    { weight: 80, effect: { body: -18, playingTime: -3, attrs: { choque: -1 } }, resultText: 'Te operaste en mayo y volviste en febrero. El hombro no se movió nunca más.' },
                    { weight: 20, effect: { body: -8, playingTime: -3, attrs: { choque: -3 } }, resultText: 'La recuperación se estiró cuatro meses más de lo previsto. Volviste con miedo a meter el hombro.' },
                ],
            },
            {
                id: 'aguantar',
                label: 'Aguantar hasta fin de año',
                hint: 'Jugás las ocho fechas. El hombro se va a acordar.',
                outcomes: [
                    { weight: 45, effect: { body: 14, statBoost: 1 }, resultText: 'Aguantaste las ocho con una faja y una infiltración. Jugaste la final.' },
                    { weight: 55, effect: { body: 22, playingTime: -2, attrs: { choque: -2 } }, resultText: 'Se salió otra vez en la cuarta fecha, y esta vez con el labrum. Te operaron igual, tres meses más tarde y peor.' },
                ],
            },
        ],
    },

    {
        id: 'inj-la-rodilla',
        category: 'cuerpo',
        title: 'La rodilla',
        text: 'Apoyaste mal en un cambio de dirección y escuchaste el crujido antes de sentir el dolor. Cruzado.',
        weight: 5,
        repeatable: true,
        cooldown: 8,
        requires: { minAge: 21 },
        options: [
            {
                id: 'la-rehabilitacion-completa',
                label: 'Hacer la rehabilitación completa',
                hint: 'Nueve meses afuera, hechos bien. Volvés siendo vos.',
                outcomes: [
                    { weight: 75, effect: { body: -10, playingTime: -3, attrs: { velocidad: -1 } }, resultText: 'Nueve meses de gimnasio solo, con el fisio y nadie más. Volviste y a la tercera fecha ya no pensabas en la rodilla.' },
                    { weight: 25, effect: { body: 6, playingTime: -3, attrs: { velocidad: -4, aguante: -2 } }, resultText: 'Volviste a los nueve meses y la rodilla nunca fue la misma. Perdiste medio paso y en tu puesto medio paso es todo.' },
                ],
            },
            {
                id: 'apurarla',
                label: 'Apurarla para los playoffs',
                hint: 'Podés llegar a la semifinal. Es la rodilla, y es una sola.',
                outcomes: [
                    { weight: 35, effect: { body: 16, fame: 4, belonging: 4 }, resultText: 'Llegaste a la semifinal con seis meses y jugaste veinte minutos. Los veinte minutos más largos de tu vida.' },
                    { weight: 65, effect: { body: 28, playingTime: -3, attrs: { velocidad: -5, aguante: -3 } }, resultText: 'La rodilla no estaba. Se volvió a ir en el primer entrenamiento fuerte y volviste a empezar de cero.' },
                ],
            },
        ],
    },

    // ── Disciplina ──────────────────────────────────────────────────────────
    {
        id: 'dis-la-audiencia',
        category: 'disciplina',
        title: 'La audiencia',
        text: 'Te citaron por un tackle por encima de los hombros. Todo juego sucio con contacto en la cabeza entra como mínimo en el rango medio: seis semanas de punto de entrada.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        requires: { minSeasons: 2 },
        options: [
            {
                id: 'declararte-culpable',
                label: 'Declararte culpable',
                hint: 'Hasta la mitad de mitigación por buen historial y arrepentimiento. Queda escrito.',
                outcomes: [
                    { weight: 100, effect: { sanction: 3, fame: -2 }, resultText: 'Te declaraste culpable, mostraste el video del entrenamiento de tackle y te bajaron la sanción a la mitad. Tres semanas.' },
                ],
            },
            {
                id: 'pelearla',
                label: 'Pelearla',
                hint: 'Podés zafar. Si perdés, la actitud es agravante.',
                outcomes: [
                    { weight: 40, effect: { sanction: 0, attrs: { liderazgo: 1 } }, resultText: 'Mostraste que el que bajó la altura fue él. Sin sanción, y el panel lo dejó por escrito.' },
                    { weight: 60, effect: { sanction: 8, fame: -6 }, resultText: 'Perdiste. Te agravaron la sanción por no reconocerlo y te fuiste ocho semanas.' },
                ],
            },
            {
                id: 'tackle-school',
                label: 'Pedir el tackle school',
                hint: 'Canjeás la última semana por trabajo técnico. Solo si sos primerizo.',
                outcomes: [
                    { weight: 100, effect: { sanction: 4, attrs: { tackle: 3 } }, resultText: 'Hiciste el programa de intervención técnica y te canjearon la última semana. Encima aprendiste a bajar la altura.' },
                ],
            },
        ],
    },

    {
        id: 'dis-el-referee',
        category: 'disciplina',
        title: 'Hablás vos, capitán',
        text: 'Minuto 61. Tercer penal seguido en contra en el scrum. El referee ya te miró dos veces y en el pack están empezando a hablar de más.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        requires: { minBelonging: 40, minSeasons: 3 },
        options: [
            {
                id: 'tecnico',
                label: 'Ir por lo técnico',
                hint: '"Sir, el 3 de ellos entra con el hombro caído." Concreto y sin discutir el fallo.',
                outcomes: [
                    { weight: 70, effect: { attrs: { liderazgo: 2 }, fame: 2 }, resultText: 'Se lo dijiste sin levantar la voz y en el siguiente scrum lo miró. El penal vino para vos.' },
                    { weight: 30, effect: {}, resultText: 'Te escuchó, asintió y no cambió nada. Al menos no te costó nada.' },
                ],
            },
            {
                id: 'firme',
                label: 'Plantarte',
                hint: '"Nos están cerrando el ángulo desde la primera." Se nota el fastidio.',
                outcomes: [
                    { weight: 45, effect: { attrs: { liderazgo: 3 }, fame: 3 }, resultText: 'Le plantaste la queja y funcionó: dio vuelta el criterio en el scrum siguiente.' },
                    { weight: 55, effect: { sanction: 1, fame: -3 }, resultText: 'Se lo tomó como disidencia. Diez metros de avance, amarilla y el equipo con catorce.' },
                ],
            },
            {
                id: 'callarte',
                label: 'Callarte',
                hint: 'No gastás crédito. Tampoco cambia nada.',
                outcomes: [
                    { weight: 100, effect: {}, resultText: 'Volviste a la línea sin decir nada. Los tres penales siguientes también fueron en contra.' },
                ],
            },
        ],
    },

    // ── Fin de carrera ──────────────────────────────────────────────────────
    {
        id: 'vet-el-banco',
        category: 'veterano',
        title: 'El banco',
        text: 'El entrenador te propone el rol de impacto: veinte o treinta minutos por partido, entrando con el partido roto. Un plantel de partido son veintitrés y el split 6-2 lo cambió todo.',
        weight: 8,
        repeatable: false,
        requires: { minAge: 30, minSeasons: 8 },
        options: [
            {
                id: 'aceptar-el-banco',
                label: 'Aceptar',
                hint: 'Jugás más partidos y te desgastás menos. Se resigna la titularidad.',
                outcomes: [
                    { weight: 100, effect: { playingTime: -1, body: -14, attrs: { liderazgo: 2 }, flags: { 'rol-de-impacto': 1 } }, resultText: 'Entrás a los cincuenta con el partido roto y el pack de ellos fundido. Te alcanzó para dos temporadas más.' },
                ],
            },
            {
                id: 'pelear-la-titularidad',
                label: 'Pelear la titularidad',
                hint: 'Seguís siendo titular mientras aguantes. El cuerpo lleva la cuenta.',
                outcomes: [
                    { weight: 45, effect: { playingTime: 1, body: 12, fame: 2 }, resultText: 'Le dijiste que todavía no. Jugaste de titular la temporada entera y terminaste caminando.' },
                    { weight: 55, effect: { playingTime: -2, body: 16 }, resultText: 'Peleaste la titularidad y la perdiste igual. Terminaste jugando menos que si hubieras aceptado el banco.' },
                ],
            },
        ],
    },

    {
        id: 'vet-una-mas',
        category: 'veterano',
        title: 'Una más',
        text: 'Terminó la temporada y el cuerpo tardó tres semanas en dejar de doler. En el club te preguntan si el año que viene estás.',
        weight: 10,
        repeatable: true,
        cooldown: 2,
        requires: { minAge: 32 },
        options: [
            {
                id: 'una-mas',
                label: 'Una más',
                hint: 'Seguís. Cada temporada de más se paga en el epílogo.',
                outcomes: [
                    { weight: 100, effect: { belonging: 3, body: 6 }, resultText: 'Dijiste que sí sin pensarlo. Siempre dijiste que sí sin pensarlo.' },
                ],
            },
            {
                id: 'colgar-los-botines',
                label: 'Colgar los botines',
                hint: 'Te vas cuando querés vos. No hay marcha atrás.',
                outcomes: [
                    { weight: 100, effect: { retire: true, belonging: 5 }, resultText: 'Avisaste en junio para que pudieran despedirte en la última fecha. La cancha estaba llena.' },
                ],
            },
        ],
    },
];
