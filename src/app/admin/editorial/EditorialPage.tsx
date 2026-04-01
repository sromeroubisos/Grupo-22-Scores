'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Upload } from 'lucide-react';

import { getAllSports } from '@/lib/data/sports';
import {
    newsService,
    type NewsInsert,
    type NewsItem,
    type NewsUpdate,
} from '@/lib/services/newsService';

import { CMSSelect } from '../components/CMSSelect';
import { EditorialHeader } from '../components/EditorialHeader';
import styles from '../styles/editorial.module.css';

type NewsScope = 'global' | 'tournament' | 'club' | 'union';
type NewsStatus = 'draft' | 'published' | 'archived';

type NewsFormData = {
    title: string;
    content: string;
    summary: string;
    image_url: string;
    scope: NewsScope;
    scope_id: string;
    sport: string;
    status: NewsStatus;
};

const SCOPE_OPTIONS: Array<{ id: NewsScope; label: string }> = [
    { id: 'global', label: 'Global' },
    { id: 'tournament', label: 'Torneo' },
    { id: 'club', label: 'Club' },
    { id: 'union', label: 'Union' },
];

const STATUS_OPTIONS: Array<{ id: NewsStatus; label: string }> = [
    { id: 'draft', label: 'Borrador' },
    { id: 'published', label: 'Publicado' },
    { id: 'archived', label: 'Archivado' },
];

const SPORT_OPTIONS = getAllSports()
    .filter((sport) => sport.isActive && !sport.groupKey)
    .map((sport) => ({
        id: sport.id,
        label: sport.nameEs || sport.name,
    }));

const DEFAULT_SPORT = SPORT_OPTIONS[0]?.id || 'rugby';

function normalizeScope(value: string | null | undefined): NewsScope {
    if (value === 'tournament' || value === 'club' || value === 'union') {
        return value;
    }

    return 'global';
}

function normalizeStatus(value: string | null | undefined): NewsStatus {
    if (value === 'published' || value === 'archived') {
        return value;
    }

    return 'draft';
}

function normalizeFormData(initialData?: NewsItem): NewsFormData {
    return {
        title: initialData?.title || '',
        content: initialData?.content || '',
        summary: initialData?.summary || '',
        image_url: initialData?.image_url || '',
        scope: normalizeScope(initialData?.scope),
        scope_id: initialData?.scope_id || '',
        sport: initialData?.sport || DEFAULT_SPORT,
        status: normalizeStatus(initialData?.status),
    };
}

function buildNewsPayload(formData: NewsFormData, forcePublish: boolean): NewsInsert {
    const nextStatus: NewsStatus = forcePublish ? 'published' : formData.status;

    return {
        title: formData.title.trim(),
        content: formData.content.trim() || null,
        summary: formData.summary.trim() || null,
        image_url: formData.image_url.trim() || null,
        scope: formData.scope,
        scope_id: formData.scope === 'global' ? null : formData.scope_id.trim(),
        sport: formData.sport || DEFAULT_SPORT,
        status: nextStatus,
    };
}

interface EditorialPageProps {
    initialData?: NewsItem;
}

