'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { CategoryPicker } from '@/components/clubs/CategoryPicker';
import {
    categoryOptionLevel,
    categoryOptionVariant,
    findCategoryByLevel,
    type CategoryOption,
} from '@/lib/clubs/categoryPresets';
import { requestCategory } from '@/lib/clubs/requestCategory';
import { APP_TIMEZONE } from '@/lib/timezone';
import styles from './PanelMatchForm.module.css';

/**
 * Alta de partido del club: la usan el Panel del Día de la ficha pública y la
 * sección "Crear partido" del gestor de club.
 *
 * Es una guía de tres pasos, de a uno abierto por vez: tu categoría, el rival,
 * y cuándo y dónde. En el teléfono los tres bloques abiertos a la vez eran una
 * pared de botones; así se ve solo lo que toca decidir ahora, y lo ya decidido
 * queda resumido en una línea que se toca para cambiarlo.
 *
 * El botón final nunca está muerto: si falta algo, dice qué y lleva al paso
 * donde se completa.
 *
 * El rival no es un club: es una CATEGORÍA de otro club. Elegir la propia
 * arrastra la del rival si existe la misma (M16 B contra M16 B).
 */

export type PanelFamilyClub = { id: string; name: string; isBase: boolean };

type RivalClub = { id: string; name: string; categories: CategoryOption[] };
type Competition = { id: string; name: string };
type StepId = 'ours' | 'rival' | 'when';

interface PanelMatchFormProps {
    clubId: string;
    familyClubs: PanelFamilyClub[];
    defaultDate: string;
    onCreated: () => void;
    onCancel: () => void;
}

/** `YYYY-MM-DD` de hoy en la hora del sitio. */
function todayKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function addDays(key: string, days: number): string {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekdayOf(key: string): number {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "sáb 4/10": corto, para los botones de fecha. */
function shortDay(key: string): string {
    const [year, month, day] = key.split('-').map(Number);
    const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, month - 1, day)))
        .replace('.', '');
    return `${weekday} ${day}/${month}`;
}

/** "sábado 4 de octubre": para el resumen. */
function longDay(key: string): string {
    const [year, month, day] = key.split('-').map(Number);
    if (!year || !month || !day) return '';
    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Los atajos de fecha: hoy, mañana y el fin de semana que viene (o este). */
function quickDates(today: string): Array<{ key: string; label: string }> {
    const result: Array<{ key: string; label: string }> = [
        { key: today, label: 'Hoy' },
        { key: addDays(today, 1), label: 'Mañana' },
    ];
    const saturday = addDays(today, (6 - weekdayOf(today) + 7) % 7);
    for (const key of [saturday, addDays(saturday, 1)]) {
        if (!result.some((item) => item.key === key)) result.push({ key, label: shortDay(key) });
    }
    return result;
}

interface StepProps {
    id: StepId;
    index: number;
    title: string;
    open: boolean;
    done: boolean;
    /** Lo elegido, en una línea: se ve con el paso cerrado. */
    summary: string | null;
    onToggle: () => void;
    children: ReactNode;
}

/**
 * Un paso de la guía. El cuerpo se abre y se cierra animando la altura con
 * `grid-template-rows` (0fr a 1fr), que no necesita medir nada en JS.
 */
function Step({ id, index, title, open, done, summary, onToggle, children }: StepProps) {
    const ref = useRef<HTMLElement | null>(null);
    const wasOpen = useRef(open);

    // Al abrirse, el paso sube a la vista: en el teléfono el que se abre suele
    // quedar debajo del pliegue, y el que se cerró arriba ya no ocupa lugar.
    useEffect(() => {
        if (open && !wasOpen.current) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.setTimeout(() => {
                ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
            }, 140);
        }
        wasOpen.current = open;
    }, [open]);

    return (
        <section
            ref={ref}
            className={[styles.step, open ? styles.stepOpen : '', done ? styles.stepDone : ''].join(' ')}
            aria-labelledby={`pmf-${id}-title`}
        >
            <button
                type="button"
                className={styles.stepHead}
                aria-expanded={open}
                aria-controls={`pmf-${id}-body`}
                onClick={onToggle}
            >
                <span className={styles.stepBadge} aria-hidden="true">
                    {done && !open ? <Check size={14} strokeWidth={3} className={styles.stepCheck} /> : index}
                </span>
                <span className={styles.stepHeadCopy}>
                    <span id={`pmf-${id}-title`} className={styles.stepTitle}>{title}</span>
                    {!open && summary && <span className={styles.stepSummary}>{summary}</span>}
                </span>
                <ChevronDown size={18} aria-hidden="true" className={styles.stepChevron} />
            </button>
            <div id={`pmf-${id}-body`} className={styles.stepBody} aria-hidden={!open}>
                <div className={styles.stepInner}>
                    {/* Montado aunque esté cerrado: así no se pierde lo que se tocó y
                        el cierre anima con contenido. `visibility` (en el CSS) lo saca
                        del teclado y de los lectores mientras está cerrado. */}
                    <div className={styles.stepContent}>{children}</div>
                </div>
            </div>
        </section>
    );
}

