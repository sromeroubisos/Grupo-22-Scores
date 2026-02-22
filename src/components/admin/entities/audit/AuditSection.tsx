import { createClient } from '@/lib/supabase/server';

interface AuditSectionProps {
    entityType: string;
    entityId: string;
}

export async function AuditSection({ entityType, entityId }: AuditSectionProps) {
    const supabase = await createClient();

    const { data: logs, error } = await supabase
        .from('admin_audit_log')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        if (process.env.NEXT_PUBLIC_DEBUG_ADMIN === 'true') {
            console.error('Failed to load audit logs:', error);
        }
        return (
            <div className="p-6 text-center bg-surface border border-red-500/20 rounded-xl mb-6 flex flex-col items-center">
                <svg className="w-8 h-8 text-red-500/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-red-500 mb-1">Sin acceso a historial</h3>
                <p className="text-system-secondary text-sm">No tienes permisos para ver los logs de auditoría o hubo un error.</p>
            </div>
        );
    }

    if (!logs || logs.length === 0) {
        return (
            <div className="px-6 py-12 text-center bg-surface border border-divider rounded-xl">
                <svg className="w-10 h-10 text-system-secondary/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-system-secondary text-sm font-medium">No hay registros de auditoría para esta entidad.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {logs.map((log) => {
                const date = new Date(log.created_at).toLocaleString();
                const userShort = log.actor_user_id.split('-')[0];
                const changes = log.changes as Record<string, any>;
                const keys = Object.keys(changes);

                return (
                    <div key={log.id} className="border-l-2 border-accent-blue pl-4 py-1 relative">
                        <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-accent-blue ring-4 ring-background"></div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 gap-2">
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    <span className="capitalize">{log.action}</span> por <code className="text-xs bg-surface-hover px-1 rounded">{userShort}...</code>
                                </p>
                                <p className="text-xs text-system-secondary mt-0.5">{date}</p>
                            </div>
                        </div>

                        {keys.length > 0 && (
                            <div className="bg-surface-hover rounded-lg border border-divider overflow-hidden mt-3">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-surface text-system-secondary text-xs border-b border-divider">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Campo</th>
                                            <th className="px-3 py-2 font-medium hidden sm:table-cell">Valor Anterior</th>
                                            <th className="px-3 py-2 font-medium">Nuevo Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-divider">
                                        {keys.map(key => {
                                            const c = changes[key];
                                            const oldVal = c.old === null ? 'null' : String(c.old ?? 'n/a');
                                            const newVal = c.new === null ? 'null' : String(c.new ?? 'null');

                                            return (
                                                <tr key={key} className="hover:bg-surface">
                                                    <td className="px-3 py-2 font-mono text-xs text-foreground bg-surface-hover/50">{key}</td>
                                                    <td className="px-3 py-2 text-system-secondary truncate max-w-[120px] hidden sm:table-cell" title={oldVal}>
                                                        {oldVal}
                                                    </td>
                                                    <td className="px-3 py-2 text-foreground font-medium truncate max-w-[120px]" title={newVal}>
                                                        {newVal}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
