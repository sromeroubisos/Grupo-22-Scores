// La firma de una noticia: quien la redactó, o la redacción del deporte.
//
// El autor es opcional. Sin autor, la nota la firma la redacción que
// corresponde al deporte: Salida 22 para rugby, Córner Corto para hockey y
// G22 Scores para el resto (y para una nota sin deporte).

export const AUTHOR_MAX = 80;

const RUGBY = new Set(['rugby', 'rugby-union']);
const HOCKEY = new Set(['hockey', 'field-hockey']);

/** El nombre de la redacción según el deporte de la nota. */
export function newsroomOf(sport: string | null | undefined): string {
    const key = (sport ?? '').trim().toLowerCase();
    if (RUGBY.has(key)) return 'Redacción Salida 22';
    if (HOCKEY.has(key)) return 'Redacción Córner Corto';
    return 'Redacción G22 Scores';
}

export interface NewsByline {
    /** Lo que se lee después de "Redactado por". */
    name: string;
    /** true si lo escribió una persona; false si firma la redacción. */
    isPerson: boolean;
}

/** El autor escrito, sin espacios de más; vacío = no hay autor. */
export function cleanAuthorName(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function bylineOf(news: { author_name?: string | null; sport?: string | null }): NewsByline {
    const author = cleanAuthorName(news.author_name);
    if (author) return { name: author, isPerson: true };
    return { name: newsroomOf(news.sport), isPerson: false };
}
