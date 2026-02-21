import Link from 'next/link';
import { ResolvedEntityResult } from '@/lib/services/entityResolver';

export function EntityHeader({ entity }: { entity: ResolvedEntityResult }) {
    if (entity.kind !== 'ok') return null;

    const data = entity.data as any;
    const name = data.name || data.displayName || 'Unknown Name';
    const status = data.status || 'active'; // Default to active if missing

    return (
        <header className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-divider">
            <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h1 className="text-3xl font-bold">{name}</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20 uppercase tracking-wider">
                        {entity.entityType}
                    </span>
                    {(data.status || entity.entityType === 'tournament' || entity.entityType === 'match') && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border lowercase ${status === 'active' || status === 'published' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                status === 'draft' || status === 'scheduled' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                    'bg-system-secondary/10 text-system-secondary border-system-secondary/20'
                            }`}>
                            {status}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 text-sm text-system-secondary mt-3">
                    <span className="font-mono bg-surface px-1.5 py-0.5 rounded text-xs select-all border border-divider">
                        {data.id}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue opacity-80 mt-0.5"></span>
                        {entity.source.toUpperCase()}
                    </span>
                </div>
            </div>

            <div className="flex sm:justify-end">
                <Link
                    href={entity.canonicalPath}
                    target="_blank"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-divider rounded-lg hover:bg-surface-hover hover:text-foreground transition-colors text-sm font-medium shadow-sm"
                >
                    <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ver Vista Pública
                </Link>
            </div>
        </header>
    );
}
