'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';

// Mock Data Types
interface Sport {
    id: string;
    name: string;
    icon: string;
    url: string; // Added url property
    active: boolean; // Added active status
}

interface Country {
    id: string;
    name: string;
    code: string;
    flag: string;
    region: string;
}

interface Union {
    id: string;
    name: string;
    country: string;
    sport: string;
}

// Initial Mock Data with MORE Real Data
// Using icons based on name where possible, defaulting to generic sport ball
const initialSports: Sport[] = [
    { id: "1", name: "Football", url: "/football/", icon: "⚽", active: true },
    { id: "2", name: "Tennis", url: "/tennis/", icon: "🎾", active: true },
    { id: "3", name: "Basketball", url: "/basketball/", icon: "🏀", active: true },
    { id: "4", name: "Hockey", url: "/hockey/", icon: "🏒", active: true }, // Ice/Field often same icon generic, using ice hockey stick
    { id: "23", name: "Golf", url: "/golf/", icon: "⛳", active: false },
    { id: "15", name: "Snooker", url: "/snooker/", icon: "🎱", active: false },
    { id: "5", name: "Am. football", url: "/american-football/", icon: "🏈", active: true },
    { id: "12", name: "Volleyball", url: "/volleyball/", icon: "🏐", active: true },
    { id: "18", name: "Aussie rules", url: "/aussie-rules/", icon: "🏉", active: false },
    { id: "21", name: "Badminton", url: "/badminton/", icon: "🏸", active: false },
    { id: "10", name: "Bandy", url: "/bandy/", icon: "🏑", active: false },
    { id: "6", name: "Baseball", url: "/baseball/", icon: "⚾", active: true },
    { id: "26", name: "Beach soccer", url: "/beach-soccer/", icon: "🏖️", active: false },
    { id: "17", name: "Beach volleyball", url: "/beach-volleyball/", icon: "🏐", active: false },
    { id: "16", name: "Boxing", url: "/boxing/", icon: "🥊", active: true },
    { id: "13", name: "Cricket", url: "/cricket/", icon: "🏏", active: true },
    { id: "34", name: "Cycling", url: "/cycling/", icon: "🚴", active: false },
    { id: "14", name: "Darts", url: "/darts/", icon: "🎯", active: false },
    { id: "36", name: "eSports", url: "/esports/", icon: "🎮", active: true },
    { id: "24", name: "Field hockey", url: "/field-hockey/", icon: "🏑", active: true },
    { id: "9", name: "Floorball", url: "/floorball/", icon: "🏑", active: false },
    { id: "11", name: "Futsal", url: "/futsal/", icon: "⚽", active: false },
    { id: "7", name: "Handball", url: "/handball/", icon: "🤾", active: true },
    { id: "35", name: "Horse racing", url: "/horse-racing/", icon: "🐎", active: false },
    { id: "42", name: "Kabaddi", url: "/kabaddi/", icon: "🤼", active: false },
    { id: "28", name: "MMA", url: "/mma/", icon: "🥋", active: true },
    { id: "31", name: "Motorsport", url: "/motorsport/", icon: "🏎️", active: false },
    { id: "29", name: "Netball", url: "/netball/", icon: "🏐", active: false },
    { id: "30", name: "Pesäpallo", url: "/pesapallo/", icon: "⚾", active: false },
    { id: "19", name: "Rugby League", url: "/rugby-league/", icon: "🏉", active: false },
    { id: "8", name: "Rugby Union", url: "/rugby-union/", icon: "🏉", active: true },
    { id: "25", name: "Table tennis", url: "/table-tennis/", icon: "🏓", active: false },
    { id: "22", name: "Water polo", url: "/water-polo/", icon: "🤽", active: false },
    { id: "37", name: "Winter Sports", url: "/winter-sports/", icon: "⛷️", active: false }
];

