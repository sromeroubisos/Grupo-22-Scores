'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PhaseCreator from '@/app/admin/components/PhaseCreator';
import { createClient } from '@/lib/supabase/client';
import { SPORTS, getActiveSports } from '@/lib/data/sports';

const activeSports = getActiveSports();

// Match rules per sport for the form defaults
const sportDefaults: Record<string, { duration: number; win: number; draw: number; loss: number }> = {
    'football':          { duration: 90,  win: 3, draw: 1, loss: 0 },
    'rugby':             { duration: 80,  win: 4, draw: 2, loss: 0 },
    'rugby-union':       { duration: 80,  win: 4, draw: 2, loss: 0 },
    'rugby-league':      { duration: 80,  win: 2, draw: 1, loss: 0 },
    'basketball':        { duration: 40,  win: 2, draw: 0, loss: 1 },
    'hockey':            { duration: 60,  win: 3, draw: 1, loss: 0 },
    'field-hockey':      { duration: 60,  win: 3, draw: 1, loss: 0 },
    'volleyball':        { duration: 90,  win: 3, draw: 0, loss: 0 },
    'beach-volleyball':  { duration: 60,  win: 3, draw: 0, loss: 0 },
    'tennis':            { duration: 120, win: 2, draw: 0, loss: 0 },
    'table-tennis':      { duration: 30,  win: 2, draw: 0, loss: 0 },
    'badminton':         { duration: 45,  win: 2, draw: 0, loss: 0 },
    'handball':          { duration: 60,  win: 2, draw: 1, loss: 0 },
    'futsal':            { duration: 40,  win: 3, draw: 1, loss: 0 },
    'beach-soccer':      { duration: 36,  win: 3, draw: 1, loss: 0 },
    'baseball':          { duration: 180, win: 1, draw: 0, loss: 0 },
    'cricket':           { duration: 300, win: 1, draw: 0, loss: 0 },
    'american-football': { duration: 60,  win: 1, draw: 0, loss: 0 },
    'aussie-rules':      { duration: 80,  win: 4, draw: 2, loss: 0 },
    'snooker':           { duration: 60,  win: 1, draw: 0, loss: 0 },
    'darts':             { duration: 30,  win: 1, draw: 0, loss: 0 },
    'boxing':            { duration: 36,  win: 1, draw: 0, loss: 0 },
    'mma':               { duration: 25,  win: 1, draw: 0, loss: 0 },
    'esports':           { duration: 45,  win: 1, draw: 0, loss: 0 },
    'water-polo':        { duration: 32,  win: 2, draw: 1, loss: 0 },
    'floorball':         { duration: 60,  win: 3, draw: 1, loss: 0 },
    'bandy':             { duration: 90,  win: 3, draw: 1, loss: 0 },
    'netball':           { duration: 60,  win: 2, draw: 0, loss: 0 },
    'kabaddi':           { duration: 40,  win: 2, draw: 0, loss: 0 },
};

