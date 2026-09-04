/**
 * UNA SELECCIÓN, UNA FICHA — venga del feed que venga.
 *
 * Argentina femenina llega por dos caminos. El feed de la FIH la llama
 * `fih-wc-1867-ARG` y le arma una ficha en el momento, con el plantel y el
 * fixture del Mundial. La base la tiene como `seleccion-argentina-femenina-de-hockey`,
 * con sus partidos de la Pro League y el plantel que alguien cargue. Hasta acá
 * eran dos equipos distintos: dos URLs, dos planteles, dos historiales del
 * mismo seleccionado.
 *
 * Este módulo declara que son el mismo, y es el único lugar donde se declara.
 *
 * ── EL VÍNCULO ES POR (GÉNERO, PAÍS), NO POR EDICIÓN ─────────────────────────
 * `fih-wc-1867-ARG` lleva adentro el id de la competencia (1867 = el Mundial
 * Femenino 2026). Guardar ese ref tal cual haría que el vínculo se venciera con
 * la próxima edición: la FIH rota los ids y al año que viene Argentina femenina
 * sería `fih-wc-19xx-ARG`, un id que nadie vinculó. Lo que no cambia es el par
 * (género, país), así que la llave guardada es `w|ARG` y el ref se traduce a
 * ella al resolver. Mismo criterio que el alias de la AAMH (`{genero}|{clave}`).
 *
 * ── FEMENINO Y MASCULINO SON DOS EQUIPOS ────────────────────────────────────
 * Cada género tiene su ficha, su plantel y su fixture, y así se queda: Las
 * Leonas y Los Leones no comparten nada más que el país. Por eso la llave
 * empieza por el género y por eso un ref que NO lo dice —el viejo
 * `fih-team-ARG` que ponen las filas de partidos— no alcanza para elegir una:
 * resuelve solo si el país tiene UNA sola ficha vinculada. Con las dos
 * vinculadas se queda con la ficha del feed, que muestra las dos competencias,
 * porque adivinar sería mostrarle a alguien el equipo equivocado.
 *
 * ── EL VÍNCULO ES UN DATO, NO UN DEPLOY ─────────────────────────────────────
 * Vive en `club_external_ids` (`provider = 'fih'`), la misma tabla con la que
 * ya se vinculan la URBA, ARUSA, la AAMH y la CAH. Sumar un país es una fila
 * (ver `src/scripts/hockey-vincular-selecciones.ts`), no una constante en el
 * código: el Mundial trae 20 países y la base tiene ficha de 11.
 */

import { parseFihTeamRef, toFihTeamRef, type FihCompetitionKey } from './fihHockeyParser';

type DbClient = any;

/** El proveedor con el que se guardan estos vínculos en `club_external_ids`. */
export const NATIONAL_TEAM_LINK_PROVIDER = 'fih';

export type NationalTeamLink = {
    key: FihCompetitionKey;
    /** El código de tres letras de la FIH, en mayúsculas: ARG, NED, GER. */
    code: string;
};

/** `('w', 'arg')` → `'w|ARG'`, la llave que se guarda en `external_id`. */
export function nationalTeamLinkKey(key: FihCompetitionKey, code: string): string {
    return `${key}|${code.trim().toUpperCase()}`;
}

/** `'w|ARG'` → `{ key: 'w', code: 'ARG' }`. null si la fila no tiene esa forma. */
export function parseNationalTeamLinkKey(value: unknown): NationalTeamLink | null {
    if (typeof value !== 'string') return null;
    const match = /^([mw])\|([A-Za-z]{3})$/.exec(value.trim());
    if (!match) return null;
    return { key: match[1].toLowerCase() as FihCompetitionKey, code: match[2].toUpperCase() };
}

/**
 * Las llaves con las que hay que buscar el vínculo de un ref del feed.
 *
 * Una sola para `fih-wc-1867-ARG`, que dice el género. Las dos para
 * `fih-team-ARG`, que no lo dice: el que llame decide qué hacer si las dos
 * resuelven (ver `resolveLinkedNationalTeamClub`).
 */
export function nationalTeamLinkKeysForRef(ref: unknown): string[] {
    const parsed = parseFihTeamRef(ref);
    if (!parsed) return [];
    const keys: FihCompetitionKey[] = parsed.key ? [parsed.key] : ['m', 'w'];
    return keys.map((key) => nationalTeamLinkKey(key, parsed.code));
}

export type LinkedNationalTeam = NationalTeamLink & {
    clubId: string;
    /** El ref de la ficha del feed para ESE género, ya normalizado. */
    ref: string;
};

/**
 * El club de la base detrás de un ref del feed, o null.
 *
 * null no es un error: quiere decir que ese país todavía no tiene ficha propia
 * y que su lugar sigue siendo la ficha que arma el feed.
 *
 * Un ref sin género con las dos fichas vinculadas también devuelve null, a
 * propósito: ver la cabecera.
 */
export async function resolveLinkedNationalTeamClub(
    client: DbClient,
    ref: unknown,
): Promise<LinkedNationalTeam | null> {
    const keys = nationalTeamLinkKeysForRef(ref);
    if (keys.length === 0) return null;

    try {
        const { data, error } = await client
            .from('club_external_ids')
            .select('external_id, club_id')
            .eq('provider', NATIONAL_TEAM_LINK_PROVIDER)
            .in('external_id', keys);
        if (error) return null;

        const links = ((data ?? []) as Array<Record<string, unknown>>)
            .map((row) => {
                const parsed = parseNationalTeamLinkKey(row.external_id);
                const clubId = typeof row.club_id === 'string' ? row.club_id.trim() : '';
                if (!parsed || !clubId) return null;
                return { ...parsed, clubId, ref: toFihTeamRef(parsed.key, parsed.code) };
            })
            .filter((entry): entry is LinkedNationalTeam => entry !== null);

        // Ambiguo: el ref no dice el género y el país tiene las dos fichas.
        if (links.length !== 1) return null;
        return links[0];
    } catch {
        // Sin tabla de vínculos no hay vínculo, y eso no es una falla.
        return null;
    }
}

/**
 * Los refs del feed que apuntan a un club de la base. Vacío es lo normal: solo
 * las selecciones tienen vínculo.
 *
 * Es una lista y no un valor porque nada impide que una ficha represente a las
 * dos ramas de un país; hoy no pasa, pero el que consume no tiene por qué
 * suponerlo.
 */
export async function getNationalTeamLinksForClub(
    client: DbClient,
    clubId: string,
): Promise<LinkedNationalTeam[]> {
    const id = typeof clubId === 'string' ? clubId.trim() : '';
    if (!id) return [];

    try {
        const { data, error } = await client
            .from('club_external_ids')
            .select('external_id, club_id')
            .eq('provider', NATIONAL_TEAM_LINK_PROVIDER)
            .eq('club_id', id);
        if (error) return [];

        return ((data ?? []) as Array<Record<string, unknown>>)
            .map((row) => {
                const parsed = parseNationalTeamLinkKey(row.external_id);
                if (!parsed) return null;
                return { ...parsed, clubId: id, ref: toFihTeamRef(parsed.key, parsed.code) };
            })
            .filter((entry): entry is LinkedNationalTeam => entry !== null);
    } catch {
        return [];
    }
}
