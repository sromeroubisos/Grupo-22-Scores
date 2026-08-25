'use client';

// Videos del partido: highlights, partido completo o clips, cargados como
// links. El video no se aloja acá: se embebe el reproductor de la plataforma
// (YouTube, Vimeo, Dailymotion, Facebook, Twitch) y, si la plataforma no lo
// permite, se abre afuera.
//
// El reproductor no se carga hasta que alguien toca "Reproducir": un iframe
// de YouTube pesa más que el resto de la página, y con tres videos la pestaña
// tardaría más que el partido en cargar. Hasta entonces se ve la miniatura.
//
// Quien administra carga y quita los links acá mismo, en la pestaña: es la
// puerta por donde entra el dato, igual que en alineaciones. El servidor
// vuelve a chequear el permiso en cada guardado.

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
    MATCH_VIDEO_KINDS,
    MAX_MATCH_VIDEOS,
    MAX_VIDEO_TITLE_LENGTH,
    VIDEO_KIND_LABELS,
    VIDEO_PROVIDER_LABELS,
    describeVideo,
    normalizeMatchVideoLinks,
    parseVideoUrl,
    withAutoplay,
    type MatchVideoKind,
    type MatchVideoLink,
    type ParsedVideoUrl,
} from '@/lib/matches/videoLinks';

import styles from './MatchVideosPanel.module.css';

interface Props {
    matchId: string;
    videos: MatchVideoLink[];
    /** Quien administra ve el formulario y puede quitar. El servidor lo vuelve a chequear. */
    canManage: boolean;
    /** "SIC vs CASI": va en el título del reproductor para el lector de pantalla. */
    matchLabel: string;
    onChange: (videos: MatchVideoLink[]) => void;
}

// Twitch exige el dominio que embebe. Se lee después de montar para no
// desincronizar el HTML del servidor con el del navegador.
function useEmbedParent() {
    const [parent, setParent] = useState<string | null>(null);
    useEffect(() => {
        setParent(window.location.hostname || null);
    }, []);
    return parent;
}

function PlayIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
        </svg>
    );
}

