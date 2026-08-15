// EL CAPITÁN — los minijuegos del PACK: dorsales 1 al 8.
//
// Cuatro por dorsal, y el 1 y el 3 tienen jugadas distintas aunque compartan
// familia, planilla y curva de edad. Ese es el eje que el catálogo viejo no
// tenía: `MomentDef.families` habla de las ocho familias, y para las ocho
// familias un pilar izquierdo y uno derecho son el mismo jugador. No lo son —el
// izquierdo empuja contra el hombro que se le va y el derecho sostiene la
// columna entera— y ahora el juego lo puede decir.
//
// ── Cómo se lee una entrada ──
// Nada de esto es código. Cada objeto declara QUÉ VERBO se juega, QUÉ ATRIBUTO
// abre el margen, CUÁNTO PESA, QUÉ PASA SI SALE MAL y DÓNDE SE COBRA. La
// magnitud la pone `pay.ts` y la mecánica `engine/mechanics/`. Si para agregar
// el número sesenta y seis hiciera falta tocar cualquiera de los dos, lo que
// falta es un verbo nuevo — y esa conversación no se saltea con un `if`.
//
// ── Los tres que ya estaban ──
// El código (2), el ancla (3) y el jackal (7) son Momentos escritos a mano y
// siguen siendo los mejores del juego. Ocupan su casilla como `legacyOf` y no
// se tocan: reescribirlos como spec sería tirar el minijuego más probado de
// cada familia para ganar uniformidad, y encima movería el digest congelado por
// plomería.

import type { MinigameSlot } from '../../types/minigame.ts';

