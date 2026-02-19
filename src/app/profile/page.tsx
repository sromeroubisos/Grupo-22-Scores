'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
    FileText, User, LogOut, Camera,
    ChevronRight, Globe, Lock, Bell, Trophy, ShieldCheck, Star,
} from 'lucide-react';
import styles from './profile.module.css';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type MainTab = 'seguidos' | 'competiciones' | 'clubes' | 'actividad' | 'ajustes';

interface FavoriteItem {
    id: string;
    entity_id: string;
    entity_type: string;
    name: string;
    logo_url?: string;
    color?: string;
}

interface ProfileStats {
    total: number;
    clubes: number;
    torneos: number;
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<MainTab>('seguidos');
    const [isDesktop, setIsDesktop] = useState(false);
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [favLoading, setFavLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const check = () => setIsDesktop(window.innerWidth >= 1024);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        if (!user?.id) { setFavLoading(false); return; }
        let alive = true;
        (async () => {
            try {
                const { data, error } = await supabase.rpc(
                    'get_my_favorites_enriched_v2',
                    { p_limit: 50, p_cursor: null },
                );
                if (!alive) return;
                if (!error) setFavorites(Array.isArray(data) ? data : []);
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
            } finally {
                if (alive) setFavLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const stats: ProfileStats = {
        total: favorites.length,
        clubes: favorites.filter(f => f.entity_type === 'club').length,
        torneos: favorites.filter(f => ['league', 'tournament'].includes(f.entity_type)).length,
    };

    const sportsTabs: { key: MainTab; label: string }[] = [
        { key: 'seguidos', label: 'Seguidos' },
        { key: 'competiciones', label: 'Competiciones' },
        { key: 'clubes', label: 'Clubes' },
        { key: 'actividad', label: 'Actividad' },
    ];
    // On mobile, settings live in a tab. On desktop they live in the sidebar.
    const visibleTabs = isDesktop
        ? sportsTabs
        : [...sportsTabs, { key: 'ajustes' as MainTab, label: 'Ajustes' }];

    return (
        <div className={styles.page}>
            <div className={styles.container}>

                {/* ── Header (full width) ── */}
                <ProfileHeader user={user} stats={stats} />

                {/* ── Main column ── */}
                <div className={styles.mainColumn}>
                    <nav className={styles.tabsContainer} aria-label="Secciones del perfil">
                        {visibleTabs.map(({ key, label }) => (
                            <button
                                key={key}
                                className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
                                onClick={() => setActiveTab(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>

                    <div className={styles.mainContent}>
                        {activeTab === 'seguidos' && (
                            <SeguridosPanel favorites={favorites} loading={favLoading} />
                        )}
                        {activeTab === 'competiciones' && (
                            <EmptySection
                                icon={<Trophy size={40} color="var(--color-text-tertiary)" />}
                                title="Competiciones"
                                message="Las competiciones que sigas aparecerán acá."
                            />
                        )}
                        {activeTab === 'clubes' && (
                            <EmptySection
                                icon={<ShieldCheck size={40} color="var(--color-text-tertiary)" />}
                                title="Clubes"
                                message="Los clubes que sigas aparecerán acá."
                            />
                        )}
                        {activeTab === 'actividad' && (
                            <EmptySection
                                icon={<FileText size={40} color="var(--color-text-tertiary)" />}
                                title="Actividad"
                                message="Tu actividad reciente aparecerá acá."
                            />
                        )}
                        {activeTab === 'ajustes' && !isDesktop && (
                            <SettingsPanel logout={logout} />
                        )}
                    </div>
                </div>

                {/* ── Sidebar (desktop only) ── */}
                {isDesktop && (
                    <aside className={styles.sidebar}>
                        <SettingsPanel logout={logout} />
                    </aside>
                )}



            </div>
        </div>
    );
}

// ─── PROFILE HEADER ───────────────────────────────────────────────────────────

function ProfileHeader({ user, stats }: { user: any; stats: ProfileStats }) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <header className={styles.profileHeader}>
            <div
                className={styles.avatarContainer}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                aria-label="Cambiar foto de perfil"
            >
                {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="Avatar" className={styles.avatar} />
                ) : (
                    <div className={styles.avatar} style={{ background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={32} color="#aaa" />
                    </div>
                )}
                <div className={styles.avatarOverlay}><Camera size={24} /></div>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={() => alert('Funcionalidad de subida de imagen en desarrollo.')}
                />
            </div>

            <div className={styles.userInfo}>
                <h1 className={styles.userName}>{user?.name || 'Usuario'}</h1>
                <div className={styles.userHandle}>@{user?.email?.split('@')[0] || 'usuario'}</div>
                <div className={styles.userStatusPill}>
                    {user?.role === 'super_admin' || user?.role === 'admin_general' ? 'Administrador' : 'Usuario'}
                </div>
                <div className={styles.statsRow}>
                    <span className={styles.stat}><strong>{stats.total}</strong> Seguidos</span>
                    <span className={styles.statDivider}>·</span>
                    <span className={styles.stat}><strong>{stats.clubes}</strong> Clubes</span>
                    <span className={styles.statDivider}>·</span>
                    <span className={styles.stat}><strong>{stats.torneos}</strong> Torneos</span>
                </div>
            </div>

            <button className={styles.btnEditProfile} onClick={() => alert('Edición de perfil próximamente')}>
                Editar
            </button>
        </header>
    );
}

// ─── SEGUIDOS PANEL ───────────────────────────────────────────────────────────

function SeguridosPanel({ favorites, loading }: { favorites: FavoriteItem[]; loading: boolean }) {
    if (loading) {
        return (
            <div className={styles.skeletonGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={styles.skeletonCard} />
                ))}
            </div>
        );
    }

    if (favorites.length === 0) {
        return (
            <EmptySection
                icon={<Star size={40} color="var(--color-text-tertiary)" />}
                title="Sin seguidos"
                message="Seguí clubes y torneos para verlos acá."
                action={<Link href="/" className={styles.btnAccent}>Explorar</Link>}
            />
        );
    }

    return (
        <div>
            <div className={styles.seguridosHeader}>
                <span className={styles.seguridosCount}>{favorites.length} seguidos</span>
                <Link href="/favorites" className={styles.linkAccent}>Gestionar →</Link>
            </div>
            <div className={styles.seguridosGrid}>
                {favorites.map(fav => (
                    <Link key={fav.entity_id} href="/favorites" className={styles.seguridoCard}>
                        {fav.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fav.logo_url} alt={fav.name} className={styles.seguridoImg} />
                        ) : (
                            <div className={styles.seguridoImg} style={{ background: fav.color || 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {fav.entity_type === 'club'
                                    ? <ShieldCheck size={20} color="var(--color-text-tertiary)" />
                                    : <Trophy size={20} color="var(--color-text-tertiary)" />
                                }
                            </div>
                        )}
                        <span className={styles.seguridoName}>{fav.name}</span>
                        <span className={styles.seguridoType}>
                            {fav.entity_type === 'club' ? 'Club' : 'Liga'}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ─── EMPTY SECTION ────────────────────────────────────────────────────────────

function EmptySection({ icon, title, message, action }: {
    icon: React.ReactNode;
    title?: string;
    message: string;
    action?: React.ReactNode;
}) {
    return (
        <div className={styles.emptySection}>
            {icon}
            {title && <h3 className={styles.emptySectionTitle}>{title}</h3>}
            <p className={styles.emptySectionMsg}>{message}</p>
            {action}
        </div>
    );
}

// ─── SETTINGS PANEL (sidebar / mobile tab) ────────────────────────────────────

function SettingsPanel({ logout }: { logout: () => void }) {
    const [showStaffForm, setShowStaffForm] = useState(false);

    if (showStaffForm) {
        return (
            <div>
                <button className={styles.backBtn} onClick={() => setShowStaffForm(false)}>
                    ← Volver
                </button>
                <AdminApplicationForm />
            </div>
        );
    }

    return (
        <div className={styles.settingsList}>
            <h3 className={styles.sidebarSectionTitle}>Configuración</h3>

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
                    <p>Resultados en vivo</p>
                </div>
                <Bell size={16} color="var(--color-text-tertiary)" />
            </div>

            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Privacidad</h4>
                    <p>Público</p>
                </div>
                <Globe size={16} color="var(--color-text-tertiary)" />
            </div>

            <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                    <h4>Cambiar Contraseña</h4>
                </div>
                <Lock size={16} color="var(--color-text-tertiary)" />
            </div>

            <div className={styles.settingsDivider} />

            <button className={styles.settingItemBtn} onClick={() => setShowStaffForm(true)}>
                <div className={styles.settingInfo}>
                    <h4>Aplicar a Staff</h4>
                    <p>Colaborar con el equipo</p>
                </div>
                <ChevronRight size={16} color="var(--color-text-tertiary)" />
            </button>

            <div className={styles.settingsDivider} />

            <button className={styles.btnLogout} onClick={logout}>
                <LogOut size={18} />
                Cerrar Sesión
            </button>

            <button
                className={styles.btnDanger}
                onClick={() => alert('Para eliminar tu cuenta, contactá a soporte.')}
            >
                Eliminar cuenta
            </button>
        </div>
    );
}

// ─── ADMIN APPLICATION FORM ───────────────────────────────────────────────────

function AdminApplicationForm() {
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
            <h3 className={styles.sidebarSectionTitle} style={{ marginBottom: '12px' }}>Aplicar para Staff</h3>
            <p className={styles.sectionDesc}>Elegí el rol y contanos por qué querés sumarte.</p>

            <div className={styles.formGroup}>
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
                            style={{ margin: 0, width: 18, height: 18, accentColor: 'var(--color-accent)', flexShrink: 0 }}
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
                    <label className={styles.label} htmlFor="reason">¿Por qué querés aplicar?</label>
                    <textarea
                        id="reason"
                        className={styles.textarea}
                        rows={3}
                        placeholder="Tu experiencia, motivación..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        required
                        minLength={20}
                    />
                </div>
            )}

            <button type="submit" className={styles.btnPrimary} disabled={!selectedRole || reason.length < 20}>
                Enviar solicitud
            </button>
        </form>
    );
}
