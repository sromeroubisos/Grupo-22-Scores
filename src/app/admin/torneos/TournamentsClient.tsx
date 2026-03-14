'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import TeamsManager from './TeamsManager';
import { supabase } from '@/lib/supabase';
import { syncTournamentsAction } from './actions';

export interface Tournament {
    id: string;
    // 1. Identidad
    name: string;
    display_name?: string | null;
    logo_url?: string | null;
    custom_logo_url?: string | null;
    original_name?: string | null;
    original_logo_url?: string | null;
    is_api_managed?: boolean;
    
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

// Full tournament list removed to resolve lint warnings

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

export default function TournamentsClient() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedSport, setSelectedSport] = useState('Todos');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchTournaments();
    }, []);

    const fetchTournaments = async () => {
        try {
            const { data, error } = await supabase
                .from('tournaments')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            // Map database tournament back to UI structure
            const mapped: Tournament[] = (data || []).map(t => ({
                id: t.id,
                name: t.name,
                season: 'N/A', // Data not in table?
                sport: t.sport_id || 'Rugby Union',
                organizer: t.country_id || 'N/A',
                status: (t.status as Tournament['status']) || 'published',
                categories: [],
                zones: [],
                stages: [],
                teamsCount: 0,
                teams: [],
                hasFixture: false,
                visibility: 'public',
                country: t.country_id || undefined,
                is_api_managed: t.is_api_managed
            }));

            setTournaments(mapped);
        } catch (error) {
            console.error('Error fetching tournaments:', error);
        }
    };

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await syncTournamentsAction();
            if (res.success) {
                alert(`Sincronización completada!`);
                await fetchTournaments();
            } else {
                alert(`Error: ${res.error}`);
            }
        } catch (e: unknown) {
            alert(`Exception: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsSyncing(false);
        }
    };

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
            (t.organizer && t.organizer.toLowerCase().includes(searchQuery.toLowerCase()));
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

    const saveEditing = async () => {
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

        try {
            const { error } = await supabase
                .from('tournaments')
                .update({
                    name: editForm.name,
                    display_name: editForm.display_name,
                    custom_logo_url: editForm.custom_logo_url,
                    logo_url: editForm.logo_url,
                    status: editForm.status
                })
                .eq('id', editForm.id);

            if (error) {
                console.error("Save error:", error);
                alert("Error guardando cambios.");
                return;
            }

            setTournaments(tournaments.map(t => t.id === editForm.id ? editForm : t));
            setEditingId(null);
            setEditForm(null);
            setShowTeamManager(false);
            
            // Reload the list to get fresh data
            fetchTournaments();
        } catch (e: unknown) {
            alert(`Exception: ${e instanceof Error ? e.message : String(e)}`);
        }
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

    const handleTeamsUpdate = (newTeams: Tournament['teams']) => {
        if (!editForm) return;
        setEditForm({ ...editForm, teams: newTeams, teamsCount: newTeams.length });
    };

    if (editingId && editForm) {
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
                        {editForm.is_api_managed && (
                            <div style={{ 
                                background: 'rgba(59, 130, 246, 0.1)', 
                                border: '1px solid #3b82f6', 
                                padding: '1rem', 
                                borderRadius: '8px', 
                                marginBottom: '2rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                color: '#93c5fd'
                            }}>
                                <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
                                <div>
                                    <strong>Torneo gestionado por la API</strong>
                                    <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>La estructura (categorías, zonas, etapas) y los metadatos base están sincronizados automáticamente. Puedes editar el nombre para mostrar y el estado.</p>
                                </div>
                            </div>
                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
                            <div className={styles.card} style={{ height: 'fit-content' }}>
                                <div className={styles.cardHeader}>
                                    <h2 className={styles.cardTitle}>1. Identidad (Obligatorio)</h2>
                                </div>
                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    {editForm.is_api_managed ? (
                                        <>
                                            <div>
                                                <label className={styles.statLabel} style={{ color: 'var(--color-text-secondary)' }}>
                                                    Nombre original API 🔒
                                                </label>
                                                <input
                                                    disabled
                                                    type="text"
                                                    value={editForm.original_name || editForm.name}
                                                    className={styles.input}
                                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }}
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.statLabel} style={{ color: '#60a5fa' }}>
                                                    Nombre visible en web (Override)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editForm.display_name || ''}
                                                    onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
                                                    className={styles.input}
                                                    placeholder={editForm.original_name || editForm.name}
                                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid #3b82f6', borderRadius: '6px', color: 'white' }}
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.statLabel} style={{ color: 'var(--color-text-secondary)' }}>
                                                    Logo original API 🔒
                                                </label>
                                                <input
                                                    disabled
                                                    type="text"
                                                    value={editForm.original_logo_url || editForm.logo_url || ''}
                                                    className={styles.input}
                                                    placeholder="Sin logo original"
                                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }}
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.statLabel} style={{ color: '#60a5fa' }}>
                                                    Logo visible en web (Override URL)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editForm.custom_logo_url || ''}
                                                    onChange={e => setEditForm({ ...editForm, custom_logo_url: e.target.value })}
                                                    className={styles.input}
                                                    placeholder="URL del logo opcional"
                                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid #3b82f6', borderRadius: '6px', color: 'white' }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
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
                                                <label className={styles.statLabel}>Logo URL</label>
                                                <input
                                                    type="text"
                                                    value={editForm.logo_url || ''}
                                                    onChange={e => setEditForm({ ...editForm, logo_url: e.target.value })}
                                                    className={styles.input}
                                                    style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <label className={styles.statLabel}>Temporada {(isPublished || editForm.is_api_managed) && '🔒'}</label>
                                        <input
                                            disabled={isPublished || !!editForm.is_api_managed}
                                            type="text"
                                            value={editForm.season}
                                            onChange={e => setEditForm({ ...editForm, season: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: (isPublished || editForm.is_api_managed) ? 'var(--color-text-secondary)' : 'white', cursor: (isPublished || editForm.is_api_managed) ? 'not-allowed' : 'text' }}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.statLabel}>Deporte {(isPublished || editForm.is_api_managed) && '🔒'}</label>
                                        <input
                                            disabled={isPublished || !!editForm.is_api_managed}
                                            type="text"
                                            value={editForm.sport}
                                            onChange={e => setEditForm({ ...editForm, sport: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: (isPublished || editForm.is_api_managed) ? 'var(--color-text-secondary)' : 'white', cursor: (isPublished || editForm.is_api_managed) ? 'not-allowed' : 'text' }}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.statLabel}>Organizador {(isPublished || editForm.is_api_managed) && '🔒'}</label>
                                        <input
                                            disabled={isPublished || !!editForm.is_api_managed}
                                            type="text"
                                            value={editForm.organizer}
                                            onChange={e => setEditForm({ ...editForm, organizer: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: (isPublished || editForm.is_api_managed) ? 'var(--color-text-secondary)' : 'white', cursor: (isPublished || editForm.is_api_managed) ? 'not-allowed' : 'text' }}
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

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div className={styles.card}>
                                    <div className={styles.cardHeader} style={{ justifyContent: 'space-between', display: 'flex' }}>
                                        <h2 className={styles.cardTitle}>2. Estructura Competitiva {(isPublished || editForm.is_api_managed) && '🔒'}</h2>
                                    </div>
                                    <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Categorías</h4>
                                                {!isPublished && !editForm.is_api_managed && <button onClick={() => addArrayItem('categories')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.categories.map((cat, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            disabled={isPublished || !!editForm.is_api_managed}
                                                            value={cat}
                                                            onChange={(e) => updateArrayField('categories', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        {!isPublished && !editForm.is_api_managed && <button onClick={() => removeArrayItem('categories', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Zonas</h4>
                                                {!isPublished && !editForm.is_api_managed && <button onClick={() => addArrayItem('zones')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.zones.map((zone, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            disabled={isPublished || !!editForm.is_api_managed}
                                                            value={zone}
                                                            onChange={(e) => updateArrayField('zones', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        {!isPublished && !editForm.is_api_managed && <button onClick={() => removeArrayItem('zones', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Etapas</h4>
                                                {!isPublished && !editForm.is_api_managed && <button onClick={() => addArrayItem('stages')} style={{ cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '3px', width: '20px' }}>+ </button>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {editForm.stages.map((stage, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input
                                                            disabled={isPublished || !!editForm.is_api_managed}
                                                            value={stage}
                                                            onChange={(e) => updateArrayField('stages', idx, e.target.value)}
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                        {!isPublished && !editForm.is_api_managed && <button onClick={() => removeArrayItem('stages', idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>×</button>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <h2 className={styles.cardTitle}>4. Reglas de Competencia</h2>
                                    </div>
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                                                            checked={editForm.allowedEvents?.[key as keyof NonNullable<Tournament['allowedEvents']>] || false}
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
                        <button 
                            className={styles.viewSiteBtn} 
                            onClick={handleSync}
                            disabled={isSyncing}
                            style={{ 
                                background: isSyncing ? 'var(--color-bg-tertiary)' : 'var(--color-accent)',
                                opacity: isSyncing ? 0.7 : 1,
                                marginRight: '1rem' 
                            }}
                        >
                            {isSyncing ? '⌛ Sincronizando...' : '🔄 Sincronizar Datos'}
                        </button>
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
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span className={styles.badge} style={{
                                            background: tournament.status === 'published' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                            color: tournament.status === 'published' ? '#22c55e' : '#ca8a04'
                                        }}>
                                            {tournament.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
                                        </span>
                                        {tournament.is_api_managed && (
                                            <span className={styles.badge} style={{
                                                background: 'rgba(59, 130, 246, 0.15)',
                                                color: '#3b82f6'
                                            }}>
                                                API
                                            </span>
                                        )}
                                    </div>
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
