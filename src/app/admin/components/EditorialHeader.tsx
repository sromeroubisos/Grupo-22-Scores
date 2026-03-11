'use client';

import React from 'react';
import { ArrowLeft, Save, Eye, Send, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from '../styles/editorial.module.css';

interface EditorialHeaderProps {
    title: string;
    status: 'draft' | 'published' | 'archived';
    isSaving?: boolean;
    onSave: () => void;
    onPublish: () => void;
}

export const EditorialHeader = ({
    title,
    status,
    isSaving,
    onSave,
    onPublish
}: EditorialHeaderProps) => {
    const router = useRouter();

    return (
        <header className={styles.editorialHeader}>
            <div className={styles.headerLeft}>
                <button
                    className={styles.headerBackBtn}
                    onClick={() => router.push('/admin/news')}
                    title="Volver"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className={styles.headerInfo}>
                    <div className={`${styles.statusBadge} ${status === 'published' ? styles.statusPublished : styles.statusDraft}`}>
                        <div className={styles.statusIndicatorCircle} />
                        {status === 'published' ? 'Publicado' : 'Borrador'}
                    </div>
                    <span className={styles.headerTitle} title={title || 'Nueva Noticia'}>
                        {title || 'Nueva Noticia'}
                    </span>
                </div>
            </div>

            <div className={styles.headerRight}>
                <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={onSave}
                    disabled={isSaving}
                >
                    <Save size={16} />
                    <span className={styles.hideOnMobile}>{isSaving ? 'Guardando...' : 'Guardar borrador'}</span>
                </button>

                <button className={`${styles.btn} ${styles.btnSecondary} ${styles.hideOnMobile}`} title="Previsualizar">
                    <Eye size={16} />
                    <span>Preview</span>
                </button>

                <div className={`${styles.headerDivider} ${styles.hideOnMobile}`} />

                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={onPublish}
                    disabled={isSaving}
                >
                    <Send size={16} />
                    {status === 'published' ? (isSaving ? 'Actualizando...' : 'Actualizar') : (isSaving ? 'Publicando...' : 'Publicar noticia')}
                </button>

                <button className={`${styles.btn} ${styles.btnGhost} ${styles.hideOnMobile}`} title="Opciones">
                    <MoreHorizontal size={20} />
                </button>
            </div>
        </header>
    );
};