const initialCountries: Country[] = [
    { id: '1', name: 'Argentina', code: 'AR', flag: '🇦🇷', region: 'Sudamérica' },
    { id: '2', name: 'Uruguay', code: 'UY', flag: '🇺🇾', region: 'Sudamérica' },
    { id: '3', name: 'Chile', code: 'CL', flag: '🇨🇱', region: 'Sudamérica' },
    { id: '4', name: 'Brasil', code: 'BR', flag: '🇧🇷', region: 'Sudamérica' },
    { id: '5', name: 'Paraguay', code: 'PY', flag: '🇵🇾', region: 'Sudamérica' },
];

const initialUnions: Union[] = [
    { id: '1', name: 'UAR', country: 'Argentina', sport: 'Rugby Union' },
    { id: '2', name: 'URBA', country: 'Argentina', sport: 'Rugby Union' },
    { id: '3', name: 'AUF', country: 'Uruguay', sport: 'Fútbol' },
    { id: '4', name: 'AFA', country: 'Argentina', sport: 'Fútbol' },
    { id: '5', name: 'CAH', country: 'Argentina', sport: 'Hockey' },
    { id: '6', name: 'FAA', country: 'Argentina', sport: 'Fútbol Americano' },
];

type Tab = 'sports' | 'countries' | 'unions';

