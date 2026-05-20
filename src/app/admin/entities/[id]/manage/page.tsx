import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveEntity, EntityType, ClubRow as ResolvedClubRow } from '@/lib/services/entityResolver';
import { getRelatedItems } from '@/lib/services/relatedResolver';
import { EntityHeader } from '@/components/admin/entities/EntityHeader';
import { EntityTabs } from '@/components/admin/entities/EntityTabs';
import { PlayerEditor } from '@/components/admin/entities/editors/PlayerEditor';
import { RelatedSection } from '@/components/admin/entities/related/RelatedSection';
import { AuditSection } from '@/components/admin/entities/audit/AuditSection';
import { TournamentSummaryTab } from '@/components/admin/entities/tournament/TournamentSummaryTab';
import { TournamentDetailsTab } from '@/components/admin/entities/tournament/TournamentDetailsTab';
import { TournamentFormatTab } from '@/components/admin/entities/tournament/TournamentFormatTab';
import { TournamentMediaTab } from '@/components/admin/entities/tournament/TournamentMediaTab';
import { TournamentPublishTab } from '@/components/admin/entities/tournament/TournamentPublishTab';
import { TournamentManageShell } from '@/components/admin/entities/tournament/TournamentManageShell';
import { TournamentStructureTab } from '@/components/admin/entities/tournament/TournamentStructureTab';
import { ClubManageShell } from '@/components/admin/entities/club/ClubManageShell';
import { TournamentParticipantsTab } from '@/components/admin/entities/tournament/TournamentParticipantsTab';
import { TournamentOperationTab } from '@/components/admin/entities/tournament/TournamentOperationTab';
import { TournamentRelatedTab } from '@/components/admin/entities/tournament/TournamentRelatedTab';
import { Database } from '@/lib/database.types';
import { getTournamentRelatedTabData } from '@/lib/services/tournamentRelatedService';
import { requireTournamentAdminContext, requireUserAccessContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { normalizeClubManageTab } from '@/lib/club-admin/manageTabs';
import {
    collectSeasonLinkedTournamentIds,
    collectTournamentSeasonFamilyRows,
    mergeSlugSeasonFamilyIntoSet,
    mergeSlugSeasonFamilyIntoSetLoose,
    type TournamentSeasonFamilyRow,
} from '@/lib/tournamentSeasonChain';

export const dynamic = 'force-dynamic';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentSeasonMenuItem = {
    id: string;
    label: string;
    subtitle: string;
    href: string;
    isCurrent: boolean;
};
type TournamentSeasonOwnerRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    slug: string | null;
    season_id: string | null;
    sport_id?: string | null;
    country_id?: string | null;
};

interface ManagePageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
        type?: string;
        tab?: string;
        subtab?: string;
        offset?: string;
        from?: string;
        seasonId?: string;
        season_id?: string;
        season?: string;
    }>;
}

const LEGACY_CREATE_ROUTE_BY_TYPE: Partial<Record<EntityType, string>> = {
    club: '/admin/super/clubes/crear',
    tournament: '/admin/super/torneos/crear',
    union: '/admin/super/uniones/crear',
    match: '/admin/super/partidos/crear',
};

const TOURNAMENT_OPERATION_SUBTABS = new Set(['fixture', 'tabla', 'estadisticas', 'sincronizacion']);

const TOURNAMENT_TAB_ALIASES: Record<string, string> = {
    overview: 'resumen',
    edit: 'detalles',
    publish: 'publicacion',
    publication: 'publicacion',
    fixture: 'operacion',
    tabla: 'operacion',
    estadisticas: 'operacion',
    sincronizacion: 'operacion',
};

function compactText(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    return text || null;
}

function seasonMenuLabel(row: TournamentSeasonFamilyRow | TournamentSeasonOwnerRow): string {
    if ('season_code' in row) {
        return compactText(row.season_code)
            || compactText(row.display_name)
            || compactText(row.name)
            || 'Temporada';
    }

    return compactText(row.season_id)
        || compactText(row.display_name)
        || compactText(row.name)
        || 'Temporada';
}

