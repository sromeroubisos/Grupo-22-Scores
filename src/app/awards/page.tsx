// /awards: las dos ediciones de los premios de la comunidad.

import type { Metadata } from 'next';
import Link from 'next/link';

import { AWARD_EDITIONS } from '@/lib/awards/config';
import EditionLogo from './EditionLogo';
import { awardsDisplay } from './fonts';
import styles from './awards.module.css';

export const metadata: Metadata = {
    title: 'Awards | Salida 22 y Corner Corto',
    description: 'Postulá, votá y mandá la jugada de los pibes: los premios de rugby y hockey los elige la gente.',
    alternates: { canonical: '/awards' },
    openGraph: {
        type: 'website',
        title: 'Salida 22 Awards y Corner Corto Awards',
        description: 'Los premios de rugby y hockey los elige la gente.',
        siteName: 'G22 Scores',
        locale: 'es_AR',
        url: '/awards',
        images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'G22 Scores' }],
    },
};

export default function AwardsIndexPage() {
    return (
        <main className={`${styles.root} ${awardsDisplay.variable}`}>
            <div className={styles.wrap}>
                <header className={styles.hero}>
                    <div className={styles.eyebrow}>Premios de la comunidad</div>
                    <h1 className={`${styles.display} ${styles.gold} ${styles.heroTitle}`}>Awards</h1>
                    <div className={styles.edition}>Temporada 2026</div>
                    <p className={styles.tagline}>
                        Postulá a quien lo merece, votá en cada categoría y mandá la jugada de los pibes. Elegí la edición.
                    </p>
                </header>
                <div className={styles.editions} style={{ marginTop: 32 }}>
                    {AWARD_EDITIONS.map((edition) => (
                        <Link key={edition.slug} href={`/awards/${edition.slug}`} className={styles.editionCard}>
                            <span className={styles.eyebrow}>{edition.sportLabel}</span>
                            <EditionLogo config={edition} as="h2" />
                            <p>{edition.tagline}</p>
                            <span className={styles.eyebrow}>{edition.categories.length} categorías</span>
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
}