export default function EditorialPage({ initialData }: EditorialPageProps) {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string | undefined;

    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMode, setUploadMode] = useState<'upload' | 'url'>('upload');
    const [urlInput, setUrlInput] = useState(initialData?.image_url || '');
    const [formData, setFormData] = useState<NewsFormData>(() => normalizeFormData(initialData));

    const fileInputRef = useRef<HTMLInputElement>(null);

    const requiresScopeId = formData.scope !== 'global';
    const scopeTargetLabel = useMemo(() => {
        switch (formData.scope) {
            case 'tournament':
                return 'ID del torneo';
            case 'club':
                return 'ID del club';
            case 'union':
                return 'ID de la union';
            default:
                return 'ID del alcance';
        }
    }, [formData.scope]);

    const handleImageClick = () => {
        if (uploadMode === 'upload') {
            fileInputRef.current?.click();
        }
    };

    const handleLoadUrl = () => {
        if (!urlInput.trim()) {
            alert('Por favor, ingresa una URL');
            return;
        }

        try {
            new URL(urlInput);
            setFormData((current) => ({ ...current, image_url: urlInput.trim() }));
        } catch {
            alert('La URL ingresada no es valida. Asegurate de incluir http:// o https://');
        }
    };

    const clearImage = () => {
        setFormData((current) => ({ ...current, image_url: '' }));
        setUrlInput('');
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);

        try {
            const url = await newsService.uploadImage(file);
            setFormData((current) => ({ ...current, image_url: url }));
        } catch (error) {
            console.error('Upload error:', error);
            alert(error instanceof Error ? error.message : 'Error al subir la imagen');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const validateForm = () => {
        if (!formData.title.trim()) {
            return 'El titulo es obligatorio';
        }

        if (requiresScopeId && !formData.scope_id.trim()) {
            return `El campo "${scopeTargetLabel}" es obligatorio para este alcance`;
        }

        return null;
    };

    const persistNews = async ({
        forcePublish = false,
        showFeedback = true,
        redirectOnCreate = true,
    }: {
        forcePublish?: boolean;
        showFeedback?: boolean;
        redirectOnCreate?: boolean;
    }) => {
        const validationError = validateForm();
        if (validationError) {
            throw new Error(validationError);
        }

        setIsSaving(true);

        try {
            const payload = buildNewsPayload(formData, forcePublish);
            let savedNews: NewsItem | undefined;

            if (id) {
                const response = await newsService.update(id, payload as NewsUpdate);
                savedNews = response.data;
            } else {
                const response = await newsService.create(payload);
                savedNews = response.data;

                if (savedNews?.id) {
                    setFormData(normalizeFormData(savedNews));
                    if (redirectOnCreate) {
                        router.replace(`/admin/editorial/edit/${savedNews.id}`);
                    }
                }
            }

            if (savedNews) {
                setFormData(normalizeFormData(savedNews));
            }

            if (showFeedback) {
                alert(forcePublish ? 'Noticia publicada con exito' : 'Borrador guardado con exito');
            }

            return savedNews;
        } catch (error) {
            console.error('Error saving news:', error);
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async (forcePublish = false) => {
        try {
            await persistNews({ forcePublish });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Error al guardar la noticia');
        }
    };

    const handlePreview = async () => {
        const previewWindow = window.open('', '_blank');

        try {
            const savedNews = await persistNews({
                forcePublish: false,
                showFeedback: false,
                redirectOnCreate: true,
            });

            const previewId = savedNews?.id || id;
            if (!previewId) {
                throw new Error('No se pudo generar la vista previa');
            }

            const previewUrl = `/noticias/${previewId}`;

            if (previewWindow) {
                previewWindow.location.href = previewUrl;
            } else {
                window.open(previewUrl, '_blank');
            }
        } catch (error) {
            if (previewWindow) {
                previewWindow.close();
            }
            alert(error instanceof Error ? error.message : 'No se pudo abrir la vista previa');
        }
    };

    const handleDelete = async () => {
        if (!id) return;

        if (!confirm('Estas seguro de que quieres eliminar esta noticia?')) {
            return;
        }

        try {
            await newsService.delete(id);
            router.replace('/noticias');
        } catch (error) {
            console.error('Error deleting news:', error);
            alert(error instanceof Error ? error.message : 'Error al eliminar la noticia');
        }
    };

    return (
        <div className={styles.editorialPage}>
            <EditorialHeader
                title={formData.title}
                status={formData.status}
                isSaving={isSaving}
                onSave={() => handleSave(false)}
                onPublish={() => handleSave(true)}
                canPreview
                onPreview={handlePreview}
            />

            <main className={styles.editorialContainer}>
                <section className={styles.mainContent}>
                    <input
                        className={styles.titleInput}
                        placeholder="Titulo de la noticia..."
                        value={formData.title}
                        onChange={(event) =>
                            setFormData((current) => ({ ...current, title: event.target.value }))
                        }
                        autoFocus
                    />

                    <textarea
                        className={styles.bodyEditor}
                        placeholder="Comienza a escribir tu historia aqui..."
                        value={formData.content}
                        onChange={(event) =>
                            setFormData((current) => ({ ...current, content: event.target.value }))
                        }
                    />
                </section>

                <aside className={styles.sidebar}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleFileChange}
                    />

                    <div className={styles.panel}>
                        <span className={styles.panelTitle}>Configuracion</span>

                        <div className={styles.field}>
                            <label className={styles.label}>Resumen editorial</label>
                            <textarea
                                className={styles.textarea}
                                placeholder="Breve descripcion para listados..."
                                value={formData.summary}
                                onChange={(event) =>
                                    setFormData((current) => ({ ...current, summary: event.target.value }))
                                }
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Modo de imagen</label>
                            <CMSSelect
                                value={uploadMode}
                                onChange={(value) => setUploadMode(value as 'upload' | 'url')}
                                options={[
                                    { id: 'upload', label: 'Subir archivo' },
                                    { id: 'url', label: 'Pegar URL' },
                                ]}
                            />

                            <label className={styles.label}>Imagen de portada</label>

                            {uploadMode === 'url' && (
                                <div
                                    className={styles.urlInputGroup}
                                    style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}
                                >
                                    <input
                                        className={styles.input}
                                        placeholder="https://ejemplo.com/imagen.jpg"
                                        value={urlInput}
                                        onChange={(event) => setUrlInput(event.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnPrimary}`}
                                        onClick={handleLoadUrl}
                                        style={{ padding: '0 12px' }}
                                    >
                                        Cargar
                                    </button>
                                </div>
                            )}

                            <div
                                className={`${styles.imagePreview} ${isUploading ? styles.uploading : ''}`}
                                onClick={handleImageClick}
                            >
                                {isUploading ? (
                                    <div className={styles.imageEmpty}>
                                        <div className={styles.spinner}></div>
                                        <span>Subiendo...</span>
                                    </div>
                                ) : formData.image_url ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={formData.image_url} alt="Portada" />
                                        <div className={styles.imageOverlay}>
                                            <button
                                                type="button"
                                                className={styles.overlayBtn}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    clearImage();
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className={styles.imageEmpty}>
                                        <Upload size={32} />
                                        <span>{uploadMode === 'upload' ? 'Haz clic para subir' : 'Sin imagen cargada'}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.panel}>
                        <span className={styles.panelTitle}>Clasificacion</span>

                        <div className={styles.field}>
                            <label className={styles.label}>Alcance</label>
                            <CMSSelect
                                value={formData.scope}
                                onChange={(value) =>
                                    setFormData((current) => ({
                                        ...current,
                                        scope: normalizeScope(value),
                                        scope_id: value === 'global' ? '' : current.scope_id,
                                    }))
                                }
                                options={SCOPE_OPTIONS}
                            />
                        </div>

                        {requiresScopeId && (
                            <div className={styles.field}>
                                <label className={styles.label}>{scopeTargetLabel}</label>
                                <input
                                    className={styles.input}
                                    placeholder={`Ingresa el ${scopeTargetLabel.toLowerCase()}`}
                                    value={formData.scope_id}
                                    onChange={(event) =>
                                        setFormData((current) => ({ ...current, scope_id: event.target.value }))
                                    }
                                />
                                <p className={styles.fieldHint}>
                                    Usa el ID interno de la entidad para asociar la noticia.
                                </p>
                            </div>
                        )}

                        <div className={styles.field}>
                            <label className={styles.label}>Estado</label>
                            <CMSSelect
                                value={formData.status}
                                onChange={(value) =>
                                    setFormData((current) => ({ ...current, status: normalizeStatus(value) }))
                                }
                                options={STATUS_OPTIONS}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Deporte</label>
                            <CMSSelect
                                value={formData.sport}
                                onChange={(value) =>
                                    setFormData((current) => ({ ...current, sport: value }))
                                }
                                options={SPORT_OPTIONS}
                            />
                        </div>
                    </div>

                    {id && (
                        <div className={styles.panel} style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                            <span className={styles.panelTitle} style={{ color: '#ef4444' }}>
                                Zona peligrosa
                            </span>
                            <button
                                type="button"
                                className={`${styles.btn} ${styles.btnDanger}`}
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleDelete}
                            >
                                <Trash2 size={16} />
                                Eliminar noticia
                            </button>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}
