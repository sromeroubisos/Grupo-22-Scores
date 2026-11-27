// Bases propias de un torneo para el export editorial de partido. Cada base trae
// cuatro archivos: posteo (1080x1350) e historia (1080x1920), y en cada formato la
// versión CON FOTO —un PNG con la parte de arriba transparente que se apoya sobre la
// foto del partido— y la SIN FOTO, opaca, para cuando no hay foto que subir.
//
// La base no se elige a mano: el modal la precarga según el torneo (y la etapa) del
// partido, y al dibujar se cambia sola a la variante que corresponde al formato y a
// si hay foto o no. Si el usuario saca la base o elige otro degradado, manda lo suyo.
//
// Originales en `Documentos/________S22/2025/MESES/RECURSOS - Fondo y Tipografias`
// (FONDO BASE / FONDO SIN FOTO / HISTORIA ...); acá van comprimidos a WebP.

export type TournamentBaseVariants = {
    /** Se superpone a la foto: arriba transparente, abajo el color del torneo. */
    photo: string;
    /** Opaca: es el fondo entero cuando no hay foto. */
    noPhoto: string;
};

export type TournamentExportBase = {
    id: string;
    name: string;
    post: TournamentBaseVariants;
    story: TournamentBaseVariants;
};

const DIR = '/exports/bases/';

function base(id: string, name: string, file: string): TournamentExportBase {
    return {
        id,
        name,
        post: { photo: `${DIR}${file}-post.webp`, noPhoto: `${DIR}${file}-post-sin-foto.webp` },
        story: { photo: `${DIR}${file}-story.webp`, noPhoto: `${DIR}${file}-story-sin-foto.webp` },
    };
}

const BASES = {
    // Roja: la etapa de Dubái del circuito principal.
    svnsDubai: base('svns-dubai', 'HSBC SVNS · Dubái', 'svns-dubai'),
    // Lila grisácea: el SVNS 3, en todas sus etapas.
    svns3: base('svns3', 'HSBC SVNS 3', 'svns3'),
} as const;

const ALL_BASES: readonly TournamentExportBase[] = Object.values(BASES);

// tournaments.id de los circuitos (external_id `worldrugby:<nivel>-<año>-<m|w>`).
const SVNS3_TOURNAMENTS = new Set([
    '45abed49-dec6-400c-8c7e-b21565f4058d', // svns3-2026-m
    '1a53a451-a47e-4f20-8869-e52fac61a6ca', // svns3-2026-w
    '9e884bc7-dd2d-4ed9-adc9-f6a54e03e13d', // svns3-2027-m
    '20b7a516-3ff9-4c18-9b8b-ad76576b63b1', // svns3-2027-w
]);

const SVNS1_TOURNAMENTS = new Set([
    '2d45ed1f-cb37-4e37-aadc-e8f08187adf3', // svns-2026-m
    'fc66b526-a14b-4dbb-afb4-b7c76d68c756', // svns-2026-w
    'c3c1b580-2cb9-4cba-aeb6-c63af2c62656', // svns-2027-m
    'a2e0fc81-cb52-46c8-bb95-a1eb19ec474c', // svns-2027-w
]);

// El circuito es UN torneo por temporada; la etapa de Dubái se reconoce por la fecha
// (las mismas ventanas que `SVNS_DB_STAGES`, con un día de margen por el huso: Ciudad
// del Cabo cae una semana después, no hay forma de pisarse).
const SVNS1_DUBAI_WINDOWS: readonly (readonly [string, string])[] = [
    ['2025-11-28', '2025-12-01'],
    ['2026-11-27', '2026-11-30'],
];

function isoDay(value: string | number | Date | null | undefined): string | null {
    if (value == null || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Base que le corresponde a un partido por su torneo (y su fecha, si el torneo tiene etapas). */
export function resolveTournamentExportBase(
    tournamentId: string | number | null | undefined,
    kickoffAt?: string | number | Date | null,
): TournamentExportBase | null {
    if (tournamentId == null) return null;
    const key = String(tournamentId).trim().toLowerCase();
    if (SVNS3_TOURNAMENTS.has(key)) return BASES.svns3;
    if (SVNS1_TOURNAMENTS.has(key)) {
        const day = isoDay(kickoffAt);
        if (day && SVNS1_DUBAI_WINDOWS.some(([from, to]) => day >= from && day <= to)) return BASES.svnsDubai;
    }
    return null;
}

/** Si `src` es cualquiera de los archivos de una base, esa base. */
export function tournamentBaseFromSrc(src: string | null | undefined): TournamentExportBase | null {
    const value = (src || '').trim();
    if (!value) return null;
    return ALL_BASES.find((item) => (
        [item.post.photo, item.post.noPhoto, item.story.photo, item.story.noPhoto].some((file) => value.endsWith(file))
    )) ?? null;
}

/**
 * Qué se dibuja con una base: con foto, la foto abajo y la base CON FOTO encima; sin
 * foto, la SIN FOTO de fondo (y como capa, que al ser opaca y del mismo tamaño queda
 * igual y apaga las sombras que la pieza pinta cuando no hay capa).
 */
export function resolveEditorialBaseLayers(
    item: TournamentExportBase,
    options: { story: boolean; photoSrc?: string | null },
): { backgroundImage: string; gradientImage: string } {
    const variants = options.story ? item.story : item.post;
    const photo = (options.photoSrc || '').trim();
    return photo
        ? { backgroundImage: photo, gradientImage: variants.photo }
        : { backgroundImage: variants.noPhoto, gradientImage: variants.noPhoto };
}
