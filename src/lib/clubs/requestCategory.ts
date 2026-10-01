import { inferCategoryLevelKey, resolveCategoryLevel } from './categoryLevel.ts';
import type { CategoryOption } from './categoryPresets.ts';

type SimilarRow = { id: string; name: string };

export type CategoryRequest = {
    /** Club desde el que se opera (el que da el permiso). */
    clubId: string;
    /** Club del que cuelga la categoría: el propio o el del rival. */
    baseClubId: string;
    label: string;
    level?: string | null;
    variant?: string | null;
};

/** `option` viene cuando `ok`; `error`, cuando no. */
export type CategoryRequestResult = {
    ok: boolean;
    option?: CategoryOption;
    existed?: boolean;
    error?: string;
};

/** ¿La parecida que devolvió el servidor es EXACTAMENTE la que se pidió? */
function isSameCategory(row: SimilarRow, level: string | null, variant: string): boolean {
    if (!level) return false;
    return inferCategoryLevelKey(row.name) === level && resolveCategoryLevel({ name: row.name }).variant === variant;
}

/**
 * Pide una categoría a `/api/clubs/[id]/categories`: la crea, o devuelve la que
 * ya existía.
 *
 * El 409 con `similar` no siempre es "ya existe". El control de gemelas saca del
 * rótulo los tokens del club y los designadores (`c`, `rc`), así que en
 * "Catamarca R.C." la "M16 C" se lee como "M16" y choca con ella. Por eso, si
 * entre las parecidas no hay una con el mismo rango y la misma letra, se vuelve
 * a pedir con `force`: es otra categoría, no una gemela.
 */
export async function requestCategory(request: CategoryRequest): Promise<CategoryRequestResult> {
    const level = request.level ?? null;
    const variant = request.variant ?? '';
    const url = `/api/clubs/${encodeURIComponent(request.clubId)}/categories`;

    const post = async (force: boolean) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseClubId: request.baseClubId,
                label: request.label,
                level,
                variant: variant || null,
                force,
            }),
        });
        const payload = await response.json().catch(() => null);
        return { response, payload };
    };

    try {
        let { response, payload } = await post(false);

        if (response.status === 409 && Array.isArray(payload?.similar) && payload.similar.length > 0) {
            const similar = payload.similar as SimilarRow[];
            const same = similar.find((row) => isSameCategory(row, level, variant))
                // Nombre libre (sin rango): la parecida es la que se quiso decir.
                ?? (!level ? similar[0] : undefined);
            if (same) return { ok: true, option: { id: same.id, name: same.name, isBase: false }, existed: true };
            ({ response, payload } = await post(true));
        }

        if (!response.ok || !payload?.ok || !payload.category) {
            return { ok: false, error: payload?.error || 'No se pudo crear la categoría.' };
        }

        return {
            ok: true,
            option: { id: payload.category.id, name: payload.category.name, isBase: false },
            existed: false,
        };
    } catch {
        return { ok: false, error: 'No se pudo crear la categoría. Revisá la conexión.' };
    }
}
