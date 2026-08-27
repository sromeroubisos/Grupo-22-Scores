'use client';

import Link from "next/link";
import { db } from "@/lib/mock-db";
import { newsPath } from '@/lib/news/newsUrl';
import styles from "./not-found.module.css";
// import { createClient } from "@/lib/supabase/client"; // Use this when switching to Supabase

// This is a Server Component in App Router
export default function NotFound() {
    // Mock data fetching - In real implementation use Supabase
    // const supabase = createClient();
    // const { data: news } = await ...

    const news = db.news
        .filter(n => n.status === 'published')
        .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
        .slice(0, 3);

    return (
        <main className={styles.nf}>
            <div className={styles.nf__wrap}>
                <div className={styles.nf__hero}>
                    <div className={styles.nf__icon} aria-hidden>⊘</div>
                    <h1 className={styles.nf__title}>No encontramos este contenido</h1>
                    <p className={styles.nf__desc}>
                        Puede que el partido haya finalizado o el enlace esté desactualizado.
                    </p>

                    <div className={styles.nf__actions}>
                        <Link className={`${styles.btn} ${styles['btn--primary']}`} href="/">
                            Ver partidos de hoy
                        </Link>
                        <Link className={`${styles.btn} ${styles['btn--ghost']}`} href="/">
                            Ir al inicio
                        </Link>
                    </div>

                    <div className={styles.nf__quick}>
                        <p className={styles.nf__quickTitle}>Accesos rápidos</p>
                        <div className={styles.nf__grid}>
                            <Link className={styles.chip} href="/matches">🏉 Partidos</Link>
                            <Link className={styles.chip} href="/tournaments">🏆 Ligas</Link>
                            <Link className={styles.chip} href="/profile">👤 Perfil</Link>
                            <Link className={styles.chip} href="/search">🔎 Buscar</Link>
                        </div>
                    </div>
                </div>

                <section className={styles.nf__news}>
                    <div className={styles.nf__newsHead}>
                        <h2 className={styles.nf__newsTitle}>Últimas noticias</h2>
                        {/* If /noticias exists, link there. Otherwise hidden or home */}
                        <Link className={styles.nf__newsMore} href="/noticias">Ver todas</Link>
                    </div>

                    <div className={styles.nf__newsList}>
                        {(news ?? []).map((n) => (
                            <Link key={n.id} className={styles.card} href={newsPath(n)}>
                                <div className={styles.card__meta}>
                                    <span className={styles.tag}>{n.sport?.toUpperCase() || "DEPORTE"}</span>
                                    <span className={styles.time}>
                                        {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("es-AR", { day: 'numeric', month: 'short' }) : ""}
                                    </span>
                                </div>
                                <div className={styles.card__title}>{n.title}</div>
                            </Link>
                        ))}
                        {!news?.length && (
                            <div className={`${styles.card} ${styles['card--empty']}`} style={{ textAlign: 'center' }}>
                                <p style={{ marginBottom: '16px' }}>No hay datos disponibles todavía</p>
                                <button className={styles.btn} onClick={() => window.location.reload()}>Reintentar</button>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
