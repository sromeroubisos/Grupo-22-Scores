'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db, NewsItem } from '@/lib/mock-db';
import styles from '../page.module.css';
import {
    Plus,
    Filter,
    Search,
    Trophy,
    Users,
    Globe,
    MoreVertical,
    Calendar,
    Image as ImageIcon,
    FolderOpen,
    Tag,
    Trash2,
    Eye,
    EyeOff,
    Edit
} from 'lucide-react';

type FolderType = 'all' | 'rugby' | 'hockey' | 'football' | 'global' | 'tournament' | 'club';

export default function NoticiasPage() {
    const [activeFolder, setActiveFolder] = useState<FolderType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [tick, setTick] = useState(0); // Force refresh

    // Edit & Menu State
    const [editId, setEditId] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<NewsItem>>({
        title: '',
        summary: '',
        content: '',
        scope: 'global',
        sport: 'rugby',
        imageUrl: '',
        status: 'draft'
    });

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        if (activeMenuId) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [activeMenuId]);

    const handleSave = () => {
        if (!formData.title) return;

        if (editId) {
            // Update existing
            const index = db.news.findIndex(n => n.id === editId);
            if (index !== -1) {
                db.news[index] = {
                    ...db.news[index],
                    title: formData.title,
                    summary: formData.summary || '',
                    content: formData.content || '',
                    scope: formData.scope as any,
                    sport: formData.sport,
                    imageUrl: formData.imageUrl || db.news[index].imageUrl,
                    status: formData.status as any
                };
            }
        } else {
            // Create new
            const newItem: NewsItem = {
                id: `n-${Date.now()}`,
                title: formData.title || 'Sin titulo',
                summary: formData.summary || '',
                content: formData.content || '',
                scope: formData.scope as any,
                sport: formData.sport,
                imageUrl: formData.imageUrl || `https://placehold.co/600x400/22c55e/ffffff?text=${formData.title?.substring(0, 3).toUpperCase()}`,
                authorId: 'u1', // Mock user
                status: formData.status as any || 'draft',
                publishedAt: new Date().toISOString()
            };
            db.news.unshift(newItem);
        }

        setTick(t => t + 1);
        closeCreator();
    };

    const closeCreator = () => {
        setIsCreatorOpen(false);
        setEditId(null);
        setFormData({
            title: '',
            summary: '',
            content: '',
            scope: 'global',
            sport: 'rugby',
            imageUrl: '',
            status: 'draft'
        });
    };

    const handleEdit = (item: NewsItem) => {
        setFormData({
            title: item.title,
            summary: item.summary,
            content: item.content,
            scope: item.scope,
            sport: item.sport,
            imageUrl: item.imageUrl,
            status: item.status
        });
        setEditId(item.id);
        setIsCreatorOpen(true);
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('¿Estás seguro de que quieres eliminar esta noticia?')) {
            const index = db.news.findIndex(n => n.id === id);
            if (index !== -1) {
                db.news.splice(index, 1);
                setTick(t => t + 1);
            }
        }
        setActiveMenuId(null);
    };

    const handleToggleStatus = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = db.news.find(n => n.id === id);
        if (item) {
            item.status = item.status === 'published' ? 'draft' : 'published';
            setTick(t => t + 1);
        }
        setActiveMenuId(null);
    };

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const filteredNews = useMemo(() => {
        return db.news.filter(item => {
            // Search
            if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

            // Folder Filters
            if (activeFolder === 'all') return true;
            if (['rugby', 'hockey', 'football'].includes(activeFolder)) return item.sport === activeFolder;
            if (['global', 'tournament', 'club'].includes(activeFolder)) return item.scope === activeFolder;

            return true;
        });
    }, [activeFolder, searchQuery, tick]);

    const folders = [
        { id: 'all', label: 'Todas', icon: FolderOpen },
        { id: 'rugby', label: 'Rugby', icon: Trophy },
        { id: 'hockey', label: 'Hockey', icon: Trophy },
        { id: 'global', label: 'Global', icon: Globe },
        { id: 'tournament', label: 'Torneos', icon: Trophy },
        { id: 'club', label: 'Clubes', icon: Users },
    ];

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Mobile-Native Filter Bar */}
            <div className={styles.categoryBar}>
                <div className={styles.categoryScroll}>
                    {folders.map(f => (
                        <button
                            key={f.id}
                            className={`${styles.categoryChip} ${activeFolder === f.id ? styles.categoryChipActive : ''}`}
                            onClick={() => setActiveFolder(f.id as FolderType)}
                        >
                            {activeFolder === f.id && <f.icon size={12} style={{ marginRight: 4 }} />}
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Search Compact */}
                <div className={styles.compactSearch}>
                    <Search size={14} color="#666" />
                    <input
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Quick Actions Bar (Mobile Only) */}
            <div className={styles.mobileActionsBar}>
                <div className={styles.statusDot}>
                    <span className={styles.statusIndicator}></span> Online
                </div>
                <button className={styles.compactCreateBtn} onClick={() => setIsCreatorOpen(true)}>
                    <Plus size={14} /> Crear Noticia
                </button>
            </div>

            {/* Content Grid */}
            <div className={styles.tectonicGrid}>
                {filteredNews.map((item) => (
                    <div key={item.id} className={`${styles.slab} ${styles.newsCard}`}>
                        {/* Image Preview */}
                        <div
                            className={styles.newsImage}
                            style={{
                                backgroundImage: `url(${item.imageUrl})`,
                                backgroundPosition: 'center',
                                backgroundSize: 'cover',
                                backgroundRepeat: 'no-repeat'
                            }}
                        >
                            <span
                                className={styles.badge}
                                style={{
                                    position: 'absolute',
                                    top: 8,
                                    left: 8,
                                    background: item.status === 'published' ? 'var(--color-accent)' : '#f59e0b',
                                    color: item.status === 'published' ? '#fff' : '#000',
                                }}
                            >
                                {item.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
                            </span>
                        </div>

                        <div className={styles.newsContent}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span className={styles.rowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Tag size={12} /> {item.scope}
                                </span>
                                <span className={styles.rowMeta}>{new Date(item.publishedAt!).toLocaleDateString()}</span>
                            </div>
                            <h3 className={styles.newsTitle}>{item.title}</h3>
                            <p className={styles.newsBody}>
                                {item.summary || item.content.substring(0, 80) + '...'}
                            </p>

                            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                                <button
                                    className={`${styles.btn} ${styles.actionButton}`}
                                    onClick={() => handleEdit(item)}
                                >
                                    <Edit size={14} style={{ marginRight: 6 }} /> Editar
                                </button>
                                <div style={{ position: 'relative' }}>
                                    <button
                                        className={styles.btn}
                                        style={{ padding: '10px' }}
                                        onClick={(e) => toggleMenu(item.id, e)}
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {activeMenuId === item.id && (
                                        <div style={{
                                            position: 'absolute',
                                            right: 0,
                                            bottom: '100%',
                                            marginBottom: 8,
                                            background: 'var(--basalt-800)',
                                            border: '1px solid var(--surface-edge)',
                                            borderRadius: 8,
                                            padding: 4,
                                            minWidth: 160,
                                            zIndex: 50,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                        }}>
                                            <button
                                                className={styles.btn}
                                                style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent' }}
                                                onClick={(e) => handleToggleStatus(item.id, e)}
                                            >
                                                {item.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />}
                                                {item.status === 'published' ? 'Despublicar' : 'Publicar'}
                                            </button>
                                            <button
                                                className={styles.btn}
                                                style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', color: '#ff4d4d' }}
                                                onClick={(e) => handleDelete(item.id, e)}
                                            >
                                                <Trash2 size={14} /> Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Creator Modal */}
            {isCreatorOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className={styles.slab} style={{ width: 600, maxHeight: '90vh', overflowY: 'auto', background: '#0a0a0b' }}>
                        <div className={styles.slabHeader}>
                            <h2 className={styles.slabTitle}>{editId ? 'Editar Noticia' : 'Crear Noticia'}</h2>
                            <button className={styles.btn} onClick={closeCreator}>Cerrar</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label className={styles.slabLabel}>Titulo</label>
                                <input
                                    className={styles.filterInput}
                                    style={{ width: '100%' }}
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Titulo de la noticia"
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label className={styles.slabLabel}>Ambito</label>
                                    <select
                                        className={styles.filterInput}
                                        style={{ width: '100%', height: 40 }}
                                        value={formData.scope}
                                        onChange={e => setFormData({ ...formData, scope: e.target.value as any })}
                                    >
                                        <option value="global">Global</option>
                                        <option value="tournament">Torneo</option>
                                        <option value="club">Club</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={styles.slabLabel}>Deporte</label>
                                    <select
                                        className={styles.filterInput}
                                        style={{ width: '100%', height: 40 }}
                                        value={formData.sport}
                                        onChange={e => setFormData({ ...formData, sport: e.target.value })}
                                    >
                                        <option value="rugby">Rugby</option>
                                        <option value="hockey">Hockey</option>
                                        <option value="football">Futbol</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={styles.slabLabel}>Resumen</label>
                                <input
                                    className={styles.filterInput}
                                    style={{ width: '100%' }}
                                    value={formData.summary}
                                    onChange={e => setFormData({ ...formData, summary: e.target.value })}
                                    placeholder="Breve descripcion..."
                                />
                            </div>

                            <div>
                                <label className={styles.slabLabel}>Imagen URL</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <ImageIcon size={20} style={{ color: '#666' }} />
                                    <input
                                        className={styles.filterInput}
                                        style={{ flex: 1 }}
                                        value={formData.imageUrl}
                                        onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={styles.slabLabel}>Contenido</label>
                                <textarea
                                    className={styles.filterInput}
                                    style={{ width: '100%', minHeight: 150, fontFamily: 'monospace' }}
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    placeholder="Escribe el contenido aqui..."
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                                <button className={styles.btn} onClick={closeCreator}>Cancelar</button>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave}>
                                    {editId ? 'Guardar Cambios' : 'Publicar Noticia'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
