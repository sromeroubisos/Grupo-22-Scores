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
import { getTournamentLinkedRelations, getTournamentRelatedTabData } from '@/lib/services/tournamentRelatedService';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { normalizeClubManageTab } from '@/lib/club-admin/manageTabs';

export const dynamic = 'force-dynamic';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentSeasonMenuItem = {
    id: string;
    label: string;
    subtitle: string;
    href: string;
    isCurrent: boolean;
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
    fixture: 'operacion',
    tabla: 'operacion',
    estadisticas: 'operacion',
    sincronizacion: 'operacion',
};

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

    const result = await resolveEntity({
        id,
        type: type as EntityType | undefined
    });

    // 2. Specialized Redirects: matches use the new dedicated Match Center
    if (result.kind === 'ok' && result.entityType === 'match') {
        redirect(`/admin/matches/${id}/manage`);
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
        const [{ data: unionsData }, { data: matchRows }, { data: countriesData }, linkedRelations] = await Promise.all([
            needsDetailsData
                ? supabase.from('unions').select('id, name').order('name')
                : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
            needsMatchCount
                ? supabase.from('matches').select('id').eq('tournament_id', id)
                : Promise.resolve({ data: [] as Array<{ id: string }> }),
            needsDetailsData
                ? supabase.from('countries').select('id, name, code, flag_emoji').order('name')
                : Promise.resolve({ data: [] as Array<{ id: string; name: string; code: string | null; flag_emoji: string | null }> }),
            getTournamentLinkedRelations(id),
        ]);
        tournamentUnions = unionsData ?? [];
        tournamentCountries = countriesData ?? [];
        tournamentMatchCount = matchRows?.length ?? 0;
        if (tournamentData.union_id) {
            tournamentUnionName = tournamentUnions.find((unionItem) => unionItem.id === tournamentData.union_id)?.name;
        }

        const { data: seasonRows } = await supabase
            .from('tournament_seasons')
            .select('id, season_code, name, display_name, status, is_active')
            .eq('tournament_id', id)
            .order('season_code', { ascending: false })
            .order('created_at', { ascending: false });

        if (Array.isArray(seasonRows) && seasonRows.length > 0) {
            const selectedSeason =
                seasonRows.find((row: any) => requestedTournamentSeasonId && row.id === requestedTournamentSeasonId) ||
                seasonRows.find((row: any) => row.is_active) ||
                seasonRows[0];

            tournamentShellData = {
                ...tournamentData,
                season_id: selectedSeason?.season_code ?? tournamentData.season_id,
            } as TournamentRow;

            const activeParams = new URLSearchParams();
            activeParams.set('type', 'tournament');
            activeParams.set('tab', effectiveTab);
            if (effectiveSubtab && effectiveTab === 'operacion') {
                activeParams.set('subtab', effectiveSubtab);
            }

            tournamentSeasonMenuItems = seasonRows.map((row: any) => {
                const paramsForSeason = new URLSearchParams(activeParams.toString());
                paramsForSeason.set('seasonId', row.id);
                const label = String(row.season_code || row.display_name || row.name || 'Temporada').trim();
                return {
                    id: row.id,
                    label,
                    subtitle: row.display_name || row.name || label,
                    href: `/admin/entities/${id}/manage?${paramsForSeason.toString()}`,
                    isCurrent: row.id === selectedSeason?.id,
                };
            });
        }

        const activeParams = new URLSearchParams();
        activeParams.set('type', 'tournament');
        activeParams.set('tab', effectiveTab);
        if (effectiveSubtab && effectiveTab === 'operacion') {
            activeParams.set('subtab', effectiveSubtab);
        }

        if (requestedTournamentSeasonId) {
            activeParams.set('seasonId', requestedTournamentSeasonId);
        }

        const seasonRelationTypes = new Set(['previous_season', 'next_season']);
        const linkedSeasonItems = linkedRelations.items
            .filter((item) => seasonRelationTypes.has(item.relationType))
            .reduce<TournamentSeasonMenuItem[]>((items, item) => {
                if (items.some((existing) => existing.id === item.linkedTournamentId)) {
                    return items;
                }

                const paramsForItem = new URLSearchParams(activeParams.toString());
                items.push({
                    id: item.linkedTournamentId,
                    label: item.season || item.linkedTournamentName,
                    subtitle: item.linkedTournamentName,
                    href: `/admin/entities/${item.linkedTournamentId}/manage?${paramsForItem.toString()}`,
                    isCurrent: false,
                });
                return items;
            }, [])
            .sort((left, right) => {
                const leftYear = Number.parseInt(left.label, 10);
                const rightYear = Number.parseInt(right.label, 10);
                if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) {
                    return rightYear - leftYear;
                }
                return right.label.localeCompare(left.label, 'es');
            });

        if (tournamentSeasonMenuItems.length === 0) {
            tournamentSeasonMenuItems = [
                {
                    id,
                    label: tournamentData.season_id || '--',
                    subtitle: tournamentData.display_name || tournamentData.name,
                    href: `/admin/entities/${id}/manage?${activeParams.toString()}`,
                    isCurrent: true,
                },
                ...linkedSeasonItems,
            ];
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
