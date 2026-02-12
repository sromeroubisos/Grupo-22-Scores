'use client';

import { useState } from 'react';
import '@/app/admin/styles/admin-custom.css';

// Helper Components defined outside to avoid re-creation
const SectionHeader = ({ title, description }: { title: string, description: string }) => (
    <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--fg)', marginBottom: '4px' }}>{title}</h3>
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>{description}</p>
    </div>
);

const Block = ({ children }: { children: React.ReactNode }) => (
    <div className="g22Block" style={{ marginBottom: '32px', padding: '32px' }}>
        {children}
    </div>
);

const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
        <span style={{ fontSize: '14px', color: 'var(--fg)', fontWeight: 500 }}>{label}</span>
        <div
            onClick={() => onChange(!checked)}
            style={{
                width: '44px', height: '24px',
                background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: '0.3s'
            }}
        >
            <div style={{
                position: 'absolute', top: '2px', left: checked ? '22px' : '2px',
                width: '20px', height: '20px', background: '#fff', borderRadius: '50%',
                transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
        </div>
    </div>
);

const Input = ({ label, value, onChange, type = "text", disabled = false }: any) => (
    <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>{label}</label>
        <input
            type={type}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{
                width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--fg)',
                fontSize: '14px', outline: 'none'
            }}
        />
    </div>
);

const Select = ({ label, value, onChange, options = [], disabled = false }: any) => (
    <div style={{ marginBottom: '16px' }}>
        {label && <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>{label}</label>}
        <div style={{ position: 'relative' }}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    paddingRight: '40px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: 'var(--fg)',
                    fontSize: '14px',
                    outline: 'none',
                    appearance: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1
                }}
            >
                {options.map((opt: any) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#222', color: '#fff' }}>
                        {opt.label}
                    </option>
                ))}
            </select>
            <div style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--muted)',
                display: 'flex'
            }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>
        </div>
    </div>
);

