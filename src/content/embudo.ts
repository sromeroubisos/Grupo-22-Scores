/**
 * El embudo comercial, en lo que las dos puertas comparten.
 *
 * G22 se le vende a dos personas distintas y hay que dejar de fingir que son
 * una: el que ORGANIZA un torneo (una unión, una liga, varias categorías y
 * varias canchas el mismo sábado) y el que REPRESENTA un club (una ficha, sus
 * planteles, sus estadísticas). Cada uno tiene su landing —`/para-torneos` y
 * `/para-clubes`— y este archivo es lo único que comparten: los tipos, la
 * atribución, los módulos del producto y el formulario.
 *
 * Lo que NO vive acá: los precios. Esos son de `lib/billing/plans.ts` y se
 * muestran en /contacto, que sigue siendo la página de planes y checkout. Las
 * dos landings califican y piden la demo; /contacto cobra.
 */

export const PARA_CLUBES_HREF = '/para-clubes';
export const PARA_TORNEOS_HREF = '/para-torneos';

/** Cuál de las dos puertas. La puerta ES la URL, no un parámetro. */
export type Embudo = 'clubes' | 'torneos';

export const RUTAS_EMBUDO: readonly string[] = [PARA_CLUBES_HREF, PARA_TORNEOS_HREF];

/**
 * De dónde salió el click — la UBICACIÓN, nada más.
 *
 * Antes esto mezclaba ubicación y destino porque había una sola landing. Ahora
 * el destino es la ruta, así que el `?ref=` volvió a significar una sola cosa y
 * la lista se achicó sola. Los valores viejos ('barra', 'torneo', 'club',
 * 'partido-vacio') ya no se emiten: la barra inferior y las líneas contextuales
 * se borraron. No hay migración ni backfill — `club_leads.origen` es texto
 * libre y las filas viejas quedan como están. Un `?ref=barra` de un link
 * guardado en favoritos resuelve a `null` y no rompe nada.
 */
export type PromoOrigen = 'sidebar' | 'feed' | 'nav' | 'cruce';

export const ORIGENES: readonly PromoOrigen[] = ['sidebar', 'feed', 'nav', 'cruce'];

export function esOrigenValido(valor: string | null | undefined): valor is PromoOrigen {
    return typeof valor === 'string' && (ORIGENES as readonly string[]).includes(valor);
}

export function hrefParaClubes(origen: PromoOrigen): string {
    return `${PARA_CLUBES_HREF}?ref=${origen}`;
}

export function hrefParaTorneos(origen: PromoOrigen): string {
    return `${PARA_TORNEOS_HREF}?ref=${origen}`;
}

/**
 * Lo que se guarda en `club_leads.origen`.
 *
 * El embudo va adelante y la ubicación atrás: `torneos:feed`, `clubes:nav`.
 * No pide columna nueva —la de la base es `text` y el schema del lead acepta
 * hasta 40 caracteres— y con un solo campo se responden las dos preguntas que
 * importan: por qué puerta entró y qué ubicación lo trajo.
 */
export function origenParaLead(embudo: Embudo, origen: PromoOrigen | null): string {
    return origen ? `${embudo}:${origen}` : embudo;
}

/**
 * Cuántos torneos publican hoy en G22.
 *
 * Queda en `null` hasta que haya un número CONTADO CONTRA LA BASE. Un "+30"
 * inventado en una página de ventas es justo el dato que un dirigente chequea, y
 * si no cierra no vuelve. Mientras sea null, el tercer número lo pone el
 * producto: cuántos módulos salen de la misma carga, que es verdad sin depender
 * de ninguna cuenta y se calcula solo de `MODULOS`.
 */
export const TORNEOS_PUBLICANDO: number | null = null;

/* ── Los tipos que las dos landings cumplen ────────────────────────────── */

export type Numero = { valor: string; etiqueta: string; detalle: string };

export type Modulo = {
    id: string;
    icono: 'vivo' | 'torneo' | 'stats' | 'equipo' | 'fantasy' | 'prode' | 'club' | 'jugador';
    titulo: string;
    texto: string;
};

