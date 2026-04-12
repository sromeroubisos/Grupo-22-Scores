'use client';

import { Star } from 'lucide-react';
import { FAVORITES_DISABLED_MESSAGE } from '@/lib/favorites/config';

import styles from './favorites.module.css';

export default function FavoritesPage() {
    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.favoritesSection}>
                    <div className={styles.emptyState}>
                        <Star size={48} className={styles.emptyIcon} />
                        <p>{FAVORITES_DISABLED_MESSAGE}</p>
                        <small>Solo quedan activas las preferencias de deporte.</small>
                    </div>
                </div>
            </div>
        </div>
    );
}
