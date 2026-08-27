// La nota: la lectura pública (solo lo publicado; quien administra ve
// también los borradores, sin indexar). Los metadatos salen de la nota
// misma —título, descripción, imagen, etiquetas como palabras clave y
// Open Graph— y un NewsArticle en JSON-LD para los buscadores.
//
// Al costado (o debajo, en el teléfono) van dos carriles: más noticias, del
// mismo deporte primero, y los partidos de hoy de ese deporte. El cuerpo se
// dibuja desde las marcas del editor (negrita, subtítulos, fotos
// intermedias): ver `lib/news/richText.ts`.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';

import NewsBody from '@/components/news/NewsBody';
import NewsMentionsStrip from '@/components/news/NewsMentionsStrip';
import ProtectedLink from '@/components/ProtectedLink';
import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import type { MentionRef, ResolvedMention } from '@/lib/news/mentions';
import { newsIdFromSegment, newsPath, newsSegment } from '@/lib/news/newsUrl';
import { collectMentions, plainTextOf, wordCountOf } from '@/lib/news/richText';
import { resolveNewsMentions } from '@/lib/server/newsMentions';
import { absoluteUrl } from '@/lib/seo/siteUrl';
import TodayMatchesRail from './TodayMatchesRail';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type NewsPageProps = {
    params: Promise<{
        // La carpeta es [id] por historia, pero lo que llega es el tramo
        // entero de la URL: `titular-id`, o el id pelado en los links viejos.
        // Quien lo traduce es newsIdFromSegment (ver lib/news/newsUrl.ts).
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

/** Lo que el carril de "Más noticias" necesita de cada nota. */
type RelatedNewsRow = Pick<NewsRow, 'id' | 'title' | 'image_url' | 'published_at' | 'sport' | 'scope'>;

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

/** El id que entiende `/api/matches` para cada deporte de una nota. Sin deporte, o uno propio, es rugby. */
const MATCHES_SPORT_IDS: Record<string, string> = {
    rugby: 'rugby',
    'rugby-union': 'rugby',
    'field-hockey': 'field-hockey',
    hockey: 'field-hockey',
    football: 'football',
    soccer: 'football',
    basketball: 'basketball',
    volleyball: 'volleyball',
    handball: 'handball',
    tennis: 'tennis',
};

const SCOPE_LABELS: Record<string, string> = {
    global: 'General',
    tournament: 'Torneo',
    club: 'Club',
    union: 'Unión',
};

const RELATED_POOL = 12;
const RELATED_SHOWN = 5;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El deporte como se lee: el nombre si es uno de la lista, o la etiqueta propia tal cual. */
function sportLabel(sport: string | null): string | null {
    const key = (sport ?? '').trim();
    if (!key) return null;
    return SPORT_NAMES[key.toLowerCase()] ?? key;
}

/** La carpeta de deporte de una nota, para juntar las del mismo palo. Sin deporte, o uno propio, es rugby. */
function sportKeyOf(sport: string | null | undefined): string {
    const key = (sport ?? '').trim().toLowerCase();
    return MATCHES_SPORT_IDS[key] ?? 'rugby';
}

function tagsOf(news: NewsRow): string[] {
    return Array.isArray(news.tags)
        ? news.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
        : [];
}

/** La descripción para los buscadores: el resumen o el principio del cuerpo, sin marcas, en 155. */
function descriptionOf(news: NewsRow): string {
    const summary = (news.summary || '').trim();
    if (summary) return summary.length > 155 ? `${summary.slice(0, 152)}...` : summary;
    const first = plainTextOf(news.content).split('\n\n')[0] ?? '';
    return first.length > 155 ? `${first.slice(0, 152)}...` : first;
}

// La placa de la casa: la imagen para compartir cuando la nota no trae foto.
const FALLBACK_OG_IMAGE = '/og-default.png';

function publicImageOf(news: Pick<NewsRow, 'image_url'>): string | null {
    const url = (news.image_url || '').trim();
    return /^https?:\/\//i.test(url) ? url : null;
}

/** "22 abr", en hora argentina: el carril es corto y el año no suma. */
function shortDate(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'numeric', day: 'numeric' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = get('day');
    const month = Number(get('month'));
    return day && month ? `${day} ${MONTHS[month - 1]}` : null;
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

/**
 * Otras notas publicadas: las últimas, con las del mismo deporte primero.
 * Es un extra del lector: si la consulta falla, la nota sale igual.
 */
async function loadRelated(current: NewsRow): Promise<RelatedNewsRow[]> {
    try {
        const { supabase } = await getServerAuthRole();
        const { data, error } = await supabase
            .from('news')
            .select('id, title, image_url, published_at, sport, scope')
            .eq('status', 'published')
            .neq('id', current.id)
            .order('published_at', { ascending: false })
            .limit(RELATED_POOL);
        if (error || !Array.isArray(data)) return [];

        const sameSport = sportKeyOf(current.sport);
        const rows = data as RelatedNewsRow[];
        return [
            ...rows.filter((row) => sportKeyOf(row.sport) === sameSport),
            ...rows.filter((row) => sportKeyOf(row.sport) !== sameSport),
        ].slice(0, RELATED_SHOWN);
    } catch (error) {
        console.error('[noticias/[id]] related news read failed:', error);
        return [];
    }
}

/**
 * Lo etiquetado en el cuerpo (clubes, jugadores, torneos, partidos, videos),
 * con su dato actual para dibujar escudos, tarjetas y reproductores. Es un
 * extra del lector: si falla, cada mención queda como link con su etiqueta.
 */
async function loadMentions(refs: MentionRef[]): Promise<Record<string, ResolvedMention>> {
    if (refs.length === 0) return {};
    try {
        return await resolveNewsMentions(refs);
    } catch (error) {
        console.error('[noticias/[id]] mentions resolve failed:', error);
        return {};
    }
}

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
    const { id: segment } = await params;
    const { news } = await loadNews(newsIdFromSegment(segment)).catch(() => ({ news: null, canManageNews: false }));
    if (!news) return { title: 'Noticia | G22 Scores' };

    const description = descriptionOf(news);
    const tags = tagsOf(news);
    const sport = sportLabel(news.sport);
    const keywords = [...tags, ...(sport ? [sport] : [])];
    const image = publicImageOf(news) ?? FALLBACK_OG_IMAGE;
    const published = news.status === 'published';
    // Siempre la forma con titular: se entre por donde se entre, la nota se
    // anuncia en una sola URL.
    const canonicalPath = newsPath(news);

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

function RelatedNews({ items }: { items: RelatedNewsRow[] }) {
    if (items.length === 0) return null;
    return (
        <section className={styles.railCard} aria-labelledby="rail-noticias">
            <div className={styles.railHead}>
                <h2 id="rail-noticias" className={styles.railTitle}>Más noticias</h2>
            </div>
            <ul className={styles.relatedList}>
                {items.map((item) => {
                    const image = publicImageOf(item);
                    const sport = sportLabel(item.sport) ?? 'Rugby';
                    const date = shortDate(item.published_at);
                    return (
                        <li key={item.id}>
                            <Link href={newsPath(item)} className={styles.relatedItem}>
                                <span className={styles.relatedThumb} aria-hidden="true">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura remota de otra nota, debajo del pliegue. */}
                                    {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : null}
                                </span>
                                <span className={styles.relatedBody}>
                                    <span className={styles.relatedMeta}>
                                        <span>{sport}</span>
                                        {date && <><span className={styles.dateDivider} aria-hidden="true" /><span>{date}</span></>}
                                    </span>
                                    <span className={styles.relatedTitle}>{item.title}</span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <Link href="/noticias" className={styles.railFooterLink}>Todas las noticias</Link>
        </section>
    );
}

export default async function NewsPage({ params }: NewsPageProps) {
    const { id: segment } = await params;
    const { news, canManageNews } = await loadNews(newsIdFromSegment(segment));

    if (!news) {
        notFound();
    }

    // La URL vieja (el id pelado) y la que quedó con un titular ya corregido
    // siguen abriendo, pero mandan de una vez a la forma canónica: así el
    // buscador junta las señales en una sola dirección y ningún link ya
    // compartido queda muerto. La comparación es contra el tramo entero, así
    // que una nota cuyo titular no deja slug —canónico = id pelado— no entra
    // en un bucle.
    //
    // Ojo con lo que sale por el cable, que está medido: acá el redirect NO
    // llega como 308. El layout envuelve a los hijos en un <Suspense>, el
    // documento ya empezó a viajar cuando esto corre y el 200 quedó firmado,
    // así que Next lo degrada a un <meta refresh> instantáneo. Al lector lo
    // deja donde tiene que estar y el buscador lo atiende como redirect, pero
    // más flojo que un 308. Probado también desde generateMetadata —antes del
    // primer envío— y sale peor: ahí ni siquiera queda el meta, el redirect se
    // va entero al payload y solo lo resuelve el cliente al hidratar.
    //
    // Es el mismo motivo por el que un notFound() de este proyecto contesta
    // 200. Se arregla sacando ese <Suspense>, que es una decisión de todo el
    // sitio y no de esta nota. Mientras tanto lo que sostiene la canonización
    // es el resto: el sitemap, todos los links internos y el <link canonical>
    // nombran una sola URL, la que lleva titular.
    const canonicalSegment = newsSegment(news);
    if (segment !== canonicalSegment) {
        permanentRedirect(`/noticias/${canonicalSegment}`);
    }

    const mentionRefs = collectMentions(news.content);
    const [related, mentions] = await Promise.all([loadRelated(news), loadMentions(mentionRefs)]);

    const publishedLabel = news.published_at
        ? new Date(news.published_at).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : 'Sin fecha de publicación';

    const tags = tagsOf(news);
    const sport = sportLabel(news.sport);
    const scope = SCOPE_LABELS[(news.scope || 'global').toLowerCase()] ?? news.scope ?? 'General';
    const image = publicImageOf(news);
    const description = descriptionOf(news);
    const matchesSportId = sportKeyOf(news.sport);
    const matchesSportLabel = SPORT_NAMES[matchesSportId] ?? 'Rugby';

    const readingWords = wordCountOf(`${news.summary || ''}\n\n${news.content || ''}`);
    const readingMinutes = Math.max(1, Math.ceil(readingWords / 220));

    // Solo una nota publicada se anuncia como artículo a los buscadores.
    // El JSON-LD no pasa por metadataBase: acá las URLs van absolutas.
    const canonicalUrl = absoluteUrl(newsPath(news));
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
        // data-sticky-tabs: le pide a globals.css que pase body y main a
        // overflow-x: clip, para que la columna lateral pueda quedarse pegada.
        <div className={styles.readerPage} data-sticky-tabs="">
            {jsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            )}
            <div className={styles.readerLayout}>
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
                        <NewsBody
                            content={news.content}
                            mentions={mentions}
                            title={news.title}
                            empty={(
                                <p className={styles.emptyBody}>
                                    Esta noticia todavía no tiene contenido cargado.
                                </p>
                            )}
                        />

                        <NewsMentionsStrip mentions={mentionRefs} resolved={mentions} newsId={news.id} />

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

                <aside className={styles.readerAside} aria-label="Más noticias y partidos de hoy">
                    <RelatedNews items={related} />
                    <TodayMatchesRail sportId={matchesSportId} sportLabel={matchesSportLabel} />
                </aside>
            </div>
        </div>
    );
}
