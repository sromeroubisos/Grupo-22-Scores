// EL CAPITÁN — los CINCO que le tocan a cualquiera.
//
// No pertenecen a ningún dorsal. Le pueden salir a un pilar de 19 años en la
// Tercera de la URBA y a un fullback de 31 en un Mundial, y con el mismo margen:
// `shirt: null` significa que nadie los juega prestado.
//
// ── Por qué existen ──
// Porque el rugby los pide. En juego abierto un jugador puede tener que ser
// portador, apoyo, pasador, pateador, tackleador o ganador de pelota, y esas
// destrezas no le preguntan a nadie qué número tiene en la espalda. Un catálogo
// que fuera solamente por dorsal diría que un pilar no pasa y que un wing no
// entra a un ruck, y las dos cosas son mentira.
//
// ── Y por qué son CINCO y no quince ──
// Porque cada universal que se agrega le saca sorteos a los cuatro propios del
// dorsal. Con quince transversales, el 60% de las jugadas de una carrera serían
// las mismas para los quince puestos y el catálogo por dorsal —que es todo el
// punto— se volvería decorado. Cinco es lo que entra sin tapar lo propio.
//
// ── El tackle ya estaba ──
// Y es el más importante de los cinco: causa la mitad de las lesiones del rugby
// y es el único que se enchufa directo con el sistema disciplinario, porque
// encadena al bunker. Ocupa su casilla como `legacyOf`.

import type { MinigameSlot } from '../../types/minigame.ts';

