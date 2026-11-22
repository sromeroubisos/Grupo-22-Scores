/*
 * Palmarés histórico de los torneos del modo carrera.
 *
 * Los campeones reales salen del archivo histórico de G22 Scores
 * (tournament_seasons.champion_club_id, cargado de rugbyarchive y de las
 * finales), copiados acá el 2026-11-20 y actualizados el 2026-11-22 para que el juego no consulte la base.
 * Van hasta 2026 (los campeones del año ya están definidos). Desde 2027 la
 * historia la escribe cada carrera, temporada a temporada. Si una carrera juega
 * 2026, sus campeones pisan a los reales de ese año (ver `palmaresFor`).
 *
 * Formato compacto: "año:Club|año:Club…". Los nombres son los de la base; el
 * juego los cruza con sus clubes por nombre (ver `matchClub`).
 */

import { AR_CLUBS } from './arClubs';

/** Hasta qué año va la historia real (incluido). */
export const REAL_UNTIL = 2026;

const RAW: Record<string, string> = {
    nacional:
        '1993:San Isidro Club|1994:San Isidro Club|1995:CASI|1996:Hindú Club|1997:Jockey Club de Rosario|1998:San Cirano|1999:Club La Tablada|2001:Hindú Club|2002:Asoc. Alumni|2003:Hindú Club|2004:Duendes R.C.|2005:Hindú Club|2006:San Isidro Club|2007:La Plata|2008:San Isidro Club|2009:Duendes R.C.|2010:Hindú Club|2011:Duendes R.C.|2014:CUBA|2015:Hindú Club|2016:Hindú Club|2017:Hindú Club|2018:Hindú Club|2019:Hindú Club|2022:Hindú Club|2023:San Isidro Club|2024:Tucumán Lawn Tennis|2025:Club Newman|2026:Tala Rugby Club',
    nacionalB: '1993:Olivos R.C.|2001:Lince Rugby Club|2002:Marista Rugby Club|2005:Universitario de Salta|2017:Atlético del Rosario|2018:Urú Curé Rugby Club',
    tdiA:
        '1998:Jockey Club Córdoba|1999:Jockey Club Córdoba|2000:Jockey Club de Rosario|2001:Club La Tablada|2002:Jockey Club de Rosario|2003:Duendes R.C.|2004:Tala Rugby Club|2009:Duendes R.C.|2010:Club La Tablada|2011:Club La Tablada|2012:Duendes R.C.|2013:Duendes R.C.|2014:Urú Curé Rugby Club|2015:Cardenales R.C.|2016:Los Tarcos|2017:Club La Tablada|2018:CURNE|2019:Gimnasia y Esgrima de Rosario|2022:Duendes R.C.|2023:Universitario de Tucumán|2024:Tucumán Lawn Tennis|2025:Marista Rugby Club|2026:Tala Rugby Club',
    tdiB:
        '2001:Carrasco Polo|2002:Taraguy R.C.|2003:Universitario de Salta|2004:Tucumán Lawn Tennis|2009:Huirapuca|2010:Gimnasia y Tiro|2011:CRAI|2012:Huirapuca|2013:Urú Curé Rugby Club|2014:IPR Sporting|2015:Gimnasia y Esgrima de Rosario|2016:Huirapuca|2017:Carrasco Polo|2018:Universitario de Salta|2019:Club Palermo Bajo|2022:Tala Rugby Club|2023:Teqüe R.C.|2024:Club La Tablada|2025:Tucumán Rugby Club|2026:Natación y Gimnasia',
    'ar-urba-top14':
        '1899:Lomas Athletic|1900:Buenos Aires F.C.|1901:Buenos Aires F.C.|1902:Buenos Aires F.C.|1903:Buenos Aires F.C.|1904:Buenos Aires F.C.|1905:Atlético del Rosario|1906:Atlético del Rosario|1907:Belgrano Athletic|1908:Buenos Aires F.C.|1909:Buenos Aires F.C.|1910:Belgrano Athletic|1911:GEBA|1912:GEBA|1913:Lomas Athletic|1914:Belgrano Athletic|1915:Buenos Aires F.C.|1917:CASI|1918:CASI|1920:CASI|1921:CASI|1922:CASI|1923:CASI|1924:CASI|1925:CASI|1926:CASI|1927:CASI|1928:CASI|1929:CASI|1930:CASI|1931:CUBA|1932:GEBA|1933:CASI|1934:CASI|1935:Atlético del Rosario|1936:Belgrano Athletic|1937:Old Georgian|1938:Old Georgian|1939:San Isidro Club|1940:Belgrano Athletic|1941:San Isidro Club|1942:CUBA|1943:CASI|1944:CUBA|1945:CUBA|1946:Club Pucará|1947:CUBA|1948:San Isidro Club|1949:CASI|1950:CUBA|1951:CUBA|1952:CUBA|1953:Obras Sanitarias|1954:CASI|1955:CASI|1956:CASI|1957:CASI|1958:Buenos Aires CRC|1959:Buenos Aires CRC|1960:CASI|1961:CASI|1962:CASI|1963:Belgrano Athletic|1964:CASI|1965:CUBA|1966:Belgrano Athletic|1967:CASI|1968:CUBA|1969:CUBA|1970:San Isidro Club|1971:San Isidro Club|1972:San Isidro Club|1973:San Isidro Club|1974:CASI|1975:CASI|1976:CASI|1977:San Isidro Club|1978:San Isidro Club|1979:San Isidro Club|1980:San Isidro Club|1981:CASI|1982:CASI|1983:San Isidro Club|1984:San Isidro Club|1985:CASI|1986:San Isidro Club|1987:San Isidro Club|1988:San Isidro Club|1989:Asoc. Alumni|1990:Asoc. Alumni|1991:Asoc. Alumni|1992:Asoc. Alumni|1993:San Isidro Club|1994:San Isidro Club|1995:La Plata|1996:Atlético del Rosario|1997:San Isidro Club|1998:Hindú Club|1999:San Isidro Club|2000:Atlético del Rosario|2001:Asoc. Alumni|2002:San Isidro Club|2003:San Isidro Club|2004:San Isidro Club|2005:CASI|2006:Hindú Club|2007:Hindú Club|2008:Hindú Club|2009:Hindú Club|2010:San Isidro Club|2011:San Isidro Club|2012:Hindú Club|2013:CUBA|2014:Hindú Club|2015:Hindú Club|2016:Belgrano Athletic|2017:Hindú Club|2018:Asoc. Alumni|2019:San Isidro Club|2021:CUBA|2022:Hindú Club|2023:San Isidro Club|2024:Asoc. Alumni|2025:Club Newman|2026:Club Newman',
    'ar-centro-top10':
        '1931:Club Universitario de Córdoba|1932:Club Universitario de Córdoba|1933:Club Universitario de Córdoba|1934:Club Universitario de Córdoba|1935:Club Universitario de Córdoba|1936:Club Universitario de Córdoba|1937:Córdoba Rugby Club|1938:Córdoba Rugby Club|1939:San Martín de Villa María|1940:Club Universitario de Córdoba|1941:Club Universitario de Córdoba|1942:Club Universitario de Córdoba|1943:San Martín de Villa María|1944:Gimnasia y Esgrima de Córdoba|1945:Club Universitario de Córdoba|1946:Jockey Club Córdoba|1947:Jockey Club Córdoba|1948:Jockey Club Córdoba|1949:Jockey Club Córdoba|1950:Jockey Club Córdoba|1951:Jockey Club Córdoba|1952:Córdoba Athletic Club|1953:Escuela de Aviación|1954:Jockey Club Córdoba|1955:Córdoba Athletic Club|1956:Club Universitario de Córdoba|1957:Club Universitario de Córdoba|1958:Club Universitario de Córdoba|1959:Club Universitario de Córdoba|1960:Club Universitario de Córdoba|1961:Club Universitario de Córdoba|1962:Club Universitario de Córdoba|1963:Club Universitario de Córdoba|1964:Club Universitario de Córdoba|1965:Club La Tablada|1966:Club La Tablada|1967:Córdoba Athletic Club|1968:Córdoba Athletic Club|1969:Córdoba Athletic Club|1970:Córdoba Athletic Club|1971:Tala Rugby Club|1972:Tala Rugby Club|1973:Córdoba Athletic Club|1974:Córdoba Athletic Club|1975:Tala Rugby Club|1976:Club Universitario de Córdoba|1977:Club Universitario de Córdoba|1978:Club La Tablada|1979:Tala Rugby Club|1980:Tala Rugby Club|1981:Tala Rugby Club|1982:Tala Rugby Club|1983:Tala Rugby Club|1984:Tala Rugby Club|1985:Tala Rugby Club|1986:Tala Rugby Club|1987:Club La Tablada|1988:Club La Tablada|1989:Tala Rugby Club|1990:Tala Rugby Club|1991:Club La Tablada|1992:Córdoba Athletic Club|1993:Jockey Club Córdoba|1994:Club La Tablada|1995:Tala Rugby Club|1996:Córdoba Athletic Club|1997:Club La Tablada|1998:Tala Rugby Club|1999:Tala Rugby Club|2000:Club La Tablada|2001:Club La Tablada|2002:Club Palermo Bajo|2003:Club La Tablada|2004:Tala Rugby Club|2005:Córdoba Athletic Club|2006:Club La Tablada|2007:Tala Rugby Club|2008:Córdoba Athletic Club|2009:Jockey Club de Villa María|2010:Córdoba Athletic Club|2011:Córdoba Athletic Club|2012:Club La Tablada|2013:Club La Tablada|2014:Tala Rugby Club|2015:Tala Rugby Club|2016:Tala Rugby Club|2017:Tala Rugby Club|2018:Tala Rugby Club|2019:Urú Curé Rugby Club|2021:Jockey Club Córdoba|2022:Jockey Club Córdoba|2023:Córdoba Athletic Club|2024:Córdoba Athletic Club|2025:Tala Rugby Club|2026:Tala Rugby Club',
    'ar-noa-a':
        '1944:Tucumán Rugby Club|1945:Tucumán Rugby Club|1946:Universitario de Tucumán|1947:Natación y Gimnasia|1948:Tucumán Rugby Club|1949:Natación y Gimnasia|1951:Universitario de Tucumán|1952:Tucumán Rugby Club|1953:Tucumán Rugby Club|1954:Cardenales R.C.|1955:Natación y Gimnasia|1956:Tucumán Rugby Club|1957:Natación y Gimnasia|1958:Universitario de Tucumán|1959:Universitario de Tucumán|1960:Universitario de Tucumán|1961:Natación y Gimnasia|1962:Tucumán Rugby Club|1963:Universitario de Tucumán|1964:Cardenales R.C.|1965:Universitario de Tucumán|1966:Los Tarcos|1967:Universitario de Tucumán|1968:Universitario de Tucumán|1969:Los Tarcos|1970:Universitario de Tucumán|1971:Universitario de Tucumán|1972:Universitario de Tucumán|1973:Universitario de Tucumán|1974:Universitario de Tucumán|1975:Los Tarcos|1976:Universitario de Tucumán|1977:Tucumán Lawn Tennis|1978:Tucumán Rugby Club|1979:Tucumán Lawn Tennis|1980:Tucumán Lawn Tennis|1981:Tucumán Lawn Tennis|1982:Tucumán Lawn Tennis|1983:Los Tarcos|1984:Los Tarcos|1985:Los Tarcos|1986:Los Tarcos|1987:Los Tarcos|1988:Tucumán Rugby Club|1989:Tucumán Rugby Club|1990:Tucumán Rugby Club|1991:Tucumán Rugby Club|1992:Tucumán Rugby Club|1993:Tucumán Rugby Club|1994:Los Tarcos|1995:Natación y Gimnasia|1996:Natación y Gimnasia|1997:Universitario de Tucumán|1998:Universitario de Tucumán|1999:Huirapuca|2000:Tucumán Rugby Club|2001:Huirapuca|2002:Universitario de Tucumán|2003:Huirapuca|2004:Los Tarcos|2005:Universitario de Tucumán|2006:Tucumán Rugby Club|2007:Universitario de Tucumán|2008:Tucumán Lawn Tennis|2009:Tucumán Lawn Tennis|2010:Universitario de Tucumán|2011:Tucumán Lawn Tennis|2012:Tucumán Lawn Tennis|2013:Huirapuca|2014:Tucumán Lawn Tennis|2015:Tucumán Rugby Club|2016:Los Tarcos|2017:Natación y Gimnasia|2018:Los Tarcos|2019:Universitario de Tucumán|2022:Huirapuca|2023:Old Lions R.C.|2024:Tucumán Lawn Tennis|2025:Tucumán Rugby Club|2026:Tucumán Rugby Club',
    'ar-litoral-top10':
        '2000:Duendes R.C.|2001:Jockey Club de Rosario|2002:Duendes R.C.|2003:Gimnasia y Esgrima de Rosario|2004:Gimnasia y Esgrima de Rosario|2005:Universitario de Rosario|2006:Duendes R.C.|2007:Duendes R.C.|2008:Santa Fé R.C.|2009:Universitario de Rosario|2010:Duendes R.C.|2011:Duendes R.C.|2012:Duendes R.C.|2013:Duendes R.C.|2014:Duendes R.C.|2015:Duendes R.C.|2016:Duendes R.C.|2017:Jockey Club de Rosario|2018:Duendes R.C.|2019:Old Resian Club|2021:Duendes R.C.|2022:Gimnasia y Esgrima de Rosario|2023:Estudiantes de Paraná|2024:Jockey Club de Rosario|2025:Jockey Club de Rosario|2026:Duendes R.C.',
    'ar-pampeana-a':
        '2008:IPR Sporting|2009:IPR Sporting|2010:IPR Sporting|2011:IPR Sporting|2012:IPR Sporting|2013:Mar del Plata Club|2014:Mar del Plata Club|2015:Mar del Plata Club|2016:Mar del Plata Club|2017:IPR Sporting|2018:Mar del Plata Club|2019:Sociedad Sportiva de Bahía Blanca|2021:Mar del Plata Club|2022:Mar del Plata Club|2023:Mar del Plata Club|2024:Mar del Plata Club|2025:Mar del Plata Club|2026:Sociedad Sportiva de Bahía Blanca',
    'ar-patagonia-regional':
        '2008:Neuquén R.C.|2009:Marabunta R.C.|2010:Neuquén R.C.|2011:Neuquén R.C.|2012:Neuquén R.C.|2013:Neuquén R.C.|2014:Neuquén R.C.|2015:Neuquén R.C.|2016:Bigornia R.C.|2017:Roca R.C.|2018:Roca R.C.|2019:Roca R.C.|2022:Deportivo Portugués|2023:Bigornia R.C.|2024:Neuquén R.C.|2025:Neuquén R.C.|2026:Neuquén R.C.',
};

