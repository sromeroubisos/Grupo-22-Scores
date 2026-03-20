'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ChevronLeft, Trophy, Globe, Shield, Settings, CheckCircle,
    LayoutGrid, ListOrdered, GitMerge, Search, Loader2
} from 'lucide-react';
import PhaseCreator from '@/app/admin/components/PhaseCreator';
import { createClient } from '@/lib/supabase/client';
import { createEntity, updateEntity } from '@/app/admin/entities/actions';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getActiveSports } from '@/lib/data/sports';
import { mapExternalSportToInternalSport } from '@/lib/sports';
import '../../creation-forms.css';

const activeSports = getActiveSports();

const sportDefaults: Record<string, { duration: number; win: number; draw: number; loss: number }> = {
    'football': { duration: 90, win: 3, draw: 1, loss: 0 },
    'rugby': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-union': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-league': { duration: 80, win: 2, draw: 1, loss: 0 },
    'basketball': { duration: 40, win: 2, draw: 0, loss: 1 },
    'hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'field-hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'volleyball': { duration: 90, win: 3, draw: 0, loss: 0 },
    'beach-volleyball': { duration: 60, win: 3, draw: 0, loss: 0 },
    'tennis': { duration: 120, win: 2, draw: 0, loss: 0 },
    'table-tennis': { duration: 30, win: 2, draw: 0, loss: 0 },
    'badminton': { duration: 45, win: 2, draw: 0, loss: 0 },
    'handball': { duration: 60, win: 2, draw: 1, loss: 0 },
    'futsal': { duration: 40, win: 3, draw: 1, loss: 0 },
    'beach-soccer': { duration: 36, win: 3, draw: 1, loss: 0 },
    'baseball': { duration: 180, win: 1, draw: 0, loss: 0 },
    'cricket': { duration: 300, win: 1, draw: 0, loss: 0 },
    'american-football': { duration: 60, win: 1, draw: 0, loss: 0 },
    'aussie-rules': { duration: 80, win: 4, draw: 2, loss: 0 },
    'snooker': { duration: 60, win: 1, draw: 0, loss: 0 },
    'darts': { duration: 30, win: 1, draw: 0, loss: 0 },
    'boxing': { duration: 36, win: 1, draw: 0, loss: 0 },
    'mma': { duration: 25, win: 1, draw: 0, loss: 0 },
    'esports': { duration: 45, win: 1, draw: 0, loss: 0 },
    'water-polo': { duration: 32, win: 2, draw: 1, loss: 0 },
    'floorball': { duration: 60, win: 3, draw: 1, loss: 0 },
    'bandy': { duration: 90, win: 3, draw: 1, loss: 0 },
    'netball': { duration: 60, win: 2, draw: 0, loss: 0 },
    'kabaddi': { duration: 40, win: 2, draw: 0, loss: 0 },
};

const steps = [
    { id: 1, name: 'Configuración', icon: <Settings size={14} /> },
    { id: 2, name: 'Fases', icon: <Trophy size={14} /> },
    { id: 3, name: 'Participantes', icon: <Shield size={14} /> },
    { id: 4, name: 'Reglas', icon: <CheckCircle size={14} /> },
    { id: 5, name: 'Publicar', icon: <Globe size={14} /> },
] as const;