export const UNIVERSAL_MINIGAMES: readonly MinigameSlot[] = [
    {
        kind: 'uni-tackle',
        shirt: null,
        legacyOf: 'tackle',
        copy: { title: 'El tackle' },
    },

    {
        kind: 'uni-ruck',
        shirt: null,
        mechanic: 'lectura',
        attr: 'trabajo',
        stake: 'media',
        risk: 'sancion',
        gloria: 'ajena',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Proteger la pelota', hint: 'Te parás encima y no la suelta nadie.' },
                { label: 'Limpiar al rival', hint: 'Lo sacás de la zona. Cuesta cuerpo.' },
                { label: 'Ir a robarla', hint: 'Si llegás primero es turnover. Si no, penal.' },
                { label: 'Salir a la línea', hint: 'Dejás el ruck y armás la defensa de afuera.' },
            ],
            senas: [
                {
                    label: 'Tu compañero cayó solo y no llega nadie de los tuyos',
                    detalle: 'Si no la protegés vos, la pierden.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'Hay un rival parado sobre la pelota y ya la agarró',
                    detalle: 'Sacarlo ahora es lo único que evita el turnover.',
                    mejor: 1,
                    segunda: 0,
                },
                {
                    label: 'El portador rival cayó y sus compañeros vienen de lejos',
                    detalle: 'La pelota está sola y vos estás parado al lado.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Ya hay cuatro adentro del ruck y la línea quedó corta',
                    detalle: 'Un cuerpo más adentro es un hueco más afuera.',
                    mejor: 3,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'El ruck',
            brief: 'La pelota está en el piso y sos el que llega. Nadie te va a decir qué hacer y las cuatro cosas están bien alguna vez. Hoy solo una.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Hiciste exactamente lo que la jugada pedía y el breakdown quedó de tu lado.',
                logrado: 'Elegiste bien y la pelota salió limpia.',
                tibio: 'No fue lo mejor pero tampoco se perdió nada. Pelota lenta.',
                errado: 'Entraste donde no correspondía y el referee cobró. Penal en contra.',
            },
            result: {
                clavado: 'Breakdown ganado',
                logrado: 'Pelota asegurada',
                tibio: 'Pelota lenta',
                errado: 'Penal en contra',
            },
        },
    },

    {
        kind: 'uni-pase',
        shirt: null,
        mechanic: 'punteria',
        attr: 'manos',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 11,
        params: {
            senal: 'La velocidad del compañero que viene corriendo',
            desvioMax: 0.55,
            bordes: ['Se lo tirás atrás', 'Se lo tirás muy adelante'],
            zona: 'Las manos, en carrera',
            sweepMs: 1200,
        },
        copy: {
            title: 'El pase',
            brief: 'El compañero viene corriendo y hay que tirarle la pelota adonde va a estar, no adonde está. Un pase a las manos del que corre es un pase atrás de las manos.',
            cta: 'Tocá para pasar',
            outcome: {
                clavado: 'Se la pusiste adelante y a la altura del pecho. La agarró sin frenar y se llevó dos puestos.',
                logrado: 'Pase limpio y a tiempo. El ataque siguió de largo.',
                tibio: 'Se la tiraste corta y tuvo que frenar. Lo agarraron de una.',
                errado: 'Se la tiraste adelantada y se le fue de las manos. Knock on.',
            },
            result: {
                clavado: 'Pase de gol',
                logrado: 'Pase limpio',
                tibio: 'Pase frenado',
                errado: 'Knock on',
            },
        },
    },

    {
        kind: 'uni-suelta',
        shirt: null,
        mechanic: 'ventana',
        attr: 'manos',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 10,
        params: {
            zona: 'El pique bueno',
            bordes: ['Todavía viene picando', 'Ya la levantó el otro'],
            vueltas: 3,
            sweepMs: 900,
            anchoBase: 0.1,
        },
        copy: {
            title: 'La pelota suelta',
            brief: 'Quedó picando en el medio y van los dos a buscarla. Una pelota de rugby no pica dos veces igual: hay un pique en el que sube a la mano y todos los otros te la hacen picar adelante.',
            cta: 'Tocá para levantarla',
            outcome: {
                clavado: 'La levantaste en el pique bueno, sin frenar, y saliste corriendo con la defensa desarmada.',
                logrado: 'La aseguraste antes que el rival. Pelota tuya.',
                tibio: 'La palmeaste para atrás y la juntó un compañero. Sirvió.',
                errado: 'Quisiste levantarla en el pique malo y se te fue adelante. Knock on y scrum del rival.',
            },
            result: {
                clavado: 'Pelota recuperada',
                logrado: 'Pelota asegurada',
                tibio: 'Pelota palmeada',
                errado: 'Knock on',
            },
        },
    },

    {
        kind: 'uni-decision',
        shirt: null,
        mechanic: 'lectura',
        attr: 'liderazgo',
        stake: 'grande',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 12,
        params: {
            segundos: 5,
            opciones: [
                { label: 'Patear a los palos', hint: 'Tres puntos si entra. Si erra, no queda nada.' },
                { label: 'Jugarla', hint: 'Todo o nada, con la pelota en la mano.' },
                { label: 'Ir a touch', hint: 'Line-out y maul en su cinco. Un try o nada.' },
            ],
            senas: [
                {
                    label: 'Perdés por dos y el penal es a treinta y cinco de frente',
                    detalle: 'Con viento a favor y tu pateador entero.',
                    mejor: 0,
                    segunda: 2,
                },
                {
                    label: 'Perdés por cinco y el penal es contra la ceja',
                    detalle: 'Tres puntos no te alcanzan para nada.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Perdés por dos y el rival está con dos jugadores menos',
                    detalle: 'Les faltan un forward y un back, y la cancha está abierta.',
                    mejor: 1,
                    segunda: 0,
                },
                {
                    label: 'Ganás por uno y quedan dos minutos',
                    detalle: 'Todo lo que no sea sacar la pelota de tu campo es un riesgo.',
                    mejor: 0,
                    segunda: 2,
                },
            ],
        },
        copy: {
            title: 'La última decisión',
            brief: 'Se termina el partido y el referee te mira a vos. No es una prueba de reflejos: es saber lo que hay que hacer, con el marcador y el reloj adentro de la cabeza.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Elegiste lo que había que elegir y el partido se terminó de tu lado. De eso se acuerda el club veinte años.',
                logrado: 'Decidiste bien y salió. Se ganó.',
                tibio: 'No era lo mejor pero no se perdió por eso. Quedó la duda.',
                errado: 'Elegiste lo que no era y el partido se fue. En el vestuario nadie te dijo nada, que es peor.',
            },
            result: {
                clavado: 'Partido ganado',
                logrado: 'Buena decisión',
                tibio: 'Decisión discutida',
                errado: 'Partido perdido',
            },
        },
    },
];
