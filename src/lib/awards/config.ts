// Las dos ediciones de los premios y sus categorías. Es contenido editorial:
// agregar una categoría es agregar una línea acá, sin tocar tablas.

export const AWARD_STAGES = ['postulaciones', 'votacion', 'resultados'] as const;
export type AwardStage = (typeof AWARD_STAGES)[number];

/**
 * Cómo se arma y se vota una categoría:
 *  - person: jugador/a o entrenador/a, de la base o escrito a mano. Postula la gente, vota la terna.
 *  - club: un club. Igual que person.
 *  - moment: un gol o un partido, escrito a mano ("Ciudad vs SIC, fecha 9"). Postula la gente, vota la terna.
 *  - play: la jugada de los pibes: un link a un video que revisa un editor.
 *  - xi: equipo ideal. Se arma con los 11 más postulados y NO se vota; si no hay cobertura
 *    suficiente (menos de 11 candidatos), se omite.
 *  - editorial: nuestra lectura de un premio de afuera (los de la FIH). No se postula ni se vota:
 *    la carga un editor.
 */
export type AwardKind = 'person' | 'club' | 'moment' | 'play' | 'xi' | 'editorial';

export interface AwardCategory {
    slug: string;
    name: string;
    kind: AwardKind;
    description: string;
    /** El grupo con el que se agrupan las categorías en pantalla. */
    group: string;
    /** Ayuda del campo de texto en las categorías `moment`. */
    placeholder?: string;
}

export interface AwardEditionConfig {
    slug: string;
    name: string;
    sportLabel: string;
    /** Valores de `clubs.sport` que pertenecen a esta edición. */
    sports: string[];
    tagline: string;
    /**
     * true = las personas postuladas tienen que ser jugadores de nuestra base (people):
     * no se acepta un nombre escrito a mano. Rugby local: lo cargado es lo postulable.
     */
    playersFromDb?: boolean;
    /**
     * true = el jugador postulado tiene que haber debutado en primera: figurar en la formación de
     * un partido de un club de plantel superior. Puede ser menor de edad. Hoy solo el rugby lo
     * puede verificar (las formaciones de hockey todavía no están cargadas).
     */
    requireDebut?: boolean;
    /** Logo de la edición (en /public/awards). Sin logo, se arma el wordmark o se escribe el nombre. */
    logo?: { dark: string; light: string; poster: string; alt: string; size?: [number, number] };
    /** Wordmark armado en CSS mientras no haya archivos de logo: renglón de arriba. */
    wordmark?: string;
    categories: AwardCategory[];
}

/** Cuántos finalistas arma "Armar terna" por categoría votable. */
export const FINALISTS_PER_CATEGORY = 5;
/** Los once del equipo ideal. */
export const XI_SIZE = 11;

/**
 * ¿Es un club de plantel superior? En la base los clubes de juveniles y de
 * divisiones menores llevan su categoría (M15..M20, formativo, intermedia,
 * preintermedia...); el de primera no lleva ninguna. Se acepta primera y la
 * primera femenina.
 */
export function isSeniorCategory(category: string | null | undefined): boolean {
    const value = (category ?? '').trim().toLowerCase();
    return value === '' || value === 'primera' || value === 'mayores' || value === 'femenino';
}

export const PLAY_CATEGORY_SLUG = 'jugada-de-los-pibes';

/** Las categorías que se votan: el resto se arma a mano o se calcula. */
export function isVotableKind(kind: AwardKind): boolean {
    return kind === 'person' || kind === 'club' || kind === 'moment' || kind === 'play';
}

/** Las que reciben postulaciones de la gente. */
export function acceptsNominations(kind: AwardKind): boolean {
    return kind === 'person' || kind === 'club' || kind === 'moment' || kind === 'xi';
}

const JUGADA_DE_LOS_PIBES: AwardCategory = {
    slug: PLAY_CATEGORY_SLUG,
    name: 'Jugada de los pibes',
    kind: 'play',
    group: 'Momentos',
    description: 'La jugada de juveniles que mandó la gente.',
};

