'use client';

import { useState } from 'react';
import type { CareerState } from '@/features/career';
import {
    archetypeIn, buildCareerSummary, countryNameIn, distinctionLabel, getClub, getPosition,
    kickAccuracy, positionLabel, profileRevealIn, profileRevealText, retirementReasonIn,
    secondaryStatLabelIn, secondaryStatOf,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import Flag from './Flag';
import ClubBadge from './ClubBadge';
import AwardChip from './AwardChip';
import CareerCardOverlay from './CareerCardOverlay';
import styles from './carrera.module.css';

export default function RetirementSummary({ career, onReplay }: { career: CareerState; onReplay: () => void }) {
    const { locale, t } = useLocale();
    // La tarjeta se arma recién cuando la piden: es volver a correr el motor para
    // el token, y el retiro ya tiene bastante que dibujar.
    const [verResumen, setVerResumen] = useState(false);
    const summary = buildCareerSummary(career);
    const secondary = secondaryStatOf(summary.position, summary.totals);
    // El titular de la carrera lo decide el motor (engine/archetypes.ts): acá
    // solo se pinta, y se traduce POR ID —no por texto— para que un arquetipo
    // nuevo rompa la compilación en vez de salir en español.
    const { label: headline, blurb } = archetypeIn(
        summary.archetype.id, summary.archetype.label, summary.archetype.blurb, locale,
    );
    const posLabel = positionLabel(summary.position, getPosition(summary.position).labelEs, locale);
    const countryCode = career.player.eligibility.nationalityCountryCode;
    const nacionalidad = countryNameIn(countryCode, summary.nationality, locale);

    // El % al palo es LA métrica del que patea, así que se muestra aparte además
    // de la ranura del puesto (para el fullback, cuya ranura son los metros).
    const accuracy = getPosition(summary.position).stats.goalKicker ? kickAccuracy(summary.totals) : null;

    const stats: { label: string; value: number | string; zero?: boolean }[] = [
        { label: t.matches, value: summary.totalMatches, zero: summary.totalMatches === 0 },
        { label: t.points, value: summary.totals.points, zero: summary.totals.points === 0 },
        { label: t.tries, value: summary.totals.tries, zero: summary.totals.tries === 0 },
        // Los tackles NO van fijos: son la columna del PUESTO en cinco de los
        // nueve (pilar, hooker, segunda, tercera, medio scrum), y tenerlos en
        // las dos listas dibujaba la celda dos veces — con la misma etiqueta y
        // la misma `key` de React, que es el error que tiraba la consola.
        // Sólo entran para los puestos cuya columna es otra cosa.
        ...(secondary.statKey !== 'tackles'
            ? [{ label: t.tackles, value: summary.totals.tackles, zero: summary.totals.tackles === 0 }]
            : []),
        { label: secondaryStatLabelIn(secondary.label, locale), value: secondary.display, zero: secondary.isZero },
        ...(accuracy !== null && secondary.kind !== 'kick-accuracy'
            ? [{ label: t.goalPct, value: `${accuracy}%` }]
            : []),
        { label: t.caps.charAt(0).toUpperCase() + t.caps.slice(1), value: summary.caps, zero: summary.caps === 0 },
        { label: t.titles, value: summary.titles, zero: summary.titles === 0 },
        { label: t.peakOvr, value: summary.peakOvr },
        { label: t.seasons, value: summary.seasons },
    ];

    return (
        <div className={styles.summary}>
            <div className={styles.summaryHero}>
                <span className={styles.eyebrow}>{t.careerOver}</span>
                <h2 className={styles.summaryTitle}>{headline}</h2>
                <p className={styles.summaryBlurb}>{blurb}</p>
                <div className={styles.summaryId}>
                    {countryCode && <Flag code={countryCode} name={nacionalidad} size={24} decorative />}
                    <span>{career.player.surname} · {posLabel} · {nacionalidad}</span>
                </div>
                {/* REVELADO: el perfil estuvo oculto toda la partida, como el
                    techo. Recién acá se nombra — y es lo que explica por qué la
                    carrera tuvo la forma que tuvo. */}
                <p className={styles.summaryReveal}>
                    {profileRevealIn(
                        career.player.developmentProfile,
                        profileRevealText(career.player.developmentProfile),
                        locale,
                    )}
                </p>
                <p className={styles.summaryReason}>
                    {t.debutAndRetirement(
                        summary.debutAge,
                        summary.retirementAge,
                        retirementReasonIn(summary.retirementReason, locale) ?? '',
                    )}
                </p>
            </div>

            {summary.byClub.length > 0 && (
                <div className={styles.summaryClubs}>
                    {summary.byClub.slice(0, 3).map((c) => (
                        <span key={c.club} className={styles.clubChip}>
                            <ClubBadge clubId={c.club} clubName={getClub(c.club).labelEs} size={40} />
                            {getClub(c.club).labelEs} <span className={styles.num}>· {c.seasons}</span>
                        </span>
                    ))}
                </div>
            )}

            <div className={styles.summaryStats}>
                {stats.map((s) => (
                    <div key={s.label} className={styles.statItem}>
                        <span className={`${styles.statValue} ${s.zero ? styles.cbZero : ''}`}>{s.value}</span>
                        <span className={styles.statLabel}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* TÍTULOS y LOGROS en líneas distintas. Mezclados, el contador de
                títulos decía 1 y abajo había tres fichas: ser capitán de la
                selección no se gana en una final. */}
            {summary.honours.length > 0 && (
                <div className={styles.honourGroup}>
                    <h3 className={styles.honourLabel}>{t.honours}</h3>
                    <div className={styles.honours}>
                        {/* Los títulos son NOMBRES DE TORNEO y no se traducen: el
                            Top 14 se llama igual en los dos idiomas. */}
                        {summary.honours.map((h) => (
                            <span key={h} className={styles.badgeStrong}>{h}</span>
                        ))}
                    </div>
                </div>
            )}

            {summary.distinctions.length > 0 && (
                <div className={styles.honourGroup}>
                    <h3 className={styles.honourLabel}>{t.achievements}</h3>
                    <div className={styles.honours}>
                        {/* `award` es la etiqueta EN ESPAÑOL: es la clave con la que
                            `premios.ts` resuelve el ícono. Lo que se traduce es lo
                            que se muestra. */}
                        {summary.distinctions.map((d) => (
                            <AwardChip key={d} award={d} label={distinctionLabel(d, locale)} />
                        ))}
                    </div>
                </div>
            )}

            <div className={`${styles.btnRow} ${styles.retireBtnRow}`}>
                {/* Compartir TERMINA EN LA FOTO: abre la capa, ahí se elige
                    formato y se comparte la imagen. Antes copiaba un link y el
                    que quería publicar su carrera se quedaba sin nada que subir. */}
                <button type="button" className={styles.primaryBtn} onClick={() => setVerResumen(true)}>{t.shareCareer}</button>
                <button type="button" className={styles.ghostBtn} onClick={onReplay}>{t.playAgain}</button>
            </div>

            {verResumen && <CareerCardOverlay career={career} onClose={() => setVerResumen(false)} />}
        </div>
    );
}