export default function ConfigPage() {
    // 1. Ajustes Generales
    const [generalSettings, setGeneralSettings] = useState({
        name: 'URBA Top 12 Copa Star+',
        season: '2026',
        organizer: 'Unión Argentina de Rugby',
        status: 'published',
        visibility: 'public',
        logoUrl: 'https://placehold.co/400x400/png',
    });

    // Logo Upload State
    const [logoMethod, setLogoMethod] = useState<'url' | 'file'>('url');
    const [logoFile, setLogoFile] = useState<File | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const previewUrl = URL.createObjectURL(file);
            setGeneralSettings(prev => ({ ...prev, logoUrl: previewUrl }));
        }
    };

    // 2. Reglas Deportivas Globales
    const [sportsRules, setSportsRules] = useState({
        pointsWin: 4,
        pointsDraw: 2,
        pointsLoss: 0,
        bonusOffensive: true, // 4+ tries
        bonusDefensive: true, // loss by <= 7
        tieBreakers: ['Diferencia de Puntos', 'Tries a Favor', 'Resultados entre sí'],
    });

    // 3. Reglas de Partido
    const [matchRules, setMatchRules] = useState({
        duration: 80,
        periods: 2,
        allowDraw: true,
        enabledEvents: [
            { id: '1', label: 'Try', points: 5, type: 'score' },
            { id: '2', label: 'Conversión', points: 2, type: 'score' },
            { id: '3', label: 'Penal', points: 3, type: 'score' },
            { id: '4', label: 'Drop', points: 3, type: 'score' },
            { id: '5', label: 'Tarjeta Amarilla', points: 0, type: 'card' },
            { id: '6', label: 'Tarjeta Roja', points: 0, type: 'card' },
            { id: '7', label: 'Cambio', points: 0, type: 'substitution' }
        ]
    });

    // 4. Comportamiento Fixture <-> Resultados
    const [fixtureBehavior, setFixtureBehavior] = useState({
        autoFinalize: true, // Move to results on finish
        allowEditFinished: true, // Can edit after final?
        autoRecalculate: true, // Update tables automatically
        liveVisibility: 'immediate', // immediate, delay
    });

    // 5. Reglas Globales de Fases
    const [phaseRules, setPhaseRules] = useState({
        allowHomeAway: true,
        pointsCarryOver: false,
        crossGroupMatches: false,
    });

    // Helpers
    const addEvent = () => {
        const newEvent = {
            id: Date.now().toString(),
            label: 'Nuevo Evento',
            points: 0,
            type: 'score'
        };
        setMatchRules({
            ...matchRules,
            enabledEvents: [...matchRules.enabledEvents, newEvent]
        });
    };

    const removeEvent = (id: string) => {
        setMatchRules({
            ...matchRules,
            enabledEvents: matchRules.enabledEvents.filter(e => e.id !== id)
        });
    };

    const updateEvent = (id: string, field: string, value: any) => {
        const updatedEvents = matchRules.enabledEvents.map(e => {
            if (e.id === id) {
                return { ...e, [field]: value };
            }
            return e;
        });
        setMatchRules({ ...matchRules, enabledEvents: updatedEvents });
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '80px' }}>
            {/* Header */}
            <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '8px' }}>Configuración</h1>
                <p style={{ color: 'var(--muted)', fontSize: '15px' }}>Reglas globales y comportamiento del torneo. Los cambios aquí afectan a todas las fases.</p>
            </div>

            {/* 1. Ajustes Generales */}
            <Block>
                <SectionHeader title="1. Ajustes Generales del Torneo" description="Metadatos e información pública del torneo." />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <Input label="Nombre Oficial" value={generalSettings.name} onChange={(v: string) => setGeneralSettings({ ...generalSettings, name: v })} />
                    <Input label="Temporada / Edición" value={generalSettings.season} onChange={(v: string) => setGeneralSettings({ ...generalSettings, season: v })} />
                </div>

                <div style={{ marginTop: '24px', marginBottom: '24px' }}>
                    <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '12px', letterSpacing: '0.05em' }}>Logo del Torneo</label>

                    <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                        {/* Preview Box - Tamaño del Header (80x80) */}
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '16px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0
                        }}>
                            <img
                                src={generalSettings.logoUrl}
                                alt="Preview"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/400x400/png?text=🏆";
                                }}
                            />
                        </div>

                        {/* Controls */}
                        <div style={{ flex: 1 }}>
                            {/* Method Toggle */}
                            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px', marginBottom: '16px', width: 'fit-content' }}>
                                <button
                                    onClick={() => setLogoMethod('file')}
                                    style={{
                                        padding: '6px 16px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: logoMethod === 'file' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: logoMethod === 'file' ? 'white' : 'var(--muted)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Subir Archivo
                                </button>
                                <button
                                    onClick={() => setLogoMethod('url')}
                                    style={{
                                        padding: '6px 16px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: logoMethod === 'url' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: logoMethod === 'url' ? 'white' : 'var(--muted)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Usar URL
                                </button>
                            </div>

                            {logoMethod === 'url' ? (
                                <div>
                                    <input
                                        type="text"
                                        value={generalSettings.logoUrl}
                                        onChange={(e) => setGeneralSettings({ ...generalSettings, logoUrl: e.target.value })}
                                        placeholder="https://example.com/logo.png"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            color: 'var(--fg)',
                                            fontSize: '14px',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            ) : (
                                <div
                                    style={{
                                        border: '1px dashed var(--border)',
                                        borderRadius: '8px',
                                        padding: '20px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s'
                                    }}
                                    onClick={() => document.getElementById('config-logo-upload')?.click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0,163,101,0.05)'; }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                        const file = e.dataTransfer.files[0];
                                        if (file) handleFileSelect({ target: { files: [file] } } as any);
                                    }}
                                >
                                    <input
                                        id="config-logo-upload"
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleFileSelect}
                                    />
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '4px' }}>
                                        {logoFile ? logoFile.name : 'Haz clic o arrastra tu logo aquí'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                        Recomendado: 400x400px o superior (PNG/SVG)
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <Input label="Organizador" value={generalSettings.organizer} disabled={true} onChange={() => { }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
                    <Select
                        label="Estado"
                        value={generalSettings.status}
                        onChange={(v: string) => setGeneralSettings({ ...generalSettings, status: v })}
                        options={[
                            { value: 'draft', label: 'Borrador (Oculto)' },
                            { value: 'published', label: 'Publicado (Visible)' },
                            { value: 'archived', label: 'Archivado (Solo lectura)' }
                        ]}
                    />
                    <Select
                        label="Visibilidad"
                        value={generalSettings.visibility}
                        onChange={(v: string) => setGeneralSettings({ ...generalSettings, visibility: v })}
                        options={[
                            { value: 'public', label: 'Pública' },
                            { value: 'private', label: 'Privada' }
                        ]}
                    />
                </div>
            </Block>

            {/* 2. Reglas Deportivas Globales */}
            <Block>
                <SectionHeader title="2. Reglas Deportivas Globales" description="Definición de puntos y criterios de competencia." />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <Input
                        label="Puntos x Victoria"
                        type="number"
                        value={sportsRules.pointsWin}
                        onChange={(v: string) => setSportsRules({ ...sportsRules, pointsWin: v === '' ? 0 : parseInt(v) || 0 })}
                    />
                    <Input
                        label="Puntos x Empate"
                        type="number"
                        value={sportsRules.pointsDraw}
                        onChange={(v: string) => setSportsRules({ ...sportsRules, pointsDraw: v === '' ? 0 : parseInt(v) || 0 })}
                    />
                    <Input
                        label="Puntos x Derrota"
                        type="number"
                        value={sportsRules.pointsLoss}
                        onChange={(v: string) => setSportsRules({ ...sportsRules, pointsLoss: v === '' ? 0 : parseInt(v) || 0 })}
                    />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Bonus</h4>
                    <Toggle label="Punto Bonus Ofensivo (4+ Tries)" checked={sportsRules.bonusOffensive} onChange={(v) => setSportsRules({ ...sportsRules, bonusOffensive: v })} />
                    <Toggle label="Punto Bonus Defensivo (Perder por <= 7)" checked={sportsRules.bonusDefensive} onChange={(v) => setSportsRules({ ...sportsRules, bonusDefensive: v })} />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Criterios de Desempate (Orden)</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {sportsRules.tieBreakers.map((tb, idx) => (
                            <div key={idx} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: '12px' }}>{idx + 1}</span>
                                {tb}
                            </div>
                        ))}
                    </div>
                </div>
            </Block>

            {/* 3. Reglas de Partido */}
            <Block>
                <SectionHeader title="3. Reglas de Partido" description="Estructura del juego y definición de eventos de puntuación/incidencias." />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <Input
                        label="Duración (min)"
                        type="number"
                        value={matchRules.duration}
                        onChange={(v: string) => setMatchRules({ ...matchRules, duration: v === '' ? 0 : parseInt(v) || 0 })}
                    />
                    <Input
                        label="Tiempos"
                        type="number"
                        value={matchRules.periods}
                        onChange={(v: string) => setMatchRules({ ...matchRules, periods: v === '' ? 0 : parseInt(v) || 0 })}
                    />
                    <div style={{ marginTop: '28px' }}>
                        <Toggle label="Empate Permitido" checked={matchRules.allowDraw} onChange={(v) => setMatchRules({ ...matchRules, allowDraw: v })} />
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 700 }}>Eventos y Puntuación</h4>
                        <button
                            onClick={addEvent}
                            style={{
                                background: 'var(--accent)', color: '#000', border: 'none',
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                transition: '0.2s'
                            }}
                        >
                            + Agregar Evento
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Header de la tabla */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 130px 80px 40px', gap: '12px', padding: '0 8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.05em' }}>Nombre</span>
                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.05em' }}>Tipo</span>
                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.05em' }}>Puntos</span>
                            <span></span>
                        </div>

                        {matchRules.enabledEvents.map((event: any) => (
                            <div key={event.id} style={{
                                display: 'grid', gridTemplateColumns: '2fr 130px 80px 40px', gap: '12px',
                                alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)'
                            }}>
                                <input
                                    type="text"
                                    value={event.label}
                                    onChange={(e) => updateEvent(event.id, 'label', e.target.value)}
                                    placeholder="Nombre del evento"
                                    style={{ background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: '14px', fontWeight: 600, width: '100%', outline: 'none' }}
                                />
                                <div style={{ position: 'relative' }}>
                                    <select
                                        value={event.type}
                                        onChange={(e) => updateEvent(event.id, 'type', e.target.value)}
                                        style={{
                                            width: '100%',
                                            background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                                            borderRadius: '6px', color: 'var(--muted)', fontSize: '12px', padding: '6px',
                                            paddingRight: '24px',
                                            appearance: 'none', outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="score" style={{ background: '#222' }}>Puntos</option>
                                        <option value="card" style={{ background: '#222' }}>Tarjeta</option>
                                        <option value="substitution" style={{ background: '#222' }}>Cambio</option>
                                        <option value="other" style={{ background: '#222' }}>Otro</option>
                                    </select>
                                    <div style={{
                                        position: 'absolute',
                                        right: '6px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'none',
                                        color: 'var(--muted)',
                                        display: 'flex'
                                    }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 9l6 6 6-6" />
                                        </svg>
                                    </div>
                                </div>

                                <input
                                    type="number"
                                    value={event.points}
                                    onChange={(e) => updateEvent(event.id, 'points', parseInt(e.target.value) || 0)}
                                    disabled={event.type !== 'score'}
                                    style={{
                                        background: 'transparent', border: 'none',
                                        color: event.type === 'score' ? 'var(--accent)' : 'var(--muted)',
                                        fontSize: '14px', fontWeight: 700, width: '100%', outline: 'none',
                                        opacity: event.type === 'score' ? 1 : 0.3
                                    }}
                                    placeholder="0"
                                />
                                <button
                                    onClick={() => removeEvent(event.id)}
                                    style={{
                                        color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer',
                                        width: '28px', height: '28px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                    title="Eliminar evento"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ))}

                        {matchRules.enabledEvents.length === 0 && (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px', border: '1px dashed var(--border)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                                <p style={{ margin: 0 }}>No hay eventos definidos.</p>
                                <button
                                    onClick={addEvent}
                                    style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Comenzar agregando uno
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </Block>

            {/* 4. Comportamiento Fixture <-> Resultados */}
            <Block>
                <SectionHeader title="4. Comportamiento Fixture ↔ Resultados" description="Automatización del flujo de datos." />
                <Toggle label="Mover a Resultados al finalizar partido" checked={fixtureBehavior.autoFinalize} onChange={(v) => setFixtureBehavior({ ...fixtureBehavior, autoFinalize: v })} />
                <Toggle label="Permitir editar partidos finalizados" checked={fixtureBehavior.allowEditFinished} onChange={(v) => setFixtureBehavior({ ...fixtureBehavior, allowEditFinished: v })} />
                <Toggle label="Recalcular tablas automáticamente" checked={fixtureBehavior.autoRecalculate} onChange={(v) => setFixtureBehavior({ ...fixtureBehavior, autoRecalculate: v })} />
                <div style={{ marginTop: '16px' }}>
                    <Select
                        label="Visibilidad de Resultados"
                        value={fixtureBehavior.liveVisibility}
                        onChange={(v: string) => setFixtureBehavior({ ...fixtureBehavior, liveVisibility: v })}
                        options={[
                            { value: 'immediate', label: 'Inmediata (En vivo)' },
                            { value: 'delay', label: 'Con delay' },
                            { value: 'manual', label: 'Solo manual' }
                        ]}
                    />
                </div>
            </Block>

            {/* 5. Reglas Globales de Fases */}
            <Block>
                <SectionHeader title="5. Reglas Globales de Fases" description="Marco general para la creación de fases." />
                <Toggle label="Permitir series Ida y Vuelta" checked={phaseRules.allowHomeAway} onChange={(v) => setPhaseRules({ ...phaseRules, allowHomeAway: v })} />
                <Toggle label="Habilitar arrastre de puntos entre fases" checked={phaseRules.pointsCarryOver} onChange={(v) => setPhaseRules({ ...phaseRules, pointsCarryOver: v })} />
                <Toggle label="Permitir cruces entre grupos" checked={phaseRules.crossGroupMatches} onChange={(v) => setPhaseRules({ ...phaseRules, crossGroupMatches: v })} />
            </Block>

            <div style={{ textAlign: 'right', marginTop: '24px' }}>
                <button className="btnActionGreen" onClick={() => alert('Configuración guardada (Simulación)')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Guardar Cambios
                </button>
            </div>

        </div>
    );
}
