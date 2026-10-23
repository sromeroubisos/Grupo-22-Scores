'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { newsPath } from '@/lib/news/newsUrl';
import styles from './ClubNews.module.css';

export interface ClubNewsItem {
    id: string;
    title: string;
    summary: string | null;
    image_url: string | null;
    published_at: string | null;
    tags: string[] | null;
}

/**
 * Las noticias del club, una vez por ficha. `null` mientras carga: la pantalla
 * distingue "todavía no sé" de "no hay", y en el segundo caso la sección ni
 * aparece (un panel vacío en el Resumen es ruido).
 */
export function useClubNews(clubId: string | null, name: string | null): ClubNewsItem[] | null {
    const [news, setNews] = useState<ClubNewsItem[] | null>(null);

    useEffect(() => {
        if (!clubId) return;
        const controller = new AbortController();
        const query = new URLSearchParams();
        if (name) query.set('name', name);
        fetch(`/api/clubs/${encodeURIComponent(clubId)}/news?${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : { news: [] }))
            .then((payload) => setNews(Array.isArray(payload?.news) ? payload.news : []))
            .catch((error) => {
                if (error?.name !== 'AbortError') setNews([]);
            });
        return () => controller.abort();
    }, [clubId, name]);

    return news;
}

function dateLabel(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
        .format(date)
        .replace('.', '');
}

export default function ClubNews({ items, limit }: { items: ClubNewsItem[]; limit?: number }) {
    const shown = limit ? items.slice(0, limit) : items;
    return (
        <ul className={styles.list}>
            {shown.map((item, index) => (
                <li key={item.id}>
                    <Link href={newsPath(item)} className={styles.card}>
                        <span className={styles.text}>
                            <span className={styles.title}>{item.title}</span>
                            <span className={styles.meta}>
                                {item.tags?.[0] ? <span className={styles.tag}>{item.tags[0]}</span> : null}
                                {dateLabel(item.published_at)}
                            </span>
                        </span>
                        {item.image_url ? (
                            <img
                                src={item.image_url}
                                alt=""
                                className={styles.thumb}
                                loading={index === 0 ? 'eager' : 'lazy'}
                                decoding="async"
                            />
                        ) : null}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
