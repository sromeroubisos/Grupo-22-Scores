'use client';

// Un video adentro del cuerpo de una noticia: una URL pegada sola en su
// renglón (YouTube, X, Instagram, Facebook, ESPN, TikTok… o cualquier sitio)
// o un video cargado en la web (`@[…](video:<partido>/<video>)`).
//
// Es el mismo reproductor de la ficha del partido y del hub: portada primero,
// iframe al tocar; lo que no se embebe se abre afuera como tarjeta. Este
// envoltorio existe porque el reproductor necesita el dominio de la página
// (Twitch) y eso se lee en el navegador; el cuerpo de la nota, en cambio, se
// dibuja en el servidor.

import MatchVideoPlayer, { useEmbedParent } from '@/components/video/MatchVideoPlayer';
import type { MatchVideoLink } from '@/lib/matches/videoLinks';

import styles from './NewsBody.module.css';

interface Props {
    video: MatchVideoLink;
    /** "Los Tilos vs CASI" o, para una URL suelta, el título de la nota: va en el título accesible del reproductor. */
    matchLabel: string;
    /** El partido del que es el video, como link debajo. */
    caption?: { text: string; href: string } | null;
}

export default function NewsVideoEmbed({ video, matchLabel, caption = null }: Props) {
    const embedParent = useEmbedParent();
    return (
        <figure className={styles.videoFigure}>
            <MatchVideoPlayer video={video} matchLabel={matchLabel} embedParent={embedParent} />
            {caption && (
                <figcaption>
                    <a href={caption.href} className={styles.link}>{caption.text}</a>
                </figcaption>
            )}
        </figure>
    );
}
