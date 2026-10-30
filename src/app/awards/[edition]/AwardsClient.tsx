'use client';

// Una edición de los premios: la gente postula (jugadores, clubes y la jugada
// de los pibes), después vota la terna de los más postulados, y al final se ven
// los resultados. Qué se muestra lo decide la etapa que fija la editorial.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import {
    AWARD_EDITIONS,
    AWARD_STAGES,
    STAGE_LABELS,
    XI_SIZE,
    acceptsNominations,
    groupCategories,
    isVotableKind,
    type AwardCategory,
    type AwardEditionConfig,
    type AwardStage,
} from '@/lib/awards/config';
import type { AwardsPublicResult, FinalistView } from '@/lib/server/awards';
import EditionLogo from '../EditionLogo';
import styles from '../awards.module.css';
import AdminPanel, { callApi, errorOf } from './AdminPanel';

interface Props {
    config: AwardEditionConfig;
    state: AwardsPublicResult;
    canManage: boolean;
}

type Notice = { tone: 'ok' | 'bad'; text: string } | null;

/** Lo que dice la píldora de la portada: concuerda en género y número con cada etapa. */
const STAGE_OPEN_LABEL: Record<AwardStage, string> = {
    postulaciones: 'Postulaciones abiertas',
    votacion: 'Votación abierta',
    resultados: 'Resultados publicados',
};

const AGE_GROUPS = ['M12', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'Inferiores'];

function formatDate(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // Zona fija: servidor y navegador tienen que escribir lo mismo.
    return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
}

