'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Layers3, Plus, RotateCcw, Save, Settings2, Sparkles, Target, Zap } from 'lucide-react';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import {
    getDefaultMatchEventDefinitions,
    resolveMatchEventDefinitions,
    type MatchEventCategory,
    type MatchEventDefinition,
} from '@/lib/matchEventCatalog';
import { SPORTS } from '@/lib/data/sports';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { useTournamentDirty } from './TournamentContext';
import styles from './TournamentFormatTab.module.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentFormatRow = TournamentRow & {
    ruleset?: Record<string, unknown> | null;
    is_api_managed?: boolean | null;
};

const CATEGORY_OPTIONS: Array<{ value: MatchEventCategory; label: string }> = [
    { value: 'score', label: 'Puntuación' },
    { value: 'card', label: 'Tarjeta' },
    { value: 'discipline', label: 'Disciplina' },
    { value: 'substitution', label: 'Cambio' },
    { value: 'clock', label: 'Reloj' },
    { value: 'other', label: 'Otro' },
];

const REQUIREMENT_OPTIONS = [
    { value: 'required', label: 'Obligatorio' },
    { value: 'optional', label: 'Opcional' },
    { value: 'none', label: 'No aplica' },
] as const;

function cloneDefinitions(definitions: MatchEventDefinition[]) {
    return definitions.map((definition) => ({ ...definition }));
}

function sanitizeDefinitions(definitions: MatchEventDefinition[]) {
    return definitions
        .map((definition, index) => ({
            ...definition,
            type: definition.type.trim() || `custom_${index + 1}`,
            label: definition.label.trim() || definition.type.trim() || `Evento ${index + 1}`,
            points: Number.isFinite(Number(definition.points)) ? Number(definition.points) : 0,
        }))
        .filter((definition, index, items) =>
            items.findIndex((candidate) => candidate.type === definition.type) === index || definition.type.startsWith('custom_'),
        );
}

