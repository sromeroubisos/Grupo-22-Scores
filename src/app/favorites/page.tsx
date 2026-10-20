'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { useAuth } from '@/context/AuthContext';
import { useFavorites, type FavoriteItem } from '@/hooks/useFavorites';
import { getSportById } from '@/lib/data/sports';
import { FAVORITES_DISABLED_MESSAGE, FAVORITES_ENABLED } from '@/lib/favorites/config';
import type { SportId } from '@/lib/types';

import styles from './favorites.module.css';

const EDIT_HREF = '/onboarding/preferences?edit=true&returnTo=%2Ffavorites';

function getFavoriteHref(item: FavoriteItem): string {
    if (item.entity_type === 'club') return `/clubs/${encodeURIComponent(item.id)}`;

    // El nombre viaja en el enlace: un torneo externo (FlashScore/ESPN) pinta su título
    // enseguida en vez de quedarse en "Cargando…" si el proveedor tarda.
    return `/tournaments/${encodeURIComponent(item.id)}?name=${encodeURIComponent(item.name)}`;
}

function sportLabel(item: FavoriteItem): string | null {
    if (!item.sport_id) return null;
    const sport = getSportById(item.sport_id as SportId);
    return sport ? `${sport.icon} ${sport.nameEs}` : null;
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`;
}

function FavoriteRow({ item, onUnfollow }: { item: FavoriteItem; onUnfollow: (item: FavoriteItem) => void }) {
    const sport = sportLabel(item);
    return (
        <li className={styles.row}>
            <Link href={getFavoriteHref(item)} className={styles.rowLink}>
                {item.entity_type === 'club' ? (
                    <TeamLogo name={item.name} teamId={item.id} logoUrl={item.logo_url} className={styles.logo} size={44} radius="round" />
                ) : item.logo_url ? (
                    // Decorativo: el nombre ya está escrito al lado.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.logo_url} alt="" loading="lazy" className={styles.logo} />
                ) : (
                    <span className={`${styles.logo} ${styles.logoFallback}`} aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span>
                )}
                <span className={styles.rowText}>
                    <span className={styles.rowName}>{item.name}</span>
                    {sport ? <span className={styles.rowSub}>{sport}</span> : null}
                </span>
            </Link>
            <button
                type="button"
                className={styles.unfollow}
                aria-label={`Dejar de seguir ${item.name}`}
                title="Dejar de seguir"
                onClick={() => onUnfollow(item)}
            >
                <Star size={20} fill="currentColor" />
            </button>
        </li>
    );
}

export default function FavoritesPage() {
    const { user } = useAuth();
    const { favorites, ready, error, toggleFavorite, refresh } = useFavorites();

    if (!FAVORITES_ENABLED) {
        return (
            <main className={styles.page}>
                <div className={styles.empty}>
                    <span className={styles.emptyIcon}><Star size={28} /></span>
                    <h1 className={styles.emptyTitle}>{FAVORITES_DISABLED_MESSAGE}</h1>
                </div>
            </main>
        );
    }

    const leagues = favorites.filter((item) => item.entity_type !== 'club');
    const clubs = favorites.filter((item) => item.entity_type === 'club');

    const unfollow = (item: FavoriteItem) => {
        void toggleFavorite({
            id: item.id,
            entity_type: item.entity_type,
            name: item.name,
            logo_url: item.logo_url,
            type_label: item.type_label,
            forceIsFavorite: false,
        });
    };

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Mis favoritos</h1>
                    <p className={styles.summary}>
                        {!ready
                            ? 'Cargando…'
                            : favorites.length === 0
                                ? 'Todavía no seguís nada.'
                                : `${plural(leagues.length, 'competición', 'competiciones')} · ${plural(clubs.length, 'club', 'clubes')}`}
                    </p>
                </div>
                <div className={styles.actions}>
                    <Link href={EDIT_HREF} className={`${styles.btn} ${styles.btnPrimary}`}>Editar</Link>
                    <Link href="/tournaments" className={styles.btn}>Explorar</Link>
                </div>
            </header>

            {error ? (
                <div className={styles.notice} role="alert">
                    <span>No pudimos actualizar tus favoritos. Lo que ves puede estar desactualizado.</span>
                    <button type="button" className={styles.noticeBtn} onClick={() => void refresh()}>Reintentar</button>
                </div>
            ) : null}

            {!ready ? (
                <ul className={styles.list} aria-hidden="true">
                    {[0, 1, 2].map((index) => <li key={index} className={styles.skeleton} />)}
                </ul>
            ) : favorites.length === 0 ? (
                <div className={styles.empty}>
                    <span className={styles.emptyIcon}><Star size={28} /></span>
                    <h2 className={styles.emptyTitle}>{FAVORITES_DISABLED_MESSAGE}</h2>
                    <p className={styles.emptyText}>
                        Elegí tus competiciones y clubes para ver sus partidos primero, o seguilos con la estrella desde la portada y las fichas.
                    </p>
                    <Link href={EDIT_HREF} className={`${styles.btn} ${styles.btnPrimary}`}>Elegir mis favoritos</Link>
                </div>
            ) : (
                <>
                    {leagues.length > 0 && (
                        <section className={styles.section} aria-labelledby="fav-competitions">
                            <h2 id="fav-competitions" className={styles.sectionTitle}>Competiciones <span>{leagues.length}</span></h2>
                            <ul className={styles.list}>
                                {leagues.map((item) => <FavoriteRow key={`l-${item.id}`} item={item} onUnfollow={unfollow} />)}
                            </ul>
                        </section>
                    )}
                    {clubs.length > 0 && (
                        <section className={styles.section} aria-labelledby="fav-clubs">
                            <h2 id="fav-clubs" className={styles.sectionTitle}>Clubes <span>{clubs.length}</span></h2>
                            <ul className={styles.list}>
                                {clubs.map((item) => <FavoriteRow key={`c-${item.id}`} item={item} onUnfollow={unfollow} />)}
                            </ul>
                        </section>
                    )}
                </>
            )}

            {ready && !user ? (
                <p className={styles.deviceNote}>
                    Tus favoritos quedan guardados en este dispositivo. <Link href="/register">Creá una cuenta</Link> para llevarlos a otro.
                </p>
            ) : null}
        </main>
    );
}
