// La nota: la lectura pública (solo lo publicado; quien administra ve
// también los borradores, sin indexar). Los metadatos salen de la nota
// misma —título, descripción, imagen, etiquetas como palabras clave y
// Open Graph— y un NewsArticle en JSON-LD para los buscadores.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import ProtectedLink from '@/components/ProtectedLink';
import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { absoluteUrl } from '@/lib/seo/siteUrl';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type NewsPageProps = {
    params: Promise<{
        id: string;
    }>;
};

interface NewsRow {
    id: string;
    title: string;
    summary: string | null;
    content: string | null;
    image_url: string | null;
    published_at: string | null;
    updated_at?: string | null;
    status: string;
    sport: string | null;
    scope: string | null;
    tags?: string[] | null;
}

const SPORT_NAMES: Record<string, string> = {
    rugby: 'Rugby',
    'rugby-union': 'Rugby',
    'field-hockey': 'Hockey',
    hockey: 'Hockey',
    football: 'Fútbol',
    soccer: 'Fútbol',
    basketball: 'Básquet',
    volleyball: 'Vóley',
    handball: 'Handball',
    tennis: 'Tenis',
};

const SCOPE_LABELS: Record<string, string> = {
    global: 'General',
    tournament: 'Torneo',
    club: 'Club',
    union: 'Unión',
};

/** El deporte como se lee: el nombre si es uno de la lista, o la etiqueta propia tal cual. */
function sportLabel(sport: string | null): string | null {
    const key = (sport ?? '').trim();
    if (!key) return null;
    return SPORT_NAMES[key.toLowerCase()] ?? key;
}

function tagsOf(news: NewsRow): string[] {
    return Array.isArray(news.tags)
        ? news.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
        : [];
}