/** Nombre de cada palmarés (las divisiones usan el de la división). */
export const PALMARES_LABEL: Record<string, string> = {
    nacional: 'Nacional de Clubes',
    nacionalB: 'Nacional de Clubes B',
    tdiA: 'Torneo del Interior A',
    tdiB: 'Torneo del Interior B',
};

export interface TitleRow {
    season: number;
    name: string; // como se muestra
    club: string | null; // id del club en el juego, si se pudo cruzar
    game: boolean; // ganado en esta carrera (no en la historia real)
}

// Cruce por nombre: la base dice "Club La Tablada", el juego "La Tablada".
const norm = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        // "Club", "R.C.", "de"… no distinguen; "Athletic" sí (Córdoba Athletic ≠ Córdoba Rugby Club).
        .replace(/\b(club|rugby|r c|rc|asoc|f c|fc|crc|de)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
const ALIAS: Record<string, string> = { 'san isidro': 'SIC', 'buenos aires': 'Buenos Aires' };
const BY_NAME = new Map<string, string>();
for (const c of AR_CLUBS) BY_NAME.set(norm(c.name), c.id);

/** El club del juego que corresponde a un nombre del archivo (o null si no está en el juego). */
export function matchClub(name: string): string | null {
    const n = norm(name);
    const alias = ALIAS[n];
    if (alias) return AR_CLUBS.find((c) => c.name === alias)?.id ?? null;
    return BY_NAME.get(n) ?? null;
}

const parsed = new Map<string, TitleRow[]>();
/** La historia real de un palmarés (hasta REAL_UNTIL), del más viejo al más nuevo. */
export function realTitles(key: string): TitleRow[] {
    const hit = parsed.get(key);
    if (hit) return hit;
    const rows = (RAW[key] ?? '')
        .split('|')
        .filter(Boolean)
        .map((pair) => {
            const i = pair.indexOf(':');
            const season = Number(pair.slice(0, i));
            const name = pair.slice(i + 1);
            const club = matchClub(name);
            return { season, name: club ? AR_CLUBS.find((c) => c.id === club)?.name ?? name : name, club, game: false };
        })
        .filter((r) => r.season <= REAL_UNTIL);
    parsed.set(key, rows);
    return rows;
}

/** Los palmarés que tienen historia real cargada. */
export const PALMARES_KEYS = Object.keys(RAW);