export const AWARD_EDITIONS: AwardEditionConfig[] = [
    {
        slug: 'salida-22',
        name: 'Salida 22 Awards',
        sportLabel: 'Rugby',
        sports: ['rugby'],
        tagline: 'Los premios del rugby los elige la gente que mira, juega y alienta.',
        playersFromDb: true,
        requireDebut: true,
        // Logos oficiales (carpeta Descargas). Se usa la versión verde en los dos temas: la
        // palabra AWARDS va en verde sólido y se lee; la "dorado" (letras blancas con contorno
        // amarillo) se pierde sobre fondos claros. Cambiarla es cambiar estas dos rutas.
        logo: {
            // Tema oscuro: la "dorado" recoloreada a un oro más profundo (#C99A1E) para que
            // contraste con las letras blancas. Tema claro: la verde, que se lee sobre crema.
            dark: '/awards/oficiales/s22-awards-2026-dorado-oscuro.png',
            light: '/awards/oficiales/s22-awards-2026-verde.png',
            poster: '/awards/salida-22-fondo.webp',
            alt: 'Salida de 22 Awards 2026',
            size: [3891, 2868],
        },
        categories: [
            { slug: 'jugador-del-ano', name: 'Jugador del año', kind: 'person', group: 'Local', description: 'El mejor de la temporada.' },
            { slug: 'jugadora-del-ano', name: 'Jugadora del año', kind: 'person', group: 'Local', description: 'La mejor de la temporada.' },
            { slug: 'revelacion', name: 'Revelación', kind: 'person', group: 'Local', description: 'Quien debutó en primera y más creció. Puede ser menor de edad.' },
            { slug: 'try-del-ano', name: 'Try del año', kind: 'person', group: 'Momentos', description: 'Quién hizo el mejor try. Contá cuál fue.' },
            { slug: 'club-del-ano', name: 'Club del año', kind: 'club', group: 'Local', description: 'Resultados, cantera y comunidad.' },
            JUGADA_DE_LOS_PIBES,
        ],
    },
    {
        slug: 'corner-corto',
        name: 'Corner Corto Awards',
        sportLabel: 'Hockey',
        sports: ['field-hockey', 'hockey'],
        tagline: 'Los premios del hockey los elige la gente que mira, juega y alienta.',
        logo: {
            dark: '/awards/oficiales/cc22-awards-2026-verde.png',
            light: '/awards/oficiales/cc22-awards-2026-verde.png',
            poster: '/awards/oficiales/cc22-awards-2026-verde.png',
            alt: 'Corner Corto 22 Awards 2026',
            size: [3891, 2570],
        },
        categories: [
            { slug: 'mejor-club', name: 'Mejor club', kind: 'club', group: 'Local', description: 'Resultados, cantera y comunidad.' },
            { slug: 'mejor-jugadora-local', name: 'Mejor jugadora del hockey local', kind: 'person', group: 'Local', description: 'Damas: la mejor de la temporada.' },
            { slug: 'mejor-jugador-local', name: 'Mejor jugador del hockey local', kind: 'person', group: 'Local', description: 'Caballeros: el mejor de la temporada.' },
            { slug: 'revelacion', name: 'Revelación del año', kind: 'person', group: 'Local', description: 'Quien debutó en primera y más creció. Puede ser menor de edad.' },
            { slug: 'mejor-entrenador', name: 'Mejor entrenador o entrenadora', kind: 'person', group: 'Local', description: 'Quien más hizo crecer a su equipo.' },
            { slug: 'equipo-ideal', name: 'Equipo ideal local', kind: 'xi', group: 'Local', description: 'Las once figuras más postuladas. Solo se arma si hay cobertura suficiente; si no, se omite.' },
            { slug: 'gol-del-ano', name: 'Gol del año', kind: 'moment', group: 'Momentos', description: 'El gol que votaría todo el público.', placeholder: 'Ejemplo: gol de Julieta Paz a Banco Provincia, fecha 12' },
            { slug: 'partido-del-ano', name: 'Partido del año', kind: 'moment', group: 'Momentos', description: 'El que nadie se quiere perder.', placeholder: 'Ejemplo: Ciudad vs SIC, fecha 9' },
            JUGADA_DE_LOS_PIBES,
            { slug: 'mejor-leona', name: 'Mejor Leona', kind: 'person', group: 'Selecciones e internacional', description: 'Premio doble con Mejor León: la mejor de la selección femenina.' },
            { slug: 'mejor-leon', name: 'Mejor León', kind: 'person', group: 'Selecciones e internacional', description: 'Premio doble con Mejor Leona: el mejor de la selección masculina.' },
            { slug: 'mundo-jugadora', name: 'Mejor jugadora del mundo', kind: 'editorial', group: 'Selecciones e internacional', description: 'Nuestra lectura de los premios de la FIH.' },
            { slug: 'mundo-jugador', name: 'Mejor jugador del mundo', kind: 'editorial', group: 'Selecciones e internacional', description: 'Nuestra lectura de los premios de la FIH.' },
        ],
    },
];

export function getAwardEdition(slug: string | null | undefined): AwardEditionConfig | null {
    return AWARD_EDITIONS.find((edition) => edition.slug === slug) ?? null;
}

export function getAwardCategory(edition: AwardEditionConfig, slug: string | null | undefined): AwardCategory | null {
    return edition.categories.find((category) => category.slug === slug) ?? null;
}

/** Las categorías agrupadas, en el orden en que aparecen en la configuración. */
export function groupCategories(categories: readonly AwardCategory[]): { group: string; items: AwardCategory[] }[] {
    const out: { group: string; items: AwardCategory[] }[] = [];
    for (const category of categories) {
        const found = out.find((entry) => entry.group === category.group);
        if (found) found.items.push(category);
        else out.push({ group: category.group, items: [category] });
    }
    return out;
}

export function isAwardStage(value: unknown): value is AwardStage {
    return typeof value === 'string' && (AWARD_STAGES as readonly string[]).includes(value);
}

export const STAGE_LABELS: Record<AwardStage, string> = {
    postulaciones: 'Postulaciones',
    votacion: 'Votación',
    resultados: 'Resultados',
};
