'use client';

import { useState } from 'react';
import Link from 'next/link';
import SectionShell from '../components/SectionShell';
import SportFilter from '../components/SportFilter';
import { useDisciplinas } from '../components/DisciplinasContext';
import styles from '../page.module.css';

// --- Types & Constants ---
type ActiveTab = 'jugadores' | 'pendientes' | 'staff' | 'importar';
type ImportStep = 1 | 2 | 3 | 4;

const SEASONS = ['2026', '2025', '2024'];
const DIVISIONS_MOCK = [
    { id: 'div1', name: 'Primera', sport: 'rugby' },
    { id: 'div2', name: 'Reserva', sport: 'rugby' },
    { id: 'div3', name: 'M19', sport: 'rugby' },
    { id: 'div4', name: 'Primera A', sport: 'football' },
    { id: 'div5', name: 'Pro-A', sport: 'hockey' },
];

const MOCK_PLAYERS = [
    { id: 'p1', firstName: 'Marcos', lastName: 'Kremer', position: 'Tercera linea', dorsal: 6, status: 'Active', birthDate: '1997-07-30' },
    { id: 'p2', firstName: 'Tomas', lastName: 'Albornoz', position: 'Apertura', dorsal: 10, status: 'Active', birthDate: '1997-09-17' },
];

