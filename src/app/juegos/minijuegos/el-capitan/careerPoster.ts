// EL CAPITÁN — LA CARRERA, EN UNA IMAGEN.
//
// El póster cuenta lo mismo que la pantalla de retiro: quién fuiste, los
// números, lo que ganaste vos y la trayectoria club por club. Los dos leen
// `careerTrail.ts`, así que el recuerdo y lo que se comparte no pueden contar
// dos carreras distintas.
//
// ── Se dibuja en el CLIENTE, con canvas ─────────────────────────────────────
// Carrera de Rugby resuelve su tarjeta del otro lado —una ruta que arma el PNG
// con Satori y fuentes propias—, y eso pide token, ruta y fuentes comerciales
// viajando al build. Acá alcanza con canvas: el estado ya está en la máquina del
// jugador, no hay nada que subir y no hay nada que servir.
//
// ── DOS FORMATOS, UNA SOLA MAQUETA ──────────────────────────────────────────
// 9:16 para la historia y 4:5 para el feed. No son dos diseños: es la misma
// maqueta con dos hojas (`HOJAS`), y todo lo que las separa está ahí —el alto,
// los márgenes, cuánto respira la parte fija—. Un póster con dos rutinas de
// dibujo se desincroniza en el primer arreglo que se haga a una sola.
//
// El 9:16 lleva márgenes de arriba y de abajo mucho más grandes a propósito: en
// una historia esas dos franjas se las come la interfaz de la app (el nombre de
// quien publica arriba, la caja de respuesta abajo). Lo que entra ahí no es que
// se vea feo: no se ve.
//
// ── El modelo entra armado ──────────────────────────────────────────────────
// Este módulo no conoce el motor ni el catálogo: recibe textos, escudos ya
// resueltos, medallas y colores. Es la misma regla que `careerTrail.ts` —acá se
// dibuja, no se decide qué dice— y es lo que lo deja mirar sólo el canvas.

/** Las dos hojas: la historia y el feed. */
export type PosterFormat = '9:16' | '4:5';

export interface PosterTrophy {
    label: string;
    seasons: number[];
}

export interface PosterStint {
    clubName: string;
    /** URL del escudo, o `null` para caer en el monograma. */
    crestSrc: string | null;
    initials: string;
    /** Color del monograma, el mismo que usa la pantalla (`clubCrest.ts`). */
    color: string;
    /** «T3–T9 · 7 temporadas · 96 PJ» ya escrito. */
    meta: string;
    /**
     * Lo mismo en corto —«T3–T9 · 96 PJ»—, para la fila de una línea.
     *
     * Va como campo y no se recorta acá: el rango y los partidos los arma la
     * pantalla con las mismas reglas que usa para sí misma, y este módulo no
     * decide qué dice un texto (ver la cabecera).
     */
    metaShort: string;
    trophies: PosterTrophy[];
}

/**
 * UN PREMIO INDIVIDUAL, con su medalla.
 *
 * Va aparte de los `trophies` del club, y no es un capricho de maqueta: en la
 * pantalla el premio cuelga de la camiseta con la que se ganó porque ahí hay
 * lugar para una línea más; acá la medalla es una IMAGEN y no entra adentro de
 * una fila que además se comprime cuando la carrera es larga. Así que el póster
 * la sube a su propia banda —la misma fuente (`state.awards`), otro
 * agrupamiento— y le deja el año al lado para poder atarla a la camiseta.
 */
export interface PosterAward {
    label: string;
    /** La medalla (`public/premios/…`), o `null` para caer en el disco vacío. */
    artSrc: string | null;
    seasons: number[];
}

export interface PosterModel {
    /** El nombre de pila. Va chico, arriba del apellido. */
    name: string;
    /** El apellido, que es lo que se lee de lejos. */
    surname: string;
    /** «Apertura · 10 · retirado a los 34», ya escrito. */
    role: string;
    /** La bandera de tu país, para el renglón de identidad. */
    flagSrc: string | null;
    verdict: string;
    /** El dorado es del final que se gana. «Se terminó» no es un trofeo. */
    verdictTone: 'gold' | 'plain';
    stats: { label: string; value: string }[];
    awards: PosterAward[];
    stints: PosterStint[];
    national: {
        label: string;
        flagSrc: string | null;
        meta: string;
        trophies: PosterTrophy[];
    } | null;
}

// ── La paleta del póster ────────────────────────────────────────────────────
// Oscura siempre, sin importar el tema del sitio: lo que se comparte se ve en el
// feed de otra persona y ahí no existe `data-theme`. El verde es el de la casa y
// el dorado es SÓLO de las copas y las medallas — en cuanto se usa para
// decorar, deja de anunciar nada.
const INK = '#070c0b';
const INK_TOP = '#102019';
const INK_FOOT = '#040807';
const PANEL = 'rgba(255,255,255,0.045)';
const PANEL_LINE = 'rgba(255,255,255,0.085)';
const RULE = 'rgba(255,255,255,0.11)';
const TEXT = '#f2f5f3';
/** Los rótulos chicos. Sobre la tinta del fondo da ~5,6:1. */
const MUTED = 'rgba(242,245,243,0.60)';
const SOFT = 'rgba(242,245,243,0.86)';
const GREEN = '#00c078';
const GOLD = '#e8b23a';