export type Paso = { numero: string; titulo: string; texto: string };

export type Faq = { pregunta: string; respuesta: string };

/** Un link a una parte viva del sitio. La prueba no es un embed: es el sitio. */
export type Enlace = { href: string; titulo: string; texto: string };

/**
 * Un momento del club: el sábado, el lunes, la temporada.
 *
 * El framing temporal ordena el argumento mejor que una lista de funciones,
 * porque es como el dirigente vive el club. No compra "estadísticas": compra
 * saber qué está pasando el sábado y llegar el martes con los números hechos.
 */
export type Momento = { id: string; cuando: string; titulo: string; parrafos: readonly string[] };

/**
 * El bloque puente: el club cuyo torneo todavía no está en G22.
 *
 * Es la objeción que más frena —"¿para qué me sumo si mi torneo no está?"— y a
 * la vez la mejor vía de entrada: un club adentro es una conversación abierta
 * con la organización de su torneo.
 */
export type Puente = {
    titulo: string;
    texto: string;
    accion: string;
    otraPuerta: string;
};

export type ContenidoEmbudo = {
    embudo: Embudo;
    meta: { titulo: string; descripcion: string };
    hero: {
        etiqueta: string;
        gancho: string;
        titulo: readonly string[];
        subtitulo: string;
        accionPrimaria: string;
        /**
         * La salida secundaria del hero.
         *
         * Cuando apunta a un club de verdad vale más que cualquier bloque de
         * features: la competencia muestra un mockup, acá se abre una página
         * con datos cargados. Si el club deja de estar publicado, se saca —una
         * prueba rota es peor que ninguna.
         */
        accionSecundaria: { texto: string; href: string };
    };
    numeros: Numero[];
    /** Los tres momentos. Vacío = la sección no existe. */
    momentos: readonly Momento[];
    modulosTitulo: string;
    modulosTexto: string;
    modulos: readonly Modulo[];
    pasosTitulo: string;
    pasos: Paso[];
    /** El bloque puente. Ausente = la sección no existe. */
    puente?: Puente;
    /** Los roles que ofrece el select, que no son los mismos en las dos puertas. */
    roles: readonly { valor: string; label: string }[];
    /**
      * La prueba en vivo. Ausente = la sección no existe.
      *
      * En /para-clubes no está, y no es un olvido: el hero ya manda a la página
      * de un club de verdad, que es la misma prueba y mejor puesta. Repetirla en
      * el medio sería decir dos veces lo mismo.
      */
    prueba?: { titulo: string; texto: string; enlaces: Enlace[] };
    faq: Faq[];
    /**
      * La demo como sección aparte. Ausente = no existe, y el cierre la cuenta.
      *
      * En /para-clubes el cierre YA dice "elegís una fecha y cargamos un partido
      * con vos": una sección arriba diciendo lo mismo es relleno.
      */
    demo?: { titulo: string; texto: string; puntos: readonly string[]; accion: string };
    cierre: { titulo: string; texto: string };
    /**
     * El cruce a la otra puerta guarda el DESTINO, no la función que arma el
     * href.
     *
     * Y no es preferencia de estilo: el contenido viaja de un Server Component
     * a `EmbudoLanding`, que es cliente. Una función ahí adentro no se puede
     * serializar —"Functions cannot be passed directly to Client Components"—,
     * el render del servidor se cae y Next devuelve la página VACÍA para que la
     * dibuje el navegador. En una landing de ventas eso es no existir para
     * Google. Todo lo que entre a `ContenidoEmbudo` tiene que ser JSON puro.
     */
    cruce: { texto: string; accion: string; destino: Embudo };
};

/* ── Los módulos: son el producto, y el producto es uno solo ───────────── */

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

/**
 * El tercer número, mientras no haya una cuenta contra la base.
 *
 * Se calcula de `MODULOS` para que no pueda mentir: si mañana se suma o se saca
 * un módulo, el número se corrige solo. Lo que NO dice es nada de precio —la FAQ
 * es clara en que se arma en la reunión según los módulos que uses— así que el
 * detalle habla de la carga, que es lo verdadero: se carga una vez y sale todo.
 */
