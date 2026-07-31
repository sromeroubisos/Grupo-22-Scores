'use client';

import { useState } from 'react';
import { useCountUp } from './useCountUp';
import type { CareerState } from '@/features/career';
import {
    clubLeagueIdentity, clubTenure, computeOvr, contractLabel, contractLabelIn, emptyStats, getClub,
    getPosition, positionLabel, secondaryStatLabelIn, secondaryStatOf, tenureTierLabelIn,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import Flag from './Flag';
import ClubBadge from './ClubBadge';
import EmploymentLadder, { justPromoted } from './EmploymentLadder';
import { ovrBand } from './ovrBand';
import styles from './carrera.module.css';

/**
 * Cabecera de carrera: REFERENCIA, no protagonista. Mide ~90 px y tiene dos
 * partes.
 *
 * A la izquierda el OVR, en un bloque de color por rango: es EL número del juego
 * y lo primero que ve el ojo. A la derecha, dos renglones de identidad —bandera,
 * dorsal, apellido, puesto y edad arriba; escudo, club, permanencia, división y
 * vínculo abajo— sobre el escudo del club en marca de agua, que da riqueza
 * visual a costo cero de alto.
 *
 * Lo que NO está acá es tan importante como lo que está: los cinco totales de
 * carrera y los caps se fueron a la espina, repartidos por temporada, donde
 * dicen además CUÁNDO pasaron. El banner medía 150 px llenos de acumulados que
 * al empezar son todos cero; el juego es la decisión, no la planilla.
 *
 * Tampoco muestra apodo, atributos, potencial, moral, forma, fatiga, fama, OVR
 * efectivo, valor de mercado ni rating del club.
 */
export default function PlayerHeader({ career }: { career: CareerState }) {
    /**
     * El escalafón —y en mobile también la planilla acumulada— viven detrás de
     * este desplegable. En desktop se abre como capa flotante sobre la consola:
     * si empujara el layout, el panel del escalafón le comería a la tarjeta de
     * decisión los 150 px que este rediseño le devolvió.
     */
    const { locale, t } = useLocale();
    const [openDetails, setOpenDetails] = useState(false);
    const p = career.player;
    const club = getClub(p.club);
    const posLabel = positionLabel(p.position, getPosition(p.position).labelEs, locale);
    const division = clubLeagueIdentity(club).name;

    // Permanencia DERIVADA de `seasons[]` (no hay campo en el estado). Es lo que
    // le da un horizonte a quedarse: enfrente, el mercado siempre tiene clubes
    // concretos que ofrecer.
    const tenure = clubTenure(career);

    const matches = career.seasons.reduce((sum, s) => sum + s.matches, 0);
    const ovr = computeOvr(p.attributes, p.position);
    const countryCode = p.eligibility.nationalityCountryCode;

    // Acumulado de TODA la carrera. Sólo se dibuja en mobile, donde la espina no
    // tiene ancho para las columnas por temporada: ahí el acumulado es lo que
    // queda. En desktop esto no se renderiza (CSS) porque la espina ya lo dice
    // mejor, temporada por temporada.
    const totals = career.seasons.reduce((acc, s) => {
        for (const key of Object.keys(acc) as (keyof typeof acc)[]) acc[key] += s.stats[key];
        return acc;
    }, emptyStats());
    const secondary = secondaryStatOf(p.position, totals);

    // Rango del OVR. La escala vive en `ovrBand.ts` y no acá: la espina pinta
    // la misma píldora en cada tramo, y con los cortes duplicados un 74 podía
    // salir de un color en la cabecera y de otro tres centímetros más abajo.
    const rango = ovrBand(ovr);

    // El OVR CUENTA hasta su valor. Es la animación más importante del juego:
    // es el número que resume la carrera, y verlo subir es la diferencia entre
    // enterarse de que progresaste y verlo.
    const ovrAnim = useCountUp(ovr);

    // Subir de escalón es el momento de la ruta amateur y el aviso completo vive
    // en el panel. Con el panel cerrado por defecto pasaría en silencio, así que
    // el chip del vínculo se marca hasta que el jugador lo abra.
    const promoted = justPromoted(career.history);

    // Las mismas cuatro que la espina: partidos, puntos, tries y la del puesto.
    // El tackle NO va fijo desde 1.16.0 — es la columna del puesto de cinco de
    // los nueve, y tenerlo en las dos listas daba dos celdas con la misma
    // etiqueta (y dos hijos de React con la misma `key`).
    const cells: { label: string; value: string; zero: boolean }[] = [
        { label: t.matches, value: String(matches), zero: matches === 0 },
        { label: t.points, value: String(totals.points), zero: totals.points === 0 },
        { label: t.tries, value: String(totals.tries), zero: totals.tries === 0 },
        { label: secondaryStatLabelIn(secondary.label, locale), value: secondary.display, zero: secondary.isZero },
    ];

    return (
        <header className={styles.careerBar}>
            <div className={styles.cbTop}>
                {/* El OVR, bloque de color macizo y a la izquierda. El rango
                    pinta el FONDO y no el número: sobre el fondo pintado la
                    etiqueta chica también se lee, que sobre texto de color no
                    pasaba. */}
                <div
                    className={[
                        styles.cbOvr,
                        styles[`ovr_${rango}`],
                        ovrAnim.running ? styles.cbOvrPulse : '',
                        ovrAnim.running && ovrAnim.direction === 'down' ? styles.cbOvrDown : '',
                    ].filter(Boolean).join(' ')}
                >
                    <span className={styles.cbOvrLabel}>{t.ovr}</span>
                    <span className={`${styles.cbOvrValue} ${styles.num}`}>{ovrAnim.value}</span>
                </div>

                <div className={styles.cbPanel}>
                    {/* El escudo del club, grande y difuminado, detrás de la
                        identidad. Riqueza visual a costo cero de espacio. */}
                    <span className={styles.cbWatermark} aria-hidden="true">
                        <ClubBadge clubId={club.id} clubName={club.labelEs} size={128} />
                    </span>

                    <p className={styles.cbName}>
                        {countryCode && <Flag code={countryCode} name={p.nationality} size={24} decorative className={styles.cbFlag} />}
                        <span className={styles.cbNumber}>{p.number}</span>
                        <span className={styles.cbSurname}>{p.surname}</span>
                        <span className={styles.cbPos}>{posLabel}</span>
                    </p>

                    <p className={styles.cbClub}>
                        <ClubBadge clubId={club.id} clubName={club.labelEs} size={22} />
                        <span className={styles.cbClubName}>{club.labelEs}</span>
                        {/* El nombre del club está al lado: repetirlo acá sería
                            ruido. Se lee "Richmond · 4ª temporada". */}
                        <span className={styles.cbTenure}>{t.tenureCounter(tenure.current)}</span>
                        {/* La distinción por permanencia pesa menos que el
                            vínculo a propósito: el empleo es ESTADO —el jugador
                            lo necesita leer siempre— y la permanencia es LOGRO.
                            Recién a partir de la quinta temporada. */}
                        {tenure.tier && (
                            <span className={styles.cbTenureTier}>
                                {tenureTierLabelIn(tenure.tier.id, tenure.tier.label, locale)}
                            </span>
                        )}
                        <span className={styles.cbComp}>{division}</span>
                    </p>
                </div>

                {/* LA COLUMNA DE LA DERECHA: dos datos rotulados, alineados a
                    la derecha, uno debajo del otro. Es lo que deja el banner en
                    dos renglones en vez de cuatro — la edad y el vínculo no
                    tienen por qué pelear el ancho con el nombre y el club.

                    Donde el simulador de fútbol pone VALOR, acá va el ESCALAFÓN:
                    en rugby no hay valor de mercado, el eje económico es el
                    vínculo. Y el vínculo además abre el detalle, así que ese
                    lugar no es sólo un rótulo. */}
                <div className={styles.cbMeta}>
                    <span className={styles.cbMetaItem}>
                        <span className={styles.cbMetaLabel}>{t.age}</span>
                        <span className={`${styles.cbMetaValue} ${styles.num}`}>{p.age}</span>
                    </span>
                    <button
                        type="button"
                        className={`${styles.cbContract} ${promoted ? styles.cbContractNew : ''}`}
                        onClick={() => setOpenDetails((v) => !v)}
                        aria-expanded={openDetails}
                        aria-controls="cabecera-detalle"
                    >
                        {contractLabelIn(p.employment, p.squadTrack, contractLabel(p.employment, p.squadTrack), locale)}
                        {promoted && <span className={styles.srOnly}>{t.steppedUpSr}</span>}
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={openDetails ? styles.chevronOpen : undefined}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                </div>
            </div>

            {/* Sólo en mobile: ahí el desplegable además trae la planilla
                acumulada, porque la espina no tiene ancho para las columnas. */}
            <button
                type="button"
                className={styles.cbDisclosure}
                onClick={() => setOpenDetails((v) => !v)}
                aria-expanded={openDetails}
                aria-controls="cabecera-detalle"
            >
                {openDetails ? t.hideStatsAndLadder : t.showStatsAndLadder}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={openDetails ? styles.chevronOpen : undefined}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            <div
                id="cabecera-detalle"
                className={`${styles.cbDetails} ${openDetails ? styles.cbDetailsOpen : ''}`}
            >
                {/* Planilla acumulada, sólo mobile (ver `cells`). NO se dibuja
                    antes de la primera temporada: cinco ceros enormes en el
                    debut no informan, le dicen al jugador "no lograste nada" en
                    el momento en que todavía no jugó. */}
                {career.seasons.length > 0 && (
                    <dl className={styles.cbStatline} key={career.seasons.length}>
                        {/* `key` con la cantidad de temporadas: al cerrar una,
                            React rehace la lista y la animación de entrada se
                            repite sin timers ni estado. Escalonadas de a 60 ms,
                            para que se lea como que se está computando. */}
                        {cells.map((cell, i) => (
                            <div key={cell.label} className={styles.cbStat} style={{ animationDelay: `${i * 60}ms` }}>
                                <dd className={`${styles.cbStatValue} ${styles.num} ${cell.zero ? styles.cbZero : ''}`}>{cell.value}</dd>
                                <dt>{cell.label}</dt>
                            </div>
                        ))}
                    </dl>
                )}

                <EmploymentLadder employment={p.employment} squadTrack={p.squadTrack} history={career.history} defaultOpen />
            </div>
        </header>
    );
}
