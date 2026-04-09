import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { normalizeSlug } from '@/lib/utils/normalize';
import { normalizeProdeSourceBinding } from '@/lib/prode/source';
import type { ProdeSourceBinding } from '@/lib/prode/types';

export const dynamic = 'force-dynamic';

type QueryError = { message?: string | null } | null;
type LooseRow = Record<string, unknown>;

interface LooseQueryBuilder<T = LooseRow> extends PromiseLike<{ data: T | null; error: QueryError }> {
    select(columns: string): LooseQueryBuilder<T>;
    eq(column: string, value: string): LooseQueryBuilder<T>;
    order(column: string, options?: { ascending?: boolean }): LooseQueryBuilder<T>;
    maybeSingle(): PromiseLike<{ data: T | null; error: QueryError }>;
    single(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseMutationBuilder<T = LooseRow> extends PromiseLike<{ data: T | null; error: QueryError }> {
    select(columns: string): LooseMutationBuilder<T>;
    eq(column: string, value: string): LooseMutationBuilder<T>;
    single(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseAdminClient {
    from(table: string): {
        select(columns: string): LooseQueryBuilder<LooseRow>;
        insert(payload: LooseRow): LooseMutationBuilder<LooseRow>;
        update(payload: LooseRow): LooseMutationBuilder<LooseRow>;
        upsert(payload: LooseRow, options?: { onConflict?: string }): PromiseLike<{ error: QueryError }>;
    };
}

type LeagueRulesPayload = {
    templateId?: string;
    exact?: number;
    winner?: number;
    diff?: number;
    oneTeamExact?: number;
    minutes?: number;
    doubleFinals?: boolean;
};

type CreateLeaguePayload = {
    name?: string;
    description?: string;
    visibility?: 'public' | 'private';
    selectedCompetition?: {
        id?: string;
        name?: string;
        displayName?: string;
        sportId?: string | null;
        sportLabel?: string | null;
        countryLabel?: string | null;
        logoUrl?: string | null;
        sourceBinding?: ProdeSourceBinding;
    };
    rules?: LeagueRulesPayload;
};

type UpdateLeaguePayload = {
    leagueId?: string;
    action?: 'update_rules' | 'set_member_role' | 'archive_league' | 'delete_league';
    rules?: LeagueRulesPayload;
    targetUserId?: string;
    role?: 'admin' | 'member';
};

function makeInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ensureString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function ensureNullableString(value: unknown) {
    const normalized = ensureString(value);
    return normalized || null;
}

function ensureFiniteNumber(value: unknown, fallback: number) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function ensureObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function normalizeLeagueRules(rules: LeagueRulesPayload | undefined) {
    return {
        templateId: ensureString(rules?.templateId) || 'classic',
        exact: ensureFiniteNumber(rules?.exact, 5),
        winner: ensureFiniteNumber(rules?.winner, 3),
        diff: ensureFiniteNumber(rules?.diff, 2),
        oneTeamExact: ensureFiniteNumber(rules?.oneTeamExact, 1),
        minutes: ensureFiniteNumber(rules?.minutes, 15),
        doubleFinals: Boolean(rules?.doubleFinals),
    };
}

function mergeLeagueRules(base: Record<string, unknown>, overrides: LeagueRulesPayload | undefined) {
    return {
        templateId: ensureString(overrides?.templateId) || ensureString(base.templateId) || 'classic',
        exact: ensureFiniteNumber(overrides?.exact ?? base.exact, 5),
        winner: ensureFiniteNumber(overrides?.winner ?? base.winner, 3),
        diff: ensureFiniteNumber(overrides?.diff ?? base.diff, 2),
        oneTeamExact: ensureFiniteNumber(overrides?.oneTeamExact ?? base.oneTeamExact, 1),
        minutes: ensureFiniteNumber(overrides?.minutes ?? base.minutes, 15),
        doubleFinals: typeof overrides?.doubleFinals === 'boolean'
            ? overrides.doubleFinals
            : Boolean(base.doubleFinals),
    };
}

function getLeagueLifecycle(metadata: Record<string, unknown>) {
    const lifecycle = ensureString(metadata.lifecycle);
    return lifecycle === 'archived' || lifecycle === 'deleted' ? lifecycle : 'active';
}

async function ensureUserProfile(admin: LooseAdminClient, authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
    const { data: existingUser, error: existingUserError } = await admin
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

    if (existingUserError) {
        throw new Error(existingUserError.message || 'No se pudo validar el perfil del usuario.');
    }

    if (existingUser) {
        return;
    }

    const { error: insertUserError } = await admin
        .from('users')
        .insert({
            id: authUser.id,
            email: authUser.email || '',
            name: ensureString(authUser.user_metadata?.full_name) || ensureString(authUser.user_metadata?.name) || authUser.email?.split('@')[0] || 'Usuario',
            avatar_url: ensureNullableString(authUser.user_metadata?.avatar_url) || ensureNullableString(authUser.user_metadata?.picture),
            role: 'fan',
            last_login_at: new Date().toISOString(),
        });

    if (insertUserError) {
        throw new Error(insertUserError.message || 'No se pudo crear el perfil del usuario.');
    }
}

async function generateUniqueInviteCode(admin: LooseAdminClient) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const inviteCode = makeInviteCode();
        const { data, error } = await admin
            .from('prode_private_leagues')
            .select('id')
            .eq('invite_code', inviteCode)
            .maybeSingle();

        if (error) {
            throw new Error(error.message || 'No se pudo validar el codigo de invitacion.');
        }

        if (!data) {
            return inviteCode;
        }
    }

    throw new Error('No se pudo generar un codigo unico para la liga.');
}

async function generateUniqueLeagueSlug(admin: LooseAdminClient, competitionId: string, leagueName: string) {
    const baseSlug = normalizeSlug(leagueName) || 'liga-privada';

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const nextSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const { data, error } = await admin
            .from('prode_private_leagues')
            .select('id')
            .eq('competition_id', competitionId)
            .eq('slug', nextSlug)
            .maybeSingle();

        if (error) {
            throw new Error(error.message || 'No se pudo validar el slug de la liga.');
        }

        if (!data) {
            return nextSlug;
        }
    }

    throw new Error('No se pudo generar un slug unico para la liga.');
}

async function generateUniqueCompetitionSlug(admin: LooseAdminClient, baseName: string) {
    const baseSlug = normalizeSlug(`prode-${baseName}`) || 'prode-competencia';

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const nextSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const { data, error } = await admin
            .from('prode_competitions')
            .select('id')
            .eq('slug', nextSlug)
            .maybeSingle();

        if (error) {
            throw new Error(error.message || 'No se pudo validar el slug de la competencia.');
        }

        if (!data) {
            return nextSlug;
        }
    }

