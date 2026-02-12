'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import styles from './disciplina.module.css';

interface Incident {
    id: string;
    date: string;
    playerName: string;
    playerId: string;
    clubName: string;
    incidentType: string;
    description: string;
    severity: string;
    status: string;
    tournamentId: string;
}

interface Sanction {
    id: string;
    playerId: string;
    playerName: string;
    clubName: string;
    summary: string;
    weeks: number;
    startDate: string;
    endDate: string;
    status: string;
}

interface Tournament {
    id: string;
    name: string;
    seasonId: string;
}

export default function DisciplinaPage() {
    const params = useParams();
    const unionId = params?.id as string;

    const [isLoading, setIsLoading] = useState(true);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [sanctions, setSanctions] = useState<Sanction[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);

    const [activeTab, setActiveTab] = useState('Bandeja de Casos');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTournament, setFilterTournament] = useState('Todos los torneos');
    const [filterStatus, setFilterStatus] = useState('Cualquier estado');

    useEffect(() => {
        async function loadData() {
            try {
                const res = await fetch(`/api/admin/union/${unionId}/discipline`);
                const data = await res.json();
                if (data.ok) {
                    setIncidents(data.incidents);
                    setSanctions(data.sanctions);
                    setTournaments(data.tournaments);
                }
            } catch (err) {
                console.error('Error loading discipline data:', err);
            } finally {
                setIsLoading(false);
            }
        }
        if (unionId) loadData();
    }, [unionId]);

    const filteredIncidents = incidents.filter(i => {
        const matchesSearch = i.playerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.clubName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTour = filterTournament === 'Todos los torneos' || i.tournamentId === filterTournament;
        const matchesStatus = filterStatus === 'Cualquier estado' ||
            (filterStatus === 'Pendiente' && i.status === 'pending') ||
            (filterStatus === 'En Revisión' && i.status === 'review') ||
            (filterStatus === 'Resuelto' && i.status === 'resolved');

        return matchesSearch && matchesTour && matchesStatus;
    });

    if (isLoading) {
        return <div className={styles.disciplinePage}><p>Cargando panel de disciplina...</p></div>;
    }

    return (
        <div className={styles.disciplinePage}>

            {/* Global Admin Header */}
            <header className={styles.disciplineHead}>
                <div className={styles.disciplineHeadContent}>
                    <h1>Panel de Disciplina</h1>
                    <p>Control centralizado de sanciones, elegibilidad y cumplimiento normativo de la unión.</p>

                    <div className={styles.disciplineFilters}>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Torneo</span>
                            <select
                                className={styles.filterSelect}
                                value={filterTournament}
                                onChange={(e) => setFilterTournament(e.target.value)}
                            >
                                <option>Todos los torneos</option>
                                {tournaments.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Estado</span>
                            <select
                                className={styles.filterSelect}
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option>Cualquier estado</option>
                                <option>Pendiente</option>
                                <option>En Revisión</option>
                                <option>Resuelto</option>
                            </select>
                        </div>
                        <div className={styles.filterGroup}>
                            <span className={styles.filterLabel}>Buscar</span>
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Jugador, equipo o ID de incidente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* Dynamic Tournament Blocks */}
            {tournaments.map(tournament => {
                const tourIncidents = filteredIncidents.filter(i => i.tournamentId === tournament.id);
                if (filterTournament !== 'Todos los torneos' && tournament.id !== filterTournament) return null;
                if (tourIncidents.length === 0 && filterTournament === 'Todos los torneos') return null;

                const openIncidents = tourIncidents.filter(i => i.status !== 'resolved').length;
                const activeSanctionsCount = sanctions.filter(s => s.status === 'active' && tourIncidents.some(i => i.playerId === s.playerId)).length;

                return (
                    <section key={tournament.id} className={styles.tourCard}>
                        <div className={styles.tourHead}>
                            <div className={styles.tourInfo}>
                                <div className={styles.name}>{tournament.name}</div>
                                <div className={styles.meta}>TEMPORADA {tournament.seasonId} • {tournament.id.includes('uar-top-12') ? 'EDICIÓN PROFESIONAL' : 'REGIONAL'}</div>
                            </div>
                            <div className={styles.tourBadges}>
                                <span className={styles.badge}>{tournament.id.includes('uar-top-12') ? 'NIVEL 1' : 'NIVEL 2'}</span>
                                <span className={styles.badge}>TMO ACTIVO</span>
                            </div>
                        </div>

                        <div className={styles.tourKpis}>
                            <div className={styles.kpi}>
                                <span className={styles.value}>{String(openIncidents).padStart(2, '0')}</span>
                                <span className={styles.label}>Incidentes Abiertos</span>
                            </div>
                            <div className={styles.kpi}>
                                <span className={styles.value}>{String(activeSanctionsCount).padStart(2, '0')}</span>
                                <span className={styles.label}>Sanciones Activas</span>
                            </div>
                            <div className={styles.kpi}>
                                <span className={styles.value}>00</span>
                                <span className={styles.label}>Apelaciones</span>
                            </div>
                            <div className={styles.kpi}>
                                <span className={styles.value}>98.2%</span>
                                <span className={styles.label}>Ratio Elegibilidad</span>
                            </div>
                        </div>

                        <nav className={styles.tourTabs}>
                            {['Bandeja de Casos', 'Sanciones Activas', 'Elegibilidad', 'Reglamento', 'Apelaciones', 'Auditoría'].map(tab => (
                                <div
                                    key={tab}
                                    className={`${styles.tourTab} ${activeTab === tab ? styles.active : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </div>
                            ))}
                        </nav>

                        <div className={styles.tourContent}>
                            {activeTab === 'Bandeja de Casos' && (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>ID / Fecha</th>
                                                <th>Involucrado</th>
                                                <th>Equipo</th>
                                                <th>Incidente</th>
                                                <th>Estado</th>
                                                <th>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tourIncidents.map(incident => (
                                                <tr key={incident.id}>
                                                    <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                                        {incident.id}<br />
                                                        <span style={{ fontSize: '10px', opacity: 0.5 }}>{incident.date}</span>
                                                    </td>
                                                    <td>
                                                        <div className={styles.playerCell}>
                                                            <div className={styles.playerAvatar}>
                                                                {incident.playerName.split(' ').map(n => n[0]).join('')}
                                                            </div>
                                                            <div>
                                                                <div style={{ color: '#f8fafc', fontWeight: 600 }}>{incident.playerName}</div>
                                                                <div style={{ fontSize: '11px', opacity: 0.6 }}>Jugador</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>{incident.clubName}</td>
                                                    <td>
                                                        {incident.severity === 'high' && <span className={`${styles.severityDot} ${styles.severityHigh}`}></span>}
                                                        <span style={{ color: '#f8fafc' }}>{incident.incidentType}</span>
                                                        <div style={{ fontSize: '11px', opacity: 0.5 }}>{incident.description}</div>
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.statusPill} ${styles[incident.status]}`}>
                                                            {incident.status === 'review' ? 'En Revisión' :
                                                                incident.status === 'resolved' ? 'Resuelto' : 'Pendiente'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className={styles.btnAction}>
                                                            {incident.status === 'resolved' ? 'Ver Dictamen' : 'Gestionar'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {tourIncidents.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#475569', fontStyle: 'italic' }}>
                                                        No se encontraron incidentes con los filtros seleccionados
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'Sanciones Activas' && (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Jugador</th>
                                                <th>Sanción</th>
                                                <th>Periodo</th>
                                                <th>Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sanctions.filter(s => tourIncidents.some(i => i.playerId === s.playerId)).map(sanction => (
                                                <tr key={sanction.id}>
                                                    <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{sanction.id}</td>
                                                    <td>{sanction.playerName} ({sanction.clubName})</td>
                                                    <td>{sanction.summary}</td>
                                                    <td>{sanction.startDate} al {sanction.endDate}</td>
                                                    <td>
                                                        <span className={`${styles.statusPill} ${styles.resolved}`}>
                                                            {sanction.status === 'active' ? 'Activa' : sanction.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {sanctions.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>No hay sanciones activas</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab !== 'Bandeja de Casos' && activeTab !== 'Sanciones Activas' && (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#475569' }}>
                                    Modulo de {activeTab} próximamente...
                                </div>
                            )}
                        </div>
                    </section>
                );
            })}

        </div>
    );
}
