import Link from 'next/link';
import { ResolvedEntityResult } from '@/lib/services/entityResolver';

export function EntityHeader({ entity, fromContext }: { entity: ResolvedEntityResult; fromContext?: string }) {
    if (entity.kind !== 'ok') return null;

    const data = entity.data as any;
    const name = data.name || data.displayName || 'Unknown Name';
    const status = data.status || 'active'; // Default to active if missing

    return (
        <header className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 px-4 pt-4 sm:pt-0">
            <div>
                <nav className="flex text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 gap-2 items-center italic" aria-label="Breadcrumb">
                    <Link href="/admin" prefetch={false} className="hover:text-primary-accent transition-colors">Admin</Link>
                    <span className="opacity-30">/</span>
                    <span className="cursor-default">Entities</span>
                    <span className="opacity-30">/</span>
                    <span className="cursor-default">{entity.entityType}s</span>
                    <span className="opacity-30">/</span>
                    <span className="text-white not-italic max-w-[200px] truncate" title={name}>{name}</span>
                </nav>

                {fromContext && (
                    <div className="mb-4">
                        <Link
                            href={`/admin/entities/${fromContext.split(':')[1]}/manage?type=${fromContext.split(':')[0]}&tab=related`}
                            prefetch={false}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Volver a {fromContext.split(':')[0]} previo
                        </Link>
                    </div>
                )}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <h1 className="text-4xl font-black text-white italic uppercase tracking-tight">{name}</h1>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-primary-accent/10 text-primary-accent border border-primary-accent/20 uppercase tracking-[0.15em] italic">
                            {entity.entityType}
                        </span>
                        {(data.status || entity.entityType === 'tournament' || entity.entityType === 'match') && (
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black border uppercase tracking-[0.15em] italic ${status === 'active' || status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                                    status === 'draft' || status === 'scheduled' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                        'bg-slate-800 text-slate-400 border-white/5'
                                }`}>
                                {status}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 mt-4">
                    <span className="bg-white/5 px-2 py-1 rounded-md select-all border border-white/5 font-mono text-slate-400 tracking-normal not-italic">
                        ID: {data.id}
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-accent shadow-[0_0_8px_rgba(0,255,136,0.6)] animate-pulse"></span>
                        ORIGEN: {entity.source}
                    </span>
                </div>
            </div>

            <div className="flex sm:justify-end">
                <Link
                    href={entity.canonicalPath}
                    target="_blank"
                    className="inline-flex items-center gap-3 px-6 py-2.5 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-white hover:border-white/20 transition-all text-[10px] font-black uppercase tracking-widest shadow-xl group"
                >
                    <span className="material-symbols-outlined text-lg opacity-40 group-hover:opacity-100 group-hover:text-primary-accent transition-all">open_in_new</span>
                    Ver Vista Pública
                </Link>
            </div>
        </header>
    );
}
