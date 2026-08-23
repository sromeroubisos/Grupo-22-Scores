/**
 * G22 para clubes — el texto entero del embudo comercial.
 *
 * Todo lo que lee un dirigente sale de acá: la placa del sidebar, la tarjeta
 * del feed, la barra inferior, las líneas contextuales y la página
 * /para-clubes. Si es una frase que se ve, se edita en este archivo y no en un
 * JSX: una promesa comercial repartida en seis componentes envejece mal y
 * termina diciendo tres cosas distintas en tres lugares.
 *
 * Lo que NO vive acá: los precios. Esos son de `lib/billing/plans.ts` y se
 * muestran en /contacto, que sigue siendo la página de planes y checkout.
 * /para-clubes califica y pide la demo; /contacto cobra.
 */

export const PARA_CLUBES_HREF = '/para-clubes';

/**
 * De dónde salió el click. Viaja en `?ref=` hasta el formulario y se guarda con
 * el lead: es la única forma de saber qué ubicación convierte y cuál sólo ocupa
 * lugar. Sin esto, dentro de tres meses la discusión sobre si la barra inferior
 * sirve se resuelve por opinión.
 */
export type PromoOrigen =
    | 'sidebar'
    | 'feed'
    | 'barra'
    | 'nav'
    | 'torneo'
    | 'club'
    | 'partido-vacio';

export const ORIGENES: readonly PromoOrigen[] = [
    'sidebar',
    'feed',
    'barra',
    'nav',
    'torneo',
    'club',
    'partido-vacio',
];

export function hrefParaClubes(origen: PromoOrigen): string {
    return `${PARA_CLUBES_HREF}?ref=${origen}`;
}

export function esOrigenValido(valor: string | null | undefined): valor is PromoOrigen {
    return typeof valor === 'string' && (ORIGENES as readonly string[]).includes(valor);
}

/**
 * Cuántos torneos publican hoy en G22.
 *
 * Queda en `null` a propósito hasta que haya un número contado contra la base.
 * Un "+30" inventado en una página de ventas es justo el dato que un dirigente
 * chequea, y si no cierra no vuelve. Mientras sea null, la tercera tarjeta de
 * números muestra el compromiso de la demo, que es verdad sin depender de
 * ninguna cuenta.
 */
export const TORNEOS_PUBLICANDO: number | null = null;

/** La placa promocional, en sus dos tamaños. */
export const PROMO = {
    etiqueta: 'G22 para clubes',
    titulo: 'Tu torneo, donde la gente ya lo está mirando.',
    modulos: [
        'Partido en vivo · Fantasy · Prode',
        'Estadísticas · Equipo de la Semana',
    ],
    /** Tarjeta del feed: es chica, no vende, califica. */
    accionFeed: 'Ver cómo funciona',
    /** Placa del sidebar: desde que las noticias se fueron, tiene la columna entera. */
    accionSidebar: 'Pedir una demo',
    pasos: [
        'Cargás el partido desde el celular',
        'Aparece en vivo en G22',
        'El hincha sigue a su jugador',
    ],
} as const;

export const BARRA = {
    texto: '¿Organizás un torneo? Publicalo en vivo en G22.',
    accion: 'Ver más',
    cerrar: 'Cerrar el aviso para clubes',
} as const;

export const CONTEXTUAL = {
    torneo: '¿Organizás un torneo? Publicalo en G22',
    club: (nombre: string) => `¿Sos dirigente de ${nombre}? Gestioná tu equipo en G22`,
    clubSinNombre: '¿Sos dirigente del club? Gestioná tu equipo en G22',
    partidoVacio: 'Este partido no tiene estadísticas cargadas. Si sos del club, podés cargarlas',
} as const;

export const META = {
    titulo: 'G22 para clubes — Publicá tu torneo en vivo',
    descripcion:
        'Cargás el partido desde el celular y aparece al instante en G22 Scores, junto al Top 14 y al Top 10 del Centro. Fixture, posiciones, estadísticas, fantasy y prode. Pedí una demo con un partido de tu torneo.',
} as const;

