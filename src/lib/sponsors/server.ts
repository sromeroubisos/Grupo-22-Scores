/**
 * Sponsors: quién es el dueño, quién puede tocarlos y cómo se leen.
 *
 * Las cuatro rutas de /api/sponsors pasan por acá. Los permisos son los MISMOS
 * que ya usa cada gestor, no unos nuevos:
 *   - club:    canManageClubContext con EDIT_MEMBERSHIP_ROLES (como Sedes).
 *   - torneo:  membresía del torneo (como requireTournamentMutationContext) O el
 *              alcance del gestor de torneos (resolveTournamentAdminScope). El
 *              segundo hace falta porque un gestor_torneos que creó el torneo
 *              no siempre tiene una membresía, y el gestor le abre la pantalla
 *              por esa misma vía (admin/entities/[id]/manage/page.tsx).
 *
 * Una vez resuelto el permiso se escribe con service role, con el dueño ya
 * fijado en el código.
 */

import 'server-only';

import {
    canManageClubContext,
    canManageTournamentContext,
    getClubManagementTarget,
    getTournamentManagementTarget,
    requireUserAccessContext,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import {
    EDIT_MEMBERSHIP_ROLES,
    MANAGEMENT_MEMBERSHIP_ROLES,
    isGlobalAdminRole,
    isTournamentAdminRole,
} from '@/lib/auth/roles';
import { isScopeAllowedTournament, resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/utils/postgrest';
import type { PublicSponsor, Sponsor, SponsorOwnerType } from './formats';

export const SPONSORS_TABLE = 'entity_sponsors';
export const SPONSORS_BUCKET = 'sponsors';

export const SPONSOR_COLUMNS =
    'id, owner_type, club_id, tournament_id, name, format, image_url, image_width, image_height, sort_order, is_active, tier, placement, link_url, starts_at, ends_at';

export interface SponsorOwner {
    type: SponsorOwnerType;
    /** El id REAL: `clubs.id` o `tournaments.id` (nunca un slug). */
    id: string;
}

type SponsorRow = {
    id: string;
    owner_type: SponsorOwnerType;
    club_id: string | null;
    tournament_id: string | null;
    name: string;
    format: Sponsor['format'];
    image_url: string;
    image_width: number | null;
    image_height: number | null;
    sort_order: number;
    is_active: boolean;
    tier: Sponsor['tier'];
    placement: string;
    link_url: string | null;
    starts_at: string | null;
    ends_at: string | null;
};

export class SponsorApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'SponsorApiError';
        this.status = status;
    }
}

const MISSING_TABLE_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);

export function isMissingSponsorsTable(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && MISSING_TABLE_CODES.has(code);
}

export const MISSING_TABLE_MESSAGE =
    'La tabla de sponsors todavía no existe en la base: falta correr la migración 20260924120000_entity_sponsors.sql.';

export function ownerColumn(type: SponsorOwnerType) {
    return type === 'club' ? 'club_id' : 'tournament_id';
}

export function mapSponsorRow(row: SponsorRow): Sponsor {
    return {
        id: row.id,
        ownerType: row.owner_type,
        ownerId: (row.owner_type === 'club' ? row.club_id : row.tournament_id) ?? '',
        name: row.name,
        format: row.format,
        imageUrl: row.image_url,
        imageWidth: row.image_width,
        imageHeight: row.image_height,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        tier: row.tier,
        placement: row.placement,
        linkUrl: row.link_url,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
    };
}

export function toPublicSponsor(sponsor: Sponsor): PublicSponsor {
    return {
        id: sponsor.id,
        name: sponsor.name,
        format: sponsor.format,
        imageUrl: sponsor.imageUrl,
        imageWidth: sponsor.imageWidth,
        imageHeight: sponsor.imageHeight,
        tier: sponsor.tier,
        placement: sponsor.placement,
        linkUrl: sponsor.linkUrl,
    };
}

/**
 * Pasa del id que llega en la URL al id real del dueño. La página pública de
 * torneo acepta slug, así que un torneo puede llegar como `super-rugby-2026`.
 * Devuelve null si no existe: la vitrina pública lo toma como "sin sponsors".
 */
export async function resolveSponsorOwner(type: SponsorOwnerType, rawId: string): Promise<SponsorOwner | null> {
    const value = rawId.trim();
    if (!value) return null;

    if (type === 'club') return { type, id: value };

    if (isUuid(value)) return { type, id: value };

    const admin = createAdminClient();
    const { data } = await admin.from('tournaments').select('id').eq('slug', value).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return id ? { type, id } : null;
}

