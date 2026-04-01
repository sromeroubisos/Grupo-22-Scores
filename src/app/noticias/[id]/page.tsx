import Link from 'next/link';
import { notFound } from 'next/navigation';

import { hasEditorialAccess } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type NewsPageProps = {
    params: {
        id: string;
    };
};

export default async function NewsPage({ params }: NewsPageProps) {
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

    let query = supabase.from('news').select('*').eq('id', params.id);

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

    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <article
                className="card"
                style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: '24px' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge">
                            {(news.scope || 'global').toUpperCase()}
                        </span>
                        {news.sport && <span className="badge">{news.sport}</span>}
                        {canManageNews && news.status !== 'published' && <span className="badge">{news.status}</span>}
                    </div>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.9rem' }}>{publishedLabel}</span>
                </div>

                <header style={{ display: 'grid', gap: '12px' }}>
                    <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', lineHeight: 1.05 }}>{news.title}</h1>
                    {news.summary && (
                        <p style={{ fontSize: '1.05rem', color: 'var(--color-text-secondary)', maxWidth: 720 }}>
                            {news.summary}
                        </p>
                    )}
                </header>

                {news.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={news.image_url}
                        alt={news.title}
                        style={{
                            width: '100%',
                            borderRadius: '20px',
                            objectFit: 'cover',
                            maxHeight: '520px',
                            border: '1px solid var(--color-border)',
                        }}
                    />
                )}

                <div
                    style={{
                        whiteSpace: 'pre-wrap',
                        color: 'var(--color-text-primary)',
                        fontSize: '1rem',
                        lineHeight: 1.9,
                    }}
                >
                    {news.content || 'Esta noticia todavia no tiene contenido cargado.'}
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/noticias" className="btn btn-secondary">
                        Volver a noticias
                    </Link>
                    {canManageNews && (
                        <Link href={`/admin/editorial/edit/${news.id}`} className="btn btn-primary">
                            Editar noticia
                        </Link>
                    )}
                </div>
            </article>
        </div>
    );
}