export const PACK_MINIGAMES: readonly MinigameSlot[] = [
    // ═══════════════════════════════════════════════════════════════════════
    //  1 · PILAR IZQUIERDO — el que entra
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd1-angulo',
        shirt: 1,
        mechanic: 'ventana',
        attr: 'empuje',
        stake: 'media',
        risk: 'cuerpo',
        // Un scrum bien entrado termina en penal, y el penal de scrum ES la
        // planilla del pilar. Cobrarlo también en `statBoost` sería contarlo dos
        // veces (ver `pay.ts`).
        gloria: 'propia',
        weight: 10,
        params: {
            zona: 'Entrada',
            bordes: ['Temprano', 'Tarde'],
            vueltas: 3,
            sweepMs: 1250,
            anchoBase: 0.13,
        },
        copy: {
            title: 'Ángulo de entrada',
            brief: 'El referee canta la secuencia y el scrum se arma. Entrar antes es adelantarse y entrar después es comerse el hombro del otro. La ventana es una sola.',
            cta: 'Tocá para entrar',
            outcome: {
                clavado: 'Entraste clavado en el tiempo y el scrum del rival se levantó. Penal para tu lado.',
                logrado: 'Entraste bien y ganaste el metro. El scrum quedó de tu lado.',
                tibio: 'Llegaste con medio hombro y el scrum se acomodó como pudo. Salió limpia y nada más.',
                errado: 'Entraste cruzado y el referee te marcó a vos. Penal en contra.',
            },
            result: {
                clavado: 'Penal de scrum',
                logrado: 'Scrum dominado',
                tibio: 'Scrum parejo',
                errado: 'Penal en contra',
            },
        },
    },

    {
        kind: 'd1-hombros',
        shirt: 1,
        mechanic: 'sosten',
        attr: 'empuje',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'propia',
        weight: 9,
        params: {
            tics: 8,
            ticMs: 520,
            deriva: 0.85,
            bordes: ['Se te va adentro', 'Se te va afuera'],
            zona: 'Hombro contra hombro',
        },
        copy: {
            title: 'La batalla de hombros',
            brief: 'El pilar de enfrente busca el ángulo. Cada vez que empuja te corre el hombro para un lado, y el scrum se sostiene si vos volvés al centro antes de que se acumule.',
            cta: 'Corregí el hombro',
            outcome: {
                clavado: 'No te movió ni un centímetro en ocho embestidas. El pilar de enfrente pidió el cambio.',
                logrado: 'Te movió un par de veces y volviste solo. El scrum aguantó los ochenta minutos.',
                tibio: 'Te fue ganando el ángulo de a poco. Terminaste el partido con el hombro caliente.',
                errado: 'Te dio vuelta el hombro y el scrum se cayó dos veces. La segunda te la cobraron a vos.',
            },
            result: {
                clavado: 'Scrum inamovible',
                logrado: 'Scrum sostenido',
                tibio: 'Scrum cedido',
                errado: 'Scrum quebrado',
            },
        },
    },

    {
        kind: 'd1-limpiar',
        shirt: 1,
        mechanic: 'punto',
        attr: 'choque',
        stake: 'chica',
        risk: 'cuerpo',
        // Limpiar un ruck no lo cuenta ninguna planilla del pilar, así que este
        // sí paga en la planilla.
        gloria: 'ajena',
        weight: 8,
        params: {
            lugares: ['Por el lado ciego', 'Sobre el hombro', 'De frente', 'Sobre el otro hombro', 'Por el lado abierto'],
            escena: 'El portador cayó y hay tres rivales encima de la pelota',
            segundos: 4,
        },
        copy: {
            title: 'Limpiar el ruck',
            brief: 'Llegás segundo al breakdown. Hay un lugar por donde el rival está mal parado y todos los demás son un choque de frente que no mueve a nadie.',
            cta: 'Elegí por dónde entrar',
            outcome: {
                clavado: 'Entraste justo donde estaba mal parado y lo sacaste tres metros. Pelota limpia y rápida.',
                logrado: 'Entraste algo cruzado pero lo sacaste igual. La pelota salió jugable.',
                tibio: 'Chocaste de frente y quedaron los dos trabados. La pelota salió lenta.',
                errado: 'Entraste por el lado equivocado y quedaste del otro lado del ruck. Robo del rival.',
            },
            result: {
                clavado: 'Ruck limpiado',
                logrado: 'Ruck asegurado',
                tibio: 'Pelota lenta',
                errado: 'Turnover en contra',
            },
        },
    },

    {
        kind: 'd1-levantar',
        shirt: 1,
        mechanic: 'secuencia',
        attr: 'trabajo',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 7,
        params: {
            pasos: ['Agachar', 'Levantar', 'Sostener', 'Bajar'],
            pasoMs: 850,
            ventanaBase: 220,
        },
        copy: {
            title: 'Levantar al saltador',
            brief: 'En el line-out el pilar levanta y protege. Cuatro tiempos que el saltador no ve y que tienen que salir en orden: si el segundo llega tarde, el salto ya se perdió.',
            cta: 'Seguí los tiempos',
            outcome: {
                clavado: 'Lo pusiste arriba de todo y lo bajaste entero. Line-out ganado sin discusión.',
                logrado: 'Salió un poco corto de altura pero llegó primero a la pelota.',
                tibio: 'Lo levantaste tarde y saltó por su cuenta. Se peleó la pelota en el aire.',
                errado: 'Lo soltaste antes de tiempo y cayó de costado. El referee cobró y quedó la pelota del rival.',
            },
            result: {
                clavado: 'Line-out limpio',
                logrado: 'Line-out ganado',
                tibio: 'Pelota peleada',
                errado: 'Line-out perdido',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  2 · HOOKER — el que lanza
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd2-lanzamiento',
        shirt: 2,
        mechanic: 'punteria',
        attr: 'lanzamiento',
        stake: 'grande',
        risk: 'ninguno',
        // El porcentaje de line-out propio ES la planilla del hooker.
        gloria: 'propia',
        weight: 12,
        params: {
            senal: 'El viento cruzado en la línea de touch',
            desvioMax: 0.5,
            bordes: ['Corto', 'Largo'],
            zona: 'Las manos del saltador',
            sweepMs: 1350,
        },
        copy: {
            title: 'El lanzamiento',
            brief: 'Line-out en cinco metros del rival. El saltador ya está en el aire y el viento de la tribuna corre la pelota. Tirar a las manos es tirar afuera de las manos.',
            cta: 'Tocá para lanzar',
            outcome: {
                clavado: 'La pusiste en las manos, a la altura justa. Maul armado y try en tres fases.',
                logrado: 'Llegó bien y el saltador la bajó sin problema. Pelota propia.',
                tibio: 'Salió pasada de largo y la peleó el fondo del line. Se ganó, pero fea.',
                errado: 'El viento se la llevó y quedó del otro lado. Line-out del rival en tu propia zona.',
            },
            result: {
                clavado: 'Lanzamiento perfecto',
                logrado: 'Line-out ganado',
                tibio: 'Pelota peleada',
                errado: 'Lanzamiento errado',
            },
        },
    },

    {
        kind: 'd2-talonaje',
        shirt: 2,
        mechanic: 'ventana',
        attr: 'trabajo',
        stake: 'media',
        risk: 'cuerpo',
        // El talonaje no lo cuenta la planilla del hooker, que mide line-out y
        // tries de maul.
        gloria: 'ajena',
        weight: 10,
        params: {
            zona: 'Golpe',
            bordes: ['Antes', 'Después'],
            vueltas: 2,
            sweepMs: 980,
            anchoBase: 0.11,
        },
        copy: {
            title: 'El talonaje',
            brief: 'El medio scrum mete la pelota y hay una fracción para tocarla con el pie. Antes es adelantarse, después es que la lleve el hooker de enfrente.',
            cta: 'Tocá para talonar',
            outcome: {
                clavado: 'La sacaste en el primer tiempo y salió por atrás antes de que el rival empujara. Scrum de manual.',
                logrado: 'La sacaste limpia y el 8 la controló en la base.',
                tibio: 'Llegaste tarde al golpe y la pelota se quedó adentro. Scrum trabado y de vuelta.',
                errado: 'Se la llevó el hooker de enfrente. Perdiste tu propio scrum.',
            },
            result: {
                clavado: 'Talonaje limpio',
                logrado: 'Pelota propia',
                tibio: 'Scrum de vuelta',
                errado: 'Scrum perdido',
            },
        },
    },

    // El código de line-out ya está escrito y es el minijuego de memoria del
    // juego. Ocupa la tercera casilla del 2 sin que haya que reescribirlo.
    {
        kind: 'd2-codigo',
        shirt: 2,
        legacyOf: 'codigo',
        copy: { title: 'El código' },
    },

    {
        kind: 'd2-canal',
        shirt: 2,
        mechanic: 'punto',
        attr: 'defensa',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 8,
        params: {
            lugares: ['Pegado al line', 'Primer canal', 'Segundo canal', 'Afuera'],
            escena: 'El line-out terminó y el rival ya está jugando',
            segundos: 3,
        },
        copy: {
            title: 'Defender el canal',
            brief: 'Se acabó el line-out y sos el primero que puede cubrir. El rival ya eligió por dónde viene y vos tenés un segundo para pararte donde va a pasar.',
            cta: 'Elegí el canal',
            outcome: {
                clavado: 'Lo esperaste justo donde venía y lo bajaste antes de la línea de ventaja.',
                logrado: 'Llegaste al canal y lo frenaste con ayuda. Nada de terreno.',
                tibio: 'Te ganó el hombro y avanzó cinco metros antes de que lo agarraran.',
                errado: 'Te paraste donde no era y pasó por el hueco. Quedaste mirándolo de atrás.',
            },
            result: {
                clavado: 'Canal cerrado',
                logrado: 'Avance frenado',
                tibio: 'Metros cedidos',
                errado: 'Quiebre en contra',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  3 · PILAR DERECHO — el que sostiene
    // ═══════════════════════════════════════════════════════════════════════

    // El ancla es el empuje del scrum, escrito a mano y con su verbo propio
    // —insistir— que ninguna de las siete mecánicas replica.
    {
        kind: 'd3-empuje',
        shirt: 3,
        legacyOf: 'ancla',
        copy: { title: 'El ancla' },
    },

    {
        kind: 'd3-rival',
        shirt: 3,
        mechanic: 'punto',
        attr: 'empuje',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'propia',
        weight: 9,
        params: {
            lugares: ['Todo adentro', 'Adentro', 'De frente', 'Afuera'],
            escena: 'El pilar de enfrente ya eligió por dónde te va a venir',
            segundos: 3,
        },
        copy: {
            title: 'El pilar rival',
            brief: 'Cada scrum te lo arma distinto: busca meterse abajo, o abrirte para afuera, o llevarte de frente. Antes de la entrada se le nota. Después ya es tarde.',
            cta: 'Elegí cómo lo esperás',
            outcome: {
                clavado: 'Le leíste el ángulo antes de agacharse y lo dejaste sin scrum. Penal.',
                logrado: 'Lo esperaste casi bien y no te ganó el metro.',
                tibio: 'Te agarró a medio armar y te comió terreno, pero aguantaste.',
                errado: 'Se te metió por abajo y te levantó. El referee te marcó a vos.',
            },
            result: {
                clavado: 'Penal de scrum',
                logrado: 'Scrum sostenido',
                tibio: 'Metro cedido',
                errado: 'Penal en contra',
            },
        },
    },

    {
        kind: 'd3-columna',
        shirt: 3,
        mechanic: 'sosten',
        attr: 'aguante',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'propia',
        weight: 9,
        params: {
            tics: 10,
            ticMs: 480,
            deriva: 0.95,
            bordes: ['Se hunde', 'Se levanta'],
            zona: 'La columna derecha',
        },
        copy: {
            title: 'La columna',
            brief: 'Del lado derecho el scrum se sostiene o se cae. Empieza a inclinarse y tenés diez tiempos para devolverlo a la horizontal sin que el referee lo note.',
            cta: 'Sostené la columna',
            outcome: {
                clavado: 'El scrum no se movió del plano en todo el partido. Ni una sola caída.',
                logrado: 'Se inclinó un par de veces y lo enderezaste vos solo.',
                tibio: 'Se cayó una vez y el referee hizo repetir. La segunda aguantó.',
                errado: 'Se cayó tres veces y a la tercera el referee ya sabía de qué lado mirar. Penal en contra.',
            },
            result: {
                clavado: 'Columna firme',
                logrado: 'Scrum sostenido',
                tibio: 'Scrum caído',
                errado: 'Penal en contra',
            },
        },
    },

    {
        kind: 'd3-sucio',
        shirt: 3,
        mechanic: 'lectura',
        attr: 'trabajo',
        stake: 'chica',
        risk: 'sancion',
        gloria: 'ajena',
        weight: 7,
        params: {
            segundos: 4,
            opciones: [
                { label: 'Limpiar al que amenaza', hint: 'Lo sacás del ruck. Es lo que hay que hacer.' },
                { label: 'Frenarlo con el cuerpo', hint: 'Sin sacarlo. El referee lo mira de cerca.' },
                { label: 'Ir a la pelota', hint: 'Dejás el trabajo sucio para otro.' },
            ],
            senas: [
                {
                    label: 'El 7 rival ya tiene las manos en la pelota',
                    detalle: 'Está parado sobre sus pies y la está por levantar.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'Vienen tres a limpiar y ninguno llega',
                    detalle: 'La pelota está sola y el ruck todavía no se formó.',
                    mejor: 2,
                    segunda: 0,
                },
                {
                    label: 'El referee ya te avisó dos veces',
                    detalle: 'La próxima que entres mal es tarjeta.',
                    mejor: 0,
                    segunda: null,
                },
            ],
        },
        copy: {
            title: 'Trabajo sucio',
            brief: 'Nadie te lo va a contar en la planilla, pero el ruck se gana acá. Tres rivales alrededor de la pelota y uno solo es el que hay que sacar.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Lo sacaste antes de que apoyara las manos y el ruck quedó tuyo. Nadie lo vio y todos lo notaron.',
                logrado: 'Lo frenaste a tiempo y la pelota salió de tu lado.',
                tibio: 'Llegaste tarde y quedó todo trabado. Pelota lenta.',
                errado: 'Entraste sin pies y de costado. El referee te cobró y te mostró la mano.',
            },
            result: {
                clavado: 'Ruck ganado',
                logrado: 'Ruck asegurado',
                tibio: 'Pelota lenta',
                errado: 'Penal y amonestación',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  4 · SEGUNDA LÍNEA — el que salta
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd4-salto',
        shirt: 4,
        mechanic: 'ventana',
        attr: 'salto',
        stake: 'media',
        risk: 'ninguno',
        // Los line-outs ganados son la planilla del segunda línea.
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'El punto más alto',
            bordes: ['Antes', 'Después'],
            vueltas: 2,
            sweepMs: 1150,
            anchoBase: 0.14,
        },
        copy: {
            title: 'El salto',
            brief: 'La pelota sube y vos con ella. Hay un instante en el que estás arriba de todo y la pelota está a la altura de las manos. Ni un tiempo antes ni uno después.',
            cta: 'Tocá para saltar',
            outcome: {
                clavado: 'La bajaste en el punto más alto, con las dos manos y sin que nadie llegara. Line-out limpio.',
                logrado: 'Llegaste bien y la bajaste al 9 sin problema.',
                tibio: 'Saltaste tarde y la tocaste con una mano. Salió para cualquier lado pero quedó tuya.',
                errado: 'Saltaste antes de tiempo y bajaste cuando la pelota todavía subía. Line-out del rival.',
            },
            result: {
                clavado: 'Line-out limpio',
                logrado: 'Line-out ganado',
                tibio: 'Pelota tocada',
                errado: 'Line-out perdido',
            },
        },
    },

    {
        kind: 'd4-leer',
        shirt: 4,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'propia',
        weight: 10,
        params: {
            segundos: 4,
            opciones: [
                { label: 'Al principio del line', hint: 'Corto y rápido. Si te equivocás, quedás lejísimos.' },
                { label: 'Al medio', hint: 'Lo más probable. También lo más esperado.' },
                { label: 'Al fondo', hint: 'Largo. El salto tarda y el rival llega.' },
            ],
            senas: [
                {
                    label: 'El hooker rival mira al primer saltador y acomoda los pies cortos',
                    detalle: 'Los apoyos le quedaron atrás del cuerpo.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'El line se estiró dos metros más de lo normal',
                    detalle: 'Abrieron el fondo. Alguien se va a mover para atrás.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Formaron cerrado y el 8 se metió en el line',
                    detalle: 'Van a armar maul y necesitan la pelota al medio.',
                    mejor: 1,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Leer el lanzamiento',
            brief: 'El hooker rival tiene un tic y vos lo estuviste mirando todo el partido. Antes de que la pelota salga de sus manos ya se sabe adónde va.',
            cta: 'Decidí adónde va',
            outcome: {
                clavado: 'La leíste antes de que saliera y estabas arriba cuando llegó. Robo en el line del rival.',
                logrado: 'Llegaste a disputarla y la peleaste en el aire. No la ganaron limpia.',
                tibio: 'Te movieron para el otro lado pero llegaste a molestar el maul.',
                errado: 'Saltaste donde no era y quedaron con la pelota y con el maul armado.',
            },
            result: {
                clavado: 'Line-out robado',
                logrado: 'Pelota peleada',
                tibio: 'Maul frenado',
                errado: 'Line-out del rival',
            },
        },
    },

    {
        kind: 'd4-levantamiento',
        shirt: 4,
        mechanic: 'secuencia',
        attr: 'trabajo',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 8,
        params: {
            pasos: ['Agarrar', 'Subir', 'Bloquear arriba', 'Acompañar'],
            pasoMs: 800,
            ventanaBase: 210,
        },
        copy: {
            title: 'El levantamiento',
            brief: 'Esta vez el que sube es el otro y vos sos uno de los dos que lo llevan. Los dos tienen que hacer lo mismo al mismo tiempo, y el que va del otro lado no te espera.',
            cta: 'Seguí los tiempos',
            outcome: {
                clavado: 'Lo subieron parejo y quedó a dos cabezas del rival. La pelota bajó sola.',
                logrado: 'Subió derecho aunque un poco corto. Alcanzó.',
                tibio: 'Quedó torcido y tuvo que estirarse. La bajó con una mano.',
                errado: 'Lo levantaste desparejo y se fue de costado. El referee cobró obstrucción.',
            },
            result: {
                clavado: 'Levantada perfecta',
                logrado: 'Line-out ganado',
                tibio: 'Pelota peleada',
                errado: 'Penal en contra',
            },
        },
    },

    {
        kind: 'd4-maul',
        shirt: 4,
        mechanic: 'sosten',
        attr: 'empuje',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 9,
        params: {
            tics: 9,
            ticMs: 560,
            deriva: 0.8,
            bordes: ['Se para', 'Se desarma'],
            zona: 'El maul avanzando',
        },
        copy: {
            title: 'El maul',
            brief: 'El maul avanza mientras todos empujen al mismo ritmo. Empujar de más lo desarma, empujar de menos lo frena, y si se frena el referee lo termina.',
            cta: 'Sostené el ritmo',
            outcome: {
                clavado: 'El maul recorrió veinte metros sin frenarse una sola vez. Try penal.',
                logrado: 'Avanzó parejo hasta la línea de veintidós. Pelota jugable y adelantada.',
                tibio: 'Se frenó a mitad de camino pero salió antes de que lo cobraran.',
                errado: 'Se desarmó a los tres metros y quedaron todos parados. Scrum del rival.',
            },
            result: {
                clavado: 'Maul imparable',
                logrado: 'Maul avanzando',
                tibio: 'Maul frenado',
                errado: 'Maul desarmado',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  5 · SEGUNDA LÍNEA — el que engaña
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd5-senuelo',
        shirt: 5,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'propia',
        weight: 10,
        params: {
            segundos: 4,
            opciones: [
                { label: 'Saltar de verdad', hint: 'La pelota es para vos. Si te leyeron, la peleás.' },
                { label: 'Amagar y bajar', hint: 'Te llevás al rival y la pelota va a otro.' },
                { label: 'Quedarte abajo', hint: 'No sos opción. Bloqueás al que levanta enfrente.' },
            ],
            senas: [
                {
                    label: 'El segunda de enfrente te viene siguiendo todo el partido',
                    detalle: 'Salta cuando saltás vos, sin mirar la pelota.',
                    mejor: 1,
                    segunda: 2,
                },
                {
                    label: 'El rival dejó el fondo del line sin cubrir',
                    detalle: 'Se juntaron todos adelante esperando el maul.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'Están en tus cinco metros y necesitan la pelota rápido',
                    detalle: 'Cualquier salto peleado es un maul que llega a tu ingoal.',
                    mejor: 2,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'El señuelo',
            brief: 'En un line-out no gana el que salta más alto sino el que salta cuando el otro no lo espera. Enfrente hay alguien que te está mirando a vos y no a la pelota.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Se fue con vos y la pelota bajó limpia tres metros más atrás. Line-out ganado sin saltar.',
                logrado: 'Lo llevaste medio paso y alcanzó para ganarla arriba.',
                tibio: 'No se comió el amague pero tampoco llegó a la pelota. Se peleó.',
                errado: 'Te leyó, saltó con vos y la ganó él. Line-out perdido en tu propia zona.',
            },
            result: {
                clavado: 'Line-out limpio',
                logrado: 'Line-out ganado',
                tibio: 'Pelota peleada',
                errado: 'Line-out perdido',
            },
        },
    },

    {
        kind: 'd5-robar',
        shirt: 5,
        mechanic: 'ventana',
        attr: 'juegoAereo',
        stake: 'grande',
        risk: 'cuerpo',
        // Los line-outs robados son la métrica secundaria del puesto.
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'La mano en la pelota',
            bordes: ['Antes', 'Después'],
            vueltas: 2,
            sweepMs: 900,
            anchoBase: 0.09,
        },
        copy: {
            title: 'Robar arriba',
            brief: 'Line-out del rival en tus veintidós. Los dos saltan y la pelota queda un instante entre las dos manos. Ese instante es todo lo que tenés.',
            cta: 'Tocá para robar',
            outcome: {
                clavado: 'Se la sacaste de las manos en el aire y caíste con ella. Robo en el line del rival.',
                logrado: 'Llegaste a tocarla y quedó del lado tuyo. Pelota recuperada.',
                tibio: 'Le llegaste a molestar la bajada. Ganaron mal, con la pelota lenta.',
                errado: 'Llegaste tarde y quedaste colgado. Line-out del rival y maul a cinco metros.',
            },
            result: {
                clavado: 'Robo en el line',
                logrado: 'Pelota recuperada',
                tibio: 'Bajada molestada',
                errado: 'Line-out del rival',
            },
        },
    },

    {
        kind: 'd5-bloqueo',
        shirt: 5,
        mechanic: 'sosten',
        attr: 'defensa',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 8,
        params: {
            tics: 8,
            ticMs: 540,
            deriva: 0.9,
            bordes: ['Te pasan por adentro', 'Te pasan por afuera'],
            zona: 'El maul frenado',
        },
        copy: {
            title: 'Bloquear el maul',
            brief: 'El maul del rival viene caminando hacia tu línea y vos sos el que lo tiene que parar. No se para de un golpe: se para aguantando y no dejándose correr para los costados.',
            cta: 'Aguantá el maul',
            outcome: {
                clavado: 'Lo paraste en seco y el referee cobró maul detenido. Scrum para tu lado.',
                logrado: 'Lo frenaste a los pocos metros y no llegó a la línea.',
                tibio: 'Te fue corriendo de a poco y avanzó media cancha antes de salir.',
                errado: 'Te sacaron del maul y siguió caminando hasta apoyar. Try de forwards.',
            },
            result: {
                clavado: 'Maul detenido',
                logrado: 'Maul frenado',
                tibio: 'Metros cedidos',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd5-carry',
        shirt: 5,
        mechanic: 'punto',
        attr: 'choque',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 8,
        params: {
            lugares: ['Al intervalo de adentro', 'Al hombro del 8', 'De frente al 4', 'Al hombro del ala', 'Al intervalo de afuera'],
            escena: 'La defensa está armada y hay que hacer metros de todos modos',
            segundos: 4,
        },
        copy: {
            title: 'Carry de segunda línea',
            brief: 'No hay espacio y alguien tiene que llevarla. La defensa está parada pero no está pareja: hay un hombro que llegó tarde y todos los demás están firmes.',
            cta: 'Elegí la línea',
            outcome: {
                clavado: 'Entraste por el hombro que llegó tarde y saliste diez metros más adelante. Quiebre.',
                logrado: 'Ganaste la línea de ventaja y presentaste rápido.',
                tibio: 'Chocaste de frente y no ganaste terreno, pero la pelota salió.',
                errado: 'Entraste donde estaban esperando y te tumbaron para atrás. Pelota lenta y turnover.',
            },
            result: {
                clavado: 'Quiebre',
                logrado: 'Metros ganados',
                tibio: 'Sin avance',
                errado: 'Tackle dominante en contra',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  6 · ALA CIEGO — el que cierra
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd6-canal',
        shirt: 6,
        mechanic: 'punto',
        attr: 'defensa',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            lugares: ['Pegado al ruck', 'Primer canal', 'Segundo canal', 'Tercer canal', 'Afuera'],
            escena: 'La defensa se corrió una fase y quedó un hueco',
            segundos: 3,
        },
        copy: {
            title: 'Cerrar el canal',
            brief: 'Cada fase la línea se corre y siempre queda un canal más flojo que los otros. El 6 es el que lo tapa antes de que el rival lo encuentre.',
            cta: 'Elegí el canal',
            outcome: {
                clavado: 'Lo tapaste antes de que lo mirara y tuvo que jugar para el lado cerrado. Fase perdida para ellos.',
                logrado: 'Llegaste a tiempo y el ataque murió contra tu hombro.',
                tibio: 'Te ganaron el canal de al lado y avanzaron unos metros.',
                errado: 'Elegiste el canal equivocado y por el otro entró el 12 de una. Try en tres pases.',
            },
            result: {
                clavado: 'Canal cerrado',
                logrado: 'Ataque frenado',
                tibio: 'Metros cedidos',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd6-tackle8',
        shirt: 6,
        mechanic: 'ventana',
        attr: 'tackle',
        stake: 'media',
        // El choque de cabezas contra un 8 lanzado es de los que terminan en
        // HIA. Es uno de los pocos del catálogo con carril de cabeza.
        risk: 'cabeza',
        gloria: 'ajena',
        weight: 10,
        params: {
            zona: 'Contacto',
            bordes: ['Muy pronto', 'Muy tarde'],
            vueltas: 2,
            sweepMs: 1050,
            anchoBase: 0.12,
        },
        copy: {
            title: 'El tackle al 8',
            brief: 'El 8 del rival viene lanzado desde la base del scrum y te eligió a vos. Salir antes es dejarle el hueco; salir después es recibirlo con el cuerpo parado.',
            cta: 'Tocá para salir',
            outcome: {
                clavado: 'Lo agarraste antes de que agarrara velocidad y lo tiraste para atrás. Turnover.',
                logrado: 'Lo bajaste en el contacto y no ganó la línea de ventaja.',
                tibio: 'Te lo llevaste puesto y cayeron los dos. Ganó tres metros.',
                errado: 'Llegaste tarde y de cabeza. Te lo pasó por arriba y encima quedaste sentido.',
            },
            result: {
                clavado: 'Turnover',
                logrado: 'Tackle dominante',
                tibio: 'Tackle cedido',
                errado: 'Te pasó por arriba',
            },
        },
    },

    {
        kind: 'd6-persecucion',
        shirt: 6,
        mechanic: 'punteria',
        attr: 'velocidad',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            senal: 'La velocidad a la que va el que se escapó',
            desvioMax: 0.55,
            bordes: ['Le apuntás atrás', 'Le apuntás muy adelante'],
            zona: 'Donde lo vas a alcanzar',
            sweepMs: 1200,
        },
        copy: {
            title: 'La persecución',
            brief: 'Rompió la línea y tenés treinta metros para alcanzarlo. Correr hacia donde está es llegar donde estuvo: hay que correr hacia donde va a estar.',
            cta: 'Tocá para elegir el ángulo',
            outcome: {
                clavado: 'Le cortaste el ángulo perfecto y lo sacaste al lateral sin tocarlo. No hubo try.',
                logrado: 'Lo alcanzaste sobre la línea y lo bajaste antes de apoyar.',
                tibio: 'Llegaste a rozarlo y lo obligaste a pasarla. El pase salió mal.',
                errado: 'Corriste hacia donde estaba y le pasaste tres metros por detrás. Try abajo de los palos.',
            },
            result: {
                clavado: 'Try salvado',
                logrado: 'Alcanzado en la línea',
                tibio: 'Obligado a pasar',
                errado: 'Try en contra',
            },
        },
    },

    {
        kind: 'd6-presion',
        shirt: 6,
        mechanic: 'lectura',
        attr: 'robo',
        stake: 'grande',
        risk: 'sancion',
        // Los turnovers son la planilla de la tercera línea.
        gloria: 'propia',
        weight: 11,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Ir a robarla', hint: 'Si la ganás es turnover. Si llegás mal, es penal.' },
                { label: 'Limpiar y salir', hint: 'Seguro. No hay premio.' },
                { label: 'Quedarte en la línea', hint: 'Conservás la estructura defensiva.' },
            ],
            senas: [
                {
                    label: 'El portador cayó solo y no llega nadie a limpiarlo',
                    detalle: 'Tenés dos segundos con la pelota sin protección.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'Llegaron dos a limpiar antes que vos',
                    detalle: 'Entrar ahora es entrar de costado.',
                    mejor: 2,
                    segunda: 1,
                },
                {
                    label: 'Van con todo el pack y quedó la línea corta',
                    detalle: 'Si te metés al ruck, afuera quedan tres contra cinco.',
                    mejor: 2,
                    segunda: 0,
                },
            ],
        },
        copy: {
            title: 'Presión sobre el ruck',
            brief: 'La pelota está en el piso y hay una fracción para decidir. Robarla paga como nada en el juego. Entrar mal cuesta un penal en tu propia mitad.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Entraste parado sobre los pies, las manos en la pelota y no la soltaste. Turnover en zona propia.',
                logrado: 'La peleaste y salió del lado tuyo. Posesión recuperada.',
                tibio: 'No la ganaste pero la hiciste lenta. El ataque murió ahí.',
                errado: 'Entraste de costado y sin pies. Penal, y el referee te anotó el número.',
            },
            result: {
                clavado: 'Turnover',
                logrado: 'Pelota recuperada',
                tibio: 'Pelota lenta',
                errado: 'Penal y amonestación',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  7 · ALA ABIERTO — el que caza
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd7-cazador',
        shirt: 7,
        mechanic: 'ventana',
        attr: 'robo',
        stake: 'grande',
        risk: 'sancion',
        gloria: 'propia',
        weight: 11,
        params: {
            zona: 'La pelota sin dueño',
            bordes: ['Todavía la tiene', 'Ya la protegieron'],
            vueltas: 2,
            sweepMs: 820,
            anchoBase: 0.08,
        },
        copy: {
            title: 'El cazador',
            brief: 'Entre que el portador toca el piso y que llega el primero a limpiarlo hay una fracción donde la pelota no es de nadie. El 7 vive de esa fracción.',
            cta: 'Tocá para entrar',
            outcome: {
                clavado: 'Entraste en el instante justo y saliste con la pelota. El estadio tardó en darse cuenta.',
                logrado: 'La agarraste y la peleaste hasta que el referee cobró para tu lado.',
                tibio: 'Llegaste sobre el límite y solo alcanzaste a frenarla. Salió lenta.',
                errado: 'Entraste cuando ya estaba el ruck armado. Penal por manos en el ruck.',
            },
            result: {
                clavado: 'Turnover',
                logrado: 'Penal ganado',
                tibio: 'Pelota lenta',
                errado: 'Penal en contra',
            },
        },
    },

    // El jackal es el minijuego de esperar el destello, escrito a mano, con tres
    // rondas y su propia clasificación de offside.
    {
        kind: 'd7-robo',
        shirt: 7,
        legacyOf: 'jackal',
        copy: { title: 'El jackal' },
    },

    {
        kind: 'd7-primero',
        shirt: 7,
        mechanic: 'punto',
        attr: 'velocidad',
        stake: 'media',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 9,
        params: {
            lugares: ['Atrás del ruck', 'Al lado del 9', 'Primer canal', 'Segundo canal', 'En el fondo'],
            escena: 'La pelota va a salir de acá en dos segundos',
            segundos: 3,
        },
        copy: {
            title: 'Llegar primero',
            brief: 'El 7 bueno no es el que corre más rápido sino el que ya está donde la pelota va a estar. Mirá el ruck y decidí adónde arrancar antes de que salga.',
            cta: 'Elegí adónde ir',
            outcome: {
                clavado: 'Estabas parado justo ahí cuando salió. Llegaste antes que el rival y sin correr.',
                logrado: 'Llegaste primero al contacto y frenaste el avance.',
                tibio: 'Llegaste con el segundo grupo. Sirvió para el ruck y nada más.',
                errado: 'Arrancaste para el lado contrario y la jugada pasó por donde no estabas.',
            },
            result: {
                clavado: 'Primero en todas',
                logrado: 'Llegada a tiempo',
                tibio: 'Llegada tardía',
                errado: 'Fuera de la jugada',
            },
        },
    },

    {
        kind: 'd7-nueve',
        shirt: 7,
        mechanic: 'lectura',
        attr: 'vision',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 9,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Salir sobre el 9', hint: 'Si va a correr lo matás. Si pasa, quedaste adentro.' },
                { label: 'Cubrir el pase', hint: 'Le tapás al 10. El 9 queda libre.' },
                { label: 'Retroceder al fondo', hint: 'Si patea la levantás vos. Si no, no hiciste nada.' },
            ],
            senas: [
                {
                    label: 'El 9 se paró con los dos pies y mira hacia adentro',
                    detalle: 'Se acomodó para arrancar él.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'El 10 rival se adelantó dos metros y pide',
                    detalle: 'La quiere rápida y plana.',
                    mejor: 1,
                    segunda: 0,
                },
                {
                    label: 'Están en su propia veintidós y el fullback se corrió',
                    detalle: 'La cancha está abierta atrás.',
                    mejor: 2,
                    segunda: 1,
                },
            ],
        },
        copy: {
            title: 'Defender al 9',
            brief: 'El medio scrum del rival tiene tres cosas para hacer y las hace todas bien. La única forma de ganarle es saber cuál va a elegir antes que él.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Le adivinaste la intención y lo mataste antes de que se decidiera. Turnover.',
                logrado: 'Le tapaste la mejor opción y tuvo que hacer la segunda.',
                tibio: 'Salió como quiso pero llegaste a molestarlo. Nada limpio para ellos.',
                errado: 'Hizo justo lo otro y quedaste solo en el medio de la cancha mirando la jugada.',
            },
            result: {
                clavado: 'Turnover',
                logrado: 'Salida tapada',
                tibio: 'Presión sin premio',
                errado: 'Superado',
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  8 · NÚMERO 8 — el que sale de la base
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'd8-salida',
        shirt: 8,
        mechanic: 'lectura',
        attr: 'salida',
        stake: 'media',
        risk: 'ninguno',
        gloria: 'ajena',
        weight: 10,
        params: {
            segundos: 3,
            opciones: [
                { label: 'Llevarla vos', hint: 'Un pick and go. Metros seguros, cuerpo caro.' },
                { label: 'Dársela al 9', hint: 'Rápido y ordenado. Sin sorpresa.' },
                { label: 'Abrir de una', hint: 'Directo a los backs. Si la línea está corrida, es try.' },
            ],
            senas: [
                {
                    label: 'El scrum del rival se está yendo para atrás',
                    detalle: 'Tenés dos metros de ventaja y nadie encima.',
                    mejor: 0,
                    segunda: 1,
                },
                {
                    label: 'El 7 rival se soltó antes de tiempo y te espera',
                    detalle: 'Si levantás la cabeza te come.',
                    mejor: 1,
                    segunda: 2,
                },
                {
                    label: 'La línea del rival se corrió toda al lado ciego',
                    detalle: 'Del lado abierto quedaron dos contra cuatro.',
                    mejor: 2,
                    segunda: 1,
                },
            ],
        },
        copy: {
            title: 'Salida del scrum',
            brief: 'La pelota llegó a tus pies en la base y el scrum todavía está armado. Tres cosas se pueden hacer y solo una está bien esta vez.',
            cta: 'Decidí',
            outcome: {
                clavado: 'Elegiste la única que estaba y la jugada terminó en try. Salió del scrum.',
                logrado: 'Saliste bien y el ataque arrancó adelantado.',
                tibio: 'Saliste como se pudo. La pelota quedó jugable y nada más.',
                errado: 'Elegiste lo que el rival estaba esperando y te la robaron en la base.',
            },
            result: {
                clavado: 'Try de la base',
                logrado: 'Salida limpia',
                tibio: 'Salida trabada',
                errado: 'Pelota perdida',
            },
        },
    },

    {
        kind: 'd8-pickgo',
        shirt: 8,
        mechanic: 'ventana',
        attr: 'choque',
        stake: 'media',
        risk: 'cuerpo',
        // Los metros post-contacto son la métrica secundaria de la tercera línea.
        gloria: 'propia',
        weight: 10,
        params: {
            zona: 'El contacto',
            bordes: ['Antes de agarrar velocidad', 'Cuando ya te esperan'],
            vueltas: 2,
            sweepMs: 1100,
            anchoBase: 0.13,
        },
        copy: {
            title: 'Pick and go',
            brief: 'Levantás la pelota del piso y arrancás. Entre que arrancás y que llegás al defensor hay dos pasos, y el contacto se gana o se pierde en cuál de los dos entrás.',
            cta: 'Tocá para entrar',
            outcome: {
                clavado: 'Entraste con el cuerpo lanzado y te llevaste dos puestos. Cinco metros post contacto.',
                logrado: 'Ganaste la línea de ventaja y presentaste la pelota rápido.',
                tibio: 'Te frenaron en el primer paso pero mantuviste la pelota.',
                errado: 'Entraste parado y te tiraron para atrás. Pelota lenta y el rival encima.',
            },
            result: {
                clavado: 'Metros post contacto',
                logrado: 'Línea de ventaja',
                tibio: 'Sin avance',
                errado: 'Tackle dominante en contra',
            },
        },
    },

    {
        kind: 'd8-base',
        shirt: 8,
        mechanic: 'punto',
        attr: 'vision',
        stake: 'chica',
        risk: 'cuerpo',
        gloria: 'ajena',
        weight: 8,
        params: {
            lugares: ['Por el ciego pegado', 'Entre el 9 y el scrum', 'Por el medio', 'Del lado abierto'],
            escena: 'El scrum a cinco metros y la defensa acomodándose',
            segundos: 4,
        },
        copy: {
            title: 'La base del scrum',
            brief: 'Scrum a cinco metros de la línea del rival. Desde la base se ven tres huecos y dos son trampas: el que parece más grande es el que tiene al 7 escondido.',
            cta: 'Elegí el hueco',
            outcome: {
                clavado: 'Encontraste el hueco real y apoyaste sin que te tocaran. Try desde la base.',
                logrado: 'Te llevaste al primero puesto y quedaste a un metro. Try en la fase siguiente.',
                tibio: 'Elegiste el que estaba tapado y te frenaron en la línea.',
                errado: 'Fuiste directo adonde te esperaban y te tumbaron para atrás. Se acabó la chance.',
            },
            result: {
                clavado: 'Try desde la base',
                logrado: 'A un metro',
                tibio: 'Frenado en la línea',
                errado: 'Chance perdida',
            },
        },
    },

    {
        kind: 'd8-ultimo',
        shirt: 8,
        mechanic: 'sosten',
        attr: 'aguante',
        stake: 'grande',
        risk: 'cuerpo',
        gloria: 'propia',
        weight: 10,
        params: {
            tics: 9,
            ticMs: 500,
            deriva: 1,
            bordes: ['Te tumban', 'Te dan vuelta'],
            zona: 'El último metro',
        },
        copy: {
            title: 'El último metro',
            brief: 'Estás a un metro de la línea con tres encima y la pelota en una mano. No es fuerza: es no dejarse dar vuelta mientras se avanza de a centímetros.',
            cta: 'Aguantá',
            outcome: {
                clavado: 'Los llevaste puestos hasta el ingoal y apoyaste con tres arriba. Try.',
                logrado: 'Llegaste a la línea y estiraste el brazo. Try.',
                tibio: 'Te frenaron sobre la raya pero presentaste bien. Try en la fase siguiente.',
                errado: 'Te dieron vuelta y quedaste con la pelota abajo tuyo. Scrum del rival en su cinco.',
            },
            result: {
                clavado: 'Try',
                logrado: 'Try al límite',
                tibio: 'Frenado en la línea',
                errado: 'Chance perdida',
            },
        },
    },
];
