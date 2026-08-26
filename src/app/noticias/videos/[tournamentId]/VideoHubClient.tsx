'use client';

// El hub de videos de un torneo: cada partido con sus highlights, y arriba
// la votación al mejor try (gol, punto: lo que se anote en ese deporte).
//
// Quien administra noticias arma la votación acá mismo: elige entre los
// videos ya cargados en las fichas, escribe la pregunta y la publica. El
// hincha vota con su cuenta, como en "Votá al ganador" de la ficha; los
// resultados son públicos y se ven sin login.

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';

import { useAuth } from '@/context/AuthContext';
import MatchVideoPlayer, { useEmbedParent } from '@/components/video/MatchVideoPlayer';
import { VIDEO_KIND_LABELS, VIDEO_PROVIDER_LABELS, describeVideo } from '@/lib/matches/videoLinks';
import type { VideoPlateContext } from '@/lib/matches/videoPlate';
import {
    MAX_POLL_NAME_LENGTH,
    MAX_POLL_OPTION_LABEL_LENGTH,
    MAX_POLL_OPTIONS,
    MAX_POLL_TITLE_LENGTH,
    MIN_POLL_OPTIONS,
    defaultPollTitle,
    playLabelForSport,
    pollOptionId,
    type VideoPollOptionInput,
    type VideoPollSummary,
} from '@/lib/videoHub/polls';
import {
    findHubVideo,
    matchLabelOf,
    scoreLabelOf,
    type VideoHub,
    type VideoHubMatch,
    type VideoHubTeam,
} from '@/lib/videoHub/types';

import styles from './VideoHub.module.css';

interface Props {
    hub: VideoHub;
    canManage: boolean;
    initialPolls: VideoPollSummary[];
    /** false = faltan las tablas de la votación; se lo decimos a quien administra. */
    pollsAvailable: boolean;
    /** true = la tabla existe pero es de una versión vieja del archivo (sin name/closes_at). */
    pollsOutdated?: boolean;
    migration: string;
}

interface PollInput {
    name: string;
    title: string;
    options: VideoPollOptionInput[];
    /** ISO, o null para "sin fecha de cierre". */
    closesAt: string | null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const SPORT_NAMES: Record<string, string> = {
    rugby: 'Rugby',
    'field-hockey': 'Hockey',
    hockey: 'Hockey',
    football: 'Fútbol',
    basketball: 'Básquet',
    volleyball: 'Vóley',
    handball: 'Handball',
    tennis: 'Tenis',
};

function sportName(sportId: string | null): string | null {
    if (!sportId) return null;
    return SPORT_NAMES[sportId] ?? sportId.charAt(0).toUpperCase() + sportId.slice(1);
}

/** "22 ago". Con partes numéricas, para que el servidor y el navegador escriban lo mismo. */
function formatDay(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, day: 'numeric', month: 'numeric' }).formatToParts(date);
    const day = parts.find((part) => part.type === 'day')?.value;
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    if (!day || !month) return null;
    return `${day} ${MONTHS[month - 1]}`;
}

/** "30 ago · 18:00" en hora argentina, con partes numéricas para que servidor y navegador coincidan. */
function formatDateTime(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = get('day');
    const month = Number(get('month'));
    const hour = get('hour');
    const minute = get('minute');
    if (!day || !month || !hour || !minute) return null;
    return `${day} ${MONTHS[month - 1]} · ${hour}:${minute}`;
}

