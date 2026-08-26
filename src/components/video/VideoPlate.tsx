'use client';

// La portada generada de un video: la placa de G22 Base, dibujada en el DOM.
//
// Misma familia que `drawG22BasePlate` del export, acomodada al marco
// apaisado del reproductor y a lo que es: la portada de UN video. Arriba a la
// izquierda va el título del video (Highlights, Partido completo, o el que le
// pusieron) con la marca del medio a la derecha; en el centro, escudos y
// marcador; abajo, ETAPA · TORNEO chico y la firma. El botón de play del
// reproductor cae en el centro, así que el marcador le deja el hueco
// (`playSlot`): se lee "33 ▶ 15", como un tablero.
//
// Todo se mide en unidades del contenedor (cqw): la placa se ve igual en la
// grilla del hub y en la ficha.

import type { CSSProperties } from 'react';

import {
    plateHeadline,
    plateMarkSource,
    plateTone,
    PLATE_WORDMARK,
    type VideoPlateContext,
    type VideoPlateTeam,
} from '@/lib/matches/videoPlate';

import styles from './VideoPlate.module.css';

interface Props {
    context: VideoPlateContext;
    /** El título del video, o su tipo si no tiene. */
    title: string;
    /** El tipo como etiqueta chica, cuando el título es propio. */
    kind?: string | null;
    /** true cuando hay un botón de play encima: el marcador le deja el hueco del medio. */
    playSlot?: boolean;
}

function Crest({ team }: { team: VideoPlateTeam }) {
    if (team.logoUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy propio.
        return <img className={styles.crest} src={team.logoUrl} alt="" loading="lazy" decoding="async" />;
    }
    return <span className={styles.crestFallback}>{team.name.trim().slice(0, 3).toUpperCase()}</span>;
}

export default function VideoPlate({ context, title, kind = null, playSlot = false }: Props) {
    const tone = plateTone(context);
    const meta = plateHeadline(context).text;
    const style = {
        '--plate-field': tone.field,
        '--plate-field-end': tone.fieldEnd,
        '--plate-ink': tone.ink,
        '--plate-accent': tone.accent,
        // Para que el título llene el ancho como en el export: cuanto más largo, más chico.
        '--plate-title-chars': String(Math.max(8, title.length)),
    } as CSSProperties;

    return (
        <div className={`${styles.plate} ${tone.isDark ? styles.dark : styles.light}`} style={style} aria-hidden="true">
            <div className={styles.head}>
                <span className={styles.caption}>
                    {kind && <span className={styles.kind}>{kind}</span>}
                    <span className={styles.title}>{title}</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- marca propia, estática. */}
                <img className={styles.mark} src={plateMarkSource(context.sportId)} alt="" loading="lazy" decoding="async" />
            </div>

            <span className={styles.rule} />

            <div className={styles.band}>
                <Crest team={context.home} />
                {context.score ? (
                    <span className={`${styles.score} ${playSlot ? styles.scoreSplit : ''}`}>
                        <span className={styles.scoreHome}>{context.score.home}</span>
                        {playSlot ? <span className={styles.playSlot} /> : <span className={styles.scoreDash}>-</span>}
                        <span className={styles.scoreAway}>{context.score.away}</span>
                    </span>
                ) : (
                    <span className={`${styles.score} ${playSlot ? styles.scoreSplit : ''}`}>
                        {playSlot ? <span className={styles.playSlot} /> : <span className={styles.scoreVs}>VS</span>}
                    </span>
                )}
                <Crest team={context.away} />
            </div>

            <span className={styles.rule} />

            <div className={styles.foot}>
                <span className={styles.meta}>{meta}</span>
                {tone.isDark ? (
                    // eslint-disable-next-line @next/next/no-img-element -- la firma, estática.
                    <img className={styles.wordmark} src={PLATE_WORDMARK} alt="" loading="lazy" decoding="async" />
                ) : (
                    // Sobre placa clara la firma no usa el PNG: sus letras son blancas.
                    <span className={styles.wordmarkText}>G22 SCORES</span>
                )}
            </div>
        </div>
    );
}
