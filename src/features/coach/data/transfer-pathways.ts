// Las VÍAS DECLARADAS por las que un jugador de un club argentino llega al
// exterior sin tener contrato (El Entrenador v2, etapa 3).
//
// LA VENTANA DEL AMATEUR NO CRUZA LA FRONTERA (CLAUDE.md §5). A un pibe de un
// club amateur no lo ficha por mercado abierto un club de otro continente: llega
// allá por una vía —una franquicia que lo scoutea, la academia de un club
// profesional, un convenio entre clubes— y con un nivel mínimo. Mientras el
// vínculo sea amateur, una beca o un viático, el exterior SOLO entra por acá.
// El que tiene contrato (el semiprofesional del Top 14) sí tiene mercado abierto,
// y ese mercado también tiene una puerta: se elige primero la LIGA y después el
// club, así que una liga de veinticuatro clubes no le gana a una de seis por
// volumen (`engine/transfers.ts`).
//
// Es CATÁLOGO, no lógica: tiene su versión y entra en el guardado dentro de
// `COMPETITION_CATALOG_VERSION`. Las ligas son las del catálogo de Carrera de
// Rugby (`career/data/clubs.ts`), que se lee y no se toca.

export const TRANSFER_PATHWAYS_VERSION = '1.0.0';

export type PathwayKind = 'franquicia' | 'academia' | 'convenio';

export interface TransferPathway {
    id: string;
    kind: PathwayKind;
    /** Cómo se llama la vía, para la ficha de la oferta. */
    label: string;
    /** Cómo funciona, en una frase. */
    text: string;
    /** Las competiciones del catálogo de Carrera que llaman por esta vía. */
    leagues: readonly string[];
    minAge: number;
    maxAge: number;
    /** Nivel mínimo del jugador, en la escala del plantel. */
    minLevel: number;
    /** Techo mínimo: la academia compra futuro, no presente. */
    minPotential: number;
    /**
     * Cuánto más flojo que el club puede ser el jugador. Una franquicia lo quiere
     * casi listo; una academia lo forma (no mira el nivel del primer equipo).
     */
    belowClub: number;
}

export const TRANSFER_PATHWAYS: readonly TransferPathway[] = [
    {
        id: 'franquicia-sra',
        kind: 'franquicia',
        label: 'Scouting de Super Rugby Americas',
        text: 'Las franquicias del Super Rugby Americas siguen el rugby de clubes y llaman al que se destaca.',
        leagues: ['sra'],
        minAge: 19,
        maxAge: 27,
        minLevel: 58,
        minPotential: 0,
        belowClub: 9,
    },
    {
        id: 'academia-francia',
        kind: 'academia',
        label: 'Academia de un club francés',
        text: 'Los centros de formación del Top 14 y el Pro D2 buscan pibes con techo en Sudamérica.',
        leagues: ['top14', 'prod2'],
        minAge: 18,
        maxAge: 21,
        minLevel: 46,
        minPotential: 66,
        belowClub: 60,
    },
    {
        id: 'convenio-espana',
        kind: 'convenio',
        label: 'Convenio con la División de Honor',
        text: 'Clubes españoles con convenio traen jugadores argentinos con trabajo y vivienda.',
        leagues: ['esp-dh', 'esp-dhelite'],
        minAge: 20,
        maxAge: 28,
        minLevel: 50,
        minPotential: 0,
        belowClub: 5,
    },
    {
        id: 'convenio-italia',
        kind: 'convenio',
        label: 'Convenio con el rugby italiano',
        text: 'La Serie A italiana tiene una larga tradición de argentinos: llegan por convenio entre clubes.',
        leagues: ['ita-serie-a-elite', 'ita-serie-a'],
        minAge: 20,
        maxAge: 29,
        minLevel: 48,
        minPotential: 0,
        belowClub: 5,
    },
    {
        id: 'convenio-francia',
        kind: 'convenio',
        label: 'Convenio con la Fédérale',
        text: 'Clubes de la Fédérale 1 francesa reciben argentinos por convenio, con trabajo de medio día.',
        leagues: ['fr-federale1'],
        minAge: 20,
        maxAge: 28,
        minLevel: 48,
        minPotential: 0,
        belowClub: 5,
    },
];

const BY_ID = new Map(TRANSFER_PATHWAYS.map((p) => [p.id, p]));

export function getPathway(id: string): TransferPathway | null {
    return BY_ID.get(id) ?? null;
}

/**
 * Las ligas regionales de donde llegan los extranjeros de la región (Uruguay,
 * Chile, Paraguay y Brasil). Solo llegan donde el estatus lo permite: en una
 * división con viáticos o semiprofesional.
 */
export const REGIONAL_LEAGUES: readonly string[] = ['br-super12', 'py-primera', 'sa-cl', 'sa-uy'];

/** Las ligas de donde vuelve el que se fue: las de los convenios, que es por donde se fue. */
export const RETURN_LEAGUES: readonly string[] = ['esp-dh', 'esp-dhelite', 'fr-federale1', 'ita-serie-a', 'ita-serie-a-elite'];

/**
 * El país de cada franquicia del Super Rugby Americas. En el catálogo de Carrera
 * la liga es `multi`: la ficha de la oferta tiene que decir de dónde es.
 */
export const FRANCHISE_COUNTRY: Readonly<Record<string, string>> = {
    'capibaras-xv': 'ar',
    'cobras-brasil-rugby': 'br',
    'dogos-xv': 'ar',
    pampas: 'ar',
    'penarol-rugby': 'uy',
    selknam: 'cl',
    tarucas: 'ar',
    'yacare-xv': 'py',
};

/** Los países que aparecen en una oferta o un candidato, para la ficha. */
export const COUNTRY_NAME: Readonly<Record<string, string>> = {
    ar: 'Argentina',
    au: 'Australia',
    be: 'Bélgica',
    bo: 'Bolivia',
    br: 'Brasil',
    ca: 'Canadá',
    cl: 'Chile',
    co: 'Colombia',
    es: 'España',
    fj: 'Fiyi',
    fr: 'Francia',
    'gb-eng': 'Inglaterra',
    'gb-sct': 'Escocia',
    'gb-wls': 'Gales',
    ge: 'Georgia',
    ie: 'Irlanda',
    it: 'Italia',
    jp: 'Japón',
    mx: 'México',
    nl: 'Países Bajos',
    nz: 'Nueva Zelanda',
    pe: 'Perú',
    pt: 'Portugal',
    py: 'Paraguay',
    ro: 'Rumania',
    ru: 'Rusia',
    us: 'Estados Unidos',
    uy: 'Uruguay',
    za: 'Sudáfrica',
};
