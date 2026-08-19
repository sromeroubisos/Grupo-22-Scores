// EL CAPITÁN — el color de la camiseta de cada unión.
//
// Presentación pura: no entra al motor ni al estado. Un color no invalida una
// partida guardada, así que cambiar una fila de acá no sube ninguna versión.
//
// ── Por qué esta tabla no se importa de Carrera de Rugby ──
// Ese juego tiene la suya (`carrera-rugby/kitColors.ts`) y dice lo mismo, pero
// para el fallback de un país sin curar importa `hashSeed` desde el barrel
// `@/features/career`, que arrastra el motor entero de aquel juego —run-career,
// los eventos, la i18n— al bundle de este. Duplicar cincuenta colores sale más
// barato que eso, y el CLAUDE.md de captain ya declara UNA sola puerta hacia
// career (`data/catalogs.ts`): esta no la abre.
//
// El hash es el de ESTE motor, por la misma razón.
import { hashSeed } from '@/features/captain';

/**
 * La camiseta con la que juega cada unión. NO es la bandera: Irlanda tiene
 * bandera tricolor y camiseta verde, Argentina bandera celeste y blanca y
 * camiseta a bastones celestes. Se elige el tono dominante de la prenda.
 */
const KIT: Record<string, string> = {
    ar: '#6CACE4', // celeste
    nz: '#1A1A1A', // negro
    za: '#0B6E4F', // verde springbok
    au: '#F5C518', // oro
    fr: '#1B2A6B', // azul
    ie: '#12805C', // verde
    'gb-eng': '#DCE3E8', // blanco (con tono, para que se vea la prenda)
    'gb-sct': '#132B57', // azul marino
    'gb-wls': '#B3131B', // rojo
    it: '#1E63B0', // azzurro
    uy: '#4E84C4', // celeste
    cl: '#C8322B', // rojo
    br: '#0F9B4C', // verde
    py: '#C8322B',
    pe: '#C8322B',
    co: '#F2C230',
    pt: '#0B6E3B', // verde
    es: '#A3161F', // rojo
    ge: '#C8322B', // rojo
    ro: '#F2C230', // amarillo
    na: '#123B7A', // azul
    ke: '#0B6E3B',
    zw: '#0B6E3B',
    tn: '#C8322B',
    fj: '#DCE3E8', // blanco
    ws: '#12315E', // azul
    to: '#B3131B', // rojo
    jp: '#B0223A', // rojo cereza
    kr: '#1B2A6B',
    us: '#2C3E70', // azul
    ca: '#C8322B', // rojo
    de: '#1A1A1A',
    nl: '#E06C1E', // naranja
    be: '#B3131B',
    ch: '#C8322B',
    at: '#C8322B',
    pl: '#C8322B',
    cz: '#1B2A6B',
    hr: '#C8322B',
    rs: '#C8322B',
    se: '#F2C230',
    dk: '#C8322B',
    no: '#C8322B',
    fi: '#1E63B0',
    hk: '#B3131B',
    sg: '#C8322B',
    my: '#F2C230',
    ci: '#E06C1E',
    ug: '#1A1A1A',
    mg: '#C8322B',
    sn: '#0B6E3B',
    ma: '#0B6E3B',
    dz: '#0B6E3B',
    il: '#1E63B0',
    ae: '#1A1A1A',
    ck: '#0B6E3B',
    pg: '#C8322B',
};

/** El gris de prenda de cuando todavía no hay país elegido. */
const SIN_PAIS = '#D8DEE3';

/**
 * Color de la camiseta.
 *
 * Para un país sin curar —y ahora se ofrece el catálogo entero, así que son
 * doscientos y pico— un tono DERIVADO del código con el hash determinístico del
 * motor: el mismo país da siempre el mismo color, que es lo que permite
 * reconocerlo de una pantalla a la otra.
 */
export function kitColorOf(countryCode: string | null): string {
    if (countryCode === null) return SIN_PAIS;
    const curado = KIT[countryCode];
    if (curado !== undefined) return curado;
    return `hsl(${hashSeed(countryCode) % 360} 46% 42%)`;
}

/** Los tres canales de un `#rrggbb`, en 0..1. */
function canales(kit: string): [number, number, number] {
    const hex = kit.replace('#', '');
    return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
    ];
}

function luminancia(kit: string): number {
    const [r, g, b] = canales(kit);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function aHex(r: number, g: number, b: number): string {
    const canal = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0');
    return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/**
 * ¿El dorsal encima va claro u oscuro? Se decide por la luminancia relativa del
 * color de la prenda, no a ojo: Inglaterra juega de blanco y Nueva Zelanda de
 * negro, y el 10 tiene que leerse en las dos.
 */
export function kitInkOf(kit: string): string {
    // Los derivados usan 42% de luminosidad: siempre admiten tinta clara.
    if (kit.startsWith('hsl')) return '#FFFFFF';
    return luminancia(kit) > 0.45 ? '#16201A' : '#FFFFFF';
}

/**
 * El tono del cuello, los puños y la costura.
 *
 * Una costura es LA MISMA TELA, MÁS HONDA — no una línea de otro color. El
 * primer intento la ató a la tinta del dorsal y en la celeste de Argentina eso
 * daba un contorno blanco: la camiseta dejaba de leerse como prenda y pasaba a
 * leerse como calcomanía. Acá el trazo se deriva del propio color.
 *
 * La excepción es la prenda casi negra —Nueva Zelanda, Alemania—: ahí no existe
 * "más honda" y el trazo tiene que ir para el otro lado o el cuello desaparece.
 */
export function kitTrimOf(kit: string): string {
    // Los derivados van a 42% de luminosidad; 27% es la misma tela, más honda.
    if (kit.startsWith('hsl')) return kit.replace('46% 42%', '46% 27%');
    const [r, g, b] = canales(kit);
    if (luminancia(kit) < 0.05) {
        const aclarar = (c: number) => c + (1 - c) * 0.34;
        return aHex(aclarar(r), aclarar(g), aclarar(b));
    }
    return aHex(r * 0.66, g * 0.66, b * 0.66);
}
