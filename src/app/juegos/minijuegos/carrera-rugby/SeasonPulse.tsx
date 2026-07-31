'use client';

import { useEffect, useRef } from 'react';
import ClubBadge from './ClubBadge';
import { useLocale } from './LocaleContext';
import { prefersReducedMotion } from './useCountUp';
import styles from './carrera.module.css';

/**
 * EL PULSO DE LA TEMPORADA.
 *
 * Entre que el jugador decide y que aparece el resultado había un corte seco: la
 * tarjeta se iba y la siguiente llegaba con los números ya calculados. Lo que
 * pasó en el medio —que el OVR subió cinco, que cambiaste de club— el jugador lo
 * tenía que deducir leyendo una tabla.
 *
 * Esto lo pone en el medio de la pantalla, grande y por un segundo: el número
 * viejo tachado, el nuevo, la flecha, y si hubo pase los dos escudos. No hay
 * nada que tocar y no espera a nadie — se va solo.
 *
 * NO es la capa de festejo. Esa es para lo que pasa pocas veces en una carrera
 * (un título, el primer cap) y se queda tres segundos. Esto pasa TODAS las
 * temporadas, veinte veces por carrera, así que dura 900 ms y no bloquea: a esa
 * frecuencia, cualquier cosa más larga deja de ser información y pasa a ser un
 * peaje.
 */
export interface SeasonPulseData {
    /** Clave estable de la temporada. Fuerza el remonte entre pulsos. */
    key: string;
    ovrFrom: number;
    ovrTo: number;
    /** Club del que se fue, si hubo pase. */
    fromClubId: string | null;
    fromClubName: string;
    /** Club al que llegó (o el de siempre). */
    toClubId: string;
    toClubName: string;
    moved: boolean;
}

const PULSE_MS = 900;
const PULSE_REDUCED_MS = 600;

export default function SeasonPulse({ data, onDone }: { data: SeasonPulseData; onDone: () => void }) {
    const { t } = useLocale();
    const timer = useRef<number>(0);

    useEffect(() => {
        const ms = prefersReducedMotion() ? PULSE_REDUCED_MS : PULSE_MS;
        timer.current = window.setTimeout(onDone, ms);
        return () => window.clearTimeout(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.key]);

    const delta = data.ovrTo - data.ovrFrom;
    const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

    return (
        // `aria-hidden`: el lector de pantalla ya recibe el resultado completo de
        // la temporada en la tarjeta que viene atrás. Repetirlo acá sería leer
        // dos veces lo mismo.
        <div className={styles.pulse} aria-hidden="true">
            <div className={styles.pulseCard}>
                {data.moved && (
                    <div className={styles.pulseClubs}>
                        {data.fromClubId && (
                            <span className={styles.pulseClubOut}>
                                <ClubBadge clubId={data.fromClubId} clubName={data.fromClubName} size={44} />
                            </span>
                        )}
                        <svg className={styles.pulseArrow} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                        <span className={styles.pulseClubIn}>
                            <ClubBadge clubId={data.toClubId} clubName={data.toClubName} size={52} />
                        </span>
                    </div>
                )}

                <div className={`${styles.pulseOvr} ${styles[`pulse_${dir}`]}`}>
                    <span className={`${styles.pulseFrom} ${styles.num}`}>{data.ovrFrom}</span>
                    <svg className={styles.pulseTrend} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        {dir === 'up' && <path d="M12 19V5M6 11l6-6 6 6" />}
                        {dir === 'down' && <path d="M12 5v14M6 13l6 6 6-6" />}
                        {dir === 'flat' && <path d="M5 12h14" />}
                    </svg>
                    <span className={`${styles.pulseTo} ${styles.num}`}>{data.ovrTo}</span>
                </div>

                <p className={styles.pulseLabel}>
                    {data.moved ? data.toClubName : delta === 0 ? t.noOvrChange : t.ovr}
                </p>
            </div>
        </div>
    );
}
