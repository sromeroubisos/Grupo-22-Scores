/*
 * Sprites pixel del Seven, al estilo de las láminas de referencia: cabezón,
 * contorno negro grueso, cuerpo petiso y rebordete, y sombra en pelo, piel y
 * camiseta para que tengan textura. No hay PNG: cada jugador se arma con mapas
 * de píxeles (cabeza + torso + piernas) y la paleta de su equipo, y se cachea
 * en un canvas chico.
 *
 * Las posturas acostadas (en el piso, ruck) no tienen mapa propio: se dibuja
 * el cuadro de pie rotado 90°. Las excepciones son tirarse al try (`dive`, con
 * la pelota estirada adelante) y el tackle (`tackle`, con los brazos abiertos
 * para agarrar), que tienen su cuerpo horizontal dibujado.
 */

export const SKIN_TONES = ['#f8d6b8', '#efc29c', '#dca57c', '#c68a5e', '#a96f45', '#875433', '#5e3a22'] as const;
export const HAIR_COLORS = ['#2a1d16', '#4a2f1d', '#7a4e2c', '#e3c06b', '#c96a2b', '#9c3d1d', '#141414', '#d9d6cf'] as const;
export const HAIR_STYLES = ['corto', 'rulos', 'afro', 'rapado', 'rodete', 'vincha', 'trenzas', 'pelado'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_STYLE_LABEL: Record<HairStyle, string> = {
    corto: 'Corto',
    rulos: 'Rulos',
    afro: 'Afro',
    rapado: 'Rapado',
    rodete: 'Rodete',
    vincha: 'Vincha',
    trenzas: 'Trenzas',
    pelado: 'Pelado',
};

export interface Look {
    skin: number;
    hair: number;
    style: number;
    beard?: boolean;
    /** Jugadora: el peinado sale de FEM_STYLES (pelo largo, colita, trenzas) y nunca lleva barba. */
    fem?: boolean;
}

/** Peinados de las jugadoras. El largo cae por la espalda y la colita se mueve al correr. */
export const FEM_STYLES = ['colita', 'colitaVincha', 'melena', 'trenzasLargas', 'rodeteAlto', 'rulosLargos'] as const;
export type FemStyle = (typeof FEM_STYLES)[number];

export type Pattern = 'liso' | 'aros' | 'banda';

export interface Kit {
    shirt: string;
    shirt2: string; // segundo color: aros, banda, cuello y vivo de las medias
    shorts: string;
    socks: string;
    pattern: Pattern;
    collar?: string; // si falta, el cuello sale del segundo color
}

/*
 * Cabeza 14×12, mirando a la derecha. Las filas 0-6 son el peinado; las 7-11
 * la cara, compartida. O contorno · H pelo · h pelo en sombra · L brillo del
 * pelo · S piel · s piel en sombra · K brillo de la piel · W/w vincha.
 */
const HAIR_TOP: Record<HairStyle, string[]> = {
    corto: [
        '...OO.OOO.....',
        '..OHLOHLHOO...',
        '.OHLLHHLLHHOO.',
        'OHHHHHHHHHLHHO',
        'OHhHHHHHHHHHHO',
        'OHhhHSSHSSHSHO',
        'OHhSSSSSSSSSSO',
    ],
    rulos: [
        '..OO.OO.OO....',
        '.OLHOLHOLHOO..',
        'OHHHHHHHHHHHO.',
        'OHLHHLHHLHHHHO',
        'OHhHHHHHHHHHHO',
        'OHhhSHSSHSSHHO',
        'OHhSSSSSSSSSSO',
    ],
    afro: [
        '..OOOOOOOOO...',
        '.OHLHHLHHLHO..',
        'OHHHHHHHHHHHO.',
        'OHHLHHHHLHHHHO',
        'OHhHHHHHHHHHHO',
        'OHhHHSSSSSSHHO',
        'OHhSSSSSSSSSHO',
    ],
    rapado: [
        '..............',
        '....OOOOOO....',
        '..OOhHhHhHOO..',
        '.OhHhHhHhHhHO.',
        'OhHhHhHhHhHhHO',
        'OhSSSSSSSSSSSO',
        'OsSSSSSSSSSSSO',
    ],
    rodete: [
        '..OOO.........',
        '.OHLHOOOOOO...',
        '.OHHOHLLHHHOO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHHHHHHHO',
        'OHhhSSSSSSSSHO',
        'OHhSSSSSSSSSSO',
    ],
    vincha: [
        '...OO.OOO.....',
        '..OHLOHLHOO...',
        '.OHLLHHLLHHOO.',
        'OWWWWWWWWWWWWO',
        'OwwwwwwwwwwwwO',
        'OHhSSSSHSSSSHO',
        'OHhSSSSSSSSSSO',
    ],
    trenzas: [
        '....OOOOOO....',
        '..OOHLHLHLOO..',
        '.OHHLHHLHHHHO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHHHHHHHO',
        'OHhhSSSSSSSSHO',
        'OHhSSSSSSSSSSO',
    ],
    pelado: [
        '..............',
        '....OOOOOO....',
        '..OOSSSKSSOO..',
        '.OSSSSSSKKSSO.',
        'OsSSSSSSSSSSSO',
        'OsSSSSSSSSSSSO',
        'OsSSSSSSSSSSSO',
    ],
};

const FEM_TOP: Record<FemStyle, string[]> = {
    colita: [
        '..............',
        '....OOOOOO....',
        '..OOHLLHHHOO..',
        '.OHHLHHHHLHHO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHHSHHSHO',
        'OHhSSSSSSSSSSO',
    ],
    colitaVincha: [
        '..............',
        '....OOOOOO....',
        '..OOHLLHHHOO..',
        '.OHHLHHHHLHHO.',
        'OWWWWWWWWWWWWO',
        'OwwwwwwwwwwwwO',
        'OHhSSSSSSSSSSO',
    ],
    melena: [
        '..............',
        '...OOOOOOO....',
        '..OHLLHHLHOO..',
        '.OHHLHHHHHLHO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHHHSHHHO',
        'OHhHSSSSSSSSSO',
    ],
    trenzasLargas: [
        '..............',
        '....OOOOOO....',
        '..OOHLHLHLOO..',
        '.OHHLHHLHHHHO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHSSSSSHO',
        'OHhSSSSSSSSSSO',
    ],
    rodeteAlto: [
        '..OOOO........',
        '.OHLLHO.......',
        '.OHHHOOOOOO...',
        '.OhOHLLHHHHOO.',
        'OHHHHHHHHHHHHO',
        'OHhHHHHHSHHSHO',
        'OHhSSSSSSSSSSO',
    ],
    rulosLargos: [
        '..OO.OO.OO....',
        '.OLHOLHOLHOO..',
        'OHHHHHHHHHHHO.',
        'OHLHHLHHLHHHHO',
        'OHhHHHHHHHHHHO',
        'OHhHHSHSSHSHHO',
        'OHhHSSSSSSSSSO',
    ],
};

/*
 * Lo que cae por la espalda, mirando a la derecha (la nuca queda a la
 * izquierda). Se pinta antes que la cabeza, así el contorno de la cabeza tapa
 * el nacimiento. `quieta` de pie; `vuelo` corriendo, con la colita hacia atrás.
 */
const FEM_BACK: Record<FemStyle, { quieta: string[]; vuelo: string[]; y: number; vy: number } | null> = {
    colita: {
        y: 1,
        quieta: ['...OO', '..OHH', '.OHLH', '.OHhH', 'OHHhO', 'OHhO.', 'OHhO.', 'OhhO.', '.OhO.', '..O..'],
        vy: 2,
        vuelo: ['.OOOO', 'OHLHH', 'OhHhH', '.OhhO', '..OO.'],
    },
    colitaVincha: {
        y: 1,
        quieta: ['...OO', '..OHH', '.OHLH', '.OHhH', 'OHHhO', 'OHhO.', 'OHhO.', 'OhhO.', '.OhO.', '..O..'],
        vy: 2,
        vuelo: ['.OOOO', 'OHLHH', 'OhHhH', '.OhhO', '..OO.'],
    },
    melena: {
        y: 3,
        quieta: ['..OHH', '.OHHH', 'OHHLH', 'OHhHH', 'OHhHH', 'OHhHH', 'OHhhH', 'OhhhO', '.OhO.', '..O..'],
        vy: 3,
        vuelo: ['..OHH', '.OHHH', 'OHLHH', 'OHhHH', 'OhHhH', 'OhhhO', '.OhO.', '..O..'],
    },
    trenzasLargas: {
        y: 5,
        quieta: ['..OHH', '.OhO.', '.OHO.', '.OhO.', '.OHO.', '.OhO.', '.OWO.', '..O..'],
        vy: 5,
        vuelo: ['..OHH', '.OhO.', 'OHO..', 'OhO..', 'OHO..', 'OWO..', '.O...'],
    },
    rodeteAlto: null,
    rulosLargos: {
        y: 3,
        quieta: ['..OHH', '.OLHH', 'OHHhH', 'OHLHH', 'OhHHH', 'OHhLH', 'OhHhO', '.OhO.', '..O..'],
        vy: 3,
        vuelo: ['..OHH', '.OLHH', 'OHHhH', 'OhLHH', 'OHhhO', '.OhO.', '..O..'],
    },
};

/* La cara de una jugadora: pestañas en el borde de cada ojo y la boca marcada. */
const FEM_MOUTH = '#b9566a';

const FACE = [
    'OsSSSSSESSSESO',
    'OsSSSSSESSSESO',
    'OssSSSSSSSSSSO',
    '.OssSSSSSSSSO.',
    '..OOOOOOOOOO..',
];

/* Barba: pisa la parte de abajo de la cara con el color del pelo. */
const BEARD = [
    null,
    'OsSSSSSESSSESO',
    'OshHSSSSSSHHHO',
    '.OhhHHHHHHHHO.',
    '..OOOOOOOOOO..',
];

/* Torso 16×6. J camiseta · j camiseta en sombra · C cuello · S/s piel. */
const TORSO = {
    idle: [
        '...OOJCCCCJOO...',
        '..OJJJJJJJJJJO..',
        '.OSOJJJJJJJJOSO.',
        'OSSOJJJJJJJJOSSO',
        'OsSOjJJJJJJjOSsO',
        '.OOOjjjjjjjjOOO.',
    ],
    runA: [
        '...OOJCCCCJOO...',
        '..OJJJJJJJJJJOO.',
        '.OSOJJJJJJJJOSSO',
        '.OSOJJJJJJJJOSSO',
        '.OOOjJJJJJJjOOO.',
        '....OjjjjjjO....',
    ],
    runB: [
        '...OOJCCCCJOO...',
        '.OOJJJJJJJJJJO..',
        'OSSOJJJJJJJJOSO.',
        'OSSOJJJJJJJJOSO.',
        '.OOOjJJJJJJjOOO.',
        '....OjjjjjjO....',
    ],
    up: [
        '...OOJCCCCJOO...',
        '..OJJJJJJJJJJO..',
        '..OJJJJJJJJJJO..',
        '...OJJJJJJJJO...',
        '...OjJJJJJJjO...',
        '...OjjjjjjjjO...',
    ],
    pass: [
        '...OOJCCCCJOO...',
        '..OJJJJJJJJJJOOO',
        '.OSOJJJJJJJJSSSO',
        '.OSOJJJJJJJJOOO.',
        '.OOOjJJJJJJjO...',
        '....OjjjjjjO....',
    ],
};

/* Piernas 16×5. Q short · q short en sombra · S piel · W media · w vivo · B botín. */
const LEGS = {
    idle: [
        '...OQQQQQQQQO...',
        '...OQqQOOQqQO...',
        '...OSSO..OSSO...',
        '...OWwO..OWwO...',
        '..OBBBO.OBBBBO..',
    ],
    runA: [
        '...OQQQQQQQQO...',
        '..OQQqOOOQQqQO..',
        '.OSSO....OSSO...',
        'OWwO......OWwO..',
        'OBBO.......OBBBO',
    ],
    runB: [
        '...OQQQQQQQQO...',
        '....OQqQQqQO....',
        '.....OSSSSO.....',
        '.....OWwWwO.....',
        '....OBBBBBBO....',
    ],
    runC: [
        '...OQQQQQQQQO...',
        '...OQqQOOQQqO...',
        '..OSSO...OSSO...',
        '.OWwO.....OWwO..',
        '.OBBO.....OBBBO.',
    ],
};

/*
 * Los mapas se dibujaron anchos y se angostan acá sacando columnas interiores
 * (sin tocar el contorno): cabeza 14→12 y torso 16→14. Así el jugador queda
 * cabezón y con textura, pero no tan gordito.
 */
const dropCols = (rows: string[], cols: number[]) => rows.map((r) => [...r].filter((_, i) => !cols.includes(i)).join(''));
for (const k of Object.keys(HAIR_TOP) as HairStyle[]) HAIR_TOP[k] = dropCols(HAIR_TOP[k], [4, 9]);
for (const k of Object.keys(FEM_TOP) as FemStyle[]) FEM_TOP[k] = dropCols(FEM_TOP[k], [4, 9]);
const FACE_N = dropCols(FACE, [4, 9]);
/* Con el pelo largo, la nuca sigue con pelo hasta la mandíbula. */
/* Las columnas de los ojos en la cara ya angostada. */
const FEM_EYES = [...FACE_N[0]].flatMap((ch, i) => (ch === 'E' ? [i] : []));
const FACE_LONG = FACE_N.map((r, i) => (i < 3 ? r.slice(0, 1) + 'h' + r.slice(2) : r));
const BEARD_N = BEARD.map((r) => (r ? dropCols([r], [4, 9])[0] : null));
for (const k of Object.keys(TORSO) as (keyof typeof TORSO)[]) TORSO[k] = dropCols(TORSO[k], [5, 10]);

/*
 * Tirarse al try y tackle, 36×14, mirando a la derecha: el cuerpo volando
 * horizontal, la cabeza derecha mirando adelante y los brazos estirados por
 * delante de la cabeza. `back` va debajo de la cabeza y `front` encima.
 * P/p pelota.
 */
const FLYING_BODY = [
    '', '', '', '', '', '',
    '...........OOOOOOOOOO',
    '.......OOOOOJJJJJJJJJ',
    'OOOOOOOQQQQQJJJJJJJJJJ',
    'OBBWwSSQQQQQJJJJJJJJJJ',
    'OBBWwSSQqQQQjJJJJJJJJJ',
    'OOOOOOOOqqqqjjjjjjjjjj',
    '.......OOOOOOOOOOOOOOO',
];

const FLYING: Record<'dive' | 'tackle', { back: string[]; front: string[]; head: { x: number; y: number } }> = {
    // Al try: la pelota estirada adelante, en las dos manos.
    dive: {
        back: FLYING_BODY,
        front: [
            '', '', '', '', '', '', '', '', '',
            `${'.'.repeat(32)}OOO`,
            `${'.'.repeat(31)}OPPPO`,
            `${'.'.repeat(22)}${'O'.repeat(9)}PPPPO`,
            `${'.'.repeat(20)}JJ${'S'.repeat(10)}pPPO`,
            `${'.'.repeat(20)}${'O'.repeat(15)}`,
        ],
        head: { x: 18, y: 0 },
    },
    // Tackle: el mismo vuelo, con los brazos abiertos para agarrar.
    tackle: {
        back: FLYING_BODY,
        front: [
            '', '', '', '', '', '', '', '', '', '',
            `${'.'.repeat(30)}OO`,
            `${'.'.repeat(22)}${'O'.repeat(8)}SSO`,
            `${'.'.repeat(20)}JJ${'S'.repeat(10)}O`,
            `${'.'.repeat(20)}${'O'.repeat(13)}`,
        ],
        head: { x: 18, y: 0 },
    },
};

export type Frame = 'idle' | 'run0' | 'run1' | 'run2' | 'run3' | 'celebrate' | 'pass' | 'dive' | 'tackle';

const isFlying = (f: Frame): f is 'dive' | 'tackle' => f === 'dive' || f === 'tackle';

const FRAME_PARTS: Record<Exclude<Frame, 'dive' | 'tackle'>, { torso: keyof typeof TORSO; legs: keyof typeof LEGS; bob: number }> = {
    idle: { torso: 'idle', legs: 'idle', bob: 0 },
    run0: { torso: 'runA', legs: 'runA', bob: 0 },
    run1: { torso: 'runB', legs: 'runB', bob: 1 },
    run2: { torso: 'runB', legs: 'runC', bob: 0 },
    run3: { torso: 'runA', legs: 'runB', bob: 1 },
    celebrate: { torso: 'up', legs: 'idle', bob: 0 },
    pass: { torso: 'pass', legs: 'runB', bob: 0 },
};

export const SPRITE_W = 16;
export const SPRITE_H = 24; // 12 de cabeza + 6 torso + 5 piernas + 1 de aire para el bob
export const DIVE_W = 36;
export const DIVE_H = 14;

/** Dónde se apoyan los cuadros de try y tackle: el punto que va sobre la posición del jugador. */
export const DIVE_ANCHOR = { x: 18, y: DIVE_H } as const;

export function shade(hex: string, amount: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Sombra que se ve también sobre colores muy oscuros (una camiseta negra igual tiene volumen). */
function shadeFor(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
    return lum < 50 ? shade(hex, 22) : shade(hex, -34);
}

const OUTLINE = '#141218';
const EYE = '#141218';
const BOOT = '#232329';
const BALL = '#f7f3ea';
const BALL_SHADE = '#c7c0b0';

function paintRows(
    ctx: CanvasRenderingContext2D,
    rows: (string | null)[],
    ox: number,
    oy: number,
    colorOf: (ch: string, row: number, col: number) => string | null,
) {
    for (let r = 0; r < rows.length; r++) {
        const line = rows[r];
        if (!line) continue;
        for (let c = 0; c < line.length; c++) {
            const col = colorOf(line[c], r, c);
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(ox + c, oy + r, 1, 1);
        }
    }
}

const cache = new Map<string, HTMLCanvasElement>();

function lookKey(look: Look, kit: Kit): string {
    return `${look.skin}.${look.hair}.${look.style}.${look.beard ? 1 : 0}${look.fem ? 'f' : ''}|${kit.shirt}${kit.shirt2}${kit.shorts}${kit.socks}${kit.pattern}${kit.collar ?? ''}`;
}

/** Cuadro cacheado de un jugador, mirando a la derecha. */
export function playerSprite(look: Look, kit: Kit, frame: Frame): HTMLCanvasElement {
    const key = `${lookKey(look, kit)}|${frame}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const cv = document.createElement('canvas');
    cv.width = isFlying(frame) ? DIVE_W : SPRITE_W;
    cv.height = isFlying(frame) ? DIVE_H : SPRITE_H;
    const ctx = cv.getContext('2d');
    if (!ctx) return cv;

    const skin = SKIN_TONES[look.skin % SKIN_TONES.length];
    const skinDark = shade(skin, -30);
    const skinLight = shade(skin, 26);
    const hair = HAIR_COLORS[look.hair % HAIR_COLORS.length];
    const hairDark = shade(hair, -30);
    const hairLight = shade(hair, 40);
    const style = HAIR_STYLES[look.style % HAIR_STYLES.length];
    const femStyle = look.fem ? FEM_STYLES[look.style % FEM_STYLES.length] : null;
    const back = femStyle ? FEM_BACK[femStyle] : null;
    const shirtDark = shadeFor(kit.shirt);
    const collar = kit.collar ?? (kit.pattern === 'liso' ? kit.shirt2 : OUTLINE);

    const headColor = (ch: string): string | null => {
        switch (ch) {
            case 'O': return OUTLINE;
            case 'H': return hair;
            case 'h': return hairDark;
            case 'L': return hairLight;
            case 'S': return skin;
            case 's': return skinDark;
            case 'K': return skinLight;
            case 'E': return EYE;
            case 'W': return '#f4f4f4';
            case 'w': return '#c9c9cf';
            default: return null;
        }
    };

    const paintHead = (hx: number, hy: number, moving = false) => {
        // El pelo largo va detrás de la cabeza: primero, así el contorno de la cabeza lo tapa.
        if (femStyle) {
            // Un píxel más adelante que la de los varones: así la colita asoma por la nuca.
            const fx = hx + 1;
            if (back) paintRows(ctx, moving ? back.vuelo : back.quieta, fx - 3, hy + (moving ? back.vy : back.y), headColor);
            paintRows(ctx, FEM_TOP[femStyle], fx, hy, headColor);
            paintRows(ctx, back && femStyle !== 'colita' && femStyle !== 'colitaVincha' ? FACE_LONG : FACE_N, fx, hy + 7, headColor);
            // Pestañas (arriba y al costado de cada ojo) y la boca.
            ctx.fillStyle = OUTLINE;
            for (const ex of FEM_EYES) ctx.fillRect(fx + ex + 1, hy + 6, 1, 1);
            ctx.fillStyle = FEM_MOUTH;
            ctx.fillRect(fx + FEM_EYES[1] - 1, hy + 9, 2, 1);
            return;
        }
        paintRows(ctx, HAIR_TOP[style], hx, hy, headColor);
        paintRows(ctx, look.beard ? FACE_N.map((f, i) => BEARD_N[i] ?? f) : FACE_N, hx, hy + 7, headColor);
    };

    if (isFlying(frame)) {
        const body = FLYING[frame];
        // Acostado, el aro o la banda corre a lo ancho del cuerpo: van por columnas.
        const diveColor = (ch: string, _r: number, col: number): string | null => {
            switch (ch) {
                case 'O': return OUTLINE;
                case 'Q': return kit.shorts;
                case 'q': return shadeFor(kit.shorts);
                case 'S': return skin;
                case 'W': return kit.socks;
                case 'w': return kit.shirt2 === kit.socks ? shadeFor(kit.socks) : kit.shirt2;
                case 'B': return BOOT;
                case 'P': return BALL;
                case 'p': return BALL_SHADE;
                case 'J':
                case 'j': {
                    const band = (kit.pattern === 'aros' && col % 4 === 1) || (kit.pattern === 'banda' && col >= 15 && col <= 16);
                    const base = band ? kit.shirt2 : kit.shirt;
                    return ch === 'j' ? (base === kit.shirt ? shirtDark : shadeFor(base)) : base;
                }
                default: return null;
            }
        };
        paintRows(ctx, body.back, 0, 0, diveColor);
        paintHead(body.head.x, body.head.y, true);
        paintRows(ctx, body.front, 0, 0, diveColor);
        cache.set(key, cv);
        return cv;
    }

    const parts = FRAME_PARTS[frame];
    const top = 1 - parts.bob;

    // Piernas y torso primero: la cabeza va encima, como en las láminas.
    paintRows(ctx, LEGS[parts.legs], 0, top + 18, (ch) => {
        switch (ch) {
            case 'O': return OUTLINE;
            case 'Q': return kit.shorts;
            case 'q': return shadeFor(kit.shorts);
            case 'S': return skin;
            case 'W': return kit.socks;
            case 'w': return kit.shirt2 === kit.socks ? shadeFor(kit.socks) : kit.shirt2;
            case 'B': return BOOT;
            default: return null;
        }
    });

    paintRows(ctx, TORSO[parts.torso], 1, top + 12, (ch, row) => {
        switch (ch) {
            case 'O': return OUTLINE;
            case 'S': return skin;
            case 's': return skinDark;
            case 'C': return collar;
            case 'J':
            case 'j': {
                const base = (kit.pattern === 'aros' && (row === 2 || row === 4)) || (kit.pattern === 'banda' && row === 2) ? kit.shirt2 : kit.shirt;
                return ch === 'j' ? (base === kit.shirt ? shirtDark : shadeFor(base)) : base;
            }
            default: return null;
        }
    });

    paintHead(2, top, frame === 'run1' || frame === 'run3' || frame === 'pass');

    if (!femStyle && style === 'trenzas') {
        // Las trenzas caen por la espalda, sobre el hombro de atrás.
        paintRows(ctx, ['Oh', 'hO', 'Oh', 'hO', 'OO'], 1, top + 8, headColor);
    }

    if (frame === 'celebrate') {
        // Brazos arriba, a los costados de la cabeza.
        paintRows(ctx, ['OSO', 'OSO', 'OSO', 'OSO', 'OSO', 'OsO'], 0, top + 6, headColor);
        paintRows(ctx, ['OSO', 'OSO', 'OSO', 'OSO', 'OSO', 'OsO'], 13, top + 6, headColor);
    }

    cache.set(key, cv);
    return cv;
}

/** Pelota ovalada con contorno, centrada en (x, y). */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(px - 2, py - 3, 5, 1);
    ctx.fillRect(px - 2, py + 2, 5, 1);
    ctx.fillRect(px - 3, py - 2, 1, 4);
    ctx.fillRect(px + 3, py - 2, 1, 4);
    ctx.fillStyle = BALL;
    ctx.fillRect(px - 2, py - 2, 5, 4);
    ctx.fillStyle = BALL_SHADE;
    ctx.fillRect(px - 2, py + 1, 5, 1);
    ctx.fillStyle = '#8a8478';
    ctx.fillRect(px - 1, py - 1, 3, 1);
}

/** La misma cara, de jugadora: peinado de pelo largo y sin barba. */
export function femLook(l: Look): Look {
    return { skin: l.skin, hair: l.hair === 7 ? 1 : l.hair, style: l.style % FEM_STYLES.length, fem: true };
}

/** ¿Es un club femenino? (Argentina y España: los ids empiezan con af- y ef-). */
export const isFemClub = (id: string) => id.startsWith('af-') || id.startsWith('ef-');

export function randomLook(rand: () => number = Math.random): Look {
    return {
        skin: Math.floor(rand() * SKIN_TONES.length),
        hair: Math.floor(rand() * HAIR_COLORS.length),
        style: Math.floor(rand() * HAIR_STYLES.length),
        beard: rand() < 0.25,
    };
}
