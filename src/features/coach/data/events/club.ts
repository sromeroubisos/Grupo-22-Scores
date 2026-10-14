// El club: la subcomisión, la sede, el sponsor, la cuota.
//
// Nada de esto se cobra en dinero para el entrenador. La plata que aparece acá
// es del CLUB y se gasta en el club: canchas, gimnasio, el micro. El eje
// económico del rugby es la tesorería de una institución amateur, no un
// presupuesto de fichajes.

import type { CoachEvent } from '../../types/event.ts';

export const CLUB_EVENTS: readonly CoachEvent[] = [
    {
        id: 'club-sponsor-ferreteria',
        family: 'club',
        title: 'El sponsor de la esquina',
        text: 'La ferretería del barrio quiere poner el logo en la camiseta. Ofrecen poco, pero ofrecen todos los años.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'aceptar',
                label: 'Aceptar',
                hint: 'Entra plata fija. La camiseta deja de ser solo del club.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: 4_200_000, hinchada: -2 },
                        resultText:
                            'Firmaron por tres años. Algunos socios viejos putearon por el logo, y el club pagó el gimnasio.',
                    },
                ],
            },
            {
                id: 'buscar-mas-grande',
                label: 'Buscar uno más grande',
                hint: 'Podés conseguir el triple. O quedarte sin ninguno.',
                outcomes: [
                    {
                        weight: 40,
                        effect: { cajaFijo: 11_000_000, reputacion: 2 },
                        resultText: 'Golpearon la puerta de la concesionaria y salió. Tres veces la plata de la ferretería.',
                    },
                    {
                        weight: 60,
                        effect: { presion: 5 },
                        resultText: 'No apareció nadie. La camiseta quedó limpia y la caja también.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-cuota-social',
        family: 'club',
        title: 'La cuota atrasada',
        text: 'La cuota social quedó vieja frente a lo que salen las cosas. Subirla es antipático y no subirla es peor.',
        weight: 8,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'subirla',
                label: 'Subirla de una',
                hint: 'La caja respira. Algunos socios se van.',
                outcomes: [
                    {
                        weight: 70,
                        effect: { socios: -40, cajaFijo: 6_500_000, hinchada: -3 },
                        resultText:
                            'Se fueron cuarenta socios y entraron seis millones. La cuenta cerró, la asamblea no fue linda.',
                    },
                    {
                        weight: 30,
                        effect: { socios: -110, cajaFijo: 5_000_000, hinchada: -7, presion: 6 },
                        resultText:
                            'Se fueron más de los que se esperaba. En el barrio quedó la idea de que el club se puso caro.',
                    },
                ],
            },
            {
                id: 'escalonarla',
                label: 'Subirla en tres tramos',
                hint: 'Nadie se va. Entra menos y entra tarde.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: 2_600_000, socios: 10 },
                        resultText: 'Se subió de a poco y casi no se notó. Entró la mitad de lo que hacía falta.',
                    },
                ],
            },
            {
                id: 'no-tocarla',
                label: 'Dejarla como está',
                hint: 'El socio te lo agradece. El tesorero no.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { socios: 55, hinchada: 4, cajaFijo: -1_500_000 },
                        resultText:
                            'La cuota quedó igual y llegaron socios nuevos. El año que viene el problema va a ser más grande.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-gimnasio',
        family: 'club',
        title: 'El gimnasio',
        text: 'El gimnasio son cuatro barras oxidadas en un galpón. La subcomisión pregunta si vale la pena la inversión o si es plata tirada.',
        weight: 8,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'invertir',
                label: 'Poner el gimnasio en condiciones',
                hint: 'Se va un tercio de la caja. Queda para siempre.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.3, estructura: 9, cohesion: 3 },
                        resultText:
                            'Discos nuevos, piso de goma y un preparador que sabe. El plantel entrena distinto desde el primer martes.',
                    },
                ],
            },
            {
                id: 'arreglar-lo-que-hay',
                label: 'Arreglar lo que hay',
                hint: 'Barato y sirve. No cambia nada de fondo.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.08, estructura: 3 },
                        resultText: 'Se pintó el galpón y se compraron dos barras. Alcanza para la temporada.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-tercera-cancha',
        family: 'club',
        title: 'La cancha del fondo',
        text: 'Se vende el terreno que linda con el club. Con eso el M19 dejaría de entrenar en el mismo pasto que la primera.',
        weight: 6,
        repeatable: false,
        requires: { minSeason: 2 },
        options: [
            {
                id: 'comprarlo',
                label: 'Comprarlo',
                hint: 'Deja la caja en cero o abajo. Es la decisión de diez años.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.75, estructura: 16, hinchada: 6, reputacion: 3 },
                        resultText:
                            'Se compró. El club quedó sin un peso y con una cancha más, y en la asamblea aplaudieron de pie.',
                    },
                ],
            },
            {
                id: 'dejarlo-pasar',
                label: 'Dejarlo pasar',
                hint: 'La caja queda intacta. El terreno no vuelve a estar.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { presion: 4 },
                        resultText:
                            'Lo compró un desarrollador. En dos años hay edificios donde iba a estar la cancha del M19.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-subcomision-aprieta',
        family: 'club',
        title: 'Reunión de subcomisión',
        text: 'Te citaron un martes a las nueve. No es para felicitarte.',
        weight: 10,
        repeatable: true,
        cooldown: 2,
        requires: { minPressure: 55 },
        options: [
            {
                id: 'bancar-el-proyecto',
                label: 'Defender el proyecto',
                hint: 'Si sale bien te sacás la mochila. Si sale mal la duplicás.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { presion: -12, cohesion: 3 },
                        resultText:
                            'Hablaste una hora y media. Se fueron convencidos de que hay un plan y de que vos lo tenés claro.',
                    },
                    {
                        weight: 45,
                        effect: { presion: 9 },
                        resultText: 'No compraron nada. Uno dijo en voz alta que ya escucharon ese discurso el año pasado.',
                    },
                ],
            },
            {
                id: 'prometer-resultados',
                label: 'Prometer resultados ya',
                hint: 'Te sacás la reunión de encima y te ponés fecha de vencimiento.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { presion: -6, flags: { prometioResultados: 1 } },
                        resultText:
                            'Dijiste que en dos fechas se ve otro equipo. Salieron tranquilos y vos saliste con un plazo.',
                    },
                ],
            },
            {
                id: 'ofrecer-el-cargo',
                label: 'Poner el cargo a disposición',
                hint: 'O te ratifican, o se termina acá.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { presion: -22, reputacion: 2 },
                        resultText:
                            'Te ratificaron por unanimidad. A veces poner el cargo sobre la mesa es la única forma de sacarlo del centro.',
                    },
                    {
                        weight: 40,
                        effect: { presion: 20 },
                        resultText:
                            'Nadie te dijo que no te fueras. Te ratificaron con la boca chica y el silencio quedó dando vueltas.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-deuda-con-la-union',
        family: 'club',
        title: 'La deuda con la unión',
        text: 'La unión avisa que hay cuotas de afiliación sin pagar. Si no se regulariza, no hay fichas para la fecha que viene.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        requires: { minDebtMonths: 2 },
        options: [
            {
                id: 'pagar',
                label: 'Pagar todo ahora',
                hint: 'Duele en la caja. El plantel juega completo.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.4 },
                        resultText: 'Se pagó. Quedó la caja en los huesos y el equipo en la cancha, que era lo que importaba.',
                    },
                ],
            },
            {
                id: 'plan-de-pagos',
                label: 'Pedir un plan de pagos',
                hint: 'Alivia hoy. La unión te mira distinto.',
                outcomes: [
                    {
                        weight: 70,
                        effect: { cajaPct: -0.12, reputacion: -2 },
                        resultText: 'Aceptaron el plan en seis cuotas. En la unión quedó anotado quién pidió el favor.',
                    },
                    {
                        weight: 30,
                        effect: { cajaPct: -0.12, reputacion: -2, rating: -2 },
                        resultText:
                            'Aceptaron, pero dos fichas quedaron trabadas hasta el mes siguiente. Se jugaron cuatro fechas sin ellos.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-buffet-concesion',
        family: 'club',
        title: 'La concesión del buffet',
        text: 'Se vence el contrato del buffet. Está el de siempre, que es del club de toda la vida, y está una cadena que paga mejor.',
        weight: 7,
        repeatable: true,
        cooldown: 6,
        options: [
            {
                id: 'la-cadena',
                label: 'Dársela a la cadena',
                hint: 'Paga bastante más. El tercer tiempo deja de ser el de antes.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: 7_500_000, hinchada: -6, cohesion: -3 },
                        resultText: 'Pusieron cartelería y precios de shopping. Entra más plata y el tercer tiempo se vació.',
                    },
                ],
            },
            {
                id: 'el-de-siempre',
                label: 'Renovarle al de siempre',
                hint: 'Paga menos. El club sigue siendo el club.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: 2_800_000, hinchada: 5, cohesion: 3 },
                        resultText:
                            'Renovó el de siempre. Sigue fiando a los del M19 y sigue estando el domingo a las nueve de la mañana.',
                    },
                ],
            },
        ],
    },
    {
        id: 'club-ascenso-y-cuentas',
        family: 'club',
        title: 'Ascendieron, ahora la cuenta',
        text: 'El ascenso trajo la fiesta y también la lista: cancha reglamentaria, más arbitrajes, viajes más largos. La categoría de arriba se paga.',
        weight: 12,
        repeatable: true,
        cooldown: 2,
        requires: { requiresPromotion: true },
        options: [
            {
                id: 'invertir-para-competir',
                label: 'Poner lo que haga falta',
                hint: 'El club se pone a la altura. La caja lo sufre.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.42, estructura: 10, rating: 1, hinchada: 5 },
                        resultText: 'Se hizo todo: tribuna, vestuarios, un preparador más. Subieron a competir, no a pasear.',
                    },
                ],
            },
            {
                id: 'lo-minimo',
                label: 'Hacer lo mínimo del reglamento',
                hint: 'Se cumple y punto. Se sube a ver qué pasa.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.12, estructura: 2, presion: 5 },
                        resultText:
                            'Se cumplió con la planilla de la unión y nada más. En la categoría nueva se nota desde el primer sábado.',
                    },
                ],
            },
        ],
    },
];