/** ISO → lo que entiende <input type="datetime-local"> (hora local del navegador). */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Lo que escribió el admin en el input (hora local) → ISO; vacío → null. */
function fromLocalInput(value: string): string | null {
    if (!value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function returnTo(): string | undefined {
    return typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`;
}

function pluralize(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

/** El partido, como lo necesita la placa generada. */
function plateContextOf(hub: VideoHub, match: VideoHubMatch): VideoPlateContext {
    return {
        tournamentName: hub.tournament.name,
        roundLabel: match.roundLabel,
        sportId: hub.tournament.sportId,
        home: { name: match.home.name, logoUrl: match.home.logoUrl },
        away: { name: match.away.name, logoUrl: match.away.logoUrl },
        score: match.score,
        fieldColor: hub.tournament.primaryColor,
        accentColor: hub.tournament.secondaryColor,
    };
}

interface DayGroup {
    key: string;
    /** "Viernes 22 de agosto". */
    label: string;
    matches: VideoHubMatch[];
    videoCount: number;
}

/** El día del partido en hora argentina. Con partes numéricas: servidor y navegador escriben lo mismo. */
function dayOf(iso: string | null): { key: string; label: string } {
    const none = { key: 'sin-fecha', label: 'Sin fecha' };
    if (!iso) return none;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return none;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const year = get('year');
    const month = Number(get('month'));
    const day = get('day');
    const weekday = WEEKDAY_KEYS.indexOf(get('weekday'));
    if (!year || !month || !day) return none;
    return {
        key: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
        label: `${weekday >= 0 ? `${WEEKDAYS[weekday]} ` : ''}${day} de ${MONTHS_LONG[month - 1]}`,
    };
}

/** Los partidos vienen del más reciente al más viejo: los días salen en ese orden. */
function groupByDay(matches: VideoHubMatch[]): DayGroup[] {
    const groups: DayGroup[] = [];
    const index = new Map<string, number>();
    for (const match of matches) {
        const { key, label } = dayOf(match.dateTime);
        let position = index.get(key);
        if (position === undefined) {
            position = groups.length;
            index.set(key, position);
            groups.push({ key, label, matches: [], videoCount: 0 });
        }
        groups[position].matches.push(match);
        groups[position].videoCount += match.videos.length;
    }
    return groups;
}

// ── Piezas ────────────────────────────────────────────────────────────────

function TeamMark({ team, small = false }: { team: VideoHubTeam; small?: boolean }) {
    const size = small ? 20 : 28;
    const className = `${styles.crest} ${small ? styles.crestSm : ''}`;
    if (team.logoUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy propio.
        return <img className={className} src={team.logoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" />;
    }
    return <span className={`${styles.crestFallback} ${small ? styles.crestSm : ''}`} aria-hidden="true">{team.name.slice(0, 1)}</span>;
}

function MatchHeading({ match, compact = false }: { match: VideoHubMatch; compact?: boolean }) {
    const score = scoreLabelOf(match);
    const meta = [match.roundLabel, formatDay(match.dateTime)].filter(Boolean).join(' · ');
    return (
        <div className={`${styles.matchHead} ${compact ? styles.matchHeadCompact : ''}`}>
            <span className={styles.matchTeam}>
                <TeamMark team={match.home} />
                <span className={styles.matchName}>{match.home.name}</span>
            </span>
            <span className={styles.matchScore} aria-label={score ? `Resultado ${score}` : undefined}>{score ?? 'vs'}</span>
            <span className={`${styles.matchTeam} ${styles.matchTeamAway}`}>
                <span className={styles.matchName}>{match.away.name}</span>
                <TeamMark team={match.away} />
            </span>
            {!compact && meta && <span className={styles.matchMeta}>{meta}</span>}
        </div>
    );
}

interface PollEditorProps {
    hub: VideoHub;
    initial: VideoPollSummary | null;
    saving: boolean;
    error: string | null;
    onCancel: () => void;
    onSave: (input: PollInput) => void;
}

function PollEditor({ hub, initial, saving, error, onCancel, onSave }: PollEditorProps) {
    // El nombre suele ser la fecha: se sugiere la del partido más reciente con videos.
    const [name, setName] = useState(initial?.poll.name ?? (hub.matches[0]?.roundLabel ?? ''));
    const [title, setTitle] = useState(initial?.poll.title ?? defaultPollTitle(hub.tournament.sportId));
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.poll.options.map((option) => option.id) ?? []));
    // El título de cada video en la votación: el que ya tiene en la ficha, o el que se escriba acá.
    const [labels, setLabels] = useState<Record<string, string>>(() => {
        const out: Record<string, string> = {};
        for (const match of hub.matches) {
            for (const video of match.videos) out[pollOptionId({ matchId: match.id, videoId: video.id })] = video.title ?? '';
        }
        for (const option of initial?.poll.options ?? []) if (option.label) out[option.id] = option.label;
        return out;
    });
    const [closesInput, setClosesInput] = useState(() => toLocalInput(initial?.poll.closesAt ?? null));

    const trimmedName = name.trim();
    const trimmed = title.trim();
    const count = selected.size;
    const untitled = Array.from(selected).filter((id) => !(labels[id] ?? '').trim());
    const closesAt = fromLocalInput(closesInput);
    const closesInPast = closesAt !== null && Date.parse(closesAt) <= Date.now();
    const closesHint = !closesInput.trim()
        ? 'Sin fecha: la cerrás vos cuando quieras.'
        : closesAt === null
            ? 'Esa fecha no se entiende.'
            : closesInPast
                ? 'Esa fecha ya pasó: la votación va a nacer cerrada.'
                : `Se cierra sola el ${formatDateTime(closesAt)}.`;
    // El botón deshabilitado siempre dice qué falta para habilitarse.
    const hint = !trimmedName
        ? 'Ponele nombre a la votación (casi siempre la fecha: "Fecha 19").'
        : !trimmed
            ? 'Escribí la pregunta.'
            : count < MIN_POLL_OPTIONS
                ? `Elegí al menos ${MIN_POLL_OPTIONS} videos. Llevás ${count}.`
                : count > MAX_POLL_OPTIONS
                    ? `Tope de ${MAX_POLL_OPTIONS} videos por votación. Sacá ${count - MAX_POLL_OPTIONS}.`
                    : untitled.length > 0
                        ? `${pluralize(untitled.length, 'video elegido', 'videos elegidos')} sin título. Escribilo debajo de cada uno.`
                        : `${pluralize(count, 'video', 'videos')} en la votación.`;
    const canSave = Boolean(trimmedName) && Boolean(trimmed) && count >= MIN_POLL_OPTIONS && count <= MAX_POLL_OPTIONS && untitled.length === 0 && !saving;

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSave) return;
        const options: VideoPollOptionInput[] = [];
        for (const match of hub.matches) {
            for (const video of match.videos) {
                const id = pollOptionId({ matchId: match.id, videoId: video.id });
                if (selected.has(id)) {
                    options.push({ matchId: match.id, videoId: video.id, label: (labels[id] ?? '').trim() });
                }
            }
        }
        onSave({ name: trimmedName, title: trimmed, options, closesAt });
    }

    return (
        <form className={styles.editor} onSubmit={submit} aria-label={initial ? 'Editar votación' : 'Nueva votación'}>
            <div className={styles.fieldRow}>
                <label className={styles.field}>
                    <span className={styles.label}>Nombre de la votación</span>
                    <input
                        className={styles.input}
                        type="text"
                        value={name}
                        maxLength={MAX_POLL_NAME_LENGTH}
                        placeholder="Fecha 19"
                        onChange={(event) => setName(event.target.value)}
                        disabled={saving}
                    />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span className={styles.label}>La pregunta</span>
                    <input
                        className={styles.input}
                        type="text"
                        value={title}
                        maxLength={MAX_POLL_TITLE_LENGTH}
                        onChange={(event) => setTitle(event.target.value)}
                        disabled={saving}
                    />
                </label>
            </div>

            <div className={styles.field}>
                <label className={styles.field}>
                    <span className={styles.label}>Cierra <span className={styles.labelSoft}>(opcional)</span></span>
                    <span className={styles.dateRow}>
                        <input
                            className={styles.input}
                            type="datetime-local"
                            value={closesInput}
                            onChange={(event) => setClosesInput(event.target.value)}
                            disabled={saving}
                        />
                        {closesInput && (
                            <button type="button" className={styles.btn} onClick={() => setClosesInput('')} disabled={saving}>
                                Sin fecha
                            </button>
                        )}
                    </span>
                </label>
                <p className={`${styles.hint} ${closesInput && closesAt === null ? styles.error : ''}`}>{closesHint}</p>
            </div>

            <fieldset className={styles.candidates}>
                <legend className={styles.label}>Los videos que compiten</legend>
                {hub.matches.map((match) => (
                    <div key={match.id} className={styles.candidateMatch}>
                        <MatchHeading match={match} compact />
                        <ul className={styles.candidateList}>
                            {match.videos.map((video) => {
                                const id = pollOptionId({ matchId: match.id, videoId: video.id });
                                const checked = selected.has(id);
                                return (
                                    <li key={video.id}>
                                        <label className={`${styles.candidate} ${checked ? styles.candidateChecked : ''}`}>
                                            <input type="checkbox" checked={checked} onChange={() => toggle(id)} disabled={saving} />
                                            <span className={styles.candidateKind}>{VIDEO_KIND_LABELS[video.kind]}</span>
                                            <span className={styles.candidateTitle}>{describeVideo(video)}</span>
                                            <span className={styles.candidateProvider}>{VIDEO_PROVIDER_LABELS[video.provider]}</span>
                                        </label>
                                        {checked && (
                                            <label className={styles.candidateLabel}>
                                                <span className={styles.label}>Título en la votación</span>
                                                <input
                                                    className={`${styles.input} ${!(labels[id] ?? '').trim() ? styles.inputMissing : ''}`}
                                                    type="text"
                                                    value={labels[id] ?? ''}
                                                    maxLength={MAX_POLL_OPTION_LABEL_LENGTH}
                                                    placeholder="Try de Boffelli"
                                                    onChange={(event) => setLabels((prev) => ({ ...prev, [id]: event.target.value }))}
                                                    disabled={saving}
                                                />
                                            </label>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </fieldset>

            <p className={styles.hint} aria-live="polite">{hint}</p>
            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.editorActions}>
                <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancelar</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canSave}>
                    {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Publicar votación'}
                </button>
            </div>
        </form>
    );
}

interface PollCardProps {
    hub: VideoHub;
    summary: VideoPollSummary;
    embedParent: string | null;
    canManage: boolean;
    loggedIn: boolean;
    busy: boolean;
    onVote: (optionId: string) => void;
    onLogin: () => void;
    onEdit: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
}

function PollCard({ hub, summary, embedParent, canManage, loggedIn, busy, onVote, onLogin, onEdit, onToggleStatus, onDelete }: PollCardProps) {
    const { poll } = summary;
    const open = summary.isOpen;
    const closesLabel = formatDateTime(poll.closesAt);
    const expired = !open && poll.status === 'open' && Boolean(closesLabel);
    const stateLabel = open
        ? (closesLabel ? `abierta · cierra el ${closesLabel}` : 'abierta')
        : (expired ? `cerrada · venció el ${closesLabel}` : 'cerrada');
    const caption = !open
        ? (summary.totalVotes > 0 ? 'La votación cerró. Así quedó.' : 'La votación cerró sin votos.')
        : loggedIn
            ? (summary.userOptionId ? 'Tu voto quedó guardado. Podés cambiarlo mientras siga abierta.' : 'Mirá los videos y votá uno.')
            : 'Los resultados son públicos. Iniciá sesión para dejar tu voto.';

    return (
        <article className={styles.poll} aria-labelledby={`poll-${poll.id}`}>
            <header className={styles.pollHead}>
                <div>
                    <p className={styles.eyebrow}>Votación · {stateLabel}</p>
                    <h3 id={`poll-${poll.id}`} className={styles.pollTitle}>{poll.name || poll.title}</h3>
                    {poll.name && <p className={styles.pollQuestion}>{poll.title}</p>}
                </div>
                <span className={styles.pollTotal}>{pluralize(summary.totalVotes, 'voto', 'votos')}</span>
            </header>

            <ul className={styles.pollOptions}>
                {poll.options.map((option) => {
                    const found = findHubVideo(hub, option);
                    if (!found) return null;
                    const { match, video } = found;
                    const optionLabel = option.label || describeVideo(video);
                    const percent = summary.percentages[option.id] ?? 0;
                    const mine = summary.userOptionId === option.id;
                    const leads = summary.totalVotes > 0 && summary.leaderIds.includes(option.id);

                    return (
                        <li
                            key={option.id}
                            className={[styles.pollOption, mine ? styles.pollOptionMine : '', leads ? styles.pollOptionLeads : ''].filter(Boolean).join(' ')}
                        >
                            <MatchVideoPlayer video={video} matchLabel={matchLabelOf(match)} embedParent={embedParent} withOpenLink={false} plate={plateContextOf(hub, match)} />
                            <div className={styles.pollOptionBody}>
                                <MatchHeading match={match} compact />
                                <p className={styles.pollOptionTitle} title={optionLabel}>{optionLabel}</p>
                                <div className={styles.pollBar} aria-hidden="true">
                                    <span className={styles.pollBarFill} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
                                </div>
                                <div className={styles.pollOptionFoot}>
                                    <span className={styles.pollPercent}>
                                        {percent}%
                                        <span className={styles.srOnly}> · {pluralize(summary.votes[option.id] ?? 0, 'voto', 'votos')}</span>
                                    </span>
                                    {leads && <span className={styles.pill}>{open ? 'Va ganando' : 'Ganador'}</span>}
                                    {open ? (
                                        <button
                                            type="button"
                                            className={`${styles.voteBtn} ${mine ? styles.voteBtnMine : ''}`}
                                            onClick={() => (loggedIn ? onVote(option.id) : onLogin())}
                                            disabled={busy || mine}
                                            aria-pressed={mine}
                                        >
                                            {mine ? 'Tu voto' : 'Votar'}
                                        </button>
                                    ) : mine ? (
                                        <span className={`${styles.pill} ${styles.pillMine}`}>Tu voto</span>
                                    ) : null}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <footer className={styles.pollFoot}>
                <p className={styles.caption}>{caption}</p>
                {!loggedIn && open && (
                    <button type="button" className={styles.btn} onClick={onLogin}>Iniciar sesión para votar</button>
                )}
                {canManage && (
                    <div className={styles.adminBar}>
                        <button type="button" className={styles.btn} onClick={onEdit} disabled={busy}>Editar</button>
                        <button type="button" className={styles.btn} onClick={onToggleStatus} disabled={busy}>
                            {open ? 'Cerrar votación' : expired ? 'Reabrir sin fecha' : 'Reabrir'}
                        </button>
                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onDelete} disabled={busy}>Eliminar</button>
                    </div>
                )}
            </footer>
        </article>
    );
}

// ── La página ─────────────────────────────────────────────────────────────

export default function VideoHubClient({ hub, canManage, initialPolls, pollsAvailable, pollsOutdated = false, migration }: Props) {
    const { user, login } = useAuth();
    const embedParent = useEmbedParent();
    const [polls, setPolls] = useState<VideoPollSummary[]>(initialPolls);
    /** 'new' o el id de la votación que se está editando. */
    const [editing, setEditing] = useState<'new' | string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const play = playLabelForSport(hub.tournament.sportId);
    const sport = sportName(hub.tournament.sportId);
    const days = useMemo(() => groupByDay(hub.matches), [hub.matches]);
    const loggedIn = Boolean(user);
    const showPolls = canManage || polls.length > 0;

    function replacePoll(next: VideoPollSummary) {
        setPolls((prev) => (
            prev.some((entry) => entry.poll.id === next.poll.id)
                ? prev.map((entry) => (entry.poll.id === next.poll.id ? next : entry))
                : [next, ...prev]
        ));
    }

    function toLogin() {
        login('fan', returnTo());
    }

    /**
     * Un pedido a la API; null si falló (el error ya quedó en pantalla) o si
     * mandó a iniciar sesión. Un 401 al votar es "no estás logueado" y va al
     * login; un 401 en una acción de administración suele ser el refresh del
     * token de paso, y lo que corresponde es reintentar, no patear al admin.
     */
    async function request(url: string, init: RequestInit, fallback: string, loginOn401 = false): Promise<Record<string, unknown> | null> {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...init,
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (response.status === 401 && loginOn401) {
            toLogin();
            return null;
        }
        if (!response.ok) {
            setError(typeof payload?.error === 'string' ? payload.error : fallback);
            return null;
        }
        return payload;
    }

    async function vote(summary: VideoPollSummary, optionId: string) {
        if (!summary.isOpen || summary.userOptionId === optionId) return;
        if (!user) {
            toLogin();
            return;
        }
        setBusyId(summary.poll.id);
        setError(null);
        try {
            const payload = await request(
                `/api/video-polls/${summary.poll.id}/vote`,
                { method: 'POST', body: JSON.stringify({ optionId }) },
                'No pudimos guardar tu voto. Probá de nuevo.',
                true,
            );
            if (payload?.poll) replacePoll(payload.poll as VideoPollSummary);
        } catch {
            setError('No pudimos guardar tu voto. Revisá la conexión.');
        } finally {
            setBusyId(null);
        }
    }

    async function save(input: PollInput, existing: VideoPollSummary | null) {
        setBusyId(existing?.poll.id ?? 'new');
        setError(null);
        try {
            const payload = existing
                ? await request(`/api/video-polls/${existing.poll.id}`, { method: 'PATCH', body: JSON.stringify(input) }, 'No se pudo guardar la votación.')
                : await request('/api/video-polls', { method: 'POST', body: JSON.stringify({ tournamentId: hub.tournament.id, ...input }) }, 'No se pudo crear la votación.');
            if (payload?.poll) {
                replacePoll(payload.poll as VideoPollSummary);
                setEditing(null);
            }
        } catch {
            setError('No se pudo guardar. Revisá la conexión.');
        } finally {
            setBusyId(null);
        }
    }

    async function toggleStatus(summary: VideoPollSummary) {
        setBusyId(summary.poll.id);
        setError(null);
        try {
            const status = summary.isOpen ? 'closed' : 'open';
            const payload = await request(`/api/video-polls/${summary.poll.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, 'No se pudo cambiar el estado.');
            if (payload?.poll) replacePoll(payload.poll as VideoPollSummary);
        } catch {
            setError('No se pudo cambiar el estado. Revisá la conexión.');
        } finally {
            setBusyId(null);
        }
    }

    async function remove(summary: VideoPollSummary) {
        if (!window.confirm('¿Eliminar esta votación? Se pierden los votos.')) return;
        setBusyId(summary.poll.id);
        setError(null);
        try {
            const payload = await request(`/api/video-polls/${summary.poll.id}`, { method: 'DELETE' }, 'No se pudo eliminar la votación.');
            if (payload?.ok) setPolls((prev) => prev.filter((entry) => entry.poll.id !== summary.poll.id));
        } catch {
            setError('No se pudo eliminar. Revisá la conexión.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.topBar}>
                    <Link href="/noticias" className={styles.backLink}>← Volver a noticias</Link>
                    <span className={styles.topMeta}>
                        {pluralize(hub.videoCount, 'video', 'videos')} · {pluralize(hub.matches.length, 'partido', 'partidos')}
                    </span>
                </div>

                <header className={styles.hero}>
                    {hub.tournament.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- logo por el proxy propio; está sobre el pliegue.
                        <img className={styles.heroLogo} src={hub.tournament.logoUrl} alt="" width={72} height={72} />
                    )}
                    <div>
                        <p className={styles.eyebrow}>Hub de videos{sport ? ` · ${sport}` : ''}</p>
                        <h1 className={styles.heroTitle}>{hub.tournament.name}</h1>
                        <p className={styles.heroHint}>
                            Highlights, partidos completos y clips, y la votación al mejor {play.singular}.
                        </p>
                    </div>
                </header>

                {showPolls && (
                    <section className={styles.section} aria-labelledby="polls-title">
                        <div className={styles.sectionHead}>
                            <h2 id="polls-title" className={styles.sectionTitle}>El mejor {play.singular}</h2>
                            {canManage && pollsAvailable && editing === null && (
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    onClick={() => { setError(null); setEditing('new'); }}
                                    disabled={hub.videoCount < MIN_POLL_OPTIONS}
                                >
                                    Nueva votación
                                </button>
                            )}
                        </div>

                        {canManage && !pollsAvailable && (
                            <p className={styles.notice}>
                                {pollsOutdated
                                    ? <>La tabla de votaciones es de una versión vieja del archivo (le faltan <code>name</code> y <code>closes_at</code>): volvé a correr <code>{migration}</code> en Supabase; solo agrega esas columnas.</>
                                    : <>La votación todavía no está habilitada: falta correr la migración <code>{migration}</code> en Supabase.</>}
                            </p>
                        )}
                        {canManage && pollsAvailable && hub.videoCount < MIN_POLL_OPTIONS && editing === null && (
                            <p className={styles.hint}>
                                Para armar una votación hacen falta al menos {MIN_POLL_OPTIONS} videos cargados en las fichas del torneo.
                            </p>
                        )}

                        {editing === 'new' && (
                            <PollEditor
                                hub={hub}
                                initial={null}
                                saving={busyId === 'new'}
                                error={error}
                                onCancel={() => { setEditing(null); setError(null); }}
                                onSave={(input) => void save(input, null)}
                            />
                        )}

                        {pollsAvailable && polls.length === 0 && editing !== 'new' && (
                            <p className={styles.emptyLine}>
                                {canManage
                                    ? 'Todavía no hay votaciones en este torneo.'
                                    : `Todavía no hay una votación al mejor ${play.singular} en este torneo.`}
                            </p>
                        )}

                        {error && editing === null && <p className={styles.error} role="alert">{error}</p>}

                        <div className={styles.pollList}>
                            {polls.map((summary) => (
                                editing === summary.poll.id ? (
                                    <PollEditor
                                        key={summary.poll.id}
                                        hub={hub}
                                        initial={summary}
                                        saving={busyId === summary.poll.id}
                                        error={error}
                                        onCancel={() => { setEditing(null); setError(null); }}
                                        onSave={(input) => void save(input, summary)}
                                    />
                                ) : (
                                    <PollCard
                                        key={summary.poll.id}
                                        hub={hub}
                                        summary={summary}
                                        embedParent={embedParent}
                                        canManage={canManage}
                                        loggedIn={loggedIn}
                                        busy={busyId === summary.poll.id}
                                        onVote={(optionId) => void vote(summary, optionId)}
                                        onLogin={toLogin}
                                        onEdit={() => { setError(null); setEditing(summary.poll.id); }}
                                        onToggleStatus={() => void toggleStatus(summary)}
                                        onDelete={() => void remove(summary)}
                                    />
                                )
                            ))}
                        </div>
                    </section>
                )}

                <section className={styles.section} aria-labelledby="videos-title">
                    <div className={styles.sectionHead}>
                        <h2 id="videos-title" className={styles.sectionTitle}>Videos</h2>
                        <span className={styles.sectionMeta}>Por día, del más reciente al más viejo</span>
                    </div>

                    {days.map((day) => (
                        <section key={day.key} className={styles.day} aria-label={day.label}>
                            <h3 className={styles.dayTitle}>
                                {day.label}
                                <span className={styles.dayCount}>{pluralize(day.videoCount, 'video', 'videos')}</span>
                            </h3>
                            <ul className={styles.cardGrid}>
                                {day.matches.flatMap((match) => match.videos.map((video) => {
                                    const label = describeVideo(video);
                                    const providerLabel = video.provider === 'other' ? 'el sitio' : VIDEO_PROVIDER_LABELS[video.provider];
                                    return (
                                        <li key={`${match.id}|${video.id}`} className={styles.videoCard}>
                                            <MatchVideoPlayer
                                                video={video}
                                                matchLabel={matchLabelOf(match)}
                                                embedParent={embedParent}
                                                withOpenLink={false}
                                                plate={plateContextOf(hub, match)}
                                            />
                                            <div className={styles.videoBody}>
                                                <div className={styles.videoHead}>
                                                    <span className={`${styles.kind} ${styles[`kind_${video.kind}`] ?? ''}`}>
                                                        {VIDEO_KIND_LABELS[video.kind]}
                                                    </span>
                                                    <span className={styles.videoTitle} title={label}>{label}</span>
                                                </div>
                                                <Link
                                                    href={`/matches/${match.id}?tab=videos`}
                                                    className={styles.videoMatch}
                                                    aria-label={`Ver la ficha de ${matchLabelOf(match)}`}
                                                >
                                                    <TeamMark team={match.home} small />
                                                    <span className={styles.videoMatchName}>{match.home.name}</span>
                                                    <span className={styles.videoScore}>{scoreLabelOf(match) ?? 'vs'}</span>
                                                    <span className={`${styles.videoMatchName} ${styles.videoMatchAway}`}>{match.away.name}</span>
                                                    <TeamMark team={match.away} small />
                                                </Link>
                                                <div className={styles.videoFoot}>
                                                    <span className={styles.videoMeta}>{match.roundLabel ?? ''}</span>
                                                    <a className={styles.videoOpen} href={video.url} target="_blank" rel="noopener noreferrer">
                                                        Abrir en {providerLabel} ↗
                                                    </a>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                }))}
                            </ul>
                        </section>
                    ))}
                </section>
            </div>
        </div>
    );
}