export default function SuperCreateTournament() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const [currentStep, setCurrentStep] = useState(1);
    const [isEdit, setIsEdit] = useState(false);
    const [unions, setUnions] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        sport: 'rugby',
        visibility: 'public',
        season: '2026',
        location: '',
        startDate: '',
        endDate: '',
        format: 'league',
        pointsWin: 4,
        pointsDraw: 2,
        pointsLoss: 0,
        matchDuration: 80,
        gender: 'Masculino',
        category: 'Profesional',
        country: '',
        unionId: '',
    });

    // Fetch unions from Supabase
    useEffect(() => {
        supabase.from('unions').select('*').order('name').then(({ data }) => {
            setUnions(data || []);
        });
    }, []);

    // Load existing tournament for edit
    useEffect(() => {
        if (!tournamentId) return;
        supabase.from('tournaments').select('*').eq('id', tournamentId).single().then(({ data }) => {
            if (!data) return;
            setIsEdit(true);
            const defaults = sportDefaults[data.sport] || {};
            setFormData(prev => ({
                ...prev,
                name: data.name || '',
                sport: data.sport || 'rugby',
                season: data.season_id || '2026',
                category: data.category || prev.category,
                format: data.format || prev.format,
                country: data.country || '',
                unionId: data.union_id || '',
                pointsWin: defaults.win ?? prev.pointsWin,
                pointsDraw: defaults.draw ?? prev.pointsDraw,
                pointsLoss: defaults.loss ?? prev.pointsLoss,
                matchDuration: defaults.duration ?? prev.matchDuration,
            }));
        });
    }, [tournamentId]);

    const handleSportChange = (sportId: string) => {
        const d = sportDefaults[sportId];
        setFormData(prev => ({
            ...prev,
            sport: sportId,
            ...(d ? {
                matchDuration: d.duration,
                pointsWin: d.win,
                pointsDraw: d.draw,
                pointsLoss: d.loss,
            } : {}),
        }));
    };

    const handleNext = async () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Final step: save to Supabase
        setSaving(true);
        try {
            const payload = {
                name: formData.name,
                sport: formData.sport,
                season_id: formData.season || '2026',
                category: formData.category || null,
                format: formData.format || null,
                country: formData.country || null,
                union_id: formData.unionId || null,
                status: 'published' as const,
                is_visible: formData.visibility === 'public',
                slug: formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now(),
            };

            let error: any;
            if (isEdit && tournamentId) {
                ({ error } = await supabase.from('tournaments').update(payload).eq('id', tournamentId));
            } else {
                ({ error } = await supabase.from('tournaments').insert([payload]));
            }

            if (error) throw error;
            router.push('/admin/super/torneos');
        } catch (err: any) {
            alert('Error al guardar el torneo: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (currentStep === 2) {
        return (
            <PhaseCreator
                phaseIndex={1}
                totalPhases={3}
                onPrev={() => setCurrentStep(1)}
                onNext={() => setCurrentStep(3)}
            />
        );
    }

    return (
        <div className="create-tournament-page">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

                :root {
                    --bg-deep: #07090c;
                    --bg-surface: #0b1016;
                    --glass: rgba(255, 255, 255, 0.03);
                    --glass-border: rgba(255, 255, 255, 0.08);
                    --accent-green: #22c55e;
                    --text-primary: rgba(255, 255, 255, 0.92);
                    --text-secondary: rgba(255, 255, 255, 0.62);
                    --text-muted: rgba(255, 255, 255, 0.35);
                    --radius-lg: 12px;
                    --radius-md: 8px;
                    --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .create-tournament-page {
                    background-color: var(--bg-deep);
                    min-height: 100vh;
                    font-family: 'Inter', sans-serif;
                    padding: 32px;
                }

                .app-container {
                    max-width: 800px;
                    margin: 0 auto;
                }

                .form-group {
                    margin-bottom: 24px;
                }

                label {
                    display: block;
                    font-size: 13px;
                    color: var(--text-secondary);
                    margin-bottom: 8px;
                }

                input, select {
                    width: 100%;
                    background: var(--bg-surface);
                    border: 1px solid var(--glass-border);
                    color: white;
                    padding: 12px;
                    border-radius: var(--radius-md);
                }

                .btn {
                    padding: 12px 24px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    border: none;
                    font-weight: 600;
                }

                .btn-primary {
                    background: var(--accent-green);
                    color: black;
                }

                .btn-secondary {
                    background: transparent;
                    border: 1px solid var(--glass-border);
                    color: white;
                }

                .wizard-footer {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 40px;
                }

                .sport-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                    gap: 10px;
                    margin-top: 8px;
                }

                .sport-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: var(--radius-md);
                    border: 1px solid var(--glass-border);
                    background: var(--bg-surface);
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 13px;
                    transition: var(--transition);
                }

                .sport-btn.selected {
                    border-color: var(--accent-green);
                    color: var(--accent-green);
                    background: rgba(34, 197, 94, 0.08);
                }
            `}</style>

            <div className="app-container">
                <div style={{ marginBottom: 32 }}>
                    <button
                        onClick={() => router.back()}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>
                    <h1 style={{ color: 'white', marginTop: 16 }}>
                        {isEdit ? 'Editar Torneo' : 'Nuevo Torneo'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Configuración global del torneo
                    </p>
                </div>

                <div className="form-group">
                    <label>Nombre del Torneo</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Superliga 2026"
                    />
                </div>

                <div className="form-group">
                    <label>Deporte</label>
                    <div className="sport-grid">
                        {activeSports.map(sport => (
                            <button
                                key={sport.id}
                                type="button"
                                className={`sport-btn${formData.sport === sport.id ? ' selected' : ''}`}
                                onClick={() => handleSportChange(sport.id)}
                            >
                                <span>{sport.icon}</span>
                                <span>{sport.nameEs}</span>
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        Deporte seleccionado: <strong style={{ color: 'var(--text-secondary)' }}>{SPORTS[formData.sport as keyof typeof SPORTS]?.nameEs || formData.sport}</strong>
                    </p>
                </div>

                <div className="form-group">
                    <label>Temporada</label>
                    <select
                        value={formData.season}
                        onChange={e => setFormData({ ...formData, season: e.target.value })}
                    >
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Categoría</label>
                    <input
                        type="text"
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Ej: Primera División, U19, Femenino..."
                    />
                </div>

                <div className="form-group">
                    <label>País</label>
                    <select
                        value={formData.country}
                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                    >
                        <option value="">Global (sin país)</option>
                        <option value="Argentina">Argentina</option>
                        <option value="Uruguay">Uruguay</option>
                        <option value="Chile">Chile</option>
                        <option value="Brasil">Brasil</option>
                        <option value="Colombia">Colombia</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Unión (Opcional)</label>
                    <select
                        value={formData.unionId}
                        onChange={e => setFormData({ ...formData, unionId: e.target.value })}
                    >
                        <option value="">Sin vínculo (Unlinked)</option>
                        {unions.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Puedes vincular el torneo a una unión más tarde desde el catálogo.
                    </p>
                </div>

                <div className="form-group">
                    <label>Visibilidad</label>
                    <select
                        value={formData.visibility}
                        onChange={e => setFormData({ ...formData, visibility: e.target.value })}
                    >
                        <option value="public">Público</option>
                        <option value="private">Privado (borrador)</option>
                    </select>
                </div>

                <div className="wizard-footer">
                    <button className="btn btn-secondary" disabled={currentStep === 1} onClick={() => setCurrentStep(p => p - 1)}>
                        Anterior
                    </button>
                    <button className="btn btn-primary" onClick={handleNext} disabled={saving || !formData.name}>
                        {saving ? 'Guardando...' : currentStep === 5 ? (isEdit ? 'Guardar Cambios' : 'Publicar Torneo') : 'Siguiente'}
                    </button>
                </div>
            </div>
        </div>
    );
}