function compareSeasonMenuItems(left: TournamentSeasonMenuItem, right: TournamentSeasonMenuItem) {
    const leftYear = Number.parseInt(left.label, 10);
    const rightYear = Number.parseInt(right.label, 10);
    if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) {
        return rightYear - leftYear;
    }
    return right.label.localeCompare(left.label, 'es');
}

function buildTournamentManageHref(
    tournamentId: string,
    currentTab: string,
    currentSubtab: string | null,
    seasonId?: string | null,
) {
    const params = new URLSearchParams();
    params.set('type', 'tournament');
    params.set('tab', currentTab);
    if (currentSubtab && currentTab === 'operacion') {
        params.set('subtab', currentSubtab);
    }
    if (seasonId) {
        params.set('seasonId', seasonId);
    }
    return `/admin/entities/${tournamentId}/manage?${params.toString()}`;
}

async function buildTournamentSeasonNavigation({
    supabase,
    tournament,
    currentTab,
    currentSubtab,
    requestedSeasonId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tournament: TournamentRow;
    currentTab: string;
    currentSubtab: string | null;
    requestedSeasonId: string | null;
}): Promise<{ shellData: TournamentRow; items: TournamentSeasonMenuItem[] }> {
    const ownerIds = new Set<string>([tournament.id]);

    try {
        const linkedIds = await collectSeasonLinkedTournamentIds(supabase as any, tournament.id);
        linkedIds.forEach((linkedId) => ownerIds.add(linkedId));
    } catch {
        // The switcher still works with the current tournament if relation metadata is unavailable.
    }

    try {
        await mergeSlugSeasonFamilyIntoSet(supabase as any, {
            id: tournament.id,
            slug: tournament.slug,
            sport_id: tournament.sport_id,
            country_id: tournament.country_id,
        }, ownerIds);
        if (ownerIds.size <= 1) {
            await mergeSlugSeasonFamilyIntoSetLoose(supabase as any, { slug: tournament.slug }, ownerIds);
        }
    } catch {
        // Slug fallback is best-effort; explicit relations remain the source of truth.
    }

    const seasonRows = await collectTournamentSeasonFamilyRows(supabase as any, ownerIds, requestedSeasonId);
    seasonRows.forEach((season) => {
        if (season.tournament_id) ownerIds.add(season.tournament_id);
        if (season.legacy_tournament_id) ownerIds.add(season.legacy_tournament_id);
    });

    const ownerIdList = Array.from(ownerIds);
    const { data: ownerRowsData } = await supabase
        .from('tournaments')
        .select('id, name, display_name, slug, season_id, sport_id, country_id')
        .in('id', ownerIdList);

    const ownerRows = (Array.isArray(ownerRowsData) && ownerRowsData.length > 0
        ? ownerRowsData
        : [tournament]) as TournamentSeasonOwnerRow[];
    const ownerMap = new Map<string, TournamentSeasonOwnerRow>();
    ownerRows.forEach((row) => ownerMap.set(row.id, row));
    ownerMap.set(tournament.id, {
        id: tournament.id,
        name: tournament.name,
        display_name: tournament.display_name,
        slug: tournament.slug,
        season_id: tournament.season_id,
        sport_id: tournament.sport_id,
        country_id: tournament.country_id,
    });

    const currentTournamentSeasons = seasonRows.filter((row) => row.tournament_id === tournament.id);
    const selectedSeason =
        currentTournamentSeasons.find((row) => requestedSeasonId && row.id === requestedSeasonId) ||
        currentTournamentSeasons.find((row) => row.is_active) ||
        currentTournamentSeasons[0] ||
        null;

    const shellData = selectedSeason
        ? { ...tournament, season_id: seasonMenuLabel(selectedSeason) } as TournamentRow
        : tournament;

    const items: TournamentSeasonMenuItem[] = seasonRows.map((seasonRow) => {
        const owner = ownerMap.get(seasonRow.tournament_id) || ownerMap.get(tournament.id)!;
        const label = seasonMenuLabel(seasonRow);
        const seasonTitle = compactText(seasonRow.display_name) || compactText(seasonRow.name) || label;
        const ownerTitle = compactText(owner.display_name) || compactText(owner.name) || 'Torneo';
        const subtitle = owner.id === tournament.id
            ? seasonTitle
            : `${ownerTitle} - ${seasonTitle}`;

        return {
            id: seasonRow.id,
            label,
            subtitle,
            href: buildTournamentManageHref(owner.id, currentTab, currentSubtab, seasonRow.id),
            isCurrent: owner.id === tournament.id && seasonRow.id === selectedSeason?.id,
        };
    });

    const ownersWithSeasonRows = new Set(seasonRows.map((row) => row.tournament_id));
    ownerRows
        .filter((owner) => !ownersWithSeasonRows.has(owner.id))
        .forEach((owner) => {
            const label = seasonMenuLabel(owner);
            items.push({
                id: owner.id,
                label,
                subtitle: compactText(owner.display_name) || compactText(owner.name) || label,
                href: buildTournamentManageHref(owner.id, currentTab, currentSubtab),
                isCurrent: owner.id === tournament.id && !selectedSeason,
            });
        });

    if (items.length === 0) {
        const label = tournament.season_id || '--';
        items.push({
            id: tournament.id,
            label,
            subtitle: tournament.display_name || tournament.name,
            href: buildTournamentManageHref(tournament.id, currentTab, currentSubtab, requestedSeasonId),
            isCurrent: true,
        });
    }

    return {
        shellData,
        items: items
            .filter((item, index, list) => list.findIndex((candidate) => candidate.href === item.href) === index)
            .sort(compareSeasonMenuItems),
    };
}

