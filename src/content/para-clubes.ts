/**
 * /para-clubes — la puerta del que REPRESENTA a un club.
 *
 * Dirigente, prensa del club, entrenador. Un club solo: sus categorías, sus
 * jugadores, su historia. No organiza el torneo, juega adentro de uno.
 *
 * El eje es EL DÍA DE PARTIDO, no la lista de funciones. Un club no compra "una
 * página": compra saber qué está pasando el sábado, tener los números el lunes y
 * que sus jugadores tengan historia. De ahí que la sección central sean tres
 * momentos —el sábado, el lunes, la temporada— y no una grilla de features.
 *
 * La otra puerta es `/para-torneos`, para el que organiza. Lo compartido
 * —tipos, formulario, atribución— vive en `content/embudo.ts`.
 *
 * ── LO QUE ACÁ NO SE PROMETE, Y POR QUÉ ────────────────────────────────────
 *
 * Tres afirmaciones quedaron afuera del copy porque el producto NO las cumple
 * hoy, y una landing que la demo desmiente es peor que una landing floja:
 *
 *  · "Se sincroniza cuando vuelve la señal". FALSO. `public/sw.js` corta en
 *    `request.method !== 'GET'`: cachea escudos y estáticos, no encola
 *    escrituras. Sin señal no se publica nada. La respuesta de la FAQ dice lo
 *    que pasa de verdad. Si algún día se agrega la cola, se actualiza acá.
 *
 *  · "Podés exportar las estadísticas cuando quieras". No hay export de datos:
 *    lo que existe es la exportación de PLACAS (imágenes). La FAQ afirma lo que
 *    sí es cierto —los datos son del club— y ofrece pasarlos en una planilla,
 *    que hoy se hace a mano.
 *
 *  · "Minutos jugados" en la ficha del jugador. `localPlayerProfile.ts` cuenta
 *    partidos, puntos, tries, conversiones, penales y tarjetas. Minutos no
 *    existe, así que la ficha se describe con lo que tiene.
 */

import {
    ROLES_CLUB,
    type ContenidoEmbudo,
} from './embudo';

/**
 * El club que se muestra como prueba en el hero.
 *
 * Una sola constante porque es lo primero que hay que cambiar si este club deja
 * de estar publicado o si otro queda mejor cargado. Verificado contra la base:
 * `tala-rugby-club` existe, es de rugby, está visible, y tiene familia cargada
 * (Intermedia y las dos Preintermedia), que es justamente lo que la página
 * promete mostrar.
 */
const CLUB_DE_MUESTRA = {
    href: '/clubs/tala-rugby-club',
    nombre: 'Tala',
};

