'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    RefreshCw, 
    Globe, 
    Search, 
    Trophy, 
    Calendar, 
    ChevronRight, 
    Info, 
    AlertCircle, 
    ExternalLink, 
    Plus,
    CheckCircle,
    X
} from 'lucide-react';
import styles from './page.module.css';
import { normalizeSlug } from '@/lib/utils/normalize';

// Types
interface Sport {
    id: string;
    name: string;
}

interface Entity {
    id: string;
    name: string;
    type: 'country' | 'continental';
}

interface Tournament {
    id: string;
    name: string;
    logo_url: string;
    status: 'available_for_import' | 'linked' | 'available_for_link';
    internal_id?: string;
}

interface Season {
    tournament_stage_id: string;
    tournament_stage_name: string;
}

interface InternalTournament {
    id: string;
    name: string;
}

interface Fixture {
    id: string;
    home_team: string;
    away_team: string;
    date: string;
    score?: string;
}

// Custom Toast Component
function Toast({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
    const bgColor = type === 'success' ? 'rgba(16, 185, 129, 0.15)' : type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)';
    const borderColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : Info;

    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            background: bgColor, backdropFilter: 'blur(10px)',
            border: `1px solid ${borderColor}`, borderRadius: '8px',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
            color: '#fff', fontSize: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.3s ease-out'
        }}>
            <Icon size={18} color={borderColor} />
            {message}
        </div>
    );
}

