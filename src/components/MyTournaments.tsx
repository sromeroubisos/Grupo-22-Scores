'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import {
    readRecentTournaments,
    RECENT_TOURNAMENTS_EVENT,
    type RecentTournament,
} from '@/lib/recentTournaments';
import styles from './MyTournaments.module.css';

/**
 * "Mis torneos" + "Vistos hace poco": lo que la persona ya eligió, a un toque.
 *
 * Es la respuesta al reclamo central de la auditoría mobile: "no encuentro
 * mis torneos". Va arriba del Inicio, arriba de Torneos y como cuerpo de la
 * pestaña Mis torneos, siempre con la misma forma: cada torneo seguido trae
 * sus tres accesos —Resultados, Fixture, Tabla— para no tener que entrar y
 * buscar la pestaña.
 */

type Variant = 'home' | 'directory' | 'page';

type Props = {
    variant: Variant;
};

type TournamentCard = {
    id: string;
    name: string;
    href: string;
    logoUrl: string | null;
};

const QUICK_TABS = [
    { tab: 'results', label: 'Resultados' },
    { tab: 'fixtures', label: 'Fixture' },
    { tab: 'standings', label: 'Tabla' },
] as const;

function withTab(href: string, tab: string): string {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    params.set('tab', tab);
    return `${path}?${params.toString()}`;
}

function fallbackHref(id: string, name: string): string {
    return `/tournaments/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`;
}

function useRecentTournaments(): RecentTournament[] {
    const [recent, setRecent] = useState<RecentTournament[]>([]);

    useEffect(() => {
        const load = () => setRecent(readRecentTournaments());
        load();
        window.addEventListener(RECENT_TOURNAMENTS_EVENT, load);
        window.addEventListener('storage', load);
        return () => {
            window.removeEventListener(RECENT_TOURNAMENTS_EVENT, load);
            window.removeEventListener('storage', load);
        };
    }, []);

    return recent;
}

function Crest({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
    if (logoUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" width={size} height={size} className={styles.crest} loading="lazy" />
        );
    }
    return (
        <span className={styles.crestFallback} style={{ width: size, height: size }} aria-hidden="true">
            {name.trim().charAt(0).toUpperCase()}
        </span>
    );
}

export default function MyTournaments({ variant }: Props) {
    const { favorites, loading, toggleLeagueFavorite } = useFavorites();
    const recent = useRecentTournaments();
    // Todo lo que muestra vive en el teléfono (localStorage) o en la sesión:
    // el servidor no lo sabe. Se dibuja recién montado, o el HTML del servidor
    // no coincide con el del cliente y React descarta el árbol entero.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const followed: TournamentCard[] = useMemo(() => (
        favorites
            .filter((item) => item.entity_type === 'league' || item.entity_type === 'tournament')
            .map((item) => {
                const seen = recent.find((entry) => entry.id === item.id);
                return {
                    id: item.id,
                    name: item.name,
                    href: seen?.href ?? fallbackHref(item.id, item.name),
                    logoUrl: item.logo_url ?? seen?.logoUrl ?? null,
                };
            })
    ), [favorites, recent]);

    const followedIds = useMemo(() => new Set(followed.map((item) => item.id)), [followed]);
    const recentOnly = useMemo(
        () => recent.filter((item) => !followedIds.has(item.id)).slice(0, variant === 'home' ? 4 : 6),
        [followedIds, recent, variant],
    );

    if (!FAVORITES_ENABLED || !mounted) return null;

    const isEmpty = followed.length === 0 && recentOnly.length === 0;

    // En Torneos, sin nada que mostrar, el bloque no ocupa lugar: la lista de
    // países ya es el camino. En Inicio y en la pestaña, el vacío enseña qué hacer.
    if (isEmpty && variant === 'directory') return null;
    if (isEmpty && loading) return null;

    const headingId = `my-tournaments-${variant}`;

    return (
        <section className={`${styles.root} ${styles[variant]}`} aria-labelledby={headingId}>
            {isEmpty ? (
                <div className={styles.empty}>
                    <h2 id={headingId} className={styles.emptyTitle}>
                        Elegí tu torneo para tenerlo siempre acá
                    </h2>
                    <p className={styles.emptyText}>
                        Entrá a un torneo y tocá <strong>☆ Seguir</strong>. No hace falta crear una cuenta.
                    </p>
                    <Link href="/tournaments" className={styles.emptyButton}>Buscar mi torneo</Link>
                </div>
            ) : (
                <>
                    {followed.length > 0 ? (
                        <div className={styles.block}>
                            <div className={styles.blockHeader}>
                                {/* En la pestaña, el h1 ya dice "Mis torneos". */}
                                <h2 id={headingId} className={styles.title}>
                                    {variant === 'page' ? 'Torneos que seguís' : 'Mis torneos'}
                                </h2>
                                {variant !== 'page' ? (
                                    <Link href="/favorites" className={styles.seeAll}>Ver todos</Link>
                                ) : null}
                            </div>
                            <ul className={styles.cards}>
                                {(variant === 'home' ? followed.slice(0, 4) : followed).map((item) => (
                                    <li key={item.id} className={styles.card}>
                                        <div className={styles.cardTop}>
                                            <Link href={item.href} className={styles.cardMain}>
                                                <Crest name={item.name} logoUrl={item.logoUrl} size={36} />
                                                <span className={styles.cardName}>{item.name}</span>
                                                <span className={styles.chevron} aria-hidden="true">›</span>
                                            </Link>
                                            {variant === 'page' ? (
                                                <button
                                                    type="button"
                                                    className={styles.unfollow}
                                                    onClick={() => void toggleLeagueFavorite(item.id, {
                                                        name: item.name,
                                                        logo_url: item.logoUrl,
                                                        forceIsFavorite: false,
                                                    })}
                                                >
                                                    Dejar de seguir
                                                </button>
                                            ) : null}
                                        </div>
                                        <nav className={styles.quick} aria-label={`Accesos de ${item.name}`}>
                                            {QUICK_TABS.map((quick) => (
                                                <Link key={quick.tab} href={withTab(item.href, quick.tab)} className={styles.quickLink}>
                                                    {quick.label}
                                                </Link>
                                            ))}
                                        </nav>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {recentOnly.length > 0 ? (
                        <div className={styles.block}>
                            <div className={styles.blockHeader}>
                                {followed.length === 0 ? (
                                    <h2 id={headingId} className={styles.title}>Vistos hace poco</h2>
                                ) : (
                                    <h3 className={styles.subtitle}>Vistos hace poco</h3>
                                )}
                            </div>
                            <ul className={styles.recentList}>
                                {recentOnly.map((item) => (
                                    <li key={item.id}>
                                        <Link href={item.href} className={styles.recentItem}>
                                            <Crest name={item.name} logoUrl={item.logoUrl ?? null} size={28} />
                                            <span className={styles.recentName}>{item.name}</span>
                                            <span className={styles.chevron} aria-hidden="true">›</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            {followed.length === 0 && variant !== 'directory' ? (
                                <p className={styles.tip}>
                                    Para tener un torneo fijo acá, entrá y tocá <strong>☆ Seguir</strong>.
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
}
