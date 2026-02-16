'use client';

import { useMemo, useState } from 'react';
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
    Tag
} from 'lucide-react';

type FolderType = 'all' | 'rugby' | 'hockey' | 'football' | 'global' | 'tournament' | 'club';

export default function NoticiasPage() {
    const [activeFolder, setActiveFolder] = useState<FolderType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [tick, setTick] = useState(0); // Force refresh

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

    const handleCreate = () => {
        if (!formData.title) return;

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
        setTick(t => t + 1);
        setIsCreatorOpen(false);
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

    const stats = useMemo(() => {
        return {
            total: db.news.length,
            published: db.news.filter(n => n.status === 'published').length,
            drafts: db.news.filter(n => n.status === 'draft').length
        };
    }, [tick]);

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
            {/* Header */}
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Comunicacion</p>
                    <h1>Noticias</h1>
                </div>
                <div className={styles.statusSync}>
                    <div className={styles.statusPill}>
                        <span className={styles.statusIndicator}></span>
                        CMS: ONLINE
                    </div>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => setIsCreatorOpen(true)}
                    >
                        <Plus size={16} /> Crear noticia
                    </button>
                </div>
            </header>

            {/* Folder Navigation & Filters */}
            <div className={styles.slab} style={{ marginBottom: 24 }}>
                <div className={styles.slabHeader}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        {folders.map(f => (
                            <button
                                key={f.id}
                                className={styles.btn}
                                style={{
                                    background: activeFolder === f.id ? 'var(--basalt-800)' : 'transparent',
                                    border: activeFolder === f.id ? '1px solid var(--magma-primary)' : '1px solid transparent',
                                    color: activeFolder === f.id ? '#fff' : 'var(--basalt-400)'
                                }}
                                onClick={() => setActiveFolder(f.id as FolderType)}
                            >
                                <f.icon size={14} />
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div className={styles.filterInput} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
                            <Search size={14} style={{ color: '#666', marginRight: 8 }} />
                            <input
                                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none' }}
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className={styles.tectonicGrid}>
                {filteredNews.map((item) => (
                    <div key={item.id} className={`${styles.slab} ${styles.col4}`} style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Image Preview */}
                        <div
                            style={{
                                height: 160,
                                background: `url(${item.imageUrl}) center/cover no-repeat`,
                                borderRadius: 4,
                                marginBottom: 16,
                                position: 'relative'
                            }}
                        >
                            <span
                                className={styles.badge}
                                style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.8)' }}
                            >
                                {item.status}
                            </span>
                        </div>

                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span className={styles.rowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Tag size={12} /> {item.scope}
                                </span>
                                <span className={styles.rowMeta}>{new Date(item.publishedAt!).toLocaleDateString()}</span>
                            </div>
                            <h3 className={styles.cardTitle} style={{ fontSize: 16, marginBottom: 8 }}>{item.title}</h3>
                            <p className={styles.newsBody} style={{ marginBottom: 16 }}>
                                {item.summary || item.content.substring(0, 100) + '...'}
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className={styles.btn} style={{ flex: 1, justifyContent: 'center' }}>Editar</button>
                            <button className={styles.btn} style={{ justifyContent: 'center', padding: '10px' }}>
                                <MoreVertical size={16} />
                            </button>
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
                            <h2 className={styles.slabTitle}>Crear Noticia</h2>
                            <button className={styles.btn} onClick={() => setIsCreatorOpen(false)}>Cerrar</button>
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
                                <button className={styles.btn} onClick={() => setIsCreatorOpen(false)}>Cancelar</button>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleCreate}>Publicar Noticia</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