export const HERO = {
    etiqueta: 'G22 para clubes',
    titulo: 'Tu torneo, donde la gente ya lo está mirando.',
    subtitulo:
        'Cargás el partido en vivo y aparece al instante en G22 Scores, junto al Top 14 y al Top 10 del Centro. Con fantasy, prode, estadísticas y equipo de la semana incluidos.',
    accionPrimaria: 'Pedí una demo con un partido tuyo',
    accionSecundaria: 'Ver cómo funciona',
} as const;

/**
 * La demo, explicada donde iba la prueba en vivo.
 *
 * No hay un torneo embebido a propósito: la prueba de verdad es el fin de
 * semana, con un partido del club que pregunta. Un fixture ajeno arriba de una
 * página de ventas demuestra que la plataforma anda, no que le sirve a él.
 */
export const DEMO = {
    titulo: 'La demo es un partido tuyo, en vivo.',
    texto:
        'No te mostramos una pantalla de ejemplo. Elegís un partido de tu torneo, el fin de semana que te quede cómodo, y lo cargamos con vos desde la mesa de control. Termina el partido y tu club ya tiene su página, su fixture y sus estadísticas publicadas.',
    puntos: [
        'Lo coordinamos por WhatsApp durante la semana.',
        'La carga la hace alguien del club, acompañado. Son dos minutos por partido.',
        'Lo que quede cargado queda publicado: la demo no se borra.',
    ],
    accion: 'Pedir la demo',
} as const;

/** Los tres números que matan las tres objeciones típicas. */
export type Numero = { valor: string; etiqueta: string; detalle: string };

export const NUMEROS: Numero[] = [
    {
        valor: '2 min',
        etiqueta: 'para crear un partido',
        detalle: 'Equipos, hora y cancha. El fixture completo se arma una vez y queda.',
    },
    {
        valor: '0',
        etiqueta: 'instalación',
        detalle: 'Se carga desde el celular, en la mesa de control. No hay nada que bajar.',
    },
    TORNEOS_PUBLICANDO === null
        ? {
            valor: 'Sábado',
            etiqueta: 'la demo, con tu partido',
            detalle: 'Elegís la fecha. Lo cargamos juntos y queda publicado.',
        }
        : {
            valor: `+${TORNEOS_PUBLICANDO}`,
            etiqueta: 'torneos ya publican en G22',
            detalle: 'Uniones, clubes y organizadores independientes.',
        },
];

export type Modulo = {
    id: string;
    icono: 'vivo' | 'torneo' | 'stats' | 'equipo' | 'fantasy' | 'prode';
    titulo: string;
    texto: string;
};

export const MODULOS: Modulo[] = [
    {
        id: 'vivo',
        icono: 'vivo',
        titulo: 'Partido en vivo',
        texto: 'Try, penal, tarjeta, cambio. Minuto a minuto, mientras se juega.',
    },
    {
        id: 'torneo',
        icono: 'torneo',
        titulo: 'Página de torneo',
        texto: 'Fixture, posiciones y sanciones, en una dirección propia que podés compartir.',
    },
    {
        id: 'stats',
        icono: 'stats',
        titulo: 'Estadísticas',
        texto: 'Por jugador y por equipo. Tries, tackles, palos y minutos, temporada a temporada.',
    },
    {
        id: 'equipo',
        icono: 'equipo',
        titulo: 'Equipo de la Semana',
        texto: 'El quince de la fecha, armado con lo que se cargó. Sale solo y se comparte.',
    },
    {
        id: 'fantasy',
        icono: 'fantasy',
        titulo: 'Fantasy',
        texto: 'El hincha arma su equipo con jugadores de tu torneo y vuelve cada fecha.',
    },
    {
        id: 'prode',
        icono: 'prode',
        titulo: 'Prode',
        texto: 'Pronósticos por fecha, con ligas privadas entre socios del club.',
    },
];

export type Paso = { numero: string; titulo: string; texto: string };

export const PASOS: Paso[] = [
    {
        numero: '01',
        titulo: 'Cargás el evento',
        texto: 'Desde el celular, en la mesa de control. Un try son dos toques.',
    },
    {
        numero: '02',
        titulo: 'Aparece en vivo',
        texto: 'El marcador se actualiza en G22 al instante, en la misma pantalla donde ya miran el Top 14.',
    },
    {
        numero: '03',
        titulo: 'El hincha sigue a su jugador',
        texto: 'Termina el partido y quedan las estadísticas, la tabla y el equipo de la semana.',
    },
];

