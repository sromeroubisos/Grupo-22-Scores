'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
    FileText, User, LogOut, Camera,
    ChevronRight, Globe, Lock, Bell, Trophy, Plus, ShieldCheck
} from 'lucide-react';
import styles from './profile.module.css';
import { SafeBox } from '@/components/SafeBox';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type TabKey = 'settings' | 'admin' | 'news';

// ─── MAIN PAGE COMPONENT ─────────────────────────────────────────────────────

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('settings');
    const [isDesktop, setIsDesktop] = useState(false);

    // Initial desktop check and window listener
    useEffect(() => {
        const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
        checkDesktop();
        window.addEventListener('resize', checkDesktop);
        return () => window.removeEventListener('resize', checkDesktop);
    }, []);

    return (
        <div className={styles.page}>
            <div className={styles.container}>

                {/* Header Section (Full Width) */}
                <ProfileHeader user={user} />

                {/* Main Content Column (Left on Desktop) */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>

                    {/* Tabs Navigation */}
                    <nav className={styles.tabsContainer} aria-label="Sección de perfil">
                        <button
                            className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
                            onClick={() => setActiveTab('settings')}
                        >
                            Configuración
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'admin' ? styles.active : ''}`}
                            onClick={() => setActiveTab('admin')}
                        >
                            Aplicar a Staff
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'news' ? styles.active : ''}`}
                            onClick={() => setActiveTab('news')}
                        >
                            Mis Noticias
                        </button>
                    </nav>

                    {/* Content Area */}
                    <main className={styles.mainContent}>
                        {activeTab === 'settings' && <SettingsPanel logout={logout} />}
                        {activeTab === 'admin' && <AdminApplicationForm user={user} />}
                        {activeTab === 'news' && <NewsDashboard />}
                    </main>
                </div>

                {/* Sidebar Column (Desktop Only) */}
                {isDesktop && (
                    <aside className={styles.sidebar}>
                        <div className={styles.sidebarTitle}>
                            <span>Mis Seguidos</span>
                            <Link href="/favorites" style={{ fontSize: '12px', color: 'var(--color-accent)' }}>
                                Ver todos →
                            </Link>
                        </div>
                        <SafeBox fallback={<div style={{ fontSize: '12px', color: 'var(--color-error)' }}>No se pudo cargar el preview</div>}>
                            <DesktopFavoritesPreview userId={user?.id} />
                        </SafeBox>
                    </aside>
                )}

            </div>
        </div>
    );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function ProfileHeader({ user }: { user: any }) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            alert('Funcionalidad de subida de imagen en desarrollo.');
        }
    };

    return (
        <header className={styles.profileHeader}>
            <div className={styles.avatarContainer} onClick={handleAvatarClick} role="button" aria-label="Cambiar foto de perfil">
                {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="Avatar" className={styles.avatar} />
                ) : (
                    <div className={styles.avatar} style={{ background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={32} color="#aaa" />
                    </div>
                )}
                <div className={styles.avatarOverlay}>
                    <Camera size={24} />
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileChange}
                />
            </div>

            <div className={styles.userInfo}>
                <h1 className={styles.userName}>
                    {user?.name || 'Usuario'}
                </h1>
                <div className={styles.userHandle}>@{user?.email?.split('@')[0] || 'usuario'}</div>
                <div className={styles.userStatusPill}>
                    {user?.role === 'admin_general' ? 'Administrador' : 'Usuario'}
                </div>
            </div>

            <button className={styles.btnEditProfile} onClick={() => alert('Edición de perfil próximamente')}>
                Editar
            </button>
        </header>
    );
}

function SettingsPanel({ logout }: { logout: () => void }) {
    return (
        <div>
            <h2 className={styles.sectionTitle}>Preferencias</h2>
            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Idioma</h4>
                    <p>Español (Argentina)</p>
                </div>
                <ChevronRight size={16} color="var(--color-text-tertiary)" />
            </div>
            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Zona Horaria</h4>
                    <p>UTC-3 (Buenos Aires)</p>
                </div>
                <ChevronRight size={16} color="var(--color-text-tertiary)" />
            </div>
            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Notificaciones</h4>
                    <p>Resultados en vivo, noticias importantes</p>
                </div>
                <Bell size={16} color="var(--color-text-tertiary)" />
            </div>

            <h2 className={styles.sectionTitle} style={{ marginTop: '32px' }}>Cuenta</h2>
            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Privacidad del Perfil</h4>
                    <p>Público</p>
                </div>
                <Globe size={16} color="var(--color-text-tertiary)" />
            </div>
            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Cambiar Contraseña</h4>
                    <p>Última modificación: hace 3 meses</p>
                </div>
                <Lock size={16} color="var(--color-text-tertiary)" />
            </div>

            <button className={styles.btnLogout} onClick={logout} style={{ marginTop: '24px' }}>
                <LogOut size={18} />
                Cerrar Sesión
            </button>

            <button
                className={styles.btnLogout}
                onClick={() => alert('Para eliminar tu cuenta, contactá a soporte.')}
                style={{ color: 'var(--color-text-tertiary)', borderBottom: 'none', fontSize: '13px' }}
            >
                Eliminar cuenta
            </button>
        </div>
    );
}

