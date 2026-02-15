'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PhaseCreator from '@/app/admin/components/PhaseCreator';
import { db } from '@/lib/mock-db';

export default function SuperCreateTournament() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentStep, setCurrentStep] = useState(1);
    const [isEdit, setIsEdit] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        sport: 'Rugby Union',
        visibility: 'public',
        season: '',
        location: '',
        startDate: '',
        endDate: '',
        format: 'league',
        pointsWin: 4,
        pointsDraw: 2,
        pointsLoss: 0,
        matchDuration: 80,
        rulePreset: 'standard',
        gender: 'Masculino',
        category: 'Profesional',
        country: '',
        unionId: 'null', // 'null' string to represent no selection in select element
    });

    useEffect(() => {
        if (!tournamentId) return;
        // Find tournament across all unions (since we are super admin)
        const tournament = db.tournaments.find(t => t.id === tournamentId);
        if (!tournament) return;

        setIsEdit(true);

        const mappedSport = tournament.sport === 'rugby'
            ? 'Rugby Union'
            : tournament.sport === 'football'
                ? 'Football'
                : tournament.sport === 'hockey'
                    ? 'Hockey'
                    : tournament.sport;

        setFormData(prev => ({
            ...prev,
            name: tournament.name,
            sport: mappedSport,
            season: tournament.seasonId,
            category: tournament.category || prev.category,
            format: tournament.format?.toLowerCase().includes('league') ? 'league' : prev.format,
            unionId: tournament.unionId || 'null',
        }));
    }, [tournamentId]);

    // All available tiebreaker criteria
    const allTiebreakers = [
        'Puntos', 'Victorias', 'Empates', 'Pérdidas', 'Partidos jugados',
        'Victorias en prórroga', 'Empates en prórroga', 'Pérdidas en prórroga',
        'Partidos con prórroga', 'Clasificación', 'Porcentaje', 'Enfrentamiento directo',
        'Diferencia de puntos', 'Puntos a favor', 'Puntaje en contra', 'Try',
        'Conversión', 'Gol de penal', 'Drop goals', 'Tackle', 'Carrera'
    ];

    const [selectedTiebreakers, setSelectedTiebreakers] = useState<string[]>(['Puntos', 'Diferencia de puntos', 'Puntos a favor']);
    const [positionLabels, setPositionLabels] = useState<Array<{ from: number; to: number; label: string; color: string }>>([
        { from: 1, to: 4, label: 'Clasifican a Playoffs', color: '#22c55e' },
        { from: 5, to: 8, label: 'Repechaje', color: '#eab308' },
    ]);

    // Logo states
    const [logoMethod, setLogoMethod] = useState<'url' | 'file'>('url');
    const [logoUrl, setLogoUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Sports and their statistics
    const sportsData = {
        'Football': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Penal', 'Autogol'],
            defaultDuration: 90,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Tennis': {
            stats: ['Aces', 'Doble Falta', 'Winners', 'Errores No Forzados', 'Break Points'],
            defaultDuration: 120,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Basketball': {
            stats: ['Puntos', 'Rebotes', 'Asistencias', 'Falta Personal', 'Falta Técnica', 'Falta Antideportiva'],
            defaultDuration: 40,
            defaultPoints: { win: 2, draw: 0, loss: 1 }
        },
        'Hockey': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Tiros a Portería'],
            defaultDuration: 60,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Rugby Union': {
            stats: ['Try (5pts)', 'Conversión (2pts)', 'Penal (3pts)', 'Drop Goal (3pts)', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 80,
            defaultPoints: { win: 4, draw: 2, loss: 0 }
        }
    };

    const handleSportChange = (sport: string) => {
        // @ts-ignore
        const sportData = sportsData[sport];
        if (sportData) {
            setFormData(prev => ({
                ...prev,
                sport,
                matchDuration: sportData.defaultDuration,
                pointsWin: sportData.defaultPoints.win,
                pointsDraw: sportData.defaultPoints.draw,
                pointsLoss: sportData.defaultPoints.loss,
            }));
        }
    };


    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleNext = () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // Save logic
            const newTournament = {
                id: isEdit && tournamentId ? tournamentId : Math.random().toString(36).substr(2, 9),
                unionId: formData.unionId === 'null' ? null : formData.unionId,
                seasonId: formData.season || '2026',
                name: formData.name,
                slug: formData.name.toLowerCase().replace(/ /g, '-'),
                status: 'published' as const,
                sport: formData.sport.toLowerCase().includes('rugby') ? 'rugby' : 'football' as any, // Simplified mapping
                category: formData.category,
                format: formData.format,
                createdAt: new Date().toISOString()
            };

            if (isEdit) {
                const index = db.tournaments.findIndex(t => t.id === tournamentId);
                if (index !== -1) {
                    db.tournaments[index] = newTournament;
                }
                alert('Torneo actualizado.');
            } else {
                db.tournaments.push(newTournament);
                alert('Torneo creado exitosamente sin vincular (o vinculado).');
            }
            router.push(`/admin/super/torneos`);
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
                    <select
                        value={formData.sport}
                        onChange={e => handleSportChange(e.target.value)}
                    >
                        {Object.keys(sportsData).map(sport => (
                            <option key={sport} value={sport}>{sport}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Unión (Opcional)</label>
                    <select
                        value={formData.unionId}
                        onChange={e => setFormData({ ...formData, unionId: e.target.value })}
                    >
                        <option value="null">Sin vínculo (Unlinked)</option>
                        {db.unions.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Puedes vincular el torneo a una unión más tarde desde el catálogo.
                    </p>
                </div>

                <div className="wizard-footer">
                    <button className="btn btn-secondary" disabled={currentStep === 1}>Anterior</button>
                    <button className="btn btn-primary" onClick={handleNext}>
                        {currentStep === 5 ? (isEdit ? 'Guardar Cambios' : 'Publicar Torneo') : 'Siguiente'}
                    </button>
                </div>
            </div>
        </div>
    );
}
