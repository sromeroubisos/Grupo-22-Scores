// Escudos y colores de club para Rugby Manager.
//
// Los escudos reales viven en `public/clubs/<id>.png` y el manifiesto
// `logo-manifest.generated.ts` (el mismo que usa Carrera de Rugby) dice cuáles
// existen. Un club sin archivo NO intenta la petición: va el escudo de colores.
//
// Los clubes argentinos, uruguayos y chilenos traen su id real del catálogo de
// G22 y el escudo sale directo de ahí. Los de las ligas extranjeras del mundo
// de prueba se buscan por nombre: `slugify(nombre)` y, cuando el archivo se
// llama distinto, la tabla de alias.
import { LOCAL_CLUB_LOGOS } from '../../career/data/logo-manifest.generated.ts';

export function slugify(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Nombre del club en el mundo de prueba → id del archivo, cuando no coincide con el slug. */
const ALIASES: Readonly<Record<string, string>> = {
    'La Rochelle': 'stade-rochelais',
    'Bordeaux Bègles': 'union-bordeaux-begles',
    'Montpellier Hérault': 'montpellier',
    'Clermont Auvergne': 'asm-clermont',
    'Toulon RCT': 'rc-toulon',
    'Perpignan USAP': 'usa-perpignan',
    'Vannes RC': 'rc-vannes',
    'Grenoble FCG': 'fc-grenoble',
    'Oyonnax Rugby': 'oyonnax',
    'Béziers': 'as-beziers',
    'Brive': 'ca-brive',
    'Colomiers': 'colomiers-rugby',
    'Dax': 'us-dax',
    'Aurillac': 'stade-aurillacois',
    'Nevers': 'uson-nevers',
    'Rouen Normandie': 'rouen',
    'Soyaux Angoulême': 'soyaux-angouleme-xv',
    'Bath Rugby': 'bath',
    'Hartpury': 'hartpury-university',
    'Leinster Rugby': 'leinster',
    'Munster Rugby': 'munster',
    'Ulster Rugby': 'ulster',
    'Connacht Rugby': 'connacht',
    'Dragons RFC': 'dragons',
    'Vodacom Bulls': 'bulls',
    'Cell C Sharks': 'sharks',
    'DHL Stormers': 'stormers',
    'Emirates Lions': 'lions',
    'NSW Waratahs': 'waratahs',
    'Queensland Reds': 'reds',
    'ACT Brumbies': 'brumbies',
    'Yokohama Eagles': 'yokohama-canon-eagles',
    'Toshiba Brave Lupus': 'toshiba-brave-lupus-tokyo',
    'Kobe Steelers': 'kobelco-kobe-steelers',
    'Shizuoka Blue Revs': 'shizuoka-bluerevs',
    'Mitsubishi Sagamihara': 'mitsubishi-sagamihara-dynaboars',
    'Hanazono Liners': 'hanazono-kintetsu-liners',
    'Pampas XV': 'pampas',
    'Tarucas XV': 'tarucas',
    'Pumas XV': 'pumas',
    'Cobras XV': 'cobras-brasil-rugby',
    'Boland Cavaliers': 'boland-kavaliers',
    'Alcobendas Rugby': 'alcobendas',
    'CR Cisneros': 'complutense-cisneros',
    'SilverStorm El Salvador': 'el-salvador',
    'Sanitas Alcalá': 'cr-alcala',
    'CRC Pozuelo': 'pozuelo',
    'Getxo Artea': 'getxo',
    'Ordizia RE': 'ordizia',
};

/** Ruta pública del escudo de un club por su id de catálogo, o null si no hay archivo. */
export function crestPathForId(id: string): string | null {
    return LOCAL_CLUB_LOGOS.has(id) ? `/clubs/${id}.png` : null;
}

/** Ruta pública del escudo de un club extranjero del mundo de prueba, por nombre. */
export function crestPathForName(name: string): string | null {
    return crestPathForId(ALIASES[name] ?? slugify(name));
}

/** Id que identifica al club en el catálogo de G22 (el del archivo del escudo si lo hay). */
export function catalogIdForName(name: string): string {
    return ALIASES[name] ?? slugify(name);
}

function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const lig = l / 100;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const v = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Colores de respaldo para un club sin colores propios: salen del nombre, así que
 * dos clubes no se ven iguales y el mismo club siempre tiene los mismos. El
 * claro es lo bastante oscuro como para que las siglas blancas se lean.
 */
export function colorsFor(name: string): { primary: string; secondary: string } {
    const h = hash(name);
    return { primary: hslToHex(h % 360, 52 + (h % 3) * 8, 30), secondary: '#ffffff' };
}