function paragraphsOf(news: NewsRow): string[] {
    return (news.content || '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

/** La descripción para los buscadores: el resumen o el primer párrafo, en 155. */
function descriptionOf(news: NewsRow): string {
    const summary = (news.summary || '').trim();
    if (summary) return summary.length > 155 ? `${summary.slice(0, 152)}...` : summary;
    const first = paragraphsOf(news)[0] ?? '';
    return first.length > 155 ? `${first.slice(0, 152)}...` : first;
}

// La placa de la casa: la imagen para compartir cuando la nota no trae foto.
const FALLBACK_OG_IMAGE = '/og-default.png';

function publicImageOf(news: NewsRow): string | null {
    const url = (news.image_url || '').trim();
    return /^https?:\/\//i.test(url) ? url : null;
}

/** La nota, una vez por request: la usan generateMetadata y la página. */
const loadNews = cache(async (id: string): Promise<{ news: NewsRow | null; canManageNews: boolean }> => {
    const { supabase, role } = await getServerAuthRole();
    const canManageNews = hasNewsManagementAccess(role);

    let query = supabase.from('news').select('*').eq('id', id);
    if (!canManageNews) {
        query = query.eq('status', 'published');
    }

    const { data, error } = await query.maybeSingle();
    return { news: error ? null : ((data as NewsRow | null) ?? null), canManageNews };
});

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
    const { id } = await params;
    const { news } = await loadNews(id).catch(() => ({ news: null, canManageNews: false }));
    if (!news) return { title: 'Noticia | G22 Scores' };

    const description = descriptionOf(news);
    const tags = tagsOf(news);
    const sport = sportLabel(news.sport);
    const keywords = [...tags, ...(sport ? [sport] : [])];
    const image = publicImageOf(news) ?? FALLBACK_OG_IMAGE;
    const published = news.status === 'published';
    const canonicalPath = `/noticias/${news.id}`;

    return {
        title: `${news.title} | Noticias G22 Scores`,
        description: description || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        alternates: {
            canonical: canonicalPath,
        },
        openGraph: {
            type: 'article',
            title: news.title,
            description: description || undefined,
            siteName: 'G22 Scores',
            locale: 'es_AR',
            url: canonicalPath,
            publishedTime: news.published_at ?? undefined,
            modifiedTime: news.updated_at ?? undefined,
            tags: tags.length > 0 ? tags : undefined,
            images: [{ url: image }],
        },
        twitter: {
            card: 'summary_large_image',
            title: news.title,
            description: description || undefined,
            images: [image],
        },
        // Un borrador lo ve solo quien administra: que ningún buscador lo indexe.
        robots: published ? undefined : { index: false, follow: false },
    };
}

export default async function NewsPage({ params }: NewsPageProps) {
    const { id } = await params;
    const { news, canManageNews } = await loadNews(id);

    if (!news) {
        notFound();
    }

    const publishedLabel = news.published_at
        ? new Date(news.published_at).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : 'Sin fecha de publicación';

    const paragraphs = paragraphsOf(news);
    const tags = tagsOf(news);
    const sport = sportLabel(news.sport);
    const scope = SCOPE_LABELS[(news.scope || 'global').toLowerCase()] ?? news.scope ?? 'General';
    const image = publicImageOf(news);
    const description = descriptionOf(news);

    const readingWords = `${news.summary || ''} ${news.content || ''}`
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    const readingMinutes = Math.max(1, Math.ceil(readingWords / 220));

    // Solo una nota publicada se anuncia como artículo a los buscadores.
    // El JSON-LD no pasa por metadataBase: acá las URLs van absolutas.
    const canonicalUrl = absoluteUrl(`/noticias/${news.id}`);
    const jsonLd = news.status === 'published'
        ? {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: news.title,
            description: description || undefined,
            url: canonicalUrl,
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
            datePublished: news.published_at ?? undefined,
            dateModified: news.updated_at ?? news.published_at ?? undefined,
            image: [image ?? absoluteUrl('/og-default.png')],
            keywords: [...tags, ...(sport ? [sport] : [])].join(', ') || undefined,
            articleSection: sport ?? undefined,
            inLanguage: 'es-AR',
            author: { '@type': 'Organization', name: 'G22 Scores', url: absoluteUrl('/') },
            publisher: {
                '@type': 'Organization',
                name: 'G22 Scores',
                url: absoluteUrl('/'),
                logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.png') },
            },
        }
        : null;

    return (
        <div className={styles.readerPage}>
            {jsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            )}
            <div className={styles.readerShell}>
                <div className={styles.readerTopBar}>
                    <Link href="/noticias" className={styles.backLink}>
                        Volver a noticias
                    </Link>
                    <span className={styles.topBarMeta}>{readingMinutes} min de lectura</span>
                </div>

                <article className={styles.heroCard}>
                    <div className={styles.metaRow}>
                        <div className={styles.badgeRow}>
                            <span className={`${styles.badge} ${styles.badgeAccent}`}>{scope.toUpperCase()}</span>
                            {sport && <span className={styles.badge}>{sport}</span>}
                            {canManageNews && news.status !== 'published' && (
                                <span className={styles.badge}>{news.status === 'draft' ? 'Borrador' : news.status}</span>
                            )}
                        </div>
                        <div className={styles.dateCluster}>
                            {news.published_at ? (
                                <time className={styles.dateLabel} dateTime={news.published_at}>
                                    {publishedLabel}
                                </time>
                            ) : (
                                <span className={styles.dateLabel}>{publishedLabel}</span>
                            )}
                            <span className={styles.dateDivider}></span>
                            <span className={styles.dateLabel}>{readingMinutes} min</span>
                        </div>
                    </div>

                    <header className={styles.headline}>
                        <h1>{news.title}</h1>
                        {news.summary && <p className={styles.summary}>{news.summary}</p>}
                    </header>

                    {image && (
                        <div className={styles.imageWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- imagen remota de la nota; está sobre el pliegue. */}
                            <img
                                src={image}
                                alt={news.title}
                                className={styles.heroImage}
                            />
                        </div>
                    )}
                </article>

                <section className={styles.bodyCard}>
                    <div className={styles.bodyContent}>
                        {paragraphs.length > 0 ? (
                            paragraphs.map((paragraph: string, index: number) => (
                                <p
                                    key={`${news.id}-paragraph-${index}`}
                                    className={index === 0 ? styles.leadParagraph : undefined}
                                >
                                    {paragraph}
                                </p>
                            ))
                        ) : (
                            <p className={styles.emptyBody}>
                                Esta noticia todavía no tiene contenido cargado.
                            </p>
                        )}
                    </div>

                    {tags.length > 0 && (
                        <div className={styles.tagSection}>
                            <span className={styles.tagSectionLabel} id={`tags-${news.id}`}>
                                Etiquetas
                            </span>
                            <div className={styles.badgeRow} role="list" aria-labelledby={`tags-${news.id}`}>
                                {tags.map((tag) => (
                                    <span key={tag} role="listitem" className={styles.badge}>{tag}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={styles.actionRow}>
                        <Link
                            href="/noticias"
                            className={`${styles.actionLink} ${styles.secondaryLink}`}
                        >
                            Ver más noticias
                        </Link>
                        {canManageNews && (
                            <ProtectedLink
                                href={`/admin/noticias/editar/${news.id}`}
                                className={`${styles.actionLink} ${styles.primaryLink}`}
                            >
                                Editar noticia
                            </ProtectedLink>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
