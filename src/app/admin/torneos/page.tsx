'use client';

import React, { useState } from 'react';
import styles from './page.module.css';
import TeamsManager from './TeamsManager';

interface Tournament {
    id: string;
    // 1. Identidad
    name: string;
    season: string;
    sport: string;
    organizer: string;
    status: 'draft' | 'published' | 'completed';

    // 2. Configuración Estructural
    categories: string[]; // e.g. ["Primera", "Intermedia"]
    zones: string[]; // e.g. ["Zona A", "Zona B"]
    stages: string[]; // e.g. ["Regular", "Playoffs"]

    // 3. Equipos
    teamsCount: number;
    teams: { id: string; name: string; category: string; zone: string }[];

    // 4. Reglas
    scoringSystem?: {
        win: number;
        draw: number;
        loss: number;
        bonus: boolean;
    };
    tieBreakers?: string[]; // e.g. ["points", "diff", "for", "h2h"]

    // 5. Fixture
    hasFixture: boolean;

    // 6. Eventos
    allowedEvents?: {
        tries?: boolean;
        goals?: boolean;
        cards?: boolean;
        mvp?: boolean;
    };

    // 7. Visibilidad & Roles
    visibility: 'public' | 'private';
    country?: string;
    admins?: string[];
}

// Full Tournament List from JSON
const fullTournamentList = [
    // --- Football (Original + Previous) ---
    { name: "Africa Cup of Nations", country: "International", sport: "Football" },
    { name: "CAF Champions League", country: "International", sport: "Football" },
    { name: "World Cup", country: "International", sport: "Football" },
    { name: "Gold Cup", country: "International", sport: "Football" },
    { name: "CONCACAF Champions Cup", country: "International", sport: "Football" },
    { name: "Leagues Cup", country: "International", sport: "Football" },
    { name: "Copa América", country: "International", sport: "Football" },
    { name: "Copa Libertadores", country: "International", sport: "Football" },
    { name: "Copa Sudamericana", country: "International", sport: "Football" },
    { name: "Asian Cup", country: "International", sport: "Football" },
    { name: "AFC Champions League", country: "International", sport: "Football" },
    { name: "Euro", country: "International", sport: "Football" },
    { name: "Champions League", country: "International", sport: "Football" },
    { name: "Europa League", country: "International", sport: "Football" },
    { name: "Conference League", country: "International", sport: "Football" },
    { name: "UEFA Nations League", country: "International", sport: "Football" },
    { name: "Liga Profesional", country: "Argentina", sport: "Football" },
    { name: "Copa de la Liga Profesional", country: "Argentina", sport: "Football" },
    { name: "Copa Argentina", country: "Argentina", sport: "Football" },
    { name: "Primera Nacional", country: "Argentina", sport: "Football" },
    { name: "Premier League", country: "England", sport: "Football" },
    { name: "Championship", country: "England", sport: "Football" },
    { name: "FA Cup", country: "England", sport: "Football" },
    { name: "EFL Cup", country: "England", sport: "Football" },
    { name: "LaLiga", country: "Spain", sport: "Football" },
    { name: "Copa del Rey", country: "Spain", sport: "Football" },
    { name: "Ligue 1", country: "France", sport: "Football" },
    { name: "Coupe de France", country: "France", sport: "Football" },
    { name: "Bundesliga", country: "Germany", sport: "Football" },
    { name: "DFB Pokal", country: "Germany", sport: "Football" },
    { name: "Serie A", country: "Italy", sport: "Football" },
    { name: "Coppa Italia", country: "Italy", sport: "Football" },
    { name: "Serie A Betano", country: "Brazil", sport: "Football" },
    { name: "Copa Betano do Brasil", country: "Brazil", sport: "Football" },
    { name: "MLS", country: "USA", sport: "Football" },

    // --- Tennis ---
    { name: "Wimbledon", country: "UK", sport: "Tennis" },
    { name: "Roland Garros", country: "France", sport: "Tennis" },
    { name: "US Open", country: "USA", sport: "Tennis" },
    { name: "Australian Open", country: "Australia", sport: "Tennis" },

    // --- Volleyball ---
    { name: "World Championship", country: "International", sport: "Volleyball" },
    { name: "Nations League", country: "International", sport: "Volleyball" },
    { name: "African Championship", country: "International", sport: "Volleyball" },
    { name: "NORCECA Championship", country: "International", sport: "Volleyball" },
    { name: "Asian Championship", country: "International", sport: "Volleyball" },
    { name: "European Championships", country: "International", sport: "Volleyball" },
    { name: "Olympic Games", country: "International", sport: "Volleyball" },
    { name: "LVA", country: "Argentina", sport: "Volleyball" },
    { name: "Copa ACLAV", country: "Argentina", sport: "Volleyball" },
    { name: "Liga Women", country: "Argentina", sport: "Volleyball" },
    { name: "AVL", country: "Australia", sport: "Volleyball" },
    { name: "AVL", country: "Austria", sport: "Volleyball" },
    { name: "Superliga", country: "Brazil", sport: "Volleyball" },
    { name: "Superliga Women", country: "Brazil", sport: "Volleyball" },
    { name: "SuperLiga", country: "Bulgaria", sport: "Volleyball" },
    { name: "CVL", country: "China", sport: "Volleyball" },
    { name: "Superliga", country: "Croatia", sport: "Volleyball" },
    { name: "Extraliga", country: "Czech Republic", sport: "Volleyball" },
    { name: "Volleyligaen", country: "Denmark", sport: "Volleyball" },
    { name: "Super League", country: "England", sport: "Volleyball" },
    { name: "Mestaruusliiga", country: "Finland", sport: "Volleyball" },
    { name: "Ligue A", country: "France", sport: "Volleyball" },
    { name: "1. Bundesliga", country: "Germany", sport: "Volleyball" },
    { name: "A1", country: "Greece", sport: "Volleyball" },
    { name: "Extraliga", country: "Hungary", sport: "Volleyball" },
    { name: "Prime Volleyball", country: "India", sport: "Volleyball" },
    { name: "Proliga", country: "Indonesia", sport: "Volleyball" },
    { name: "Super League", country: "Iran", sport: "Volleyball" },
    { name: "SuperLega", country: "Italy", sport: "Volleyball" },
    { name: "SV.League", country: "Japan", sport: "Volleyball" },
    { name: "Eredivisie", country: "Netherlands", sport: "Volleyball" },
    { name: "Eliteserien", country: "Norway", sport: "Volleyball" },
    { name: "PlusLiga", country: "Poland", sport: "Volleyball" },
    { name: "Divizia A1", country: "Romania", sport: "Volleyball" },
    { name: "Superleague", country: "Russia", sport: "Volleyball" },
    { name: "Superliga", country: "Serbia", sport: "Volleyball" },
    { name: "SuperLiga", country: "Spain", sport: "Volleyball" },
    { name: "Efeler Ligi", country: "Turkey", sport: "Volleyball" },
    { name: "LOVB", country: "USA", sport: "Volleyball" },

    // --- American Football ---
    { name: "NFL", country: "USA", sport: "American Football" },
    { name: "NCAA", country: "USA", sport: "American Football" },
    { name: "UFL", country: "USA", sport: "American Football" },
    { name: "European League of Football", country: "Europe", sport: "American Football" },
    { name: "GFL", country: "Germany", sport: "American Football" },

    // --- Rugby Union ---
    // International
    { name: "World Cup", country: "International", sport: "Rugby Union" },
    { name: "Nations Championship", country: "International", sport: "Rugby Union" },
    { name: "United Rugby Championship", country: "International", sport: "Rugby Union" },
    { name: "Super Rugby", country: "International", sport: "Rugby Union" },
    { name: "Nations Cup", country: "International", sport: "Rugby Union" },
    { name: "Tri Nations", country: "International", sport: "Rugby Union" },
    { name: "Rugby Championship", country: "International", sport: "Rugby Union" },
    { name: "Six Nations", country: "International", sport: "Rugby Union" },
    { name: "World Rugby Nations Cup", country: "International", sport: "Rugby Union" },
    { name: "Pro14 Rainbow Cup", country: "International", sport: "Rugby Union" },
    { name: "Autumn Nations Cup", country: "International", sport: "Rugby Union" },
    { name: "Americas Championship", country: "International", sport: "Rugby Union" },
    { name: "Americas Pacific Challenge", country: "International", sport: "Rugby Union" },
    { name: "Lions Tour", country: "International", sport: "Rugby Union" },
    { name: "Pacific Nations Cup", country: "International", sport: "Rugby Union" },
    { name: "World Championship U20", country: "International", sport: "Rugby Union" },
    { name: "Sevens World Series", country: "International", sport: "Rugby Union" },
    { name: "Sevens World Cup", country: "International", sport: "Rugby Union" },
    { name: "Olympic Games 7's", country: "International", sport: "Rugby Union" },
    { name: "SVNS Series", country: "International", sport: "Rugby Union" },
    // National
    { name: "Top 12 URBA", country: "Argentina", sport: "Rugby Union" },
    { name: "Nacional de Clubes", country: "Argentina", sport: "Rugby Union" },
    { name: "Top 14", country: "Argentina", sport: "Rugby Union" },
    { name: "Super Rugby AUS", country: "Australia", sport: "Rugby Union" },
    { name: "Shute Shield", country: "Australia", sport: "Rugby Union" },
    { name: "Extraliga", country: "Czech Republic", sport: "Rugby Union" },
    { name: "Premiership Rugby", country: "England", sport: "Rugby Union" },
    { name: "Championship Rugby", country: "England", sport: "Rugby Union" },
    { name: "SM-sarja", country: "Finland", sport: "Rugby Union" },
    { name: "Top 14", country: "France", sport: "Rugby Union" },
    { name: "Pro D2", country: "France", sport: "Rugby Union" },
    { name: "Nationale", country: "France", sport: "Rugby Union" },
    { name: "Didi 10", country: "Georgia", sport: "Rugby Union" },
    { name: "1. Bundesliga", country: "Germany", sport: "Rugby Union" },
    { name: "All Ireland League", country: "Ireland", sport: "Rugby Union" },
    { name: "Serie A Elite", country: "Italy", sport: "Rugby Union" },
    { name: "League One", country: "Japan", sport: "Rugby Union" },
    { name: "Ereklasse", country: "Netherlands", sport: "Rugby Union" },
    { name: "Bunnings NPC", country: "New Zealand", sport: "Rugby Union" },
    { name: "Ekstraliga", country: "Poland", sport: "Rugby Union" },
    { name: "CN Honra", country: "Portugal", sport: "Rugby Union" },
    { name: "Liga Nationala", country: "Romania", sport: "Rugby Union" },
    { name: "Premier League", country: "Russia", sport: "Rugby Union" },
    { name: "Premiership", country: "Scotland", sport: "Rugby Union" },
    { name: "Currie Cup", country: "South Africa", sport: "Rugby Union" },
    { name: "Division de Honor", country: "Spain", sport: "Rugby Union" },
    { name: "Major League Rugby", country: "USA", sport: "Rugby Union" },
    { name: "Super Rygbi Cymru", country: "Wales", sport: "Rugby Union" },

    // --- Hockey (Field Hockey) ---
    // International
    { name: "World Cup", country: "International", sport: "Hockey" },
    { name: "Olympic Games", country: "International", sport: "Hockey" },
    { name: "FIH Pro League", country: "International", sport: "Hockey" },
    { name: "Champions Trophy", country: "International", sport: "Hockey" },
    { name: "EuroHockey Championship", country: "International", sport: "Hockey" },
    // National
    { name: "Hockey One", country: "Australia", sport: "Hockey" },
    { name: "Hockey League", country: "Belgium", sport: "Hockey" },
    { name: "Extraliga", country: "Czech Republic", sport: "Hockey" },
    { name: "Premier Division", country: "England", sport: "Hockey" },
    { name: "Elite League", country: "France", sport: "Hockey" },
    { name: "1. Bundesliga", country: "Germany", sport: "Hockey" },
    { name: "HIL", country: "India", sport: "Hockey" },
    { name: "EYHL", country: "Ireland", sport: "Hockey" },
    { name: "Serie A1", country: "Italy", sport: "Hockey" },
    { name: "Hoofdklasse", country: "Netherlands", sport: "Hockey" },
    { name: "Hokej Superliga", country: "Poland", sport: "Hockey" },
    { name: "Division de Honor", country: "Spain", sport: "Hockey" },

    // --- Basketball ---
    { name: "NBA", country: "USA", sport: "Basketball" },
    { name: "EuroLeague", country: "Europe", sport: "Basketball" },
    { name: "Superliga", country: "Albania", sport: "Basketball" },
    { name: "LNB", country: "Argentina", sport: "Basketball" },
    { name: "Liga Argentina", country: "Argentina", sport: "Basketball" },
    { name: "NBL", country: "Australia", sport: "Basketball" },
    { name: "Superliga", country: "Austria", sport: "Basketball" },
    { name: "NBB", country: "Brazil", sport: "Basketball" },
    { name: "CEBL", country: "Canada", sport: "Basketball" },
    { name: "CBA", country: "China", sport: "Basketball" },
    { name: "Premijer liga", country: "Croatia", sport: "Basketball" },
    { name: "NBL", country: "Czech Republic", sport: "Basketball" },
    { name: "Korisliiga", country: "Finland", sport: "Basketball" },
    { name: "LNB", country: "France", sport: "Basketball" },
    { name: "BBL", country: "Germany", sport: "Basketball" },
    { name: "Basket League", country: "Greece", sport: "Basketball" },
    { name: "Super League", country: "Israel", sport: "Basketball" },
    { name: "Lega A", country: "Italy", sport: "Basketball" },
    { name: "B.League", country: "Japan", sport: "Basketball" },
    { name: "LKL", country: "Lithuania", sport: "Basketball" },
    { name: "LNBP", country: "Mexico", sport: "Basketball" },
    { name: "BNXT League", country: "Netherlands", sport: "Basketball" },
    { name: "NBL", country: "New Zealand", sport: "Basketball" },
    { name: "PBA", country: "Philippines", sport: "Basketball" },
    { name: "PLK", country: "Poland", sport: "Basketball" },
    { name: "LPB", country: "Portugal", sport: "Basketball" },
    { name: "BSN", country: "Puerto Rico", sport: "Basketball" },
    { name: "VTB United League", country: "Russia", sport: "Basketball" },
    { name: "KLS", country: "Serbia", sport: "Basketball" },
    { name: "Liga Nova", country: "Slovenia", sport: "Basketball" },
    { name: "ACB", country: "Spain", sport: "Basketball" },
    { name: "Super Lig", country: "Turkey", sport: "Basketball" },
    { name: "WNBA", country: "USA", sport: "Basketball" },
    { name: "SPB", country: "Venezuela", sport: "Basketball" }
];