export default function GlobalEntitiesPage() {
    const [activeTab, setActiveTab] = useState<Tab>('sports');
    const [sports, setSports] = useState(initialSports);
    const [countries, setCountries] = useState(initialCountries);
    const [unions, setUnions] = useState(initialUnions);

    const handleAddSport = () => {
        const name = window.prompt('Nombre del deporte:');
        if (!name) return;
        const icon = window.prompt('Icono (emoji):') || '❓';
        setSports([...sports, { id: Date.now().toString(), name, icon, url: `/${name.toLowerCase().replace(/\s+/g, '-')}/`, active: true }]);
    };

    const handleAddCountry = () => {
        const name = window.prompt('Nombre del país:');
        if (!name) return;
        const code = window.prompt('Código ISO (ej: AR):') || 'XX';
        const flag = window.prompt('Bandera (emoji):') || '🏳️';
        const region = window.prompt('Región:') || 'Global';
        setCountries([...countries, { id: Date.now().toString(), name, code, flag, region }]);
    };

    const handleAddUnion = () => {
        const name = window.prompt('Nombre de la Unión/Federación:');
        if (!name) return;
        const country = window.prompt('País:') || 'Global';
        const sport = window.prompt('Deporte:') || 'General';
        setUnions([...unions, { id: Date.now().toString(), name, country, sport }]);
    };

    const handleDelete = (id: string, type: Tab) => {
        if (!window.confirm('¿Estás seguro de eliminar este elemento?')) return;
        if (type === 'sports') setSports(sports.filter(s => s.id !== id));
        if (type === 'countries') setCountries(countries.filter(s => s.id !== id));
        if (type === 'unions') setUnions(unions.filter(s => s.id !== id));
    };

    const toggleSportActive = (id: string) => {
        setSports(sports.map(s => s.id === id ? { ...s, active: !s.active } : s));
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Entidades Globales</h1>
                        <p className={styles.pageSubtitle}>Gestión de deportes, países y federaciones</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button
                            className={styles.viewSiteBtn}
                            onClick={activeTab === 'sports' ? handleAddSport : activeTab === 'countries' ? handleAddCountry : handleAddUnion}
                        >
                            + Nuevo {activeTab === 'sports' ? 'Deporte' : activeTab === 'countries' ? 'País' : 'Unión'}
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        <button
                            onClick={() => setActiveTab('sports')}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                background: activeTab === 'sports' ? 'var(--color-accent)' : 'transparent',
                                color: activeTab === 'sports' ? 'white' : 'var(--color-text-secondary)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.95rem'
                            }}
                        >
                            Deportes
                        </button>
                        <button
                            onClick={() => setActiveTab('countries')}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                background: activeTab === 'countries' ? 'var(--color-accent)' : 'transparent',
                                color: activeTab === 'countries' ? 'white' : 'var(--color-text-secondary)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.95rem'
                            }}
                        >
                            Países
                        </button>
                        <button
                            onClick={() => setActiveTab('unions')}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                background: activeTab === 'unions' ? 'var(--color-accent)' : 'transparent',
                                color: activeTab === 'unions' ? 'white' : 'var(--color-text-secondary)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.95rem'
                            }}
                        >
                            Uniones
                        </button>
                    </div>

                    {/* Table Area */}
                    <div className={styles.card}>
                        {activeTab === 'sports' && (
                            <div className={styles.activityList}>
                                {sports.map(sport => (
                                    <div key={sport.id} className={styles.activityItem} style={{ alignItems: 'center' }}>
                                        <div className={styles.activityIcon} style={{ fontSize: '1.5rem', background: 'var(--color-bg-tertiary)', opacity: sport.active ? 1 : 0.5 }}>
                                            {sport.icon}
                                        </div>
                                        <div className={styles.activityContent}>
                                            <div className={styles.activityMessage} style={{ fontSize: '1rem', color: sport.active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                                {sport.name}
                                                {!sport.active && <span className={styles.badge} style={{ marginLeft: '10px', fontSize: '0.7em', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>Inactivo</span>}
                                            </div>
                                            <div className={styles.activityMeta}>ID: {sport.id} • URL: {sport.url}</div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={sport.active}
                                                    onChange={() => toggleSportActive(sport.id)}
                                                    style={{ width: '16px', height: '16px' }}
                                                />
                                                Activo
                                            </label>
                                            <button onClick={() => handleDelete(sport.id, 'sports')} className={styles.btn} style={{ color: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.4rem 0.8rem' }}>Eliminar</button>
                                        </div>
                                    </div>
                                ))}
                                {sports.length === 0 && <div className={styles.activityItem}>No hay deportes registrados.</div>}
                            </div>
                        )}

                        {activeTab === 'countries' && (
                            <div className={styles.activityList}>
                                {countries.map(country => (
                                    <div key={country.id} className={styles.activityItem} style={{ alignItems: 'center' }}>
                                        <div className={styles.activityIcon} style={{ fontSize: '1.5rem', background: 'var(--color-bg-tertiary)' }}>{country.flag}</div>
                                        <div className={styles.activityContent}>
                                            <div className={styles.activityMessage} style={{ fontSize: '1rem' }}>{country.name} <span style={{ fontSize: '0.8em', color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>({country.code})</span></div>
                                            <div className={styles.activityMeta}>{country.region}</div>
                                        </div>
                                        <button onClick={() => handleDelete(country.id, 'countries')} className={styles.btn} style={{ color: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.4rem 0.8rem' }}>Eliminar</button>
                                    </div>
                                ))}
                                {countries.length === 0 && <div className={styles.activityItem}>No hay países registrados.</div>}
                            </div>
                        )}

                        {activeTab === 'unions' && (
                            <div className={styles.activityList}>
                                {unions.map(union => (
                                    <div key={union.id} className={styles.activityItem} style={{ alignItems: 'center' }}>
                                        <div className={`${styles.activityIcon}`} style={{ fontSize: '1.2rem', background: 'var(--color-bg-tertiary)' }}>🏢</div>
                                        <div className={styles.activityContent}>
                                            <div className={styles.activityMessage} style={{ fontSize: '1rem' }}>{union.name}</div>
                                            <div className={styles.activityMeta}>{union.sport} • {union.country}</div>
                                        </div>
                                        <button onClick={() => handleDelete(union.id, 'unions')} className={styles.btn} style={{ color: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.4rem 0.8rem' }}>Eliminar</button>
                                    </div>
                                ))}
                                {unions.length === 0 && <div className={styles.activityItem}>No hay uniones registradas.</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
