import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveEntity, EntityType } from '@/lib/services/entityResolver';
import { getRelatedItems } from '@/lib/services/relatedResolver';
import { EntityHeader } from '@/components/admin/entities/EntityHeader';
import { EntityTabs } from '@/components/admin/entities/EntityTabs';
import { TournamentEditor } from '@/components/admin/entities/editors/TournamentEditor';
import { ClubEditor } from '@/components/admin/entities/editors/ClubEditor';
import { MatchEditor } from '@/components/admin/entities/editors/MatchEditor';
import { PlayerEditor } from '@/components/admin/entities/editors/PlayerEditor';
import { RelatedSection } from '@/components/admin/entities/related/RelatedSection';
import { AuditSection } from '@/components/admin/entities/audit/AuditSection';

interface ManagePageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ type?: string; tab?: string; offset?: string }>;
}

export default async function ManageEntityPage({ params, searchParams }: ManagePageProps) {
    const { id } = await params;
    const { type, tab, offset: offsetParam } = await searchParams;
    const currentTab = tab || 'overview';
    const offset = parseInt(offsetParam || '0', 10);
    const limit = 20;

    if (process.env.NEXT_PUBLIC_DEBUG_ADMIN === 'true') {
        console.debug('Admin [ManageEntityPage] mounted for id:', id, 'type:', type, 'tab:', currentTab);
    }

    // 1. Check Auth & Permissions (Basic check, RLS enforces mutations later)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const result = await resolveEntity({
        id,
        type: type as EntityType | undefined
    });

    // Standardize error handling
    if (result.kind === 'forbidden') {
        return (
            <div className="p-12 text-center bg-surface border border-divider rounded-xl m-6 min-h-[50vh] flex flex-col justify-center items-center shadow-sm">
                <svg className="w-12 h-12 text-red-500/70 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m-2-4v2m0 0v2m0-2h2m-2 0H6a2 2 0 01-2-2V7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2h-4z" />
                </svg>
                <h1 className="text-2xl font-bold text-foreground mb-2">No permissions</h1>
                <p className="text-system-secondary">You don't have permission to view or edit this entity.</p>
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
                            {(['club', 'tournament', 'match', 'player'] as const).map(t => (
                                <a
                                    key={t}
                                    href={`/admin/entities/${id}/manage?type=${t}`}
                                    className="px-6 py-8 bg-surface border border-divider rounded-xl hover:border-accent-blue hover:text-accent-blue hover:bg-surface-hover transition-all flex flex-col items-center gap-3 group"
                                >
                                    <span className="text-sm font-semibold capitalize group-hover:underline">{t}</span>
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

    const isRelatedTab = currentTab === 'related';
    const relatedData = isRelatedTab ? await getRelatedItems(result.entityType, id, offset, limit) : null;

    // Construct base URL params for pagination inside RelatedSection
    const baseUrlParams = new URLSearchParams();
    baseUrlParams.set('type', result.entityType);
    baseUrlParams.set('tab', 'related');

    return (
        <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
            <EntityHeader entity={result} />
            <EntityTabs id={id} type={result.entityType} currentTab={currentTab} />

            <div className="bg-surface border border-divider rounded-xl p-6 shadow-sm min-h-[300px]">
                {currentTab === 'overview' && (
                    <div className="text-system-secondary">
                        <h3 className="font-semibold text-lg text-foreground mb-2">Overview</h3>
                        <p>Resumen de la entidad. Vista de sólo lectura.</p>
                        <pre className="mt-4 p-4 bg-background rounded-lg border border-divider overflow-x-auto text-xs font-mono text-system-secondary max-h-[400px]">
                            {JSON.stringify(result.data, null, 2)}
                        </pre>
                    </div>
                )}

                {currentTab === 'edit' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {result.entityType === 'tournament' && <TournamentEditor data={result.data} />}
                        {result.entityType === 'club' && <ClubEditor data={result.data} />}
                        {result.entityType === 'match' && <MatchEditor data={result.data} />}
                        {result.entityType === 'player' && <PlayerEditor data={result.data} />}
                    </div>
                )}

                {isRelatedTab && relatedData && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                        {relatedData.sections.map((section, idx) => (
                            <RelatedSection
                                key={idx}
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
                                    Not available in schema
                                </h4>
                                <ul className="list-disc pl-5 text-sm text-system-secondary space-y-1">
                                    {relatedData.notSupported.map((msg, i) => (
                                        <li key={i}>{msg}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {currentTab === 'audit' && (
                    <div className="animate-in fade-in duration-300">
                        <div className="mb-6 border-b border-divider pb-4">
                            <h3 className="font-semibold text-lg text-foreground">Audit & History</h3>
                            <p className="text-system-secondary text-sm">Registro inmutable de mutaciones en esta entidad.</p>
                        </div>
                        <AuditSection entityType={result.entityType} entityId={id} />
                    </div>
                )}
            </div>
        </div>
    );
}