    throw new Error('No se pudo generar un slug unico para la competencia.');
}

async function ensureBaseCompetition(admin: LooseAdminClient, selection: NonNullable<CreateLeaguePayload['selectedCompetition']>, rules: NonNullable<CreateLeaguePayload['rules']>) {
    const sourceBinding = normalizeProdeSourceBinding({
        source_type: selection.sourceBinding?.sourceType,
        local_tournament_id: selection.sourceBinding?.localTournamentId,
        external_provider: selection.sourceBinding?.externalProvider,
        external_tournament_id: selection.sourceBinding?.externalTournamentId,
    });

    if (sourceBinding.sourceType === 'local' && sourceBinding.localTournamentId) {
        const { data, error } = await admin
            .from('prode_competitions')
            .select('id')
            .eq('source_type', 'local')
            .eq('local_tournament_id', sourceBinding.localTournamentId)
            .order('created_at', { ascending: true })
            .maybeSingle();

        if (error) {
            throw new Error(error.message || 'No se pudo buscar la competencia base local.');
        }

        if (data?.id) {
            return String(data.id);
        }
    }

    if (sourceBinding.sourceType === 'external' && sourceBinding.externalProvider && sourceBinding.externalTournamentId) {
        const { data, error } = await admin
            .from('prode_competitions')
            .select('id')
            .eq('source_type', 'external')
            .eq('external_provider', sourceBinding.externalProvider)
            .eq('external_tournament_id', sourceBinding.externalTournamentId)
            .order('created_at', { ascending: true })
            .maybeSingle();

        if (error) {
            throw new Error(error.message || 'No se pudo buscar la competencia base externa.');
        }

        if (data?.id) {
            return String(data.id);
        }
    }

    const displayName = ensureString(selection.displayName) || ensureString(selection.name) || 'Competencia';
    const competitionSlug = await generateUniqueCompetitionSlug(admin, displayName);
    const metadata = {
        autoCreated: true,
        baseCompetition: {
            id: ensureString(selection.id),
            displayName,
            sportLabel: ensureNullableString(selection.sportLabel),
            countryLabel: ensureNullableString(selection.countryLabel),
            logoUrl: ensureNullableString(selection.logoUrl),
        },
        defaultPrivateLeagueRules: {
            ...normalizeLeagueRules(rules),
        },
    };

    const competitionPayload = {
        name: displayName,
        slug: competitionSlug,
        description: null,
        status: 'active',
        visibility: 'unlisted',
        source_type: sourceBinding.sourceType,
        local_tournament_id: sourceBinding.localTournamentId,
        external_provider: sourceBinding.externalProvider,
        external_tournament_id: sourceBinding.externalTournamentId,
        sport_id: ensureNullableString(selection.sportId),
        prediction_lead_minutes: 0,
        metadata,
    };

    const { data: insertedCompetition, error: insertCompetitionError } = await admin
        .from('prode_competitions')
        .insert(competitionPayload)
        .select('id')
        .single();

    if (insertCompetitionError || !insertedCompetition?.id) {
        throw new Error(insertCompetitionError?.message || 'No se pudo crear la competencia base del prode.');
    }

    return String(insertedCompetition.id);
}

