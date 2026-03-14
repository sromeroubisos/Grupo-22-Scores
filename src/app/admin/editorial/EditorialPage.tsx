'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { EditorialHeader } from '../components/EditorialHeader';
import { newsService, type NewsItem } from '@/lib/services/newsService';
import { Image as ImageIcon, Trash2, Globe, Trophy, Users, Upload, X } from 'lucide-react';
import styles from '../styles/editorial.module.css';
import { useSport } from '@/context/SportContext';
import { CMSSelect } from '../components/CMSSelect';

interface EditorialPageProps {
    initialData?: NewsItem;
}

export default function EditorialPage({ initialData }: EditorialPageProps) {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;

    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<any>(initialData || {
        title: '',
        content: '',
        summary: '',
        image_url: '',
        status: 'draft',
        sport: 'rugby',
        scope: ''
    });
    const [uploadMode, setUploadMode] = useState<'upload' | 'url'>('upload');
    const [urlInput, setUrlInput] = useState(initialData?.image_url || '');
    const [isUploading, setIsUploading] = useState(false);

    const [tagInput, setTagInput] = useState('');
    const { activeSports } = useSport();

    const handleImageClick = () => {
        if (uploadMode === 'upload') {
            fileInputRef.current?.click();
        }
    };

    const handleLoadUrl = () => {
        if (!urlInput) {
            alert('Por favor, ingresa una URL');
            return;
        }
        
        try {
            // Check if it's a valid URL
            new URL(urlInput);
            setFormData({ ...formData, image_url: urlInput });
        } catch (error) {
            alert('La URL ingresada no es válida. Asegúrate de incluir http:// o https://');
        }
    };

    const clearImage = () => {
        setFormData({ ...formData, image_url: '' });
        setUrlInput('');
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await newsService.uploadImage(file);
            setFormData({ ...formData, image_url: url });
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error al subir la imagen. Asegúrate de que el formato sea válido.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const tags = formData.scope ? formData.scope.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
            const newTag = tagInput.trim();
            if (!tags.includes(newTag)) {
                const updatedTags = [...tags, newTag].join(',');
                setFormData({ ...formData, scope: updatedTags });
            }
            setTagInput('');
        } else if (e.key === 'Backspace' && !tagInput && formData.scope) {
            const tags = formData.scope.split(',').map((t: string) => t.trim()).filter(Boolean);
            tags.pop();
            setFormData({ ...formData, scope: tags.join(',') });
        }
    };

    const removeTag = (tagToRemove: string) => {
        const tags = formData.scope ? formData.scope.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const updatedTags = tags.filter((t: string) => t !== tagToRemove).join(',');
        setFormData({ ...formData, scope: updatedTags });
    };

    const handleSave = async (forcePublish = false) => {
        if (!formData.title) {
            alert('El título es obligatorio');
            return;
        }

        setIsSaving(true);
        try {
            const status = forcePublish ? 'published' : (formData.status || 'draft');
            
            // Ensure scope is a clean comma-separated string
            const cleanTags = formData.scope ? 
                formData.scope.split(',').map((t: string) => t.trim()).filter(Boolean).join(',') : 
                '';
                
            const dataToSave = { ...formData, status, scope: cleanTags };

            if (id) {
                await newsService.update(id, dataToSave);
            } else {
                const response = await newsService.create(dataToSave as any);
                if (response.data?.id) {
                    router.push(`/admin/editorial/edit/${response.data.id}`);
                }
            }
            alert(forcePublish ? 'Noticia publicada con éxito' : 'Borrador guardado con éxito');
        } catch (error) {
            console.error('Error saving news:', error);
            alert(forcePublish ? 'Error al publicar la noticia' : 'Error al guardar el borrador');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        if (confirm('¿Estás seguro de que quieres eliminar esta noticia?')) {
            try {
                await newsService.delete(id);
                router.push('/admin/news');
            } catch (error) {
                console.error(error);
                alert('Error al eliminar');
            }
        }
    };

    return (
        <div className={styles.editorialPage}>
            <EditorialHeader
                title={formData.title || ''}
                status={formData.status as any}
                isSaving={isSaving}
                onSave={() => handleSave(false)}
                onPublish={() => handleSave(true)}
            />

            <main className={styles.editorialContainer}>
                {/* Main Column */}
                <section className={styles.mainContent}>
                    <input
                        className={styles.titleInput}
                        placeholder="Título de la noticia..."
                        value={formData.title || ''}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        autoFocus
                    />

                    <textarea
                        className={styles.bodyEditor}
                        placeholder="Comienza a escribir tu historia aquí..."
                        value={formData.content || ''}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                    />
                </section>

                {/* Sidebar Column */}
                <aside className={styles.sidebar}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                    <div className={styles.panel}>
                        <span className={styles.panelTitle}>Configuración</span>

                        <div className={styles.field}>
                            <label className={styles.label}>Resumen Editorial</label>
                            <textarea
                                className={styles.textarea}
                                placeholder="Breve descripción para listados..."
                                value={formData.summary || ''}
                                onChange={e => setFormData({ ...formData, summary: e.target.value })}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Modo de Imagen</label>
                            <CMSSelect 
                                value={uploadMode}
                                onChange={(val) => setUploadMode(val as any)}
                                options={[
                                    { id: 'upload', label: 'Subir Archivo' },
                                    { id: 'url', label: 'Pegar URL' }
                                ]}
                            />

                            <label className={styles.label}>Imagen de Portada</label>
                            
                            {uploadMode === 'url' && (
                                <div className={styles.urlInputGroup} style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
                                    <input 
                                        className={styles.input}
                                        placeholder="https://ejemplo.com/imagen.jpg"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                    />
                                    <button 
                                        className={`${styles.btn} ${styles.btnPrimary}`} 
                                        onClick={handleLoadUrl}
                                        style={{ padding: '0 12px' }}
                                    >
                                        Cargar
                                    </button>
                                </div>
                            )}

                            <div className={`${styles.imagePreview} ${isUploading ? styles.uploading : ''}`} onClick={handleImageClick}>
                                {isUploading ? (
                                    <div className={styles.imageEmpty}>
                                        <div className={styles.spinner}></div>
                                        <span>Subiendo...</span>
                                    </div>
                                ) : formData.image_url ? (
                                    <>
                                        <img src={formData.image_url} alt="Portada" />
                                        <div className={styles.imageOverlay}>
                                            <button className={styles.overlayBtn} onClick={(e) => { e.stopPropagation(); clearImage(); }}>
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
                        <span className={styles.panelTitle}>Clasificación</span>

                        <div className={styles.field}>
                            <label className={styles.label}>Etiquetas</label>
                            <div className={styles.tagsContainer}>
                                {formData.scope?.split(',').map((t: string) => t.trim()).filter(Boolean).map((tag: string) => (
                                    <span key={tag} className={styles.tag}>
                                        {tag}
                                        <X size={12} className={styles.tagDelete} onClick={() => removeTag(tag)} />
                                    </span>
                                ))}
                                <input
                                    className={styles.tagInput}
                                    placeholder="Añadir etiqueta..."
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={handleAddTag}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Deporte</label>
                            <CMSSelect
                                value={formData.sport || 'rugby'}
                                onChange={val => setFormData({ ...formData, sport: val })}
                                options={activeSports.map(s => ({
                                    id: s.id,
                                    label: s.nameEs || s.name
                                }))}
                            />
                        </div>
                    </div>

                    {id && (
                        <div className={styles.panel} style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                            <span className={styles.panelTitle} style={{ color: '#ef4444' }}>Zona Peligrosa</span>
                            <button
                                className={`${styles.btn} ${styles.btnDanger}`}
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleDelete}
                            >
                                <Trash2 size={16} />
                                Eliminar Noticia
                            </button>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}
