/**
 * /para-torneos — la puerta del que ORGANIZA.
 *
 * Una unión, una liga, un torneo con varias categorías y varias canchas el
 * mismo sábado. Es la venta grande, y por eso es la salida primaria de la placa
 * de la home. Todo lo que habla acá habla de VOLUMEN: cuántas categorías,
 * quién carga en cada club, qué pasa con el fixture que ya tenés armado.
 *
 * La otra puerta es `/para-clubes`, para el dirigente de un club solo. Lo
 * compartido —módulos, formulario, atribución— vive en `content/embudo.ts`.
 */

import {
    MODULOS,
    NUMERO_MODULOS,
    ROLES_TORNEO,
    TORNEOS_PUBLICANDO,
    type ContenidoEmbudo,
} from './embudo';

export const PARA_TORNEOS: ContenidoEmbudo = {
    embudo: 'torneos',

    meta: {
        titulo: 'G22 para torneos — Publicá tu torneo en vivo',
        descripcion:
            'Fixture, posiciones, estadísticas y sanciones de todas tus categorías en un solo lugar, en vivo y en el sitio donde ya se sigue el rugby. Cada club carga sus partidos. Pedí una demo con un partido de tu torneo.',
    },

    /**
     * El hook arriba y solo.
     *
     * La promesa es la audiencia, y lo que la hace verdadera —que el rugby ya se
     * mira acá— estaba enterrado en una subordinada del subtítulo. Ahora va como
     * su propia línea, arriba de todo y antes de pedir nada.
     */
    hero: {
        etiqueta: 'G22 para torneos',
        gancho: 'El hincha ya está acá.',
        titulo: ['Tu torneo, donde la gente ya lo está mirando.'],
        subtitulo:
            'En G22 ya se siguen el Top 14, el Top 10 del Centro y la URBA. Tu torneo no estrena un sitio: entra al que el hincha ya tiene abierto el sábado a la tarde. Todas tus categorías, con fixture, posiciones y estadísticas.',
        accionPrimaria: 'Pedí una demo con un partido tuyo',
        accionSecundaria: { texto: 'Ver los torneos publicados', href: '/tournaments' },
    },

    /*
     * Los tres momentos son el argumento del CLUB —el sábado, el lunes, la
     * temporada— y acá no aplican: el que organiza no vive el día de partido, lo
     * administra. La sección queda vacía y no se dibuja.
     */
    momentos: [],

    numeros: [
        {
            valor: '2 min',
            etiqueta: 'para crear un partido',
            detalle: 'Equipos, hora y cancha. El fixture completo se arma una vez y queda.',
        },
        {
            valor: '0',
            etiqueta: 'instalación',
            detalle: 'Cada club carga desde el celular, en su mesa de control. No hay nada que bajar.',
        },
        /*
         * El tercero sale de una sola constante. Mientras no haya una cuenta
         * contra la base, el número lo pone el producto y no una promesa: ver
         * `TORNEOS_PUBLICANDO` en embudo.ts.
         */
        TORNEOS_PUBLICANDO === null
            ? NUMERO_MODULOS
            : {
                valor: `+${TORNEOS_PUBLICANDO}`,
                etiqueta: 'torneos ya publican en G22',
                detalle: 'Uniones, clubes y organizadores independientes.',
            },
    ],

    modulosTitulo: 'Lo que se publica',
    modulosTexto: 'Todo sale de la misma carga. Ningún club sube la información dos veces.',
    modulos: MODULOS,

    pasosTitulo: 'Cómo se ve en la cancha',
    pasos: [
        {
            numero: '01',
            titulo: 'Cada club carga lo suyo',
            texto: 'Desde el celular, en la mesa de control. Un try son dos toques, y cada usuario ve sólo su partido.',
        },
        {
            numero: '02',
            titulo: 'El torneo se arma solo',
            texto: 'Las posiciones, las sanciones y las estadísticas de todas las categorías salen de esa carga, sin que nadie las pase a una planilla.',
        },
        {
            numero: '03',
            titulo: 'El hincha sigue a su jugador',
            texto: 'Termina la fecha y quedan la tabla, el equipo de la semana y la ficha de cada jugador de tu torneo.',
        },
    ],

    /**
     * La prueba en vivo, que no es un embed.
     *
     * No hay un fixture de mentira arriba de una página de ventas: hay links al
     * sitio de verdad, para que lo abra en otra pestaña y vea el producto
     * terminado con datos reales. Si algún día estas secciones dejan de existir,
     * se sacan de la lista y la sección colapsa sola.
     */
    prueba: {
        titulo: 'No te lo contamos: abrilo.',
        texto: 'Esto no es una captura de pantalla ni un torneo de ejemplo. Es el sitio, funcionando ahora, con los torneos que ya publican en G22.',
        enlaces: [
            {
                href: '/tournaments',
                titulo: 'Los torneos',
                texto: 'Fixture, posiciones y sanciones, por país y por categoría.',
            },
            {
                href: '/rankings',
                titulo: 'El ranking de clubes',
                texto: 'Sale solo de los partidos cargados. Nadie lo escribe a mano.',
            },
            {
                href: '/juegos',
                titulo: 'Fantasy y prode',
                texto: 'La razón por la que el hincha vuelve entre fecha y fecha.',
            },
        ],
    },

    roles: ROLES_TORNEO,

    faq: [
        {
            pregunta: '¿Cuánto sale?',
            respuesta:
                'Depende de lo que necesites. No hay un paquete cerrado: en la reunión vemos cuántos torneos manejás, cuántas categorías y qué módulos vas a usar, y con eso armamos el precio. La demo no se cobra.',
        },
        {
            pregunta: '¿Quién carga los datos de cada club?',
            respuesta:
                'Alguien del club, desde el celular. A cada uno le damos un usuario con permisos sobre sus partidos y nada más: no puede tocar el fixture del torneo ni la carga de otro club. La organización ve todo y corrige lo que haga falta.',
        },
        {
            pregunta: '¿Sirve para juveniles y M17?',
            respuesta:
                'Sí. Cada categoría es su propio torneo, con su fixture y su tabla, y los juveniles tienen su lugar en el sitio separado de la primera. No se mezclan ni en las posiciones ni en las estadísticas.',
        },
        {
            pregunta: '¿Puedo migrar el torneo que ya tengo armado?',
            respuesta:
                'Sí. Importamos el fixture y los planteles desde una planilla, y si tu torneo ya tiene historial publicado en otra fuente, lo cargamos como temporadas anteriores. No se arranca de cero.',
        },
        {
            pregunta: '¿Qué pasa si un club no carga?',
            respuesta:
                'El partido queda sin datos y se nota: la tabla lo muestra pendiente. Desde el panel del torneo lo podés cargar vos con la planilla que te pasen, y el fin de semana siguiente se ve quién cargó y quién no.',
        },
        /*
         * OJO CON ESTA RESPUESTA. La primera versión decía que lo cargado sin
         * señal "sube cuando vuelve la señal", y es falso: `public/sw.js` sólo
         * cachea GET (escudos y estáticos), no hay background sync ni cola de
         * escritura. Sin internet no se publica nada. Si algún día se agrega la
         * cola, esta respuesta se actualiza — mientras tanto dice lo que el
         * producto hace.
         */
        {
            pregunta: '¿Qué pasa si no hay internet en la cancha?',
            respuesta:
                'En vivo no se puede: publicar el momento necesita señal. Lo que alcanzaste a cargar antes de quedarte sin datos queda guardado. Si en esa cancha la señal es mala, la salida es anotar en papel y cargar el partido entero al terminar, desde donde haya señal: el fixture, la tabla y las estadísticas quedan exactamente iguales. Lo único que se pierde es el minuto a minuto.',
        },
    ],

    /**
     * La demo, al final.
     *
     * Antes era la sección #2, pegada al hero: pedía la reunión antes de haber
     * mostrado una sola cosa. Ahora cierra la página, justo arriba del
     * formulario que la concreta.
     */
    demo: {
        titulo: 'La demo es un partido tuyo, en vivo.',
        texto:
            'No te mostramos una pantalla de ejemplo. Elegís un partido de tu torneo, el fin de semana que te quede cómodo, y lo cargamos con vos desde la mesa de control. Termina el partido y ese club ya tiene su página, su fixture y sus estadísticas publicadas.',
        puntos: [
            'Lo coordinamos por WhatsApp durante la semana.',
            'La carga la hace alguien del club, acompañado. Son dos minutos por partido.',
            'Lo que quede cargado queda publicado: la demo no se borra.',
        ],
        accion: 'Pedir la demo',
    },

    cierre: {
        titulo: 'Empecemos por un partido.',
        texto:
            'Contanos qué torneo organizás y coordinamos la demo para el fin de semana que te quede cómodo.',
    },

    cruce: {
        texto: '¿No organizás el torneo, pero sos de un club?',
        accion: 'Ver G22 para clubes',
        destino: 'clubes',
    },
};
