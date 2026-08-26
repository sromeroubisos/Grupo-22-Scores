'use client';

// Videos del partido: highlights, partido completo o clips, cargados como
// links. El video no se aloja acá: se embebe el reproductor de la plataforma
// (YouTube, Vimeo, Dailymotion, Facebook, Twitch, ESPN) y, si la plataforma no lo
// permite, se abre afuera. El reproductor en sí vive en
// components/video/MatchVideoPlayer, compartido con el hub de videos.
//
// Quien administra carga y quita los links acá mismo, en la pestaña: es la
// puerta por donde entra el dato, igual que en alineaciones. El servidor
// vuelve a chequear el permiso en cada guardado, y al guardar busca la
// portada que publica la plataforma para dejarla persistida.

import { useMemo, useState, type FormEvent } from 'react';

import MatchVideoPlayer, { useEmbedParent } from '@/components/video/MatchVideoPlayer';
import {
    MATCH_VIDEO_KINDS,
    MATCH_VIDEO_POSTERS,
    MAX_MATCH_VIDEOS,
    MAX_VIDEO_TITLE_LENGTH,
    VIDEO_KIND_LABELS,
    VIDEO_POSTER_LABELS,
    VIDEO_PROVIDER_LABELS,
    describeVideo,
    isMatchVideoPoster,
    normalizeMatchVideoLinks,
    parseVideoUrl,
    type MatchVideoKind,
    type MatchVideoLink,
    type MatchVideoPoster,
} from '@/lib/matches/videoLinks';
import type { VideoPlateContext } from '@/lib/matches/videoPlate';

import styles from './MatchVideosPanel.module.css';

interface Props {
    matchId: string;
    videos: MatchVideoLink[];
    /** Quien administra ve el formulario y puede quitar. El servidor lo vuelve a chequear. */
    canManage: boolean;
    /** "SIC vs CASI": va en el título del reproductor para el lector de pantalla. */
    matchLabel: string;
    /** El partido, para la placa generada (portada estilo G22 Base). */
    plate?: VideoPlateContext | null;
    onChange: (videos: MatchVideoLink[]) => void;
}

export default function MatchVideosPanel({ matchId, videos, canManage, matchLabel, plate = null, onChange }: Props) {
    const embedParent = useEmbedParent();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draftUrl, setDraftUrl] = useState('');
    const [draftKind, setDraftKind] = useState<MatchVideoKind>('highlights');
    const [draftTitle, setDraftTitle] = useState('');
    const [draftPoster, setDraftPoster] = useState<MatchVideoPoster>('original');

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
                        poster: video.poster,
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
                ...(draftPoster === 'generated' ? { poster: 'generated' as const } : {}),
            },
        ]);
        if (ok) {
            setDraftUrl('');
            setDraftTitle('');
            setDraftPoster('original');
        }
    }

    async function handleRemove(id: string) {
        await persist(videos.filter((video) => video.id !== id));
    }

    /** Cambiar la portada de un video ya cargado. */
    async function handlePoster(id: string, poster: MatchVideoPoster) {
        await persist(videos.map((video) => {
            if (video.id !== id) return video;
            const { poster: _previous, ...rest } = video;
            void _previous;
            return poster === 'generated' ? { ...rest, poster } : rest;
        }));
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
                            <span className={styles.label}>Portada</span>
                            <select
                                className={styles.select}
                                value={draftPoster}
                                onChange={(event) => setDraftPoster(isMatchVideoPoster(event.target.value) ? event.target.value : 'original')}
                                disabled={saving}
                            >
                                {MATCH_VIDEO_POSTERS.map((poster) => (
                                    <option key={poster} value={poster}>{VIDEO_POSTER_LABELS[poster]}</option>
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
                    <p className={styles.hint}>
                        La portada original es la miniatura que publica la plataforma. La placa G22 se genera con los escudos, el marcador y el título del video, y es la que se ve cuando la plataforma no tiene miniatura.
                    </p>
                    {error && <p className={styles.error} role="alert">{error}</p>}
                </form>
            )}

            {videos.length === 0 ? (
                <div className={styles.empty}>
                    <p className={styles.emptyTitle}>Todavía no hay videos de este partido.</p>
                    {canManage && (
                        <p className={styles.emptyHint}>
                            Pegá arriba el link de YouTube, Vimeo, Dailymotion, Facebook o ESPN con los highlights o el partido completo.
                        </p>
                    )}
                </div>
            ) : (
                <ul className={styles.list}>
                    {videos.map((video) => {
                        const label = describeVideo(video);
                        return (
                            <li key={video.id} className={styles.card}>
                                <div className={styles.cardHead}>
                                    <span className={`${styles.kind} ${styles[`kind_${video.kind}`]}`}>
                                        {VIDEO_KIND_LABELS[video.kind]}
                                    </span>
                                    <h3 className={styles.cardTitle} title={label}>{label}</h3>
                                    {canManage && (
                                        <>
                                            <select
                                                className={styles.posterSelect}
                                                value={video.poster ?? 'original'}
                                                onChange={(event) => {
                                                    if (isMatchVideoPoster(event.target.value)) void handlePoster(video.id, event.target.value);
                                                }}
                                                disabled={saving}
                                                aria-label={`Portada de ${label}`}
                                                title="Portada"
                                            >
                                                {MATCH_VIDEO_POSTERS.map((poster) => (
                                                    <option key={poster} value={poster}>
                                                        {poster === 'original' && !video.thumbnailUrl
                                                            ? `${VIDEO_POSTER_LABELS[poster]} (no tiene)`
                                                            : VIDEO_POSTER_LABELS[poster]}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className={styles.remove}
                                                onClick={() => handleRemove(video.id)}
                                                disabled={saving}
                                                aria-label={`Quitar ${label}`}
                                            >
                                                Quitar
                                            </button>
                                        </>
                                    )}
                                </div>

                                <MatchVideoPlayer video={video} matchLabel={matchLabel} embedParent={embedParent} plate={plate} />
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
