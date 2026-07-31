// Color de la camiseta por nacionalidad.
//
// Presentación pura: no entra al motor ni al estado. Vive acá y no en
// `data/nations.ts` por eso mismo — el catálogo de naciones es dato de
// simulación y este es un color de pantalla.
//
// Import relativo y no por alias `@/`: igual que `clubCrest.ts`, para poder
// testearlo con `node --test`, que no resuelve los paths de tsconfig.
import { hashSeed } from '../../../../features/career/index.ts';

/**
 * Camisetas reales de las uniones que el jugador va a elegir de verdad. No es
 * la bandera: es el color con el que juegan. Irlanda tiene bandera tricolor y
 * camiseta verde; Argentina tiene bandera celeste y blanca y camiseta celeste
 * a bastones. Se elige el tono dominante.
 */
const KIT: Record<string, string> = {
    ar: '#6CACE4', // celeste
    nz: '#1A1A1A', // negro
    za: '#0B6E4F', // verde springbok
    au: '#F5C518', // oro
    fr: '#1B2A6B', // azul
    ie: '#12805C', // verde
    'gb-eng': '#DCE3E8', // blanco (con tono para que se vea la prenda)
    'gb-sct': '#132B57', // azul marino
    'gb-wls': '#B3131B', // rojo
    it: '#1E63B0', // azzurro
    ar_alt: '#6CACE4',
    uy: '#4E84C4', // celeste
    cl: '#C8322B', // rojo
    br: '#0F9B4C', // verde
    py: '#C8322B',
    pe: '#C8322B',
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
    ru: '#C8322B',
};

/**
 * Color de la camiseta. Sin nacionalidad elegida devuelve un gris de prenda —
 * la camiseta nunca queda "sin color", porque una prenda blanca pura sobre
 * fondo claro se lee como que la imagen no cargó.
 *
 * Para un país sin camiseta curada, un tono DERIVADO del código con el hash
 * determinístico del motor: el mismo país da siempre el mismo color, que es lo
 * que permite reconocerlo.
 */
export function kitColorOf(countryCode: string | null): string {
    if (countryCode === null) return '#D8DEE3';
    const curado = KIT[countryCode];
    if (curado !== undefined) return curado;
    return `hsl(${hashSeed(countryCode) % 360} 46% 42%)`;
}

/**
 * ¿El texto encima tiene que ir claro u oscuro? Se decide por la luminancia
 * relativa del color de la camiseta, no a ojo: Inglaterra juega de blanco y
 * Nueva Zelanda de negro, y el apellido tiene que leerse en las dos.
 */
export function kitInkOf(kit: string): string {
    if (kit.startsWith('hsl')) {
        // Los derivados usan 42% de luminosidad: siempre admiten tinta clara.
        return '#FFFFFF';
    }
    const hex = kit.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminancia = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return luminancia > 0.45 ? '#16201A' : '#FFFFFF';
}
