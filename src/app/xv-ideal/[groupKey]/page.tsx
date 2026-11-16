// La votación del XV Ideal de un torneo: una pestaña por zona, una camiseta
// por puesto, un candidato por camiseta. Se mira sin login; para votar hace
// falta sesión (una boleta por persona).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { isSuperAdminRole } from '@/lib/auth/roles';
import { listXvIdealPolls, XV_IDEAL_MIGRATION, type XvIdealListing } from '@/lib/server/xvIdeal';
import XvIdealClient from './XvIdealClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ groupKey: string }> };

const KEY = /^[a-z0-9][a-z0-9-]{0,80}$/;

async function load(groupKey: string, userId: string | null): Promise<XvIdealListing> {
    return listXvIdealPolls(groupKey, userId).catch((error: unknown): XvIdealListing => {
        console.error('[xv-ideal] polls read failed:', error);
        return { available: false, polls: [] };
    });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { groupKey } = await params;
    if (!KEY.test(groupKey)) return { title: 'XV Ideal' };
    const { polls } = await load(groupKey, null);
    const title = polls[0]?.title ?? 'XV Ideal';
    const canonicalPath = `/xv-ideal/${groupKey}`;
    const description = `${title}: elegí tu jugador en cada una de las 15 camisetas.`;
    return {
        title: `${title} | G22 Scores`,
        description,
        alternates: { canonical: canonicalPath },
        openGraph: {
            type: 'website',
            title: `${title} | G22 Scores`,
            description,
            siteName: 'G22 Scores',
            locale: 'es_AR',
            url: canonicalPath,
            images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'G22 Scores' }],
        },
    };
}

export default async function XvIdealPage({ params }: Props) {
    const { groupKey } = await params;
    if (!KEY.test(groupKey)) notFound();

    const { session, role } = await getServerAuthRole();
    const listing = await load(groupKey, session?.user?.id ?? null);
    // Sin tablas se avisa en pantalla; con tablas y sin votaciones, esa dirección no existe.
    if (listing.available && listing.polls.length === 0) notFound();

    return (
        <XvIdealClient
            groupKey={groupKey}
            isSuperAdmin={isSuperAdminRole(role)}
            available={listing.available}
            initialPolls={listing.polls}
            migration={XV_IDEAL_MIGRATION}
        />
    );
}