export function TournamentFormatTab({ data, id }: { data?: TournamentRow; id?: string; matchCount?: number }) {
    const tournament = (data || {}) as TournamentFormatRow;
    const tournamentId = id || tournament.id;
    const router = useRouter();
    const { setDirty: setGlobalDirty } = useTournamentDirty();
    const isApiManaged = tournament.is_api_managed || false;
    const sportId = tournament.sport_id || null;
    const sportLabel = sportId ? (SPORTS[sportId as keyof typeof SPORTS]?.nameEs || SPORTS[sportId as keyof typeof SPORTS]?.name || sportId) : 'Sin deporte';

    const [definitions, setDefinitions] = useState<MatchEventDefinition[]>(() =>
        resolveMatchEventDefinitions({
            sportId,
            tournamentRuleset: tournament.ruleset as Record<string, unknown> | null | undefined,
        }),
    );
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const scoringEvents = definitions.filter((definition) => definition.category === 'score');
    const categoryCount = new Set(definitions.map((definition) => definition.category)).size;
    const totalScoringPoints = scoringEvents.reduce((sum, definition) => sum + definition.points, 0);

    useEffect(() => {
        setDefinitions(
            resolveMatchEventDefinitions({
                sportId: tournament.sport_id || null,
                tournamentRuleset: tournament.ruleset as Record<string, unknown> | null | undefined,
            }),
        );
        setIsDirty(false);
        setMessage(null);
    }, [tournament.ruleset, tournament.sport_id, tournamentId]);

    useEffect(() => {
        setGlobalDirty(isDirty);
    }, [isDirty, setGlobalDirty]);

    useLeaveConfirm(isDirty);

    const markDirty = useCallback(() => {
        setIsDirty(true);
        setMessage(null);
    }, []);

    const updateDefinition = useCallback((index: number, patch: Partial<MatchEventDefinition>) => {
        setDefinitions((current) => current.map((definition, currentIndex) => (
            currentIndex === index ? { ...definition, ...patch } : definition
        )));
        markDirty();
    }, [markDirty]);

    const removeDefinition = useCallback((index: number) => {
        setDefinitions((current) => current.filter((_, currentIndex) => currentIndex !== index));
        markDirty();
    }, [markDirty]);

    const addDefinition = useCallback(() => {
        const defaults = getDefaultMatchEventDefinitions(sportId);
        const usedTypes = new Set(definitions.map((definition) => definition.type));
        const nextPreset = defaults.find((definition) => !usedTypes.has(definition.type));

        setDefinitions((current) => ([
            ...current,
            nextPreset
                ? { ...nextPreset }
                : {
                    type: `custom_${Date.now()}`,
                    label: 'Evento personalizado',
                    category: 'other',
                    points: 0,
                    team: 'optional',
                    player: 'optional',
                },
        ]));
        markDirty();
    }, [definitions, markDirty, sportId]);

    const resetDefaults = useCallback(() => {
        setDefinitions(cloneDefinitions(getDefaultMatchEventDefinitions(sportId)));
        markDirty();
    }, [markDirty, sportId]);

    const handleSave = useCallback(async () => {
        if (!tournamentId) return;

        setIsSaving(true);
        setMessage(null);
        try {
            const nextMatchEvents = sanitizeDefinitions(definitions);
            const nextRuleset = {
                ...(tournament.ruleset || {}),
                matchEvents: nextMatchEvents,
            };

            await updateEntity('tournament', tournamentId, {
                ruleset: nextRuleset,
            });

            window.dispatchEvent(new CustomEvent('tournament:match-events-updated', {
                detail: {
                    tournamentId,
                    matchEvents: nextMatchEvents,
                },
            }));

            setIsDirty(false);
            setMessage({ type: 'success', text: 'Formato guardado. La gestión de partidos ya usa esta configuración.' });
            router.refresh();
        } catch (error: unknown) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar el formato.' });
        } finally {
            setIsSaving(false);
        }
    }, [definitions, router, tournament.ruleset, tournamentId]);

    const handleSaveRef = useRef<() => void>(() => { });
    handleSaveRef.current = () => {
        void handleSave();
    };

    useEffect(() => {
        const listener = () => {
            if (isDirty && !isApiManaged) {
                handleSaveRef.current();
            }
        };

        window.addEventListener('tournament:save', listener);
        return () => window.removeEventListener('tournament:save', listener);
    }, [isApiManaged, isDirty]);

    return (
        <div className="flash-ui-container dark bg-transparent" style={{ '--accent': '#00a365', minHeight: 'auto' } as CSSProperties}>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-28 md:pb-20">
                {message && (
                    <div className={`p-4 text-sm border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                        {message.text}
                    </div>
                )}

                <div className={`manager-card ${styles.surface} ${isApiManaged ? 'opacity-60 pointer-events-none grayscale-[0.5]' : ''}`}>
                    <header className={`manager-header ${styles.heroHeader}`}>
                        <div className={`manager-header-titles ${styles.heroTitles}`}>
                            <div className={styles.kicker}>Motor de gestión</div>
                            <h1 className={styles.heroHeading}><Settings2 className="w-6 h-6 text-[var(--accent)]" /> Formato de eventos</h1>
                            <p className={styles.heroDescription}>Definí qué acciones puede cargar el operador, cómo se nombran y qué impacto tienen dentro de la gestión del partido.</p>
                        </div>
                        <div className={`manager-metadata-box ${styles.sportBadge}`}>
                            <span>Deporte</span>
                            <strong>{sportLabel}</strong>
                        </div>
                    </header>

                    <section className={styles.summaryGrid}>
                        <article className={styles.summaryCard}>
                            <div className={styles.summaryIcon}><Zap size={18} /></div>
                            <span>Eventos activos</span>
                            <strong>{definitions.length}</strong>
                            <small>Disponibles para la consola del partido</small>
                        </article>
                        <article className={styles.summaryCard}>
                            <div className={styles.summaryIcon}><Target size={18} /></div>
                            <span>Eventos de puntuación</span>
                            <strong>{scoringEvents.length}</strong>
                            <small>{totalScoringPoints} puntos combinados entre presets</small>
                        </article>
                        <article className={styles.summaryCard}>
                            <div className={styles.summaryIcon}><Layers3 size={18} /></div>
                            <span>Categorías cubiertas</span>
                            <strong>{categoryCount}</strong>
                            <small>Balance entre juego, disciplina y reloj</small>
                        </article>
                    </section>

                    <div className={styles.layout}>
                        <aside className={styles.sidebar}>
                            <div className={styles.infoCard}>
                                <div className={styles.blockLabel}>Fuente de verdad</div>
                                <p className={styles.blockCopy}>
                                    La consola de gestión de partido toma esta lista desde la base de datos. Si aquí cambias el deporte o los eventos disponibles, la pestaña <strong>Eventos</strong> del partido se adapta.
                                </p>
                            </div>

                            <div className={styles.actionCard}>
                                <div className={styles.blockLabel}>Acciones rápidas</div>
                                <div className={styles.actionStack}>
                                    <button type="button" className={`${styles.primaryAction} manager-btn-inline`} onClick={addDefinition} disabled={isApiManaged}>
                                        <Plus size={14} /> Agregar evento
                                    </button>
                                    <button type="button" className={`${styles.secondaryAction} manager-btn-inline secondary`} onClick={resetDefaults} disabled={isApiManaged}>
                                        <RotateCcw size={14} /> Restaurar preset del deporte
                                    </button>
                                </div>
                            </div>

                            <div className={styles.infoCard}>
                                <div className={styles.blockLabel}>Criterio visual</div>
                                <div className={styles.ruleList}>
                                    <div>
                                        <span className={styles.ruleDot} />
                                        <p>Los eventos de puntuación reciben prioridad y destaque visual.</p>
                                    </div>
                                    <div>
                                        <span className={styles.ruleDot} />
                                        <p>Tarjetas, cambios y reloj se agrupan por categoría para acelerar carga operativa.</p>
                                    </div>
                                    <div>
                                        <span className={styles.ruleDot} />
                                        <p>La etiqueta visible es el texto que después verá el operador en gestión.</p>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        <main className={styles.eventList}>
                            {definitions.length === 0 ? (
                                <div className={styles.emptyState}>
                                    No hay eventos configurados todavía.
                                </div>
                            ) : (
                                definitions.map((definition, index) => {
                                    const presetOptions = getDefaultMatchEventDefinitions(sportId);
                                    const hasCurrentType = presetOptions.some((preset) => preset.type === definition.type);
                                    const categoryLabel = CATEGORY_OPTIONS.find((option) => option.value === definition.category)?.label || definition.category;

                                    return (
                                        <article key={`${definition.type}-${index}`} className={styles.eventCard} data-category={definition.category}>
                                            <div className={styles.eventCardHeader}>
                                                <div className={styles.eventIdentity}>
                                                    <span className={styles.eventIndex}>{String(index + 1).padStart(2, '0')}</span>
                                                    <div>
                                                        <div className={styles.eventTitle}>{definition.label}</div>
                                                        <div className={styles.eventMeta}>
                                                            <span>{categoryLabel}</span>
                                                            <span>Equipo: {definition.team}</span>
                                                            <span>Jugador: {definition.player}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`${styles.removeButton} manager-btn-inline secondary`}
                                                    onClick={() => removeDefinition(index)}
                                                    disabled={isApiManaged}
                                                >
                                                    Quitar
                                                </button>
                                            </div>

                                            <div className={styles.formGrid}>
                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Evento base</span>
                                                    <select
                                                        className={`manager-url-select ${styles.fieldInput}`}
                                                        value={definition.type}
                                                        onChange={(event) => {
                                                            const nextType = event.target.value;
                                                            const preset = getDefaultMatchEventDefinitions(sportId).find((item) => item.type === nextType);
                                                            updateDefinition(index, preset ? { ...preset } : { type: nextType });
                                                        }}
                                                        disabled={isApiManaged}
                                                    >
                                                        {!hasCurrentType && <option value={definition.type}>{definition.label}</option>}
                                                        {presetOptions.map((preset) => (
                                                            <option key={preset.type} value={preset.type}>{preset.label}</option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Etiqueta visible</span>
                                                    <input
                                                        type="text"
                                                        className={`manager-url-input ${styles.fieldInput}`}
                                                        value={definition.label}
                                                        onChange={(event) => updateDefinition(index, { label: event.target.value })}
                                                        disabled={isApiManaged}
                                                    />
                                                </label>

                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Puntos</span>
                                                    <input
                                                        type="number"
                                                        className={`manager-url-input ${styles.fieldInput}`}
                                                        value={definition.points}
                                                        onChange={(event) => updateDefinition(index, { points: Number.parseInt(event.target.value, 10) || 0 })}
                                                        disabled={isApiManaged}
                                                    />
                                                </label>

                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Categoría</span>
                                                    <select
                                                        className={`manager-url-select ${styles.fieldInput}`}
                                                        value={definition.category}
                                                        onChange={(event) => updateDefinition(index, { category: event.target.value as MatchEventCategory })}
                                                        disabled={isApiManaged}
                                                    >
                                                        {CATEGORY_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Equipo</span>
                                                    <select
                                                        className={`manager-url-select ${styles.fieldInput}`}
                                                        value={definition.team}
                                                        onChange={(event) => updateDefinition(index, { team: event.target.value as MatchEventDefinition['team'] })}
                                                        disabled={isApiManaged}
                                                    >
                                                        {REQUIREMENT_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className={styles.fieldBlock}>
                                                    <span className="manager-field-label">Jugador</span>
                                                    <select
                                                        className={`manager-url-select ${styles.fieldInput}`}
                                                        value={definition.player}
                                                        onChange={(event) => updateDefinition(index, { player: event.target.value as MatchEventDefinition['player'] })}
                                                        disabled={isApiManaged}
                                                    >
                                                        {REQUIREMENT_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>

                                            <div className={styles.footerStrip}>
                                                <div className={styles.roleChips}>
                                                    <span className={styles.roleChip}>Tipo: {definition.type}</span>
                                                    <span className={styles.roleChip}>{definition.points > 0 ? `${definition.points} pts` : 'Sin puntos'}</span>
                                                </div>
                                                <div className={styles.footerHint}>
                                                    <Sparkles size={14} />
                                                    <span>Se aplica automáticamente en la consola de partido</span>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </main>
                    </div>
                </div>

                <div className="basalt-mobile-savebar">
                    <button
                        className="manager-btn-inline"
                        style={{ padding: '12px 24px', fontSize: '14px', borderRadius: '4px' }}
                        onClick={() => void handleSave()}
                        disabled={isSaving || !isDirty || isApiManaged}
                    >
                        <Save size={14} />
                        {isSaving ? 'Guardando...' : 'Guardar formato'}
                    </button>
                </div>
            </div>
        </div>
    );
}