const initialTournaments: Tournament[] = fullTournamentList.map((t, index) => ({
    id: (index + 1).toString(),
    name: t.name,
    season: '2024',
    sport: t.sport,
    organizer: t.country || 'International', // Using country as proxy for organizer/region
    status: 'published',
    categories: ['Primera'],
    zones: ['Única'],
    stages: ['Fase Regular'],
    teamsCount: 0,
    teams: [],
    hasFixture: false,
    visibility: 'public',
    country: t.country
}));

// List of sports available to filter
const availableSports = [
    'Todos',
    'Rugby Union',
    'Football',
    'Basketball',
    'Tennis',
    'Hockey',
    'American Football',
    'Volleyball'
];

export default function TorneosPage() {
    const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments);
    const [selectedSport, setSelectedSport] = useState('Todos');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Edit Mode State - Expanded
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Tournament | null>(null);
    const [showTeamManager, setShowTeamManager] = useState(false); // New state

    // Form State for V1 creation
    const [newTournament, setNewTournament] = useState<Partial<Tournament>>({
        name: '',
        season: new Date().getFullYear().toString(),
        sport: 'Rugby Union',
        organizer: '',
        status: 'draft',
        visibility: 'public'
    });

    const filteredTournaments = tournaments.filter(t => {
        const matchesSport = selectedSport === 'Todos' || t.sport === selectedSport;
        const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.organizer.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSport && matchesSearch;
    });

    const handleCreate = () => {
        if (!newTournament.name || !newTournament.sport || !newTournament.organizer) {
            alert("Por favor completa los campos obligatorios: Nombre, Deporte, Organización.");
            return;
        }

        const tournament: Tournament = {
            id: Date.now().toString(),
            name: newTournament.name || 'Nuevo Torneo',
            season: newTournament.season || '2024',
            sport: newTournament.sport || 'Rugby Union',
            organizer: newTournament.organizer || 'Organización',
            status: 'draft',
            categories: ['Primera'],
            zones: ['Única'],
            stages: ['Fase Regular'],
            teamsCount: 0,
            teams: [],
            hasFixture: false,
            visibility: 'public'
        };

        setTournaments([tournament, ...tournaments]);
        setIsModalOpen(false);
        setNewTournament({
            name: '',
            season: new Date().getFullYear().toString(),
            sport: 'Rugby Union',
            organizer: '',
            status: 'draft',
            visibility: 'public'
        });
    };

    const deleteTournament = (id: string) => {
        if (window.confirm('¿Eliminar torneo permanentemente? Esta acción no se puede deshacer.')) {
            setTournaments(tournaments.filter(t => t.id !== id));
        }
    };

    // --- Editing Logic ---
    const startEditing = (t: Tournament) => {
        setEditingId(t.id);
        // Ensure editable object has defaults for new fields
        setEditForm({
            ...t,
            teams: t.teams || [], // Ensure teams array exists
            scoringSystem: t.scoringSystem || { win: 4, draw: 2, loss: 0, bonus: false },
            allowedEvents: t.allowedEvents || { tries: true, goals: true, cards: true, mvp: true }
        });
    };

    const saveEditing = () => {
        if (!editForm) return;

        // Validation Rules:
        if (editForm.status === 'published') {
            // Example Rule: Can't publish without categories or zones
            if (editForm.categories.length === 0 || editForm.zones.length === 0) {
                alert("No se puede publicar un torneo sin Categorías y Zonas definidas.");
                return;
            }
            // Example Rule: Need Scoring System
            if (!editForm.scoringSystem) {
                alert("Define el sistema de puntos antes de publicar.");
                return;
            }
        }

        setTournaments(tournaments.map(t => t.id === editForm.id ? editForm : t));
        setEditingId(null);
        setEditForm(null);
        setShowTeamManager(false);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditForm(null);
        setShowTeamManager(false);
    };

    const updateArrayField = (field: 'categories' | 'zones' | 'stages', index: number, value: string) => {
        if (!editForm) return;
        const newArray = [...editForm[field]];
        newArray[index] = value;
        setEditForm({ ...editForm, [field]: newArray });
    };

    const addArrayItem = (field: 'categories' | 'zones' | 'stages') => {
        if (!editForm) return;
        const singular = field === 'categories' ? 'Categoría' : field === 'zones' ? 'Zona' : 'Etapa';
        setEditForm({ ...editForm, [field]: [...editForm[field], `Nueva ${singular}`] });
    };

    const removeArrayItem = (field: 'categories' | 'zones' | 'stages', index: number) => {
        if (!editForm) return;
        setEditForm({ ...editForm, [field]: editForm[field].filter((_, i) => i !== index) });
    };

    const updatePoints = (key: 'win' | 'draw' | 'loss', value: number) => {
        if (!editForm || !editForm.scoringSystem) return;
        setEditForm({ ...editForm, scoringSystem: { ...editForm.scoringSystem, [key]: value } });
    };

    // Handle Teams Update from Manager
    const handleTeamsUpdate = (newTeams: any[]) => {
        if (!editForm) return;
        setEditForm({ ...editForm, teams: newTeams, teamsCount: newTeams.length });
    };


    // --- Render Editor ---
    if (editingId && editForm) {
        // Sub-view: Team Manager
        if (showTeamManager) {
            return (
                <TeamsManager
                    categories={editForm.categories}
                    zones={editForm.zones}
                    teams={editForm.teams || []}
                    onUpdateTeams={handleTeamsUpdate}
                    onClose={() => setShowTeamManager(false)}
                />
            );
        }

        // Locked fields if published
        const isPublished = editForm.status === 'published';

        return (
            <div className={styles.page}>
                <div className={styles.main} style={{ marginLeft: 0 }}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <h1 className={styles.pageTitle}>Configurar Torneo</h1>
                            <p className={styles.pageSubtitle}>Editando: {editForm.name}</p>
                        </div>
                        <div className={styles.headerRight}>
                            <button
                                className={styles.viewSiteBtn}
                                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', marginRight: '1rem' }}
                                onClick={cancelEditing}
                            >
                                Cancelar
                            </button>
                            <button className={styles.viewSiteBtn} onClick={saveEditing}>
                                Guardar Cambios
                            </button>
                        </div>
                    </div>

                    <div className={styles.content}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
                            {/* Left Column: General Info */}
                            <div className={styles.card} style={{ height: 'fit-content' }}>
                                <div className={styles.cardHeader}>
                                    <h2 className={styles.cardTitle}>1. Identidad (Obligatorio)</h2>
                                </div>
                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div>
                                        <label className={styles.statLabel}>Nombre</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className={styles.input}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.statLabel}>Temporada {isPublished && '🔒'}</label>
                                        <input
                                            disabled={isPublished}
                                            type="text"
                                            value={editForm.season}
                                            onChange={e => setEditForm({ ...editForm, season: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: isPublished ? 'var(--color-text-secondary)' : 'white', cursor: isPublished ? 'not-allowed' : 'text' }}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.statLabel}>Deporte {isPublished && '🔒'}</label>
                                        <input
                                            disabled={isPublished}
                                            type="text"
                                            value={editForm.sport}
                                            onChange={e => setEditForm({ ...editForm, sport: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: isPublished ? 'var(--color-text-secondary)' : 'white', cursor: isPublished ? 'not-allowed' : 'text' }}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.statLabel}>Organizador {isPublished && '🔒'}</label>
                                        <input
                                            disabled={isPublished}
                                            type="text"
                                            value={editForm.organizer}
                                            onChange={e => setEditForm({ ...editForm, organizer: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: isPublished ? 'var(--color-text-secondary)' : 'white', cursor: isPublished ? 'not-allowed' : 'text' }}
                                        />
                                    </div>

                                    <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />

                                    <div>
                                        <label className={styles.statLabel}>Estado</label>
                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                            <button
                                                onClick={() => setEditForm({ ...editForm, status: 'draft' })}
                                                style={{
                                                    flex: 1, padding: '0.8rem', borderRadius: '6px',
                                                    background: editForm.status === 'draft' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                                                    border: '1px solid var(--color-border)', color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Borrador
                                            </button>
                                            <button
                                                onClick={() => setEditForm({ ...editForm, status: 'published' })}
                                                style={{
                                                    flex: 1, padding: '0.8rem', borderRadius: '6px',
                                                    background: editForm.status === 'published' ? '#22c55e' : 'var(--color-bg-tertiary)',
                                                    border: '1px solid var(--color-border)', color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Publicado
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Structure & Rules */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                                {/* 2. Estructura */}
                                <div className={styles.card}>
                                    <div className={styles.cardHeader} style={{ justifyContent: 'space-between', display: 'flex' }}>
                                        <h2 className={styles.cardTitle}>2. Estructura Competitiva {isPublished && '🔒'}</h2>
                                    </div>
                                    <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                                        {/* Categories */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Categorías</h4>
                                                {!isPublished && <button onClick={() => addArrayItem('categories')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.categories.map((cat, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            disabled={isPublished}
                                                            value={cat}
                                                            onChange={(e) => updateArrayField('categories', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        {!isPublished && <button onClick={() => removeArrayItem('categories', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Zones */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Zonas</h4>
                                                {!isPublished && <button onClick={() => addArrayItem('zones')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.zones.map((zone, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            disabled={isPublished}
                                                            value={zone}
                                                            onChange={(e) => updateArrayField('zones', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        {!isPublished && <button onClick={() => removeArrayItem('zones', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Stages */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Etapas</h4>
                                                {!isPublished && <button onClick={() => addArrayItem('stages')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.stages.map((stage, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            value={stage}
                                                            onChange={(e) => updateArrayField('stages', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        <button onClick={() => removeArrayItem('stages', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Reglas de Competencia */}
                                <div className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <h2 className={styles.cardTitle}>4. Reglas de Competencia</h2>
                                    </div>
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {/* Scoring System */}
                                        <div>
                                            <h4 style={{ marginBottom: '0.8rem', color: 'var(--color-text-secondary)' }}>Sistema de Puntos ({editForm.sport}) {isPublished && '🔒'}</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <label className={styles.statLabel} style={{ fontSize: '0.8rem' }}>Victoria</label>
                                                    <input
                                                        type="number"
                                                        disabled={isPublished}
                                                        value={editForm.scoringSystem?.win || 0}
                                                        onChange={e => updatePoints('win', parseInt(e.target.value))}
                                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: isPublished ? 'var(--color-text-secondary)' : 'white' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={styles.statLabel} style={{ fontSize: '0.8rem' }}>Empate</label>
                                                    <input
                                                        type="number"
                                                        disabled={isPublished}
                                                        value={editForm.scoringSystem?.draw || 0}
                                                        onChange={e => updatePoints('draw', parseInt(e.target.value))}
                                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: isPublished ? 'var(--color-text-secondary)' : 'white' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={styles.statLabel} style={{ fontSize: '0.8rem' }}>Derrota</label>
                                                    <input
                                                        type="number"
                                                        disabled={isPublished}
                                                        value={editForm.scoringSystem?.loss || 0}
                                                        onChange={e => updatePoints('loss', parseInt(e.target.value))}
                                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: isPublished ? 'var(--color-text-secondary)' : 'white' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={styles.statLabel} style={{ fontSize: '0.8rem' }}>Bonus?</label>
                                                    <div style={{ padding: '0.5rem', display: 'flex', alignItems: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            disabled={isPublished}
                                                            checked={editForm.scoringSystem?.bonus || false}
                                                            onChange={e => setEditForm({ ...editForm, scoringSystem: { ...editForm.scoringSystem!, bonus: e.target.checked } })}
                                                            style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Allowed Events */}
                                        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />
                                        <div>
                                            <h4 style={{ marginBottom: '0.8rem', color: 'var(--color-text-secondary)' }}>6. Eventos Habilitados</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                {Object.entries({
                                                    tries: 'Tries',
                                                    goals: 'Goles',
                                                    cards: 'Tarjetas',
                                                    mvp: 'MVP'
                                                }).map(([key, label]) => (
                                                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(editForm.allowedEvents as any)?.[key] || false}
                                                            onChange={e => setEditForm({
                                                                ...editForm,
                                                                allowedEvents: { ...editForm.allowedEvents, [key]: e.target.checked }
                                                            })}
                                                        />
                                                        {label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div className={styles.card} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '2rem' }}>👥</span>
                                        <h3 style={{ marginTop: '0.5rem' }}>3. Equipos</h3>
                                        <p style={{ color: 'var(--color-text-secondary)', margin: '0.5rem 0' }}>
                                            {editForm.teamsCount} equipos asignados
                                        </p>
                                        <button
                                            onClick={() => setShowTeamManager(true)}
                                            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', color: 'white' }}
                                        >
                                            Administrar Equipos
                                        </button>
                                    </div>

                                    <div className={styles.card} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '2rem' }}>📅</span>
                                        <h3 style={{ marginTop: '0.5rem' }}>5. Fixture</h3>
                                        <p style={{ color: 'var(--color-text-secondary)', margin: '0.5rem 0' }}>
                                            {editForm.hasFixture ? 'Fixture generado ✅' : 'Sin fixture ⚠️'}
                                        </p>
                                        <button style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', color: 'white' }}>Ir a Partidos</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Torneos</h1>
                        <p className={styles.pageSubtitle}>
                            {filteredTournaments.length} torneos encontrados
                        </p>
                    </div>
                    <div className={styles.headerRight}>
                        <input
                            type="text"
                            placeholder="Buscar torneo..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                padding: '0.6rem 1rem',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-tertiary)',
                                color: 'white',
                                marginRight: '1rem',
                                width: '200px'
                            }}
                        />
                        <select
                            value={selectedSport}
                            onChange={(e) => setSelectedSport(e.target.value)}
                            style={{
                                padding: '0.6rem 1rem',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-tertiary)',
                                color: 'white',
                                marginRight: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            {availableSports.map(s => (
                                <option key={s} value={s}>{s === 'Todos' ? 'Todos los Deportes' : s}</option>
                            ))}
                        </select>
                        <button className={styles.viewSiteBtn} onClick={() => setIsModalOpen(true)}>
                            + Crear Torneo
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.grid}>
                        {filteredTournaments.map(tournament => (
                            <div key={tournament.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <h2 className={styles.cardTitle}>{tournament.name}</h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            <span>{tournament.season}</span>
                                            <span>•</span>
                                            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{tournament.sport}</span>
                                        </div>
                                    </div>
                                    <span className={styles.badge} style={{
                                        background: tournament.status === 'published' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                        color: tournament.status === 'published' ? '#22c55e' : '#ca8a04'
                                    }}>
                                        {tournament.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
                                    </span>
                                </div>
                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                                        <div>
                                            <span style={{ color: 'var(--color-text-tertiary)' }}>Región / Org</span>
                                            <div style={{ fontWeight: 600 }}>{tournament.organizer}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-tertiary)' }}>Equipos</span>
                                            <div style={{ fontWeight: 600 }}>{tournament.teamsCount}</div>
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.85rem', marginTop: '5px' }}>
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>Estructura: </span>
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                            {tournament.categories.length} Cat, {tournament.stages.length} Fase{tournament.stages.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                        <button
                                            className={styles.btn}
                                            style={{ flex: 1, fontSize: '0.9rem', padding: '0.6rem' }}
                                            onClick={() => startEditing(tournament)}
                                        >
                                            ⚙️ Configurar
                                        </button>
                                        <button
                                            className={styles.btn}
                                            style={{ flex: 1, fontSize: '0.9rem', padding: '0.6rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-error)' }}
                                            onClick={() => deleteTournament(tournament.id)}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {filteredTournaments.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-tertiary)' }}>
                            No se encontraron torneos para {selectedSport} con los filtros actuales.
                        </div>
                    )}
                </div>

                {/* Create Tournament Modal */}
                {isModalOpen && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <div className={styles.card} style={{ width: '500px', maxWidth: '90%', padding: '0', background: 'var(--color-bg-secondary)' }}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>Nuevo Torneo</h2>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                            </div>
                            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                                <div className={styles.section}>
                                    <label className={styles.statLabel}>Nombre del Torneo *</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Torneo Oficial URC 2026"
                                        value={newTournament.name}
                                        onChange={e => setNewTournament({ ...newTournament, name: e.target.value })}
                                        style={{ padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className={styles.section}>
                                        <label className={styles.statLabel}>Temporada *</label>
                                        <input
                                            type="text"
                                            value={newTournament.season}
                                            onChange={e => setNewTournament({ ...newTournament, season: e.target.value })}
                                            style={{ padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                        />
                                    </div>
                                    <div className={styles.section}>
                                        <label className={styles.statLabel}>Deporte *</label>
                                        <select
                                            value={newTournament.sport}
                                            onChange={e => setNewTournament({ ...newTournament, sport: e.target.value })}
                                            style={{ padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                        >
                                            <option value="Rugby Union">Rugby Union</option>
                                            <option value="Football">Football</option>
                                            <option value="Basketball">Basketball</option>
                                            <option value="Hockey">Hockey</option>
                                            <option value="Tennis">Tennis</option>
                                            <option value="Volleyball">Volleyball</option>
                                            <option value="American Football">American Football</option>
                                            <option value="Golf">Golf</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.section}>
                                    <label className={styles.statLabel}>Organización Responsable *</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: URBA, UAR, FAA"
                                        value={newTournament.organizer}
                                        onChange={e => setNewTournament({ ...newTournament, organizer: e.target.value })}
                                        style={{ padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                    />
                                </div>

                                <button className={styles.viewSiteBtn} style={{ justifyContent: 'center', marginTop: '1rem' }} onClick={handleCreate}>
                                    Confirmar y Crear
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
