'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { Eye, EyeOff, Folder, FolderIcon, MoreVertical, Plus, Trash2 } from 'lucide-react';

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷',
    Uruguay: '🇺🇾',
    Chile: '🇨🇱'
};

const clubSports: Record<string, string[]> = {
    sic: ['rugby', 'hockey'],
    casi: ['rugby'],
    hindu: ['rugby'],
    belgrano: ['rugby', 'football'],
    alumni: ['rugby'],
    newman: ['rugby', 'hockey']
};

const sportLabels: Record<string, string> = {
    rugby: 'Rugby',
    football: 'Futbol',
    hockey: 'Hockey'
};

export default function SuperadminClubesPage() {
    const { filters } = useSuperConsole();
    const [folderFilter, setFolderFilter] = useState('all');
    const [tick, setTick] = useState(0);
    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const toggleActionMenu = (id: string) => {
        if (actionMenuOpenId === id) setActionMenuOpenId(null);
        else setActionMenuOpenId(id);
    };

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        const newFolder = {
            id: newFolderName.toLowerCase().replace(/\s+/g, '-'),
            name: newFolderName.trim(),
            color: '#3b82f6' // Default blue
        };
        db.folders.push(newFolder);
        setNewFolderName('');
        setIsCreateFolderOpen(false);
        setTick(t => t + 1);
    };

    const handleMoveToFolder = (clubId: string, folderId: string) => {
        const club = db.clubs.find(c => c.id === clubId);
        if (club) {
            club.folderId = folderId === 'none' ? undefined : folderId;
            setTick(t => t + 1);
            setActionMenuOpenId(null);
        }
    };

    const handleToggleVisibility = (clubId: string, current: boolean | undefined) => {
        const club = db.clubs.find(c => c.id === clubId);
        if (club) {
            club.isVisible = !current;
            setTick((t) => t + 1);
        }
    };

    const handleDelete = (clubId: string) => {
        if (confirm('¿Estás seguro de eliminar este club?')) {
            const idx = db.clubs.findIndex(c => c.id === clubId);
            if (idx !== -1) {
                db.clubs.splice(idx, 1);
                setTick(t => t + 1);
            }
        }
    };

    const clubs = useMemo(() => {
        return db.clubs.map((c, index) => {
            const tournaments = new Set<string>();
            db.matches.filter((m) => m.homeClubId === c.id || m.awayClubId === c.id).forEach((m) => {
                tournaments.add(m.tournamentId);
            });

            const sports = clubSports[c.id] || ['rugby'];
            const country = c.unionId === 'uar' ? 'Argentina' : 'Uruguay';
            const verified = index % 2 === 0;
            const apiLinked = index % 3 !== 0;
            const statusKey = verified ? 'activo' : 'pendiente';
            const source = apiLinked ? 'API' : 'Manual';

            const folder = db.folders.find(f => f.id === c.folderId);

            return {
                id: c.id,
                unionId: c.unionId,
                name: c.name,
                shortName: c.shortName,
                city: c.city,
                logo: c.logoUrl || '⚽',
                sports,
                sportLabels: sports.map(s => sportLabels[s] || s).join(' · '),
                country,
                verified,
                apiLinked,
                statusKey,
                source,
                followers: 980 + index * 140,
                views: 14600 + index * 530,
                matchesThisMonth: tournaments.size * 2 + 3,
                folderId: c.folderId,
                folderName: folder?.name,
                folderColor: folder?.color,
                isVisible: c.isVisible !== false // Default to true if undefined
            };
        });
    }, [tick]);

    const filtered = clubs.filter((club) => {
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

    const createUnionId = db.unions[0]?.id;

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

                    <button
                        className={styles.actionBtn}
                        onClick={() => setIsCreateFolderOpen(!isCreateFolderOpen)}
                    >
                        <Plus size={14} /> Carpeta
                    </button>

                    {createUnionId ? (
                        <Link href={`/admin/union/${createUnionId}/clubes/crear?from=super`} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                            + Crear Club
                        </Link>
                    ) : (
                        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled>
                            + Crear Club
                        </button>
                    )}
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

            {Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem} style={{ padding: 24, textAlign: 'center', color: '#666' }}>
                    No se encontraron clubes con los filtros actuales.
                </div>
            )}

            {Object.entries(grouped).map(([sport, countries]) => (
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
                                            <div className={styles.cardLogo}>{club.logo}</div>
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
                                            <Link href={`/admin/union/${club.unionId}/clubes/crear?clubId=${club.id}&from=super`} className={styles.actionBtn}>
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
