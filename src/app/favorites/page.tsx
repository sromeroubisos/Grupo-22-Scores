'use client';

import Link from 'next/link';
import { Shield, Star, Trophy } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { FAVORITES_DISABLED_MESSAGE, FAVORITES_ENABLED } from '@/lib/favorites/config';

import styles from './favorites.module.css';

function getFavoriteHref(entityType: string, entityId: string): string {
    if (entityType === 'club') {
        return `/clubs/${entityId}`;
    }

    return `/tournaments/${entityId}`;
}

function FavoriteIcon({ entityType }: { entityType: string }) {
    if (entityType === 'club') {
        return <Shield size={20} />;
    }

    return <Trophy size={20} />;
}

export default function FavoritesPage() {
    const { favorites, loading, error, toggleFavorite } = useFavorites();

    if (!FAVORITES_ENABLED) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.favoritesSection}>
                        <div className={styles.emptyState}>
                            <Star size={48} className={styles.emptyIcon} />
                            <p>{FAVORITES_DISABLED_MESSAGE}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.favoritesSection}>
                    <div className={styles.favoriteHeader}>
                        <div>
                            <h1 className={styles.sectionTitle}>Siguiendo</h1>
                            <p className={styles.favoriteDate}>
                                Torneos y clubes que queres tener a mano en la app.
                            </p>
                        </div>
                    </div>

                    {loading ? <div className={styles.loading}>Cargando seguidos...</div> : null}

                    {!loading && error ? (
                        <div className={styles.errorContainer}>
                            <h3>No se pudieron cargar tus seguidos</h3>
                            <p>{error}</p>
                        </div>
                    ) : null}

                    {!loading && !error && favorites.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Star size={48} className={styles.emptyIcon} />
                            <p>{FAVORITES_DISABLED_MESSAGE}</p>
                            <small>Segui torneos o clubes desde el home y las paginas de detalle.</small>
                        </div>
                    ) : null}

                    {!loading && !error && favorites.length > 0 ? (
                        <div className={styles.favoritesGrid}>
                            {favorites.map((favorite) => (
                                <div key={`${favorite.entity_type}:${favorite.id}`} className={styles.favoriteCard}>
                                    <Link
                                        href={getFavoriteHref(favorite.entity_type, favorite.id)}
                                        className={styles.favoriteContent}
                                    >
                                        {favorite.logo_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={favorite.logo_url}
                                                alt={favorite.name}
                                                className={styles.favoriteImage}
                                            />
                                        ) : (
                                            <div className={styles.favoriteIconPlaceholder}>
                                                <FavoriteIcon entityType={favorite.entity_type} />
                                            </div>
                                        )}

                                        <div className={styles.favoriteInfo}>
                                            <div className={styles.favoriteType}>{favorite.type_label}</div>
                                            <div className={styles.favoriteName}>{favorite.name}</div>
                                            <div className={styles.favoriteMeta}>
                                                {new Date(favorite.created_at).toLocaleDateString('es-AR')}
                                            </div>
                                        </div>
                                    </Link>

                                    <button
                                        type="button"
                                        className={styles.favoriteAction}
                                        aria-label={`Dejar de seguir ${favorite.name}`}
                                        title="Dejar de seguir"
                                        onClick={() => {
                                            void toggleFavorite({
                                                id: favorite.id,
                                                entity_type: favorite.entity_type,
                                                name: favorite.name,
                                                logo_url: favorite.logo_url,
                                                type_label: favorite.type_label,
                                                forceIsFavorite: false,
                                            });
                                        }}
                                    >
                                        <Star size={16} fill="currentColor" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