export default function PanelMatchForm({
    clubId,
    familyClubs,
    defaultDate,
    onCreated,
    onCancel,
}: PanelMatchFormProps) {
    // La familia se guarda en estado y no se lee del prop: cuando se crea una
    // categoría propia tiene que aparecer sin recargar nada.
    const [ourClubs, setOurClubs] = useState<CategoryOption[]>(familyClubs);
    useEffect(() => { setOurClubs(familyClubs); }, [familyClubs]);

    const base = ourClubs.find((club) => club.isBase) ?? ourClubs[0] ?? null;
    const [ourClubId, setOurClubId] = useState('');
    const [step, setStep] = useState<StepId | null>('ours');

    const [rivalQuery, setRivalQuery] = useState('');
    const [rivalResults, setRivalResults] = useState<RivalClub[]>([]);
    const [rivalSearching, setRivalSearching] = useState(false);
    const [rivalClub, setRivalClub] = useState<RivalClub | null>(null);
    const [rivalCategoryId, setRivalCategoryId] = useState('');

    const today = useMemo(() => todayKey(), []);
    const dateOptions = useMemo(() => quickDates(today), [today]);
    const [isHome, setIsHome] = useState(true);
    const [date, setDate] = useState(defaultDate || today);
    const [time, setTime] = useState('16:00');
    const [venue, setVenue] = useState('');

    const [competitionOpen, setCompetitionOpen] = useState(false);
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [competitionId, setCompetitionId] = useState('');
    const [newCompetitionName, setNewCompetitionName] = useState('');
    const [creatingCompetition, setCreatingCompetition] = useState(false);

    const [categoryError, setCategoryError] = useState<{ side: 'ours' | 'rival'; text: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Las competencias propias del club. Si la ruta no contesta, el alta sigue:
    // la competencia es opcional.
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/club-admin/tournaments?club=${encodeURIComponent(clubId)}`, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (cancelled || !payload?.ok) return;
                const pending = Array.isArray(payload.data?.pending) ? payload.data.pending : [];
                setCompetitions(pending.map((row: { id: string; name: string }) => ({ id: row.id, name: row.name })));
            })
            .catch(() => { /* la competencia es opcional: sin listado el alta sigue */ });
        return () => { cancelled = true; };
    }, [clubId]);

    // Buscador con espera: sin esto son cinco consultas mientras se escribe
    // "Jockey", y la última en volver puede no ser la del texto actual.
    const searchSeq = useRef(0);
    useEffect(() => {
        const term = rivalQuery.trim();
        if (rivalClub || term.length < 2) {
            setRivalResults([]);
            setRivalSearching(false);
            return;
        }

        setRivalSearching(true);
        const seq = ++searchSeq.current;
        const timer = setTimeout(() => {
            fetch(`/api/clubs/${encodeURIComponent(clubId)}/rival-search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
                .then((response) => (response.ok ? response.json() : null))
                .then((payload) => {
                    if (seq !== searchSeq.current) return;
                    setRivalResults(payload?.ok && Array.isArray(payload.clubs) ? payload.clubs : []);
                })
                .catch(() => { if (seq === searchSeq.current) setRivalResults([]); })
                .finally(() => { if (seq === searchSeq.current) setRivalSearching(false); });
        }, 300);

        return () => clearTimeout(timer);
    }, [rivalQuery, clubId, rivalClub]);

    const ourCategory = ourClubs.find((club) => club.id === ourClubId) ?? null;
    const rivalCategory = rivalClub?.categories.find((category) => category.id === rivalCategoryId) ?? null;

    /** La categoría del rival que juega contra la nuestra: mismo rango y, si hay, misma letra. */
    const twinFor = useCallback((own: CategoryOption | null, rival: RivalClub | null): string => {
        if (!own || !rival) return '';
        const level = categoryOptionLevel(own);
        if (!level) return '';
        const twin = findCategoryByLevel(rival.categories, level, categoryOptionVariant(own))
            ?? findCategoryByLevel(rival.categories, level);
        return twin?.id ?? '';
    }, []);

    const selectOurs = (option: CategoryOption) => {
        setOurClubId(option.id);
        setCategoryError(null);
        const twin = twinFor(option, rivalClub);
        if (twin) setRivalCategoryId(twin);
    };

    const selectRivalClub = (club: RivalClub) => {
        setRivalClub(club);
        setRivalQuery('');
        setRivalCategoryId(twinFor(ourCategory, club) || (club.categories.length === 1 ? club.categories[0].id : ''));
    };

    const clearRival = () => {
        setRivalClub(null);
        setRivalCategoryId('');
        setRivalQuery('');
    };

    const createOurs = async (label: string, level: string | null, variant: string | null) => {
        if (!base) return null;
        setCategoryError(null);
        const result = await requestCategory({ clubId, baseClubId: base.id, label, level, variant });
        if (!result.ok || !result.option) {
            setCategoryError({ side: 'ours', text: result.error || 'No se pudo crear la categoría.' });
            return null;
        }
        const option = result.option;
        setOurClubs((current) => (current.some((club) => club.id === option.id) ? current : [...current, option]));
        return option;
    };

    const createRival = async (label: string, level: string | null, variant: string | null) => {
        if (!rivalClub) return null;
        setCategoryError(null);
        const result = await requestCategory({ clubId, baseClubId: rivalClub.id, label, level, variant });
        if (!result.ok || !result.option) {
            setCategoryError({ side: 'rival', text: result.error || 'No se pudo crear la categoría.' });
            return null;
        }
        const option = result.option;
        setRivalClub((current) => (current
            ? {
                ...current,
                categories: current.categories.some((category) => category.id === option.id)
                    ? current.categories
                    : [...current.categories, option],
            }
            : current));
        return option;
    };

    const oursDone = Boolean(ourClubId);
    const rivalDone = Boolean(rivalClub && rivalCategoryId);

    /** Lo que falta y el paso donde se completa. */
    const missing = useMemo((): { text: string; step: StepId } | null => {
        if (!ourClubId) return { text: 'Elegí la categoría de tu club', step: 'ours' };
        if (!rivalClub) return { text: 'Buscá el rival', step: 'rival' };
        if (!rivalCategoryId) return { text: 'Elegí la categoría del rival', step: 'rival' };
        if (!date) return { text: 'Poné la fecha', step: 'when' };
        if (!time) return { text: 'Poné la hora', step: 'when' };
        return null;
    }, [ourClubId, rivalClub, rivalCategoryId, date, time]);

    const toggle = (id: StepId) => setStep((current) => (current === id ? null : id));

    const createCompetition = async () => {
        const name = newCompetitionName.trim();
        if (!name) return;

        setCreatingCompetition(true);
        setError(null);
        try {
            const response = await fetch('/api/club-admin/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId, name }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudo crear la competencia');
                return;
            }
            const created: Competition = { id: payload.data.id, name: payload.data.name };
            setCompetitions((current) => (current.some((c) => c.id === created.id) ? current : [created, ...current]));
            setCompetitionId(created.id);
            setNewCompetitionName('');
        } finally {
            setCreatingCompetition(false);
        }
    };

    const submit = async () => {
        if (missing) {
            setStep(missing.step);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/panel-matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ourClubId,
                    rivalClubId: rivalCategoryId,
                    isHome,
                    date,
                    time,
                    venue,
                    competitionId: competitionId || undefined,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudo cargar el partido');
                return;
            }
            onCreated();
        } catch {
            setError('No se pudo cargar el partido. Revisá la conexión y probá de nuevo.');
        } finally {
            setSubmitting(false);
        }
    };

    const homeName = isHome ? ourCategory?.name : rivalCategory?.name;
    const awayName = isHome ? rivalCategory?.name : ourCategory?.name;
    const competitionName = competitions.find((competition) => competition.id === competitionId)?.name ?? null;
    const when = [longDay(date), time ? `a las ${time}` : null].filter(Boolean).join(' ');
    const where = [isHome ? 'De local' : 'De visitante', venue.trim() || null, competitionName].filter(Boolean).join(', ');

    return (
        <div className={styles.form}>
            <div className={styles.head}>
                <h3 className={styles.title}>Cargar partido</h3>
                <button type="button" className={styles.linkButton} onClick={onCancel}>Cancelar</button>
            </div>

            <Step
                id="ours"
                index={1}
                title="Tu categoría"
                open={step === 'ours'}
                done={oursDone}
                summary={ourCategory?.name ?? null}
                onToggle={() => toggle('ours')}
            >
                <CategoryPicker
                    mode="select"
                    label="Categoría de tu club"
                    options={ourClubs}
                    baseName={base?.name ?? 'Tu club'}
                    selectedId={ourClubId || null}
                    onSelect={selectOurs}
                    onCreate={createOurs}
                />
                {categoryError?.side === 'ours' && <p className={styles.error}>{categoryError.text}</p>}
                <button
                    type="button"
                    className={styles.next}
                    disabled={!oursDone}
                    onClick={() => setStep(rivalDone ? 'when' : 'rival')}
                >
                    {oursDone ? 'Seguir con el rival' : 'Tocá una categoría'}
                </button>
            </Step>

            <Step
                id="rival"
                index={2}
                title="Rival"
                open={step === 'rival'}
                done={rivalDone}
                summary={rivalCategory?.name ?? rivalClub?.name ?? null}
                onToggle={() => toggle('rival')}
            >
                {rivalClub ? (
                    <>
                        <div className={styles.rivalPicked}>
                            <span className={styles.rivalName}>{rivalClub.name}</span>
                            <button
                                type="button"
                                className={styles.iconButton}
                                onClick={clearRival}
                                aria-label="Cambiar de rival"
                                title="Cambiar de rival"
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>
                        <CategoryPicker
                            mode="select"
                            label="Categoría del rival"
                            options={rivalClub.categories}
                            baseName={rivalClub.name}
                            selectedId={rivalCategoryId || null}
                            onSelect={(option) => { setRivalCategoryId(option.id); setCategoryError(null); }}
                            onCreate={createRival}
                        />
                        {categoryError?.side === 'rival' && <p className={styles.error}>{categoryError.text}</p>}
                        <button
                            type="button"
                            className={styles.next}
                            disabled={!rivalDone}
                            onClick={() => setStep('when')}
                        >
                            {rivalDone ? 'Seguir con la fecha' : 'Elegí la categoría del rival'}
                        </button>
                    </>
                ) : (
                    <>
                        <div className={styles.searchField}>
                            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                            <input
                                type="search"
                                className={`${styles.input} ${styles.searchInput}`}
                                placeholder="Buscá el club rival"
                                aria-label="Buscar el club rival"
                                value={rivalQuery}
                                onChange={(event) => setRivalQuery(event.target.value)}
                            />
                        </div>
                        {rivalQuery.trim().length >= 2 && (
                            <div className={styles.results}>
                                {rivalSearching ? (
                                    <p className={styles.hint}>Buscando…</p>
                                ) : rivalResults.length === 0 ? (
                                    <p className={styles.hint}>Ningún club de tu deporte con ese nombre.</p>
                                ) : (
                                    rivalResults.map((club, index) => (
                                        <button
                                            key={club.id}
                                            type="button"
                                            className={styles.result}
                                            style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
                                            onClick={() => selectRivalClub(club)}
                                        >
                                            <span>{club.name}</span>
                                            <span className={styles.resultMeta}>
                                                {club.categories.length <= 1
                                                    ? 'Sin categorías cargadas'
                                                    : `${club.categories.length} categorías`}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </Step>

            <Step
                id="when"
                index={3}
                title="Cuándo y dónde"
                open={step === 'when'}
                done={Boolean(date && time)}
                summary={when || null}
                onToggle={() => toggle('when')}
            >
                <div className={styles.segmented} role="radiogroup" aria-label="Localía" data-away={!isHome}>
                    <span className={styles.segmentThumb} aria-hidden="true" />
                    <button
                        type="button"
                        role="radio"
                        aria-checked={isHome}
                        className={isHome ? styles.segmentOn : styles.segment}
                        onClick={() => setIsHome(true)}
                    >
                        De local
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={!isHome}
                        className={!isHome ? styles.segmentOn : styles.segment}
                        onClick={() => setIsHome(false)}
                    >
                        De visitante
                    </button>
                </div>

                <div className={styles.field}>
                    <span className={styles.label}>Fecha</span>
                    <div className={styles.quick} role="radiogroup" aria-label="Fecha rápida">
                        {dateOptions.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                role="radio"
                                aria-checked={date === option.key}
                                className={date === option.key ? styles.quickOn : styles.quickChip}
                                onClick={() => setDate(option.key)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="date"
                        className={styles.input}
                        aria-label="Otra fecha"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>

                <div className={styles.row}>
                    <label className={styles.field}>
                        <span className={styles.label}>Hora</span>
                        <input
                            type="time"
                            className={styles.input}
                            value={time}
                            onChange={(event) => setTime(event.target.value)}
                        />
                    </label>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                        <span className={styles.label}>Cancha o sede (opcional)</span>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder={isHome ? 'La cancha del club' : 'La cancha del rival'}
                            value={venue}
                            onChange={(event) => setVenue(event.target.value)}
                        />
                    </label>
                </div>

                <button
                    type="button"
                    className={styles.disclosure}
                    aria-expanded={competitionOpen}
                    onClick={() => setCompetitionOpen((open) => !open)}
                >
                    <span className={styles.disclosureCopy}>
                        <span className={styles.label}>Competencia (opcional)</span>
                        <span className={styles.disclosureMeta}>
                            {competitionName ?? 'Sin competencia, es un partido suelto.'}
                        </span>
                    </span>
                    <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={competitionOpen ? styles.chevronOpen : styles.chevron}
                    />
                </button>

                {competitionOpen && (
                    <div className={styles.competition}>
                        <select
                            className={styles.input}
                            aria-label="Competencia del club"
                            value={competitionId}
                            onChange={(event) => setCompetitionId(event.target.value)}
                        >
                            <option value="">Ninguna, partido suelto</option>
                            {competitions.map((competition) => (
                                <option key={competition.id} value={competition.id}>{competition.name}</option>
                            ))}
                        </select>
                        <div className={styles.inline}>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="Nueva competencia del club"
                                aria-label="Nombre de una competencia nueva"
                                value={newCompetitionName}
                                onChange={(event) => setNewCompetitionName(event.target.value)}
                            />
                            <button
                                type="button"
                                className={styles.secondary}
                                onClick={createCompetition}
                                disabled={creatingCompetition || !newCompetitionName.trim()}
                            >
                                {creatingCompetition ? 'Creando…' : !newCompetitionName.trim() ? 'Poné un nombre' : 'Crear'}
                            </button>
                        </div>
                    </div>
                )}
            </Step>

            <div className={styles.summary} aria-live="polite">
                <p className={styles.summaryMatch}>
                    <span key={homeName ?? 'h'} className={homeName ? styles.summaryTeam : styles.summaryEmpty}>
                        {homeName ?? (isHome ? 'Tu categoría' : 'Rival')}
                    </span>
                    <span className={styles.summaryVs}>vs</span>
                    <span key={awayName ?? 'a'} className={awayName ? styles.summaryTeam : styles.summaryEmpty}>
                        {awayName ?? (isHome ? 'Rival' : 'Tu categoría')}
                    </span>
                </p>
                {when && <p className={styles.summaryMeta}>{when}</p>}
                <p className={styles.summaryMeta}>{where}</p>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button
                type="button"
                className={missing ? styles.primaryPending : styles.primary}
                onClick={submit}
                disabled={submitting}
            >
                {submitting
                    ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando…</>
                    : missing?.text ?? 'Cargar partido'}
            </button>
        </div>
    );
}