export default async function ManageEntityPage({ params, searchParams }: ManagePageProps) {
    const { id } = await params;
    const { type, tab, subtab, offset: offsetParam, from, seasonId, season_id, season } = await searchParams;
    const currentTab = tab || 'overview';
    const requestedTournamentSeasonId = seasonId || season_id || season || null;
    const offset = parseInt(offsetParam || '0', 10);
    const limit = 20;

    // Legacy redirect: old crear/new paths now point to the dedicated creators.
    if (id === 'crear' || id === 'new') {
        const normalizedType = typeof type === 'string' ? type.toLowerCase() as EntityType : undefined;
        const target = normalizedType ? LEGACY_CREATE_ROUTE_BY_TYPE[normalizedType] : null;
        redirect(target || '/admin/super');
    }

    // 1. Check Auth & Permissions (Basic check, RLS enforces mutations later)
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
        redirect('/login');
    }

    let result = await resolveEntity({
        id,
        type: type as EntityType | undefined
    });

    // Tournament-admin fallback. The /admin/torneo panel lists a gestor's
    // tournaments via service-role queries scoped by resolveTournamentAdminScope
    // (RLS won't surface them through .single() on the user client), so the
    // resolveEntity call above returns not_found here even for tournaments the
    // user manages. Re-resolve through the same scope-aware path so
    // "Abrir en gestor" actually lands on the manager. Global admins are
    // unaffected — resolveEntity already succeeds for them.
    if ((result.kind === 'not_found' || result.kind === 'forbidden')
        && (type === 'tournament' || !type)) {
        try {
            const tournamentAdminContext = await requireTournamentAdminContext(supabase);
            const scope = await resolveTournamentAdminScope(supabase, tournamentAdminContext);
            if (scope.isUnlimited || scope.tournamentIds.has(id)) {
                const reader = getServiceWriter(supabase, 'admin/entities/manage:tournament-admin');
                const { data: tData } = await reader
                    .from('tournaments')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (tData) {
                    result = {
                        kind: 'ok',
                        entityType: 'tournament',
                        source: 'db',
                        data: tData as unknown as TournamentRow,
                        canonicalPath: `/tournaments/${id}`,
                        adminPath: `/admin/entities/${id}/manage?type=tournament`,
                    };
                }
            }
        } catch {
            // User is not a tournament admin (or token check failed); leave
            // the original not_found / forbidden result so the existing UI
            // renders the standard message.
        }
    }

    // 2. Specialized Redirects: matches use the new dedicated Match Center
    if (result.kind === 'ok' && result.entityType === 'match') {
        redirect(`/admin/super/partidos/${id}`);
    }

    // Standardize error handling
    if (result.kind === 'forbidden') {
        return (
            <div className="p-12 text-center bg-surface border border-divider rounded-xl m-6 min-h-[50vh] flex flex-col justify-center items-center shadow-sm">
                <svg className="w-12 h-12 text-red-500/70 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m-2-4v2m0 0v2m0-2h2m-2 0H6a2 2 0 01-2-2V7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2h-4z" />
                </svg>
                <h1 className="text-2xl font-bold text-foreground mb-2">No permissions</h1>
                <p className="text-system-secondary">You don&apos;t have permission to view or edit this entity.</p>
            </div>
        );
    }

    if (result.kind === 'not_found') {
        if (!type) {
            return (
                <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
                    <div className="p-12 text-center bg-surface border border-divider rounded-xl min-h-[50vh] flex flex-col justify-center items-center shadow-sm">
                        <svg className="w-12 h-12 text-accent-blue/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h1 className="text-2xl font-bold mb-4">Especificar tipo de entidad</h1>
                        <p className="text-system-secondary mb-8 max-w-md">
                            No logramos identificar automáticamente la entidad con ID <code className="bg-background px-1.5 py-0.5 rounded text-foreground">{id}</code>. Selecciona qué quieres gestionar:
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl">
                            {(['club', 'tournament', 'match', 'player'] as const).map((entityTypeOption) => (
                                <a
                                    key={entityTypeOption}
                                    href={`/admin/entities/${id}/manage?type=${entityTypeOption}`}
                                    className="px-6 py-8 bg-surface border border-divider rounded-xl hover:border-accent-blue hover:text-accent-blue hover:bg-surface-hover transition-all flex flex-col items-center gap-3 group"
                                >
                                    <span className="text-sm font-semibold capitalize group-hover:underline">{entityTypeOption}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="p-12 text-center bg-surface border border-divider rounded-xl m-6 min-h-[50vh] flex flex-col justify-center items-center shadow-sm">
                <svg className="w-12 h-12 text-system-secondary mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h1 className="text-2xl font-bold mb-2">Entidad no encontrada</h1>
                <p className="text-system-secondary">No se encontró ninguna entidad con el ID <code className="bg-background px-1 rounded">{id}</code> y el Tipo <code className="bg-background px-1 rounded">{type}</code>.</p>
            </div>
        );
    }

    if (result.kind === 'error') {
        return (
            <div className="p-12 text-center bg-surface border border-divider rounded-xl m-6 min-h-[50vh] flex flex-col justify-center items-center shadow-sm">
                <h1 className="text-2xl font-bold text-red-500 mb-2">Error cargando entidad</h1>
                <p className="text-system-secondary text-sm font-mono bg-background p-2 rounded">{result.message}</p>
            </div>
        );
    }

    const isTournament = result.entityType === 'tournament';
    const effectiveTab = isTournament
        ? (TOURNAMENT_TAB_ALIASES[currentTab] || currentTab)
        : currentTab;
    const effectiveSubtab = isTournament && TOURNAMENT_OPERATION_SUBTABS.has(currentTab)
        ? currentTab
        : (subtab ?? null);

    // For tournament tabs: fetch unions + match count in parallel
    let tournamentUnions: Array<{ id: string; name: string }> = [];
    let tournamentCountries: Array<{ id: string; name: string; code: string | null; flag_emoji: string | null }> = [];
    let tournamentMatchCount = 0;
    let tournamentUnionName: string | undefined;
    let tournamentSeasonMenuItems: TournamentSeasonMenuItem[] = [];
    let tournamentShellData: TournamentRow | null = null;
    if (isTournament) {
        const tournamentData = result.data as TournamentRow;
        tournamentShellData = tournamentData;
        const needsDetailsData = effectiveTab === 'detalles';
        const needsMatchCount = effectiveTab === 'resumen';
        const [{ data: unionsData }, { data: matchRows }, { data: countriesData }, seasonNavigation] = await Promise.all([
            needsDetailsData
                ? supabase.from('unions').select('id, name').order('name')
                : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
            needsMatchCount
                ? supabase.from('matches').select('id').eq('tournament_id', id)
                : Promise.resolve({ data: [] as Array<{ id: string }> }),
            needsDetailsData
                ? supabase.from('countries').select('id, name, code, flag_emoji').order('name')
                : Promise.resolve({ data: [] as Array<{ id: string; name: string; code: string | null; flag_emoji: string | null }> }),
            buildTournamentSeasonNavigation({
                supabase,
                tournament: tournamentData,
                currentTab: effectiveTab,
                currentSubtab: effectiveSubtab,
                requestedSeasonId: requestedTournamentSeasonId,
            }),
        ]);
        tournamentUnions = unionsData ?? [];
        tournamentCountries = countriesData ?? [];
        tournamentMatchCount = matchRows?.length ?? 0;
        tournamentShellData = seasonNavigation.shellData;
        tournamentSeasonMenuItems = seasonNavigation.items;
        if (tournamentData.union_id) {
            tournamentUnionName = tournamentUnions.find((unionItem) => unionItem.id === tournamentData.union_id)?.name;
        }
    }

    const isRelatedTab = effectiveTab === 'related';
    const relatedData = isRelatedTab && !isTournament ? await getRelatedItems(result.entityType, id, offset, limit) : null;
    const tournamentRelatedData = isRelatedTab && isTournament ? await getTournamentRelatedTabData(id) : null;

    // Construct base URL params for pagination inside RelatedSection
    const baseUrlParams = new URLSearchParams();
    baseUrlParams.set('type', result.entityType);
    baseUrlParams.set('tab', 'related');

    const isClub = result.entityType === 'club';
    if (isClub) {
        const [context, { data: unionsData }] = await Promise.all([
            requireUserAccessContext(supabase).catch(() => null),
            supabase.from('unions').select('id, name').order('name'),
        ]);
        const managed = context
            ? await getManagedClubSummaries(supabase as never, context.memberships)
            : { clubs: [], defaultClubId: null };

        return (
            <ClubManageShell
                id={id}
                data={result.data as ResolvedClubRow}
                unions={unionsData ?? []}
                managedClubs={managed.clubs}
                initialTab={normalizeClubManageTab(tab)}
            />
        );
    }

    // Tournament: full-screen shell (no sidebar, logo header, mobile pager)
    if (isTournament) {
        return (
            <TournamentManageShell
                id={id}
                data={(tournamentShellData ?? result.data) as TournamentRow}
                currentTab={effectiveTab}
                currentSubtab={effectiveSubtab}
                backHref={from ?? '/admin/super/torneos'}
                matchCount={tournamentMatchCount}
                seasonMenuItems={tournamentSeasonMenuItems}
            >
                <div className="min-h-[300px] animate-in fade-in duration-300">
                    {effectiveTab === 'resumen' && (
                        <TournamentSummaryTab
                            data={result.data as TournamentRow}
                            id={id}
                            unionName={tournamentUnionName}
                            matchCount={tournamentMatchCount}
                        />
                    )}
                    {effectiveTab === 'detalles' && (
                        <TournamentDetailsTab
                            data={result.data as TournamentRow}
                            id={id}
                            unions={tournamentUnions}
                            countries={tournamentCountries}
                        />
                    )}
                    {effectiveTab === 'estructura' && (
                        <TournamentStructureTab data={result.data as TournamentRow} id={id} />
                    )}
                    {effectiveTab === 'participantes' && (
                        <TournamentParticipantsTab data={result.data as TournamentRow} id={id} />
                    )}
                    {(effectiveTab === 'operacion' ||
                        effectiveTab === 'fixture' ||
                        effectiveTab === 'tabla' ||
                        effectiveTab === 'estadisticas') && (
                            <TournamentOperationTab
                                data={result.data as TournamentRow}
                                id={id}
                                initialSubtab={effectiveSubtab}
                            />
                        )}
                    {effectiveTab === 'formato' && (
                        <TournamentFormatTab
                            data={result.data as TournamentRow}
                            id={id}
                            matchCount={tournamentMatchCount}
                        />
                    )}
                    {effectiveTab === 'medios' && (
                        <TournamentMediaTab
                            data={result.data as TournamentRow}
                            id={id}
                        />
                    )}
                    {effectiveTab === 'publicacion' && (
                        <TournamentPublishTab
                            data={result.data as TournamentRow}
                            id={id}
                            matchCount={tournamentMatchCount}
                        />
                    )}
                    {effectiveTab === 'related' && tournamentRelatedData && (
                        <div className="animate-in fade-in duration-300">
                            <TournamentRelatedTab tournamentId={id} data={tournamentRelatedData} />
                        </div>
                    )}
                    {effectiveTab === 'audit' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-6 border-b border-divider pb-4">
                                <h3 className="font-semibold text-lg text-foreground">Auditoría e historial</h3>
                                <p className="text-system-secondary text-sm">Registro inmutable de mutaciones en esta entidad.</p>
                            </div>
                            <AuditSection entityType={result.entityType} entityId={id} />
                        </div>
                    )}
                </div>
            </TournamentManageShell>
        );
    }

    // Non-tournament: standard entity layout with sidebar + header + tabs
    return (
        <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
            <EntityHeader entity={result} fromContext={from} />
            <EntityTabs id={id} type={result.entityType} currentTab={effectiveTab} />

            <div className="bg-surface border border-divider rounded-xl p-6 shadow-sm min-h-[300px] animate-in fade-in duration-300">
                {effectiveTab === 'overview' && (
                    <div className="text-system-secondary">
                        <h3 className="font-semibold text-lg text-foreground mb-2">Overview</h3>
                        <p>Resumen de la entidad. Vista de sólo lectura.</p>
                        <pre className="mt-4 p-4 bg-background rounded-lg border border-divider overflow-x-auto text-xs font-mono text-system-secondary max-h-[400px]">
                            {JSON.stringify(result.data, null, 2)}
                        </pre>
                    </div>
                )}

                {effectiveTab === 'edit' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {result.entityType === 'player' && <PlayerEditor data={result.data} id={id} />}
                    </div>
                )}

                {isRelatedTab && relatedData && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                        {relatedData.sections.map((section, index) => (
                            <RelatedSection
                                key={index}
                                data={section}
                                baseUrl={baseUrlParams}
                                pathname={`/admin/entities/${id}/manage`}
                                offset={offset}
                                limit={limit}
                            />
                        ))}
                        {relatedData.notSupported.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-divider">
                                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    No disponible en el esquema
                                </h4>
                                <ul className="list-disc pl-5 text-sm text-system-secondary space-y-1">
                                    {relatedData.notSupported.map((message, index) => <li key={index}>{message}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {effectiveTab === 'audit' && (
                    <div className="animate-in fade-in duration-300">
                        <div className="mb-6 border-b border-divider pb-4">
                            <h3 className="font-semibold text-lg text-foreground">Auditoría e historial</h3>
                            <p className="text-system-secondary text-sm">Registro inmutable de mutaciones en esta entidad.</p>
                        </div>
                        <AuditSection entityType={result.entityType} entityId={id} />
                    </div>
                )}
            </div>
        </div>
    );
}