export type Faq = { pregunta: string; respuesta: string };

export const FAQ: Faq[] = [
    {
        pregunta: '¿Cuánto sale?',
        respuesta:
            'Depende de lo que necesites. No hay un paquete cerrado: en la reunión vemos cuántos torneos manejás, cuántas categorías y qué módulos vas a usar, y con eso armamos el precio. La demo no se cobra.',
    },
    {
        pregunta: '¿Quién carga los datos?',
        respuesta:
            'Alguien del club, desde el celular. Le damos un usuario con permisos sobre tu torneo y nada más. Si preferís, el primer fin de semana lo cargamos juntos.',
    },
    {
        pregunta: '¿Sirve para juveniles y M17?',
        respuesta:
            'Sí. Cada categoría es su propio torneo, con su fixture y su tabla. Los juveniles ya tienen su lugar en el sitio, separado de la primera.',
    },
    {
        pregunta: '¿Puedo migrar mi torneo actual?',
        respuesta:
            'Sí. Importamos el fixture y los planteles desde una planilla, y si tu torneo ya tiene historial publicado en otra fuente, lo cargamos como temporadas anteriores.',
    },
    /*
     * OJO CON ESTA RESPUESTA. La primera versión decía que lo cargado sin señal
     * "sube cuando vuelve la señal", y es falso: `public/sw.js` sólo cachea GET
     * (escudos y estáticos), no hay background sync ni cola de escritura. Sin
     * internet no se publica nada. Si algún día se agrega la cola, esta
     * respuesta se actualiza — mientras tanto dice lo que el producto hace.
     */
    {
        pregunta: '¿Qué pasa si no tengo internet en la cancha?',
        respuesta:
            'En vivo no se puede: publicar el momento necesita señal. Lo que alcanzaste a cargar antes de quedarte sin datos queda guardado. Si en tu cancha la señal es mala, la salida es anotar en papel y cargar el partido entero al terminar, desde donde tengas señal: el fixture, la tabla y las estadísticas quedan exactamente iguales. Lo único que se pierde es el minuto a minuto.',
    },
];

export const CIERRE = {
    titulo: 'Empecemos por un partido.',
    texto:
        'Contanos qué torneo organizás y coordinamos la demo para el fin de semana que te quede cómodo.',
} as const;

export const FORMULARIO = {
    titulo: 'Pedí tu demo',
    ayuda: 'Te escribimos dentro de las 24 hs hábiles. Los campos con asterisco son obligatorios.',
    enviar: 'Pedir la demo',
    enviando: 'Enviando...',
    exito: 'Listo. Te escribimos dentro de las 24 hs hábiles para coordinar la demo con un partido de tu torneo.',
    errorGenerico: 'No pudimos enviar el formulario. Probá de nuevo en un minuto.',
    whatsapp: 'Solicitar demo por WhatsApp',
    whatsappAyuda: 'O si preferís, dejanos los datos y te escribimos nosotros.',
    campos: {
        nombre: { label: 'Nombre y apellido', placeholder: 'Juan Pérez' },
        organizacion: { label: 'Club o torneo', placeholder: 'Club Atlético Rugby' },
        rol: { label: 'Rol' },
        telefono: { label: 'WhatsApp o teléfono', placeholder: '11 5555 5555' },
        email: { label: 'Email', placeholder: 'juan@club.com.ar', opcional: 'opcional' },
        equipos: { label: 'Cantidad de equipos' },
        mensaje: { label: 'Mensaje', placeholder: 'Contanos qué torneo organizás.', opcional: 'opcional' },
    },
} as const;

export const ROLES = [
    { valor: 'dirigente', label: 'Dirigente' },
    { valor: 'entrenador', label: 'Entrenador' },
    { valor: 'prensa', label: 'Prensa' },
    { valor: 'otro', label: 'Otro' },
] as const;

export const RANGOS_EQUIPOS = [
    { valor: '1-4', label: '1 a 4' },
    { valor: '5-10', label: '5 a 10' },
    { valor: '11-20', label: '11 a 20' },
    { valor: '+20', label: 'Más de 20' },
] as const;
