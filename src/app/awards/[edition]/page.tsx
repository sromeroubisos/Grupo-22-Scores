// /awards/[edition]: una edición de los premios (Salida 22 o Corner Corto).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { getAwardEdition } from '@/lib/awards/config';
import { getPublicState } from '@/lib/server/awards';
import { createClient } from '@/lib/supabase/server';
import { awardsDisplay } from '../fonts';
import styles from '../awards.module.css';
import AwardsClient from './AwardsClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ edition: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const edition = getAwardEdition((await params).edition);
    if (!edition) return { title: 'Awards' };
    const path = `/awards/${edition.slug}`;
    return {
        title: `${edition.name} 2026`,
        description: `${edition.tagline} Postulá, votá y mandá la jugada de los pibes.`,
        alternates: { canonical: path },
        openGraph: {
            type: 'website',
            title: `${edition.name} 2026`,
            description: edition.tagline,
            siteName: 'G22 Scores',
            locale: 'es_AR',
            url: path,
            images: edition.logo
                ? [{ url: edition.logo.poster, width: 1080, height: 1350, alt: edition.logo.alt }]
                : [{ url: '/og-default.png', width: 1200, height: 630, alt: 'G22 Scores' }],
        },
    };
}

export default async function AwardsEditionPage({ params }: Props) {
    const config = getAwardEdition((await params).edition);
    if (!config) notFound();

    const [{ role }, supabase] = await Promise.all([getServerAuthRole(), createClient()]);
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id ?? null;
    const state = await getPublicState(config, userId);

    return (
        <main className={`${styles.root} ${awardsDisplay.variable}`}>
            <AwardsClient config={config} state={state} canManage={hasNewsManagementAccess(role)} />
        </main>
    );
}
