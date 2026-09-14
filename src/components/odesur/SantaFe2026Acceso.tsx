'use client';

import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import { APP_TIMEZONE, getTodayKey } from '@/lib/timezone';
import { ODESUR_FIRST_DAY, ODESUR_LAST_DAY } from '@/lib/services/odesur2026Parser';
import styles from './SantaFe2026Acceso.module.css';

/**
 * El acceso a los Juegos Suramericanos Santa Fe 2026 en el home del teléfono.
 *
 * En desktop la entrada es el link "Suramericanos" del nav; abajo de 768 px
 * los links del nav se apagan y la barra inferior tiene sus cinco lugares
 * ocupados, así que en un teléfono no había forma de llegar al apartado sin
 * saber la dirección. Por eso este botón se ve SOLO en ese ancho (lo corta el
 * CSS) y va arriba del selector de deporte: es de todos los deportes a la vez.
 *
 * Lleva el logo oficial y a Capi, la mascota, de los hombros para arriba
 * (`public/odesur/`), en una sola fila: es un acceso, no una placa, y no
 * puede empujar los partidos fuera de la pantalla. Lo que dice adentro lo dice
 * el texto de la acción; el logo es la firma.
 *
 * ── Se apaga solo ──────────────────────────────────────────────────────────
 * Se dibuja hasta el día siguiente al cierre —el medallero final todavía se
 * busca— y después no rinde nada: no hay que acordarse de sacarlo.
 */

const TOTAL_DIAS = diasEntre(ODESUR_FIRST_DAY, ODESUR_LAST_DAY) + 1;
/** Último día en que se dibuja: el siguiente al cierre. */
const ULTIMO_DIA_VISIBLE = sumarDias(ODESUR_LAST_DAY, 1);

function diasEntre(desde: string, hasta: string): number {
    const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
    return Math.round(ms / 86_400_000);
}

function sumarDias(dia: string, n: number): string {
    const fecha = new Date(`${dia}T00:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() + n);
    return fecha.toISOString().slice(0, 10);
}

/** En qué momento de los Juegos estamos. */
function momento(hoy: string): string {
    if (hoy < ODESUR_FIRST_DAY) return 'Del 13 al 26/9';
    if (hoy > ODESUR_LAST_DAY) return 'Final';
    return `Día ${diasEntre(ODESUR_FIRST_DAY, hoy) + 1} de ${TOTAL_DIAS}`;
}

export default function SantaFe2026Acceso() {
    const hoy = getTodayKey(APP_TIMEZONE);
    if (hoy > ULTIMO_DIA_VISIBLE) return null;

    return (
        <Link
            href="/juegos-odesur"
            className={styles.acceso}
            onClick={() => trackEvent('odesur_shortcut_click', { location: 'home_mobile' })}
        >
            {/* Arriba del pliegue en el teléfono: sin `loading="lazy"`.
                `<img>` pelado, como la placa de Ganá con tu club: son dos
                archivos chicos que no ganan nada pasando por next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/odesur/santa-fe-2026-logo.webp"
                alt="XIII Juegos Suramericanos Santa Fe 2026"
                width={300}
                height={213}
                className={styles.logo}
            />
            <span className={styles.texto}>
                {/* La hora del servidor y la del teléfono pueden caer a los dos
                    lados de la medianoche: el número del día no rompe la
                    hidratación por eso. */}
                <span className={styles.dia} suppressHydrationWarning>
                    {momento(hoy)}
                </span>
                <span className={styles.accion}>Medallero, resultados y agenda</span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/odesur/capi-cabeza.webp"
                alt=""
                width={288}
                height={288}
                className={styles.capi}
            />
            <svg
                className={styles.flecha}
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
                <polyline points="9 6 15 12 9 18" />
            </svg>
        </Link>
    );
}
