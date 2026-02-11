'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useAdmin } from '../AdminContext';

// Mock data
const stats = {
    tournaments: 5,
    matches: 48,
    pendingResults: 3,
    liveMatches: 2,
};

const recentActivity = [
    { id: 1, type: 'result', message: 'Resultado cargado: Club Atlético 28 - 17 Racing Club', time: 'Hace 2 horas', user: 'admin@g22.com' },
    { id: 2, type: 'event', message: 'Evento añadido: Try de Martín García (5\')', time: 'Hace 2 horas', user: 'admin@g22.com' },
    { id: 3, type: 'match', message: 'Partido creado: San Lorenzo vs CASI', time: 'Hace 5 horas', user: 'operador@union.com' },
    { id: 4, type: 'publish', message: 'Torneo publicado: Copa Juvenil 2026', time: 'Ayer', user: 'admin@g22.com' },
];

const pendingMatches = [
    { id: 1, home: 'San Lorenzo', away: 'CASI', date: '2026-02-03', time: '15:30', status: 'live' },
    { id: 2, home: 'Deportivo FC', away: 'Hindu Club', date: '2026-02-03', time: '18:00', status: 'scheduled' },
    { id: 3, home: 'Belgrano AC', away: 'Newman', date: '2026-02-03', time: '20:30', status: 'scheduled' },
];

const allQuickActions = [
    { id: 'new-match', icon: '➕', label: 'Nuevo partido', href: '/admin/super/partidos', roles: ['admin', 'operator'] },
    { id: 'load-result', icon: '📊', label: 'Cargar resultado', href: '/admin/super/resultados', roles: ['admin', 'operator'] },
    { id: 'add-event', icon: '⚡', label: 'Agregar evento', href: '/admin/super/eventos', roles: ['admin', 'operator'] },
    { id: 'new-tournament', icon: '🏆', label: 'Nuevo torneo', href: '/admin/torneos', roles: ['admin'] },
];

export default function AdminPage() {
    const { user } = useAdmin();

    if (!user) return null;

    const quickActions = allQuickActions.filter(action => action.roles.includes(user.role as any));

    return (
        <>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Dashboard</h1>
                    <p className={styles.pageSubtitle}>Bienvenido al panel de administración</p>
                </div>
                <div className={styles.headerRight}>
                    <Link href="/" className={styles.viewSiteBtn}>
                        Ver sitio público
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </Link>
                </div>
            </header>

            {/* Content */}
            <div className={styles.content}>
                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>🏆</div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{stats.tournaments}</span>
                            <span className={styles.statLabel}>Torneos activos</span>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>📅</div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{stats.matches}</span>
                            <span className={styles.statLabel}>Partidos esta semana</span>
                        </div>
                    </div>
                    <div className={`${styles.statCard} ${styles.warning}`}>
                        <div className={styles.statIcon}>⏳</div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{stats.pendingResults}</span>
                            <span className={styles.statLabel}>Resultados pendientes</span>
                        </div>
                    </div>
                    <div className={`${styles.statCard} ${styles.live}`}>
                        <div className={styles.statIcon}>🔴</div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{stats.liveMatches}</span>
                            <span className={styles.statLabel}>En vivo ahora</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Acciones rápidas</h2>
                    <div className={styles.quickActions}>
                        {quickActions.map((action) => (
                            <Link key={action.id} href={action.href} className={styles.quickAction}>
                                <span className={styles.quickActionIcon}>{action.icon}</span>
                                <span className={styles.quickActionLabel}>{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className={styles.grid}>
                    {/* Pending Matches */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>Partidos pendientes</h2>
                            <Link href="/admin/super/partidos" className={styles.cardLink}>Ver todos</Link>
                        </div>
                        <div className={styles.matchesList}>
                            {pendingMatches.map((match) => (
                                <div key={match.id} className={styles.matchItem}>
                                    <div className={styles.matchInfo}>
                                        <span className={styles.matchTeams}>{match.home} vs {match.away}</span>
                                        <span className={styles.matchDate}>{match.date} - {match.time}</span>
                                    </div>
                                    <div className={styles.matchActions}>
                                        {match.status === 'live' ? (
                                            <span className={styles.liveBadge}>
                                                <span className={styles.liveDot}></span>
                                                En vivo
                                            </span>
                                        ) : (
                                            <button className={styles.loadResultBtn}>Cargar resultado</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>Actividad reciente</h2>
                        </div>
                        <div className={styles.activityList}>
                            {recentActivity.map((activity) => (
                                <div key={activity.id} className={styles.activityItem}>
                                    <div className={`${styles.activityIcon} ${styles[activity.type]}`}>
                                        {activity.type === 'result' && '✅'}
                                        {activity.type === 'event' && '⚡'}
                                        {activity.type === 'match' && '📅'}
                                        {activity.type === 'publish' && '📢'}
                                    </div>
                                    <div className={styles.activityContent}>
                                        <span className={styles.activityMessage}>{activity.message}</span>
                                        <span className={styles.activityMeta}>
                                            {activity.time} • {activity.user}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