// ── Las dos voces ───────────────────────────────────────────────────────────
// Articulat CF —la oblicua de la tarjeta de Carrera de Rugby— para todo lo que
// se lee como título, y la monoespaciada para todo lo que es DATO: el puesto,
// los rangos de temporadas, los rótulos de los números. Son dos familias que no
// se parecen en nada, que es la única forma de que una pareja tipográfica se
// note como decisión y no como accidente.
//
// Las dos caen con gracia: si el navegador no consigue el archivo, el póster
// sale con la fuente del sistema y no pierde una línea de sentido.
const DISPLAY = '"Articulat CF", "Outfit", system-ui, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", "Consolas", monospace';

const ARTICULAT: readonly [number, string][] = [
    [900, 'ArticulatCF-HeavyOblique'],
    [600, 'ArticulatCF-DemiBoldOblique'],
    [500, 'ArticulatCF-MediumOblique'],
];

let fuentes: Promise<void> | null = null;

/**
 * Las fuentes cargadas ANTES de medir nada.
 *
 * El canvas mide con la fuente que hay en el momento de la llamada: si se
 * dibuja antes de que la tipografía esté, el ajuste de tamaños se calcula contra
 * la del sistema y el apellido queda corto o desbordado cuando la buena llega.
 *
 * Los tres archivos son oblicuos pero se registran con `style: 'normal'` a
 * propósito: en el canvas la fuente se pide con una cadena de CSS, y una cara
 * declarada como itálica obliga a escribir `oblique 900 78px …` en cada una de
 * las veinte llamadas. La inclinación la trae el archivo igual.
 *
 * Nunca rechaza: un póster sin la tipografía de la casa sigue siendo el póster.
 */
function ensureFonts(): Promise<void> {
    if (fuentes) return fuentes;

    fuentes = (async () => {
        if (typeof document === 'undefined' || !('fonts' in document)) return;

        await Promise.all([
            ...ARTICULAT.map(async ([peso, archivo]) => {
                try {
                    const cara = new FontFace(
                        'Articulat CF',
                        `url(/fonts/articulat/${archivo}.otf)`,
                        { weight: String(peso), style: 'normal' },
                    );
                    await cara.load();
                    document.fonts.add(cara);
                } catch {
                    // Sin la cara, el póster cae a la fuente del sistema.
                }
            }),
            // La monoespaciada ya viene declarada por la hoja global; esto sólo
            // fuerza la descarga antes de medir.
            document.fonts.load('500 20px "JetBrains Mono"').catch(() => []),
        ]);
    })();

    return fuentes;
}

/**
 * La hoja: todo lo que separa un formato del otro.
 *
 * `k` es cuánto respira la parte fija —la cabecera, los números, las medallas—
 * en el formato alto. La trayectoria NO usa `k`: se reparte el alto que sobra,
 * que es de lo que se trata tener 570 px más.
 */
interface Hoja {
    W: number;
    H: number;
    M: number;
    padTop: number;
    padBottom: number;
    k: number;
}

const HOJAS: Readonly<Record<PosterFormat, Hoja>> = {
    '4:5': { W: 1080, H: 1350, M: 72, padTop: 48, padBottom: 62, k: 1 },
    // El margen del alto es el doble que el del feed, pero NO es el de la zona
    // segura de una historia (250 px arriba y abajo): esos 500 px se los comía a
    // la trayectoria, y el póster terminaba recortando clubes en el formato que
    // tiene 570 px MÁS. Lo que queda afuera de estos 120 px es la cabecera y el
    // pie —la marca y el sitio—, que es exactamente lo que se puede tapar sin
    // perder la carrera.
    '9:16': { W: 1080, H: 1920, M: 80, padTop: 118, padBottom: 128, k: 1.1 },
};

export const POSTER_FORMATS: readonly { id: PosterFormat; label: string; hint: string }[] = [
    { id: '9:16', label: '9:16', hint: 'Historia' },
    { id: '4:5', label: '4:5', hint: 'Feed' },
];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

/**
 * Una imagen, o `null` si no cargó.
 *
 * NO se rechaza nunca: un escudo que no está no puede voltear el póster entero.
 * Todas las fuentes son del mismo origen (los PNG locales y el proxy de la app),
 * así que el canvas no se mancha y `toBlob` sigue funcionando.
 */
