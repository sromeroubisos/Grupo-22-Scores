'use client';

// El panel de quien arma los premios: revisa lo que postuló la gente, arma la
// terna con los más postulados y pasa de etapa. Solo lo ve la editorial; las
// rutas /api/awards/:edition/admin lo vuelven a exigir.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AwardEditionConfig, AwardStage } from '@/lib/awards/config';
import { STAGE_LABELS } from '@/lib/awards/config';
import type { AdminOverview, AwardEditionState } from '@/lib/server/awards';
import styles from '../awards.module.css';

export interface ApiResult {
    ok: boolean;
    status: number;
    data: Record<string, unknown>;
}

/** Un pedido a la API: nunca lanza; el mensaje de error viene en `data.error`. */
export async function callApi(url: string, init?: RequestInit): Promise<ApiResult> {
    try {
        const response = await fetch(url, {
            ...init,
            headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
            cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: response.ok, status: response.status, data };
    } catch {
        return { ok: false, status: 0, data: { error: 'No hay conexión. Probá de nuevo.' } };
    }
}

export function errorOf(result: ApiResult, fallback: string): string {
    return typeof result.data.error === 'string' && result.data.error ? result.data.error : fallback;
}

function toIsoOrNull(local: string): string | null {
    if (!local.trim()) return null;
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface AdminData {
    edition: AwardEditionState;
    overview: AdminOverview;
}

export default function AdminPanel({ config }: { config: AwardEditionConfig }) {
    const router = useRouter();
    const base = `/api/awards/${config.slug}/admin`;
    const [data, setData] = useState<AdminData | null>(null);
    const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmBuild, setConfirmBuild] = useState(false);
    const [nominationsClose, setNominationsClose] = useState('');
    const [votingClose, setVotingClose] = useState('');
    const [mailForm, setMailForm] = useState({ url: '', title: '', clubName: '', ageGroup: '', description: '' });
    const [editorial, setEditorial] = useState<Record<string, { name: string; detail: string; note: string }>>({});
    const editorialCategories = config.categories.filter((category) => category.kind === 'editorial');

    const load = useCallback(async () => {
        const result = await callApi(base);
        if (!result.ok) {
            setMessage({ tone: 'bad', text: errorOf(result, 'No se pudo cargar el panel.') });
            return;
        }
        const next = result.data as unknown as AdminData;
        setData(next);
        setNominationsClose(toLocalInput(next.edition.nominationsCloseAt));
        setVotingClose(toLocalInput(next.edition.votingCloseAt));
    }, [base]);

    useEffect(() => {
        void load();
    }, [load]);

    async function act(body: Record<string, unknown>, success: string): Promise<boolean> {
        setBusy(true);
        setMessage(null);
        const result = await callApi(base, { method: 'POST', body: JSON.stringify(body) });
        setBusy(false);
        if (!result.ok) {
            setMessage({ tone: 'bad', text: errorOf(result, 'No se pudo completar la acción.') });
            return false;
        }
        setMessage({ tone: 'ok', text: success });
        await load();
        router.refresh();
        return true;
    }

    async function buildTerna() {
        setConfirmBuild(false);
        setBusy(true);
        setMessage(null);
        const result = await callApi(base, { method: 'POST', body: JSON.stringify({ action: 'build-finalists' }) });
        setBusy(false);
        if (!result.ok) {
            setMessage({ tone: 'bad', text: errorOf(result, 'No se pudo armar la terna.') });
            return;
        }
        const empty = Array.isArray(result.data.empty) ? (result.data.empty as string[]) : [];
        const names = empty.map((slug) => config.categories.find((c) => c.slug === slug)?.name ?? slug);
        setMessage({
            tone: 'ok',
            text: names.length > 0
                ? `Terna armada y votación abierta. Sin candidatos: ${names.join(', ')}.`
                : 'Terna armada y votación abierta.',
        });
        await load();
        router.refresh();
    }

    if (!data) {
        return <p className={styles.empty}>{message ? message.text : 'Cargando el panel…'}</p>;
    }

    const stage: AwardStage = data.edition.stage;
    const pendingPlays = data.overview.plays.filter((play) => play.status === 'pending');

    return (
        <div className={styles.admin}>
            {message ? <p className={styles.notice} data-tone={message.tone} role="status">{message.text}</p> : null}

            <div className={styles.actions}>
                {stage === 'postulaciones' ? (
                    confirmBuild ? (
                        <>
                            <span className={styles.hint}>Cierra las postulaciones, fija los 5 más postulados por categoría y abre la votación.</span>
                            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={buildTerna}>Sí, armar terna</button>
                            <button type="button" className={styles.btn} onClick={() => setConfirmBuild(false)}>Cancelar</button>
                        </>
                    ) : (
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => setConfirmBuild(true)}>
                            Armar terna y abrir votación
                        </button>
                    )
                ) : null}
                {stage === 'votacion' ? (
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => act({ action: 'set-stage', stage: 'resultados' }, 'Votación cerrada. Los resultados ya son públicos.')}>
                        Cerrar votación y mostrar resultados
                    </button>
                ) : null}
                {stage === 'resultados' ? (
                    <button type="button" className={styles.btn} disabled={busy} onClick={() => act({ action: 'set-stage', stage: 'votacion' }, 'Votación reabierta.')}>
                        Reabrir la votación
                    </button>
                ) : null}
                <span className={styles.hint}>Etapa actual: {STAGE_LABELS[stage]}</span>
            </div>

            <form
                className={styles.form}
                onSubmit={(event) => {
                    event.preventDefault();
                    void act({
                        action: 'set-dates',
                        nominationsCloseAt: toIsoOrNull(nominationsClose),
                        votingCloseAt: toIsoOrNull(votingClose),
                    }, 'Fechas guardadas.');
                }}
            >
                <div className={styles.cols}>
                    <label className={styles.field} htmlFor="aw-nom-close">
                        Cierran las postulaciones
                        <input id="aw-nom-close" type="datetime-local" className={styles.input} value={nominationsClose} onChange={(e) => setNominationsClose(e.target.value)} />
                    </label>
                    <label className={styles.field} htmlFor="aw-vote-close">
                        Cierra la votación
                        <input id="aw-vote-close" type="datetime-local" className={styles.input} value={votingClose} onChange={(e) => setVotingClose(e.target.value)} />
                    </label>
                </div>
                <div><button type="submit" className={`${styles.btn} ${styles.btnSmall}`} disabled={busy}>Guardar fechas</button></div>
            </form>

            <h4 style={{ margin: '20px 0 4px' }}>Postulaciones por categoría</h4>
            {data.overview.categories.map((entry) => {
                const category = config.categories.find((c) => c.slug === entry.category);
                return (
                    <div key={entry.category} className={styles.adminCat}>
                        <h4>{category?.name ?? entry.category}</h4>
                        {entry.candidates.length === 0 ? <p className={styles.hint}>Todavía nadie postuló en esta categoría.</p> : null}
                        {entry.candidates.map((candidate, index) => (
                            <div key={candidate.subjectKey} className={styles.adminRow}>
                                <span>
                                    {index + 1}. <b>{candidate.subjectName}</b>
                                    {candidate.clubName ? <small> · {candidate.clubName}</small> : null}
                                    {candidate.notes.map((note) => (
                                        <small key={note} style={{ display: 'block' }}>«{note}»</small>
                                    ))}
                                </span>
                                <span className={styles.support}>{candidate.support} {candidate.support === 1 ? 'postulación' : 'postulaciones'}</span>
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
                                    disabled={busy || stage !== 'postulaciones'}
                                    onClick={() => act({ action: 'moderate-nomination', category: entry.category, subjectKey: candidate.subjectKey, status: 'rejected' }, `Sacaste a ${candidate.subjectName} de la lista.`)}
                                >
                                    Sacar
                                </button>
                            </div>
                        ))}
                        {entry.rejected.map((candidate) => (
                            <div key={candidate.subjectKey} className={styles.adminRow}>
                                <span><s>{candidate.subjectName}</s> <small>· sacado</small></span>
                                <span />
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnSmall}`}
                                    disabled={busy || stage !== 'postulaciones'}
                                    onClick={() => act({ action: 'moderate-nomination', category: entry.category, subjectKey: candidate.subjectKey, status: 'pending' }, `Devolviste a ${candidate.subjectName} a la lista.`)}
                                >
                                    Devolver
                                </button>
                            </div>
                        ))}
                    </div>
                );
            })}

            {editorialCategories.length > 0 ? (
                <>
                    <h4 style={{ margin: '20px 0 4px' }}>Nuestra lectura de los premios de la FIH</h4>
                    <p className={styles.hint} style={{ margin: '0 0 8px' }}>No se postulan ni se votan: cargás a quién elegimos y por qué. Se publica junto con los resultados.</p>
                    {editorialCategories.map((category) => {
                        const form = editorial[category.slug] ?? { name: '', detail: '', note: '' };
                        const patch = (next: Partial<typeof form>) => setEditorial({ ...editorial, [category.slug]: { ...form, ...next } });
                        return (
                            <form
                                key={category.slug}
                                className={styles.form}
                                style={{ marginBottom: 12 }}
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void act({ action: 'set-editorial', category: category.slug, ...form }, `Guardaste la elección de ${category.name}.`);
                                }}
                            >
                                <strong>{category.name}</strong>
                                <div className={styles.cols}>
                                    <label className={styles.field} htmlFor={`aw-ed-name-${category.slug}`}>
                                        Nombre
                                        <input id={`aw-ed-name-${category.slug}`} className={styles.input} value={form.name} maxLength={100} onChange={(e) => patch({ name: e.target.value })} />
                                    </label>
                                    <label className={styles.field} htmlFor={`aw-ed-detail-${category.slug}`}>
                                        País o club
                                        <input id={`aw-ed-detail-${category.slug}`} className={styles.input} value={form.detail} maxLength={100} onChange={(e) => patch({ detail: e.target.value })} />
                                    </label>
                                </div>
                                <label className={styles.field} htmlFor={`aw-ed-note-${category.slug}`}>
                                    Nuestra lectura
                                    <span className={styles.hint}>Qué dijo la FIH y por qué coincidimos o no.</span>
                                    <textarea id={`aw-ed-note-${category.slug}`} className={styles.textarea} value={form.note} maxLength={600} onChange={(e) => patch({ note: e.target.value })} />
                                </label>
                                <div><button type="submit" className={`${styles.btn} ${styles.btnSmall}`} disabled={busy || form.name.trim().length < 2}>Guardar</button></div>
                            </form>
                        );
                    })}
                </>
            ) : null}

            <h4 style={{ margin: '20px 0 4px' }}>Jugadas de los pibes ({pendingPlays.length} para revisar)</h4>
            {data.overview.plays.length === 0 ? <p className={styles.hint}>Todavía no llegó ninguna jugada.</p> : null}
            {data.overview.plays.map((play) => (
                <div key={play.id} className={styles.adminRow}>
                    <span>
                        <a href={play.url} target="_blank" rel="noopener noreferrer"><b>{play.title || play.url}</b></a>
                        <small> · {[play.clubName, play.ageGroup, play.via === 'email' ? 'por mail' : null].filter(Boolean).join(' · ') || 'sin datos'}</small>
                        {play.description ? <><br /><small>{play.description}</small></> : null}
                    </span>
                    <span className={styles.support}>{play.status === 'approved' ? 'Aprobada' : play.status === 'rejected' ? 'Rechazada' : 'Pendiente'}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className={`${styles.btn} ${styles.btnSmall}`} disabled={busy || play.status === 'approved' || stage !== 'postulaciones'} onClick={() => act({ action: 'moderate-play', playId: play.id, status: 'approved' }, 'Jugada aprobada.')}>Aprobar</button>
                        <button type="button" className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} disabled={busy || play.status === 'rejected' || stage !== 'postulaciones'} onClick={() => act({ action: 'moderate-play', playId: play.id, status: 'rejected' }, 'Jugada rechazada.')}>Rechazar</button>
                    </span>
                </div>
            ))}

            <form
                className={styles.form}
                style={{ marginTop: 16 }}
                onSubmit={async (event) => {
                    event.preventDefault();
                    const ok = await act({ action: 'add-email-play', ...mailForm }, 'Jugada cargada y aprobada.');
                    if (ok) setMailForm({ url: '', title: '', clubName: '', ageGroup: '', description: '' });
                }}
            >
                <strong>Cargar una jugada que llegó por mail</strong>
                <label className={styles.field} htmlFor="aw-mail-url">
                    Link del video
                    <input id="aw-mail-url" className={styles.input} value={mailForm.url} onChange={(e) => setMailForm({ ...mailForm, url: e.target.value })} placeholder="https://" required />
                </label>
                <div className={styles.cols}>
                    <label className={styles.field} htmlFor="aw-mail-title">
                        Título
                        <input id="aw-mail-title" className={styles.input} value={mailForm.title} onChange={(e) => setMailForm({ ...mailForm, title: e.target.value })} />
                    </label>
                    <label className={styles.field} htmlFor="aw-mail-club">
                        Club
                        <input id="aw-mail-club" className={styles.input} value={mailForm.clubName} onChange={(e) => setMailForm({ ...mailForm, clubName: e.target.value })} />
                    </label>
                </div>
                <div><button type="submit" className={`${styles.btn} ${styles.btnSmall}`} disabled={busy || !mailForm.url.trim()}>Cargar jugada</button></div>
            </form>
        </div>
    );
}
