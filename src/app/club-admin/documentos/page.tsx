'use client';

import { useRef, useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

const mockDocs = [
    { id: 1, name: 'Reglamento Interno 2026.pdf', folder: 'Institucional', size: '2.4 MB', updatedAt: '2026-01-15', updatedBy: 'Admin', visibility: 'Club' },
    { id: 2, name: 'Protocolo de Conmocion.pdf', folder: 'Medico', size: '1.1 MB', updatedAt: '2026-02-01', updatedBy: 'Dra. Pellegrini', visibility: 'Staff' },
    { id: 3, name: 'Fichas Medicas M17.xlsx', folder: 'Medico', size: '340 KB', updatedAt: '2026-02-05', updatedBy: 'Admin', visibility: 'Staff' },
    { id: 4, name: 'Cronograma Temporada.pdf', folder: 'Institucional', size: '890 KB', updatedAt: '2026-01-20', updatedBy: 'Admin', visibility: 'Club' },
    { id: 5, name: 'Convocatoria vs CASI - Primera.pdf', folder: 'Divisiones', size: '120 KB', updatedAt: '2026-02-10', updatedBy: 'P. Bouza', visibility: 'Plantel' },
    { id: 6, name: 'Manual de Marca SIC.pdf', folder: 'Prensa', size: '5.2 MB', updatedAt: '2025-12-10', updatedBy: 'Admin', visibility: 'Publico' },
    { id: 7, name: 'Contrato Sponsor Principal.pdf', folder: 'Sponsors', size: '980 KB', updatedAt: '2026-01-05', updatedBy: 'Admin', visibility: 'Directivos' },
    { id: 8, name: 'Planilla Asistencia M19.xlsx', folder: 'Divisiones', size: '210 KB', updatedAt: '2026-02-08', updatedBy: 'C. Verna', visibility: 'Staff' },
    { id: 9, name: 'Circular URBA F3.pdf', folder: 'Reglamentos', size: '450 KB', updatedAt: '2026-02-03', updatedBy: 'Union', visibility: 'Club' },
];

const folders = ['Todos', 'Institucional', 'Medico', 'Divisiones', 'Prensa', 'Sponsors', 'Reglamentos'];
const folderIcons: Record<string, string> = { Todos: '\uD83D\uDCC2', Institucional: '\uD83C\uDFE2', Medico: '\uD83C\uDFE5', Divisiones: '\uD83C\uDFC9', Prensa: '\uD83D\uDCF0', Sponsors: '\uD83E\uDD1D', Reglamentos: '\uD83D\uDCDC' };

export default function ClubDocumentosPage() {
    const [activeFolder, setActiveFolder] = useState('Todos');
    const [search, setSearch] = useState('');
    const [docs, setDocs] = useState(mockDocs);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filtered = docs.filter((d) => {
        const matchFolder = activeFolder === 'Todos' || d.folder === activeFolder;
        const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
        return matchFolder && matchSearch;
    });

    const folderCounts = folders.reduce((acc, f) => {
        acc[f] = f === 'Todos' ? docs.length : docs.filter((d) => d.folder === f).length;
        return acc;
    }, {} as Record<string, number>);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleUpload = (file?: File | null) => {
        if (!file) return;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const newDoc = {
            id: Date.now(),
            name: file.name,
            folder: activeFolder === 'Todos' ? 'Institucional' : activeFolder,
            size: `${sizeMb} MB`,
            updatedAt: new Date().toISOString().slice(0, 10),
            updatedBy: 'Admin',
            visibility: 'Club',
        };
        setDocs((prev) => [newDoc, ...prev]);
    };

    const handleDownload = (docName: string) => {
        const blob = new Blob([`Documento: ${docName}\nGenerado por G22 Scores.`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = docName.replace(/\s+/g, '_');
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <SectionShell
            title="Documentos"
            subtitle="Carpetas, versiones y visibilidad por perfiles."
            actions={<button className={styles.btn} type="button" onClick={handleUploadClick}>Subir documento</button>}
        >
            <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <div className={styles.sectionGrid}>
                <div className={styles.glassCard}>
                    <div className={styles.sectionHeader}><h2>Carpetas</h2></div>
                    {folders.map((f) => (
                        <div key={f} className={styles.folderItem} onClick={() => setActiveFolder(f)} style={{ background: activeFolder === f ? 'var(--club-panel-inner)' : undefined }}>
                            <span className={styles.folderIcon}>{folderIcons[f] || '\uD83D\uDCC1'}</span>
                            <span className={styles.folderName}>{f}</span>
                            <span className={styles.folderCount}>{folderCounts[f]}</span>
                        </div>
                    ))}
                </div>
                <div className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>{activeFolder === 'Todos' ? 'Todos los documentos' : activeFolder}</h2>
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>{filtered.length} archivos</span>
                    </div>
                    <div className={styles.searchBar}>
                        <input className={styles.searchInput} placeholder="Buscar documento..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    {filtered.map((d) => (
                        <div key={d.id} className={styles.listItem}>
                            <div className={styles.listItemInfo}>
                                <span className={styles.listItemTitle}>{d.name}</span>
                                <span className={styles.listItemMeta}>{d.size} &middot; {d.updatedAt} &middot; {d.updatedBy}</span>
                            </div>
                            <div className={styles.listItemActions}>
                                <span className={`${styles.badge} ${styles.badgeNeutral}`}>{d.visibility}</span>
                                <button className={styles.btnSmall} type="button" onClick={() => handleDownload(d.name)}>Descargar</button>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className={styles.emptyPlaceholder}><p>No hay documentos en esta carpeta</p></div>}
                </div>
            </div>
        </SectionShell>
    );
}