async function canManageTournament(
    supabase: Awaited<ReturnType<typeof createClient>>,
    context: UserAccessContext,
    tournamentId: string,
) {
    const target = await getTournamentManagementTarget(supabase, tournamentId);
    if (target && canManageTournamentContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) return true;

    if (isGlobalAdminRole(context.role) || isTournamentAdminRole(context.role)) {
        const scope = await resolveTournamentAdminScope(supabase, context);
        return isScopeAllowedTournament(scope, tournamentId);
    }

    return false;
}

/** Tira SponsorApiError (401/403/404) si el usuario no puede gestionar al dueño. */
export async function requireSponsorOwnerAccess(owner: SponsorOwner): Promise<{ userId: string }> {
    const supabase = await createClient();

    let context: UserAccessContext;
    try {
        context = await requireUserAccessContext(supabase);
    } catch {
        throw new SponsorApiError('Iniciá sesión para gestionar sponsors.', 401);
    }

    if (owner.type === 'club') {
        const target = await getClubManagementTarget(supabase, owner.id);
        if (!target) throw new SponsorApiError('Club no encontrado.', 404);
        if (!canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
            throw new SponsorApiError('No tenés permisos para editar los sponsors de este club.', 403);
        }
        return { userId: context.userId };
    }

    if (!(await canManageTournament(supabase, context, owner.id))) {
        throw new SponsorApiError('No tenés permisos para editar los sponsors de este torneo.', 403);
    }
    return { userId: context.userId };
}

/** Todos los sponsors del dueño, activos o no, en el orden de la vitrina. */
export async function listOwnerSponsors(owner: SponsorOwner): Promise<Sponsor[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(SPONSORS_TABLE)
        .select(SPONSOR_COLUMNS)
        .eq(ownerColumn(owner.type), owner.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        if (isMissingSponsorsTable(error)) throw new SponsorApiError(MISSING_TABLE_MESSAGE, 503);
        throw error;
    }

    return ((data ?? []) as SponsorRow[]).map(mapSponsorRow);
}

/**
 * Lo que ve el público: activos y dentro de la ventana de campaña. Nunca tira:
 * una vitrina de sponsors que falla no puede tumbar la página del club.
 */
export async function listPublicSponsors(owner: SponsorOwner): Promise<PublicSponsor[]> {
    try {
        const now = new Date().toISOString();
        const admin = createAdminClient();
        const { data, error } = await admin
            .from(SPONSORS_TABLE)
            .select(SPONSOR_COLUMNS)
            .eq(ownerColumn(owner.type), owner.id)
            .eq('is_active', true)
            .or(`starts_at.is.null,starts_at.lte.${now}`)
            .or(`ends_at.is.null,ends_at.gt.${now}`)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            if (!isMissingSponsorsTable(error)) console.error('[sponsors] lectura pública falló:', error);
            return [];
        }

        return ((data ?? []) as SponsorRow[]).map(mapSponsorRow).map(toPublicSponsor);
    } catch (error) {
        console.error('[sponsors] lectura pública falló:', error);
        return [];
    }
}

/** Carga una fila por id para PATCH/DELETE: el dueño sale de la FILA, no del pedido. */
export async function loadSponsorById(id: string): Promise<Sponsor | null> {
    if (!isUuid(id)) return null;

    const admin = createAdminClient();
    const { data, error } = await admin.from(SPONSORS_TABLE).select(SPONSOR_COLUMNS).eq('id', id).maybeSingle();
    if (error) {
        if (isMissingSponsorsTable(error)) throw new SponsorApiError(MISSING_TABLE_MESSAGE, 503);
        throw error;
    }
    return data ? mapSponsorRow(data as SponsorRow) : null;
}

export function normalizeLinkUrl(value: unknown): string | null | 'invalid' {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return 'invalid';
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : 'invalid';
    } catch {
        return 'invalid';
    }
}

/** Solo aceptamos imágenes que salieron de nuestro bucket: nada de hotlinks. */
export function isOwnSponsorImageUrl(value: string) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return false;
    return value.startsWith(`${base.replace(/\/$/, '')}/storage/v1/object/public/${SPONSORS_BUCKET}/`);
}

export function sponsorErrorResponseBody(error: unknown, fallback: string) {
    if (error instanceof SponsorApiError) return { status: error.status, body: { error: error.message } };
    // El detalle de Postgres va al log, no a la pantalla.
    console.error('[sponsors]', error);
    return { status: 500, body: { error: fallback } };
}
