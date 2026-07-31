'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import styles from './carrera.module.css';

/**
 * LA PUERTA DE ESTRENO.
 *
 * Hasta que llegue la hora, entrar al juego muestra la cuenta regresiva en vez
 * del juego. Después, la puerta desaparece sola y no queda nada que apagar a
 * mano: la condición es el reloj, no una bandera que alguien tiene que acordarse
 * de dar vuelta.
 *
 * EL INSTANTE ES ABSOLUTO, no "las 10 de la mañana de cada uno". Se declara en
 * UTC y cada navegador lo compara contra su propio reloj, así que el juego abre
 * en el mismo momento para todos — a las 10 de Buenos Aires, que son las 15 en
 * Madrid y las 6 en Los Ángeles. Un estreno que dependiera del huso sería seis
 * estrenos distintos.
 */
const APERTURA = Date.parse('2026-07-31T13:00:00.000Z'); // 31/7/2026, 10:00 en Argentina

/**
 * EN DESARROLLO LA PUERTA NO EXISTE.
 *
 * Una cuenta regresiva que también corre en `npm run dev` impide probar el juego
 * justo cuando más falta hace probarlo. `NODE_ENV` vale lo mismo en el servidor
 * y en el cliente, así que apagarla acá no puede desincronizar la hidratación.
 */
const SIN_PUERTA = process.env.NODE_ENV !== 'production';

interface Resto {
    dias: number;
    horas: number;
    minutos: number;
    segundos: number;
}

function restoHasta(objetivo: number, ahora: number): Resto | null {
    const ms = objetivo - ahora;
    if (ms <= 0) return null;
    const total = Math.floor(ms / 1000);
    return {
        dias: Math.floor(total / 86400),
        horas: Math.floor((total % 86400) / 3600),
        minutos: Math.floor((total % 3600) / 60),
        segundos: total % 60,
    };
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

export default function LaunchGate({ children }: { children: ReactNode }) {
    /**
     * `null` significa "todavía no sé qué hora es".
     *
     * El servidor no puede saberlo —su reloj no es el del jugador— así que el
     * primer render no decide nada y la cuenta aparece recién en el efecto. Sin
     * esto, el HTML del servidor y el del cliente dirían segundos distintos y
     * React tiraría un error de hidratación en cada carga.
     */
    const [ahora, setAhora] = useState<number | null>(null);

    useEffect(() => {
        if (SIN_PUERTA) return;
        setAhora(Date.now());
        const id = window.setInterval(() => setAhora(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    if (SIN_PUERTA) return <>{children}</>;
    if (ahora === null) return null;

    const resto = restoHasta(APERTURA, ahora);
    if (resto === null) return <>{children}</>;

    const apertura = new Date(APERTURA);
    // `hour12: false` a propósito: con el de por defecto salía "10:00 a. m. h",
    // que dice la hora dos veces y de dos formas.
    const cuando = apertura.toLocaleString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });

    return (
        <div className={styles.gate}>
            <div className={styles.topbar}>
                <Link href="/juegos/minijuegos" className={styles.back}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                    Volver a Juegos
                </Link>
            </div>

            <span className={styles.gateEyebrow}>La Joya</span>
            <h1 className={styles.gateTitle}>Carrera de Rugby</h1>
            <p className={styles.gateLead}>El juego abre en</p>

            {/* `aria-live="off"`: un contador que se anuncia cada segundo hace
                inusable un lector de pantalla. El tiempo que falta se dice una
                sola vez, abajo, en texto. */}
            <div className={styles.gateClock} aria-hidden="true">
                {resto.dias > 0 && (
                    <span className={styles.gateUnit}>
                        <span className={styles.gateNum}>{resto.dias}</span>
                        <span className={styles.gateLabel}>{resto.dias === 1 ? 'día' : 'días'}</span>
                    </span>
                )}
                <span className={styles.gateUnit}>
                    <span className={styles.gateNum}>{dosDigitos(resto.horas)}</span>
                    <span className={styles.gateLabel}>horas</span>
                </span>
                <span className={styles.gateUnit}>
                    <span className={styles.gateNum}>{dosDigitos(resto.minutos)}</span>
                    <span className={styles.gateLabel}>min</span>
                </span>
                <span className={styles.gateUnit}>
                    <span className={styles.gateNum}>{dosDigitos(resto.segundos)}</span>
                    <span className={styles.gateLabel}>seg</span>
                </span>
            </div>

            <p className={styles.gateWhen} role="status">
                Abre el {cuando} h. Faltan {resto.dias > 0 ? `${resto.dias} d ` : ''}
                {resto.horas} h {resto.minutos} min.
            </p>
        </div>
    );
}