export const PARA_CLUBES: ContenidoEmbudo = {
    embudo: 'clubes',

    meta: {
        titulo: 'G22 para clubes — Todos los partidos de tu club, en vivo',
        descripcion:
            'Primera, intermedia, M19 y M17 actualizándose en vivo en la página de tu club. Estadísticas por jugador que quedan temporada a temporada. Pedí una demo con un partido tuyo.',
    },

    hero: {
        etiqueta: 'G22 para clubes',
        /*
         * Sin gancho: el H1 de dos líneas ya pone la escena y la promesa. La
         * versión corta —"Todo tu club, en vivo, en una sola pantalla."— sirve
         * como H1 alternativo si algún día se quiere una línea sola, pero abajo
         * del H1 largo diría dos veces lo mismo.
         */
        gancho: '',
        /*
         * Dos líneas y no una: la primera pone la escena —el sábado del club— y
         * la segunda la promesa. Partido en el JSX, no con un <br> escondido en
         * un string.
         */
        titulo: [
            'El sábado tu club juega cinco partidos.',
            'Ahora se siguen todos, en un solo lugar.',
        ],
        subtitulo:
            'Primera, intermedia, M19, M17 — cada uno actualizándose en vivo en la página de tu club. El que está parado en una cancha se entera de las otras cuatro. El que no pudo ir, también.',
        accionPrimaria: 'Pedí tu demo',
        accionSecundaria: {
            texto: `Ver la página de ${CLUB_DE_MUESTRA.nombre}`,
            href: CLUB_DE_MUESTRA.href,
        },
    },

    numeros: [
        {
            valor: '2 min',
            etiqueta: 'para cargar un partido',
            detalle: 'Desde el celular, en la mesa de control. El plantel se arma una vez y queda.',
        },
        {
            valor: '0',
            etiqueta: 'instalación',
            detalle: 'Se carga del celular, desde la mesa de control. No hay nada que bajar.',
        },
        {
            valor: 'Todas',
            etiqueta: 'las categorías, en la misma vista',
            detalle: 'De primera a M16, en la pestaña "Hoy" de la página de tu club.',
        },
    ],

    /**
     * Los tres momentos.
     *
     * Cada uno es verdad verificable contra el producto:
     *  · el sábado  → la pestaña "Hoy" de `/clubs/[id]`, que suma la jornada de
     *                 toda la familia del club (`/api/clubs/[id]/panel-matches`)
     *  · el lunes   → los eventos se cargan con el minuto y de ahí salen las
     *                 estadísticas del partido (`matchStatsFromEvents.ts`)
     *  · la temporada → la ficha del jugador se arma de los partidos cargados
     *                 (`localPlayerProfile.ts`), no de una tabla que alguien
     *                 mantiene a mano
     */
    momentos: [
        {
            id: 'sabado',
            cuando: 'El sábado',
            titulo: 'Todo tu club, en vivo',
            parrafos: [
                'Entrás a la página de tu club y en "Hoy" están los partidos de todas las categorías, actualizándose solos. No hay que preguntar en el grupo ni esperar a que alguien avise.',
                'Un link para mandarle a los socios, a los padres y a las redes del club. El mismo link, todos los sábados. Y también aparecen en el tablero de G22, donde ya entran a mirar los resultados del torneo.',
            ],
        },
        {
            id: 'lunes',
            cuando: 'El lunes',
            titulo: 'Los números ya están hechos',
            parrafos: [
                'Cada evento queda cargado con el minuto: tries, penales, conversiones, tarjetas, cambios. Cuando termina el partido, el resumen ya existe.',
                'El cuerpo técnico llega el martes con los datos servidos, sin tener que reconstruir el partido de memoria ni mirar el video entero para contar.',
            ],
        },
        {
            id: 'temporada',
            cuando: 'La temporada',
            titulo: 'La historia de cada jugador',
            parrafos: [
                'Cada jugador tiene su ficha: partidos, puntos, tries, tarjetas, temporada tras temporada. No se borra al terminar el año.',
                'El pibe que debuta en M16 llega a primera con su historial completo. Y el hincha puede seguirlo todo el camino.',
            ],
        },
    ],

    modulosTitulo: 'Lo que tiene tu club',
    modulosTexto: 'Todo sale de la misma carga. No hay que subir la información dos veces.',
    modulos: [
        {
            id: 'club',
            icono: 'club',
            titulo: 'Página del club',
            texto: 'Plantel, escudo, fixture y resultados, siempre al día.',
        },
        {
            id: 'vivo',
            icono: 'vivo',
            titulo: 'Partidos en vivo',
            texto: 'Todas las categorías, minuto a minuto.',
        },
        {
            id: 'jugador',
            icono: 'jugador',
            titulo: 'Ficha de jugador',
            texto: 'Estadísticas que persisten temporada a temporada.',
        },
        {
            id: 'stats',
            icono: 'stats',
            titulo: 'Estadísticas de equipo',
            texto: 'Para el análisis post-partido, con los eventos y sus minutos.',
        },
        {
            id: 'equipo',
            icono: 'equipo',
            titulo: 'Equipo de la Semana',
            texto: 'Tus jugadores compitiendo por entrar.',
        },
        {
            id: 'fantasy',
            icono: 'fantasy',
            titulo: 'Fantasy y Prode',
            texto: 'Tus partidos dentro del juego del torneo.',
        },
    ],

    pasosTitulo: 'Cómo funciona',
    pasos: [
        {
            numero: '01',
            titulo: 'Alguien del club carga',
            texto: 'Desde el celular, en la mesa de control. Dos minutos de instrucción y ya está.',
        },
        {
            numero: '02',
            titulo: 'Aparece en vivo',
            texto: 'En la página del club y en el tablero de G22, al instante.',
        },
        {
            numero: '03',
            titulo: 'Queda para siempre',
            texto: 'El partido, las estadísticas y la ficha de cada jugador.',
        },
    ],

    /**
     * El bloque puente.
     *
     * Es la objeción que más frena y a la vez la mejor vía de entrada. Ojo con
     * la segunda frase: es una afirmación sobre la historia comercial del
     * proyecto, no sobre el producto, así que no la puede verificar el código.
     * Si no es cierta, se cambia acá y no rompe nada.
     */
    puente: {
        titulo: '¿Tu torneo todavía no está en G22?',
        texto: 'No importa. Sumá tu club igual y nosotros nos encargamos de hablar con la organización del torneo. Muchos torneos entraron porque un club llegó primero.',
        accion: 'Quiero sumar mi club',
        otraPuerta: 'Organizo el torneo, no un club',
    },

    roles: ROLES_CLUB,

    faq: [
        {
            pregunta: '¿Quién carga los datos?',
            respuesta:
                'Alguien del club, desde el celular. La carga está pensada para hacerse en vivo desde la mesa de control sin conocimiento técnico: son dos minutos de instrucción. Si preferís, el primer fin de semana lo cargamos con vos.',
        },
        {
            pregunta: '¿Sirve si mi torneo no está en G22?',
            respuesta:
                'Sí. Tu club tiene su página, su plantel y sus estadísticas igual. Y nos ocupamos de acercarle la plataforma a la organización de tu torneo.',
        },
        {
            pregunta: '¿Sirve para juveniles?',
            respuesta:
                'Sí. Todas las categorías del club, de primera a M16, en la misma vista. Los juveniles son justamente donde más se nota, porque hoy no existen en ningún lado.',
        },
        /*
         * OJO. El copy original decía "podés exportarlas cuando quieras", y hoy
         * no hay export de datos: lo que existe es la exportación de placas
         * (imágenes). La propiedad del dato sí es verdad, y pasar una planilla a
         * mano es un compromiso que se puede cumplir. Cuando exista el export de
         * verdad, esta respuesta se acorta.
         */
        {
            pregunta: '¿Los datos son del club?',
            respuesta:
                'Sí. Las estadísticas de tus jugadores son tuyas: si en algún momento querés llevártelas, te las pasamos en una planilla y listo. No quedan secuestradas acá adentro.',
        },
        /*
         * OJO CON ESTA RESPUESTA. Decir que lo cargado sin señal "se sincroniza
         * cuando vuelve" es FALSO: `public/sw.js` sólo cachea GET (escudos y
         * estáticos), no hay background sync ni cola de escritura. Sin internet
         * no se publica nada. Si algún día se agrega la cola, se actualiza.
         */
        {
            pregunta: '¿Qué pasa si no hay internet en la cancha?',
            respuesta:
                'En vivo no se puede: publicar el momento necesita señal. Lo que alcanzaste a cargar antes de quedarte sin datos queda guardado. Si en tu cancha la señal es mala, la salida es anotar en papel y cargar el partido entero al terminar, desde donde tengas señal: el fixture, la tabla y las estadísticas quedan exactamente iguales. Lo único que se pierde es el minuto a minuto.',
        },
        {
            pregunta: '¿Cuánto sale?',
            respuesta:
                'Depende del tamaño del club. No hay un paquete cerrado: en la reunión vemos cuántas categorías tenés y qué módulos vas a usar, y con eso armamos el precio. La demo no se cobra.',
        },
    ],

    cierre: {
        titulo: 'Probemos con un partido tuyo',
        texto:
            'Elegís una fecha, cargamos un partido de tu club con vos y lo ves publicado el mismo sábado. Queda online aunque después no sigas.',
    },

    cruce: {
        texto: '¿Organizás un torneo en vez de un club?',
        accion: 'Mirá G22 para torneos',
        destino: 'torneos',
    },
};
