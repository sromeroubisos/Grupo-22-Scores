import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './juegos.module.css';

export const metadata: Metadata = {
    title: 'Juegos | G22 Scores',
    description: 'Minijuegos y Prode: jugá, pronosticá y competí en G22 Scores.',
};

function ChevronRight() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

function GamepadIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 12h4M8 10v4" />
            <circle cx="15.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="13" r="0.6" fill="currentColor" stroke="none" />
            <path d="M17.5 5.5H6.5A4.5 4.5 0 0 0 2 10v4a4.5 4.5 0 0 0 4.5 4.5c1.4 0 2.2-.7 3-1.5l.5-.5h4l.5.5c.8.8 1.6 1.5 3 1.5A4.5 4.5 0 0 0 22 14v-4a4.5 4.5 0 0 0-4.5-4.5Z" />
        </svg>
    );
}

function ProdeIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 3V2.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V3" />
            <path d="M8.5 12l2 2 4-4.5" />
        </svg>
    );
}

export default function JuegosHubPage() {
    return (
        <div className={styles.page}>
            <header className={styles.hero}>
                <span className={styles.eyebrow}>G22 Scores</span>
                <h1 className={styles.title}>Juegos</h1>
                <p className={styles.subtitle}>
                    Elegí cómo jugar: partidas rápidas de minijuegos o pronósticos en el Prode.
                </p>
            </header>

            <div className={styles.grid}>
                <Link href="/juegos/minijuegos" className={styles.card}>
                    <div className={styles.cardTop}>
                        <span className={styles.cardIcon}><GamepadIcon /></span>
                        <span className={styles.badge}>Nuevo</span>
                    </div>
                    <div className={styles.cardBody}>
                        <h2 className={styles.cardTitle}>Minijuegos</h2>
                        <p className={styles.cardDesc}>
                            Partidas rápidas y desafíos. Empezá por el simulador de Carrera de Rugby.
                        </p>
                        <span className={styles.cardCta}>Entrar <ChevronRight /></span>
                    </div>
                </Link>

                <Link href="/prode" className={styles.card}>
                    <div className={styles.cardTop}>
                        <span className={styles.cardIcon}><ProdeIcon /></span>
                    </div>
                    <div className={styles.cardBody}>
                        <h2 className={styles.cardTitle}>Prode</h2>
                        <p className={styles.cardDesc}>
                            Pronosticá resultados, sumá puntos y competí en ligas con tus amigos.
                        </p>
                        <span className={styles.cardCta}>Entrar <ChevronRight /></span>
                    </div>
                </Link>
            </div>
        </div>
    );
}
