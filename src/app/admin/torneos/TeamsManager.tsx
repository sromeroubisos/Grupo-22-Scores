import React, { useState, useEffect } from 'react';
import styles from './page.module.css';

interface Team {
    id: string;
    name: string;
    category: string;
    zone: string;
    origin?: string; // Optional: club name, city, etc.
}

interface TeamsManagerProps {
    categories: string[];
    zones: string[];
    teams: Team[];
    onUpdateTeams: (teams: Team[]) => void;
    onClose: () => void;
}

// Mock Canonical Clubs List
const MOCK_CLUBS = [
    "CUBA", "SIC", "CASI", "Hindú", "Newman", "Alumni", "Belgrano Athletic", "Regatas",
    "San Luis", "Los Tilos", "La Plata", "Buenos Aires", "Champagnat", "Pucará",
    "San Cirano", "San Albano", "Olivos", "Lomas", "San Martín", "Curupaytí"
];

export default function TeamsManager({ categories, zones, teams, onUpdateTeams, onClose }: TeamsManagerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [newTeamName, setNewTeamName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(categories[0] || '');
    const [selectedZone, setSelectedZone] = useState(zones[0] || '');

    // Filtered clubs suggestion logic could go here
    const [filteredClubs, setFilteredClubs] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (newTeamName) {
            const matches = MOCK_CLUBS.filter(c =>
                c.toLowerCase().includes(newTeamName.toLowerCase()) &&
                !c.toLowerCase().match(newTeamName.toLowerCase()) // simplistic exact match check
            );
            // Actually just show all matching
            setFilteredClubs(MOCK_CLUBS.filter(c => c.toLowerCase().includes(newTeamName.toLowerCase())));
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [newTeamName]);

    const handleAddTeam = () => {
        if (!newTeamName || !selectedCategory || !selectedZone) {
            alert("Completa todos los campos: Nombre, Categoría y Zona.");
            return;
        }

        const newTeam: Team = {
            id: Date.now().toString(),
            name: newTeamName,
            category: selectedCategory,
            zone: selectedZone
        };

        onUpdateTeams([...teams, newTeam]);
        setNewTeamName('');
        setShowSuggestions(false);
    };

    const handleRemoveTeam = (id: string) => {
        if (window.confirm("¿Eliminar equipo?")) {
            onUpdateTeams(teams.filter(t => t.id !== id));
        }
    };

    const selectWhyClub = (club: string) => {
        setNewTeamName(club);
        setShowSuggestions(false);
    };

    // Filter displayed teams
    const displayTeams = teams.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={styles.page} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-bg-primary)' }}>
            <div className={styles.main} style={{ marginLeft: 0, overflow: 'hidden' }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Administrar Equipos</h1>
                        <p className={styles.pageSubtitle}>
                            {teams.length} equipos cargados • {categories.length} categorías • {zones.length} zonas
                        </p>
                    </div>
                    <button className={styles.viewSiteBtn} onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                        ← Volver a Configuración
                    </button>
                </div>

                <div className={styles.content} style={{ flexDirection: 'row', height: 'calc(100vh - 80px)', overflow: 'hidden', padding: 0 }}>

                    {/* Left: Add Team Form */}
                    <div style={{ width: '350px', borderRight: '1px solid var(--color-border)', padding: '2rem', background: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h2 className={styles.cardTitle}>Nuevo Equipo</h2>

                        <div>
                            <label className={styles.statLabel}>Nombre del Club / Equipo</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={newTeamName}
                                    onChange={(e) => setNewTeamName(e.target.value)}
                                    placeholder="Buscar o escribir nombre..."
                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                />
                                {showSuggestions && filteredClubs.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
                                        borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 10
                                    }}>
                                        {filteredClubs.map(club => (
                                            <div
                                                key={club}
                                                onClick={() => selectWhyClub(club)}
                                                style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {club}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className={styles.statLabel}>Categoría</label>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className={styles.statLabel}>Zona Asignada</label>
                            <select
                                value={selectedZone}
                                onChange={(e) => setSelectedZone(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                            >
                                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                        </div>

                        <button
                            className={styles.viewSiteBtn}
                            onClick={handleAddTeam}
                            style={{ marginTop: '1rem', justifyContent: 'center' }}
                        >
                            + Agregar Equipo
                        </button>

                        <div style={{ marginTop: 'auto', padding: '1rem', background: 'var(--color-bg-tertiary)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            <p>💡 Tip: Asegúrate de cargar todos los equipos para poder generar el fixture automáticamente.</p>
                        </div>
                    </div>

                    {/* Right: Team List */}
                    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 className={styles.cardTitle}>Equipos Cargados</h2>
                            <input
                                type="text"
                                placeholder="Filtrar por nombre..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ padding: '0.6rem 1rem', width: '250px', borderRadius: '20px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'white' }}
                            />
                        </div>

                        {/* Group by Category/Zone visually or just list table? - List table is easier for now */}
                        <div className={styles.card}>
                            {displayTeams.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                                    No hay equipos cargados aún.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-bg-tertiary)', textAlign: 'left' }}>
                                            <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Equipo</th>
                                            <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Categoría</th>
                                            <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Zona</th>
                                            <th style={{ padding: '1rem', width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayTeams.map((team, idx) => (
                                            <tr key={team.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '1rem', fontWeight: 600 }}>{team.name}</td>
                                                <td style={{ padding: '1rem' }}><span className={styles.badge} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>{team.category}</span></td>
                                                <td style={{ padding: '1rem' }}><span className={styles.badge} style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>{team.zone}</span></td>
                                                <td style={{ padding: '1rem' }}>
                                                    <button onClick={() => handleRemoveTeam(team.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
