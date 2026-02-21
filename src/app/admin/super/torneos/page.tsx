'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, Eye, EyeOff, FolderPlus, Folder as FolderIcon, MoreVertical, Plus } from 'lucide-react';
import { db, Folder } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷',
    Uruguay: '🇺🇾',
    Chile: '🇨🇱'
};

import { SPORTS } from '@/lib/data/sports';

const sportLabels: Record<string, string> = Object.fromEntries(
    Object.entries(SPORTS).map(([id, s]) => [id, s.nameEs])
);



export default function SuperadminTorneosPage() {
    const { filters } = useSuperConsole();
    const router = useRouter();
    const supabase = createClient();
    const [seasonFilter, setSeasonFilter] = useState('all');
    const [folderFilter, setFolderFilter] = useState('all');

    // State for real data
    const [rawTournaments, setRawTournaments] = useState<any[]>([]);
    const [unions, setUnions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch data from Supabase
    const fetchData = async () => {
        setLoading(true);
        try {
            const [tournamentsResult, unionsResult] = await Promise.all([
                supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
                supabase.from('unions').select('*')
            ]);

            if (tournamentsResult.error) throw tournamentsResult.error;
            if (unionsResult.error) throw unionsResult.error;

            setRawTournaments(tournamentsResult.data || []);
            setUnions(unionsResult.data || []);
        } catch (error) {
            console.error('Error fetching tournaments:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const tournaments = useMemo(() => {
        return rawTournaments.map((t, index) => {
            // Count matches (using mock matches only if ID matches, likely 0 for real data)
            const matchesCount = db.matches.filter((m) => m.tournamentId === t.id).length;

            // Resolve Union
            const union = unions.find(u => u.id === t.union_id);
            // Default country logic based on union or default
            const country = union ? 'Argentina' : 'Global (No Union)'; // Simplified for now

            // Resolve fields from DB or provide defaults
            const status = 'Activo'; // Default to active as DB might not have status yet
            const statusKey = 'activo';
            const source = t.slug?.includes('api') ? 'API' : 'Manual';

            // Folders still mock
            const folder = db.folders.find(f => f.id === t.folder_id);

            return {
                id: t.id,
                unionId: t.union_id,
                unionName: union ? union.name : 'Sin Vínculo',
                name: t.name,
                season: t.season_id,
                sport: t.sport || 'rugby',
                sportLabel: sportLabels[t.sport || 'rugby'] || t.sport || 'Rugby',
                country,
                status,
                statusKey,
                source,
                updated: new Date(t.created_at || Date.now()).toLocaleDateString(),
                followers: 1280 + index * 210, // Mock metric
                views: 32400 + index * 890, // Mock metric
                matches: matchesCount,
                folderId: t.folder_id, // Assuming snake_case in DB if it existed, or undefined
                folderName: folder?.name,
                folderColor: folder?.color,
                isVisible: true, // Default
                logo: t.union_id ? '🏆' : '❓'
            };
        });
    }, [rawTournaments, unions]);

    const filtered = tournaments.filter((t) => {
        if (filters.sport !== 'all' && t.sport !== filters.sport) return false;
        if (filters.country !== 'all' && t.country !== filters.country) return false;
        if (filters.status !== 'all' && t.statusKey !== filters.status) return false;
        if (filters.source !== 'all' && t.source !== filters.source) return false;
        if (filters.search && !t.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (seasonFilter !== 'all' && t.season !== seasonFilter) return false;
        if (seasonFilter !== 'all' && t.season !== seasonFilter) return false;
        if (folderFilter !== 'all' && t.folderId !== folderFilter) return false;
        return true;
    });

    const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, tournament) => {
        if (!acc[tournament.country]) acc[tournament.country] = [];
        acc[tournament.country].push(tournament);
        return acc;
    }, {});

    const [linkingTournamentId, setLinkingTournamentId] = useState<string | null>(null);
    const [selectedUnionId, setSelectedUnionId] = useState<string>('');
    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const openLinkModal = (id: string) => {
        setLinkingTournamentId(id);
        setSelectedUnionId('');
    };

    const confirmLink = async () => {
        if (linkingTournamentId && selectedUnionId) {
            try {
                const { error } = await supabase
                    .from('tournaments')
                    .update({ union_id: selectedUnionId })
                    .eq('id', linkingTournamentId);

                if (error) throw error;

                alert(`Torneo vinculado correctamente`);
                fetchData(); // Refresh list
                setLinkingTournamentId(null);
            } catch (err) {
                console.error('Error vincular torneo:', err);
                alert('Error al vincular torneo');
            }
        }
    };

    // --- Actions ---
    const handleDelete = async (id: string) => {
        if (confirm('¿Seguro que deseas eliminar este torneo?')) {
            try {
                const { error } = await supabase
                    .from('tournaments')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                fetchData(); // Refresh
            } catch (err) {
                console.error('Error deleting tournament', err);
                alert('Error al eliminar');
            }
        }
    };

    const handleToggleVisibility = (id: string, current: boolean) => {
        // Implement Update to DB if column exists, else mock toggle local logic? 
        // For now just alert or log
        console.log('Toggle visibility not implemented in DB yet');
    };


    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        // Mock folders for now as DB table likely missing
        const newId = newFolderName.toLowerCase().replace(/\s+/g, '-');
        db.folders.push({ id: newId, name: newFolderName, color: '#888' });
        setNewFolderName('');
        setIsCreateFolderOpen(false);
    };

    const handleMoveToFolder = (tournamentId: string, folderId: string) => {
        // Implement Update to DB if column exists
        console.log('Folders not in DB yet');
        setActionMenuOpenId(null);
    };

    const toggleActionMenu = (id: string) => {
        setActionMenuOpenId(actionMenuOpenId === id ? null : id);
    };

    return (
        <div style={{ paddingBottom: '40px', position: 'relative' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Torneos</div>
                    <div className={styles.consoleSubtitle}>Gestión global de competiciones (DB)</div>
                </div>
                <div className={styles.consoleActions}>
                    <Link href="/admin/super/torneos/crear" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                        + Nuevo Torneo
                    </Link>
                </div>
            </div>

            <div className={styles.filterBar}>
                <span className={styles.filterLabel}>Filtros locales</span>
                <select className={styles.filterControl} value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
                    <option value="all">Temporada</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                </select>

                <select className={styles.filterControl} value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
                    <option value="all">Todas las carpetas</option>
                    {db.folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>

                <button
                    className={styles.filterControl}
                    onClick={() => setIsCreateFolderOpen(true)}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Plus size={14} /> Nueva Carpeta
                </button>
            </div>

            {isCreateFolderOpen && (
                <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Nombre de carpeta"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: 6, background: '#1a1d24', border: '1px solid #333', color: 'white' }}
                    />
                    <button onClick={handleCreateFolder} className={styles.cardActionPrimary} style={{ padding: '8px 16px', fontSize: 13 }}>Crear</button>
                    <button onClick={() => setIsCreateFolderOpen(false)} className={styles.cardAction} style={{ padding: '8px 16px', fontSize: 13 }}>Cancelar</button>
                </div>
            )}

            {loading && <div style={{ padding: 20 }}>Cargando torneos...</div>}

            {!loading && Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem}>No se encontraron torneos con los filtros actuales.</div>
            )}

            {!loading && Object.entries(grouped).map(([country, items]) => (
                <section key={country} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupFlag}>{countryFlags[country] || '🌐'}</span>
                        <span className={styles.groupTitle}>{country}</span>
                        <span className={styles.groupMeta}>{items.length} torneos</span>
                    </div>
                    <div className={styles.cardGrid}>
                        {items.map((tournament) => (
                            <div key={tournament.id} className={styles.cardItem}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardLogo}>{tournament.logo}</div>
                                    <div>
                                        <div className={styles.cardTitle}>{tournament.name}</div>
                                        <div className={styles.cardContext}>
                                            <span className={styles.contextLinePrimary}>
                                                {tournament.season} · {tournament.sportLabel} · {countryFlags[tournament.country] || '🌐'}
                                            </span>
                                            <span className={styles.contextLineSecondary}>
                                                Union: {tournament.unionName}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        className={styles.moreMenuBtn}
                                        onClick={(e) => { e.stopPropagation(); toggleActionMenu(tournament.id); }}
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {actionMenuOpenId === tournament.id && (
                                        <div className={styles.menuDropdown}>
                                            <button
                                                className={styles.menuItem}
                                                onClick={() => handleToggleVisibility(tournament.id, tournament.isVisible)}
                                            >
                                                {tournament.isVisible ? <EyeOff size={14} style={{ marginRight: 8 }} /> : <Eye size={14} style={{ marginRight: 8 }} />}
                                                {tournament.isVisible ? 'Ocultar' : 'Mostrar'}
                                            </button>

                                            {!tournament.unionId && (
                                                <button
                                                    className={`${styles.menuItem} ${styles.warning}`}
                                                    onClick={() => { setLinkingTournamentId(tournament.id); setActionMenuOpenId(null); }}
                                                >
                                                    Link Union
                                                </button>
                                            )}

                                            <div className={styles.menuDivider} />
                                            <div className={styles.menuLabel}>Mover a carpeta</div>

                                            {db.folders.map(f => (
                                                <button
                                                    key={f.id}
                                                    className={styles.menuItem}
                                                    onClick={() => handleMoveToFolder(tournament.id, f.id)}
                                                >
                                                    <FolderIcon size={14} style={{ marginRight: 8, color: f.color || '#888' }} />
                                                    {f.name}
                                                </button>
                                            ))}
                                            <button
                                                className={styles.menuItem}
                                                onClick={() => handleMoveToFolder(tournament.id, 'none')}
                                            >
                                                <FolderIcon size={14} style={{ marginRight: 8, opacity: 0.5 }} />
                                                Sin carpeta
                                            </button>

                                            <div className={styles.menuDivider} />

                                            <button
                                                className={`${styles.menuItem} ${styles.danger}`}
                                                onClick={() => handleDelete(tournament.id)}
                                            >
                                                <Trash2 size={14} style={{ marginRight: 8 }} />
                                                Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${tournament.status === 'Activo' ? styles.badgeActive : styles.badgeArchived}`}>
                                        {tournament.status}
                                    </span>
                                    <span className={`${styles.badgePill} ${tournament.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {tournament.source}
                                    </span>
                                    {tournament.folderId && (
                                        <span className={styles.badgePill} style={{ borderColor: tournament.folderColor, color: tournament.folderColor }}>
                                            📁 {tournament.folderName}
                                        </span>
                                    )}
                                </div>

                                <div className={styles.metricPrimary}>
                                    <span className={styles.metricValueBig}>{tournament.matches}</span>
                                    <span className={styles.metricLabelSmall}>PARTIDOS</span>
                                </div>

                                <div className={styles.cardActions}>
                                    <Link href={`/admin/entities/${tournament.id}/manage?type=tournament`} className={styles.actionBtn}>
                                        Ver
                                    </Link>
                                    <Link href={`/admin/entities/${tournament.id}/manage?type=tournament`} className={styles.actionBtn}>
                                        Editar
                                    </Link>
                                    <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                                        Sync
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {linkingTournamentId && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div style={{
                        background: '#0b1016', border: '1px solid rgba(255,255,255,0.1)',
                        padding: 24, borderRadius: 12, minWidth: 320, maxWidth: 400
                    }}>
                        <h3 style={{ margin: '0 0 16px', color: 'white' }}>Vincular Unión</h3>
                        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
                            Selecciona una unión existente para vincular este torneo.
                        </p>
                        <select
                            value={selectedUnionId}
                            onChange={(e) => setSelectedUnionId(e.target.value)}
                            style={{ width: '100%', padding: 12, borderRadius: 6, background: '#1a1d24', border: '1px solid #333', color: 'white', marginBottom: 20 }}
                        >
                            <option value="">Seleccionar Unión...</option>
                            {unions.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setLinkingTournamentId(null)}
                                style={{ background: 'transparent', border: '1px solid #333', color: '#ccc', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmLink}
                                disabled={!selectedUnionId}
                                style={{ background: selectedUnionId ? '#22c55e' : '#333', border: 'none', color: selectedUnionId ? 'black' : '#666', padding: '8px 16px', borderRadius: 6, cursor: selectedUnionId ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                            >
                                Vincular
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
