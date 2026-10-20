/**
 * Nombre de competición para MOSTRAR, con el país en español.
 *
 * Los proveedores externos mandan "England: Championship Rugby",
 * "France: Nationale" o "EspañA: División de Honor B", mientras que la lista
 * de Torneos dice Inglaterra, Francia y España. La misma app hablaba dos
 * idiomas, y "Europa" y "Europe" aparecían como grupos distintos en el
 * inicio. Esto corrige solo el prefijo de país: el resto del nombre es el
 * nombre propio del torneo y se respeta.
 */
const COUNTRY_PREFIXES: Record<string, string> = {
    england: 'Inglaterra',
    france: 'Francia',
    europe: 'Europa',
    'españa': 'España',
    spain: 'España',
    scotland: 'Escocia',
    wales: 'Gales',
    ireland: 'Irlanda',
    italy: 'Italia',
    germany: 'Alemania',
    'south africa': 'Sudáfrica',
    'new zealand': 'Nueva Zelanda',
    japan: 'Japón',
    usa: 'Estados Unidos',
    'united states': 'Estados Unidos',
    world: 'Internacional',
    international: 'Internacional',
    portugal: 'Portugal',
    netherlands: 'Países Bajos',
    belgium: 'Bélgica',
    romania: 'Rumania',
    georgia: 'Georgia',
    russia: 'Rusia',
    poland: 'Polonia',
    'czech republic': 'República Checa',
    brazil: 'Brasil',
    chile: 'Chile',
    uruguay: 'Uruguay',
    paraguay: 'Paraguay',
    peru: 'Perú',
    canada: 'Canadá',
    mexico: 'México',
    argentina: 'Argentina',
};

export function displayCompetitionName(name: string | null | undefined): string {
    const raw = String(name ?? '').trim();
    const colon = raw.indexOf(':');
    if (colon <= 0) return raw;

    const prefix = raw.slice(0, colon).trim();
    const translated = COUNTRY_PREFIXES[prefix.toLocaleLowerCase('es')];
    if (!translated) return raw;

    return `${translated}:${raw.slice(colon + 1)}`;
}
