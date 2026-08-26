'use client';

// La portada de Noticias.
//
// Arriba van los torneos que tienen videos (las tarjetas viven en
// VideoHubCards.tsx): el de carga más reciente grande y unos pocos más en
// grilla, con el atajo a la lista completa en /noticias/videos. Abajo, las
// notas, con filtros por deporte y alcance y búsqueda por título. Quien
// administra ve además los borradores y las acciones de cada nota.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    Eye,
    EyeOff,
    MoreVertical,
    Newspaper,
    Pencil,
    Plus,
    Search,
    Trash2,
    X,
} from 'lucide-react';

import MobileSectionTabs from '@/components/MobileSectionTabs';
import { useSport } from '@/context/SportContext';
import type { VideoHubSummary } from '@/lib/videoHub/types';

import { VideoHubsSection, pluralize } from './VideoHubCards';
import styles from './page.module.css';

export interface NewsItem {
    id: string;
    title: string;
    summary: string;
    content: string;
    published_at?: string | null;
    image_url?: string;
    author_id?: string;
    status: 'draft' | 'published' | 'archived';
    sport?: string;
    scope?: 'global' | 'tournament' | 'club' | 'union' | string;
}

interface NoticiasClientProps {
    initialNews: NewsItem[];
    canManageNews: boolean;
    /** Los torneos con videos, del de carga más reciente al más viejo. */
    videoHubs?: VideoHubSummary[];
}

/** Una fila de dos en la portada; "Ver más" despliega el resto acá mismo. */
const HUB_CARDS_ON_FRONT = 2;
const ALL_HUBS_HREF = '/noticias/videos';

// ── Carpetas ──────────────────────────────────────────────────────────────

type SportFolder = 'rugby' | 'hockey' | 'football';
type ScopeFolder = 'global' | 'tournament' | 'club' | 'union';
type Folder = 'all' | SportFolder | ScopeFolder;

const SPORT_FOLDERS: Record<string, SportFolder> = {
    rugby: 'rugby',
    'rugby-union': 'rugby',
    'field-hockey': 'hockey',
    hockey: 'hockey',
    football: 'football',
    soccer: 'football',
};
const SPORT_ORDER: SportFolder[] = ['rugby', 'hockey', 'football'];
const SPORT_LABELS: Record<SportFolder, string> = { rugby: 'Rugby', hockey: 'Hockey', football: 'Fútbol' };
const SCOPE_ORDER: ScopeFolder[] = ['global', 'tournament', 'club', 'union'];
const SCOPE_LABELS: Record<ScopeFolder, string> = { global: 'General', tournament: 'Torneos', club: 'Clubes', union: 'Uniones' };

/** Las notas viejas no traen deporte: son de rugby. Un deporte desconocido no entra en ninguna carpeta. */
function sportFolderOf(sport: string | undefined): SportFolder | null {
    const key = (sport ?? '').trim().toLowerCase();
    if (!key) return 'rugby';
    return SPORT_FOLDERS[key] ?? null;
}

function scopeFolderOf(scope: string | undefined): ScopeFolder {
    const key = (scope ?? '').trim().toLowerCase();
    return (SCOPE_ORDER as string[]).includes(key) ? key as ScopeFolder : 'global';
}

// ── Textos ────────────────────────────────────────────────────────────────

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "22 abr 2026", en hora argentina y con partes numéricas: el servidor y el navegador escriben lo mismo. */
function formatDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = get('day');
    const month = Number(get('month'));
    const year = get('year');
    return day && month && year ? `${day} ${MONTHS[month - 1]} ${year}` : null;
}

/**
 * Solo se dibuja una imagen que el navegador pueda pedir: http(s), una ruta
 * del sitio o un data URL. Hay notas con una ruta local del editor
 * (`file:///C:/...`), y un <img> con eso tira un error en consola por cada
 * carga: esas van con el marco vacío.
 */
function renderableImageUrl(url: string | undefined): string | null {
    const value = (url ?? '').trim();
    if (!value) return null;
    return /^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(value) ? value : null;
}

function buildNewsPreview(item: NewsItem): string {
    const summary = item.summary?.trim();
    if (summary) return summary;

    const content = item.content?.trim();
    if (!content) return 'Abrir para leer la noticia completa.';
    return content.length > 160 ? `${content.slice(0, 157)}...` : content;
}

// ── Las notas ─────────────────────────────────────────────────────────────

interface NewsCardProps {
    item: NewsItem;
    canManage: boolean;
    menuOpen: boolean;
    onToggleMenu: (event: React.MouseEvent) => void;
    onToggleStatus: (event: React.MouseEvent) => void;
    onDelete: (event: React.MouseEvent) => void;
}

