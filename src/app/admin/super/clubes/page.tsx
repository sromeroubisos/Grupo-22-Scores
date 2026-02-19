'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { Eye, EyeOff, Folder, FolderIcon, MoreVertical, Plus, Trash2 } from 'lucide-react';
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

export default function SuperadminClubesPage() {
    const { filters } = useSuperConsole();
    const [folderFilter, setFolderFilter] = useState('all');
    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // State for Supabase data
    const [clubs, setClubs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const supabase = createClient();

    const toggleActionMenu = (id: string) => {
        if (actionMenuOpenId === id) setActionMenuOpenId(null);
        else setActionMenuOpenId(id);
    };

    const fetchData = async () => {
        setLoading(true);
        setErrorMsg(null);

        // Safety timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out after 5s')), 5000)
        );

        try {
            console.log('Fetching clubs...');

            // Race the query against the timeout
            const { data, error } = await Promise.race([
                supabase
                    .from('clubs')
                    .select('*')
                    .order('name'),
                timeoutPromise
            ]) as any;

            if (error) {
                console.error('Error fetching clubs from Supabase:', error);
                throw error;
            } else {
                console.log('Clubs data loaded from DB:', data?.length);
                setClubs(data || []);
            }
        } catch (err: any) {
            console.error('Failed to fetch clubs from DB, fallback to empty/mock:', err);
            setErrorMsg(`Error de conexión: ${err.message}. Mostrando datos locales.`);
            // Fallback to mock data from db.clubs temporarily
            // This ensures the UI doesn't break if DB is down
            // Mapping mock-db structure to Supabase structure
            const mockClubs = db.clubs.map(c => ({
                id: c.id,
                name: c.name,
                short_name: c.shortName,
                city: c.city,
                logo_url: c.logoUrl,
                union_id: c.unionId,
                country_id: 'ARG' // Default
            }));
            setClubs(mockClubs);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateFolder = () => {
        // Mock folder creation for now
        if (!newFolderName.trim()) return;
        const newFolder = {
            id: newFolderName.toLowerCase().replace(/\s+/g, '-'),
            name: newFolderName.trim(),
            color: '#3b82f6' // Default blue
        };
        db.folders.push(newFolder);
        setNewFolderName('');
        setIsCreateFolderOpen(false);
    };

    const handleMoveToFolder = async (clubId: string, folderId: string) => {
        // Feature depends on folder_id column, which might not exist yet.
        console.log('Move to folder not implemented in DB yet', clubId, folderId);
        setActionMenuOpenId(null);
    };

    const handleToggleVisibility = async (clubId: string, current: boolean | undefined) => {
        try {
            // Check if is_visible column exists update otherwise mock
            console.log('Toggling visibility', clubId, !current);
            // Optimistic update if we were to implement
            // await supabase.from('clubs').update({ is_visible: !current }).eq('id', clubId);
            // fetchData();
        } catch (err) {
            console.error('Error toggling visibility', err);
        }
    };

    const handleDelete = async (clubId: string) => {
        if (confirm('¿Estás seguro de eliminar este club?')) {
            try {
                const { error } = await supabase
                    .from('clubs')
                    .delete()
                    .eq('id', clubId);

                if (error) {
                    alert('Error al eliminar club');
                    console.error(error);
                } else {
                    fetchData();
                }
            } catch (err) {
                console.error(err);
            }
        }
    };

    const formattedClubs = useMemo(() => {
        return clubs.map((c, index) => {
            // Default mappings since columns might be missing
            const sports = [c.sport || 'rugby'];
            const country = c.country_id === 'URY' ? 'Uruguay' : 'Argentina'; // Simple mapping
            const verified = true; // Assume DB clubs are verified/created by admin
            const apiLinked = false;
            const statusKey = 'activo';
            const source = 'Manual';

            // Folders are mock for now
            const folderId = c.folder_id; // If exists
            const folder = db.folders.find(f => f.id === folderId);

            return {
                id: c.id,
                unionId: c.union_id,
                name: c.name,
                shortName: c.short_name || c.name,
                city: c.city || 'Ubicación desconocida',
                logo: c.logo_url || '🛡️',
                sports,
                sportLabels: sportLabels[c.sport || 'rugby'] || c.sport || 'Rugby',
                country,
                verified,
                apiLinked,
                statusKey,
                source,
                followers: 100 + index * 10, // Mock
                views: 500 + index * 50, // Mock
                matchesThisMonth: 0, // Need relation to calculate
                folderId,
                folderName: folder?.name,
                folderColor: folder?.color,
                isVisible: true
            };
        });
    }, [clubs]);

    const filtered = formattedClubs.filter((club) => {
        if (filters.sport !== 'all' && !club.sports.includes(filters.sport)) return false;
        if (filters.country !== 'all' && club.country !== filters.country) return false;
        if (filters.status !== 'all' && club.statusKey !== filters.status) return false;
        if (filters.source !== 'all' && club.source !== filters.source) return false;
        if (filters.search && !club.name.toLowerCase().includes(filters.search.toLowerCase())) return false;

        if (folderFilter !== 'all') {
            if (folderFilter === 'none') return !club.folderId;
            return club.folderId === folderFilter;
        }

        return true;
    });

    const grouped = filtered.reduce<Record<string, Record<string, typeof filtered>>>((acc, club) => {
        club.sports.forEach((sport) => {
            if (filters.sport !== 'all' && sport !== filters.sport) return;
            if (!acc[sport]) acc[sport] = {};
            if (!acc[sport][club.country]) acc[sport][club.country] = [];
            acc[sport][club.country].push(club);
        });
        return acc;
    }, {});

    const createUnionId = 'any'; // Simplification

    return (
        <div style={{ paddingBottom: '40px' }} onClick={() => setActionMenuOpenId(null)}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Clubes</div>
                    <div className={styles.consoleSubtitle}>Gestión de entidades deportivas</div>
                </div>
                <div className={styles.consoleActions}>
                    <div className={styles.filterGroup}>
                        <Folder className={styles.filterIcon} size={14} />
                        <select
                            className={styles.filterSelect}
                            value={folderFilter}
                            onChange={(e) => setFolderFilter(e.target.value)}
                        >
                            <option value="all">Todas las carpetas</option>
                            <option value="none">Sin carpeta</option>
                            {db.folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <Link href="/admin/super/clubes/crear" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                        + Crear Club
                    </Link>
                </div>
            </div>

            {isCreateFolderOpen && (
                <div className={styles.slab} style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Nombre de la nueva carpeta..."
                        className={styles.filterControl}
                        style={{ maxWidth: 300 }}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        autoFocus
                    />
                    <button className={styles.actionBtn} onClick={handleCreateFolder}>Guardar</button>
                    <button className={styles.actionBtn} onClick={() => setIsCreateFolderOpen(false)} style={{ opacity: 0.7 }}>Cancelar</button>
                </div>
            )}

            {loading && <div className={styles.slab} style={{ padding: 40, textAlign: 'center' }}>Cargando clubes...</div>}

            {errorMsg && (
                <div className={styles.slab} style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', border: '1px solid #f59e0b', marginBottom: '16px', fontSize: '14px' }}>
                    Warning: {errorMsg}
                </div>
            )}

            {!loading && Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem} style={{ padding: 24, textAlign: 'center', color: '#666' }}>
                    No se encontraron clubes con los filtros actuales.
                </div>
            )}

            {!loading && Object.entries(grouped).map(([sport, countries]) => (
                <section key={sport} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupTitle}>{sportLabels[sport] || sport}</span>
                    </div>
                    {Object.entries(countries).map(([country, items]) => (
                        <div key={country} className={styles.subGroup}>
                            <div className={styles.subGroupHeader}>
                                <span className={styles.groupFlag}>{countryFlags[country] || '🌐'}</span>
                                <span className={styles.groupTitle}>{country}</span>
                                <span className={styles.groupMeta}>{items.length} clubes</span>
                            </div>
                            <div className={styles.cardGrid}>
                                {items.map((club) => (
                                    <div key={`${sport}-${club.id}`} className={styles.cardItem}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardLogo}>
                                                {club.logo && (club.logo.startsWith('http') || club.logo.startsWith('/')) ?
                                                    <img src={club.logo} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> :
                                                    club.logo
                                                }
                                            </div>
                                            <div>
                                                <div className={styles.cardTitle}>{club.name}</div>
                                                <div className={styles.cardContext}>
                                                    <span className={styles.contextLinePrimary}>
                                                        {club.city}
                                                    </span>
                                                    <span className={styles.contextLineSecondary}>
                                                        {club.sportLabels}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Overflow Menu Trigger */}
                                            <button
                                                className={styles.moreMenuBtn}
                                                onClick={(e) => { e.stopPropagation(); toggleActionMenu(club.id); }}
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {/* Menu Overlay */}
                                            {actionMenuOpenId === club.id && (
                                                <div className={styles.menuDropdown}>
                                                    <button
                                                        className={styles.menuItem}
                                                        onClick={() => handleToggleVisibility(club.id, club.isVisible)}
                                                    >
                                                        {club.isVisible ? <EyeOff size={14} style={{ marginRight: 8 }} /> : <Eye size={14} style={{ marginRight: 8 }} />}
                                                        {club.isVisible ? 'Ocultar' : 'Mostrar'}
                                                    </button>

                                                    <div className={styles.menuDivider} />
                                                    <div className={styles.menuLabel}>Mover a carpeta</div>

                                                    {db.folders.map(f => (
                                                        <button
                                                            key={f.id}
                                                            className={styles.menuItem}
                                                            onClick={() => handleMoveToFolder(club.id, f.id)}
                                                        >
                                                            <FolderIcon size={14} style={{ marginRight: 8, color: f.color || '#888' }} />
                                                            {f.name}
                                                        </button>
                                                    ))}
                                                    <button
                                                        className={styles.menuItem}
                                                        onClick={() => handleMoveToFolder(club.id, 'none')}
                                                    >
                                                        <FolderIcon size={14} style={{ marginRight: 8, opacity: 0.5 }} />
                                                        Sin carpeta
                                                    </button>

                                                    <div className={styles.menuDivider} />

                                                    <button
                                                        className={`${styles.menuItem} ${styles.danger}`}
                                                        onClick={() => handleDelete(club.id)}
                                                    >
                                                        <Trash2 size={14} style={{ marginRight: 8 }} />
                                                        Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badgePill} ${club.verified ? styles.badgeActive : styles.badgeArchived}`}>
                                                {club.verified ? 'Verificado' : 'En Revision'}
                                            </span>
                                            <span className={`${styles.badgePill} ${club.apiLinked ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                                {club.source}
                                            </span>
                                            {club.folderId && (
                                                <span className={styles.badgePill} style={{ borderColor: club.folderColor, color: club.folderColor }}>
                                                    📁 {club.folderName}
                                                </span>
                                            )}
                                        </div>

                                        <div className={styles.metricPrimary}>
                                            <span className={styles.metricValueBig}>{club.followers}</span>
                                            <span className={styles.metricLabelSmall} style={{ textAlign: 'right' }}>SEGUIDORES</span>
                                        </div>

                                        <div className={styles.cardActions}>
                                            <Link href={`/admin/super/clubes/${club.id}`} className={styles.actionBtn}>
                                                Ver
                                            </Link>
                                            <Link href={`/admin/super/clubes/${club.id}/editar`} className={styles.actionBtn}>
                                                Editar
                                            </Link>
                                            <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                                                Sync
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}