export async function POST(request: Request) {
    try {
        const supabase = await createServerClient();
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json() as CreateLeaguePayload;
        const leagueName = ensureString(payload.name);
        const visibility = payload.visibility === 'public' ? 'public' : 'private';
        const selectedCompetition = payload.selectedCompetition;
        const rules = normalizeLeagueRules(payload.rules);

        if (!leagueName) {
            return NextResponse.json({ error: 'El nombre de la liga es obligatorio.' }, { status: 400 });
        }

        if (!selectedCompetition?.sourceBinding?.sourceType) {
            return NextResponse.json({ error: 'La competencia base es obligatoria.' }, { status: 400 });
        }

        const admin = createAdminClient() as unknown as LooseAdminClient;
        await ensureUserProfile(admin, session.user);

        const competitionId = await ensureBaseCompetition(admin, selectedCompetition, rules);
        const inviteCodeValue = await generateUniqueInviteCode(admin);
        const leagueSlug = await generateUniqueLeagueSlug(admin, competitionId, leagueName);

        const leagueMetadata = {
            description: ensureNullableString(payload.description),
            lifecycle: 'active',
            rules,
            rulesVersion: 1,
            rulesHistory: [{
                version: 1,
                appliedAt: new Date().toISOString(),
                appliedBy: session.user.id,
                retroactive: false,
                rules,
            }],
            baseCompetition: {
                id: ensureString(selectedCompetition.id),
                name: ensureString(selectedCompetition.name),
                displayName: ensureString(selectedCompetition.displayName),
                sportLabel: ensureNullableString(selectedCompetition.sportLabel),
                countryLabel: ensureNullableString(selectedCompetition.countryLabel),
                logoUrl: ensureNullableString(selectedCompetition.logoUrl),
            },
        };

        const { data: createdLeague, error: createLeagueError } = await admin
            .from('prode_private_leagues')
            .insert({
                competition_id: competitionId,
                owner_user_id: session.user.id,
                name: leagueName,
                slug: leagueSlug,
                invite_code: inviteCodeValue,
                visibility,
                metadata: leagueMetadata,
            })
            .select('id, invite_code, slug')
            .single();

        if (createLeagueError || !createdLeague?.id) {
            return NextResponse.json(
                { error: createLeagueError?.message || 'No se pudo crear la liga privada.' },
                { status: 500 },
            );
        }

        const membershipOperations = await Promise.all([
            admin
                .from('prode_competition_members')
                .upsert({
                    competition_id: competitionId,
                    user_id: session.user.id,
                    status: 'active',
                }, { onConflict: 'competition_id,user_id' }),
            admin
                .from('prode_private_league_members')
                .upsert({
                    private_league_id: createdLeague.id,
                    user_id: session.user.id,
                    role: 'owner',
                }, { onConflict: 'private_league_id,user_id' }),
        ]);

        const membershipError = membershipOperations.find((result) => result.error)?.error;
        if (membershipError) {
            return NextResponse.json(
                { error: membershipError.message || 'No se pudieron crear las membresias iniciales de la liga.' },
                { status: 500 },
            );
        }

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
        const inviteCode = ensureString(createdLeague.invite_code);
        const createdSlug = ensureString(createdLeague.slug);
        const shareUrl = `${normalizedBaseUrl}/prode/ligas/unirse?codigo=${encodeURIComponent(inviteCode)}`;
        const leagueUrl = `${normalizedBaseUrl}/prode/ligas/${encodeURIComponent(createdSlug)}`;

        return NextResponse.json({
            leagueId: createdLeague.id,
            competitionId,
            inviteCode,
            shareUrl,
            leagueUrl,
            slug: createdSlug,
        });
    } catch (error) {
        console.error('[prode/private-leagues] create error:', error);
        const message = error instanceof Error ? error.message : 'No se pudo crear la liga privada.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function getManagedLeague(admin: LooseAdminClient, leagueId: string, userId: string) {
    const leagueResult = await admin
        .from('prode_private_leagues')
        .select('id, owner_user_id, competition_id, metadata')
        .eq('id', leagueId)
        .maybeSingle();

    if (leagueResult.error) {
        throw new Error(leagueResult.error.message || 'No se pudo cargar la liga.');
    }

    if (!leagueResult.data) {
        throw new Error('La liga privada no existe.');
    }

    if (ensureString(leagueResult.data.owner_user_id) === userId) {
        return leagueResult.data;
    }

    const membershipResult = await admin
        .from('prode_private_league_members')
        .select('role')
        .eq('private_league_id', leagueId)
        .eq('user_id', userId)
        .maybeSingle();

    if (membershipResult.error) {
        throw new Error(membershipResult.error.message || 'No se pudieron validar los permisos de la liga.');
    }

    const role = ensureString(membershipResult.data?.role);
    if (role !== 'admin') {
        throw new Error('No tenes permisos para administrar esta liga.');
    }

    return leagueResult.data;
}

export async function PATCH(request: Request) {
    try {
        const supabase = await createServerClient();
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json() as UpdateLeaguePayload;
        const leagueId = ensureString(payload.leagueId);
        const action = ensureString(payload.action);

        if (!leagueId || !action) {
            return NextResponse.json({ error: 'Faltan datos para actualizar la liga.' }, { status: 400 });
        }

        const admin = createAdminClient() as unknown as LooseAdminClient;
        await ensureUserProfile(admin, session.user);

        const league = await getManagedLeague(admin, leagueId, session.user.id);

        if (action === 'update_rules') {
            const currentMetadata = ensureObject(league.metadata);
            if (getLeagueLifecycle(currentMetadata) !== 'active') {
                return NextResponse.json({ error: 'La liga ya no esta activa para editar reglas.' }, { status: 400 });
            }
            const currentRules = ensureObject(currentMetadata.rules);
            const currentVersion = ensureFiniteNumber(currentMetadata.rulesVersion, 1);
            const nextRules = mergeLeagueRules(currentRules, payload.rules);

            const currentHistory = Array.isArray(currentMetadata.rulesHistory)
                ? currentMetadata.rulesHistory.filter((entry) => entry && typeof entry === 'object')
                : [];

            const nextVersion = currentVersion + 1;
            const updatedMetadata = {
                ...currentMetadata,
                rules: nextRules,
                rulesVersion: nextVersion,
                rulesLastUpdatedAt: new Date().toISOString(),
                rulesLastUpdatedBy: session.user.id,
                rulesHistory: [
                    ...currentHistory,
                    {
                        version: nextVersion,
                        appliedAt: new Date().toISOString(),
                        appliedBy: session.user.id,
                        retroactive: false,
                        rules: nextRules,
                    },
                ],
            };

            const { error: updateLeagueError } = await admin
                .from('prode_private_leagues')
                .update({ metadata: updatedMetadata })
                .eq('id', leagueId);

            if (updateLeagueError) {
                return NextResponse.json({ error: updateLeagueError.message || 'No se pudieron actualizar las reglas.' }, { status: 500 });
            }

            return NextResponse.json({
                ok: true,
                rules: nextRules,
                rulesVersion: nextVersion,
                retroactive: false,
                message: 'Las nuevas reglas aplican solo a futuros puntajes. Los puntos ya obtenidos no se recalculan.',
            });
        }

        if (action === 'archive_league' || action === 'delete_league') {
            const currentMetadata = ensureObject(league.metadata);
            const nextLifecycle = action === 'archive_league' ? 'archived' : 'deleted';
            const timestampKey = nextLifecycle === 'archived' ? 'archivedAt' : 'deletedAt';
            const userKey = nextLifecycle === 'archived' ? 'archivedBy' : 'deletedBy';
            const updatedMetadata = {
                ...currentMetadata,
                lifecycle: nextLifecycle,
                [timestampKey]: new Date().toISOString(),
                [userKey]: session.user.id,
            };

            const { error: updateLeagueError } = await admin
                .from('prode_private_leagues')
                .update({ metadata: updatedMetadata })
                .eq('id', leagueId);

            if (updateLeagueError) {
                return NextResponse.json(
                    { error: updateLeagueError.message || 'No se pudo actualizar el estado de la liga.' },
                    { status: 500 },
                );
            }

            return NextResponse.json({
                ok: true,
                lifecycle: nextLifecycle,
                message: nextLifecycle === 'archived'
                    ? 'La liga quedo archivada y ya no aparece como activa.'
                    : 'La liga quedo borrada y dejara de estar disponible.',
            });
        }

        if (action === 'set_member_role') {
            const targetUserId = ensureString(payload.targetUserId);
            const nextRole = payload.role === 'admin' ? 'admin' : 'member';

            if (!targetUserId) {
                return NextResponse.json({ error: 'El usuario objetivo es obligatorio.' }, { status: 400 });
            }

            if (targetUserId === ensureString(league.owner_user_id)) {
                return NextResponse.json({ error: 'El owner principal no se puede modificar desde esta accion.' }, { status: 400 });
            }

            const membershipResult = await admin
                .from('prode_private_league_members')
                .select('private_league_id, user_id, role')
                .eq('private_league_id', leagueId)
                .eq('user_id', targetUserId)
                .maybeSingle();

            if (membershipResult.error) {
                return NextResponse.json({ error: membershipResult.error.message || 'No se pudo cargar la membresia.' }, { status: 500 });
            }

            if (!membershipResult.data) {
                return NextResponse.json({ error: 'El usuario primero debe formar parte de la liga.' }, { status: 400 });
            }

            const { error: updateRoleError } = await admin
                .from('prode_private_league_members')
                .update({ role: nextRole })
                .eq('private_league_id', leagueId)
                .eq('user_id', targetUserId);

            if (updateRoleError) {
                return NextResponse.json({ error: updateRoleError.message || 'No se pudo actualizar el rol del miembro.' }, { status: 500 });
            }

            return NextResponse.json({
                ok: true,
                targetUserId,
                role: nextRole,
                message: nextRole === 'admin'
                    ? 'El miembro ahora puede administrar la liga y editar las reglas.'
                    : 'El miembro volvio a rol comun.',
            });
        }

        return NextResponse.json({ error: 'Accion no soportada.' }, { status: 400 });
    } catch (error) {
        console.error('[prode/private-leagues] update error:', error);
        const message = error instanceof Error ? error.message : 'No se pudo actualizar la liga privada.';
        const status = message.includes('permisos') ? 403 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
