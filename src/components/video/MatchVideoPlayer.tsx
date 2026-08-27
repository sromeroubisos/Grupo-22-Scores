'use client';

// El reproductor de un video de partido, compartido por la ficha y el hub.
//
// No carga el iframe hasta que alguien toca la portada: un reproductor pesa
// más que el resto de la página. Hasta entonces muestra la portada que
// publica la plataforma (persistida en el link al guardarlo) y, si no hay,
// el nombre de la plataforma sobre negro. Lo que no se puede embeber se abre
// afuera, con la portada si la tiene.
//
// La portada puede ser la original de la plataforma o la placa generada
// (estilo G22 Base, con el título del video): la elige quien carga el video
// (`poster`), y la placa es también lo que se ve cuando la plataforma no
// publica miniatura. Para dibujarla hace falta el contexto del partido
// (`plate`); sin él, queda el nombre de la plataforma sobre negro.

import { useEffect, useMemo, useState } from 'react';

import {
    VIDEO_KIND_LABELS,
    VIDEO_PROVIDER_LABELS,
    describeVideo,
    parseVideoUrl,
    videoPosterUrl,
    wantsGeneratedPoster,
    withAutoplay,
    type MatchVideoLink,
    type ParsedVideoUrl,
} from '@/lib/matches/videoLinks';
import { plateCaption, type VideoPlateContext } from '@/lib/matches/videoPlate';

import VideoPlate from './VideoPlate';
import styles from './MatchVideoPlayer.module.css';

/**
 * Twitch exige el dominio que embebe. Se lee después de montar para no
 * desincronizar el HTML del servidor con el del navegador.
 */
export function useEmbedParent(): string | null {
    const [parent, setParent] = useState<string | null>(null);
    useEffect(() => {
        setParent(window.location.hostname || null);
    }, []);
    return parent;
}

export function providerLabelOf(video: Pick<MatchVideoLink, 'provider'>, parsed: ParsedVideoUrl | null): string {
    return video.provider === 'other' ? (parsed?.host ?? 'el sitio') : VIDEO_PROVIDER_LABELS[video.provider];
}

function PlayIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
        </svg>
    );
}

interface Props {
    video: MatchVideoLink;
    /** "SIC vs CASI": va en el título del reproductor para el lector de pantalla. */
    matchLabel: string;
    embedParent: string | null;
    /** El link "Abrir en …" debajo del reproductor. En una grilla apretada se puede apagar. */
    withOpenLink?: boolean;
    /** El partido, para dibujar la placa generada. Sin él no hay placa. */
    plate?: VideoPlateContext | null;
}

export default function MatchVideoPlayer({ video, matchLabel, embedParent, withOpenLink = true, plate = null }: Props) {
    const parsed = useMemo(() => parseVideoUrl(video.url, { embedParent }), [video.url, embedParent]);
    // Una publicación (tweet, post) se muestra directo: el embed es la
    // publicación misma —texto, autor y el video adentro—, pesa poco y no
    // arranca solo; taparla con un póster negro sería esconder la nota.
    const [playing, setPlaying] = useState(() => parsed?.aspect === 'card');
    const [posterBroken, setPosterBroken] = useState(false);

    const label = describeVideo(video);
    const providerLabel = providerLabelOf(video, parsed);
    const originalPoster = posterBroken ? null : videoPosterUrl(video, parsed);
    const portrait = parsed?.aspect === 'portrait';
    // Una publicación (tweet, post) es tarjeta solo cuando se reproduce: la
    // portada, antes de tocarla, se dibuja a 16:9 como cualquier video.
    const card = parsed?.aspect === 'card' && playing;
    const frameClass = `${styles.frame} ${portrait ? styles.framePortrait : ''} ${card ? styles.frameCard : ''}`;

    // La placa va si la pidieron, o si no hay miniatura original que mostrar.
    const showPlate = plate !== null && (wantsGeneratedPoster(video) || !originalPoster);
    const caption = plateCaption({ title: video.title, kindLabel: VIDEO_KIND_LABELS[video.kind] });

    // Con reproductor hay un play en el centro: la placa le deja el hueco.
    const plateNode = (playSlot: boolean) => (
        plate ? <VideoPlate context={plate} title={caption.title} kind={caption.kind} playSlot={playSlot} /> : null
    );
    const posterImage = showPlate ? (
        plateNode(Boolean(parsed?.embedUrl))
    ) : originalPoster ? (
        // eslint-disable-next-line @next/next/no-img-element -- portada remota de la plataforma; no pasa por el optimizador.
        <img
            className={styles.thumb}
            src={originalPoster}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPosterBroken(true)}
        />
    ) : null;

    if (!parsed?.embedUrl) {
        return (
            <a className={styles.external} href={video.url} target="_blank" rel="noopener noreferrer">
                {posterImage && <span className={frameClass}>{posterImage}</span>}
                <span className={styles.externalBody}>
                    <span className={styles.externalName}>{providerLabel}</span>
                    <span className={styles.externalUrl}>{video.url}</span>
                    <span className={styles.externalCta}>Abrir en {providerLabel} ↗</span>
                </span>
            </a>
        );
    }

    return (
        <div className={styles.player}>
            {playing ? (
                <div className={frameClass}>
                    {/* scrolling="no": la publicación no lleva barra propia adentro del marco. */}
                    <iframe
                        className={styles.iframe}
                        src={withAutoplay(video.provider, parsed.embedUrl)}
                        title={`${label} — ${matchLabel}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        scrolling="no"
                    />
                </div>
            ) : (
                <button
                    type="button"
                    className={`${frameClass} ${styles.poster}`}
                    onClick={() => setPlaying(true)}
                    aria-label={`Reproducir ${label}`}
                >
                    {posterImage ?? <span className={styles.posterName}>{providerLabel}</span>}
                    <span className={styles.play} aria-hidden="true"><PlayIcon /></span>
                </button>
            )}

            {withOpenLink && (
                <div className={styles.foot}>
                    <a className={styles.openLink} href={video.url} target="_blank" rel="noopener noreferrer">
                        Abrir en {providerLabel} ↗
                    </a>
                </div>
            )}
        </div>
    );
}
