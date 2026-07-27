import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../juegos.module.css';

export const metadata: Metadata = {
    title: 'Minijuegos | G22 Scores',
    description: 'Partidas rápidas y desafíos de G22 Scores. Jugá el simulador de Carrera de Rugby.',
};

function ChevronRight() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

function BackArrow() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
        </svg>
    );
}

function RugbyIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="10" ry="6.4" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="10" y1="10.4" x2="10" y2="13.6" />
            <line x1="12" y1="10" x2="12" y2="14" />
            <line x1="14" y1="10.4" x2="14" y2="13.6" />
        </svg>
    );
}

export default function MinijuegosPage() {
    return (
        <div className={styles.page}>
            <Link href="/juegos" className={styles.backLink}>
                <BackArrow /> Juegos
            </Link>

            <header className={styles.hero}>
                <span className={styles.eyebrow}>Minijuegos</span>
                <h1 className={styles.title}>Elegí un juego</h1>
                <p className={styles.subtitle}>
                    Partidas cortas para pasar el rato. Vamos sumando más con el tiempo.
                </p>
            </header>

            <div className={`${styles.grid} ${styles.gridSingle}`}>
                <Link href="/juegos/minijuegos/carrera-rugby" className={styles.card}>
                    <div className={styles.cardTop}>
                        <span className={styles.cardIcon}><RugbyIcon /></span>
                        <span className={styles.badge}>Destacado</span>
                    </div>
                    <div className={styles.cardBody}>
                        <h2 className={styles.cardTitle}>Carrera de Rugby</h2>
                        <p className={styles.cardDesc}>
                            Simulá una carrera completa: elegí posición y club, tomá decisiones cada temporada y retirate como leyenda.
                        </p>
                        <span className={styles.cardCta}>Ver juego <ChevronRight /></span>
                    </div>
                </Link>
            </div>
        </div>
    );
}
