// Catálogo de clubes del panel de torneos, pedido entero.
//
// PostgREST corta cada respuesta en 1000 filas (db-max-rows): una sola llamada
// con `limit=2000` devuelve 1000 y nadie avisa. Con el catálogo por encima de
// esa marca, todo lo que ordena después del corte —de "Don Bosco" en adelante—
// desaparecía de los buscadores, que filtran en memoria sobre lo que llegó.

export const SCOPED_CLUB_PAGE_SIZE = 1000;

export type ScopedClubCatalogResult<T> = {
    ok: boolean;
    status: number;
    error: string | null;
    rows: T[];
};

/**
 * Pide `/api/admin/torneo/clubs` página por página hasta que una venga corta:
 * ahí se terminó el catálogo. `divisions: false` saltea los planteles, que
 * cuestan una consulta cada 200 clubes y solo los pinta el panel de clubes.
 */
export async function fetchScopedClubCatalog<T>(
    options: { divisions?: boolean } = {},
): Promise<ScopedClubCatalogResult<T>> {
    const divisionsParam = options.divisions === false ? '&divisions=0' : '';
    const rows: T[] = [];

    for (let offset = 0; ; offset += SCOPED_CLUB_PAGE_SIZE) {
        const response = await fetch(
            `/api/admin/torneo/clubs?limit=${SCOPED_CLUB_PAGE_SIZE}&offset=${offset}${divisionsParam}`,
            { cache: 'no-store', credentials: 'include' },
        );
        const payload = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;

        if (!response.ok) {
            const message = payload && typeof payload.error === 'string' ? payload.error : '';
            return { ok: false, status: response.status, error: message || null, rows };
        }

        const page = Array.isArray(payload?.data) ? payload.data as T[] : [];
        rows.push(...page);

        if (page.length < SCOPED_CLUB_PAGE_SIZE) {
            return { ok: true, status: response.status, error: null, rows };
        }
    }
}
