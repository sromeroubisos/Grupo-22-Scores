/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type IntegrationMeta = {
    name: string;
    description: string;
};

const INTEGRATIONS: Record<string, IntegrationMeta> = {
    public_profile: { name: 'Perfil publico del club', description: 'Identidad institucional visible en la ficha publica.' },
    fixture_sync: { name: 'Fixture sincronizado', description: 'Lectura de partidos reales del club en matches.' },
    standings: { name: 'Estadisticas competitivas', description: 'Posiciones y tablas vinculadas al club.' },
    editorial: { name: 'Comunicaciones', description: 'Publicaciones y noticias del club.' },
    bulk_roster: { name: 'Importacion masiva de planteles', description: 'Alta masiva de jugadores hacia el club activo.' },
    documents: { name: 'Repositorio documental', description: 'Archivos y documentos internos del club.' },
    sponsors: { name: 'Sponsors', description: 'Modelo comercial y aliados institucionales.' },
};

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

async function resolveClubAccess(clubId: string, allowedRoles: ReadonlySet<string>) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return { error: err('No autenticado', 401) };

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) return { error: err('Club no encontrado', 404) };

    if (!canManageClubContext(context, target, allowedRoles)) {
        return { error: err('Sin permisos para este club', 403) };
    }

    return { context, target };
}

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const admin = createAdminClient() as any;
        const [
            { data: rows, error: integrationError },
            { data: club, error: clubError },
            { count: matchesCount, error: matchesError },
            { count: standingsCount, error: standingsError },
            { count: newsCount, error: newsError },
            { count: documentCount, error: documentError },
            { count: sponsorCount, error: sponsorError },
        ] = await Promise.all([
            admin
                .from('club_integration_settings')
                .select('club_id, integration_key, enabled, config, updated_at')
                .eq('club_id', clubId),
            admin
                .from('clubs')
                .select('id, name, is_visible')
                .eq('id', clubId)
                .maybeSingle(),
            admin
                .from('matches')
                .select('id', { count: 'exact', head: true })
                .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`),
            admin
                .from('tournament_standings')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId),
            admin
                .from('news')
                .select('id', { count: 'exact', head: true })
                .eq('scope', 'club')
                .eq('scope_id', clubId),
            admin
                .from('club_documents')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId),
            admin
                .from('club_sponsors')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId),
        ]);

        if (integrationError) throw integrationError;
        if (clubError) throw clubError;
        if (matchesError) throw matchesError;
        if (standingsError) throw standingsError;
        if (newsError) throw newsError;
        if (documentError) throw documentError;
        if (sponsorError) throw sponsorError;

        const byKey = new Map<string, any>(((rows ?? []) as any[]).map((row) => [row.integration_key, row]));
        const data = Object.entries(INTEGRATIONS).map(([key, meta]) => {
            const row = byKey.get(key);
            let observedStatus = 'Sin actividad detectada';

            if (key === 'public_profile') {
                observedStatus = club?.is_visible ? 'Visible en la ficha publica' : 'Oculto o incompleto';
            }
            if (key === 'fixture_sync') {
                observedStatus = `${matchesCount ?? 0} partido(s) detectados`;
            }
            if (key === 'standings') {
                observedStatus = `${standingsCount ?? 0} tabla(s) detectadas`;
            }
            if (key === 'editorial') {
                observedStatus = `${newsCount ?? 0} publicacion(es) del club`;
            }
            if (key === 'bulk_roster') {
                observedStatus = 'Disponible desde Planteles';
            }
            if (key === 'documents') {
                observedStatus = `${documentCount ?? 0} documento(s) cargados`;
            }
            if (key === 'sponsors') {
                observedStatus = `${sponsorCount ?? 0} sponsor(s) registrados`;
            }

            return {
                key,
                name: meta.name,
                description: meta.description,
                enabled: Boolean(row?.enabled),
                config: row?.config || {},
                updatedAt: row?.updated_at || null,
                observedStatus,
            };
        });

        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar las integraciones';
        return err(message, 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        const integrationKey = normalizeText(body.integrationKey);
        if (!clubId) return err('clubId required', 400);
        if (!integrationKey) return err('integrationKey required', 400);
        if (!(integrationKey in INTEGRATIONS)) return err('integrationKey invalida', 400);

        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const admin = createAdminClient() as any;
        const payload = {
            club_id: clubId,
            integration_key: integrationKey,
            enabled: Boolean(body.enabled),
            config: typeof body.config === 'object' && body.config !== null ? body.config : {},
        };

        const { data, error } = await admin
            .from('club_integration_settings')
            .upsert(payload, { onConflict: 'club_id,integration_key' })
            .select('club_id, integration_key, enabled, config, updated_at')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar la integracion';
        return err(message, 500);
    }
}