export default function MatchVideosPanel({ matchId, videos, canManage, matchLabel, onChange }: Props) {
    const embedParent = useEmbedParent();
    const [playing, setPlaying] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draftUrl, setDraftUrl] = useState('');
    const [draftKind, setDraftKind] = useState<MatchVideoKind>('highlights');
    const [draftTitle, setDraftTitle] = useState('');

    const parsedById = useMemo(() => {
        const map = new Map<string, ParsedVideoUrl | null>();
        for (const video of videos) map.set(video.id, parseVideoUrl(video.url, { embedParent }));
        return map;
    }, [videos, embedParent]);

    const draftTrimmed = draftUrl.trim();
    const draftParsed = useMemo(
        () => (draftTrimmed ? parseVideoUrl(draftTrimmed, { embedParent }) : null),
        [draftTrimmed, embedParent],
    );
    const draftDuplicate = useMemo(() => {
        const key = draftTrimmed.toLowerCase();
        return Boolean(key) && videos.some((video) => video.url.toLowerCase() === key);
    }, [draftTrimmed, videos]);
    const listFull = videos.length >= MAX_MATCH_VIDEOS;

    // El botón deshabilitado siempre dice qué falta para habilitarse.
    const draftHint = !draftTrimmed
        ? 'Pegá el link del video para agregarlo.'
        : !draftParsed
            ? 'Ese link no es una dirección válida. Tiene que empezar con https://.'
            : draftDuplicate
                ? 'Ese link ya está en la lista.'
                : listFull
                    ? `Tope de ${MAX_MATCH_VIDEOS} videos por partido. Quitá uno para agregar otro.`
                    : `${VIDEO_PROVIDER_LABELS[draftParsed.provider]} · ${draftParsed.embedUrl ? 'se va a ver acá mismo' : 'se abre en el sitio'}`;
    const draftIsBad = Boolean(draftTrimmed) && (!draftParsed || draftDuplicate);
    const canAdd = Boolean(draftParsed) && !draftDuplicate && !listFull && !saving;

    async function persist(next: MatchVideoLink[]): Promise<boolean> {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/videos`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    videos: next.map((video) => ({
                        id: video.id || undefined,
                        url: video.url,
                        kind: video.kind,
                        title: video.title,
                    })),
                }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                setError(typeof payload?.error === 'string' ? payload.error : 'No se pudo guardar. Probá de nuevo.');
                return false;
            }
            onChange(normalizeMatchVideoLinks(payload?.videos));
            return true;
        } catch {
            setError('No se pudo guardar. Revisá la conexión y probá de nuevo.');
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function handleAdd(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canAdd || !draftParsed) return;
        const ok = await persist([
            ...videos,
            {
                id: '',
                url: draftTrimmed,
                kind: draftKind,
                title: draftTitle.trim() || null,
                provider: draftParsed.provider,
                addedAt: '',
            },
        ]);
        if (ok) {
            setDraftUrl('');
            setDraftTitle('');
        }
    }

    async function handleRemove(id: string) {
        await persist(videos.filter((video) => video.id !== id));
    }

    return (
        <section className={styles.panel} aria-labelledby="match-videos-title">
            <header className={styles.head}>
                <h2 id="match-videos-title" className={styles.title}>Videos del partido</h2>
                {videos.length > 0 && (
                    <span className={styles.count}>
                        {videos.length === 1 ? '1 video' : `${videos.length} videos`}
                    </span>
                )}
            </header>

            {canManage && (
                <form className={styles.editor} onSubmit={handleAdd}>
                    <label className={styles.field}>
                        <span className={styles.label}>Link del video</span>
                        <input
                            className={styles.input}
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            placeholder="https://www.youtube.com/watch?v=…"
                            value={draftUrl}
                            onChange={(event) => setDraftUrl(event.target.value)}
                            disabled={saving}
                        />
                    </label>
                    <div className={styles.editorRow}>
                        <label className={styles.field}>
                            <span className={styles.label}>Qué es</span>
                            <select
                                className={styles.select}
                                value={draftKind}
                                onChange={(event) => setDraftKind(event.target.value as MatchVideoKind)}
                                disabled={saving}
                            >
                                {MATCH_VIDEO_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>{VIDEO_KIND_LABELS[kind]}</option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span className={styles.label}>
                                Título <span className={styles.optional}>(opcional)</span>
                            </span>
                            <input
                                className={styles.input}
                                type="text"
                                maxLength={MAX_VIDEO_TITLE_LENGTH}
                                placeholder="Highlights · primer tiempo"
                                value={draftTitle}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                disabled={saving}
                            />
                        </label>
                        <button type="submit" className={styles.add} disabled={!canAdd}>
                            {saving ? 'Guardando…' : 'Agregar'}
                        </button>
                    </div>
                    <p className={`${styles.hint} ${draftIsBad ? styles.hintBad : ''}`} aria-live="polite">
                        {draftHint}
                    </p>
                    {error && <p className={styles.error} role="alert">{error}</p>}
                </form>
            )}

            {videos.length === 0 ? (
                <div className={styles.empty}>
                    <p className={styles.emptyTitle}>Todavía no hay videos de este partido.</p>
                    {canManage && (
                        <p className={styles.emptyHint}>
                            Pegá arriba el link de YouTube, Vimeo, Dailymotion o Facebook con los highlights o el partido completo.
                        </p>
                    )}
                </div>
            ) : (
                <ul className={styles.list}>
                    {videos.map((video) => {
                        const parsed = parsedById.get(video.id) ?? null;
                        const label = describeVideo(video);
                        const providerLabel = video.provider === 'other'
                            ? (parsed?.host ?? 'el sitio')
                            : VIDEO_PROVIDER_LABELS[video.provider];
                        const portrait = parsed?.aspect === 'portrait';
                        const isPlaying = Boolean(playing[video.id]);

                        return (
                            <li key={video.id} className={styles.card}>
                                <div className={styles.cardHead}>
                                    <span className={`${styles.kind} ${styles[`kind_${video.kind}`]}`}>
                                        {VIDEO_KIND_LABELS[video.kind]}
                                    </span>
                                    <h3 className={styles.cardTitle} title={label}>{label}</h3>
                                    {canManage && (
                                        <button
                                            type="button"
                                            className={styles.remove}
                                            onClick={() => handleRemove(video.id)}
                                            disabled={saving}
                                            aria-label={`Quitar ${label}`}
                                        >
                                            Quitar
                                        </button>
                                    )}
                                </div>

                                {parsed?.embedUrl ? (
                                    isPlaying ? (
                                        <div className={`${styles.frame} ${portrait ? styles.framePortrait : ''}`}>
                                            <iframe
                                                className={styles.iframe}
                                                src={withAutoplay(video.provider, parsed.embedUrl)}
                                                title={`${label} — ${matchLabel}`}
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                                loading="lazy"
                                                referrerPolicy="strict-origin-when-cross-origin"
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className={`${styles.frame} ${styles.poster} ${portrait ? styles.framePortrait : ''}`}
                                            onClick={() => setPlaying((prev) => ({ ...prev, [video.id]: true }))}
                                            aria-label={`Reproducir ${label}`}
                                        >
                                            {parsed.thumbnailUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element -- miniatura remota de la plataforma; no pasa por el optimizador.
                                                <img
                                                    className={styles.thumb}
                                                    src={parsed.thumbnailUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <span className={styles.posterName}>{providerLabel}</span>
                                            )}
                                            <span className={styles.play} aria-hidden="true"><PlayIcon /></span>
                                        </button>
                                    )
                                ) : (
                                    <a className={styles.external} href={video.url} target="_blank" rel="noopener noreferrer">
                                        <span className={styles.externalName}>{providerLabel}</span>
                                        <span className={styles.externalUrl}>{video.url}</span>
                                        <span className={styles.externalCta}>Abrir en {providerLabel} ↗</span>
                                    </a>
                                )}

                                {parsed?.embedUrl && (
                                    <div className={styles.cardFoot}>
                                        <a className={styles.openLink} href={video.url} target="_blank" rel="noopener noreferrer">
                                            Abrir en {providerLabel} ↗
                                        </a>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