export const NUMERO_MODULOS: Numero = {
    valor: String(MODULOS.length),
    etiqueta: 'módulos, una sola carga',
    detalle: 'En vivo, torneo, estadísticas, equipo de la semana, fantasy y prode. La información no se sube dos veces.',
};

/* ── La placa promocional de la home: una unidad, dos puertas ──────────── */

export const PROMO = {
    etiqueta: 'G22 para clubes y torneos',
    titulo: 'Tu torneo, donde la gente ya lo está mirando.',
    modulos: [
        'En vivo · Estadísticas · Fantasy',
        'Prode · Equipo de la Semana',
    ],
    /**
     * Las dos salidas, con jerarquía. El botón resuelve la decisión por el que
     * no quiere decidir —y apunta a la venta grande—; el link de texto está para
     * el dirigente de club que ya se vio reflejado en el título.
     */
    accionTorneos: 'Organizo un torneo',
    accionClubes: 'Represento un club',
    pasos: [
        'Cargás el partido desde el celular',
        'Aparece en vivo en G22',
        'El hincha sigue a su jugador',
    ],
} as const;

/* ── El formulario: uno solo para las dos puertas ──────────────────────── */

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
        /* En la puerta del club la pregunta es más corta: club, y nada más. */
        club: { label: 'Club', placeholder: 'Tala Rugby Club' },
        rol: { label: 'Rol' },
        telefono: { label: 'WhatsApp o teléfono', placeholder: '11 5555 5555' },
        email: { label: 'Email', placeholder: 'juan@club.com.ar', opcional: 'opcional' },
        equipos: { label: 'Cantidad de equipos' },
        /*
         * El torneo se pregunta ABIERTO, no con un select del catálogo: la mitad
         * de los clubes que escriben juegan un torneo que todavía no está en
         * G22, y un desplegable donde el suyo no aparece los manda a cerrar la
         * pestaña. Además, lo que escriban es la lista de torneos a los que hay
         * que ir a golpear la puerta.
         */
        torneo: { label: 'Torneo en el que juega', placeholder: 'Top 10 del Centro' },
        categorias: { label: 'Categorías que juegan' },
        mensaje: { label: 'Mensaje', placeholder: 'Contanos qué torneo organizás.', opcional: 'opcional' },
        mensajeClub: { label: 'Mensaje', placeholder: 'Contanos de tu club.', opcional: 'opcional' },
    },
} as const;

export const ROLES_TORNEO = [
    { valor: 'dirigente', label: 'Dirigente' },
    { valor: 'entrenador', label: 'Entrenador' },
    { valor: 'prensa', label: 'Prensa' },
    { valor: 'otro', label: 'Otro' },
] as const;

/** En un club también escribe el jugador. En una organización de torneo, no. */
export const ROLES_CLUB = [
    { valor: 'dirigente', label: 'Dirigente' },
    { valor: 'entrenador', label: 'Entrenador' },
    { valor: 'prensa', label: 'Prensa' },
    { valor: 'jugador', label: 'Jugador' },
    { valor: 'otro', label: 'Otro' },
] as const;

/**
 * Las categorías, para el formulario de /para-clubes.
 *
 * Reemplazan a "cantidad de equipos", que es la pregunta del que organiza: un
 * club tiene UN equipo por categoría, así que preguntarle cuántos maneja no
 * dice nada. Qué categorías juegan sí, y da la misma medida de tamaño.
 */
export const CATEGORIAS = [
    { valor: 'primera', label: 'Primera' },
    { valor: 'intermedia', label: 'Intermedia' },
    { valor: 'm19', label: 'M19' },
    { valor: 'm17', label: 'M17' },
    { valor: 'm16', label: 'M16' },
    { valor: 'femenino', label: 'Femenino' },
    { valor: 'infantiles', label: 'Infantiles' },
] as const;

export const RANGOS_EQUIPOS = [
    { valor: '1-4', label: '1 a 4' },
    { valor: '5-10', label: '5 a 10' },
    { valor: '11-20', label: '11 a 20' },
    { valor: '+20', label: 'Más de 20' },
] as const;
