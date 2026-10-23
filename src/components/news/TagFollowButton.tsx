'use client';

// El botón de cada fila de "Categorías": Seguir / Siguiendo.

import { useFollowedTags } from '@/lib/news/followedTags';

import styles from './TagFollowButton.module.css';

export default function TagFollowButton({ tag }: { tag: string }) {
    const { followed, toggle } = useFollowedTags();
    const following = followed.includes(tag);

    return (
        <button
            type="button"
            className={`${styles.button} ${following ? styles.following : ''}`}
            aria-pressed={following}
            aria-label={following ? `Dejar de seguir ${tag}` : `Seguir ${tag}`}
            onClick={() => toggle(tag)}
        >
            {following ? 'Siguiendo' : 'Seguir'}
        </button>
    );
}
