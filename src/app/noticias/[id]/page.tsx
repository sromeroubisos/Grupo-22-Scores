import Link from 'next/link';
import { notFound } from 'next/navigation';

import { hasEditorialAccess } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type NewsPageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function NewsPage({ params }: NewsPageProps) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    let canManageNews = false;

    if (session?.user?.id) {
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

        const { data: memberships } = await supabase
            .from('memberships')
            .select('scope_type, scope_id, role')
            .eq('user_id', session.user.id);

        canManageNews = hasEditorialAccess(
            userData?.role || session.user.user_metadata?.role,
            (memberships || []).map((membership) => ({
                scopeType: membership.scope_type,
                scopeId: membership.scope_id,
                role: membership.role,
            })),
        );
    }

    let query = supabase.from('news').select('*').eq('id', id);

    if (!canManageNews) {
        query = query.eq('status', 'published');
    }

    const { data: news, error } = await query.maybeSingle();

    if (error || !news) {
        notFound();
    }

    const publishedLabel = news.published_at
        ? new Date(news.published_at).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : 'Sin fecha de publicacion';

    const paragraphs = (news.content || '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const readingWords = `${news.summary || ''} ${news.content || ''}`
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    const readingMinutes = Math.max(1, Math.ceil(readingWords / 220));

    return (
        <div className={styles.readerPage}>
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
                            <span className={styles.badge}>{(news.scope || 'global').toUpperCase()}</span>
                            {news.sport && <span className={styles.badge}>{news.sport}</span>}
                            {canManageNews && news.status !== 'published' && (
                                <span className={styles.badge}>{news.status}</span>
                            )}
                        </div>
                        <div className={styles.dateCluster}>
                            <span className={styles.dateLabel}>{publishedLabel}</span>
                            <span className={styles.dateDivider}></span>
                            <span className={styles.dateLabel}>{readingMinutes} min</span>
                        </div>
                    </div>

                    <header className={styles.headline}>
                        <h1>{news.title}</h1>
                        {news.summary && <p className={styles.summary}>{news.summary}</p>}
                    </header>

                    {news.image_url && (
                        <div className={styles.imageWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={news.image_url}
                                alt={news.title}
                                className={styles.heroImage}
                            />
                        </div>
                    )}
                </article>

                <section className={styles.bodyCard}>
                    <div className={styles.bodyContent}>
                        {paragraphs.length > 0 ? (
                            paragraphs.map((paragraph, index) => (
                                <p
                                    key={`${news.id}-paragraph-${index}`}
                                    className={index === 0 ? styles.leadParagraph : undefined}
                                >
                                    {paragraph}
                                </p>
                            ))
                        ) : (
                            <p className={styles.emptyBody}>
                                Esta noticia todavia no tiene contenido cargado.
                            </p>
                        )}
                    </div>

                    <div className={styles.actionRow}>
                        <Link
                            href="/noticias"
                            className={`${styles.actionLink} ${styles.secondaryLink}`}
                        >
                            Ver mas noticias
                        </Link>
                        {canManageNews && (
                            <Link
                                href={`/admin/editorial/edit/${news.id}`}
                                className={`${styles.actionLink} ${styles.primaryLink}`}
                            >
                                Editar noticia
                            </Link>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
