import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import { isUuid } from '@/lib/utils/postgrest';
import {
    dataUrlMimeType,
    extensionForMime,
    isDataImageUrl,
    sortSponsors,
    toPublicSponsor,
    validateSponsorLogoDataUrl,
    type PublicTournamentSponsor,
    type TournamentSponsor,
} from '@/lib/tournament/sponsors';

/**
 * Acceso a `tournament_sponsors` desde el servidor.
 *
 * Dos caminos, a propósito distintos:
 *  - Administración: lee la tabla completa (con monto) con el cliente admin.
 *    QUIÉN puede hacerlo lo decide la ruta (requireTournamentMutationContext),
 *    no este módulo.
 *  - Público: lee la vista `tournament_sponsors_public`, que no tiene el monto
 *    y ya filtra activos + torneo visible. Si la migración todavía no corrió,
 *    devuelve lista vacía: la página pública nunca se rompe por esto.
 */

export const SPONSOR_LOGO_BUCKET = 'tournaments';
const SPONSOR_LOGO_PREFIX = 'sponsors';

const ADMIN_SELECT = 'id, tournament_id, name, logo_url, amount, currency, status, tier, placement, website_url, starts_at, ends_at, sort_order, created_at, updated_at';
const PUBLIC_SELECT = 'id, tournament_id, name, logo_url, website_url, tier, placement, sort_order';

export class TournamentSponsorsSchemaError extends Error {
    constructor() {
        super('El módulo de sponsors todavía no está habilitado en la base (falta la migración tournament_sponsors).');
        this.name = 'TournamentSponsorsSchemaError';
    }
}

function normalizeRow(row: Record<string, unknown>): TournamentSponsor {
    const amountRaw = row.amount;
    const amount = amountRaw === null || amountRaw === undefined
        ? null
        : Number(amountRaw);
    return {
        id: String(row.id),
        tournament_id: String(row.tournament_id),
        name: String(row.name ?? ''),
        logo_url: (row.logo_url as string | null) ?? null,
        amount: amount !== null && Number.isFinite(amount) ? amount : null,
        currency: typeof row.currency === 'string' && row.currency ? row.currency : 'ARS',
        status: row.status === 'inactive' ? 'inactive' : 'active',
        tier: (row.tier as string | null) ?? null,
        placement: (row.placement as string | null) ?? null,
        website_url: (row.website_url as string | null) ?? null,
        starts_at: (row.starts_at as string | null) ?? null,
        ends_at: (row.ends_at as string | null) ?? null,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
    };
}

function rethrowSchemaError(error: { message?: string | null; code?: string | null } | null): never {
    if (error && isMissingTableError(error as never, 'tournament_sponsors')) {
        throw new TournamentSponsorsSchemaError();
    }
    throw new Error(error?.message || 'No se pudieron leer los sponsors.');
}

export async function listTournamentSponsorsForAdmin(tournamentId: string): Promise<TournamentSponsor[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('tournament_sponsors')
        .select(ADMIN_SELECT)
        .eq('tournament_id', tournamentId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) rethrowSchemaError(error);
    return sortSponsors((data ?? []).map((row: Record<string, unknown>) => normalizeRow(row)));
}

export async function getTournamentSponsorForAdmin(tournamentId: string, sponsorId: string): Promise<TournamentSponsor | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('tournament_sponsors')
        .select(ADMIN_SELECT)
        .eq('tournament_id', tournamentId)
        .eq('id', sponsorId)
        .maybeSingle();

    if (error) rethrowSchemaError(error);
    return data ? normalizeRow(data as Record<string, unknown>) : null;
}

export function normalizeSponsorRow(row: Record<string, unknown>): TournamentSponsor {
    return normalizeRow(row);
}

/**
 * Sponsors ACTIVOS de un torneo para la vista pública. Sin monto: la vista de
 * la base no lo tiene, y `toPublicSponsor` lo vuelve a garantizar del lado de
 * la aplicación por si alguien cambia el SELECT.
 */
export async function fetchPublicTournamentSponsors(tournamentId: string): Promise<PublicTournamentSponsor[]> {
    if (!isUuid(tournamentId)) return [];

    try {
        const db = await getReadClient();
        const { data, error } = await (db as ReturnType<typeof createAdminClient>)
            .from('tournament_sponsors_public')
            .select(PUBLIC_SELECT)
            .eq('tournament_id', tournamentId)
            .order('sort_order', { ascending: true });

        if (error) {
            if (!isMissingTableError(error, 'tournament_sponsors_public')) {
                console.warn('[tournamentSponsors] No se pudieron leer los sponsors públicos:', error.message);
            }
            return [];
        }

        return sortSponsors(
            (data ?? []).map((row: Record<string, unknown>) => toPublicSponsor({
                id: String(row.id),
                name: String(row.name ?? ''),
                logo_url: (row.logo_url as string | null) ?? null,
                website_url: (row.website_url as string | null) ?? null,
                tier: (row.tier as string | null) ?? null,
                placement: (row.placement as string | null) ?? null,
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
            })),
        );
    } catch (error) {
        console.warn('[tournamentSponsors] fetchPublicTournamentSponsors falló:', error);
        return [];
    }
}

/**
 * Sube el logo (data: URL validado) a Storage y devuelve la URL pública.
 * A diferencia de los escudos, acá NO se guarda el data URI como respaldo: un
 * logo de 2 MB en una columna de texto termina en el payload de la página
 * pública. Si Storage falla, el guardado avisa y el sponsor queda sin logo.
 */
export async function persistSponsorLogo(params: {
    tournamentId: string;
    sponsorId: string;
    dataUrl: string;
}): Promise<{ url: string } | { error: string }> {
    const { tournamentId, sponsorId, dataUrl } = params;
    const validationError = validateSponsorLogoDataUrl(dataUrl);
    if (validationError) return { error: validationError };

    const mime = dataUrlMimeType(dataUrl) || 'image/png';
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bytes = Buffer.from(base64, 'base64');
    const filePath = `${SPONSOR_LOGO_PREFIX}/${tournamentId}/${sponsorId}-${Date.now()}.${extensionForMime(mime)}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
        .from(SPONSOR_LOGO_BUCKET)
        .upload(filePath, bytes, { contentType: mime, upsert: false });

    if (error) {
        console.warn('[tournamentSponsors] Storage rechazó el logo', {
            filePath,
            mime,
            bytes: bytes.byteLength,
            message: error.message,
        });
        return { error: 'No se pudo subir el logo. Probá con otra imagen o más liviana.' };
    }

    const { data } = admin.storage.from(SPONSOR_LOGO_BUCKET).getPublicUrl(filePath);
    return { url: data.publicUrl };
}

/** Borra el archivo del logo si está en nuestro bucket. Best-effort: nunca tira. */
export async function removeSponsorLogoObject(logoUrl: string | null | undefined): Promise<void> {
    if (!logoUrl || isDataImageUrl(logoUrl)) return;
    const marker = `/object/public/${SPONSOR_LOGO_BUCKET}/`;
    const index = logoUrl.indexOf(marker);
    if (index < 0) return;
    const objectPath = decodeURIComponent(logoUrl.slice(index + marker.length).split('?')[0]);
    if (!objectPath.startsWith(`${SPONSOR_LOGO_PREFIX}/`)) return;

    try {
        const admin = createAdminClient();
        await admin.storage.from(SPONSOR_LOGO_BUCKET).remove([objectPath]);
    } catch (error) {
        console.warn('[tournamentSponsors] No se pudo borrar el logo anterior:', error);
    }
}
