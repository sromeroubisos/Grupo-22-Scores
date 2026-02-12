'use client';

import { useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

type LogSeverity = 'info' | 'warning' | 'critical';

const mockLogs = [
    { id: 1, timestamp: '2026-02-10 14:22', user: 'R. Fernandez', action: 'Edito plantel Primera', module: 'Planteles', severity: 'info' as LogSeverity },
    { id: 2, timestamp: '2026-02-10 12:05', user: 'P. Bouza', action: 'Cargo circular "Protocolo Conmocion"', module: 'Documentos', severity: 'info' as LogSeverity },
    { id: 3, timestamp: '2026-02-10 09:30', user: 'M. Gomez', action: 'Subio 42 fotos de jugadores', module: 'Planteles', severity: 'info' as LogSeverity },
    { id: 4, timestamp: '2026-02-09 18:45', user: 'C. Verna', action: 'Actualizo convocatoria M19', module: 'Fixture', severity: 'info' as LogSeverity },
    { id: 5, timestamp: '2026-02-09 16:20', user: 'Sistema', action: 'Cambio de colores oficiales aprobado', module: 'Identidad', severity: 'warning' as LogSeverity },
    { id: 6, timestamp: '2026-02-09 11:00', user: 'S. Deluca', action: 'Alta de 3 jugadores en M13', module: 'Planteles', severity: 'info' as LogSeverity },
    { id: 7, timestamp: '2026-02-08 15:30', user: 'R. Fernandez', action: 'Revoco acceso a L. Montes', module: 'Usuarios', severity: 'warning' as LogSeverity },
    { id: 8, timestamp: '2026-02-08 10:15', user: 'P. Bouza', action: 'Elimino documento "Reglamento 2024"', module: 'Documentos', severity: 'critical' as LogSeverity },
    { id: 9, timestamp: '2026-02-07 14:00', user: 'Sistema', action: 'Backup automatico completado', module: 'Sistema', severity: 'info' as LogSeverity },
    { id: 10, timestamp: '2026-02-07 09:00', user: 'R. Fernandez', action: 'Invito a M. Gomez como viewer', module: 'Usuarios', severity: 'info' as LogSeverity },
    { id: 11, timestamp: '2026-02-06 17:30', user: 'J. Ortega Desio', action: 'Actualizo roster M17', module: 'Planteles', severity: 'info' as LogSeverity },
    { id: 12, timestamp: '2026-02-06 11:45', user: 'Sistema', action: 'Sincronizacion Google Calendar', module: 'Integraciones', severity: 'info' as LogSeverity },
];

const modules = ['Todos', 'Planteles', 'Documentos', 'Fixture', 'Identidad', 'Usuarios', 'Integraciones', 'Sistema'];

const severityStyles: Record<LogSeverity, string> = {
    info: 'badgeInfo',
    warning: 'badgeWarning',
    critical: 'badgeDanger',
};

export default function ClubAuditoriaPage() {
    const [moduleFilter, setModuleFilter] = useState('Todos');
    const [search, setSearch] = useState('');

    const filtered = mockLogs.filter((l) => {
        const matchModule = moduleFilter === 'Todos' || l.module === moduleFilter;
        const matchSearch = l.action.toLowerCase().includes(search.toLowerCase()) || l.user.toLowerCase().includes(search.toLowerCase());
        return matchModule && matchSearch;
    });

    const handleExport = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            moduleFilter,
            search,
            logs: filtered,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <SectionShell
            title="Auditoria"
            subtitle="Trazabilidad de cambios y actividad del club."
            actions={<button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={handleExport}>Exportar log</button>}
        >
            <div className={styles.tabs}>
                {modules.map((m) => (
                    <button key={m} className={`${styles.tab} ${moduleFilter === m ? styles.tabActive : ''}`} onClick={() => setModuleFilter(m)} type="button">{m}</button>
                ))}
            </div>
            <div className={styles.searchBar}>
                <input className={styles.searchInput} placeholder="Buscar en el log..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <span className={`${styles.badge} ${styles.badgeNeutral}`}>{filtered.length} registros</span>
            </div>
            <div className={styles.glassCard}>
                <table className={styles.table}>
                    <thead><tr><th>Fecha / Hora</th><th>Usuario</th><th>Accion</th><th>Modulo</th><th>Nivel</th></tr></thead>
                    <tbody>
                        {filtered.map((l) => (
                            <tr key={l.id}>
                                <td className={styles.mono} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{l.timestamp}</td>
                                <td style={{ fontWeight: 500 }}>{l.user}</td>
                                <td>{l.action}</td>
                                <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{l.module}</span></td>
                                <td><span className={`${styles.badge} ${styles[severityStyles[l.severity] as keyof typeof styles] || ''}`}>{l.severity}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className={styles.emptyPlaceholder}><p>No hay registros para estos filtros</p></div>}
            </div>
        </SectionShell>
    );
}