export default function ClubPlantelesPage() {
    const { clubSports } = useDisciplinas();

    // Global filters
    const [selectedSport, setSelectedSport] = useState('rugby');
    const [selectedSeason, setSelectedSeason] = useState('2026');
    const [selectedDivId, setSelectedDivId] = useState(DIVISIONS_MOCK[0].id);

    // Internal views
    const [activeTab, setActiveTab] = useState<ActiveTab>('jugadores');
    const [importStep, setImportStep] = useState<ImportStep>(1);

    // Search
    const [search, setSearch] = useState('');
    const [players, setPlayers] = useState(MOCK_PLAYERS);
    const [selectedPlayer, setSelectedPlayer] = useState<typeof MOCK_PLAYERS[number] | null>(null);
    const [showPlayerModal, setShowPlayerModal] = useState(false);

    const availableDivisions = DIVISIONS_MOCK.filter(d =>
        (selectedSport === 'all' || d.sport === selectedSport) &&
        clubSports.includes(d.sport)
    );

    const activeDiv = DIVISIONS_MOCK.find(d => d.id === selectedDivId);
    const filteredPlayers = players.filter((p) => {
        const query = search.toLowerCase();
        return (
            p.firstName.toLowerCase().includes(query) ||
            p.lastName.toLowerCase().includes(query) ||
            p.position.toLowerCase().includes(query) ||
            String(p.dorsal).includes(query)
        );
    });

    const handleViewPlayer = (player: typeof MOCK_PLAYERS[number]) => {
        setSelectedPlayer(player);
        setShowPlayerModal(true);
    };

    const handleRemovePlayer = (player: typeof MOCK_PLAYERS[number]) => {
        if (!confirm(`Dar de baja a ${player.firstName} ${player.lastName}?`)) return;
        setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    };

    const handleDownloadTemplate = () => {
        const content = [
            'first_name,last_name,id_number,birth_date,role,position,division_id,jersey_number,squad_role,status,photo_url,weight,height',
            'Juan,Perez,32123123,2004-05-11,player,Wing,,14,titular,active,,82.5,182',
            'Tomas,Gomez,29888777,2002-08-20,player,Apertura,,10,suplente,active,,79.3,178',
        ].join('\n');
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'jugadores_import_template.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <SectionShell
            title="Gestión de Planteles"
            subtitle={`Configurando ${activeDiv?.name || 'División'} — Temporada ${selectedSeason}`}
            actions={
                <div className={styles.sectionActions}>
                    <button
                        className={`${styles.btn} ${activeTab === 'importar' ? styles.btnActive : styles.btnGhost}`}
                        onClick={() => setActiveTab('importar')}
                    >
                        📥 Importar CSV/Excel
                    </button>
                    <Link href="/club-admin/planteles/nuevo" className={styles.btn}>
                        <span style={{ fontSize: '18px' }}>+</span> Agregar Manual
                    </Link>
                </div>
            }
        >
            {/* Top Filter Bar */}
            <div className={styles.glassCard} style={{ marginBottom: '24px', padding: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <SportFilter selectedSport={selectedSport} onSportChange={setSelectedSport} />
                    </div>

                    <div className={styles.formGroup} style={{ width: '150px' }}>
                        <label className={styles.formLabel}>Temporada</label>
                        <select
                            className={styles.formInput}
                            value={selectedSeason}
                            onChange={(e) => setSelectedSeason(e.target.value)}
                        >
                            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className={styles.formGroup} style={{ width: '200px' }}>
                        <label className={styles.formLabel}>División / Categoría</label>
                        <select
                            className={styles.formInput}
                            value={selectedDivId}
                            onChange={(e) => setSelectedDivId(e.target.value)}
                        >
                            {availableDivisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Sub-navigation Tabs */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'jugadores' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('jugadores')}
                >
                    Jugadores Activos
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'pendientes' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('pendientes')}
                >
                    Fichas Pendientes
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'staff' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('staff')}
                >
                    Staff del Roster
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'importar' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('importar')}
                >
                    Historial Importaciones
                </button>
            </div>

            {/* Dynamic Content based on Tab */}
            {activeTab === 'jugadores' && (
                <div className={styles.section}>
                    <div className={styles.searchBar}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input
                                className={styles.searchInput}
                                style={{ width: '100%' }}
                                placeholder="Buscar por nombre, posición o dorsal..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>
                            {filteredPlayers.length} Jugadores en Roster
                        </span>
                    </div>

                    <div className={styles.glassCard}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Dorsal</th>
                                    <th>Nombre Completo</th>
                                    <th>Posición</th>
                                    <th>Fecha Nac.</th>
                                    <th>Estado Roster</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlayers.map(p => (
                                    <tr key={p.id}>
                                        <td className={styles.mono} style={{ fontWeight: 700 }}>#{p.dorsal}</td>
                                        <td>
                                            <div className={styles.personRow}>
                                                <div className={styles.avatar}>{p.firstName[0]}{p.lastName[0]}</div>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{p.lastName}, {p.firstName}</span>
                                                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>ID: {p.id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{p.position}</td>
                                        <td className={styles.mono}>{p.birthDate}</td>
                                        <td>
                                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>{p.status}</span>
                                        </td>
                                        <td>
                                            <div className={styles.listItemActions}>
                                                <button className={styles.btnSmall} onClick={() => handleViewPlayer(p)}>Ver Ficha</button>
                                                <button className={styles.btnSmall} onClick={() => handleRemovePlayer(p)}>Baja</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {showPlayerModal && selectedPlayer && (
                        <div className={styles.modalOverlay} onClick={() => setShowPlayerModal(false)}>
                            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                                <div className={styles.modalHeader}>
                                    <div>
                                        <h2 className={styles.cardTitle}>Ficha de jugador</h2>
                                        <p className={styles.cardMeta}>{selectedPlayer.firstName} {selectedPlayer.lastName}</p>
                                    </div>
                                    <button className={styles.btnGhost} type="button" onClick={() => setShowPlayerModal(false)}>Cerrar</button>
                                </div>
                                <div className={styles.detailGrid}>
                                    <div>
                                        <span className={styles.formLabel}>Posición</span>
                                        <p className={styles.detailValue}>{selectedPlayer.position}</p>
                                    </div>
                                    <div>
                                        <span className={styles.formLabel}>Dorsal</span>
                                        <p className={styles.detailValue}>#{selectedPlayer.dorsal}</p>
                                    </div>
                                    <div>
                                        <span className={styles.formLabel}>Fecha Nac.</span>
                                        <p className={styles.detailValue}>{selectedPlayer.birthDate}</p>
                                    </div>
                                    <div>
                                        <span className={styles.formLabel}>Estado</span>
                                        <p className={styles.detailValue}>{selectedPlayer.status}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'importar' && (
                <div className={styles.section}>
                    <div className={styles.glassCard}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.cardTitle}>Asistente de Importación Masiva</h2>
                            <div className={styles.steps}>
                                {[1, 2, 3, 4].map(step => (
                                    <div
                                        key={step}
                                        className={`${styles.stepButton} ${importStep === (step as ImportStep) ? styles.stepButtonActive : ''}`}
                                    >
                                        <span className={styles.stepIndex}>{step}</span>
                                        <span className={styles.stepLabel}>
                                            {step === 1 && 'Subir Archivo'}
                                            {step === 2 && 'Mapeo'}
                                            {step === 3 && 'Validación'}
                                            {step === 4 && 'Confirmar'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {importStep === 1 && (
                            <div className={styles.stepPanel}>
                                <div className={styles.uploadArea} style={{ padding: '60px', cursor: 'pointer', borderStyle: 'dashed' }} onClick={() => setImportStep(2)}>
                                    <span style={{ fontSize: '48px', marginBottom: '16px' }}>Excel / CSV</span>
                                    <p style={{ fontSize: '18px', fontWeight: '600' }}>Arrastrá tu planilla aquí o hacé click para buscar</p>
                                    <p style={{ color: 'var(--color-text-tertiary)' }}>Formatos sugeridos: .csv, .xlsx</p>
                                    <div style={{ marginTop: '24px' }}>
                                        <button className={styles.btnGhost} onClick={handleDownloadTemplate}>Descargar Plantilla CSV</button>
                                    </div>
                                </div>
                                <div className={styles.callout}>
                                    <span className={styles.calloutTitle}>Regla clave anti-caos</span>
                                    <ul className={styles.stepList}>
                                        <li>• Usa encabezados como <strong>first_name</strong>, <strong>last_name</strong>, <strong>position</strong> y <strong>jersey_number</strong>.</li>
                                        <li>• Si no envias <strong>division_id</strong> → el jugador queda asociado al club.</li>
                                        <li>• Si envias <strong>division_id</strong> o eliges un plantel destino → tambien se crea el vínculo en el roster.</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {importStep === 2 && (
                            <div className={styles.stepPanel}>
                                <h3 className={styles.cardTitle}>Vincular columnas de tu archivo</h3>
                                <div className={styles.summaryGrid} style={{ marginTop: '20px' }}>
                                    {[
                                        { field: 'Nombre', required: true, mapped: 'first_name' },
                                        { field: 'Apellido', required: true, mapped: 'last_name' },
                                        { field: 'Fecha Nacimiento', required: false, mapped: 'birth_date' },
                                        { field: 'Posición', required: false, mapped: 'position' },
                                        { field: 'ID / Doc', required: false, mapped: 'id_number' },
                                    ].map(f => (
                                        <div key={f.field} className={styles.formGroup}>
                                            <label className={styles.formLabel}>{f.field} {f.required && <span style={{ color: '#ef4444' }}>*</span>}</label>
                                            <select className={styles.formInput}>
                                                <option value={f.mapped}>{f.mapped}</option>
                                                <option value="">No importar</option>
                                            </select>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.stepActions}>
                                    <button className={styles.btnGhost} onClick={() => setImportStep(1)}>Atrás</button>
                                    <button className={styles.btn} onClick={() => setImportStep(3)}>Validar Datos</button>
                                </div>
                            </div>
                        )}

                        {importStep === 3 && (
                            <div className={styles.stepPanel}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 className={styles.cardTitle}>Previsualización y Errores</h3>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <span className={styles.badgeSuccess}>✅ 42 Listos</span>
                                        <span className={styles.badgeWarning}>♻️ 12 A actualizar</span>
                                        <span className={styles.badgeDanger}>⚠️ 2 Con error</span>
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '16px', fontSize: '13px', overflowX: 'auto' }}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr><th>Fila</th><th>Jugador</th><th>Error / Acción</th></tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>1</td><td>Juan Perez</td><td><span style={{ color: 'var(--color-accent)' }}>Nuevo registro</span></td></tr>
                                            <tr><td>2</td><td>Matías Gomez</td><td><span style={{ color: '#ffb800' }}>Actualizando ID: 12346</span></td></tr>
                                            <tr style={{ background: 'rgba(239, 68, 68, 0.1)' }}><td>3</td><td>Incompleto</td><td><span style={{ color: '#ef4444' }}>Falta fecha de nacimiento</span></td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className={styles.stepActions}>
                                    <button className={styles.btnGhost} onClick={() => setImportStep(2)}>Re-mapear</button>
                                    <button className={styles.btn} onClick={() => setImportStep(4)}>Confirmar Importación</button>
                                </div>
                            </div>
                        )}

                        {importStep === 4 && (
                            <div className={styles.stepPanel} style={{ textAlign: 'center', padding: '60px' }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>✅</div>
                                <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>¡Importación Finalizada!</h2>
                                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
                                    Se han procesado 54 jugadores correctamente en la división <strong>{activeDiv?.name}</strong>.
                                </p>
                                <button className={styles.btn} onClick={() => { setActiveTab('jugadores'); setImportStep(1); }}>
                                    Volver al Roster
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </SectionShell>
    );
}
