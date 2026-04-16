'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useSport } from '@/context/SportContext';
import MobileSectionTabs from '@/components/MobileSectionTabs';
import {
    Plus,
    Search,
    Trophy,
    Users,
    Globe,
    MoreVertical,
    FolderOpen,
    Tag,
    Trash2,
    Eye,
    EyeOff,
    Edit
} from 'lucide-react';

type FolderType = 'all' | 'rugby' | 'hockey' | 'football' | 'global' | 'tournament' | 'club';

export interface NewsItem {
    id: string;
    title: string;
    summary: string;
    content: string;
    published_at?: string;
    image_url?: string;
    author_id?: string;
    status: 'draft' | 'published' | 'archived';
    sport?: string;
    scope?: 'global' | 'tournament' | 'club' | 'union' | string;
}

interface NoticiasClientProps {
    initialNews: NewsItem[];
    canManageNews: boolean;
}

function buildNewsPreview(item: NewsItem) {
    const summary = item.summary?.trim();
    if (summary) {
        return summary;
    }

    const content = item.content?.trim();
    if (!content) {
        return 'Abrir para leer la noticia completa.';
    }

    return content.length > 120 ? `${content.slice(0, 117)}...` : content;
}

function formatPublishedAt(value?: string) {
    if (!value) {
        return 'Sin fecha';
    }

    return new Date(value).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function NoticiasClient({ initialNews, canManageNews }: NoticiasClientProps) {
    const router = useRouter();
    const { selectedSport } = useSport();
    const [news, setNews] = useState<NewsItem[]>(
        initialNews.map((item) => ({
            ...item,
            scope: item.scope || 'global',
            sport: item.sport || 'rugby',
        }))
    );
    const [activeFolder, setActiveFolder] = useState<FolderType>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        if (activeMenuId) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [activeMenuId]);

    const handleEdit = (item: NewsItem) => {
        router.push(`/admin/super/noticias/editar/${item.id}`);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Estas seguro de que quieres eliminar esta noticia?')) {
            try {
                const response = await fetch(`/api/news?id=${id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) throw new Error('Failed to delete');

                setNews((currentNews) => currentNews.filter((n) => n.id !== id));
            } catch (error) {
                console.error(error);
                alert('Error deleting item');
            }
        }
        setActiveMenuId(null);
    };

    const handleToggleStatus = async (item: NewsItem, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(null);

        const newStatus = item.status === 'published' ? 'draft' : 'published';
        try {
            const response = await fetch('/api/news', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, status: newStatus }),
            });

            if (!response.ok) throw new Error('Failed to update status');

            const payload = await response.json();
            const updatedItem = payload?.data as NewsItem | undefined;

            setNews((currentNews) =>
                currentNews.map((n) => (n.id === item.id
                    ? {
                        ...n,
                        ...(updatedItem || {}),
                        status: updatedItem?.status || newStatus,
                        published_at: updatedItem?.published_at ?? (newStatus === 'published' ? new Date().toISOString() : null),
                    }
                    : n))
            );
        } catch (error) {
            console.error(error);
            alert('Error updating status');
        }
    };

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const filteredNews = useMemo(() => {
        return news.filter((item) => {
            if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (activeFolder === 'all') return true;
            if (['rugby', 'hockey', 'football'].includes(activeFolder)) return (item.sport || 'rugby') === activeFolder;
            if (['global', 'tournament', 'club'].includes(activeFolder)) return (item.scope || 'global') === activeFolder;
            return true;
        });
    }, [activeFolder, searchQuery, news]);

    const folders = [
        { id: 'all', label: 'Todas', icon: FolderOpen },
        { id: 'rugby', label: 'Rugby', icon: Trophy },
        { id: 'hockey', label: 'Hockey', icon: Trophy },
        { id: 'global', label: 'Global', icon: Globe },
        { id: 'tournament', label: 'Torneos', icon: Trophy },
        { id: 'club', label: 'Clubes', icon: Users },
    ];

    return (
        <div className={styles.tectonicPage}>
            <div style={{ padding: '40px 24px 0' }}>
                <MobileSectionTabs
                    activeTab="news"
                    rankingsHref={`/rankings?sport=${encodeURIComponent(selectedSport.id)}`}
                />
            </div>

            <div className={styles.tectonicHeader} style={{ padding: '0 24px' }}>
                <div className={styles.headerInfo}>
                    <h1>Noticias & Editorial</h1>
                    <p>Ultimas novedades y comunicados oficiales</p>
                </div>

                {canManageNews && (
                    <div className={styles.statusSync}>
                        <div className={styles.statusPill}>
                            <span className={styles.statusIndicator}></span>
                            CMR ACTIVE
                        </div>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={() => router.push('/admin/super/noticias/nueva')}
                        >
                            <Plus size={14} /> Creacion
                        </button>
                    </div>
                )}
            </div>

            <div style={{ padding: '0 24px 40px' }}>
                <div className={styles.categoryBar}>
                    <div className={styles.categoryScroll}>
                        {folders.map((folder) => (
                            <button
                                key={folder.id}
                                type="button"
                                className={`${styles.categoryChip} ${activeFolder === folder.id ? styles.categoryChipActive : ''}`}
                                onClick={() => setActiveFolder(folder.id as FolderType)}
                            >
                                {activeFolder === folder.id && <folder.icon size={12} style={{ marginRight: 4 }} />}
                                {folder.label}
                            </button>
                        ))}
                    </div>

                    <div className={styles.compactSearch}>
                        <Search size={14} color="#666" />
                        <input
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.tectonicGrid}>
                    {filteredNews.length === 0 ? (
                        <div className={`${styles.slab} ${styles.col12}`} style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <p style={{ color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>NO HAY NOTICIAS PUBLICADAS</p>
                        </div>
                    ) : (
                        filteredNews.map((item) => (
                            <article
                                key={item.id}
                                className={`${styles.slab} ${styles.col4} ${styles.newsCardShell}`}
                            >
                                <Link href={`/noticias/${item.id}`} className={styles.newsCardLink}>
                                    <div
                                        className={styles.newsImage}
                                        style={{
                                            backgroundImage: `url(${item.image_url || 'https://placehold.co/600x400/1c1c1f/ffffff?text=NEWS'})`,
                                            backgroundPosition: 'center',
                                            backgroundSize: 'cover',
                                            backgroundRepeat: 'no-repeat'
                                        }}
                                    >
                                        {canManageNews && (
                                            <span
                                                className={`${styles.badge} ${item.status === 'published' ? styles.badgePublished : styles.badgeDraft}`}
                                                style={{ position: 'absolute', top: 8, left: 8 }}
                                            >
                                                {item.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
                                            </span>
                                        )}
                                    </div>

                                    <div className={styles.newsContent}>
                                        <div className={styles.newsMetaRow}>
                                            <span className={styles.rowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Tag size={12} /> {item.scope || 'global'}
                                            </span>
                                            <span className={styles.rowMeta}>{formatPublishedAt(item.published_at)}</span>
                                        </div>
                                        <h3 className={styles.newsTitle}>{item.title}</h3>
                                        <p className={styles.newsBody}>{buildNewsPreview(item)}</p>
                                        <span className={styles.readMore}>Leer nota completa</span>
                                    </div>
                                </Link>

                                {canManageNews && (
                                    <div className={styles.newsActions}>
                                        <button
                                            type="button"
                                            className={styles.btn}
                                            style={{ flex: 1, justifyContent: 'center' }}
                                            onClick={() => handleEdit(item)}
                                        >
                                            <Edit size={14} style={{ marginRight: 6 }} /> Editar
                                        </button>
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                type="button"
                                                className={styles.btn}
                                                style={{ padding: '10px' }}
                                                onClick={(e) => toggleMenu(item.id, e)}
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {activeMenuId === item.id && (
                                                <div
                                                    style={{
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
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className={styles.btn}
                                                        style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent' }}
                                                        onClick={(e) => handleToggleStatus(item, e)}
                                                    >
                                                        {item.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        {item.status === 'published' ? 'Despublicar' : 'Publicar'}
                                                    </button>
                                                    <button
                                                        type="button"
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
                                )}
                            </article>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