function AdminApplicationForm({ user: _user }: { user: any }) {
    const [selectedRole, setSelectedRole] = useState('');
    const [reason, setReason] = useState('');

    const handleSubmit = (e: React.SyntheticEvent) => {
        e.preventDefault();
        alert('Solicitud enviada para revisión.');
    };

    const roles = [
        { id: 'club_admin', title: 'Admin de Club', desc: 'Gestionar plantel, escudo y redes sociales de un club.' },
        { id: 'tournament_admin', title: 'Admin de Torneo', desc: 'Cargar resultados y fixture.' },
        { id: 'editor', title: 'Editor de Noticias', desc: 'Publicar contenido periodístico.' },
        { id: 'moderator', title: 'Moderador', desc: 'Revisar reportes y moderar contenido.' },
    ];

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
                <h2 className={styles.sectionTitle}>Aplicar para Staff</h2>
                <p className={styles.sectionDesc}>
                    Unite al equipo de colaboradores. Elegí el rol y contanos por qué querés sumarte.
                </p>
            </div>

            <div className={styles.formGroup}>
                <span className={styles.label}>Roles disponibles</span>
                {roles.map(role => (
                    <div
                        key={role.id}
                        className={`${styles.adminOption} ${selectedRole === role.id ? styles.selected : ''}`}
                        onClick={() => setSelectedRole(role.id)}
                    >
                        <input
                            type="radio"
                            name="role"
                            checked={selectedRole === role.id}
                            onChange={() => setSelectedRole(role.id)}
                            style={{ margin: 0, width: 20, height: 20, accentColor: 'var(--color-accent)' }}
                        />
                        <div>
                            <span className={styles.roleTitle}>{role.title}</span>
                            <span className={styles.roleDesc}>{role.desc}</span>
                        </div>
                    </div>
                ))}
            </div>

            {selectedRole && (
                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="reason">Contanos por qué querés aplicar</label>
                    <textarea
                        id="reason"
                        className={styles.textarea}
                        rows={3}
                        style={{ minHeight: '100px' }}
                        placeholder="Tu experiencia, motivación..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        required
                        minLength={20}
                    />
                </div>
            )}

            <div className={styles.stickyAction}>
                <button type="submit" className={styles.btnPrimary} disabled={!selectedRole || reason.length < 20}>
                    Enviar solicitud
                </button>
            </div>
        </form>
    );
}

function NewsDashboard() {
    const hasNews = false;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className={styles.sectionTitle}>Mis Noticias</h2>
            </div>

            {hasNews ? (
                <div className={styles.newsList}>
                    <div className={styles.newsItem}>
                        <div className={styles.newsTitle}>Gran final del torneo apertura</div>
                        <div className={styles.newsMeta}>18 feb · Publicada</div>
                    </div>
                    <div className={styles.newsItem}>
                        <div className={styles.newsTitle}>Entrevista al DT de San Martín</div>
                        <div className={styles.newsMeta}>Borrador</div>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--color-border)', borderRadius: '12px' }}>
                    <FileText size={40} color="var(--color-text-tertiary)" style={{ marginBottom: '12px' }} />
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                        Todavía no publicaste noticias.
                    </p>
                </div>
            )}

            <button className={styles.btnCreateNews}>
                <Plus size={18} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '8px' }} />
                Crear noticia
            </button>
        </div>
    );
}

interface FavoritePreviewItem {
    id: string;
    entity_id: string;
    entity_type: string;
    name: string;
    logo_url?: string;
    color?: string;
}

function DesktopFavoritesPreview({ userId }: { userId?: string }) {
    const [items, setItems] = useState<FavoritePreviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        let alive = true;
        // In this environment, we handle AbortError via try-catch manually since Supabase 
        // doesn't support outside AbortControllers for RPC in all versions perfectly.

        const fetchPreview = async () => {
            try {
                setLoading(true);
                setError(null);

                // v2: RETURNS TABLE — data is always an array, no JSON.parse needed
                const { data, error: rpcError } = await supabase.rpc(
                    'get_my_favorites_enriched_v2',
                    { p_limit: 6, p_cursor: null },
                );

                if (rpcError) {
                    if (rpcError.name === 'AbortError' || rpcError.message?.toLowerCase().includes('abort')) return;
                    throw rpcError;
                }

                if (!alive) return;

                setItems(Array.isArray(data) ? data : []);
            } catch (err: any) {
                if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) return;
                if (!alive) return;
                console.error('Favorites preview error:', err);
                setError(err.message || 'Error cargando favoritos');
            } finally {
                if (alive) {
                    setLoading(false);
                }
            }
        };

        fetchPreview();

        return () => {
            alive = false;
        };
    }, [userId]); // Only depend on userId, not the whole user object

    if (loading) return <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', padding: '12px 0' }}>Cargando seguidos...</div>;
    if (error) return <div style={{ fontSize: '12px', color: 'var(--color-error)', padding: '12px 0' }}>No se pudo cargar. Reintentar</div>;
    if (items.length === 0) return <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', padding: '12px 0' }}>Sin seguidos aún</div>;

    return (
        <div className={styles.favoritesCompactList}>
            {items.slice(0, 6).map(fav => (
                <Link key={fav.entity_id} href={`/favorites`} className={styles.compactFavItem}>
                    {fav.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav.logo_url} alt={fav.name} className={styles.compactFavImg} />
                    ) : (
                        <div className={styles.compactFavImg} style={{ background: fav.color || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {fav.entity_type === 'club' ? <ShieldCheck size={16} /> : <Trophy size={16} />}
                        </div>
                    )}
                    <span className={styles.compactFavName}>{fav.name}</span>
                </Link>
            ))}
        </div>
    );
}
