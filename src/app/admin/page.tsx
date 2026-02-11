'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/mock-db';
import mammoth from 'mammoth';

export default function AdminDashboard() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams?.get('tab') || 'dashboard');
    const [myTournaments, setMyTournaments] = useState<any[]>([]);
    const [myUnions, setMyUnions] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [createClubMode, setCreateClubMode] = useState<'none' | 'selection' | 'quick' | 'import'>('none');
    const [reportTab, setReportTab] = useState<'noticias' | 'resumen' | 'boletin_oficial' | 'eventos'>('noticias');
    const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
    const [generatedBulletin, setGeneratedBulletin] = useState<any>(null);
    const [activeReportId, setActiveReportId] = useState('n1');

    // Discipline Functional State
    const [disciplineTourFilter, setDisciplineTourFilter] = useState('Todos los torneos');
    const [disciplineSearch, setDisciplineSearch] = useState('');
    const [tourSubTabs, setTourSubTabs] = useState<Record<string, string>>({}); // { tourId: activeTab }
    const [isUploading, setIsUploading] = useState(false);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, tourId: string) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    const html = result.value;

                    const existingIdx = db.regulations.findIndex(r => r.scopeId === tourId);
                    if (existingIdx >= 0) {
                        db.regulations[existingIdx].content = html;
                        db.regulations[existingIdx].updatedAt = new Date().toISOString();
                    } else {
                        db.regulations.push({
                            id: Math.random().toString(36).substr(2, 9),
                            scopeType: 'tournament',
                            scopeId: tourId,
                            content: html,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    setTourSubTabs(prev => ({ ...prev })); // Force re-render
                } catch (err) {
                    console.error("Conversion error:", err);
                    alert("Error interpretando el archivo Word.");
                } finally {
                    setIsUploading(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Upload error:", error);
            setIsUploading(false);
        }
    };

    // Quick Create State
    const [quickClubName, setQuickClubName] = useState('');

    const reportNews = [
        { id: 'n1', status: 'published', title: 'Sanciones Disciplinarias - Fecha 4 - Bloque Regional', time: 'Hace 2 horas', ref: 'UC-992' },
        { id: 'n2', status: 'draft', title: 'Cambio de localía: Jockey Club vs Tala RC', time: 'Programado: 14 Feb', ref: 'UC-995' },
        { id: 'n3', status: 'published', title: 'Circular #12: Nuevos protocolos de seguridad', time: 'Hace 2 días', ref: 'UC-980' },
    ];

    const reportNotes = [
        { id: 'nt1', date: '2026-02-10', category: 'Disciplinario', title: 'Resolución Exp. DIS-9021', content: 'Sanción de 4 semanas al jugador R. Dupont por tackle alto.' },
        { id: 'nt2', date: '2026-02-09', category: 'Competición', title: 'Cambio de horario Fecha 5', content: 'Los partidos de Primera pasan a las 16:30 hs por altas temperaturas.' },
        { id: 'nt3', date: '2026-02-08', category: 'Prensa', title: 'Lanzamiento Academia Juvenil', content: 'Inauguración del nuevo centro de alto rendimiento.' },
        { id: 'nt4', date: '2026-02-07', category: 'Tesorería', title: 'Aranceles 2026', content: 'Publicación de los nuevos valores de afiliación anual.' },
    ];

    const handleAutoGenerateBulletin = () => {
        // Mocking real data extraction from DB
        const bulletin = {
            number: "BO-005/2026",
            date: new Date().toLocaleDateString(),
            organ: 'Consejo Directivo / Secretaría Unión',
            sanctions: [
                { player: 'R. Dupont', club: 'Dogos XV', period: '4 semanas', detail: 'Tackle alto Regla 9.13' },
                { player: 'T. Lavanini', club: 'Tala RC', period: '2 semanas', detail: 'Doble Tarjeta Amarilla' }
            ],
            results: [
                {
                    league: 'Primera División - Fecha 4', games: [
                        { home: 'Jockey CC', away: 'Tala RC', score: '24 - 18', status: 'Confirmado' },
                        { home: 'La Tablada', away: 'Urú Curé', score: '31 - 25', status: 'Confirmado' },
                        { home: 'Palermo Bajo', away: 'Athletic', score: '12 - 45', status: 'Confirmado' }
                    ]
                }
            ],
            standings: [
                {
                    league: 'Primera División', teams: [
                        { pos: 1, name: 'Athletic', pts: 18, pj: 4, pg: 4 },
                        { pos: 2, name: 'Tala RC', pts: 14, pj: 4, pg: 3 },
                        { pos: 3, name: 'Jockey CC', pts: 13, pj: 4, pg: 3 }
                    ]
                }
            ],
            stats: [
                {
                    title: 'Máximos Anotadores (Goleadores)', data: [
                        { player: 'Facundo Panceira', club: 'Tala RC', val: '42 pts' },
                        { player: 'Santiago Carreras', club: 'Athletic', val: '38 pts' }
                    ]
                },
                {
                    title: 'Tryman (Líderes de Tries)', data: [
                        { player: 'Juan Cappielllo', club: 'Pucará', val: '6 tries' },
                        { player: 'Mateo Soler', club: 'Tala RC', val: '5 tries' }
                    ]
                }
            ],
            nextFixtures: [
                {
                    date: 'Sábado 17 Feb', league: 'Primera División - Fecha 5', matchups: [
                        { time: '16:30', h: 'Athletic', a: 'Jockey CC', ref: 'S. Galán' },
                        { time: '16:30', h: 'Urú Curé', a: 'Palermo Bajo', ref: 'M. Pettina' }
                    ]
                }
            ],
            admin: [
                { title: 'Aranceles 2026', status: 'Publicados', detail: 'Disponibles en el portal de tesorería.' }
            ]
        };
        setGeneratedBulletin(bulletin);
        setReportTab('boletin_oficial');
    };

    const reportEvents = [
        { id: 'e1', day: '14', month: 'FEB', title: 'Cierre de Inscripciones - Refuerzos Verano', place: 'Sede Central • 18:00' },
        { id: 'e2', day: '15', month: 'FEB', title: 'Clínica de Scrum para Referees M19', place: 'Club La Tablada • 10:00' },
    ];

    const activeReport = reportNews.find((item) => item.id === activeReportId) || reportNews[0];

    useEffect(() => {
        if (!user) return;
        const memberships = db.memberships.filter(m => m.userId === user.id);
        const unions = memberships.filter(m => m.scopeType === 'union').map(m => db.unions.find(u => u.id === m.scopeId)).filter(Boolean);
        const tournaments = db.tournaments; // For Monolith view, showing all

        setMyUnions(unions);
        setMyTournaments(tournaments);
    }, [user]);

    const filteredTournaments = myTournaments.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <style jsx global>{`
                /* --- Obsidian Monolith Theme (Integrated) --- */
                :root {
                    --bg-obsidian: #030406;
                    --surface-basalt: #0a0c10;
                    --surface-glass: rgba(15, 18, 24, 0.7);
                    --accent-bio: #00ff9d;
                    --accent-bio-glow: rgba(0, 255, 157, 0.4);
                    --accent-bio-dim: rgba(0, 255, 157, 0.1);
                    --accent-danger: #ff4757;
                    --accent-warning: #ffa502;
                    --text-main: #f1f5f9;
                    --text-dim: #64748b;
                    --border-glass: rgba(255, 255, 255, 0.05);
                    --sidebar-width: 250px;
                    --header-height: 70px;
                }

                html[data-theme="light"] {
                    --bg-obsidian: #f6f7f9;
                    --surface-basalt: rgba(255, 255, 255, 0.92);
                    --surface-glass: rgba(255, 255, 255, 0.85);
                    --accent-bio: var(--color-accent);
                    --accent-bio-glow: rgba(0, 163, 101, 0.25);
                    --accent-bio-dim: rgba(0, 163, 101, 0.12);
                    --accent-danger: var(--color-error);
                    --accent-warning: var(--color-warning);
                    --text-main: #0f172a;
                    --text-dim: #64748b;
                    --border-glass: rgba(15, 23, 42, 0.12);
                }

                * { box-sizing: border-box; outline: none; }

                body {
                    background-color: var(--bg-obsidian);
                    color: var(--text-main);
                    font-family: 'Inter', sans-serif;
                    overflow: hidden; /* App Shell handles scroll */
                    margin: 0;
                }

                body::before {
                    content: "";
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-image: url("https://www.transparenttextures.com/patterns/carbon-fibre.png");
                    opacity: 0.15;
                    pointer-events: none;
                    z-index: -1;
                }

                html[data-theme="light"] body::before {
                    opacity: 0.04;
                }

                .app-container {
                    display: flex;
                    flex-direction: column;
                    height: calc(100vh - 64px);
                }

                .horizontal-nav {
                    background: var(--surface-basalt);
                    border-bottom: 1px solid var(--border-glass);
                    display: flex;
                    align-items: center;
                    padding: 0 40px;
                    gap: 8px;
                    height: 60px;
                    flex-shrink: 0;
                }

                .nav-item {
                    height: 100%;
                    padding: 0 16px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: var(--text-dim);
                    font-size: 0.9rem;
                    font-weight: 500;
                    transition: all 0.2s;
                    border-bottom: 2px solid transparent;
                }
                .nav-item:hover { color: var(--text-main); background: rgba(255,255,255,0.02); }
                .nav-item.active {
                    color: var(--accent-bio);
                    border-bottom-color: var(--accent-bio);
                    background: transparent;
                }
                .nav-item svg { width: 18px; height: 18px; }

                html[data-theme="light"] .nav-item:hover {
                    background: rgba(15, 23, 42, 0.04);
                }

                .main-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 30px 40px;
                }

                .container-limited { max-width: 1200px; margin: 0 auto; }

                /* --- Grid & Cards (Dashboard A) --- */
                .grid-12 { display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; }
                .span-3 { grid-column: span 3; }
                .glass { background: var(--surface-glass); border: 1px solid var(--border-glass); border-radius: 12px; backdrop-filter: blur(10px); }
                .glass:hover { border-color: rgba(255,255,255,0.1); }

                html[data-theme="light"] .glass:hover { border-color: rgba(15, 23, 42, 0.2); }
                
                .kpi-card { padding: 24px; display: flex; flex-direction: column; gap: 4px; }
                .kpi-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); }
                .kpi-value { font-size: 2.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }

                /* --- Tables & Lists (Dashboard B) --- */
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 16px; color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid var(--border-glass); }
                .data-table td { padding: 16px; border-bottom: 1px solid var(--border-glass); font-size: 0.9rem; }
                
                .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
                .badge-bio { background: var(--accent-bio-dim); color: var(--accent-bio); border: 1px solid var(--accent-bio); }
                .badge-danger { background: rgba(255, 71, 87, 0.1); color: var(--accent-danger); border: 1px solid var(--accent-danger); }
                .badge-neutral { background: var(--border-glass); color: var(--text-dim); }
                .badge-warning { background: rgba(255, 165, 2, 0.1); color: var(--accent-warning); border: 1px solid var(--accent-warning); }

                .module-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .module-title h1 { font-size: 2rem; font-weight: 800; letter-spacing: -1px; margin: 0; }
                .module-title p { color: var(--text-dim); margin: 4px 0 0; }

                /* Pulse Animation */
                @keyframes pulse-live { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
                .pulse-live { display: inline-block; width: 8px; height: 8px; background: var(--accent-danger); border-radius: 50%; margin-right: 8px; animation: pulse-live 2s infinite; }

                /* --- Reportes Panel --- */
                .reportes-panel { display: flex; flex-direction: column; gap: 20px; }
                .reportes-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
                .reportes-title { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .reportes-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
                .reportes-select {
                    background: var(--surface-glass);
                    border: 1px solid var(--border-glass);
                    padding: 8px 14px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                    font-family: 'JetBrains Mono', monospace;
                    color: var(--text-dim);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                .reportes-actions { display: flex; gap: 10px; flex-wrap: wrap; }
                .reportes-btn {
                    height: 38px;
                    padding: 0 16px;
                    border-radius: 10px;
                    border: 1px solid var(--border-glass);
                    background: var(--surface-glass);
                    color: var(--text-main);
                    font-weight: 700;
                    font-size: 0.8rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                }
                .reportes-btn:hover { border-color: rgba(255,255,255,0.2); transform: translateY(-1px); }
                .reportes-btn-primary { background: var(--accent-bio); color: #000; border-color: transparent; }

                .reportes-tabs { display: flex; gap: 24px; border-bottom: 1px solid var(--border-glass); padding-bottom: 2px; }
                .reportes-tab {
                    padding: 8px 2px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--text-dim);
                    background: none;
                    border: none;
                    cursor: pointer;
                    position: relative;
                }
                .reportes-tab.active { color: var(--accent-bio); }
                .reportes-tab.active::after {
                    content: '';
                    position: absolute;
                    left: 0; right: 0; bottom: -2px;
                    height: 2px;
                    background: var(--accent-bio);
                    box-shadow: 0 0 10px var(--accent-bio);
                }

                .reportes-grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: stretch; }
                .reportes-list { display: flex; flex-direction: column; gap: 12px; max-height: 520px; overflow-y: auto; padding-right: 6px; }
                .reportes-card {
                    background: var(--surface-glass);
                    border: 1px solid var(--border-glass);
                    border-radius: 12px;
                    padding: 14px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .reportes-card:hover { border-color: rgba(255,255,255,0.25); transform: translateX(2px); }
                .reportes-card.active { border-color: var(--accent-bio); background: rgba(0, 255, 157, 0.05); }
                .reportes-card h3 { font-size: 0.95rem; font-weight: 600; margin: 6px 0; }
                .reportes-meta { font-size: 0.7rem; color: var(--text-dim); display: flex; justify-content: space-between; }
                .reportes-badge {
                    font-size: 0.6rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    padding: 3px 8px;
                    border-radius: 6px;
                    border: 1px solid var(--border-glass);
                    color: var(--text-dim);
                }
                .reportes-badge.published { border-color: var(--accent-bio); color: var(--accent-bio); }

                .reportes-editor {
                    background: var(--surface-glass);
                    border: 1px solid var(--border-glass);
                    border-radius: 16px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .reportes-editor-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-glass);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    background: rgba(255,255,255,0.02);
                }
                .reportes-editor-body { display: grid; grid-template-columns: 1fr 280px; }
                .reportes-fields { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
                .reportes-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-dim); font-weight: 700; margin-bottom: 6px; }
                .reportes-input {
                    width: 100%;
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid var(--border-glass);
                    background: rgba(255,255,255,0.03);
                    color: var(--text-main);
                }
                .reportes-preview { border-left: 1px solid var(--border-glass); padding: 20px; background: rgba(0,0,0,0.12); display: flex; flex-direction: column; gap: 12px; }
                .reportes-preview-card {
                    height: 200px;
                    border-radius: 18px;
                    border: 1px solid var(--border-glass);
                    background: linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.6));
                    display: flex;
                    align-items: flex-end;
                    padding: 16px;
                    color: var(--text-main);
                    font-size: 0.85rem;
                }

                .reportes-event-list { display: flex; flex-direction: column; gap: 12px; }
                .reportes-event-card {
                    background: var(--surface-glass);
                    border: 1px solid var(--border-glass);
                    border-radius: 12px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }
                .reportes-event-date { text-align: center; font-weight: 800; }
                .reportes-event-date span { display: block; font-size: 0.65rem; color: var(--text-dim); letter-spacing: 0.12em; }

                @media (max-width: 1100px) {
                    .reportes-grid { grid-template-columns: 1fr; }
                    .reportes-editor-body { grid-template-columns: 1fr; }
                    .reportes-preview { border-left: none; border-top: 1px solid var(--border-glass); }
                }

            `}</style>


            <div className="app-container">
                <nav className="horizontal-nav">
                    <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                        Dashboard
                    </div>
                    <div className={`nav-item ${activeTab === 'torneos' ? 'active' : ''}`} onClick={() => setActiveTab('torneos')}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        Torneos
                    </div>
                    <div className={`nav-item ${activeTab === 'clubes' ? 'active' : ''}`} onClick={() => setActiveTab('clubes')}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        Clubes
                    </div>
                    <div className={`nav-item ${activeTab === 'disciplina' ? 'active' : ''}`} onClick={() => setActiveTab('disciplina')}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        Disciplina
                    </div>
                    <div className={`nav-item ${activeTab === 'reportes' ? 'active' : ''}`} onClick={() => setActiveTab('reportes')}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Reportes
                    </div>
                </nav>

                <main className="main-content">
                    <div className="container-limited">

                        {/* === DASHBOARD PRINCIPAL (Dashboard A Content) === */}
                        {activeTab === 'dashboard' && (
                            <div className="animate-fade-in">
                                <div className="module-header">
                                    <div className="module-title">
                                        <h1>Panel Principal</h1>
                                        <p>Visión general de la actividad de la unión.</p>
                                    </div>
                                    <div className="module-actions">
                                        <button className="btn-primary" style={{ background: 'var(--surface-glass)', border: '1px solid var(--accent-bio)', color: 'var(--accent-bio)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>Match Console</button>
                                    </div>
                                </div>

                                {/* KPI ROW */}
                                <div className="grid-12" style={{ marginBottom: '32px' }}>
                                    <div className="glass kpi-card span-3">
                                        <div className="kpi-label">Partidos Activos</div>
                                        <div className="kpi-value">{db.matches.filter(m => m.status !== 'final').length}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-bio)' }}>En curso o programados</div>
                                    </div>
                                    <div className="glass kpi-card span-3">
                                        <div className="kpi-label"><span className="pulse-live"></span>En Vivo</div>
                                        <div className="kpi-value" style={{ color: 'var(--accent-bio)' }}>{db.matches.filter(m => m.status === 'live').length}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Consola abierta</div>
                                    </div>
                                    <div className="glass kpi-card span-3">
                                        <div className="kpi-label">Borradores</div>
                                        <div className="kpi-value">{myTournaments.filter(t => t.status !== 'published').length}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)' }}>Torneos sin publicar</div>
                                    </div>
                                    <div className="glass kpi-card span-3">
                                        <div className="kpi-label">Clubes</div>
                                        <div className="kpi-value">{myUnions.length === 1 ? db.clubs.filter(c => c.unionId === myUnions[0].id).length : db.clubs.length}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Afiliados</div>
                                    </div>
                                </div>

                                {/* RECENT TOURNAMENTS */}
                                <div className="glass" style={{ padding: '0', overflow: 'hidden' }}>
                                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Mis Torneos Recientes</h3>
                                    </div>
                                    <div>
                                        {myTournaments.slice(0, 3).map(t => (
                                            <div key={t.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{t.category} • {t.seasonId}</div>
                                                </div>
                                                <span className={`badge ${t.status === 'published' ? 'badge-bio' : 'badge-warning'}`}>{t.status === 'published' ? 'Activo' : 'Borrador'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* === TORNEOS (Dashboard B) === */}
                        {activeTab === 'torneos' && (
                            <div className="animate-fade-in">
                                <div className="module-header">
                                    <div className="module-title">
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Gestión</div>
                                        <h1>Torneos de la Unión</h1>
                                        <p>Gestión de fixtures, reglamentos y estados.</p>
                                    </div>
                                    <div className="module-actions">
                                        <Link href={`/admin/union/${myUnions[0]?.id || 'u1'}/torneos/crear`} style={{ textDecoration: 'none', background: 'var(--accent-bio)', color: '#000', padding: '10px 20px', borderRadius: '8px', fontWeight: 700 }}>+ Crear Torneo</Link>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', background: 'var(--surface-basalt)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                    <input type="text" placeholder="Buscar torneo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', flex: 1 }} />
                                </div>

                                <div className="grid-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                                    {filteredTournaments.map(t => (
                                        <Link href={`/admin/torneo/${t.id}`} key={t.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <div className="glass" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                                                <span className={`badge ${t.status === 'published' ? 'badge-bio' : 'badge-warning'}`} style={{ marginBottom: '15px', display: 'inline-block' }}>
                                                    {t.status === 'published' ? 'Activo' : 'Borrador'}
                                                </span>
                                                <h3 style={{ fontSize: '1.2rem', marginBottom: '5px' }}>{t.name}</h3>
                                                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{t.seasonId} • {t.sport}</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* === CLUBES (Dashboard B) === */}
                        {activeTab === 'clubes' && (
                            <div className="animate-fade-in">
                                {createClubMode === 'none' ? (
                                    <>
                                        <div className="module-header">
                                            <div className="module-title">
                                                <h1>Padrón de Clubes</h1>
                                                <p>Afiliaciones y categorías.</p>
                                            </div>
                                            <div className="module-actions">
                                                <button
                                                    onClick={() => setCreateClubMode('selection')}
                                                    style={{
                                                        background: 'var(--accent-bio)',
                                                        color: '#000',
                                                        padding: '10px 20px',
                                                        borderRadius: '8px',
                                                        fontWeight: 700,
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
                                                    Nuevo Club
                                                </button>
                                            </div>
                                        </div>
                                        <div className="glass" style={{ padding: 0 }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Club</th>
                                                        <th>Región</th>
                                                        <th>Estado</th>
                                                        <th>Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {db.clubs.map(c => (
                                                        <tr key={c.id}>
                                                            <td><strong>{c.name}</strong></td>
                                                            <td>{c.city || 'N/A'}</td>
                                                            <td><span className="badge badge-bio">Afiliado</span></td>
                                                            <td><button style={{ background: 'none', border: 'none', color: 'var(--accent-bio)', cursor: 'pointer' }}>Ficha</button></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <div className="animate-fade-in">
                                        <button
                                            onClick={() => setCreateClubMode('none')}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}
                                        >
                                            ← Volver al Padrón
                                        </button>

                                        {createClubMode === 'selection' && (
                                            <>
                                                <div className="module-header">
                                                    <div className="module-title">
                                                        <h1>Alta de Nueva Institución</h1>
                                                        <p>Seleccione el método de registro.</p>
                                                    </div>
                                                </div>

                                                <div className="grid-12">
                                                    <div className="glass span-3" style={{ padding: '32px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'all 0.2s', border: '1px solid var(--accent-bio)' }}
                                                        onClick={() => window.location.href = `/admin/union/${myUnions[0]?.id || 'u1'}/clubes/crear`}>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-bio-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-bio)' }}>
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                        </div>
                                                        <div>
                                                            <h3 style={{ margin: '0 0 8px 0' }}>Registro Completo</h3>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>Carga detallada de datos institucionales, autoridades, sedes y contacto.</p>
                                                        </div>
                                                        <div style={{ marginTop: 'auto', paddingTop: '16px', color: 'var(--accent-bio)', fontSize: '0.85rem', fontWeight: 600 }}>Ir al Formulario →</div>
                                                    </div>

                                                    <div className="glass span-3" style={{ padding: '32px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'all 0.2s' }}
                                                        onClick={() => setCreateClubMode('quick')}>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,165,2,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-warning)' }}>
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                                                        </div>
                                                        <div>
                                                            <h3 style={{ margin: '0 0 8px 0' }}>Alta Rápida</h3>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>Creación express para competencia. Solo nombre y datos esenciales.</p>
                                                        </div>
                                                        <div style={{ marginTop: 'auto', paddingTop: '16px', color: 'var(--accent-warning)', fontSize: '0.85rem', fontWeight: 600 }}>Iniciar Alta Rápida</div>
                                                    </div>

                                                    <div className="glass span-3" style={{ padding: '32px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'all 0.2s' }}
                                                        onClick={() => setCreateClubMode('import')}>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(0,120,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3399ff' }}>
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                                        </div>
                                                        <div>
                                                            <h3 style={{ margin: '0 0 8px 0' }}>Importar / Afiliar</h3>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>Buscar en la base de datos nacional y solicitar afiliación.</p>
                                                        </div>
                                                        <div style={{ marginTop: 'auto', paddingTop: '16px', color: '#3399ff', fontSize: '0.85rem', fontWeight: 600 }}>Buscar Club</div>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {createClubMode === 'quick' && (
                                            <div className="glass" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px' }}>
                                                <h2 style={{ marginBottom: '24px' }}>Alta Rápida de Club</h2>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '8px' }}>NOMBRE DE FANTASÍA</label>
                                                        <input type="text" value={quickClubName} onChange={e => setQuickClubName(e.target.value)} style={{ width: '100%', background: 'var(--surface-basalt)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '6px' }} placeholder="Ej. Rugby Club Example" />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '8px' }}>SIGLA / CÓDIGO</label>
                                                        <input type="text" style={{ width: '100%', background: 'var(--surface-basalt)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '6px' }} placeholder="Ej. RCE" />
                                                    </div>
                                                    <button className="btn-primary" style={{ marginTop: '12px', background: 'var(--accent-warning)', color: 'black', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                                                        onClick={() => { alert('Club creado exitosamente'); setCreateClubMode('none'); }}>
                                                        CREAR CLUB PROVISORIO
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {createClubMode === 'import' && (
                                            <div className="glass" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px' }}>
                                                <h2 style={{ marginBottom: '24px' }}>Importar desde Base Nacional</h2>
                                                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                                    <input type="text" style={{ flex: 1, background: 'var(--surface-basalt)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '6px' }} placeholder="Buscar por Nombre, CUIT o Región..." />
                                                    <button style={{ background: '#3399ff', color: 'white', border: 'none', padding: '0 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>BUSCAR</button>
                                                </div>
                                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', border: '1px dashed var(--border-glass)', borderRadius: '12px' }}>
                                                    Realice una búsqueda para ver los resultados disponibles en la base de datos nacional.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* === DISCIPLINA (Obsidian UI Base Integrated) === */}
                        {activeTab === 'disciplina' && (
                            <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
                                <header style={{
                                    position: 'relative',
                                    padding: '32px',
                                    background: 'var(--surface-glass)',
                                    border: '1px solid var(--border-glass)',
                                    borderRadius: '12px',
                                    marginBottom: '32px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <h1 style={{ fontSize: '28px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>Tribunal de Disciplina</h1>
                                        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', margin: '4px 0 24px 0' }}>Control centralizado de sanciones y cumplimiento normativo.</p>

                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '1px' }}>Torneo</span>
                                                <select
                                                    className="glass"
                                                    style={{ background: '#000', border: '1px solid var(--border-glass)', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', minWidth: '160px' }}
                                                    value={disciplineTourFilter}
                                                    onChange={(e) => setDisciplineTourFilter(e.target.value)}
                                                >
                                                    <option>Todos los torneos</option>
                                                    {myTournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '1px' }}>Buscar</span>
                                                <input
                                                    type="text"
                                                    placeholder="Jugador o equipo..."
                                                    style={{ background: '#000', border: '1px solid var(--border-glass)', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', minWidth: '240px' }}
                                                    value={disciplineSearch}
                                                    onChange={(e) => setDisciplineSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </header>

                                {myTournaments
                                    .filter(t => disciplineTourFilter === 'Todos los torneos' || t.id === disciplineTourFilter)
                                    .filter(t => db.disciplineIncidents.some(inc => inc.tournamentId === t.id))
                                    .map(tournament => {
                                        const tourIncidents = db.disciplineIncidents.filter(inc =>
                                            inc.tournamentId === tournament.id &&
                                            (inc.playerName.toLowerCase().includes(disciplineSearch.toLowerCase()) ||
                                                inc.clubName.toLowerCase().includes(disciplineSearch.toLowerCase()))
                                        );
                                        const tourSanctions = db.disciplineSanctions.filter(s => tourIncidents.some(i => i.playerId === s.playerId));
                                        const activeSubTab = tourSubTabs[tournament.id] || 'Bandeja de Casos';

                                        return (
                                            <section key={tournament.id} className="glass" style={{ marginBottom: '40px', border: '1px solid var(--border-glass)' }}>
                                                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{tournament.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>TEMPORADA {tournament.seasonId} • {tournament.category}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <span className="badge badge-neutral" style={{ padding: '4px 10px' }}>NIVEL 1</span>
                                                        <span className="badge badge-neutral" style={{ padding: '4px 10px' }}>TMO ACTIVO</span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border-glass)', borderBottom: '1px solid var(--border-glass)' }}>
                                                    <div style={{ background: 'var(--surface-basalt)', padding: '20px 24px' }}>
                                                        <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace' }}>{String(tourIncidents.filter(i => i.status !== 'resolved').length).padStart(2, '0')}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '4px' }}>Incidentes Abiertos</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface-basalt)', padding: '20px 24px' }}>
                                                        <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace' }}>{String(tourSanctions.filter(s => s.status === 'active').length).padStart(2, '0')}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '4px' }}>Sanciones Activas</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface-basalt)', padding: '20px 24px' }}>
                                                        <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace' }}>00</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '4px' }}>Apelaciones</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface-basalt)', padding: '20px 24px' }}>
                                                        <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace' }}>100%</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '4px' }}>Elegibilidad</div>
                                                    </div>
                                                </div>

                                                <nav style={{ padding: '0 24px', display: 'flex', gap: '24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-glass)' }}>
                                                    {['Bandeja de Casos', 'Sanciones', 'Reglamento'].map((t) => (
                                                        <div
                                                            key={t}
                                                            onClick={() => setTourSubTabs(prev => ({ ...prev, [tournament.id]: t }))}
                                                            style={{
                                                                padding: '16px 0',
                                                                fontSize: '13px',
                                                                fontWeight: 600,
                                                                color: activeSubTab === t ? 'var(--accent-bio)' : 'var(--text-dim)',
                                                                borderBottom: activeSubTab === t ? '2px solid var(--accent-bio)' : '2px solid transparent',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {t}
                                                        </div>
                                                    ))}
                                                </nav>

                                                <div style={{ padding: '24px' }}>
                                                    {activeSubTab === 'Bandeja de Casos' && (
                                                        <table className="data-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>ID / Fecha</th>
                                                                    <th>Involucrado</th>
                                                                    <th>Incidente</th>
                                                                    <th>Estado</th>
                                                                    <th>Acción</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {tourIncidents.map(inc => (
                                                                    <tr key={inc.id}>
                                                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{inc.id}<br /><small style={{ opacity: 0.5 }}>{inc.date}</small></td>
                                                                        <td>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>{inc.playerName.split(' ').map(n => n[0]).join('')}</div>
                                                                                <div>
                                                                                    <div style={{ fontWeight: 600 }}>{inc.playerName}</div>
                                                                                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{inc.clubName}</div>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                {inc.severity === 'high' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-danger)', boxShadow: '0 0 10px var(--accent-danger)' }}></span>}
                                                                                {inc.incidentType}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{inc.description}</div>
                                                                        </td>
                                                                        <td>
                                                                            <span className={`badge ${inc.status === 'review' ? 'badge-warning' : inc.status === 'resolved' ? 'badge-bio' : 'badge-neutral'}`}>
                                                                                {inc.status === 'review' ? 'En Revisión' : inc.status === 'resolved' ? 'Resuelto' : 'Pendiente'}
                                                                            </span>
                                                                        </td>
                                                                        <td><Link href={`/admin/disciplina/expediente/${inc.id}`} style={{ textDecoration: 'none', color: 'var(--accent-bio)', fontWeight: 600, fontSize: '0.8rem' }}>GESTIONAR</Link></td>
                                                                    </tr>
                                                                ))}
                                                                {tourIncidents.length === 0 && (
                                                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', opacity: 0.5 }}>No hay incidentes registrados para este torneo.</td></tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    )}

                                                    {activeSubTab === 'Sanciones' && (
                                                        <table className="data-table">
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
                                                                {tourSanctions.map(s => (
                                                                    <tr key={s.id}>
                                                                        <td style={{ fontFamily: 'monospace' }}>{s.id}</td>
                                                                        <td>{s.playerName} ({s.clubName})</td>
                                                                        <td>{s.summary}</td>
                                                                        <td>{s.startDate} - {s.endDate}</td>
                                                                        <td><span className="badge badge-bio">{s.status === 'active' ? 'Activa' : s.status}</span></td>
                                                                    </tr>
                                                                ))}
                                                                {tourSanctions.length === 0 && (
                                                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', opacity: 0.5 }}>No hay sanciones registradas para este torneo.</td></tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    )}

                                                    {activeSubTab === 'Reglamento' && (
                                                        <div style={{ background: 'var(--surface-basalt)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                                                            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reglamento del Torneo</div>
                                                                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Sube un archivo Word para actualizar las normativas vigentes.</div>
                                                                </div>
                                                                <div>
                                                                    <label style={{
                                                                        background: 'var(--accent-bio)',
                                                                        color: '#000',
                                                                        padding: '8px 16px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '12px',
                                                                        fontWeight: 700,
                                                                        cursor: isUploading ? 'not-allowed' : 'pointer',
                                                                        opacity: isUploading ? 0.5 : 1
                                                                    }}>
                                                                        {isUploading ? 'PROCESANDO...' : 'SUBIR WORD'}
                                                                        <input type='file' accept='.docx' onChange={(e) => handleFileUpload(e, tournament.id)} style={{ display: 'none' }} disabled={isUploading} />
                                                                    </label>
                                                                </div>
                                                            </div>
                                                            <div style={{ padding: '32px', minHeight: '200px' }}>
                                                                {db.regulations.find(r => r.scopeId === tournament.id) ? (
                                                                    <div
                                                                        className='reglamento-content'
                                                                        style={{ color: 'var(--text-main)', fontSize: '14px', lineHeight: '1.6' }}
                                                                        dangerouslySetInnerHTML={{ __html: db.regulations.find(r => r.scopeId === tournament.id)?.content || '' }}
                                                                    />
                                                                ) : (
                                                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                                                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📄</div>
                                                                        <div style={{ fontSize: '13px' }}>No hay un reglamento cargado para este torneo.</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        );
                                    })}

                                {myTournaments.filter(t => disciplineTourFilter === 'Todos los torneos' || t.id === disciplineTourFilter).filter(t => db.disciplineIncidents.some(inc => inc.tournamentId === t.id)).length === 0 && (
                                    <div className="glass" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.2 }}>⚖️</div>
                                        <p>No se encontraron expedientes activos con los filtros aplicados.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* === REPORTES (Dashboard B) === */}
                        {activeTab === 'reportes' && (
                            <div className="animate-fade-in">
                                <div className="reportes-panel">
                                    <div className="reportes-head">
                                        <div>
                                            <h1 className="reportes-title">Reportes</h1>
                                            <div className="reportes-filters">
                                                <select className="reportes-select">
                                                    <option>Rugby</option>
                                                </select>
                                                <select className="reportes-select">
                                                    <option>Unión Cordobesa</option>
                                                </select>
                                                <select className="reportes-select">
                                                    <option>Torneo Oficial 2024</option>
                                                </select>
                                                <select className="reportes-select">
                                                    <option>Primera División</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="reportes-actions">
                                            <button className="reportes-btn">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                </svg>
                                                Exportar
                                            </button>
                                            <button className="reportes-btn reportes-btn-primary">
                                                + Crear noticia
                                            </button>
                                        </div>
                                    </div>

                                    <div className="reportes-tabs">
                                        <button
                                            className={`reportes-tab ${reportTab === 'noticias' ? 'active' : ''}`}
                                            onClick={() => setReportTab('noticias')}
                                        >
                                            Noticias
                                        </button>
                                        <button
                                            className={`reportes-tab ${reportTab === 'resumen' ? 'active' : ''}`}
                                            onClick={() => setReportTab('resumen')}
                                        >
                                            Resumen Semanal
                                        </button>
                                        <button
                                            className={`reportes-tab ${reportTab === 'boletin_oficial' ? 'active' : ''}`}
                                            onClick={() => setReportTab('boletin_oficial')}
                                        >
                                            Boletín Oficial
                                        </button>
                                        <button
                                            className={`reportes-tab ${reportTab === 'eventos' ? 'active' : ''}`}
                                            onClick={() => setReportTab('eventos')}
                                        >
                                            Eventos
                                        </button>
                                    </div>

                                    {reportTab === 'noticias' && (
                                        <div className="reportes-grid">
                                            <div className="reportes-list">
                                                {reportNews.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className={`reportes-card ${item.id === activeReportId ? 'active' : ''}`}
                                                        onClick={() => setActiveReportId(item.id)}
                                                    >
                                                        <div className="reportes-meta">
                                                            <span className={`reportes-badge ${item.status === 'published' ? 'published' : ''}`}>
                                                                {item.status === 'published' ? 'Publicado' : 'Borrador'}
                                                            </span>
                                                            <span>{item.ref}</span>
                                                        </div>
                                                        <h3>{item.title}</h3>
                                                        <div className="reportes-meta">
                                                            <span>{item.time}</span>
                                                            <span>UC</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="reportes-editor">
                                                <div className="reportes-editor-header">
                                                    <span className="reportes-badge published">Editando: Oficial</span>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="reportes-btn">Guardar</button>
                                                        <button className="reportes-btn reportes-btn-primary">Publicar</button>
                                                    </div>
                                                </div>
                                                <div className="reportes-editor-body">
                                                    <div className="reportes-fields">
                                                        <div>
                                                            <div className="reportes-label">Título de la noticia</div>
                                                            <input className="reportes-input" value={activeReport.title} readOnly />
                                                        </div>
                                                        <div>
                                                            <div className="reportes-label">Bajada / Resumen</div>
                                                            <input className="reportes-input" placeholder="Breve descripción para el feed..." />
                                                        </div>
                                                        <div>
                                                            <div className="reportes-label">Cuerpo del comunicado</div>
                                                            <div className="reportes-input" style={{ minHeight: '120px' }}>
                                                                [ Editor enriquecido ]
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <aside className="reportes-preview">
                                                        <div className="reportes-label">Preview broadcast</div>
                                                        <div className="reportes-preview-card">
                                                            {activeReport.title}
                                                        </div>
                                                        <button className="reportes-btn">Descargar para RRSS</button>
                                                    </aside>
                                                </div>
                                            </div>
                                        </div>
                                    )}


                                    {reportTab === 'resumen' && (
                                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Selecciona los hitos de la semana para exportar a memoria descriptiva o PDF.</div>
                                                <button
                                                    className="reportes-btn reportes-btn-primary"
                                                    disabled={selectedNotes.length === 0}
                                                    onClick={() => alert('Generando PDF con ' + selectedNotes.length + ' notas seleccionadas...')}
                                                >
                                                    Exportar PDF ({selectedNotes.length})
                                                </button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                                {reportNotes.map(note => (
                                                    <div
                                                        key={note.id}
                                                        className="glass"
                                                        style={{
                                                            padding: '20px',
                                                            border: selectedNotes.includes(note.id) ? '1px solid var(--accent-bio)' : '1px solid var(--border-glass)',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onClick={() => {
                                                            setSelectedNotes(prev =>
                                                                prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]
                                                            );
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                            <span className="reportes-badge" style={{ borderColor: 'transparent', background: 'rgba(255,255,255,0.05)' }}>{note.category}</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{note.date}</span>
                                                        </div>
                                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>{note.title}</h4>
                                                        <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5' }}>{note.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {reportTab === 'boletin_oficial' && (
                                        <div className="animate-fade-in">
                                            {!generatedBulletin ? (
                                                <div className="glass" style={{ padding: '60px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📜</div>
                                                    <h3 style={{ marginBottom: '12px' }}>Boletín Oficial Institucional</h3>
                                                    <p style={{ maxWidth: '500px', margin: '0 auto 24px', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                                                        Genera el documento legal de la federación de forma automática integrando sanciones, resultados y resoluciones administrativas.
                                                    </p>
                                                    <button className="reportes-btn reportes-btn-primary" onClick={handleAutoGenerateBulletin}>
                                                        Generar Boletín Actualizado
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
                                                    <div style={{ background: '#fff', color: '#000', padding: '60px', borderRadius: '4px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', fontFamily: 'serif' }}>
                                                        <div style={{ borderBottom: '2px solid #000', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>G22 SCORES</div>
                                                                <div style={{ fontSize: '0.8rem', letterSpacing: '2px' }}>FEDERACIÓN DEPORTIVA</div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontWeight: 700 }}>Boletín Nº {generatedBulletin.number}</div>
                                                                <div style={{ fontSize: '0.9rem' }}>{generatedBulletin.date}</div>
                                                            </div>
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>1. Cabecera e Identificación</h2>
                                                            <p style={{ fontSize: '0.9rem' }}>Emitido por: {generatedBulletin.organ}</p>
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>2. Resoluciones del Tribunal de Disciplina</h2>
                                                            {generatedBulletin.sanctions?.map((s: any, idx: number) => (
                                                                <div key={idx} style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
                                                                    <strong>{s.player} ({s.club}):</strong> {s.period} - {s.detail}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>3. Competencia y Resultados</h2>
                                                            {generatedBulletin.results?.map((res: any, idx: number) => (
                                                                <div key={idx} style={{ marginBottom: '16px' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px', background: '#f5f5f5', padding: '4px 8px' }}>{res.league}</div>
                                                                    {res.games.map((g: any, i: number) => (
                                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '0.5px solid #eee' }}>
                                                                            <span>{g.home} vs {g.away}</span>
                                                                            <span style={{ fontWeight: 800 }}>{g.score}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>4. Tablas de Posiciones Oficiales</h2>
                                                            {generatedBulletin.standings?.map((stand: any, idx: number) => (
                                                                <div key={idx} style={{ marginBottom: '16px' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>{stand.league}</div>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid #000' }}>
                                                                                <th style={{ textAlign: 'left', padding: '4px' }}>Pos</th>
                                                                                <th style={{ textAlign: 'left', padding: '4px' }}>Club</th>
                                                                                <th style={{ textAlign: 'right', padding: '4px' }}>PJ</th>
                                                                                <th style={{ textAlign: 'right', padding: '4px' }}>PG</th>
                                                                                <th style={{ textAlign: 'right', padding: '4px' }}>Pts</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {stand.teams.map((t: any, i: number) => (
                                                                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                                                                    <td style={{ padding: '4px' }}>{t.pos}</td>
                                                                                    <td style={{ padding: '4px' }}>{t.name}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '4px' }}>{t.pj}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '4px' }}>{t.pg}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '4px', fontWeight: 700 }}>{t.pts}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>5. Estadísticas Individuales</h2>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                                                {generatedBulletin.stats?.map((stat: any, idx: number) => (
                                                                    <div key={idx}>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>{stat.title}</div>
                                                                        {stat.data.map((p: any, i: number) => (
                                                                            <div key={i} style={{ fontSize: '0.8rem', padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span>{i + 1}. {p.player}</span>
                                                                                <span style={{ fontWeight: 600 }}>{p.val}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>6. Programación (Próxima Fecha)</h2>
                                                            {generatedBulletin.nextFixtures?.map((fix: any, idx: number) => (
                                                                <div key={idx}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: '#444' }}>{fix.league} • {fix.date}</div>
                                                                    {fix.matchups.map((m: any, i: number) => (
                                                                        <div key={i} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '0.5px solid #eee', display: 'grid', gridTemplateColumns: '80px 1fr 120px' }}>
                                                                            <span style={{ fontWeight: 700 }}>{m.time} hs</span>
                                                                            <span>{m.h} vs {m.a}</span>
                                                                            <span style={{ fontSize: '0.75rem', color: '#666', textAlign: 'right' }}>Ref: {m.ref}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ marginBottom: '40px' }}>
                                                            <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '16px' }}>7. Asuntos Administrativos</h2>
                                                            {generatedBulletin.admin?.map((a: any, idx: number) => (
                                                                <div key={idx} style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
                                                                    <strong>{a.title}:</strong> {a.status}. {a.detail}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ marginTop: '80px', display: 'flex', justifyContent: 'space-between' }}>
                                                            <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', paddingTop: '8px', fontSize: '0.8rem' }}>Presidente</div>
                                                            <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', paddingTop: '8px', fontSize: '0.8rem' }}>Secretario General</div>
                                                        </div>
                                                    </div>

                                                    <div className="glass" style={{ padding: '24px', height: 'fit-content', position: 'sticky', top: '20px' }}>
                                                        <h4 style={{ marginBottom: '16px' }}>Opciones del Boletín</h4>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                            <button className="reportes-btn reportes-btn-primary" style={{ width: '100%' }} onClick={() => alert('Descargando Boletín Oficial PDF...')}>Descargar PDF Oficial</button>
                                                            <button className="reportes-btn" style={{ width: '100%' }}>Enviar por Email a Clubes</button>
                                                            <button className="reportes-btn" style={{ width: '100%' }} onClick={() => setGeneratedBulletin(null)}>Cerrar Previsualización</button>
                                                        </div>
                                                        <div style={{ marginTop: '24px', fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                                                            💡 Tip: El boletín se genera automáticamente combinando datos del tribunal y la programación de partidos.
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {reportTab === 'eventos' && (
                                        <div className="reportes-event-list">
                                            {reportEvents.map((event) => (
                                                <div key={event.id} className="reportes-event-card">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <div className="reportes-event-date">
                                                            {event.day}
                                                            <span>{event.month}</span>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700 }}>{event.title}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{event.place}</div>
                                                        </div>
                                                    </div>
                                                    <button className="reportes-btn">Reducir</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                    </div>
                </main>
            </div>
        </>
    );
}