export default function TournamentIngestionPage() {
    // State
    const [sports, setSports] = useState<Sport[]>([]);
    const [entities, setEntities] = useState<Entity[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [fixtures, setFixtures] = useState<Fixture[]>([]);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [internalTournaments, setInternalTournaments] = useState<InternalTournament[]>([]);
    
    const [selectedSport, setSelectedSport] = useState<string>('rugby');
    const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
    const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [importName, setImportName] = useState('');
    const [linkInternalId, setLinkInternalId] = useState('');
    const [activeTab, setActiveTab] = useState<'fixtures' | 'seasons'>('fixtures');

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load sports on mount
    useEffect(() => {
        fetchSports();
    }, []);

    // Load entities when sport changes
    useEffect(() => {
        if (selectedSport) {
            fetchEntities(selectedSport);
        }
    }, [selectedSport]);

    // Load tournaments when entity changes
    useEffect(() => {
        if (selectedSport && selectedEntity) {
            fetchTournaments(selectedSport, selectedEntity);
        }
    }, [selectedSport, selectedEntity]);

    const fetchSports = async () => {
        setLoading(prev => ({ ...prev, sports: true }));
        try {
            const res = await fetch('/api/admin/super/tournament-ingestion?action=get-sports');
            const data = await res.json();
            setSports(data);
        } catch (error) {
            showToast('Error al cargar deportes', 'error');
        } finally {
            setLoading(prev => ({ ...prev, sports: false }));
        }
    };

    const fetchEntities = async (sportId: string) => {
        setLoading(prev => ({ ...prev, entities: true }));
        try {
            const res = await fetch(`/api/admin/super/tournament-ingestion?action=get-entities&sportId=${sportId}`);
            const data = await res.json();
            setEntities(data);
            setSelectedEntity(null);
            setTournaments([]);
        } catch (error) {
            showToast('Error al cargar países/regiones', 'error');
        } finally {
            setLoading(prev => ({ ...prev, entities: false }));
        }
    };

    const fetchTournaments = async (sportId: string, entityId: string) => {
        setLoading(prev => ({ ...prev, tournaments: true }));
        try {
            const res = await fetch(`/api/admin/super/tournament-ingestion?action=get-tournaments&sportId=${sportId}&entityId=${entityId}`);
            const data = await res.json();
            setTournaments(data);
        } catch (error) {
            showToast('Error al cargar torneos', 'error');
        } finally {
            setLoading(prev => ({ ...prev, tournaments: false }));
        }
    };

    const fetchSeasons = async (tournamentId: string) => {
        setLoading(prev => ({ ...prev, seasons: true }));
        try {
            const res = await fetch(`/api/admin/super/tournament-ingestion?action=get-seasons&tournamentId=${tournamentId}`);
            const data = await res.json();
            setSeasons(data);
            if (data.length > 0) {
                setSelectedSeason(data[0].tournament_stage_id);
            }
        } catch (error) {
            showToast('Error al cargar temporadas', 'error');
        } finally {
            setLoading(prev => ({ ...prev, seasons: false }));
        }
    };

    const fetchInternalTournaments = async (sportId: string) => {
        try {
            // We'll use the existing internal tournament API if available or add one
            const res = await fetch(`/api/admin/tournaments?sport_id=${sportId}`);
            const data = await res.json();
            setInternalTournaments(data.data || []);
        } catch (error) {
            console.error('Error fetching internal tournaments', error);
        }
    };

    const previewFixtures = async (tournamentId: string, seasonId?: string) => {
        setLoading(prev => ({ ...prev, preview: true }));
        try {
            let url = `/api/admin/super/tournament-ingestion?action=preview-fixtures&tournamentId=${tournamentId}`;
            if (seasonId) url += `&seasonId=${seasonId}`;
            const res = await fetch(url);
            const data = await res.json();
            setFixtures(data);
        } catch (error) {
            showToast('Error al previsualizar partidos', 'error');
        } finally {
            setLoading(prev => ({ ...prev, preview: false }));
        }
    };

    const handleImportTournament = async () => {
        if (!selectedTournament) return;
        setLoading(prev => ({ ...prev, importing: true }));
        try {
            const res = await fetch('/api/admin/super/tournament-ingestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create-tournament',
                    externalTournament: selectedTournament,
                    internalParams: { display_name: importName }
                })
            });
            
            if (res.ok) {
                showToast('Torneo importado correctamente', 'success');
                setIsImportModalOpen(false);
                // Refresh list
                if (selectedSport && selectedEntity) fetchTournaments(selectedSport, selectedEntity);
            } else {
                showToast('Error al importar torneo', 'error');
            }
        } catch (error) {
            showToast('Error de red al importar', 'error');
        } finally {
            setLoading(prev => ({ ...prev, importing: false }));
        }
    };

    const handleLinkTournament = async () => {
        if (!selectedTournament || !linkInternalId) return;
        setLoading(prev => ({ ...prev, linking: true }));
        try {
            const res = await fetch('/api/admin/super/tournament-ingestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'link-tournament',
                    externalId: selectedTournament.id,
                    internalId: linkInternalId
                })
            });
            
            if (res.ok) {
                showToast('Torneo vinculado correctamente', 'success');
                setIsLinkModalOpen(false);
                // Refresh list
                if (selectedSport && selectedEntity) fetchTournaments(selectedSport, selectedEntity);
            } else {
                showToast('Error al vincular torneo', 'error');
            }
        } catch (error) {
            showToast('Error de red al vincular', 'error');
        } finally {
            setLoading(prev => ({ ...prev, linking: false }));
        }
    };

    const filteredEntities = useMemo(() => {
        if (!searchQuery) return entities;
        return entities.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [entities, searchQuery]);

    return (
        <div className={styles.tectonicPage}>
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Módulo de Control Externo</p>
                    <h1>Ingesta de Torneos API</h1>
                </div>
                <div className={styles.btn} onClick={fetchSports}>
                    <RefreshCw size={14} className={loading.sports ? styles.spin : ''} />
                    Refrescar API
                </div>
            </header>

            <div className={styles.tectonicGrid}>
                {/* Column 1: Entities Browser */}
                <div className={`${styles.slab} ${styles.col3}`}>
                    <span className={styles.slabLabel}>Deporte y Región</span>
                    
                    <div className={styles.searchBox}>
                        <select 
                            className={styles.input} 
                            value={selectedSport} 
                            onChange={(e) => setSelectedSport(e.target.value)}
                        >
                            {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div className={styles.searchBox}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--basalt-600)' }} />
                            <input 
                                className={styles.input} 
                                style={{ paddingLeft: '36px' }}
                                placeholder="Buscar país o entidad..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className={styles.scrollArea}>
                        {loading.entities ? (
                            <div className={styles.emptyState}><div className={styles.spinner}></div></div>
                        ) : filteredEntities.map(entity => (
                            <div 
                                key={entity.id} 
                                className={`${styles.listItem} ${selectedEntity === entity.id ? styles.listItemSelected : ''}`}
                                onClick={() => setSelectedEntity(entity.id)}
                            >
                                <span className={styles.itemIcon}>{entity.type === 'continental' ? '🌐' : '🏳️'}</span>
                                <div className={styles.itemInfo}>
                                    <div className={styles.itemName}>{entity.name}</div>
                                    <div className={styles.itemMeta}>{entity.type === 'continental' ? 'Continental' : 'País'}</div>
                                </div>
                                <ChevronRight size={14} color="var(--basalt-700)" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Tournament List */}
                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Torneos Disponibles</span>
                    
                    {!selectedEntity ? (
                        <div className={styles.emptyState}>
                            <Globe size={40} strokeWidth={1} />
                            <p>Selecciona una región para ver torneos</p>
                        </div>
                    ) : loading.tournaments ? (
                        <div className={styles.emptyState}><div className={styles.spinner}></div></div>
                    ) : tournaments.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Info size={40} strokeWidth={1} />
                            <p>No se encontraron torneos en esta región</p>
                        </div>
                    ) : (
                        <div className={styles.scrollArea}>
                            {tournaments.map(tournament => (
                                <div 
                                    key={tournament.id} 
                                    className={`${styles.tournamentCard} ${selectedTournament?.id === tournament.id ? styles.tournamentCardSelected : ''}`}
                                    onClick={() => {
                                        setSelectedTournament(tournament);
                                        setFixtures([]);
                                        setSeasons([]);
                                        setSelectedSeason(null);
                                        previewFixtures(tournament.id);
                                        fetchSeasons(tournament.id);
                                        if (tournament.status !== 'linked') {
                                            fetchInternalTournaments(selectedSport);
                                        }
                                    }}
                                >
                                    <img src={tournament.logo_url || 'https://via.placeholder.com/150'} alt={tournament.name} className={styles.tournamentLogo} />
                                    <div className={styles.itemInfo}>
                                        <div className={styles.itemName}>{tournament.name}</div>
                                        <div style={{ marginTop: '4px' }}>
                                            <span className={`${styles.badge} ${tournament.status === 'linked' ? styles.badgeLinked : styles.badgeImport}`}>
                                                {tournament.status === 'linked' ? 'Vinculado' : 'Disponible'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Column 3: Preview */}
                <div className={`${styles.slab} ${styles.col5}`}>
                    <span className={styles.slabLabel}>Previsualización y Acciones</span>
                    
                    {!selectedTournament ? (
                        <div className={styles.emptyState}>
                            <Trophy size={40} strokeWidth={1} />
                            <p>Selecciona un torneo para ver detalles</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
                                <img src={selectedTournament.logo_url || 'https://via.placeholder.com/150'} alt={selectedTournament.name} className={styles.tournamentLogo} style={{ width: '80px', height: '80px' }} />
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedTournament.name}</h2>
                                    <p style={{ color: 'var(--basalt-600)', fontSize: '12px', marginTop: '4px' }}>ID API: {selectedTournament.id}</p>
                                    
                                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                        {selectedTournament.status === 'linked' ? (
                                            <a 
                                                href={`/admin/entities/${selectedTournament.internal_id}/manage?type=tournament`}
                                                className={`${styles.btn} ${styles.btnPrimary}`}
                                                target="_blank"
                                            >
                                                Gestionar Torneo <ExternalLink size={14} />
                                            </a>
                                        ) : (
                                            <>
                                                <button 
                                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                                    onClick={() => {
                                                        setImportName(selectedTournament.name);
                                                        setIsImportModalOpen(true);
                                                    }}
                                                >
                                                    Importar <Plus size={14} />
                                                </button>
                                                <button 
                                                    className={styles.btn}
                                                    onClick={() => setIsLinkModalOpen(true)}
                                                >
                                                    Vincular a existente
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.tabs}>
                                <div 
                                    className={`${styles.tab} ${activeTab === 'fixtures' ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab('fixtures')}
                                >
                                    Partidos
                                </div>
                                <div 
                                    className={`${styles.tab} ${activeTab === 'seasons' ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab('seasons')}
                                >
                                    Temporadas
                                </div>
                            </div>

                            <div className={styles.scrollArea}>
                                {loading.preview ? (
                                    <div className={styles.emptyState}><div className={styles.spinner}></div></div>
                                ) : activeTab === 'fixtures' ? (
                                    fixtures.length > 0 ? (
                                        fixtures.map(fixture => (
                                            <div key={fixture.id} className={styles.fixtureItem}>
                                                <div className={styles.fixtureTime}>
                                                    {new Date(fixture.date).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                                                    <br />
                                                    {new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className={styles.fixtureTeams}>
                                                    <div className={styles.fixtureTeam}>
                                                        <span>{fixture.home_team}</span>
                                                        <span className={styles.fixtureScore}>{fixture.score?.split('-')[0] || '-'}</span>
                                                    </div>
                                                    <div className={styles.fixtureTeam}>
                                                        <span>{fixture.away_team}</span>
                                                        <span className={styles.fixtureScore}>{fixture.score?.split('-')[1] || '-'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className={styles.emptyState}>No hay partidos recientes</div>
                                    )
                                ) : (
                                    <div className={styles.scrollArea}>
                                        {loading.seasons ? (
                                            <div className={styles.spinner}></div>
                                        ) : seasons.length > 0 ? (
                                            seasons.map(season => (
                                                <div 
                                                    key={season.tournament_stage_id} 
                                                    className={`${styles.listItem} ${selectedSeason === season.tournament_stage_id ? styles.listItemSelected : ''}`}
                                                    onClick={() => {
                                                        setSelectedSeason(season.tournament_stage_id);
                                                        previewFixtures(selectedTournament.id, season.tournament_stage_id);
                                                        setActiveTab('fixtures');
                                                    }}
                                                >
                                                    <Calendar size={14} />
                                                    <div className={styles.itemName}>{season.tournament_stage_name}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className={styles.emptyState}>No se encontraron temporadas</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Import Modal */}
            {isImportModalOpen && (
                <div className={styles.dialogOverlay}>
                    <div className={styles.dialogContent}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 className={styles.dialogTitle}>Importar Torneo Nuevo</h2>
                            <X size={20} className={styles.btn} style={{ padding: '4px', cursor: 'pointer' }} onClick={() => setIsImportModalOpen(false)} />
                        </div>
                        <p className={styles.dialogDescription}>
                            Se creará una nueva entrada en la base de datos interna vinculada a este ID de API. Los datos se mantendrán sincronizados.
                        </p>
                        
                        <div className={styles.fieldGroup}>
                            <label className={styles.slabLabel} style={{ marginBottom: '8px' }}>Nombre Amigable (Display Name)</label>
                            <input 
                                className={styles.input} 
                                value={importName} 
                                onChange={(e) => setImportName(e.target.value)}
                                placeholder="Nombre para mostrar en el frontend"
                            />
                        </div>

                        <div className={styles.dialogActions}>
                            <button className={styles.btn} onClick={() => setIsImportModalOpen(false)}>Cancelar</button>
                            <button 
                                className={`${styles.btn} ${styles.btnPrimary}`} 
                                onClick={handleImportTournament}
                                disabled={loading.importing || !importName.trim()}
                            >
                                {loading.importing ? 'Importando...' : 'Confirmar Importación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Link Modal */}
            {isLinkModalOpen && (
                <div className={styles.dialogOverlay}>
                    <div className={styles.dialogContent}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 className={styles.dialogTitle}>Vincular a Torneo Existente</h2>
                            <X size={20} className={styles.btn} style={{ padding: '4px', cursor: 'pointer' }} onClick={() => setIsLinkModalOpen(false)} />
                        </div>
                        <p className={styles.dialogDescription}>
                            Vincula este torneo de la API con uno que ya existe en tu base de datos.
                        </p>
                        
                        <div className={styles.fieldGroup}>
                            <label className={styles.slabLabel} style={{ marginBottom: '8px' }}>Seleccionar Torneo Interno</label>
                            <select 
                                className={styles.input} 
                                value={linkInternalId} 
                                onChange={(e) => setLinkInternalId(e.target.value)}
                            >
                                <option value="">Seleccionar un torneo...</option>
                                {internalTournaments.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.dialogActions}>
                            <button className={styles.btn} onClick={() => setIsLinkModalOpen(false)}>Cancelar</button>
                            <button 
                                className={`${styles.btn} ${styles.btnPrimary}`} 
                                onClick={handleLinkTournament}
                                disabled={loading.linking || !linkInternalId}
                            >
                                {loading.linking ? 'Vinculando...' : 'Confirmar Vínculo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <Toast message={toast.message} type={toast.type} />}
            
            <style jsx global>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