function returnTo(): string | undefined {
    return typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`;
}

function Crest({ logoUrl, name }: { logoUrl: string | null; name: string }) {
    const [broken, setBroken] = useState(false);
    return (
        <span className={styles.crest}>
            {logoUrl && !broken ? (
                // Escudo junto a un texto que ya nombra al club: decorativo.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" loading="lazy" onError={() => setBroken(true)} />
            ) : (
                <span className={styles.crestFallback} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            )}
        </span>
    );
}

// ── Buscador con sugerencias (jugadores y clubes) ─────────────────────────

interface Suggestion {
    id: string;
    name: string;
    clubId?: string | null;
    clubName?: string | null;
    city?: string | null;
}

function Picker({
    edition,
    type,
    label,
    hint,
    picked,
    onPick,
    onClear,
    allowFree,
    seniorOnly,
    inputId,
}: {
    edition: string;
    type: 'person' | 'club';
    label: string;
    hint?: string;
    picked: { name: string; sub?: string | null } | null;
    onPick: (value: { id: string | null; name: string; clubId: string | null; clubName: string | null }) => void;
    onClear: () => void;
    allowFree?: boolean;
    /** Solo clubes de plantel superior (postular un equipo). */
    seniorOnly?: boolean;
    inputId: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Suggestion[]>([]);
    const [problem, setProblem] = useState<string | null>(null);

    useEffect(() => {
        const q = query.trim();
        const min = type === 'person' ? 3 : 2;
        if (q.length < min) {
            setResults([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            const result = await callApi(`/api/awards/${edition}/search?type=${type}&q=${encodeURIComponent(q)}${seniorOnly ? '&senior=1' : ''}`);
            if (cancelled) return;
            if (!result.ok) {
                setProblem(errorOf(result, 'No se pudo buscar.'));
                setResults([]);
                return;
            }
            setProblem(null);
            setResults((result.data.results as Suggestion[]) ?? []);
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, edition, type, seniorOnly]);

    if (picked) {
        return (
            <div className={styles.field}>
                <span>{label}</span>
                <div className={styles.picked}>
                    <span>{picked.name}{picked.sub ? <small className={styles.hint}> · {picked.sub}</small> : null}</span>
                    <button type="button" className={`${styles.btn} ${styles.btnSmall}`} onClick={onClear}>Cambiar</button>
                </div>
            </div>
        );
    }

    const typed = query.trim();
    return (
        <div className={styles.field}>
            <label htmlFor={inputId}>{label}</label>
            {hint ? <span className={styles.hint}>{hint}</span> : null}
            <input
                id={inputId}
                className={styles.input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                placeholder={type === 'person' ? 'Empezá a escribir el apellido' : 'Empezá a escribir el club'}
            />
            {problem ? <span className={styles.hint} role="status">{problem}</span> : null}
            {results.length > 0 || (allowFree && typed.length >= 2) ? (
                <ul className={styles.suggest}>
                    {results.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onPick({ id: item.id, name: item.name, clubId: type === 'person' ? item.clubId ?? null : item.id, clubName: type === 'person' ? item.clubName ?? null : item.name });
                                    setQuery('');
                                    setResults([]);
                                }}
                            >
                                <span>{item.name}</span>
                                {type === 'person' && item.clubName ? <small>{item.clubName}</small> : null}
                                {type === 'club' && item.city ? <small>{item.city}</small> : null}
                            </button>
                        </li>
                    ))}
                    {allowFree && typed.length >= 2 ? (
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    onPick({ id: null, name: typed, clubId: null, clubName: null });
                                    setQuery('');
                                    setResults([]);
                                }}
                            >
                                <span>Usar «{typed}» tal cual</span>
                                <small>si no está en la lista</small>
                            </button>
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </div>
    );
}

// ── Postular ──────────────────────────────────────────────────────────────

function NominationForm({ config, category, mine, onDone }: { config: AwardEditionConfig; category: AwardCategory; mine: Record<string, string[]>; onDone?: () => void }) {
    const router = useRouter();
    const categorySlug = category.slug;
    const [subject, setSubject] = useState<{ id: string | null; name: string; clubId: string | null; clubName: string | null } | null>(null);
    const [club, setClub] = useState<{ id: string; name: string } | null>(null);
    const [momentText, setMomentText] = useState('');
    const [typedName, setTypedName] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    const isClub = category?.kind === 'club';
    /** Un gol o un partido: se escribe a mano, no se busca en la base. */
    const isMoment = category?.kind === 'moment';
    /** Sin base de jugadores cargada (hockey): escriben el nombre, sin buscador. */
    const isTyped = !isClub && !isMoment && !config.playersFromDb;
    const needsClubPicker = !isClub && !isMoment && !isTyped && subject !== null && !subject.clubId;
    const canSend = (isMoment ? momentText.trim().length >= 2 : isTyped ? typedName.trim().length >= 2 : Boolean(subject)) && !busy;
    const personLabel = category?.slug.includes('entrenador') ? 'Entrenador o entrenadora' : 'Jugador o jugadora';

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!category || (!isMoment && !isTyped && !subject)) return;
        setBusy(true);
        setNotice(null);
        const body: Record<string, unknown> = { category: category.slug, note };
        if (isMoment) body.name = momentText.trim();
        else if (isTyped) {
            body.name = typedName.trim();
            if (club) body.clubId = club.id;
        } else if (isClub) body.clubId = subject?.clubId;
        else if (subject) {
            if (subject.id) body.personId = subject.id;
            else body.name = subject.name;
            const clubId = subject.clubId ?? club?.id;
            if (clubId) body.clubId = clubId;
        }
        const result = await callApi(`/api/awards/${config.slug}/nominations`, { method: 'POST', body: JSON.stringify(body) });
        setBusy(false);
        if (!result.ok) {
            setNotice({ tone: 'bad', text: errorOf(result, 'No se pudo guardar tu postulación.') });
            return;
        }
        setNotice({ tone: 'ok', text: `Postulaste a ${String(result.data.subjectName ?? subject?.name ?? (typedName || momentText))}. Cuantas más personas lo postulen, más cerca está de la terna.` });
        setSubject(null);
        setClub(null);
        setMomentText('');
        setTypedName('');
        setNote('');
        router.refresh();
        onDone?.();
    }

    const already = mine[categorySlug] ?? [];

    return (
        <form className={styles.form} onSubmit={submit}>
            {isMoment ? (
                <label className={styles.field} htmlFor="aw-nom-moment">
                    {category?.slug.includes('partido') ? 'Qué partido' : 'Qué gol'}
                    <span className={styles.hint}>Escribí quién, contra quién y la fecha.</span>
                    <input
                        id="aw-nom-moment"
                        className={styles.input}
                        value={momentText}
                        maxLength={120}
                        onChange={(event) => setMomentText(event.target.value)}
                        placeholder={category?.placeholder}
                    />
                </label>
            ) : isTyped ? (
                <>
                    <label className={styles.field} htmlFor="aw-nom-typed">
                        {personLabel}
                        <span className={styles.hint}>Escribí nombre y apellido.</span>
                        <input
                            id="aw-nom-typed"
                            className={styles.input}
                            value={typedName}
                            maxLength={120}
                            autoComplete="off"
                            onChange={(event) => setTypedName(event.target.value)}
                            placeholder="Ejemplo: Julieta Paz"
                        />
                    </label>
                    <Picker
                        key={`${categorySlug}-club-typed`}
                        edition={config.slug}
                        type="club"
                        label="Club (opcional)"
                        hint="Ayuda a no confundir a dos jugadoras con el mismo nombre."
                        picked={club ? { name: club.name } : null}
                        onPick={(value) => setClub(value.id ? { id: value.id, name: value.name } : null)}
                        onClear={() => setClub(null)}
                        inputId="aw-nom-club-typed"
                    />
                </>
            ) : (
                <Picker
                    key={`${categorySlug}-subject`}
                    edition={config.slug}
                    type={isClub ? 'club' : 'person'}
                    label={isClub ? 'Club' : personLabel}
                    hint={isClub ? 'Solo equipos de plantel superior.' : config.requireDebut ? 'Solo jugadores que ya debutaron en primera, aunque sean menores de edad. Si no aparece, no figura en una formación de primera.' : config.playersFromDb ? 'Solo jugadores de nuestra base. Si no aparece, todavía no está cargado.' : 'Buscá en la base. Si no aparece, usá el nombre tal cual.'}
                    picked={subject ? { name: subject.name, sub: subject.clubName } : null}
                    onPick={setSubject}
                    onClear={() => { setSubject(null); setClub(null); }}
                    allowFree={!isClub && !config.playersFromDb}
                    seniorOnly={isClub}
                    inputId="aw-nom-subject"
                />
            )}

            {needsClubPicker ? (
                <Picker
                    key={`${categorySlug}-club`}
                    edition={config.slug}
                    type="club"
                    label="Club (opcional)"
                    hint="Ayuda a no confundir a dos jugadores con el mismo nombre."
                    picked={club ? { name: club.name } : null}
                    onPick={(value) => setClub(value.id ? { id: value.id, name: value.name } : null)}
                    onClear={() => setClub(null)}
                    inputId="aw-nom-club"
                />
            ) : null}

            <label className={styles.field} htmlFor="aw-nom-note">
                Por qué lo postulás
                <span className={styles.hint}>Una o dos frases. Si hay un partido o una fecha, mejor.</span>
                <textarea id="aw-nom-note" className={styles.textarea} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
            </label>

            <div>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canSend}>Enviar postulación</button>
                {!canSend && !busy ? (
                    <p className={styles.hint} style={{ margin: '8px 0 0' }}>
                        {isMoment ? 'Escribí cuál fue para enviar.' : isTyped ? 'Escribí a quién postulás para enviar.' : 'Elegí a quién postular para enviar.'}
                    </p>
                ) : null}
            </div>
            {notice ? <p className={styles.notice} data-tone={notice.tone} role="status">{notice.text}</p> : null}
            {already.length > 0 ? (
                <ul className={styles.mine}>
                    <li><b>Ya postulaste en {category?.name}:</b> {already.join(', ')}</li>
                </ul>
            ) : null}
        </form>
    );
}

// ── Jugada de los pibes ───────────────────────────────────────────────────

function PlayForm({ config, onDone }: { config: AwardEditionConfig; onDone?: () => void }) {
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [club, setClub] = useState<{ id: string; name: string } | null>(null);
    const [ageGroup, setAgeGroup] = useState(AGE_GROUPS[0]);
    const [description, setDescription] = useState('');
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [way, setWay] = useState<'link' | 'mail'>('link');

    const ready = url.trim().length >= 8 && consent && !busy;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setNotice(null);
        const result = await callApi(`/api/awards/${config.slug}/plays`, {
            method: 'POST',
            body: JSON.stringify({ url, title, clubId: club?.id, ageGroup, description, consent }),
        });
        setBusy(false);
        if (!result.ok) {
            setNotice({ tone: 'bad', text: errorOf(result, 'No se pudo guardar la jugada.') });
            return;
        }
        setNotice({ tone: 'ok', text: 'Jugada recibida. Cuando la revisemos entra a la votación de la jugada de los pibes.' });
        setUrl('');
        setTitle('');
        setClub(null);
        setDescription('');
        setConsent(false);
        onDone?.();
    }

    return (
        <div>
            <div className={styles.actions} role="group" aria-label="Cómo enviar la jugada">
                <button type="button" className={styles.chip} aria-pressed={way === 'link'} onClick={() => setWay('link')}>Pegar un link</button>
                <button type="button" className={styles.chip} aria-pressed={way === 'mail'} onClick={() => setWay('mail')}>Mandar por mail</button>
            </div>
            {way === 'mail' ? (
                <p className={styles.notice}>
                    Mandanos el video o el link por mail con el club, la edad de los jugadores, el rival y la fecha. Un editor la carga y la revisa igual que las del formulario. El mail oficial se publica en esta página cuando esté definido.
                </p>
            ) : (
                <form className={styles.form} onSubmit={submit}>
                    <label className={styles.field} htmlFor="aw-play-url">
                        Link del video
                        <span className={styles.hint}>YouTube, Instagram, TikTok, Drive o un archivo directo.</span>
                        <input id="aw-play-url" className={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" />
                    </label>
                    <label className={styles.field} htmlFor="aw-play-title">
                        Título
                        <input id="aw-play-title" className={styles.input} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Ejemplo: Try de contraataque en M16" />
                    </label>
                    <div className={styles.cols}>
                        <Picker
                            edition={config.slug}
                            type="club"
                            label="Club"
                            picked={club ? { name: club.name } : null}
                            onPick={(value) => setClub(value.id ? { id: value.id, name: value.name } : null)}
                            onClear={() => setClub(null)}
                            inputId="aw-play-club"
                        />
                        <label className={styles.field} htmlFor="aw-play-age">
                            Edad de los jugadores
                            <select id="aw-play-age" className={styles.select} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                                {AGE_GROUPS.map((age) => <option key={age}>{age}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className={styles.field} htmlFor="aw-play-desc">
                        Qué pasa en la jugada
                        <textarea id="aw-play-desc" className={styles.textarea} value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} placeholder="Rival, fecha y quién la hace." />
                    </label>
                    <label className={`${styles.field} ${styles.check}`} htmlFor="aw-play-consent">
                        <input id="aw-play-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>Tengo permiso para compartir este video y los menores que aparecen cuentan con la autorización de sus familias.</span>
                    </label>
                    <div>
                        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!ready}>Enviar jugada</button>
                        {!ready && !busy ? (
                            <p className={styles.hint} style={{ margin: '8px 0 0' }}>
                                {url.trim().length < 8 ? 'Pegá el link del video para enviar.' : 'Confirmá el permiso para enviar.'}
                            </p>
                        ) : null}
                    </div>
                    {notice ? <p className={styles.notice} data-tone={notice.tone} role="status">{notice.text}</p> : null}
                </form>
            )}
        </div>
    );
}

// ── Votar ─────────────────────────────────────────────────────────────────

function CategoryVote({
    config,
    category,
    finalists,
    initialVote,
    signedIn,
    onNeedLogin,
    onDone,
}: {
    config: AwardEditionConfig;
    category: AwardCategory;
    finalists: FinalistView[];
    initialVote: string | null;
    signedIn: boolean;
    onNeedLogin: () => void;
    onDone?: () => void;
}) {
    const router = useRouter();
    const [selected, setSelected] = useState<string | null>(initialVote);
    const [saved, setSaved] = useState<string | null>(initialVote);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    async function vote() {
        if (!selected) return;
        if (!signedIn) {
            onNeedLogin();
            return;
        }
        setBusy(true);
        setNotice(null);
        const result = await callApi(`/api/awards/${config.slug}/vote`, {
            method: 'POST',
            body: JSON.stringify({ category: category.slug, finalistId: selected }),
        });
        setBusy(false);
        if (!result.ok) {
            if (result.status === 401) onNeedLogin();
            setNotice({ tone: 'bad', text: errorOf(result, 'No se pudo guardar tu voto.') });
            return;
        }
        setSaved(selected);
        setNotice({ tone: 'ok', text: 'Voto registrado. Podés cambiarlo hasta que cierre la votación.' });
        router.refresh();
        onDone?.();
    }

    const changed = selected !== saved;
    const chosen = finalists.find((f) => f.id === selected);
    // Un radiogroup se recorre con flechas y entra a la tabulación por UNA opción.
    const focusId = selected ?? finalists[0]?.id ?? null;

    function onArrowKeys(event: React.KeyboardEvent<HTMLDivElement>) {
        const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
        const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
        if ((!forward && !backward) || finalists.length === 0) return;
        event.preventDefault();
        const current = finalists.findIndex((f) => f.id === (selected ?? focusId));
        const index = current < 0 ? 0 : (current + (forward ? 1 : -1) + finalists.length) % finalists.length;
        setSelected(finalists[index].id);
        setNotice(null);
        (event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[index])?.focus();
    }

    return (
        <article className={styles.card} aria-labelledby={`aw-cat-${category.slug}`}>
            <div className={styles.catHead}>
                <h3 id={`aw-cat-${category.slug}`} className={`${styles.display} ${styles.gold}`}>{category.name}</h3>
                <p>{category.description}</p>
            </div>
            {finalists.length === 0 ? (
                <p className={styles.empty}>Esta categoría quedó sin candidatos.</p>
            ) : (
                <>
                    <div className={styles.cands} role="radiogroup" aria-labelledby={`aw-cat-${category.slug}`} onKeyDown={onArrowKeys}>
                        {finalists.map((finalist) => (
                            <button
                                key={finalist.id}
                                type="button"
                                role="radio"
                                aria-checked={selected === finalist.id}
                                tabIndex={finalist.id === focusId ? 0 : -1}
                                className={styles.cand}
                                onClick={() => { setSelected(finalist.id); setNotice(null); }}
                            >
                                <Crest logoUrl={finalist.logoUrl} name={finalist.clubName ?? finalist.name} />
                                <span>
                                    <b>{finalist.name}</b>
                                    <span className={styles.candMeta}>{finalist.clubName ?? (finalist.playUrl ? 'Jugada de los pibes' : '')}</span>
                                    {finalist.playUrl ? (
                                        <>
                                            <br />
                                            <a className={styles.playLink} href={finalist.playUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Ver la jugada</a>
                                        </>
                                    ) : null}
                                </span>
                                <span className={styles.radio} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                    <div className={styles.voteBar}>
                        <span className={styles.msg}>
                            {!selected ? 'Elegí un candidato para votar.' : !changed ? `Tu voto: ${chosen?.name ?? ''}.` : `Vas a votar a ${chosen?.name ?? ''}.`}
                        </span>
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!selected || !changed || busy} onClick={vote}>
                            {saved ? 'Cambiar voto' : 'Votar'}
                        </button>
                    </div>
                    {notice ? <p className={styles.notice} data-tone={notice.tone} role="status" style={{ marginTop: 10 }}>{notice.text}</p> : null}
                </>
            )}
        </article>
    );
}

// ── Resultados ────────────────────────────────────────────────────────────

function CategoryResult({ category, finalists }: { category: AwardCategory; finalists: FinalistView[] }) {
    const ordered = [...finalists].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.rank - b.rank);
    const top = ordered[0];
    const hasVotes = (top?.votes ?? 0) > 0;
    return (
        <article className={styles.card} aria-labelledby={`aw-res-${category.slug}`}>
            <div className={styles.catHead}>
                <h3 id={`aw-res-${category.slug}`} className={`${styles.display} ${styles.gold}`}>{category.name}</h3>
            </div>
            {ordered.length === 0 ? <p className={styles.empty}>Esta categoría quedó sin candidatos.</p> : (
                <div className={styles.result}>
                    {ordered.map((finalist, index) => {
                        const winner = hasVotes && index === 0;
                        return (
                            <div key={finalist.id} className={styles.resultRow} data-winner={winner}>
                                <Crest logoUrl={finalist.logoUrl} name={finalist.clubName ?? finalist.name} />
                                <div>
                                    {winner ? <span className={styles.winnerTag}>Ganador</span> : null}
                                    <b style={{ display: 'block', overflowWrap: 'anywhere' }}>{finalist.name}</b>
                                    <span className={styles.candMeta}>{finalist.clubName ?? ''}{finalist.clubName ? ' · ' : ''}{finalist.votes ?? 0} {finalist.votes === 1 ? 'voto' : 'votos'}</span>
                                    <div className={styles.meter}><i style={{ width: `${finalist.percent ?? 0}%` }} /></div>
                                </div>
                                <span className={styles.pct}>{finalist.percent ?? 0}%</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </article>
    );
}

/** Equipo ideal: los once más postulados. Si no hubo cobertura suficiente, la categoría se omite. */
function IdealXi({ category, finalists }: { category: AwardCategory; finalists: FinalistView[] }) {
    if (finalists.length < XI_SIZE) return null;
    return (
        <article className={styles.card} aria-labelledby={`aw-xi-${category.slug}`}>
            <div className={styles.catHead}>
                <h3 id={`aw-xi-${category.slug}`} className={`${styles.display} ${styles.gold}`}>{category.name}</h3>
                <p>Los {XI_SIZE} más postulados por la gente.</p>
            </div>
            <ol className={styles.xi}>
                {finalists.map((player) => (
                    <li key={player.id}>
                        <Crest logoUrl={player.logoUrl} name={player.clubName ?? player.name} />
                        <span>
                            <b>{player.name}</b>
                            <span className={styles.candMeta}>{player.clubName ?? ''}</span>
                        </span>
                    </li>
                ))}
            </ol>
        </article>
    );
}

/** Los mejores del mundo: no se votan; es nuestra lectura de los premios de la FIH. */
function EditorialPick({ category, finalist }: { category: AwardCategory; finalist: FinalistView | null }) {
    if (!finalist) return null;
    return (
        <article className={styles.card} aria-labelledby={`aw-ed-${category.slug}`}>
            <div className={styles.catHead}>
                <h3 id={`aw-ed-${category.slug}`} className={`${styles.display} ${styles.gold}`}>{category.name}</h3>
                <p>Nuestra lectura de los premios de la FIH</p>
            </div>
            <div className={styles.resultRow} data-winner="true">
                <Crest logoUrl={null} name={finalist.name} />
                <div>
                    <span className={styles.winnerTag}>Nuestra elección</span>
                    <b style={{ display: 'block', overflowWrap: 'anywhere' }}>{finalist.name}</b>
                    {finalist.clubName ? <span className={styles.candMeta}>{finalist.clubName}</span> : null}
                </div>
                <span />
            </div>
            {finalist.note ? <p className={styles.lede} style={{ margin: '12px 0 0' }}>{finalist.note}</p> : null}
        </article>
    );
}

// ── La página ─────────────────────────────────────────────────────────────

/** Tarjeta con el nombre y la descripción de una categoría; adentro va lo que corresponda a la etapa. */
function HeadCard({ category, children }: { category: AwardCategory; children: ReactNode }) {
    return (
        <article className={styles.card} aria-labelledby={`aw-head-${category.slug}`}>
            <div className={styles.catHead}>
                <h3 id={`aw-head-${category.slug}`} className={`${styles.display} ${styles.gold}`}>{category.name}</h3>
                <p>{category.description}</p>
            </div>
            {children}
        </article>
    );
}

/** Qué categorías tienen algo para hacer en cada etapa (las editoriales no se postulan ni se votan). */
function isActionable(stage: AwardStage, kind: AwardCategory['kind']): boolean {
    if (stage === 'postulaciones') return acceptsNominations(kind) || kind === 'play';
    if (stage === 'votacion') return isVotableKind(kind);
    return true;
}

/** Las cards de categorías: tocás una y entrás a postular, votar o ver su resultado. */
function CategoryCards({
    categories,
    stage,
    myNominations,
    myVotes,
    onPick,
    exclude,
}: {
    categories: readonly AwardCategory[];
    stage: AwardStage;
    myNominations: Record<string, string[]>;
    myVotes: Record<string, string>;
    onPick: (slug: string) => void;
    exclude?: string;
}) {
    const visible = categories.filter((category) => category.slug !== exclude && isActionable(stage, category.kind));
    return (
        <div className={styles.cardGroups}>
            {groupCategories(visible).map((entry) => (
                <div key={entry.group} className={styles.group}>
                    <h3 className={styles.groupTitle}>{entry.group}</h3>
                    <ul className={styles.catList}>
                        {entry.items.map((category) => {
                            const posted = myNominations[category.slug]?.length ?? 0;
                            const badge = stage === 'postulaciones' && posted > 0
                                ? `Postulaste (${posted})`
                                : stage === 'votacion' && myVotes[category.slug]
                                    ? 'Ya votaste'
                                    : null;
                            return (
                                <li key={category.slug}>
                                    <button type="button" className={styles.catCard} onClick={() => onPick(category.slug)}>
                                        <b>{category.name}</b>
                                        <span>{category.description}</span>
                                        {badge ? <em className={styles.catBadge}>{badge}</em> : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function stageState(stage: AwardStage, step: AwardStage): 'done' | 'on' | 'next' {
    const current = AWARD_STAGES.indexOf(stage);
    const index = AWARD_STAGES.indexOf(step);
    return index < current ? 'done' : index === current ? 'on' : 'next';
}

export default function AwardsClient({ config, state, canManage }: Props) {
    const { user, login } = useAuth();
    const signedIn = Boolean(user);
    const toLogin = () => login('fan', returnTo());
    // null = la pantalla de cards; con una categoría elegida se ve solo esa.
    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    /** Terminó de postular o votar en la categoría abierta: se ofrecen las demás. */
    const [done, setDone] = useState(false);

    if (state.available === false) {
        return (
            <div className={styles.wrap}>
                <header className={styles.hero}>
                    <EditionLogo config={config} />
                </header>
                <section className={styles.section}>
                    <p className={styles.lede}>
                        {canManage
                            ? `Los premios todavía no están habilitados: falta correr la migración ${state.migration}.`
                            : 'Los premios abren pronto. Volvé en unos días.'}
                    </p>
                </section>
            </div>
        );
    }

    const stage = state.edition.stage;
    const closes = stage === 'postulaciones' ? formatDate(state.edition.nominationsCloseAt) : stage === 'votacion' ? formatDate(state.edition.votingCloseAt) : null;
    const stageSummary: Record<AwardStage, string> = {
        postulaciones: 'Proponé nombres y jugadas. Los más postulados pasan a la votación.',
        votacion: 'Cinco candidatos por categoría. Un voto por categoría.',
        resultados: 'Ganadores y podio por club.',
    };

    const finalistsOf = (slug: string) => state.finalists.filter((f) => f.category === slug).sort((a, b) => a.rank - b.rank);

    const active = activeSlug ? config.categories.find((c) => c.slug === activeSlug) ?? null : null;
    const activeFinalists = active ? finalistsOf(active.slug) : [];
    const pickCategory = (slug: string | null) => {
        setActiveSlug(slug);
        setDone(false);
    };
    const loginCard = (text: string) => (
        <div>
            <p style={{ marginTop: 0 }}>{text}</p>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={toLogin}>Entrar con mi mail</button>
        </div>
    );
    const panelLede = stage === 'postulaciones'
        ? 'Podés postular hasta cinco personas por categoría. Para participar entrá con tu mail verificado.'
        : stage === 'votacion'
            ? 'Un voto por categoría, y lo podés cambiar hasta que cierre. Los resultados se muestran al final.'
            : `${state.totalVotes} ${state.totalVotes === 1 ? 'voto' : 'votos'} en total.`;

    let panel: ReactNode = null;
    if (!active) {
        panel = null;
    } else if (stage === 'postulaciones') {
        if (active.kind === 'editorial') {
            panel = <HeadCard category={active}><p className={styles.hint} style={{ margin: 0 }}>Es nuestra lectura de los premios de la FIH: no se postula ni se vota. Se publica junto con los resultados.</p></HeadCard>;
        } else if (!signedIn) {
            panel = <HeadCard category={active}>{loginCard(active.kind === 'play' ? 'Entrá con tu mail para mandar una jugada.' : 'Entrá con tu mail para postular.')}</HeadCard>;
        } else if (active.kind === 'play') {
            panel = <HeadCard category={active}><PlayForm config={config} onDone={() => setDone(true)} /></HeadCard>;
        } else {
            panel = <HeadCard category={active}><NominationForm key={active.slug} config={config} category={active} mine={state.myNominations} onDone={() => setDone(true)} /></HeadCard>;
        }
    } else if (stage === 'votacion') {
        panel = isVotableKind(active.kind) ? (
            <CategoryVote
                key={active.slug}
                config={config}
                category={active}
                finalists={activeFinalists}
                initialVote={state.myVotes[active.slug] ?? null}
                signedIn={signedIn}
                onNeedLogin={toLogin}
                onDone={() => setDone(true)}
            />
        ) : (
            <HeadCard category={active}><p className={styles.hint} style={{ margin: 0 }}>Esta categoría no se vota: se publica junto con los resultados.</p></HeadCard>
        );
    } else if (active.kind === 'xi') {
        panel = activeFinalists.length >= XI_SIZE
            ? <IdealXi category={active} finalists={activeFinalists} />
            : <HeadCard category={active}><p className={styles.hint} style={{ margin: 0 }}>Esta categoría se omitió: no hubo cobertura suficiente.</p></HeadCard>;
    } else if (active.kind === 'editorial') {
        panel = activeFinalists[0]
            ? <EditorialPick category={active} finalist={activeFinalists[0]} />
            : <HeadCard category={active}><p className={styles.hint} style={{ margin: 0 }}>Todavía no cargamos nuestra elección.</p></HeadCard>;
    } else {
        panel = <CategoryResult category={active} finalists={activeFinalists} />;
    }

    return (
        <div className={styles.wrap}>
            <nav className={styles.crumbs} aria-label="Awards">
                <Link href="/awards">Awards</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{config.name}</span>
                {AWARD_EDITIONS.filter((other) => other.slug !== config.slug).map((other) => (
                    <Link key={other.slug} href={`/awards/${other.slug}`} className={styles.crumbsOther}>Ir a {other.name}</Link>
                ))}
            </nav>
            <header className={styles.hero}>
                <div className={styles.eyebrow}>Premios de la comunidad</div>
                <EditionLogo config={config} year={state.edition.season} />
                {/* El logo ya lleva el año: sin logo ni wordmark, se escribe la temporada. */}
                {config.logo || config.wordmark ? null : <div className={styles.edition}>Temporada {state.edition.season}</div>}
                <p className={styles.tagline}>{config.tagline}</p>
                <span className={styles.stageChip}>
                    <span className={styles.dot} aria-hidden="true" />
                    {STAGE_OPEN_LABEL[stage]}
                    {closes ? ` hasta el ${closes}` : ''}
                </span>
                {canManage ? (
                    <p style={{ margin: '14px 0 0' }}>
                        <a className={`${styles.btn} ${styles.btnSmall}`} href="#admin">Ver quién postuló</a>
                    </p>
                ) : null}
            </header>

            <section className={styles.section} aria-labelledby="aw-steps">
                <p id="aw-steps" className={styles.lede}>{stageSummary[stage]} El premio es el reconocimiento y una placa para compartir.</p>
                <ol className={styles.steps}>
                    {AWARD_STAGES.map((step) => {
                        const status = stageState(stage, step);
                        return (
                            <li key={step} data-state={status}>
                                <em>{status === 'done' ? 'Cerrada' : status === 'on' ? 'Ahora' : 'Próximamente'}</em>
                                <b>{STAGE_LABELS[step]}</b>
                                <span>
                                    {step === 'postulaciones' ? 'La gente propone jugadores, clubes y jugadas.' : step === 'votacion' ? 'Se vota entre los más postulados.' : 'Se conocen los ganadores.'}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </section>

            <section className={styles.section} id="categorias" aria-labelledby="aw-cats">
                <div className={styles.eyebrow}>
                    {stage === 'postulaciones' ? 'Estamos en etapa de postulaciones' : stage === 'votacion' ? 'Votación abierta' : 'Resultados'}
                </div>
                <h2 id="aw-cats" className={`${styles.display} ${styles.gold}`}>
                    {stage === 'postulaciones' ? '¿A qué querés postular?' : stage === 'votacion' ? '¿Qué querés votar?' : 'Los ganadores'}
                </h2>
                {active ? null : <p className={styles.lede}>{panelLede}</p>}
                {stage === 'votacion' && !signedIn ? (
                    <p style={{ margin: '0 0 16px' }}>
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={toLogin}>Entrar con mi mail</button>
                    </p>
                ) : null}

                {active ? (
                    <>
                        <button type="button" className={`${styles.btn} ${styles.btnSmall} ${styles.back}`} onClick={() => pickCategory(null)}>
                            ← Todas las categorías
                        </button>
                        <div className={styles.catPanel}>{panel}</div>
                        {done ? (
                            <div className={styles.next}>
                                <h3 className={`${styles.display} ${styles.gold}`}>
                                    {stage === 'votacion' ? '¿Querés votar otra categoría?' : '¿Querés postular en otra categoría?'}
                                </h3>
                                <CategoryCards
                                    categories={config.categories}
                                    stage={stage}
                                    myNominations={state.myNominations}
                                    myVotes={state.myVotes}
                                    exclude={active.slug}
                                    onPick={pickCategory}
                                />
                            </div>
                        ) : null}
                    </>
                ) : (
                    <CategoryCards
                        categories={config.categories}
                        stage={stage}
                        myNominations={state.myNominations}
                        myVotes={state.myVotes}
                        onPick={pickCategory}
                    />
                )}

                {stage === 'resultados' && state.clubTally.length > 0 ? (
                    <div className={styles.card} style={{ marginTop: 22 }}>
                        <h3 className={`${styles.display} ${styles.gold}`}>Pulso por club</h3>
                        <p className={styles.hint} style={{ marginTop: 0 }}>Votos recibidos por los candidatos de cada club.</p>
                        <div className={styles.tally}>
                            {state.clubTally.map((club) => {
                                const max = state.clubTally[0]?.votes || 1;
                                return (
                                    <div key={club.clubId ?? club.clubName} className={styles.tallyRow}>
                                        <span>{club.clubName}</span>
                                        <div className={styles.meter}><i style={{ width: `${Math.round((club.votes / max) * 100)}%` }} /></div>
                                        <strong>{club.votes}</strong>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </section>

            {canManage ? (
                <section className={styles.section} id="admin" aria-labelledby="aw-admin">
                    <div className={styles.eyebrow}>Solo para la editorial</div>
                    <h2 id="aw-admin" className={`${styles.display} ${styles.gold}`}>Panel del comité</h2>
                    <AdminPanel config={config} />
                </section>
            ) : null}
        </div>
    );
}