function slugify(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

export default function SuperCreateTournament() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const supabase = createClient();

    const [currentStep, setCurrentStep] = useState(1);
    const [isEdit, setIsEdit] = useState(false);
    const [unions, setUnions] = useState<any[]>([]);
    const [clubs, setClubs] = useState<any[]>([]);
    const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [saving, setSaving] = useState(false);
    const [countryOptions, setCountryOptions] = useState<TournamentCountryOption[]>(() => getTournamentCountryOptions());

    const [formData, setFormData] = useState({
        name: '',
        sport: 'rugby',
        visibility: 'public',
        season: '2026',
        format: 'league',
        category: 'Profesional',
        country: '',
        unionId: '',
        rules: {
            pointsWin: 4,
            pointsDraw: 2,
            pointsLoss: 0,
            pointsBonusTry: 1,
            pointsBonusLoss: 1,
        }
    });

    // Load reference data
    useEffect(() => {
        supabase.from('unions').select('*').order('name').then(({ data }) => {
            setUnions(data || []);
        });
        supabase.from('clubs').select('*').order('name').then(({ data }) => {
            setClubs(data || []);
        });
        supabase.from('countries').select('id, name, code, flag_emoji').order('name').then(({ data }) => {
            setCountryOptions(getTournamentCountryOptions(data || []));
        });
    }, [supabase]);

    // Load tournament data when editing
    useEffect(() => {
        if (!tournamentId) return;

        supabase.from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single()
            .then(({ data }: { data: any }) => {
                if (!data) return;
                setIsEdit(true);

                const sportVal = data.sport_id ? mapExternalSportToInternalSport(data.sport_id) : 'rugby';
                const defaults = sportDefaults[sportVal as string] || {};

                setFormData(prev => ({
                    ...prev,
                    name: data.name || '',
                    sport: sportVal,
                    visibility: data.is_visible ? 'public' : 'private',
                    season: data.season_id || '2026',
                    category: data.category || prev.category,
                    format: data.format || prev.format,
                    country: normalizeCountryId(data.country_id || data.country || '', countryOptions),
                    unionId: data.union_id || '',
                    rules: {
                        ...prev.rules,
                        pointsWin: data.ruleset?.pointsWin ?? defaults.win ?? prev.rules.pointsWin,
                        pointsDraw: data.ruleset?.pointsDraw ?? defaults.draw ?? prev.rules.pointsDraw,
                        pointsLoss: data.ruleset?.pointsLoss ?? defaults.loss ?? prev.rules.pointsLoss,
                        pointsBonusTry: data.ruleset?.pointsBonusTry ?? prev.rules.pointsBonusTry,
                        pointsBonusLoss: data.ruleset?.pointsBonusLoss ?? prev.rules.pointsBonusLoss,
                    }
                }));
            });

        // Load existing participants
        supabase.from('tournament_participants')
            .select('club_id')
            .eq('tournament_id', tournamentId)
            .then(({ data }) => {
                setSelectedClubs(data?.map((p: any) => p.club_id) || []);
            });
    }, [countryOptions, supabase, tournamentId]);

    const handleSportChange = (sportId: string) => {
        const d = sportDefaults[sportId];
        setFormData(prev => ({
            ...prev,
            sport: sportId,
            rules: {
                ...prev.rules,
                ...(d ? { pointsWin: d.win, pointsDraw: d.draw, pointsLoss: d.loss } : {})
            }
        }));
    };

    const handleNext = async () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setSaving(true);
        try {
            const ruleset = {
                pointsWin: formData.rules.pointsWin,
                pointsDraw: formData.rules.pointsDraw,
                pointsLoss: formData.rules.pointsLoss,
                ...(formData.sport === 'rugby' ? {
                    pointsBonusTry: formData.rules.pointsBonusTry,
                    pointsBonusLoss: formData.rules.pointsBonusLoss,
                } : {})
            };

            const payload: Record<string, any> = {
                name: formData.name,
                sport_id: formData.sport,
                season_id: formData.season || '2026',
                category: formData.category || null,
                format: formData.format || null,
                country: formData.country
                    ? (countryOptions.find((option) => option.id === formData.country)?.label || formData.country)
                    : null,
                country_id: formData.country || null,
                union_id: formData.unionId || null,
                status: 'published' as const,
                is_visible: formData.visibility === 'public',
                ruleset,
            };

            let savedId: string;

            if (isEdit && tournamentId) {
                // On edit: don't touch the slug
                await updateEntity('tournament', tournamentId, payload);
                savedId = tournamentId;
            } else {
                // On create: generate a unique slug
                payload.slug = formData.name
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
                const result = await createEntity('tournament', payload);
                savedId = result.id;
            }

            // Persist participants
            if (selectedClubs.length > 0) {
                if (isEdit) {
                    await supabase.from('tournament_participants').delete().eq('tournament_id', savedId);
                }
                await supabase.from('tournament_participants').insert(
                    selectedClubs.map(clubId => ({ tournament_id: savedId, club_id: clubId }))
                );
            }

            router.push('/admin/super/torneos');
        } catch (err: any) {
            alert('Error al guardar el torneo: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="creation-body">
            <div className="creation-container">
                {/* Header */}
                <header className="creation-header">
                    <button
                        onClick={() => router.push('/admin/super/torneos')}
                        className="btn btn-outline"
                        style={{ padding: '8px 16px', marginBottom: '24px', height: 'auto', width: 'auto' }}
                    >
                        <ChevronLeft size={16} /> Volver a Torneos
                    </button>
                    <h1>{isEdit ? 'Editar Torneo' : 'Inaugurar Torneo'}</h1>
                    <p>Define los parámetros globales y la estructura de tu competencia.</p>
                </header>

                {/* Stepper */}
                <nav className="stepper-nav">
                    {steps.map(step => (
                        <button
                            key={step.id}
                            className={`step-pill ${currentStep === step.id ? 'active' : ''} ${step.id < currentStep ? 'done' : ''}`}
                            onClick={() => {
                                if (step.id < currentStep) setCurrentStep(step.id);
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                {step.id < currentStep ? '✓' : step.icon}
                                {step.name}
                            </span>
                        </button>
                    ))}
                </nav>

                {/* STEP 1: CONFIGURACIÓN */}
                {currentStep === 1 && (
                    <>
                        <article className="partition">
                            <div className="partition-header">
                                <h2>Configuración General</h2>
                                <p>Información de identidad y categorización.</p>
                            </div>
                            <div className="partition-body">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label>NOMBRE DEL TORNEO *</label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ej: Torneo del Interior A 2026"
                                        />
                                    </div>

                                    <div className="field-group">
                                        <label>DEPORTE</label>
                                        <div className="choice-grid">
                                            {activeSports.map(sport => (
                                                <button
                                                    key={sport.id}
                                                    type="button"
                                                    className={`choice-btn ${formData.sport === sport.id ? 'selected' : ''}`}
                                                    onClick={() => handleSportChange(sport.id)}
                                                >
                                                    <span className="choice-icon">{sport.icon}</span>
                                                    <span className="choice-label">{sport.nameEs}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>TEMPORADA</label>
                                            <select
                                                className="form-select"
                                                value={formData.season}
                                                onChange={e => setFormData({ ...formData, season: e.target.value })}
                                            >
                                                <option value="2026">2026</option>
                                                <option value="2025">2025</option>
                                                <option value="2024">2024</option>
                                            </select>
                                        </div>
                                        <div className="field-group">
                                            <label>CATEGORÍA</label>
                                            <input
                                                className="form-input"
                                                type="text"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                placeholder="Ej: Primera, Juveniles, etc."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <article className="partition">
                            <div className="partition-header">
                                <h2>Jurisdicción y Alcance</h2>
                                <p>Define dónde se desarrolla y quién lo rige.</p>
                            </div>
                            <div className="partition-body">
                                <div className="grid-2">
                                    <div className="field-group">
                                        <label>PAÍS / REGIÓN</label>
                                        <select
                                            className="form-select"
                                            value={formData.country}
                                            onChange={e => setFormData({ ...formData, country: e.target.value })}
                                        >
                                            <option value="">No especificado</option>
                                            {countryOptions.map((country) => (
                                                <option key={country.id} value={country.id}>{country.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="field-group">
                                        <label>UNIÓN VINCULADA</label>
                                        <select
                                            className="form-select"
                                            value={formData.unionId}
                                            onChange={e => setFormData({ ...formData, unionId: e.target.value })}
                                        >
                                            <option value="">Independiente (Sin vínculo)</option>
                                            {unions.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </>
                )}

                {/* STEP 2: FASES */}
                {currentStep === 2 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Estructura de Fases</h2>
                            <p>Configura cómo se organiza la competencia.</p>
                        </div>
                        <div className="partition-body">
                            <div className="field-group">
                                <label>TIPO DE FORMATO</label>
                                <div className="choice-grid">
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'groups' ? 'selected' : ''}`}
                                        onClick={() => setFormData({ ...formData, format: 'groups' })}
                                    >
                                        <LayoutGrid className="choice-icon" />
                                        <span className="choice-label">Fase de Grupos + Playoffs</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'league' ? 'selected' : ''}`}
                                        onClick={() => setFormData({ ...formData, format: 'league' })}
                                    >
                                        <ListOrdered className="choice-icon" />
                                        <span className="choice-label">Liga (Todos contra todos)</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'knockout' ? 'selected' : ''}`}
                                        onClick={() => setFormData({ ...formData, format: 'knockout' })}
                                    >
                                        <GitMerge className="choice-icon" />
                                        <span className="choice-label">Eliminación Directa</span>
                                    </button>
                                </div>
                            </div>
                            <div className="sub-partition" style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', background: 'rgba(0,0,0,0.2)', marginTop: '30px' }}>
                                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Trophy size={18} color="var(--accent)" />
                                    <h3 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configurador de Fases</h3>
                                </div>
                                <PhaseCreator
                                    phaseIndex={1}
                                    totalPhases={1}
                                    onPrev={() => setCurrentStep(1)}
                                    onNext={() => setCurrentStep(3)}
                                />
                            </div>
                        </div>
                    </article>
                )}

                {/* STEP 3: PARTICIPANTES */}
                {currentStep === 3 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Clubes Participantes</h2>
                            <p>Selecciona los clubes que formarán parte de este torneo.</p>
                        </div>
                        <div className="partition-body">
                            <div className="form-grid">
                                <div className="field-group">
                                    <label>BUSCAR Y AGREGAR CLUBES</label>
                                    <div className="search-box">
                                        <Search className="icon" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Escribe el nombre del club..."
                                            className="form-input"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={clubs.length > 0 && selectedClubs.length === clubs.length}
                                                        onChange={() => {
                                                            if (selectedClubs.length === clubs.length) setSelectedClubs([]);
                                                            else setSelectedClubs(clubs.map(c => c.id));
                                                        }}
                                                    />
                                                </th>
                                                <th>CLUB</th>
                                                <th>UBICACIÓN</th>
                                                <th style={{ width: '100px' }}>ACCIÓN</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {clubs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                                        Cargando clubes...
                                                    </td>
                                                </tr>
                                            ) : clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(club => (
                                                <tr key={club.id} className={selectedClubs.includes(club.id) ? 'active' : ''}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedClubs.includes(club.id)}
                                                            onChange={() => {
                                                                if (selectedClubs.includes(club.id)) setSelectedClubs(p => p.filter(id => id !== club.id));
                                                                else setSelectedClubs(p => [...p, club.id]);
                                                            }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            {club.logo_url && <img src={club.logo_url} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />}
                                                            <span>{club.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>{club.city || club.short_name || 'Sede Central'}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={`btn ${selectedClubs.includes(club.id) ? 'btn-primary' : 'btn-outline'}`}
                                                            style={{ padding: '4px 12px', fontSize: '11px', height: 'auto', minHeight: 'unset' }}
                                                            onClick={() => {
                                                                if (selectedClubs.includes(club.id)) setSelectedClubs(p => p.filter(id => id !== club.id));
                                                                else setSelectedClubs(p => [...p, club.id]);
                                                            }}
                                                        >
                                                            {selectedClubs.includes(club.id) ? '✓ Añadido' : '+ Añadir'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* STEP 4: REGLAS */}
                {currentStep === 4 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Sistema de Puntuación</h2>
                            <p>Define los puntos que se otorgarán por cada resultado.</p>
                        </div>
                        <div className="partition-body">
                            <div className="grid-2">
                                <div className="field-group">
                                    <label>PUNTOS POR GANAR</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={formData.rules.pointsWin}
                                        onChange={e => setFormData({
                                            ...formData,
                                            rules: { ...formData.rules, pointsWin: parseInt(e.target.value) }
                                        })}
                                    />
                                </div>
                                <div className="field-group">
                                    <label>PUNTOS POR EMPATAR</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={formData.rules.pointsDraw}
                                        onChange={e => setFormData({
                                            ...formData,
                                            rules: { ...formData.rules, pointsDraw: parseInt(e.target.value) }
                                        })}
                                    />
                                </div>
                            </div>

                            {formData.sport === 'rugby' && (
                                <div className="sub-partition" style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '15px', color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase' }}>Puntos Bonus (Rugby)</h4>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>POR 4 O MÁS TRIES</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsBonusTry}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    rules: { ...formData.rules, pointsBonusTry: parseInt(e.target.value) }
                                                })}
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>POR PERDER POR {'<'} 7</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsBonusLoss}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    rules: { ...formData.rules, pointsBonusLoss: parseInt(e.target.value) }
                                                })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </article>
                )}

                {/* STEP 5: REVISIÓN */}
                {currentStep === 5 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Resumen y Confirmación</h2>
                            <p>Revisa que toda la información sea correcta antes de finalizar.</p>
                        </div>
                        <div className="partition-body">
                            <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Nombre</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.name}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Deporte</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.sport.toUpperCase()}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Temporada</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.season}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Categoría</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.category || 'N/A'}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Participantes</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{selectedClubs.length} club{selectedClubs.length !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Puntos (G/E/P)</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.rules.pointsWin} / {formData.rules.pointsDraw} / {formData.rules.pointsLoss}</span>
                                </div>
                            </div>

                            <article className="partition" style={{ marginTop: '30px', border: '1px dashed var(--border)' }}>
                                <div className="partition-header">
                                    <h3>Visibilidad Final</h3>
                                </div>
                                <div className="partition-body">
                                    <select
                                        className="form-select"
                                        value={formData.visibility}
                                        onChange={e => setFormData({ ...formData, visibility: e.target.value })}
                                    >
                                        <option value="public">🌍 Público (Vivo en la app)</option>
                                        <option value="private">🔒 Privado (Borrador interno)</option>
                                    </select>
                                </div>
                            </article>
                        </div>
                    </article>
                )}

                {/* Footer Actions */}
                <footer className="actions-footer">
                    <button
                        className="btn btn-outline"
                        disabled={currentStep === 1 || saving}
                        onClick={() => setCurrentStep(p => p - 1)}
                    >
                        Paso Anterior
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleNext}
                        disabled={saving || (currentStep === 1 && !formData.name)}
                    >
                        {saving ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Loader2 className="spinning" size={18} />
                                {isEdit ? 'Guardando...' : 'Creando...'}
                            </span>
                        ) : currentStep === 5 ? (isEdit ? 'Guardar Cambios' : 'Finalizar Torneo') : 'Siguiente Paso'}
                    </button>
                </footer>
            </div>
        </div>
    );
}
