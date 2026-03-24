'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEntity, updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { useAdminConsole } from '@/app/admin/AdminContext';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type CountryRow = Pick<Database['public']['Tables']['countries']['Row'], 'id' | 'name' | 'code' | 'flag_emoji'>;

/* ─── design tokens (Flash UI) ─────────────────────────────────────── */
const T = {
    bgDeep: '#050505',
    bgMatte: '#0f0f0f',
    bgSurface: '#161616',
    neon: '#00FF66',
    neonGlow: 'rgba(0,255,102,0.4)',
    neonDim: 'rgba(0,255,102,0.1)',
    textMain: '#f0f0f0',
    textDim: '#888888',
    border: '#222222',
    radius: '4px',
    mono: "'JetBrains Mono', monospace",
    sans: "'Inter', sans-serif",
    danger: '#ff4444',
    warn: '#ffaa00',
    warnBg: 'rgba(255,170,0,0.05)',
    warnBorder: 'rgba(255,170,0,0.2)',
} as const;

/* ─── shared style objects ──────────────────────────────────────────── */
const S = {
    input: {
        width: '100%',
        backgroundColor: T.bgDeep,
        border: `1px solid ${T.border}`,
        padding: '0.8rem 1rem',
        color: T.textMain,
        fontFamily: T.sans,
        borderRadius: T.radius,
        outline: 'none',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        fontSize: '0.9rem',
    } as React.CSSProperties,

    inputMono: {
        fontFamily: T.mono,
        fontSize: '0.85rem',
        color: T.neon,
    } as React.CSSProperties,

    label: {
        display: 'block',
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        color: T.textDim,
        marginBottom: '0.5rem',
        letterSpacing: '0.05em',
    } as React.CSSProperties,

    sectionCard: {
        backgroundColor: T.bgMatte,
        border: `1px solid ${T.border}`,
        padding: '2rem',
        borderRadius: T.radius,
        marginBottom: '2rem',
    } as React.CSSProperties,

    sectionHeader: {
        marginBottom: '2rem',
        borderBottom: `1px solid ${T.border}`,
        paddingBottom: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    } as React.CSSProperties,

    formGroup: {
        marginBottom: '1.5rem',
    } as React.CSSProperties,

    btnPrimary: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        backgroundColor: T.neon,
        color: T.bgDeep,
        boxShadow: `0 4px 15px ${T.neonGlow}`,
        fontFamily: T.sans,
    } as React.CSSProperties,

    btnSecondary: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        background: 'transparent',
        border: `1px solid ${T.border}`,
        color: T.textMain,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        fontFamily: T.sans,
    } as React.CSSProperties,

    btnGhost: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        background: 'transparent',
        border: 'none',
        color: T.textDim,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        fontFamily: T.sans,
    } as React.CSSProperties,
} as const;

/* ─── constants ─────────────────────────────────────────────────────── */
const SPORTS = [
    { id: 'rugby', label: 'Rugby', emoji: '🏉' },
    { id: 'football', label: 'Football', emoji: '⚽' },
    { id: 'hockey', label: 'Hockey', emoji: '🏑' },
    { id: 'basketball', label: 'Basketball', emoji: '🏀' },
    { id: 'volleyball', label: 'Volleyball', emoji: '🏐' },
] as const;

const FORMAT_OPTIONS = [
    { id: 'league', label: 'League / Round Robin' },
    { id: 'groups', label: 'Group Stage + Playoffs' },
    { id: 'elimination', label: 'Direct Elimination' },
    { id: 'series', label: 'Series / Multiple Legs' },
] as const;

const TIEBREAKER_LABELS: Record<string, string> = {
    points: 'Competition Points',
    diff: 'Point Difference',
    head_to_head: 'Head-to-Head (H2H)',
    tries: 'Tries Scored',
    fair_play: 'Fair Play Score',
    for: 'Points For',
};

