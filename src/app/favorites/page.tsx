'use client';

import Link from 'next/link';
import { Shield, Star } from 'lucide-react';
import MyTournaments from '@/components/MyTournaments';
import TeamLogo from '@/components/TeamLogo';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/hooks/useFavorites';
import { FAVORITES_DISABLED_MESSAGE, FAVORITES_ENABLED } from '@/lib/favorites/config';

import styles from './favorites.module.css';

/**
 * "Mis torneos": la pestaña fija de lo que la persona sigue.
 *
 * Antes era "Siguiendo" (o "Mis Seguidos", o "Favoritos", según dónde se
 * mirara), vivía detrás del avatar y sin cuenta no existía. Ahora tiene
 * pestaña propia, un solo nombre, y funciona sin cuenta: lo seguido queda
 * guardado en el teléfono y se sube a la cuenta al iniciar sesión.
 */
export default function FavoritesPage() {
    const { user, login } = useAuth();
    const { favorites, loading, error, toggleFavorite } = useFavorites();
    const clubs = favorites.filter((item) => item.entity_type === 'club' || item.entity_type === 'team');

    if (!FAVORITES_ENABLED) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.emptyState}>
                        <Star size={48} className={styles.emptyIcon} />
                        <p>{FAVORITES_DISABLED_MESSAGE}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.myContainer}>
                <header className={styles.myHeader}>
                    <h1 className={styles.myTitle}>Mis torneos</h1>
                    <p className={styles.myLead}>
                        Los torneos y clubes que seguís, siempre a un toque.
                    </p>
                </header>

                {error ? (
                    <div className={styles.errorContainer} role="alert">
                        <h2>No se pudieron cargar tus torneos</h2>
                        <p>{error}</p>
                    </div>
                ) : null}

                <MyTournaments variant="page" />

                {clubs.length > 0 ? (
                    <section className={styles.clubsSection} aria-labelledby="mis-clubes">
                        <h2 id="mis-clubes" className={styles.myHeading}>Clubes que seguís</h2>
                        <ul className={styles.clubList}>
                            {clubs.map((club) => (
                                <li key={club.id} className={styles.clubRow}>
                                    <Link href={`/clubs/${club.id}`} className={styles.clubLink}>
                                        {club.logo_url || club.id ? (
                                            <TeamLogo
                                                name={club.name}
                                                teamId={club.id}
                                                logoUrl={club.logo_url}
                                                size={36}
                                                radius="round"
                                            />
                                        ) : (
                                            <Shield size={24} aria-hidden="true" />
                                        )}
                                        <span className={styles.clubName}>{club.name}</span>
                                    </Link>
                                    <button
                                        type="button"
                                        className={styles.clubUnfollow}
                                        onClick={() => {
                                            void toggleFavorite({
                                                id: club.id,
                                                entity_type: club.entity_type,
                                                name: club.name,
                                                logo_url: club.logo_url,
                                                type_label: club.type_label,
                                                forceIsFavorite: false,
                                            });
                                        }}
                                    >
                                        Dejar de seguir
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {!user && !loading ? (
                    <aside className={styles.accountNote}>
                        <p>
                            Lo que seguís se guarda en este teléfono. Si querés verlo también
                            en otro dispositivo, iniciá sesión y se pasa solo a tu cuenta.
                        </p>
                        <button
                            type="button"
                            className={styles.accountButton}
                            onClick={() => login('fan', '/favorites')}
                        >
                            Iniciar sesión
                        </button>
                    </aside>
                ) : null}
            </div>
        </div>
    );
}