function NewsCard({ item, canManage, menuOpen, onToggleMenu, onToggleStatus, onDelete }: NewsCardProps) {
    const date = formatDate(item.published_at);
    const image = renderableImageUrl(item.image_url);
    const scope = SCOPE_LABELS[scopeFolderOf(item.scope)];
    const published = item.status === 'published';
    const menuId = `news-menu-${item.id}`;

    return (
        <article className={styles.newsCard}>
            <Link href={`/noticias/${item.id}`} className={styles.newsLink}>
                <span className={styles.newsMedia}>
                    {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- imagen remota de la nota; no pasa por el optimizador.
                        <img className={styles.newsImg} src={image} alt="" loading="lazy" decoding="async" />
                    ) : (
                        <span className={styles.newsNoImage} aria-hidden="true"><Newspaper size={28} /></span>
                    )}
                    {canManage && (
                        <span className={`${styles.badge} ${published ? styles.badgePublished : styles.badgeDraft}`}>
                            {published ? 'Publicado' : 'Borrador'}
                        </span>
                    )}
                </span>
                <span className={styles.newsBody}>
                    <span className={styles.newsMeta}>
                        <span className={styles.newsScope}>{scope}</span>
                        {date && <time dateTime={item.published_at ?? undefined}>{date}</time>}
                    </span>
                    <h3 className={styles.newsTitle}>{item.title}</h3>
                    <p className={styles.newsExcerpt}>{buildNewsPreview(item)}</p>
                    <span className={styles.newsCta}>Leer la nota <ArrowRight size={14} aria-hidden="true" /></span>
                </span>
            </Link>

            {canManage && (
                <div className={styles.newsAdmin}>
                    <Link href={`/admin/super/noticias/editar/${item.id}`} className={`${styles.btn} ${styles.btnSm}`}>
                        <Pencil size={14} aria-hidden="true" /> Editar
                    </Link>
                    <div className={styles.menuWrap}>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnIcon}`}
                            onClick={onToggleMenu}
                            aria-label={`Más acciones para ${item.title}`}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-controls={menuOpen ? menuId : undefined}
                        >
                            <MoreVertical size={16} aria-hidden="true" />
                        </button>
                        {menuOpen && (
                            <div id={menuId} className={styles.menu} role="menu">
                                <button type="button" className={styles.menuItem} role="menuitem" onClick={onToggleStatus}>
                                    {published ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                                    {published ? 'Despublicar' : 'Publicar'}
                                </button>
                                <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem" onClick={onDelete}>
                                    <Trash2 size={14} aria-hidden="true" /> Eliminar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}

// ── La portada ────────────────────────────────────────────────────────────

export default function NoticiasClient({ initialNews, canManageNews, videoHubs = [] }: NoticiasClientProps) {
    const { selectedSport } = useSport();
    const [news, setNews] = useState<NewsItem[]>(() => initialNews.map((item) => ({
        ...item,
        scope: item.scope || 'global',
    })));
    const [activeFolder, setActiveFolder] = useState<Folder>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // El menú de acciones se cierra al clickear afuera o con Escape.
    useEffect(() => {
        if (!activeMenuId) return;
        const close = () => setActiveMenuId(null);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [activeMenuId]);

    const handleDelete = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setActiveMenuId(null);
        if (!window.confirm('¿Eliminar esta noticia? No se puede deshacer.')) return;
        try {
            const response = await fetch(`/api/news?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            setNews((current) => current.filter((item) => item.id !== id));
        } catch (error) {
            console.error(error);
            window.alert('No se pudo eliminar la noticia. Probá de nuevo.');
        }
    };

    const handleToggleStatus = async (item: NewsItem, event: React.MouseEvent) => {
        event.stopPropagation();
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
            const updated = payload?.data as NewsItem | undefined;

            setNews((current) => current.map((entry) => (entry.id === item.id
                ? {
                    ...entry,
                    ...(updated || {}),
                    status: updated?.status || newStatus,
                    published_at: updated?.published_at ?? (newStatus === 'published' ? new Date().toISOString() : null),
                }
                : entry)));
        } catch (error) {
            console.error(error);
            window.alert('No se pudo cambiar el estado. Probá de nuevo.');
        }
    };

    const toggleMenu = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setActiveMenuId((current) => (current === id ? null : id));
    };

    // Solo las carpetas que separan algo: una con todas las notas, o con ninguna, es ruido.
    const folders = useMemo(() => {
        const counts = new Map<Folder, number>();
        const bump = (folder: Folder) => counts.set(folder, (counts.get(folder) ?? 0) + 1);
        for (const item of news) {
            const sport = sportFolderOf(item.sport);
            if (sport) bump(sport);
            bump(scopeFolderOf(item.scope));
        }
        const list: { id: Folder; label: string; count: number }[] = [{ id: 'all', label: 'Todas', count: news.length }];
        const push = (id: Folder, label: string) => {
            const count = counts.get(id) ?? 0;
            if (count > 0 && count < news.length) list.push({ id, label, count });
        };
        for (const sport of SPORT_ORDER) push(sport, SPORT_LABELS[sport]);
        for (const scope of SCOPE_ORDER) push(scope, SCOPE_LABELS[scope]);
        return list;
    }, [news]);

    const query = searchQuery.trim().toLowerCase();
    const filteredNews = useMemo(() => news.filter((item) => {
        if (query && !`${item.title} ${item.summary ?? ''}`.toLowerCase().includes(query)) return false;
        if (activeFolder === 'all') return true;
        if ((SPORT_ORDER as string[]).includes(activeFolder)) return sportFolderOf(item.sport) === activeFolder;
        return scopeFolderOf(item.scope) === activeFolder;
    }), [news, query, activeFolder]);

    const filtering = activeFolder !== 'all' || query !== '';
    const totalVideos = videoHubs.reduce((sum, hub) => sum + hub.videoCount, 0);

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <MobileSectionTabs
                    activeTab="news"
                    rankingsHref={`/rankings?sport=${encodeURIComponent(selectedSport.id)}`}
                />

                <header className={styles.masthead}>
                    <div className={styles.mastheadText}>
                        <p className={styles.eyebrow}>G22 Scores · Editorial</p>
                        <h1 className={styles.title}>Noticias</h1>
                        <p className={styles.lede}>Novedades y comunicados, y los videos de cada torneo.</p>
                    </div>

                    {canManageNews && (
                        <div className={styles.mastheadActions}>
                            <span className={styles.editorialTag}>
                                <span className={styles.editorialDot} aria-hidden="true" />
                                Modo editorial · ves los borradores
                            </span>
                            <Link href="/admin/super/noticias/nueva" className={`${styles.btn} ${styles.btnPrimary}`}>
                                <Plus size={16} aria-hidden="true" /> Nueva noticia
                            </Link>
                        </div>
                    )}
                </header>

                {videoHubs.length > 0 && (
                    <section className={styles.section} aria-labelledby="video-hubs-title">
                        <div className={styles.sectionHead}>
                            <div>
                                <h2 id="video-hubs-title" className={styles.sectionTitle}>Videos por torneo</h2>
                                <p className={styles.sectionHint}>Highlights, partidos completos y la votación al mejor try o gol.</p>
                            </div>
                            <div className={styles.sectionAside}>
                                <span className={styles.sectionMeta}>
                                    {pluralize(videoHubs.length, 'torneo', 'torneos')} · {pluralize(totalVideos, 'video', 'videos')}
                                </span>
                                <Link href={ALL_HUBS_HREF} className={styles.sectionLink}>
                                    Ver todos los torneos <ArrowRight size={14} aria-hidden="true" />
                                </Link>
                            </div>
                        </div>

                        <VideoHubsSection
                            hubs={videoHubs}
                            canManage={canManageNews}
                            initialCount={HUB_CARDS_ON_FRONT}
                        />
                    </section>
                )}

                <section className={styles.section} aria-labelledby="news-title">
                    <div className={styles.sectionHead}>
                        <div>
                            <h2 id="news-title" className={styles.sectionTitle}>Últimas noticias</h2>
                        </div>
                        <span className={styles.sectionMeta} aria-live="polite">
                            {filtering ? `${filteredNews.length} de ${news.length}` : pluralize(news.length, 'nota', 'notas')}
                        </span>
                    </div>

                    <div className={styles.toolbar}>
                        {/* Con "Todas" sola no hay nada que filtrar: el grupo no se muestra. */}
                        {folders.length > 1 && (
                            <div className={styles.chips} role="group" aria-label="Filtrar las noticias">
                                {folders.map((folder) => {
                                    const active = activeFolder === folder.id;
                                    return (
                                        <button
                                            key={folder.id}
                                            type="button"
                                            className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                                            aria-pressed={active}
                                            onClick={() => setActiveFolder(folder.id)}
                                        >
                                            {folder.label}
                                            <span className={styles.chipCount}>{folder.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className={styles.search}>
                            <label htmlFor="news-search" className={styles.srOnly}>Buscar noticias</label>
                            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                            <input
                                id="news-search"
                                type="search"
                                className={styles.searchInput}
                                placeholder="Buscar por título"
                                autoComplete="off"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className={styles.searchClear}
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Borrar la búsqueda"
                                >
                                    <X size={16} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredNews.length === 0 ? (
                        <div className={styles.empty}>
                            <p className={styles.emptyTitle}>
                                {news.length === 0 ? 'Todavía no hay noticias publicadas.' : 'Ninguna noticia coincide con ese filtro.'}
                            </p>
                            {filtering && (
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnSm}`}
                                    onClick={() => { setActiveFolder('all'); setSearchQuery(''); }}
                                >
                                    Ver todas las noticias
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.newsGrid}>
                            {filteredNews.map((item) => (
                                <NewsCard
                                    key={item.id}
                                    item={item}
                                    canManage={canManageNews}
                                    menuOpen={activeMenuId === item.id}
                                    onToggleMenu={(event) => toggleMenu(item.id, event)}
                                    onToggleStatus={(event) => void handleToggleStatus(item, event)}
                                    onDelete={(event) => void handleDelete(item.id, event)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
