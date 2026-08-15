// EL CAPITÁN — los minijuegos de LA LÍNEA: dorsales 9 al 15.
//
// Cuatro por dorsal, y acá el eje del dorsal pesa todavía más que en el pack:
// las ocho familias meten al 12 y al 13 en la misma bolsa y al 11, al 14 y al 15
// en otra, cuando un primer centro y un segundo centro no juegan al mismo juego
// —uno fija y el otro lee el intervalo— y un fullback no hace nada de lo que
// hace un wing salvo correr.
//
// ── Los dos que ya estaban ──
// Los palos (10) y la banda (14) son Momentos escritos a mano. Ocupan su casilla
// como `legacyOf` y no se tocan.

import type { MinigameSlot } from '../../types/minigame.ts';

export const LINEA_MINIGAMES: readonly MinigameSlot[] = [
    // ═══════════════════════════════════════════════════════════════════════
    //  9 · MEDIO SCRUM — el que reparte
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd9-base',
        shirt: 9,
        mechanic: 'ventana',
        attr: 'salida',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 11,
        params: {
            zona: 'La pelota afuera',
            bordes: ['Todavía no salió', 'Ya te comieron'],
            vueltas: 2,
            sweepMs: 880,
            anchoBase: 0.1,
        },
        copy: {
            title: 'Pase de base',
            brief: 'La pelota sale del ruck y el 10 ya está pidiendo. Un 9 lento mata a su apertura: cada décima que tardás es un metro que el rival gana para arriba.',
            cta: 'Tocá para pasar',
            outcome: {
                clavado: 'Salió en una sola acción, plana y a la altura del pecho. El 10 la recibió con la línea entera adelantada.',
                logrado: 'Pase limpio y a tiempo. El ataque siguió sin frenarse.',
                tibio: 'Tardaste medio tiempo de más y el 10 la recibió con el rival encima.',
                errado: 'La levantaste tarde y te comieron con la pelota en las manos. Turnover en zona propia.',
            },
            result: {
                clavado: 'Pelota rápida',
                logrado: 'Pase limpio',
                tibio: 'Pelota lenta',
                errado: 'Pelota perdida',
            },
        },
    },

    {
        kind: 'd9-box',
        shirt: 9,
        mechanic: 'punteria',
        attr: 'patada',
        stake: 'grande',
        risk: 'ninguno',
        // Los metros de kick son la métrica secundaria del 9.
        gloria: 'propia',
        weight: 11,
        params: {
            senal: 'El fondo del rival, que se corrió para un lado',
            desvioMax: 0.6,
            bordes: ['Corta y al medio', 'Larga y afuera'],
            zona: 'Donde llega tu ala',
            sweepMs: 1400,
        },
        copy: {
            title: 'Box kick',
            brief: 'Salís del ruck de espaldas y pateás por encima. La pelota tiene que caer donde tu ala llegue y donde el fullback rival no esté, y esos dos lugares casi nunca son el mismo.',
            cta: 'Tocá para patear',
            outcome: {
                clavado: 'La colgaste justo y tu ala la bajó en el aire. Pelota recuperada a cuarenta metros de donde estabas.',
                logrado: 'Cayó donde tenía que caer y el fondo rival la levantó bajo presión. Territorio ganado.',
                tibio: 'Salió corta y la levantaron cómodos. No perdiste nada pero tampoco ganaste.',
                errado: 'Se te fue al fondo y la devolvieron con todo el campo por delante. Contraataque.',
            },
            result: {
                clavado: 'Pelota recuperada',
                logrado: 'Territorio ganado',
                tibio: 'Kick sin premio',
                errado: 'Contraataque en contra',
            },
        },
    },

    {
        kind: 'd9-ruck1s',
        shirt: 9,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            // Vestigial: la pantalla de `lectura` ya no cuenta para atrás. Ver
            // `LecturaSetup.segundos`.
            segundos: 2,
            opciones: [
                { label: 'Pasarla', hint: 'Lo de siempre. Nunca está mal del todo.' },
                { label: 'Correrla vos', hint: 'Si quedó un hueco al lado del ruck es try.' },
                { label: 'Patear por arriba', hint: 'Si subieron todos, la pelota queda atrás de ellos.' },
            ],
            senas: [
                {
                    label: 'El defensor del costado del ruck se metió a limpiar',
                    detalle: 'Quedó un hueco de dos metros pegado a la pelota.',
                    mejor: 1,
                    segunda: 0,
                },
                {
                    label: 'La línea del rival subió entera y muy rápido',
                    detalle: 'Atrás de ellos no quedó nadie.',
                    mejor: 2,
                    segunda: 0,
                },
                {
                    label: 'Tenés al 10 pidiendo con la línea armada',
                    detalle: 'Tres contra dos del lado abierto.',
                    mejor: 0,
                    segunda: 1,
                },
            ],
        },
        copy: {
            title: 'Ruck en un segundo',
            brief: 'La pelota está lista y no hay tiempo de mirar dos veces. Lo que se ve en el primer vistazo es todo lo que vas a ver.',
            cta: 'Decidí ya',
            outcome: {
                clavado: 'La viste en el primer vistazo y la jugaste antes de que se cerrara. La defensa quedó parada.',
                logrado: 'Elegiste bien aunque tardaste un tiempo de más. Sirvió igual.',
                tibio: 'Hiciste lo segundo mejor y el ataque siguió sin ganar nada.',
                errado: 'Dudaste, y cuando decidiste el hueco ya no estaba. Te comieron con la pelota.',
            },
            result: {
                clavado: 'Jugada de primera',
                logrado: 'Buena salida',
                tibio: 'Sin ventaja',
                errado: 'Pelota perdida',
            },
        },
    },

    {
        kind: 'd9-forward',
        shirt: 9,
        mechanic: 'punto',
        attr: 'liderazgo',
        stake: 'chica',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 8,
        params: {
            lugares: ['Al 1, que llegó primero', 'Al 4, que viene lanzado', 'Al 8, que está fresco', 'Al 6, que ya hizo tres'],
            escena: 'Tres forwards esperando que les digas quién la lleva',
            segundos: 4,
        },
        copy: {
            title: 'Leer al forward',
            brief: 'El 9 no juega: manda. Tres delanteros esperan la orden y uno solo está en condiciones de hacer los metros. Los otros dos ya corrieron demasiado.',
            cta: 'Elegí quién la lleva',
            outcome: {
                clavado: 'Le diste al que estaba entero y se llevó tres puestos. Diez metros en una fase.',
                logrado: 'Eligió bien y ganó la línea de ventaja.',
                tibio: 'Le diste al que ya venía cansado. Hizo lo que pudo.',
                errado: 'Se la diste al que estaba fundido y lo tumbaron para atrás. Pelota lenta.',
            },
            result: {
                clavado: 'Fase ganada',
                logrado: 'Línea de ventaja',
                tibio: 'Sin avance',
                errado: 'Pelota lenta',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  10 · APERTURA — el que decide
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd10-espacio',
        shirt: 10,
        mechanic: 'memoria',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            simbolos: ['◄', '▲', '►', '▼'],
            largo: 4,
            showBase: 700,
            escena: 'La defensa acomodándose antes de que te llegue la pelota',
        },
        copy: {
            title: 'Encontrar el espacio',
            brief: 'Mientras la pelota viaja hacia vos, la defensa se mueve. Cuando te llega ya no la podés mirar: hay que jugar con la foto que quedó en la cabeza.',
            cta: 'Repetí lo que viste',
            outcome: {
                clavado: 'Tenías el dibujo entero en la cabeza y jugaste al hueco sin levantar la vista. Quiebre limpio.',
                logrado: 'Te acordaste de casi todo y encontraste el lado bueno.',
                tibio: 'Te quedaste con la mitad del cuadro y jugaste a lo seguro.',
                errado: 'Jugaste hacia donde ya no había nadie tuyo. La perdiste en el pase.',
            },
            result: {
                clavado: 'Quiebre',
                logrado: 'Buena decisión',
                tibio: 'Jugada segura',
                errado: 'Pelota perdida',
            },
        },
    },

    // Los palos: la patada que decide, con su viento propio y su tolerancia
    // derivada de la pegada. Es el minijuego de puntería del juego.
    {
        kind: 'd10-patada',
        shirt: 10,
        legacyOf: 'palos',
        copy: { title: 'Los palos' },
    },

    {
        kind: 'd10-linea',
        shirt: 10,
        mechanic: 'lectura',
        attr: 'quiebre',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Correr al hueco', hint: 'Si está, es quiebre. Si no, te comen.' },
                { label: 'Pasar al 12', hint: 'Lo dejás con el trabajo. Seguro.' },
                { label: 'Patear por encima', hint: 'Territorio, pero entregás la pelota.' },
            ],
            senas: [
                {
                    label: 'El 13 rival subió más rápido que sus compañeros',
                    detalle: 'Quedó un intervalo entre él y el 12.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'La línea del rival subió pareja y con las manos arriba',
                    detalle: 'No hay hueco y te vienen a comer.',
                    mejor: 1,
                    segunda: 2,
                },
                {
                    label: 'Los dos wings rivales se metieron para adentro',
                    detalle: 'Los espacios de afuera quedaron sin nadie.',
                    mejor: 2,
                    segunda: 1,
                },
            ],
        },
        copy: {
            title: 'El 10 contra la línea',
            brief: 'Tenés la pelota y tres defensores subiendo. La ventana cambia mientras la mirás: lo que era un hueco hace un segundo ahora es un hombro.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Metiste la nariz por el intervalo y saliste del otro lado con la defensa partida.',
                logrado: 'Elegiste bien y el ataque quedó adelantado.',
                tibio: 'Hiciste lo segundo mejor y no se ganó terreno.',
                errado: 'Elegiste lo que no era y te comieron con la pelota. Turnover en el medio.',
            },
            result: {
                clavado: 'Quiebre',
                logrado: 'Buena decisión',
                tibio: 'Sin ventaja',
                errado: 'Turnover',
            },
        },
    },

    {
        kind: 'd10-drop',
        shirt: 10,
        mechanic: 'ventana',
        attr: 'pegada',
        stake: 'grande',
        risk: 'ninguno',
        // Los puntos son la planilla del apertura.
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'El pique',
            bordes: ['Antes del pique', 'Después del pique'],
            vueltas: 2,
            // El reloj más corto de todos los verbos de ventana, y es el punto:
            // el drop se le pega a la pelota en el instante en que toca el piso.
            sweepMs: 760,
            anchoBase: 0.07,
        },
        copy: {
            title: 'El drop',
            brief: 'Último minuto, empatados, y no hay tiempo para armar otra fase. La pelota tiene que picar y salir en el mismo movimiento. El instante es uno.',
            cta: 'Tocá para pegarle',
            outcome: {
                clavado: 'Le pegaste en el pique exacto y salió derecha. Tres puntos y se acabó el partido.',
                logrado: 'Salió un poco baja pero pasó. Tres puntos.',
                tibio: 'Le pegaste tarde y se fue apenas ancha. Quedó la pelota del rival.',
                errado: 'Le pegaste antes del pique y salió mordida. Se acabó la última chance.',
            },
            result: {
                clavado: 'Drop decisivo',
                logrado: 'Drop convertido',
                tibio: 'Drop errado',
                errado: 'Drop mordido',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  11 · WING IZQUIERDO — el que espera afuera
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd11-punta',
        shirt: 11,
        mechanic: 'sosten',
        attr: 'velocidad',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            tics: 8,
            ticMs: 460,
            deriva: 0.85,
            bordes: ['Te metés adentro', 'Te vas al lateral'],
            zona: 'La línea de carrera',
        },
        copy: {
            title: 'La punta',
            brief: 'La pelota viene pasando de mano en mano y todavía no es tuya. Lo único que tenés que hacer es llegar corriendo por el carril justo: adentro te tapan y afuera te comés la cal.',
            cta: 'Sostené la carrera',
            outcome: {
                clavado: 'Llegaste lanzado, por afuera del último y con dos metros de cancha. La pelota te encontró en velocidad.',
                logrado: 'Llegaste bien parado y recibiste sin frenar.',
                tibio: 'Te metiste demasiado adentro y la recibiste parado. Te tacklearon de una.',
                errado: 'Te fuiste al lateral y cuando llegó la pelota ya no tenías cancha. Salió afuera.',
            },
            result: {
                clavado: 'Recibida en velocidad',
                logrado: 'Bien recibida',
                tibio: 'Recibida parado',
                errado: 'Pelota afuera',
            },
        },
    },

    {
        kind: 'd11-dosxuno',
        shirt: 11,
        mechanic: 'ventana',
        attr: 'vision',
        stake: 'grande',
        risk: 'ninguno',
        // Los tries son la planilla del wing.
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'El pase',
            bordes: ['Muy pronto', 'Muy tarde'],
            vueltas: 2,
            sweepMs: 1050,
            anchoBase: 0.11,
        },
        copy: {
            title: 'Dos contra uno',
            brief: 'Vos y el centro contra un defensor, y falta poco para la línea. Pasarla antes es dejarlo libre para que salga al otro. Pasarla después es pasarla desde el piso.',
            cta: 'Tocá para pasar',
            outcome: {
                clavado: 'Lo fijaste hasta el último paso y la soltaste cuando ya no podía volver. Try abajo de los palos.',
                logrado: 'Pase a tiempo y el compañero apoyó en la esquina.',
                tibio: 'La soltaste temprano y el defensor llegó a salir. Lo bajaron sobre la línea.',
                errado: 'Te la guardaste de más y te tacklearon con el compañero libre al lado. Se perdió el try.',
            },
            result: {
                clavado: 'Try',
                logrado: 'Try en la esquina',
                tibio: 'Frenado en la línea',
                errado: 'Try perdido',
            },
        },
    },

    {
        kind: 'd11-finalizacion',
        shirt: 11,
        mechanic: 'punto',
        attr: 'manos',
        stake: 'grande',
        risk: 'cuerpo',
        gloria: 'propia',
        weight: 11,
        params: {
            lugares: ['En la esquina', 'A dos metros del banderín', 'A mitad del ingoal', 'Buscando los palos'],
            escena: 'Entrás al ingoal con el fullback cerrándote y el ala persiguiendo',
            segundos: 3,
        },
        copy: {
            title: 'Finalización',
            brief: 'Ya entraste al ingoal pero todavía no apoyaste, y hay dos que llegan. Apoyar rápido es apoyar lejos de los palos; buscar los palos es darles un metro más.',
            cta: 'Elegí dónde apoyar',
            outcome: {
                clavado: 'Aguantaste dos metros más y apoyaste abajo de los palos. Try convertido sin discusión.',
                logrado: 'Apoyaste antes de que llegaran. Try en la esquina.',
                tibio: 'Te empujaron al lateral y apoyaste medio afuera. El TMO lo miró tres veces y lo dio.',
                errado: 'Quisiste buscar los palos de más y te alcanzaron. Te sacaron la pelota sobre la línea.',
            },
            result: {
                clavado: 'Try abajo de los palos',
                logrado: 'Try',
                tibio: 'Try al límite',
                errado: 'Try perdido',
            },
        },
    },

    {
        kind: 'd11-esquina',
        shirt: 11,
        mechanic: 'lectura',
        attr: 'defensa',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Subir sobre el hombre', hint: 'Le tapás el espacio. Si patea, quedás pasado.' },
                { label: 'Quedarte en el carril', hint: 'Cubrís el pase de afuera y nada más.' },
                { label: 'Retroceder al fondo', hint: 'Cubrís la patada. El de afuera queda solo.' },
            ],
            senas: [
                {
                    label: 'El 10 rival levantó la cabeza y acomodó el pie',
                    detalle: 'La va a colgar al fondo de tu esquina.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Tienen tres contra dos y el de afuera ya está corriendo',
                    detalle: 'Si te quedás, te desbordan por el lateral.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'La pelota va lenta y su línea está toda parada',
                    detalle: 'No hay velocidad para desbordarte.',
                    mejor: 1,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Defender la esquina',
            brief: 'Un wing defiende una franja de veinte metros y no puede estar en los dos lados. Subir a tapar o quedarse a cubrir es la única decisión, y se toma antes de que la pelota salga.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Leíste lo que iban a hacer y estabas ahí antes que la pelota. Se acabó el ataque.',
                logrado: 'Elegiste bien y no pasaron por tu lado.',
                tibio: 'Te ganaron unos metros pero no llegaron a la línea.',
                errado: 'Elegiste lo otro y te desbordaron por afuera. Try en la esquina.',
            },
            result: {
                clavado: 'Ataque cortado',
                logrado: 'Esquina cerrada',
                tibio: 'Metros cedidos',
                errado: 'Try en contra',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  12 · PRIMER CENTRO — el que fija
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd12-fijar',
        shirt: 12,
        mechanic: 'ventana',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            zona: 'El hombro del defensor',
            bordes: ['Le corrés lejos', 'Ya te agarró'],
            vueltas: 2,
            sweepMs: 1000,
            anchoBase: 0.11,
        },
        copy: {
            title: 'Fijar al defensor',
            brief: 'El trabajo del 12 no se ve: correr derecho al hombro del que marca al de al lado, para que se quede con vos y le deje el hueco a otro.',
            cta: 'Tocá para fijar',
            outcome: {
                clavado: 'Le corriste justo al hombro y se quedó con vos. El 13 pasó por el hueco sin que lo tocaran.',
                logrado: 'Lo fijaste bien y el de afuera recibió con ventaja.',
                tibio: 'Le corriste medio lejos y llegó a salir. El pase igual llegó.',
                errado: 'Le pasaste por delante sin fijarlo y salió al de afuera. Lo agarraron con la pelota en el aire.',
            },
            result: {
                clavado: 'Hueco abierto',
                logrado: 'Defensor fijado',
                tibio: 'Fijada floja',
                errado: 'Jugada muerta',
            },
        },
    },

    {
        kind: 'd12-ventaja',
        shirt: 12,
        mechanic: 'punto',
        attr: 'quiebre',
        stake: 'media',
        risk: 'cuerpo',
        // Los quiebres de línea son la planilla del centro.
        gloria: 'propia',
        weight: 10,
        params: {
            lugares: ['Al intervalo de adentro', 'Al hombro de adentro', 'De frente al pecho', 'Al hombro de afuera', 'Al intervalo de afuera'],
            escena: 'La defensa subiendo, y no todos suben al mismo tiempo',
            segundos: 3,
        },
        copy: {
            title: 'Línea de ventaja',
            brief: 'La pelota es tuya y hay que hacer metros. La defensa nunca sube pareja: siempre hay uno que llegó un paso más adelante que su compañero y ahí queda una costura.',
            cta: 'Elegí la línea',
            outcome: {
                clavado: 'Entraste por la costura y saliste del otro lado. Quiebre de línea.',
                logrado: 'Ganaste la ventaja y presentaste rápido.',
                tibio: 'Fuiste de frente y te frenaron en el punto de encuentro.',
                errado: 'Entraste donde estaban dobles y te tumbaron para atrás. Pelota lenta.',
            },
            result: {
                clavado: 'Quiebre de línea',
                logrado: 'Línea de ventaja',
                tibio: 'Sin avance',
                errado: 'Tackle dominante en contra',
            },
        },
    },

    {
        kind: 'd12-canal',
        shirt: 12,
        mechanic: 'lectura',
        attr: 'tackle',
        stake: 'media',
        // El choque en el canal del 12 es el que más HIA produce en la línea.
        risk: 'cabeza',
        gloria: 'ajena',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Salir al que tenés enfrente', hint: 'Lo tuyo es lo tuyo. Si es un señuelo, quedaste adentro.' },
                { label: 'Salir al de afuera', hint: 'Tapás el pase. Dejás un hueco adentro.' },
                { label: 'Esperar y no salir', hint: 'No te pasan por el hueco. Tampoco los frenás.' },
            ],
            senas: [
                {
                    label: 'El 12 rival viene derecho y con la pelota en las dos manos',
                    detalle: 'La va a llevar él.',
                    mejor: 0,
                    segunda: 2,
                },
                {
                    label: 'El 12 rival cruzó su carrera hacia adentro',
                    detalle: 'Es señuelo. La pelota va a pasar por arriba de él.',
                    mejor: 1,
                    segunda: 2,
                },
                {
                    label: 'Vienen con tres opciones y todavía no eligieron',
                    detalle: 'Si salís antes de tiempo, elegís por ellos.',
                    mejor: 2,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Tackle de canal',
            brief: 'El canal del 12 es donde el rival prueba primero. Vienen tres corriendo y solo uno lleva la pelota, y el que la lleva no siempre es el que la tiene.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Saliste sobre el que la llevaba y lo tumbaste para atrás. Turnover.',
                logrado: 'Elegiste bien y el ataque murió en tu canal.',
                tibio: 'Te comieron unos metros pero no se rompió la línea.',
                errado: 'Te fuiste al señuelo y la pelota pasó por el hueco que dejaste. Y encima quedaste sentido.',
            },
            result: {
                clavado: 'Turnover',
                logrado: 'Canal cerrado',
                tibio: 'Metros cedidos',
                errado: 'Línea rota',
            },
        },
    },

    {
        kind: 'd12-descarga',
        shirt: 12,
        mechanic: 'secuencia',
        attr: 'manos',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 9,
        params: {
            pasos: ['Entrar al contacto', 'Liberar el brazo', 'Descargar', 'Presentar'],
            pasoMs: 700,
            ventanaBase: 200,
        },
        copy: {
            title: 'Pase después del contacto',
            brief: 'Ya te agarraron y todavía tenés la pelota. Entre el contacto y el piso hay cuatro tiempos, y el pase que sale del segundo vale una jugada entera.',
            cta: 'Seguí los tiempos',
            outcome: {
                clavado: 'Liberaste el brazo en el aire y descargaste al que venía lanzado. La defensa quedó atrás de la pelota.',
                logrado: 'Descargaste antes de caer y el ataque siguió de largo.',
                tibio: 'No pudiste descargar pero presentaste bien. Pelota lenta y limpia.',
                errado: 'Quisiste descargar desde el piso y salió para adelante. Knock on.',
            },
            result: {
                clavado: 'Descarga limpia',
                logrado: 'Continuidad',
                tibio: 'Pelota lenta',
                errado: 'Knock on',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  13 · SEGUNDO CENTRO — el que lee el intervalo
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd13-intervalo',
        shirt: 13,
        mechanic: 'ventana',
        attr: 'quiebre',
        stake: 'grande',
        risk: 'ninguno',
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'El hueco abierto',
            bordes: ['Todavía no se abrió', 'Ya se cerró'],
            vueltas: 3,
            sweepMs: 950,
            anchoBase: 0.09,
        },
        copy: {
            title: 'Leer el intervalo',
            brief: 'La defensa se abre y se cierra como una respiración. El hueco existe durante media respiración y después se cierra encima del que lo buscó tarde.',
            cta: 'Tocá para entrar',
            outcome: {
                clavado: 'Entraste en el momento exacto en que se abrió y saliste limpio del otro lado. Nadie te tocó.',
                logrado: 'Encontraste el intervalo y rompiste la primera línea.',
                tibio: 'Entraste cuando ya se estaba cerrando y te frenaron dos.',
                errado: 'Fuiste al hueco cuando ya no había hueco. Te comieron entre tres.',
            },
            result: {
                clavado: 'Quiebre limpio',
                logrado: 'Quiebre de línea',
                tibio: 'Sin avance',
                errado: 'Tackle dominante en contra',
            },
        },
    },

    {
        kind: 'd13-dosxdos',
        shirt: 13,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Fijar y pasar', hint: 'Lo clásico. Depende de que el de afuera esté.' },
                { label: 'Atacar el hombro', hint: 'Vos contra él. Si le ganás, es quiebre.' },
                { label: 'Pasar de una', hint: 'Rápido y sin fijar. Si su wing subió, es try.' },
            ],
            senas: [
                {
                    label: 'El wing rival subió a la par de su centro',
                    detalle: 'Se pisaron los carriles y afuera no queda nadie.',
                    mejor: 2,
                    segunda: 0,
                },
                {
                    label: 'El 13 rival te espera parado y su wing está bien abierto',
                    detalle: 'Los dos cubren lo suyo y no se van a mover.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'El 13 rival subió disparado y dejó el hombro de adentro',
                    detalle: 'Viene desequilibrado.',
                    mejor: 1,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Dos contra dos',
            brief: 'Vos y el wing contra el centro y el wing de ellos. No hay superioridad numérica: la ventaja hay que fabricarla eligiendo lo que ellos no esperan.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Elegiste lo único que rompía y el wing quedó solo contra la cancha. Try en la esquina.',
                logrado: 'Elegiste bien y salieron adelantados de la jugada.',
                tibio: 'No se rompió nada pero tampoco se perdió la pelota.',
                errado: 'Hiciste lo que estaban esperando y los agarraron a los dos juntos. Turnover.',
            },
            result: {
                clavado: 'Try',
                logrado: 'Ventaja ganada',
                tibio: 'Sin ventaja',
                errado: 'Turnover',
            },
        },
    },

    {
        kind: 'd13-exterior',
        shirt: 13,
        mechanic: 'sosten',
        attr: 'defensa',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            tics: 8,
            ticMs: 500,
            deriva: 0.9,
            bordes: ['Te comés al de adentro', 'Te vas con el de afuera'],
            zona: 'La distancia con tu wing',
        },
        copy: {
            title: 'Defensa exterior',
            brief: 'El 13 y el wing defienden juntos o no defienden. Toda la jugada es mantener la distancia justa con el de al lado mientras los dos corren para adelante.',
            cta: 'Sostené la distancia',
            outcome: {
                clavado: 'La línea se movió como una sola pieza. No hubo un metro de hueco en todo el ataque.',
                logrado: 'Mantuviste la distancia y el ataque murió afuera.',
                tibio: 'Se abrió un hueco una vez y lo taparon entre dos.',
                errado: 'Te fuiste con el de afuera y por el hueco de adentro entró el 12. Try.',
            },
            result: {
                clavado: 'Línea sólida',
                logrado: 'Ataque frenado',
                tibio: 'Hueco tapado',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd13-contra',
        shirt: 13,
        mechanic: 'punto',
        attr: 'gambeta',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'propia',
        weight: 9,
        params: {
            lugares: ['Por el lateral cerrado', 'Entre el 10 y el 12', 'Por el medio', 'Entre el 13 y el wing', 'Por el lateral abierto'],
            escena: 'Levantaste una pelota suelta y la defensa está desarmada',
            segundos: 3,
        },
        copy: {
            title: 'Contraataque',
            brief: 'Quedó una pelota suelta y la levantaste vos. Enfrente hay ocho jugadores parados en cualquier lado y uno solo de los huecos lleva a la línea.',
            cta: 'Elegí por dónde salir',
            outcome: {
                clavado: 'Saliste por donde no había nadie y cuando reaccionaron ya estabas en su veintidós.',
                logrado: 'Encontraste el lado bueno y ganaste treinta metros.',
                tibio: 'Corriste hacia donde se estaban rearmando. Ganaste unos metros y nada más.',
                errado: 'Fuiste justo hacia el que ya estaba parado y te tumbó. Pelota perdida en tu campo.',
            },
            result: {
                clavado: 'Contraataque',
                logrado: 'Metros ganados',
                tibio: 'Sin ventaja',
                errado: 'Pelota perdida',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  14 · WING DERECHO — el que corre por afuera
    // ═══════════════════════════════════════════════════════════════════════

    // La banda: la corrida por el lateral con los defensores saliendo al cruce,
    // escrita a mano y con su vocabulario propio de amague, ritmo y atropellar.
    {
        kind: 'd14-carrera',
        shirt: 14,
        legacyOf: 'banda',
        copy: { title: 'La banda' },
    },

    {
        kind: 'd14-recepcion',
        shirt: 14,
        mechanic: 'ventana',
        attr: 'juegoAereo',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 10,
        params: {
            zona: 'La pelota en las manos',
            bordes: ['Saltaste antes', 'Te llegó encima'],
            vueltas: 2,
            sweepMs: 980,
            anchoBase: 0.1,
        },
        copy: {
            title: 'Recepción bajo presión',
            brief: 'La colgaron para tu esquina y el que la persigue llega al mismo tiempo que la pelota. Hay un instante en el que estás arriba y él todavía no.',
            cta: 'Tocá para saltar',
            outcome: {
                clavado: 'Saltaste primero, la agarraste en el aire y caíste con ella. El que perseguía se comió el aire.',
                logrado: 'La bajaste limpio y aguantaste el golpe. Pelota propia.',
                tibio: 'La agarraste al segundo intento, en el piso y con dos encima. Salió lenta.',
                errado: 'Te llegó encima antes que la pelota y se te cayó adelante. Knock on en tu propia veintidós.',
            },
            result: {
                clavado: 'Pelota ganada en el aire',
                logrado: 'Recepción limpia',
                tibio: 'Pelota peleada',
                errado: 'Knock on',
            },
        },
    },

    {
        kind: 'd14-sprint',
        shirt: 14,
        mechanic: 'sosten',
        attr: 'velocidad',
        stake: 'grande',
        risk: 'ninguno',
        // Los metros ganados son la métrica secundaria del wing.
        gloria: 'propia',
        weight: 11,
        params: {
            tics: 10,
            ticMs: 440,
            deriva: 0.95,
            bordes: ['Te frenás', 'Te fundís'],
            zona: 'El ritmo de carrera',
        },
        copy: {
            title: 'El sprint final',
            brief: 'Sesenta metros por delante y el fullback persiguiendo desde atrás. Gastar todo al principio es llegar fundido a los últimos veinte, que es justo donde te alcanza.',
            cta: 'Administrá la carrera',
            outcome: {
                clavado: 'Dosificaste los sesenta metros y en los últimos veinte todavía tenías. Try sin que te tocaran.',
                logrado: 'Llegaste con lo justo y apoyaste antes de que te alcanzara.',
                tibio: 'Te fundiste sobre el final y te bajaron a cinco metros de la línea.',
                errado: 'Saliste a fondo y a los cuarenta metros no tenías más. Te alcanzó y te tiró al lateral.',
            },
            result: {
                clavado: 'Try',
                logrado: 'Try al límite',
                tibio: 'Alcanzado en la línea',
                errado: 'Alcanzado',
            },
        },
    },

    {
        kind: 'd14-esquina',
        shirt: 14,
        mechanic: 'punto',
        attr: 'defensa',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            lugares: ['Sobre el portador', 'En el medio de los dos', 'Sobre el receptor', 'Pegado al lateral'],
            escena: 'Vienen dos contra vos solo y falta poco para el banderín',
            segundos: 3,
        },
        copy: {
            title: 'Cerrar la esquina',
            brief: 'Dos contra uno y el uno sos vos. No se pueden cubrir los dos, así que la única pregunta es cuál de los dos errores cuesta menos.',
            cta: 'Elegí a quién marcás',
            outcome: {
                clavado: 'Te paraste donde tenías que estar y los obligaste al pase malo. La pelota se fue afuera.',
                logrado: 'Marcaste al que había que marcar y lo sacaste al lateral.',
                tibio: 'Los dudaste y llegaron a la línea, pero apoyaron en la esquina y erraron la conversión.',
                errado: 'Saliste sobre el que no era y el pase salió limpio. Try abajo de los palos.',
            },
            result: {
                clavado: 'Ataque cortado',
                logrado: 'Sacado al lateral',
                tibio: 'Try en la esquina',
                errado: 'Try en contra',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  15 · FULLBACK — el último
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd15-cielo',
        shirt: 15,
        mechanic: 'punto',
        attr: 'juegoAereo',
        stake: 'grande',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 11,
        params: {
            lugares: ['Diez metros atrás', 'Cinco atrás', 'Donde estás', 'Cinco adelante', 'Diez adelante'],
            escena: 'La pelota va subiendo y todavía no se sabe dónde cae',
            segundos: 4,
        },
        copy: {
            title: 'La pelota del cielo',
            brief: 'Un up and under a cuarenta metros de altura. Mientras sube hay que calcular dónde cae, y cuando empieza a bajar ya es tarde para moverse.',
            cta: 'Elegí dónde esperarla',
            outcome: {
                clavado: 'Calculaste el punto exacto, la esperaste quieto y la bajaste con la marca del que la perseguía encima. Pelota tuya.',
                logrado: 'La leíste bien y la agarraste sin problema.',
                tibio: 'Tuviste que correr para atrás y la agarraste mal parado. Salió un kick apurado.',
                errado: 'Te quedaste corto y la pelota picó adelante tuyo. La ganaron ellos a cinco metros de tu ingoal.',
            },
            result: {
                clavado: 'Pelota ganada en el aire',
                logrado: 'Recepción limpia',
                tibio: 'Salida apurada',
                errado: 'Pelota perdida',
            },
        },
    },

    {
        kind: 'd15-ultimo',
        shirt: 15,
        mechanic: 'punteria',
        attr: 'tackle',
        stake: 'grande',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 11,
        params: {
            senal: 'La velocidad y el pie de apoyo del que viene',
            desvioMax: 0.5,
            bordes: ['Le apuntás por dentro', 'Le apuntás por fuera'],
            zona: 'El punto donde lo cruzás',
            sweepMs: 1150,
        },
        copy: {
            title: 'Último hombre',
            brief: 'Rompió la línea y atrás tuyo no hay nadie. Salir de frente es dejarle los dos lados; el ángulo bueno es el que le va cerrando la cancha mientras corre.',
            cta: 'Tocá para elegir el ángulo',
            outcome: {
                clavado: 'Le cerraste la cancha hasta el lateral y lo bajaste sin que pudiera pasar. Try salvado.',
                logrado: 'Le saliste bien y lo tumbaste antes de la línea.',
                tibio: 'Lo rozaste y lo obligaste a pasarla apurado. El pase se fue adelante.',
                errado: 'Saliste de frente y te dejó parado con un cambio de pie. Try abajo de los palos.',
            },
            result: {
                clavado: 'Try salvado',
                logrado: 'Tackle salvador',
                tibio: 'Knock on forzado',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd15-veintidos',
        shirt: 15,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'propia',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Salir corriendo', hint: 'Si están desarmados, es media cancha.' },
                { label: 'Buscar al wing', hint: 'Lo mandás a él por afuera. Depende de que llegue.' },
                { label: 'Devolver de primera', hint: 'Territorio seguro. Se entrega la pelota.' },
            ],
            senas: [
                {
                    label: 'Subieron todos a perseguir y quedaron desparramados',
                    detalle: 'No hay una línea armada enfrente tuyo.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'Su línea bajó ordenada y te espera armada',
                    detalle: 'Salir de acá es correr contra una pared.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Tu wing viene lanzado por afuera y del otro lado no hay nadie',
                    detalle: 'Le queda toda la banda libre.',
                    mejor: 1,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Contraataque desde el 22',
            brief: 'Te pusieron la pelota adentro de tus veintidós, que es donde el partido se gana o se entrega. Salir y salir mal es el try en contra más barato del rugby.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Saliste jugando por donde no había nadie y la jugada terminó en su veintidós. De defender a atacar en diez segundos.',
                logrado: 'Elegiste bien y salieron limpios de la zona.',
                tibio: 'Saliste como se pudo. Territorio entregado sin daño.',
                errado: 'Quisiste jugarla donde te esperaban y la perdiste adentro de tus veintidós. Try en contra.',
            },
            result: {
                clavado: 'Contraataque',
                logrado: 'Salida limpia',
                tibio: 'Territorio entregado',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd15-organizar',
        shirt: 15,
        mechanic: 'memoria',
        attr: 'liderazgo',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            simbolos: ['◄', '▲', '►', '▼', '●'],
            largo: 4,
            showBase: 780,
            escena: 'Cinco atacantes acomodándose antes de la última fase',
        },
        copy: {
            title: 'Organizar la última línea',
            brief: 'Desde el fondo se ve todo, y el que ve todo tiene que hablar. Cinco atacantes se acomodan y hay que acordarse de cómo quedaron para mandar a los tuyos adonde va a pasar.',
            cta: 'Repetí el dibujo',
            outcome: {
                clavado: 'Los acomodaste a todos antes de que llegara la pelota. El ataque murió contra una línea perfecta.',
                logrado: 'Mandaste bien a casi todos y taparon lo importante.',
                tibio: 'Se te escapó un carril y por ahí ganaron algunos metros.',
                errado: 'Los mandaste al lado equivocado y quedó media cancha libre. Try en contra.',
            },
            result: {
                clavado: 'Línea perfecta',
                logrado: 'Defensa ordenada',
                tibio: 'Metros cedidos',
                errado: 'Try en contra',
            },
        },
    },
];