const SPORT_PRESETS: Record<string, { points_base: Record<string, number>; bonus_rules: any[] }> = {
    rugby: {
        points_base: { win: 4, draw: 2, loss: 0 }, bonus_rules: [
            { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
            { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
        ]
    },
    football: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    hockey: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    basketball: { points_base: { win: 2, draw: 0, loss: 1 }, bonus_rules: [] },
    volleyball: { points_base: { win: 3, draw: 0, loss: 0 }, bonus_rules: [] },
};

function slugify(s: string) {
    return s.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

/* ─── component ─────────────────────────────────────────────────────── */
export function TournamentEditor({
    data,
    id,
    unions = [],
    countries = [],
}: {
    data: Partial<TournamentRow>;
    id: string;
    unions?: { id: string; name: string }[];
    countries?: CountryRow[];
}) {
    const isCreate = id === 'new';
    const router = useRouter();
    const { refresh } = useAdminConsole();

    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [slugEdited, setSlugEdited] = useState(false);
    const [newBonusLabel, setNewBonusLabel] = useState('');
    const [isCreatingUnion, setIsCreatingUnion] = useState(false);
    const [newUnionName, setNewUnionName] = useState('');
    const baseCountryOptions = useMemo(
        () =>
            getTournamentCountryOptions(
                countries.map((country) => ({
                    id: country.id,
                    name: country.name,
                    code: country.code,
                    flag_emoji: country.flag_emoji,
                })),
            ),
        [countries],
    );

    const [form, setForm] = useState(() => ({
        name: data.name ?? '',
        slug: data.slug ?? '',
        season_id: data.season_id ?? new Date().getFullYear().toString(),
        union_id: data.union_id ?? '',
        sport_id: data.sport_id ?? 'rugby',
        category: data.category ?? '',
        age_grade: data.age_grade ?? 'Mayores',
        status: data.status ?? 'draft',
        is_visible: data.is_visible ?? true,
        priority: data.priority ?? 0,
        country_id: normalizeCountryId(data.country_id ?? data.country ?? '', baseCountryOptions),
        region: data.region ?? '',
        format: data.format ?? 'league',
    }));
    const countryOptions = useMemo(() => {
        if (!form.country_id) return baseCountryOptions;

        const normalizedCountryId = normalizeCountryId(form.country_id, baseCountryOptions);
        const existingOption = baseCountryOptions.find((option) => option.id === normalizedCountryId);
        if (existingOption) return baseCountryOptions;

        return [
            {
                id: normalizedCountryId,
                label: data.country || form.country_id,
            },
            ...baseCountryOptions,
        ];
    }, [baseCountryOptions, data.country, form.country_id]);
    const selectedCountryLabel = useMemo(
        () => countryOptions.find((option) => option.id === form.country_id)?.label || null,
        [countryOptions, form.country_id],
    );

    const [ruleset, setRuleset] = useState(() => {
        const r = (data.ruleset && typeof data.ruleset === 'object') ? { ...data.ruleset as any } : {};
        const baseStandings = r.standings ?? SPORT_PRESETS.rugby;
        const baseTiebreakers = r.tiebreakers ?? { order: ['points', 'diff', 'head_to_head', 'tries', 'fair_play'] };

        if (!r.phases || !Array.isArray(r.phases)) {
            r.phases = [{
                id: 'phase_1',
                name: 'Regular Season',
                format: data.format || 'league',
                standings: JSON.parse(JSON.stringify(baseStandings)),
                tiebreakers: JSON.parse(JSON.stringify(baseTiebreakers)),
            }];
        }
        return {
            standings: baseStandings,
            tiebreakers: baseTiebreakers,
            ...r
        };
    });

    useLeaveConfirm(isDirty);

    function handleChange(key: string, value: any) {
        setForm(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'name' && isCreate && !slugEdited) next.slug = slugify(value);
            if (key === 'sport_id' && isCreate) {
                const preset = SPORT_PRESETS[value] ?? SPORT_PRESETS.rugby;
                setRuleset((r: any) => ({
                    ...r,
                    standings: preset,
                    phases: r.phases.map((p: any) => ({ ...p, standings: JSON.parse(JSON.stringify(preset)) }))
                }));
            }
            return next;
        });
        setIsDirty(true);
        setMessage('');
    }

    function handleRulesetChange(path: string, value: any) {
        setRuleset((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            const parts = path.split('.');
            let cur: any = next;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
            cur[parts[parts.length - 1]] = value;
            return next;
        });
        setIsDirty(true);
    }

    function addBonusRule(phaseIdx: number) {
        const label = newBonusLabel.trim();
        if (!label) return;
        const currentBonus = ruleset.phases[phaseIdx].standings.bonus_rules;
        handleRulesetChange(`phases.${phaseIdx}.standings.bonus_rules`, [
            ...currentBonus,
            { id: `bonus_${Date.now()}`, label, points_awarded: 1 },
        ]);
        setNewBonusLabel('');
    }

    function removeBonusRule(phaseIdx: number, ruleId: string) {
        const currentBonus = ruleset.phases[phaseIdx].standings.bonus_rules;
        handleRulesetChange(
            `phases.${phaseIdx}.standings.bonus_rules`,
            currentBonus.filter((r: any) => r.id !== ruleId),
        );
    }

    function moveTiebreaker(phaseIdx: number, tbIdx: number, dir: -1 | 1) {
        const order = [...ruleset.phases[phaseIdx].tiebreakers.order];
        [order[tbIdx], order[tbIdx + dir]] = [order[tbIdx + dir], order[tbIdx]];
        handleRulesetChange(`phases.${phaseIdx}.tiebreakers.order`, order);
    }

    function addNewPhase() {
        const nextIdx = ruleset.phases.length + 1;
        const newPhase = {
            id: `phase_${nextIdx}_${Date.now()}`,
            name: nextIdx === 2 ? 'Playoffs' : `Phase ${nextIdx}`,
            format: 'elimination',
            standings: JSON.parse(JSON.stringify(ruleset.standings)),
            tiebreakers: JSON.parse(JSON.stringify(ruleset.tiebreakers)),
        };
        handleRulesetChange('phases', [...ruleset.phases, newPhase]);
        setIsDirty(true);
    }

    function removePhase(idx: number) {
        if (ruleset.phases.length <= 1) return;
        const nextPhases = ruleset.phases.filter((_: any, i: number) => i !== idx);
        handleRulesetChange('phases', nextPhases);
        setIsDirty(true);
    }

    async function handleSubmit() {
        if (!form.name.trim()) { setMessage('Error: Name is required'); return; }
        setIsSaving(true);
        setMessage('');
        try {
            let actualUnionId = form.union_id;

            if (isCreatingUnion && newUnionName.trim()) {
                const unionResult = await createEntity('union', { name: newUnionName.trim() });
                actualUnionId = unionResult.id;
            }

            const effectiveFormat = ruleset.phases[0]?.format || form.format;
            const payload = {
                ...form,
                country: form.country_id ? (selectedCountryLabel || form.country_id) : null,
                country_id: form.country_id || null,
                union_id: actualUnionId,
                format: effectiveFormat,
                priority: form.priority ?? 0,
                ruleset: {
                    ...ruleset,
                    standings: ruleset.phases[0]?.standings || ruleset.standings,
                    tiebreakers: ruleset.phases[0]?.tiebreakers || ruleset.tiebreakers,
                    competition: { format_type: effectiveFormat, parameters: {} }
                },
            };
            if (isCreate) {
                const result = await createEntity('tournament', payload);
                setIsDirty(false);
                refresh();
                router.push(`/admin/entities/${result.id}/manage?type=tournament&tab=resumen`);
            } else {
                await updateEntity('tournament', id, payload);
                setIsDirty(false);
                refresh();
                setMessage('Saved successfully.');
                router.refresh();
            }
        } catch (err: any) {
            setMessage('Error: ' + (err.message ?? 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    }


    /* ── render ── */
    return (
        <div style={{ backgroundColor: T.bgDeep, color: T.textMain, fontFamily: T.sans, position: 'relative', minHeight: '100vh' }}>

            {/* Electromagnetic grid overlay (body::before equivalent) */}
            <div style={{
                position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                background: `radial-gradient(circle at 50% 50%, rgba(0,255,102,0.02) 0%, transparent 70%),
                             repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.01) 1px, transparent 2px)`,
            }} />

            {/* App container */}
            <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem 5rem' }}>

                {/* ── Tournament Hero Header (sticky) ──────────────────────── */}
                <header style={{
                    backgroundColor: T.bgMatte,
                    border: `1px solid ${T.border}`,
                    padding: '1.5rem 2rem',
                    borderRadius: T.radius,
                    marginBottom: '2rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    position: 'sticky',
                    top: '1rem',
                    zIndex: 100,
                    backdropFilter: 'blur(10px)',
                }}>
                    {/* hero-info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        {/* logo placeholder badge */}
                        <div style={{
                            width: 50, height: 50,
                            backgroundColor: T.bgSurface,
                            border: `1px dashed ${T.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: T.radius,
                            color: T.textDim,
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                        }}>Logo</div>

                        {/* hero-meta */}
                        <div>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                                {form.name || 'New Tournament'}
                            </h1>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                {/* active pill */}
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.neonDim,
                                    border: `1px solid ${T.neonDim}`,
                                    color: T.neon, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>Status: {form.status}</span>
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.bgSurface,
                                    border: `1px solid ${T.border}`,
                                    color: T.textDim, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>Season: {form.season_id}</span>
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.bgSurface,
                                    border: `1px solid ${T.border}`,
                                    color: T.textDim, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>{isCreate ? 'ID: NEW' : `ID: ${id.slice(0, 8).toUpperCase()}`}</span>
                            </div>
                        </div>
                    </div>

                    {/* hero-actions */}
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => router.back()} style={S.btnGhost}>Preview</button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSaving}
                            style={{ ...S.btnPrimary, opacity: isSaving ? 0.6 : 1 }}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </header>

                {/* ── Toast message ─────────────────────────────────────────── */}
                {message && (
                    <div style={{
                        backgroundColor: message.startsWith('Error') ? 'rgba(255,68,68,0.08)' : T.neonDim,
                        border: `1px solid ${message.startsWith('Error') ? 'rgba(255,68,68,0.3)' : T.neonDim}`,
                        color: message.startsWith('Error') ? '#ff6666' : T.neon,
                        padding: '0.8rem 1rem',
                        borderRadius: T.radius,
                        fontSize: '0.85rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'center',
                    }}>
                        <span>{message.startsWith('Error') ? '✕' : '✓'}</span>
                        {message}
                    </div>
                )}

                {/* ── Main form content ─────────────────────────────────── */}
                <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* ════════════════════════════════════════════════════
                            SECTION 1 — Basic Identity
                        ════════════════════════════════════════════════════ */}
                    <section id="identity" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Basic Identity</h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    Global identification for the tournament system.
                                </p>
                            </div>
                        </div>

                        {/* Row 1: Name (2fr) + Slug (1fr) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Tournament Name *</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="e.g. Super Rugby Pacific"
                                    value={form.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Slug (Automatic)</label>
                                <input
                                    type="text"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.slug}
                                    onChange={e => {
                                        setSlugEdited(true);
                                        handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    }}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        {/* Row 2: Organizer (1fr) + Country (1fr) + Region (1fr) + Season (1fr) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr 1fr 1fr', gap: '1.5rem' }}>
                            <div style={S.formGroup}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <label style={{ ...S.label, marginBottom: 0 }}>Organizer (Union/Federation)</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreatingUnion(!isCreatingUnion)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: T.neon,
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: '2px 4px',
                                        }}
                                    >
                                        {isCreatingUnion ? '✕ Cancel NEW' : '+ CREATE NEW'}
                                    </button>
                                </div>
                                {isCreatingUnion ? (
                                    <input
                                        type="text"
                                        placeholder="New Union Name..."
                                        style={{ ...S.input, borderColor: T.neon }}
                                        value={newUnionName}
                                        onChange={e => {
                                            setNewUnionName(e.target.value);
                                            setIsDirty(true);
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    <select
                                        style={S.input}
                                        value={form.union_id}
                                        onChange={e => handleChange('union_id', e.target.value)}
                                        onFocus={e => { e.target.style.borderColor = T.neon; }}
                                        onBlur={e => { e.target.style.borderColor = T.border; }}
                                    >
                                        <option value="">Select existing...</option>
                                        {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Country</label>
                                <select
                                    style={S.input}
                                    value={form.country_id}
                                    onChange={e => handleChange('country_id', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; }}
                                >
                                    <option value="">No especificado</option>
                                    {countryOptions.map((country) => (
                                        <option key={country.id} value={country.id}>{country.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Region</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="State / Region"
                                    value={form.region}
                                    onChange={e => handleChange('region', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Season</label>
                                <input
                                    type="text"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.season_id}
                                    onChange={e => handleChange('season_id', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 280px)', gap: '1.5rem', marginTop: '1rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Public Priority</label>
                                <input
                                    type="number"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.priority}
                                    onChange={e => handleChange('priority', Number.parseInt(e.target.value, 10) || 0)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                                <div style={{ color: T.textDim, fontSize: '0.72rem', marginTop: '0.45rem' }}>
                                    Higher numbers appear first in the public view. Equal priority falls back to alphabetical order.
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Visibility toggle + Status */}
                        <div style={{
                            display: 'flex',
                            gap: '3rem',
                            marginTop: '1rem',
                            borderTop: `1px solid ${T.border}`,
                            paddingTop: '1.5rem',
                            alignItems: 'center',
                        }}>
                            {/* Visibility */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ ...S.label, marginBottom: 0 }}>Visible in Catalogue</label>
                                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 20 }}>
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={form.is_visible}
                                        onChange={e => handleChange('is_visible', e.target.checked)}
                                    />
                                    <div className="peer-checked:bg-[rgba(0,255,102,0.1)] peer-checked:border-[#00FF66] after:peer-checked:translate-x-5 after:peer-checked:bg-[#00FF66]"
                                        style={{
                                            position: 'absolute', inset: 0,
                                            backgroundColor: T.bgSurface,
                                            border: `1px solid ${T.border}`,
                                            borderRadius: 20,
                                            transition: '0.4s',
                                            cursor: 'pointer',
                                        }}>
                                        <div
                                            className="peer-checked:translate-x-5 peer-checked:bg-[#00FF66]"
                                            style={{
                                                position: 'absolute',
                                                height: 14, width: 14,
                                                left: 2, bottom: 2,
                                                backgroundColor: form.is_visible ? T.neon : T.textDim,
                                                borderRadius: '50%',
                                                transition: '0.4s',
                                                transform: form.is_visible ? 'translateX(20px)' : 'translateX(0)',
                                            }}
                                        />
                                    </div>
                                </label>
                            </div>

                            {/* Status */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ ...S.label, marginBottom: 0 }}>Status</label>
                                <div style={{ display: 'flex', gap: '0' }}>
                                    {(['draft', 'live'] as const).map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => handleChange('status', s)}
                                            style={{
                                                padding: '0.3rem 0.9rem',
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                fontFamily: T.mono,
                                                cursor: 'pointer',
                                                border: `1px solid ${T.border}`,
                                                borderRadius: s === 'draft' ? `${T.radius} 0 0 ${T.radius}` : `0 ${T.radius} ${T.radius} 0`,
                                                marginLeft: s === 'live' ? '-1px' : 0,
                                                backgroundColor: form.status === s ? T.neonDim : T.bgSurface,
                                                color: form.status === s ? T.neon : T.textDim,
                                                borderColor: form.status === s ? T.neonDim : T.border,
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ════════════════════════════════════════════════════
                            SECTION 2 — Sport & Classification
                        ════════════════════════════════════════════════════ */}
                    <section id="classification" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Sport &amp; Classification</h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    Determine where this tournament appears in the multisport engine.
                                </p>
                            </div>
                        </div>

                        {/* Sport tiles */}
                        <label style={S.label}>Select Sport</label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: '1rem',
                            marginTop: '0.5rem',
                        }}>
                            {SPORTS.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => handleChange('sport_id', s.id)}
                                    style={{
                                        border: `1px solid ${form.sport_id === s.id ? T.neon : T.border}`,
                                        padding: '1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                        borderRadius: T.radius,
                                        backgroundColor: form.sport_id === s.id ? T.neonDim : 'transparent',
                                        color: form.sport_id === s.id ? T.neon : T.textDim,
                                        fontFamily: T.sans,
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }}>{s.emoji}</span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {s.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Category + Age Grade */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Competition Category</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="e.g. First Division, Women's A"
                                    value={form.category}
                                    onChange={e => handleChange('category', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Age Grade</label>
                                <select
                                    style={S.input}
                                    value={form.age_grade}
                                    onChange={e => handleChange('age_grade', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; }}
                                >
                                    <option>Mayores</option>
                                    <option>Juveniles</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ════════════════════════════════════════════════════
                            SECTION 3 — Format & Rules Builder
                        ════════════════════════════════════════════════════ */}
                    <section id="format" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Format &amp; Rules Builder</h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    Configure stages, scoring systems, and tie-breakers.
                                </p>
                            </div>
                        </div>

                        {/* Warning box (only when editing) */}
                        {!isCreate && (
                            <div style={{
                                backgroundColor: T.warnBg,
                                border: `1px solid ${T.warnBorder}`,
                                color: T.warn,
                                padding: '1rem',
                                borderRadius: T.radius,
                                fontSize: '0.85rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                gap: '1rem',
                                alignItems: 'center',
                            }}>
                                <span>⚠️</span>
                                <div>
                                    <strong>Active Tournament:</strong> Changing rules will trigger a full recalculation of current standings.
                                </div>
                            </div>
                        )}

                        {/* Phase container */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {ruleset.phases.map((phase: any, idx: number) => (
                                <div key={phase.id} style={{
                                    backgroundColor: T.bgDeep,
                                    border: `1px solid ${T.border}`,
                                    borderRadius: T.radius,
                                    padding: '1.5rem',
                                    position: 'relative',
                                }}>
                                    {/* Phase header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{
                                                backgroundColor: T.neon,
                                                color: T.bgDeep,
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '2px',
                                                fontSize: '0.6rem',
                                                fontWeight: 900,
                                                fontFamily: T.mono
                                            }}>PHASE_{String(idx + 1).padStart(2, '0')}</span>
                                            <input
                                                type="text"
                                                value={phase.name}
                                                onChange={e => handleRulesetChange(`phases.${idx}.name`, e.target.value)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: T.textMain,
                                                    fontFamily: T.sans,
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    padding: '2px 4px',
                                                    outline: 'none',
                                                    borderBottom: `1px solid transparent`
                                                }}
                                                onFocus={e => e.target.style.borderBottomColor = T.neon}
                                                onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                                            />
                                        </div>
                                        {ruleset.phases.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removePhase(idx)}
                                                style={{ ...S.btnGhost, padding: '0.25rem', color: T.danger, minHeight: 0 }}
                                            >
                                                ✕ Remove
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '2rem' }}>
                                        {/* Left: format & points */}
                                        <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: '2rem' }}>
                                            <div style={S.formGroup}>
                                                <label style={S.label}>Competition Format</label>
                                                <select
                                                    value={phase.format}
                                                    onChange={e => handleRulesetChange(`phases.${idx}.format`, e.target.value)}
                                                    style={S.input}
                                                >
                                                    {FORMAT_OPTIONS.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
                                                <div>
                                                    <label style={{ ...S.label, fontSize: '0.6rem' }}>Win</label>
                                                    <input
                                                        type="number"
                                                        value={phase.standings.points_base.win}
                                                        onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.win`, parseInt(e.target.value) || 0)}
                                                        style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ ...S.label, fontSize: '0.6rem' }}>Draw</label>
                                                    <input
                                                        type="number"
                                                        value={phase.standings.points_base.draw}
                                                        onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.draw`, parseInt(e.target.value) || 0)}
                                                        style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ ...S.label, fontSize: '0.6rem' }}>Loss</label>
                                                    <input
                                                        type="number"
                                                        value={phase.standings.points_base.loss}
                                                        onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.loss`, parseInt(e.target.value) || 0)}
                                                        style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Bonus rules */}
                                            <div style={{ marginTop: '1.5rem', borderTop: `1px solid ${T.border}`, paddingTop: '1.5rem' }}>
                                                <label style={S.label}>Bonus Points System</label>

                                                {phase.standings.bonus_rules.map((rule: any) => (
                                                    <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                                        <span style={{ flex: 1, fontSize: '0.8rem', color: T.textMain }}>{rule.label}</span>
                                                        <input
                                                            type="number"
                                                            value={rule.points_awarded}
                                                            onChange={e => {
                                                                const updated = phase.standings.bonus_rules.map((r: any) =>
                                                                    r.id === rule.id ? { ...r, points_awarded: parseInt(e.target.value) || 0 } : r
                                                                );
                                                                handleRulesetChange(`phases.${idx}.standings.bonus_rules`, updated);
                                                            }}
                                                            style={{
                                                                ...S.input,
                                                                width: 60,
                                                                textAlign: 'center',
                                                                padding: '0.4rem',
                                                                fontFamily: T.mono,
                                                                color: T.neon,
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeBonusRule(idx, rule.id)}
                                                            style={{ ...S.btnGhost, padding: '0.2rem 0.4rem', color: T.danger }}
                                                        >✕</button>
                                                    </div>
                                                ))}

                                                {/* Add bonus rule */}
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                                    <input
                                                        type="text"
                                                        style={{ ...S.input, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                                        placeholder="Add rule for this phase..."
                                                        value={newBonusLabel}
                                                        onChange={e => setNewBonusLabel(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && addBonusRule(idx)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => addBonusRule(idx)}
                                                        style={{ ...S.btnGhost, padding: '0.4rem 0.75rem', fontSize: '0.65rem', border: `1px dashed ${T.border}`, borderRadius: T.radius, whiteSpace: 'nowrap' }}
                                                    >
                                                        + ADD
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Tie-breaker list */}
                                        <div>
                                            <label style={S.label}>Tie-Breaker Priority</label>
                                            {phase.tiebreakers.order.map((key: string, tbIdx: number) => (
                                                <div
                                                    key={key}
                                                    style={{
                                                        backgroundColor: T.bgSurface,
                                                        border: `1px solid ${T.border}`,
                                                        padding: '0.5rem 1rem',
                                                        marginBottom: '0.5rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '1rem',
                                                        fontSize: '0.8rem',
                                                        borderRadius: T.radius,
                                                    }}
                                                >
                                                    <span style={{ color: T.textDim, fontFamily: T.mono, letterSpacing: '0.1em' }}>⋮⋮</span>
                                                    <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.neon, fontWeight: 700, minWidth: '1.2rem' }}>
                                                        {tbIdx + 1}
                                                    </span>
                                                    <span style={{ flex: 1, color: T.textMain }}>
                                                        {TIEBREAKER_LABELS[key] ?? key}
                                                    </span>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                                        <button
                                                            type="button"
                                                            disabled={tbIdx === 0}
                                                            onClick={() => moveTiebreaker(idx, tbIdx, -1)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: '0.6rem', padding: '1px', lineHeight: 1 }}
                                                        >▲</button>
                                                        <button
                                                            type="button"
                                                            disabled={tbIdx === phase.tiebreakers.order.length - 1}
                                                            onClick={() => moveTiebreaker(idx, tbIdx, 1)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: '0.6rem', padding: '1px', lineHeight: 1 }}
                                                        >▼</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Add New Phase button */}
                            <button
                                type="button"
                                onClick={addNewPhase}
                                style={{
                                    width: '100%',
                                    border: `2px dashed ${T.border}`,
                                    padding: '2rem',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: T.textDim,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    borderRadius: T.radius,
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontFamily: T.sans,
                                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = T.neon;
                                    (e.currentTarget as HTMLElement).style.color = T.neon;
                                    (e.currentTarget as HTMLElement).style.backgroundColor = T.neonDim;
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = T.border;
                                    (e.currentTarget as HTMLElement).style.color = T.textDim;
                                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                }}
                            >
                                + ADD NEW COMPETITION PHASE
                            </button>
                        </div>
                    </section>

                    {/* ── Footer actions ───────────────────────────────────── */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                        <button
                            type="button"
                            onClick={() => router.push('/admin/entities')}
                            style={S.btnSecondary}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = T.bgSurface;
                                (e.currentTarget as HTMLElement).style.borderColor = T.textDim;
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                (e.currentTarget as HTMLElement).style.borderColor = T.border;
                            }}
                        >
                            Discard Changes
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSaving}
                            style={{ ...S.btnPrimary, padding: '1rem 3rem', opacity: isSaving ? 0.6 : 1 }}
                            onMouseEnter={e => !isSaving && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
                        >
                            {isSaving ? 'Processing...' : (isCreate ? 'Complete Tournament Setup' : 'Save Changes')}
                        </button>
                    </div>

                </main>
            </div>
        </div>
    );
}
