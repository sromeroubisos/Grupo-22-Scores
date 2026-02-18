'use client';

import { useState } from 'react';
import { Trophy, Users, Star, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import styles from './favorites.module.css';
import { useFavorites, FavoriteItem } from '@/hooks/useFavorites';
import { EntityType } from '@/lib/types/user';

type Tab = 'all' | 'league' | 'club';

const TABS: Array<{ id: Tab; label: string; icon: typeof Star; entityTypes: EntityType[] }> = [
    { id: 'all', label: 'Todos', icon: Star, entityTypes: [] },
    { id: 'league', label: 'Ligas', icon: Trophy, entityTypes: ['league', 'tournament'] },
    { id: 'club', label: 'Clubes', icon: Users, entityTypes: ['club'] },
];

export default function FavoritesPage() {
    const { favorites, hasMore, loading: favsLoading, error: favsError, toggleFavorite, loadMore, refresh } = useFavorites();
    const [activeTab, setActiveTab] = useState<Tab>('all');

    const filtered = activeTab === 'all'
        ? favorites
        : favorites.filter(f => TABS.find(t => t.id === activeTab)!.entityTypes.includes(f.entity_type));

    const tabCount = (tab: typeof TABS[number]) =>
        tab.id === 'all'
            ? favorites.length
            : favorites.filter(f => tab.entityTypes.includes(f.entity_type)).length;

    if (favsLoading && favorites.length === 0) {
        return (
            <div className={styles.page}>
                <div className={styles.loading}>
                    <Loader2 className="animate-spin" size={32} />
                    <p>Cargando tus seguidos...</p>
                </div>
            </div>
        );
    }

    if (favsError && favorites.length === 0) {
        return (
            <div className={styles.page}>
                <div className={styles.errorContainer}>
                    <AlertCircle size={48} color="var(--color-error)" />
                    <h3>¡Huy! Algo salió mal</h3>
                    <p>{favsError}</p>
                    <button className={styles.btnPrimary} onClick={() => refresh()}>
                        <RefreshCw size={18} />
                        Reintentar
                    </button>
                    <small style={{ marginTop: '16px', color: 'var(--color-text-secondary)' }}>
                        Asegúrate de haber aplicado las migraciones de SQL en Supabase.
                    </small>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.favoritesSection}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h1 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Siguiendo</h1>
                        {favsLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                                <Loader2 size={14} className="animate-spin" />
                                Sincronizando...
                            </div>
                        ) : (
                            <button
                                className={styles.linkButton}
                                onClick={() => refresh()}
                                style={{ fontSize: '13px', color: 'var(--color-accent)' }}
                            >
                                <RefreshCw size={14} />
                                Actualizar
                            </button>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className={styles.tabs}>
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <Icon size={16} />
                                    {tab.label} <span className={styles.tabCount}>({tabCount(tab)})</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* List */}
                    <div className={styles.favoritesList}>
                        {filtered.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Star size={48} className={styles.emptyIcon} />
                                <p>No tenés favoritos en esta categoría.</p>
                                <small>Marcá clubes o ligas con ⭐ para verlos acá.</small>
                            </div>
                        ) : (
                            <div className={styles.favoritesGrid}>
                                {filtered.map(fav => (
                                    <FavoriteCard
                                        key={`${fav.entity_type}-${fav.id}`}
                                        fav={fav}
                                        onRemove={() => toggleFavorite(fav)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Load more */}
                    {hasMore && (
                        <div style={{ textAlign: 'center', marginTop: '24px' }}>
                            {favsLoading ? (
                                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
                            ) : (
                                <button
                                    className={styles.btnSecondary}
                                    onClick={loadMore}
                                    style={{ minWidth: '160px' }}
                                >
                                    Ver más
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function FavoriteCard({ fav, onRemove }: { fav: FavoriteItem; onRemove: () => void }) {
    return (
        <div className={styles.favoriteCard}>
            <div className={styles.favoriteContent}>
                {fav.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fav.logo_url} alt={fav.name} className={styles.favoriteImage} />
                ) : (
                    <div
                        className={styles.favoriteIconPlaceholder}
                        style={{ background: fav.color ?? 'var(--color-bg-tertiary)' }}
                    >
                        {fav.entity_type === 'club' ? <Users size={20} /> : <Trophy size={20} />}
                    </div>
                )}

                <div className={styles.favoriteInfo}>
                    <div className={styles.favoriteName}>{fav.name}</div>
                    <div className={styles.favoriteMeta}>{fav.type_label}</div>
                </div>

                <button
                    className={styles.favoriteAction}
                    onClick={onRemove}
                    aria-label={`Quitar ${fav.name} de favoritos`}
                    title="Quitar de favoritos"
                >
                    <Star size={18} fill="var(--color-accent)" color="var(--color-accent)" />
                </button>
            </div>
        </div>
    );
}