function loadImage(src: string | null): Promise<HTMLImageElement | null> {
    if (!src) return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** Dibuja la imagen contenida en un cuadrado, sin deformarla. */
function drawContained(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    size: number,
) {
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const escala = Math.min(size / w, size / h);
    const dw = w * escala;
    const dh = h * escala;
    ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
}

/** Dibuja a un alto dado, respetando la proporción. Devuelve el ancho usado. */
function drawByHeight(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    alto: number,
): number {
    const w = img.naturalWidth || alto;
    const h = img.naturalHeight || alto;
    const ancho = (w / h) * alto;
    ctx.drawImage(img, x, y, ancho, alto);
    return ancho;
}

/**
 * TODOS LOS CLUBES ENTRAN. SIEMPRE.
 *
 * Es la regla dura de esta parte del póster: una carrera de nueve clubes tiene
 * que mostrar nueve clubes. Un «y 5 clubes más» es exactamente lo que el jugador
 * NO quiere compartir — la trayectoria es la carrera.
 *
 * El alto es fijo, así que lo que se ajusta es la FORMA de la fila, en tres
 * escalones, y en este orden:
 *
 *   1. `ancho`  — escudo grande, nombre arriba, rango abajo y las copas en
 *                 renglones propios. Es la fila que se quiere.
 *   2. `linea`  — una línea por club: escudo, nombre, rango y el contador de
 *                 copas. Se pierde el nombre de cada copa, no el club.
 *   3. `columnas` — lo mismo, en dos columnas. Veintidós clubes entran acá.
 *
 * Adentro del escalón 1 todavía se resumen las copas (cuatro renglones, después
 * uno, después ninguno y el contador), porque una copa nombrada es más que una
 * copa contada. Lo que ya no existe es recortar clubes.
 */
interface Bloque {
    stint: PosterStint;
    /** Las copas que se dibujan, ya resumidas si hicieron falta. */
    lineas: { label: string; years: string }[];
    /** Cuántas quedaron afuera de este bloque. */
    resto: number;
    /** Todas las que ganó ahí. Es lo que cuenta el contador dorado. */
    copas: number;
    /** La selección se pinta distinto: no es una camiseta más. */
    nacional?: boolean;
}

type ModoTrayectoria = 'ancho' | 'linea' | 'columnas';

// LO QUE MIDE UNA FILA MANDA CUÁNTAS ENTRAN, así que estos números son la
// diferencia entre mostrar la carrera entera y tener que comprimirla. Están al
// límite de lo que el bloque necesita —nombre, renglón de abajo y su aire—, no
// al de lo que se veía cómodo en una carrera de tres clubes.
const ROW = 92;
const LINE = 44;
const GAP = 16;
/** La fila de una línea: alto y aire. */
const FILA = 62;
const FILA_GAP = 10;
/** El aire entre las dos columnas. */
const COL_GAP = 20;
/**
 * Abajo de esto la fila ancha deja de leerse y se pasa a la de una línea.
 *
 * Está medido contra el ancho del póster y no elegido de memoria: a 0,62 el
 * nombre del club queda en 21 px sobre 1080 de ancho, que es el cuerpo del rótulo
 * de una tarjeta.
 */
const MIN_SCALE = 0.62;
/** Y abajo de esto, la línea entera se va a dos columnas (43 px de fila). */
const MIN_LINEA = 0.7;

function altoDe(bloques: Bloque[], escala: number): number {
    return bloques.reduce(
        (acc, b) => acc + ROW * escala + b.lineas.length * LINE * escala + GAP * escala,
        0,
    );
}

function años(seasons: number[]): string {
    return seasons.map((s) => `T${s}`).join(' ');
}

/**
 * CUÁNTAS VECES, no en qué años.
 *
 * Es sólo para los PREMIOS INDIVIDUALES, y la diferencia con las copas no es
 * estética. Una copa se gana con un club y en un año concreto: «Top 14 · T16»
 * dice algo que el jugador quiere releer. Un premio individual repetido es una
 * cantidad —«nueve veces el mejor del mundo»— y listarlo como «T10 T11 T12 T13
 * T14 T15 T16 T17 T18» convierte el logro más grande de la carrera en una tira
 * de etiquetas que no se lee y que además desborda el ancho de la tarjeta.
 *
 * Una sola vez no lleva marca: «×1» al lado de un premio se lee como un error.
 */
function veces(seasons: number[]): string {
    return seasons.length > 1 ? `×${seasons.length}` : '';
}

/** El alto de una lista de una línea por fila. */
function altoLineas(cuantas: number, escala: number): number {
    return cuantas * (FILA + FILA_GAP) * escala;
}

function armarBloques(stints: PosterStint[], maxCopas: number): Bloque[] {
    return stints.map((stint) => {
        const visibles = stint.trophies.slice(0, maxCopas);
        return {
            stint,
            lineas: visibles.map((t) => ({ label: t.label, years: años(t.seasons) })),
            resto: stint.trophies.length - visibles.length,
            copas: stint.trophies.length,
        };
    });
}

export async function buildCareerPoster(
    model: PosterModel,
    format: PosterFormat = '4:5',
): Promise<Blob | null> {
    const hoja = HOJAS[format];
    const { W, H, M, k } = hoja;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    await ensureFonts();

    const u = (px: number) => Math.round(px * k);
    const display = (peso: number, px: number) => `${peso} ${px}px ${DISPLAY}`;
    const mono = (px: number, peso = 500) => `${peso} ${px}px ${MONO}`;

    const fit = (text: string, maxW: number, peso: number, desde: number, hasta: number) => {
        let px = desde;
        ctx.font = display(peso, px);
        while (px > hasta && ctx.measureText(text).width > maxW) {
            px -= 2;
            ctx.font = display(peso, px);
        }
        return px;
    };

    const ellipsize = (text: string, maxW: number) => {
        if (ctx.measureText(text).width <= maxW) return text;
        let corto = text;
        while (corto.length > 1 && ctx.measureText(`${corto}…`).width > maxW) {
            corto = corto.slice(0, -1);
        }
        return `${corto.trim()}…`;
    };

    const espaciado = (px: string) => {
        // `letterSpacing` no existe en todos los navegadores. Donde no está, el
        // rótulo sale junto y no pasa nada más.
        if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = px;
    };

    const hairline = (x1: number, y1: number, x2: number, y2: number, color = RULE) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    /**
     * La medalla, adentro de un disco.
     *
     * El disco no es decoración: las tres medallas están dibujadas en estilos
     * distintos y una de ellas tiene la base casi negra, que sobre esta tinta
     * desaparece. El disco les da el mismo piso a las tres y el aro dorado dice
     * de qué familia son sin escribirlo.
     */
    const medalla = (img: HTMLImageElement | null, x: number, y: number, d: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        ctx.clip();
        if (img) drawContained(ctx, img, x + d * 0.17, y + d * 0.17, d * 0.66);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(x + d / 2, y + d / 2, d / 2 - 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,178,58,0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    };

    /** El rótulo de una sección: una barrita verde y el nombre en monoespaciada. */
    const seccion = (texto: string, y: number): number => {
        const alto = u(3);
        const largo = u(26);
        ctx.fillStyle = GREEN;
        ctx.fillRect(M, y + u(7), largo, alto);

        espaciado('3px');
        ctx.font = mono(u(17));
        ctx.fillStyle = MUTED;
        ctx.fillText(texto.toUpperCase(), M + largo + u(14), y);
        espaciado('0px');

        return u(34);
    };

    // ── Las imágenes, todas de una ──────────────────────────────────────────
    // Se piden antes de dibujar y en paralelo: son del mismo origen y el póster
    // se arma una sola vez, así que no hay nada que ganar pidiéndolas en el
    // medio del dibujo y sí mucho que perder (una fila a medio pintar).
    const clubes0 = armarBloques(model.stints, 4);
    const [logo, bandera, medallas, crestsTodos, banderaNacional] = await Promise.all([
        loadImage('/header-logo.png'),
        loadImage(model.flagSrc),
        Promise.all(model.awards.map((a) => loadImage(a.artSrc))),
        Promise.all(clubes0.map((b) => loadImage(b.stint.crestSrc))),
        loadImage(model.national?.flagSrc ?? null),
    ]);

    // ── Fondo ───────────────────────────────────────────────────────────────
    const fondo = ctx.createLinearGradient(0, 0, W * 0.42, H);
    fondo.addColorStop(0, INK_TOP);
    fondo.addColorStop(0.52, INK);
    fondo.addColorStop(1, INK_FOOT);
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, W, H);

    const brillo = ctx.createRadialGradient(W * 0.86, -40, 40, W * 0.86, -40, W * 0.78);
    brillo.addColorStop(0, 'rgba(0,192,120,0.24)');
    brillo.addColorStop(1, 'rgba(0,192,120,0)');
    ctx.fillStyle = brillo;
    ctx.fillRect(0, 0, W, H * 0.6);

    // Y un segundo resplandor, abajo y casi apagado: sin él el pie del póster se
    // apaga en un negro plano y la imagen parece cortada.
    const piso = ctx.createRadialGradient(W * 0.1, H * 1.02, 40, W * 0.1, H * 1.02, W * 0.7);
    piso.addColorStop(0, 'rgba(0,192,120,0.10)');
    piso.addColorStop(1, 'rgba(0,192,120,0)');
    ctx.fillStyle = piso;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // ── La marca ────────────────────────────────────────────────────────────
    // El logo de la casa va arriba a la izquierda y es una IMAGEN, no un texto
    // en mayúsculas: el póster viaja fuera del sitio y ahí la marca es lo único
    // que dice de dónde salió.
    let y = hoja.padTop;

    const logoH = u(40);
    if (logo) {
        drawByHeight(ctx, logo, M, y, logoH);
    } else {
        ctx.font = display(900, u(34));
        ctx.fillStyle = GREEN;
        ctx.fillText('G22 SCORES', M, y);
    }

    espaciado('4px');
    ctx.font = mono(u(19));
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText('EL CAPITÁN', W - M, y + logoH * 0.34);
    ctx.textAlign = 'left';
    espaciado('0px');

    y += logoH + u(24);
    hairline(M, y, W - M, y);
    y += u(30);

    // ── Quién fuiste ────────────────────────────────────────────────────────
    // El renglón de identidad va ARRIBA del nombre y en monoespaciada: es la
    // ficha —puesto, número, edad— y leerla primero es lo que hace que el
    // apellido se lea como un nombre propio y no como un dato más.
    const contenido = W - M * 2;
    let identidadX = M;

    if (bandera) {
        const alto = u(20);
        const ancho = drawByHeight(ctx, bandera, M, y + u(1), alto);
        identidadX = M + ancho + u(12);
    }

    espaciado('2px');
    ctx.font = mono(u(19));
    ctx.fillStyle = MUTED;
    ctx.fillText(ellipsize(model.role.toUpperCase(), W - M - identidadX), identidadX, y);
    espaciado('0px');
    y += u(32);

    if (model.name) {
        const px = fit(model.name, contenido, 600, u(38), u(24));
        ctx.fillStyle = 'rgba(242,245,243,0.62)';
        ctx.fillText(model.name, M, y);
        y += px + u(2);
    }

    // El avance del apellido va por debajo del cuerpo de la fuente y no encima:
    // con la línea base arriba, arriba y abajo de una mayúscula sobra aire, y a
    // 112 px ese sobrante son treinta píxeles de trayectoria.
    const apellido = (model.surname || model.name).toUpperCase();
    const apellidoPx = fit(apellido, contenido, 900, u(112), u(50));
    ctx.fillStyle = TEXT;
    ctx.fillText(apellido, M, y);
    y += apellidoPx * 0.88 + u(12);

    // El veredicto. En dorado sólo cuando la carrera se lo ganó, y con un halo
    // atrás para que se lea como un sello y no como un subtítulo más.
    //
    // El halo se pinta A SANGRE (de 0 a W) y con un radio que llega apagado a
    // las esquinas: recortado al ancho del contenido dejaba un rectángulo dorado
    // con los bordes marcados, que es justo lo contrario de un resplandor.
    const veredictoPx = fit(model.verdict, contenido, 900, u(38), u(24));
    if (model.verdictTone === 'gold') {
        const cy = y + veredictoPx * 0.45;
        const r = W * 0.6;
        ctx.save();
        ctx.translate(W * 0.3, cy);
        // Achatado: un resplandor redondo de este radio le tira dorado encima al
        // apellido y a los números. La elipse se queda en su renglón.
        ctx.scale(1, 0.3);
        const halo = ctx.createRadialGradient(0, 0, 10, 0, 0, r);
        halo.addColorStop(0, 'rgba(232,178,58,0.22)');
        halo.addColorStop(0.55, 'rgba(232,178,58,0.06)');
        halo.addColorStop(1, 'rgba(232,178,58,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
    }
    ctx.font = display(900, veredictoPx);
    ctx.fillStyle = model.verdictTone === 'gold' ? GOLD : SOFT;
    ctx.fillText(model.verdict, M, y);
    y += veredictoPx + u(32);

    // ── Los números ─────────────────────────────────────────────────────────
    // Sin cajas: dos reglas y una separación vertical alcanzan. Cuatro tarjetas
    // grises del mismo tamaño son la grilla de siempre, y acá el que manda es el
    // número — la caja sólo le agrega ruido alrededor.
    const cuantos = Math.max(model.stats.length, 1);
    const figuraW = contenido / cuantos;
    const figuraH = u(102);

    hairline(M, y, W - M, y);

    model.stats.forEach((stat, i) => {
        const x = M + i * figuraW;

        if (i > 0) {
            hairline(x, y + u(18), x, y + figuraH - u(16), 'rgba(255,255,255,0.08)');
        }

        ctx.textAlign = 'center';
        const valorPx = fit(stat.value, figuraW - u(24), 900, u(56), u(30));
        ctx.fillStyle = TEXT;
        ctx.fillText(stat.value, x + figuraW / 2, y + u(18));

        espaciado('1.5px');
        ctx.font = mono(u(16));
        ctx.fillStyle = MUTED;
        ctx.fillText(
            ellipsize(stat.label.toUpperCase(), figuraW - u(10)),
            x + figuraW / 2,
            y + u(18) + valorPx + u(10),
        );
        espaciado('0px');
        ctx.textAlign = 'left';
    });

    y += figuraH;
    hairline(M, y, W - M, y);
    y += u(30);

    // ── Lo que ganaste vos ──────────────────────────────────────────────────
    // Los premios individuales, con su medalla. La banda no existe si no ganaste
    // ninguno: un panel que dice «todavía nada» ocupa el alto de dos clubes para
    // no contar nada (CLAUDE.md §6, nada de columnas vacías).
    const premios = model.awards.slice(0, 3);
    const premiosFuera = model.awards.length - premios.length;

    if (premios.length > 0) {
        y += seccion('Logros personales', y);

        const d = u(66);
        premios.forEach((premio, i) => {
            medalla(medallas[i] ?? null, M, y, d);

            const textoX = M + d + u(20);
            const marca = veces(premio.seasons);
            const anchoAños = (() => {
                ctx.font = mono(u(20));
                return ctx.measureText(marca).width;
            })();

            ctx.font = display(600, u(28));
            ctx.fillStyle = TEXT;
            ctx.fillText(
                ellipsize(premio.label, W - M - textoX - anchoAños - u(24)),
                textoX,
                y + d * 0.18,
            );

            espaciado('1px');
            ctx.font = mono(u(20));
            ctx.fillStyle = GOLD;
            ctx.textAlign = 'right';
            ctx.fillText(marca, W - M, y + d * 0.22);
            ctx.textAlign = 'left';
            espaciado('0px');

            // La línea de abajo, apagada: separa una medalla de la siguiente sin
            // meter una caja alrededor de cada una.
            if (i < premios.length - 1) {
                hairline(M + d + u(20), y + d + u(7), W - M, y + d + u(7), 'rgba(255,255,255,0.07)');
            }

            y += d + u(16);
        });

        if (premiosFuera > 0) {
            ctx.font = mono(u(19));
            ctx.fillStyle = MUTED;
            ctx.fillText(`y ${premiosFuera} más`, M, y);
            y += u(28);
        }

        y += u(10);
    }

    // ── La trayectoria ──────────────────────────────────────────────────────
    y += seccion('La trayectoria', y);

    const pieAlto = u(70);
    const areaTop = y;
    const areaBottom = H - hoja.padBottom - pieAlto;
    const disponible = areaBottom - areaTop;

    // LA SELECCIÓN ES OTRA COSA, Y SE NOTA EN EL REPARTO. Se arma como un paso
    // —con su bandera en lugar del escudo— y ocupa alto como cualquier fila,
    // pero sus copas NO se resumen con las de los clubes: los caps valen más que
    // los títulos (CLAUDE.md §5), y un póster que borra el Rugby Championship
    // para nombrar el torneo de la Tercera cuenta la carrera al revés.
    const nacional: Bloque[] = model.national
        ? armarBloques([{
            clubName: model.national.label,
            crestSrc: model.national.flagSrc,
            initials: model.national.label.slice(0, 2).toUpperCase(),
            color: 'rgba(255,255,255,0.12)',
            meta: model.national.meta,
            metaShort: model.national.meta,
            trophies: model.national.trophies,
        }], 4).map((b) => ({ ...b, nacional: true }))
        : [];

    // EL ORDEN DE LO QUE SE RESIGNA, Y EL CLUB NO ESTÁ EN LA LISTA.
    //
    // Primero el DETALLE de las copas: cuatro renglones, después uno, después
    // ninguno y queda el contador dorado. Después la FORMA de la fila: la ancha
    // pasa a una línea. Y al final el ANCHO: dos columnas. Los nueve clubes
    // siguen estando en las tres.
    let modo: ModoTrayectoria = 'ancho';
    let clubes = clubes0;
    let escala = disponible / Math.max(altoDe([...clubes, ...nacional], 1), 1);

    if (escala < MIN_SCALE) {
        clubes = armarBloques(model.stints, 1);
        escala = disponible / Math.max(altoDe([...clubes, ...nacional], 1), 1);
    }

    if (escala < MIN_SCALE) {
        clubes = armarBloques(model.stints, 0);
        escala = disponible / Math.max(altoDe([...clubes, ...nacional], 1), 1);
    }

    /** Cuántos clubes van en la primera columna. Sólo en `columnas`. */
    let porColumna = 0;

    if (escala < MIN_SCALE) {
        modo = 'linea';
        escala = disponible / Math.max(altoLineas(clubes.length + nacional.length, 1), 1);

        if (escala < MIN_LINEA) {
            // La selección se queda a lo ancho, abajo de las dos columnas: no es
            // una camiseta más y no entra en el reparto (CLAUDE.md §5).
            modo = 'columnas';
            porColumna = Math.ceil(clubes.length / 2);
            escala = disponible / Math.max(altoLineas(porColumna + nacional.length, 1), 1);
        }
    }

    // Una carrera de dos clubes no deja media lámina en blanco: las filas crecen
    // antes de frenar. Más que esto ya no es una fila, es un cartel. La de una
    // línea crece bastante menos: estirada se lee como un botón.
    escala = Math.min(escala, modo === 'ancho' ? 1.4 : 1.12);

    const bloques = [...clubes, ...nacional];

    // ── EL HUECO DE LA CARRERA CORTA ────────────────────────────────────────
    // Dos clubes en el formato alto dejan medio póster vacío, y ninguna de las
    // dos salidas fáciles sirve: agrandar más las filas las convierte en
    // pancartas, y centrar la lista parte el hueco en dos y deja los dos.
    //
    // Así que el hueco se llena con algo que ES la carrera: el escudo del último
    // club, grande y apagado. Cuando el hueco es chico no aparece —un escudo de
    // 120 px al pie parece un error— y ahí sí se centra la lista, que con esa
    // cantidad de aire no se nota.
    const usado = modo === 'ancho'
        ? altoDe(bloques, escala)
        : altoLineas(modo === 'columnas' ? porColumna + nacional.length : bloques.length, escala);

    const sobra = disponible - usado;
    const hueco = sobra > u(200) ? sobra : 0;
    if (hueco === 0 && sobra > 0) y += sobra / 2;

    const rowH = ROW * escala;
    const lineH = LINE * escala;
    const gap = GAP * escala;
    const crestSize = Math.round(rowH * 0.6);
    const crests = [...crestsTodos, banderaNacional];

    /**
     * LA FILA DE UNA LÍNEA: escudo, club, cuándo y cuántas copas.
     *
     * Es la misma información que la fila ancha menos el nombre de cada copa —lo
     * único que se resigna— y sirve igual en una columna que en dos. Todo se
     * mide contra el alto de la fila y no contra constantes propias: así una
     * fila de 43 px y una de 70 son la misma fila, no dos diseños.
     */
    const filaLinea = (
        bloque: Bloque,
        x: number,
        arriba: number,
        ancho: number,
        alto: number,
        escudo: HTMLImageElement | null,
    ) => {
        ctx.fillStyle = bloque.nacional ? 'rgba(0,192,120,0.11)' : PANEL;
        roundRect(ctx, x, arriba, ancho, alto, Math.min(16, alto * 0.34));
        ctx.fill();
        ctx.strokeStyle = bloque.nacional ? 'rgba(0,192,120,0.32)' : PANEL_LINE;
        ctx.lineWidth = 1;
        ctx.stroke();

        const pad = Math.round(alto * 0.26);
        const d = Math.round(alto * 0.62);
        const medio = arriba + alto / 2;

        ctx.textBaseline = 'middle';

        if (escudo) {
            drawContained(ctx, escudo, x + pad, medio - d / 2, d);
        } else {
            ctx.fillStyle = bloque.stint.color;
            roundRect(ctx, x + pad, medio - d / 2, d, d, d * 0.28);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = display(900, Math.round(d * 0.42));
            ctx.textAlign = 'center';
            ctx.fillText(bloque.stint.initials, x + pad + d / 2, medio);
            ctx.textAlign = 'left';
        }

        let derecha = x + ancho - pad;

        if (bloque.copas > 0) {
            const px = Math.max(15, Math.round(alto * 0.28));
            const texto = String(bloque.copas);
            ctx.font = mono(px);
            ctx.fillStyle = GOLD;
            ctx.textAlign = 'right';
            ctx.fillText(texto, derecha, medio);
            const anchoTexto = ctx.measureText(texto).width;
            ctx.beginPath();
            ctx.arc(derecha - anchoTexto - px * 0.55, medio, Math.max(3.5, px * 0.2), 0, Math.PI * 2);
            ctx.fill();
            ctx.textAlign = 'left';
            derecha -= anchoTexto + px * 1.35;
        }

        const metaPx = Math.max(14, Math.round(alto * 0.25));
        ctx.font = mono(metaPx);
        const meta = bloque.stint.metaShort;
        const anchoMeta = ctx.measureText(meta).width;
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'right';
        ctx.fillText(meta, derecha, medio);
        ctx.textAlign = 'left';

        const nombreX = x + pad + d + Math.round(alto * 0.26);
        const nombreW = Math.max(40, derecha - anchoMeta - Math.round(alto * 0.3) - nombreX);
        const nombrePx = fit(bloque.stint.clubName, nombreW, 900, Math.max(20, Math.round(alto * 0.4)), 18);
        ctx.font = display(900, nombrePx);
        ctx.fillStyle = TEXT;
        ctx.fillText(ellipsize(bloque.stint.clubName, nombreW), nombreX, medio);

        ctx.textBaseline = 'top';
    };

    if (modo !== 'ancho') {
        const alto = FILA * escala;
        const paso = (FILA + FILA_GAP) * escala;

        if (modo === 'linea') {
            bloques.forEach((bloque, i) => {
                filaLinea(bloque, M, y, contenido, alto, crests[i] ?? null);
                y += paso;
            });
        } else {
            const anchoCol = (contenido - COL_GAP) / 2;

            clubes.forEach((bloque, i) => {
                const columna = i < porColumna ? 0 : 1;
                const fila = i - columna * porColumna;
                filaLinea(
                    bloque,
                    M + columna * (anchoCol + COL_GAP),
                    y + fila * paso,
                    anchoCol,
                    alto,
                    crests[i] ?? null,
                );
            });

            y += porColumna * paso;

            nacional.forEach((bloque) => {
                filaLinea(bloque, M, y, contenido, alto, banderaNacional);
                y += paso;
            });
        }
    }

    // La fila ancha, que es la que se quiere y la que casi siempre sale. Va
    // sobre una lista vacía en los otros dos modos —ya dibujaron arriba— en vez
    // de un `if` alrededor de doscientas líneas: el cuerpo es el mismo de antes.
    const anchas = modo === 'ancho' ? bloques : [];

    anchas.forEach((bloque, i) => {
        const alto = rowH + bloque.lineas.length * lineH;
        const x = M;
        const ancho = contenido;

        ctx.fillStyle = bloque.nacional ? 'rgba(0,192,120,0.11)' : PANEL;
        roundRect(ctx, x, y, ancho, alto, 22);
        ctx.fill();
        ctx.strokeStyle = bloque.nacional ? 'rgba(0,192,120,0.32)' : PANEL_LINE;
        ctx.lineWidth = 1;
        ctx.stroke();

        const crestX = x + 24;
        const crestY = y + (rowH - crestSize) / 2;
        const escudo = crests[i] ?? null;

        if (escudo) {
            drawContained(ctx, escudo, crestX, crestY, crestSize);
        } else {
            ctx.fillStyle = bloque.stint.color;
            roundRect(ctx, crestX, crestY, crestSize, crestSize, crestSize * 0.28);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = display(900, Math.round(crestSize * 0.4));
            ctx.textAlign = 'center';
            ctx.fillText(bloque.stint.initials, crestX + crestSize / 2, crestY + crestSize * 0.28);
            ctx.textAlign = 'left';
        }

        const textX = crestX + crestSize + 22;
        const textW = ancho - (textX - x) - 26;

        // LOS PISOS DE CUERPO NO SON DECORACIÓN. La fila se achica hasta 0,62 y
        // ahí el renglón de abajo caía a 12 px sobre 1080: en un teléfono
        // mirando la imagen entera eso son cuatro píxeles y medio, o sea nada.
        // El alto de la fila lo fija `ROW`, así que estos mínimos entran igual.
        const clubPx = fit(bloque.stint.clubName, textW, 900, Math.round(34 * escala), 20);
        ctx.fillStyle = TEXT;
        ctx.fillText(ellipsize(bloque.stint.clubName, textW), textX, crestY + 2);

        espaciado('0.5px');
        ctx.font = mono(Math.max(15, Math.round(19 * escala)));
        ctx.fillStyle = MUTED;
        ctx.fillText(ellipsize(bloque.stint.meta, textW), textX, crestY + clubPx + 12);
        espaciado('0px');

        let ly = y + rowH - lineH * 0.1;
        for (const linea of bloque.lineas) {
            // El punto dorado marca la copa sin depender de un emoji, que en
            // Windows sale en blanco y negro y en otro tamaño.
            ctx.fillStyle = GOLD;
            ctx.beginPath();
            ctx.arc(textX + 5, ly + lineH * 0.44, Math.max(4, 5 * escala), 0, Math.PI * 2);
            ctx.fill();

            ctx.font = mono(Math.max(15, Math.round(20 * escala)));
            const anchoAños = ctx.measureText(linea.years).width;
            ctx.fillStyle = 'rgba(232,178,58,0.78)';
            ctx.textAlign = 'right';
            ctx.fillText(linea.years, x + ancho - 26, ly + lineH * 0.2);
            ctx.textAlign = 'left';

            ctx.font = display(600, Math.max(19, Math.round(25 * escala)));
            ctx.fillStyle = SOFT;
            ctx.fillText(
                ellipsize(linea.label, textW - anchoAños - 44),
                textX + 24,
                ly + lineH * 0.16,
            );

            ly += lineH;
        }

        // El contador de copas del club. Con renglones dibujados dice cuántas
        // quedaron afuera («+2»); sin ninguno —el póster ya resumió todo— pasa a
        // ser la vitrina entera del club, y entonces se escribe como lo que es:
        // un número de copas con su punto dorado, no un resto.
        if (bloque.resto > 0) {
            const compacto = bloque.lineas.length === 0;
            const texto = compacto ? String(bloque.resto) : `+${bloque.resto}`;
            ctx.font = mono(Math.max(16, Math.round(20 * escala)));
            ctx.fillStyle = compacto ? GOLD : MUTED;
            ctx.textAlign = 'right';
            ctx.fillText(texto, x + ancho - 26, crestY + 6);

            if (compacto) {
                const anchoTexto = ctx.measureText(texto).width;
                ctx.beginPath();
                ctx.arc(
                    x + ancho - 26 - anchoTexto - Math.max(12, 14 * escala),
                    crestY + 6 + 10 * escala,
                    Math.max(4, 5 * escala),
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }

            ctx.textAlign = 'left';
        }

        y += alto + gap;
    });

    // La última camiseta, en marca de agua. Va detrás de nada —el hueco está
    // vacío— y por eso puede ser grande sin molestar a una sola línea de texto.
    const ultimoBloque = clubes[clubes.length - 1];
    const ultimoEscudo = crests[clubes.length - 1] ?? null;
    if (hueco > 0 && ultimoBloque) {
        const lado = Math.min(hueco * 0.78, W * 0.42);
        const cx = W / 2;
        const cy = y + hueco / 2;

        ctx.save();
        if (ultimoEscudo) {
            ctx.globalAlpha = 0.085;
            drawContained(ctx, ultimoEscudo, cx - lado / 2, cy - lado / 2, lado);
        } else {
            // Sin escudo real, las iniciales: es exactamente lo que el juego
            // dibuja para ese club en todas las demás pantallas.
            ctx.globalAlpha = 0.1;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = display(900, Math.round(lado * 0.62));
            ctx.fillStyle = ultimoBloque.stint.color;
            ctx.fillText(ultimoBloque.stint.initials, cx, cy);
        }
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    }

    // ── El pie ──────────────────────────────────────────────────────────────
    const pieY = H - hoja.padBottom - u(30);
    hairline(M, pieY - u(30), W - M, pieY - u(30));

    espaciado('1px');
    ctx.font = mono(u(21));
    ctx.fillStyle = GREEN;
    ctx.fillText('g22scores.com', M, pieY);

    espaciado('2px');
    ctx.font = mono(u(17));
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText('SIMULÁ TU CARRERA DE RUGBY', W - M, pieY + u(3));
    ctx.textAlign = 'left';
    espaciado('0px');

    return await new Promise<Blob | null>((resolve) => {
        try {
            canvas.toBlob((b) => resolve(b), 'image/png');
        } catch {
            resolve(null);
        }
    });
}
