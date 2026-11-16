'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
    isCompleteBallot,
    XV_PITCH,
    type XvCandidate,
    type XvPicks,
    type XvPollSummary,
    type XvSlotResult,
} from '@/lib/xvIdeal/xvIdeal';
import styles from './XvIdeal.module.css';

interface Props {
    groupKey: string;
    /** Solo el super admin: muestra el acceso al panel de resultados. */
    isSuperAdmin: boolean;
    available: boolean;
    initialPolls: XvPollSummary[];
    migration: string;
}

interface Thanks {
    emailed: boolean;
    emailTo: string;
}

const CLOSE_MS = 180;

function returnTo(): string | undefined {
    return typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

function draftOf(poll: XvPollSummary): XvPicks {
    return { ...(poll.userPicks ?? {}) };
}

function samePicks(a: XvPicks, b: XvPicks): boolean {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Escudo del equipo; sin archivo, la inicial. Alt vacío: el nombre ya está al lado. */
function Crest({ candidate, className }: { candidate: Pick<XvCandidate, 'logo' | 'team'>; className: string }) {
    if (candidate.logo) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className={className} src={candidate.logo} alt="" loading="lazy" decoding="async" />;
    }
    return <span className={`${className} ${styles.crestFallback}`} aria-hidden="true">{candidate.team.slice(0, 1)}</span>;
}

export default function XvIdealClient({ groupKey, isSuperAdmin, available, initialPolls, migration }: Props) {
    const { user, login } = useAuth();
    const [polls, setPolls] = useState(initialPolls);
    const [activeId, setActiveId] = useState(initialPolls[0]?.id ?? '');
    const [drafts, setDrafts] = useState<Record<string, XvPicks>>(
        () => Object.fromEntries(initialPolls.map((poll) => [poll.id, draftOf(poll)])),
    );
    const [thanks, setThanks] = useState<Record<string, Thanks>>({});
    const [saving, setSaving] = useState(false);
    const [resending, setResending] = useState(false);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    // El pop-up de votación: qué camiseta está abierta y si se está cerrando (para animar la salida).
    const [openJersey, setOpenJersey] = useState<number | null>(null);
    const [closing, setClosing] = useState(false);
    const [justFilled, setJustFilled] = useState<number | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const poll = polls.find((entry) => entry.id === activeId) ?? polls[0];
    const draft = useMemo(() => (poll ? (drafts[poll.id] ?? {}) : {}), [drafts, poll]);

    const slotsByJersey = useMemo(() => {
        const map = new Map<number, XvSlotResult>();
        for (const slot of poll?.results ?? []) map.set(slot.jersey, slot);
        return map;
    }, [poll]);

    const closeSheet = useCallback((after?: () => void) => {
        setClosing(true);
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            setOpenJersey(null);
            setClosing(false);
            after?.();
            returnFocus.current?.focus();
        }, CLOSE_MS);
    }, []);

    // Esc cierra; con el pop-up abierto el fondo no se desplaza.
    useEffect(() => {
        if (openJersey === null) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeSheet();
        };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [openJersey, closeSheet]);

    useEffect(() => () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
    }, []);

    useEffect(() => {
        if (justFilled === null) return;
        const timer = setTimeout(() => setJustFilled(null), 700);
        return () => clearTimeout(timer);
    }, [justFilled]);

    if (!available || !poll) {
        return (
            <main className={styles.page}>
                <div className={styles.wrap}>
                    <h1 className={styles.title}>XV Ideal</h1>
                    <p className={styles.empty}>
                        La votación todavía no está habilitada. Falta correr la migración <code>{migration}</code>.
                    </p>
                </div>
            </main>
        );
    }

    const totalSlots = poll.results.length;
    const chosen = Object.keys(draft).length;
    const saved = poll.userPicks;
    const complete = isCompleteBallot(
        poll.results.map((slot) => ({ jersey: slot.jersey, label: slot.label, candidates: slot.candidates })),
        draft,
    );
    const dirty = !samePicks(draft, saved ?? {});
    const canVote = poll.isOpen;
    const openSlot = openJersey === null ? null : slotsByJersey.get(openJersey) ?? null;
    const thanksHere = thanks[poll.id] ?? null;
    const otherPoll = polls.find((entry) => entry.id !== poll.id && entry.isOpen && !entry.userPicks) ?? null;

    function selectZone(id: string) {
        setActiveId(id);
        setNotice(null);
    }

    function openTile(jersey: number, element: HTMLElement) {
        if (!canVote) return;
        if (!user) {
            login('fan', returnTo());
            return;
        }
        returnFocus.current = element;
        setNotice(null);
        setClosing(false);
        setOpenJersey(jersey);
    }

    function choose(jersey: number, candidateId: string) {
        if (!poll) return;
        const key = String(jersey);
        const pollId = poll.id;
        setDrafts((current) => ({ ...current, [pollId]: { ...(current[pollId] ?? {}), [key]: candidateId } }));
        closeSheet(() => setJustFilled(jersey));
    }

    function clearTile(jersey: number) {
        if (!poll) return;
        const key = String(jersey);
        const pollId = poll.id;
        setDrafts((current) => {
            const next = { ...(current[pollId] ?? {}) };
            delete next[key];
            return { ...current, [pollId]: next };
        });
        closeSheet();
    }

    async function submit() {
        if (!poll || saving) return;
        if (!user) {
            login('fan', returnTo());
            return;
        }
        setSaving(true);
        setNotice(null);
        try {
            const response = await fetch(`/api/xv-ideal/${poll.id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ picks: draft }),
            });
            if (response.status === 401) {
                login('fan', returnTo());
                return;
            }
            const body = (await response.json().catch(() => ({}))) as {
                poll?: XvPollSummary;
                emailed?: boolean;
                emailTo?: string;
                error?: string;
            };
            if (!response.ok || !body.poll) {
                setNotice({ kind: 'error', text: body.error ?? 'No se pudo guardar tu voto. Probá de nuevo.' });
                return;
            }
            const updated = body.poll;
            setPolls((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
            setDrafts((current) => ({ ...current, [updated.id]: draftOf(updated) }));
            setThanks((current) => ({ ...current, [updated.id]: { emailed: Boolean(body.emailed), emailTo: body.emailTo ?? '' } }));
        } catch {
            setNotice({ kind: 'error', text: 'No se pudo guardar tu voto. Revisá tu conexión y probá de nuevo.' });
        } finally {
            setSaving(false);
        }
    }

    async function resend() {
        if (!poll || resending) return;
        setResending(true);
        setNotice(null);
        try {
            const response = await fetch(`/api/xv-ideal/${poll.id}/email`, { method: 'POST' });
            const body = (await response.json().catch(() => ({}))) as { emailed?: boolean; emailTo?: string; error?: string };
            if (response.ok && body.emailed) {
                setThanks((current) => ({ ...current, [poll.id]: { emailed: true, emailTo: body.emailTo ?? '' } }));
            } else {
                setNotice({ kind: 'error', text: body.error ?? 'No pudimos mandar el mail. Probá de nuevo en un rato.' });
            }
        } catch {
            setNotice({ kind: 'error', text: 'No pudimos mandar el mail. Revisá tu conexión.' });
        } finally {
            setResending(false);
        }
    }

    // Lo que falta para poder enviar: el botón nunca queda mudo.
    let submitHint = '';
    let submitDisabled = false;
    if (!canVote) {
        submitHint = 'La votación cerró.';
        submitDisabled = true;
    } else if (!user) {
        submitHint = 'Iniciá sesión para votar.';
    } else if (!complete) {
        const missing = totalSlots - chosen;
        submitHint = `${missing === 1 ? 'Falta' : 'Faltan'} ${plural(missing, 'puesto', 'puestos')}: el XV de la zona tiene que estar completo.`;
        submitDisabled = true;
    } else if (!dirty) {
        submitHint = 'Tu voto ya está guardado. Cambiá un puesto para reenviarlo.';
        submitDisabled = true;
    }

    function renderTile(jersey: number, large?: boolean) {
        const slot = slotsByJersey.get(jersey);
        if (!slot) return null;
        const picked = slot.candidates.find((candidate) => candidate.id === draft[String(jersey)]) ?? null;
        return (
            <button
                type="button"
                className={styles.tile}
                data-large={Boolean(large)}
                data-filled={Boolean(picked)}
                data-pop={justFilled === jersey}
                disabled={!canVote}
                aria-label={
                    picked
                        ? `Camiseta ${jersey}, ${slot.label}: ${picked.name}, ${picked.team}. Cambiar jugador`
                        : `Camiseta ${jersey}, ${slot.label}: elegir jugador`
                }
                onClick={(event) => openTile(jersey, event.currentTarget)}
            >
                {picked ? (
                    <>
                        <span className={styles.tileCrest}>
                            <Crest candidate={picked} className={styles.tileLogo} />
                        </span>
                        <span className={styles.tileName}>
                            <span className={styles.tileNum}>{jersey}</span>
                            <span className={styles.tileText}>{picked.name}</span>
                        </span>
                    </>
                ) : (
                    <>
                        <span className={styles.tileBig}>{jersey}</span>
                        <span className={styles.tilePlus} aria-hidden="true">+</span>
                        <span className={styles.tilePos}>{slot.label}</span>
                    </>
                )}
            </button>
        );
    }

    const progressPct = totalSlots > 0 ? Math.round((chosen / totalSlots) * 100) : 0;

    function renderSend() {
        return (
            <>
                <div className={styles.progressHead}>
                    <strong>{poll.name} · {chosen}/{totalSlots}</strong>
                    <span>{progressPct}%</span>
                </div>
                <div className={styles.progress} aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></div>
                <p className={styles.hint} aria-live="polite" data-kind={notice?.kind}>{notice ? notice.text : submitHint}</p>
                <button type="button" className={styles.submit} disabled={submitDisabled || saving} onClick={submit}>
                    {saving ? 'Guardando…' : saved ? 'Actualizar mi XV' : 'Enviar mi XV'}
                </button>
            </>
        );
    }

    return (
        <main className={styles.page}>
            <div className={styles.wrap}>
                {/* Selector de zona: dos bloques. */}
                {polls.length > 1 && (
                    <div className={styles.zones} role="tablist" aria-label="Zona">
                        {polls.map((entry) => {
                            const count = Object.keys(drafts[entry.id] ?? {}).length;
                            const done = Boolean(entry.userPicks);
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={entry.id === poll.id}
                                    className={styles.zone}
                                    data-active={entry.id === poll.id}
                                    onClick={() => selectZone(entry.id)}
                                >
                                    <span className={styles.zoneName}>{entry.name}</span>
                                    <span className={styles.zoneMeta} data-done={done}>
                                        {done ? 'Votado ✓' : `${count}/${entry.results.length} puestos`}
                                    </span>
                                    <span className={styles.zoneBar} aria-hidden="true">
                                        <span style={{ width: `${done ? 100 : Math.round((count / Math.max(entry.results.length, 1)) * 100)}%` }} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className={styles.layout}>
                    {/* Izquierda en escritorio / arriba y compacto en celular: la explicación. */}
                    <aside className={styles.info}>
                        <div className={styles.infoCard}>
                            <div className={styles.infoGlow} aria-hidden="true" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className={styles.infoLogo} src="/awards/oficiales/s22-awards-2026-blanco.png" alt="Salida de 22 Awards 2026" width={3891} height={2868} />
                            <p className={styles.kicker}>
                                {poll.isOpen ? 'Votación abierta' : 'Votación cerrada'} · Campeonato Argentino Juvenil M17
                            </p>
                            <h1 className={styles.infoTitle}>Votá a los mejores del Argentino Juvenil</h1>
                            <p className={styles.infoLede}>Tocá una camiseta y elegí a tu jugador. Para votar, completá los 15 puestos de la zona.</p>

                            <ol className={styles.how}>
                                <li><span>1</span>Tocá una camiseta y elegí a tu jugador.</li>
                                <li><span>2</span>Completá los 15 puestos de la zona para poder votar.</li>
                                <li><span>3</span>Enviá tu XV: te lo mandamos a tu mail con placas para compartir.</li>
                            </ol>
                            <p className={styles.infoNote}>Podés votar una sola zona o las dos: cada una es una votación aparte.</p>

                            <a className={styles.cta} href="#xv-cancha">Armar mi XV</a>
                            {isSuperAdmin && (
                                <a className={styles.adminLink} href={`/xv-ideal/${groupKey}/resultados`}>
                                    Ver cómo va la votación (solo super admin)
                                </a>
                            )}

                            <ul className={styles.stats}>
                                <li><strong>15</strong> camisetas</li>
                                <li><strong>{polls.length}</strong> {polls.length === 1 ? 'zona' : 'zonas'}</li>
                            </ul>

                            {/* Envío en escritorio (en celular va debajo de la cancha). */}
                            <div className={styles.desktopSend}>{renderSend()}</div>
                        </div>
                    </aside>

                    <section className={styles.stage} aria-label={`XV ideal de la ${poll.name}`}>
                        <span id="xv-cancha" className={styles.anchor} />
                        {!user && poll.isOpen && (
                            <div className={styles.loginNote} role="note">
                                <span>Necesitás iniciar sesión para votar.</span>
                                <button type="button" className={styles.link} onClick={() => login('fan', returnTo())}>
                                    Iniciar sesión
                                </button>
                            </div>
                        )}

                        {thanksHere ? (
                            <div className={styles.thanks}>
                                <p className={styles.thanksKicker}>Voto guardado</p>
                                <h2 className={styles.thanksTitle}>Gracias por votar</h2>
                                <p className={styles.thanksText}>Tu XV de la {poll.name} quedó guardado. Podés cambiarlo mientras la votación siga abierta.</p>

                                <div className={styles.mail} data-ok={thanksHere.emailed}>
                                    {thanksHere.emailed ? (
                                        <p>Te mandamos tus votos a <strong>{thanksHere.emailTo}</strong>, con tu placa para historias y para el feed.</p>
                                    ) : (
                                        <>
                                            <p>No pudimos mandarte el mail ahora, pero tu voto está guardado. Podés bajar tus placas acá abajo.</p>
                                            <button type="button" className={styles.secondary} disabled={resending} onClick={resend}>
                                                {resending ? 'Enviando…' : 'Reenviar a mi mail'}
                                            </button>
                                        </>
                                    )}
                                    {notice && <p className={styles.mailError} data-kind={notice.kind}>{notice.text}</p>}
                                </div>

                                <div className={styles.plates}>
                                    <a className={styles.plate} href={`/api/xv-ideal/${poll.id}/placa?format=story&download=1`} download>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/api/xv-ideal/${poll.id}/placa?format=story`} alt={`Tu XV de la ${poll.name}, placa para historias`} loading="lazy" />
                                        <span>Bajar para historias</span>
                                    </a>
                                    <a className={styles.plate} href={`/api/xv-ideal/${poll.id}/placa?format=post&download=1`} download>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/api/xv-ideal/${poll.id}/placa?format=post`} alt={`Tu XV de la ${poll.name}, placa para el feed`} loading="lazy" />
                                        <span>Bajar para el feed</span>
                                    </a>
                                </div>

                                <div className={styles.thanksActions}>
                                    {otherPoll && (
                                        <button type="button" className={styles.submit} onClick={() => selectZone(otherPoll.id)}>
                                            Votar también la {otherPoll.name}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={styles.linkBtn}
                                        onClick={() => {
                                            setThanks((current) => {
                                                const next = { ...current };
                                                delete next[poll.id];
                                                return next;
                                            });
                                        }}
                                    >
                                        Cambiar mi voto
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Escritorio: la cancha entera. */}
                                <div className={styles.pitch}>
                                    {XV_PITCH.map((row, rowIndex) => (
                                        <div key={rowIndex} className={styles.row}>
                                            {row.map(({ jersey, col }) => (
                                                <div key={jersey} className={styles.cell} data-col={col}>
                                                    {renderTile(jersey)}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.sendMobile}>{renderSend()}</div>
                            </>
                        )}

                    </section>
                </div>

                <p className={styles.foot} data-group={groupKey}>
                    Los puntos y los partidos jugados son los del torneo, a la fecha de la votación.
                </p>
            </div>

            {openSlot && openJersey !== null && (
                <div className={styles.overlay} data-closing={closing} onClick={() => closeSheet()}>
                    <div
                        className={styles.sheet}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="xv-sheet-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.sheetHead}>
                            <span className={styles.jersey}>{openJersey}</span>
                            <div className={styles.sheetTitleWrap}>
                                <h2 className={styles.sheetTitle} id="xv-sheet-title">{openSlot.label}</h2>
                                <p className={styles.sheetSub}>{poll.name} · elegí un jugador</p>
                            </div>
                            <button type="button" className={styles.sheetClose} aria-label="Cerrar" onClick={() => closeSheet()}>×</button>
                        </div>
                        <div className={styles.options} role="radiogroup" aria-labelledby="xv-sheet-title">
                            {openSlot.candidates.map((candidate, index) => {
                                const selected = draft[String(openJersey)] === candidate.id;
                                return (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        className={styles.option}
                                        data-selected={selected}
                                        style={{ animationDelay: `${60 + index * 45}ms` }}
                                        autoFocus={selected || (index === 0 && !draft[String(openJersey)])}
                                        onClick={() => choose(openJersey, candidate.id)}
                                    >
                                        <Crest candidate={candidate} className={styles.optionLogo} />
                                        <span className={styles.optionBody}>
                                            <span className={styles.name}>{candidate.name}</span>
                                            <span className={styles.meta}>
                                                {candidate.team}
                                                {candidate.pj !== null && ` · ${candidate.pj} PJ`}
                                                {candidate.points !== null && ` · ${candidate.points} pts`}
                                            </span>
                                        </span>
                                        {selected && <span className={styles.tick} aria-hidden="true">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {draft[String(openJersey)] && (
                            <button type="button" className={styles.clear} onClick={() => clearTile(openJersey)}>
                                Quitar mi elección
                            </button>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
