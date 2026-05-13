'use client';

import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import type { UserNotification } from '@/lib/notifications/types';
import SystemNotificationsControl from '@/components/SystemNotificationsControl';
import styles from './notifications.module.css';

function formatFullDate(value: string) {
    try {
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return '';
    }
}

function getNotificationHref(notification: UserNotification) {
    if (notification.match_id) {
        return `/matches/${notification.match_id}`;
    }

    if (notification.entity_type === 'club') {
        return `/clubs/${notification.entity_id}`;
    }

    if (notification.entity_type === 'tournament') {
        return `/tournaments/${notification.entity_id}`;
    }

    return '/notifications';
}

function getTypeLabel(type: UserNotification['type']) {
    if (type === 'match_finished') return 'Resultado';
    if (type === 'team_event') return 'Evento';
    return 'Notificacion';
}

export default function NotificationsPage() {
    const { user, login } = useAuth();
    const {
        notifications,
        unreadCount,
        loading,
        error,
        schemaReady,
        markRead,
        markAllRead,
        refresh,
    } = useNotifications({ limit: 50, pollMs: 45000 });

    if (!user) {
        return (
            <main className={styles.page}>
                <section className={styles.emptyState}>
                    <Bell size={44} />
                    <h1>Notificaciones</h1>
                    <p>Inicia sesion para ver novedades de tus equipos y torneos seguidos.</p>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => login('fan', '/notifications')}
                    >
                        Iniciar sesion
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <section className={styles.header}>
                <div>
                    <span className={styles.kicker}>Centro de actividad</span>
                    <h1>Notificaciones</h1>
                    <p>Resultados finales y eventos nuevos de tus seguidos.</p>
                </div>

                <div className={styles.headerActions}>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                            void refresh();
                        }}
                        disabled={loading}
                    >
                        {loading ? <Loader2 size={16} className={styles.spin} /> : <Bell size={16} />}
                        Actualizar
                    </button>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                            void markAllRead();
                        }}
                        disabled={unreadCount === 0}
                    >
                        <CheckCheck size={16} />
                        Marcar leidas
                    </button>
                </div>
            </section>

            <section className={styles.summaryGrid} aria-label="Resumen de notificaciones">
                <article>
                    <span>Sin leer</span>
                    <strong>{unreadCount}</strong>
                </article>
                <article>
                    <span>Total reciente</span>
                    <strong>{notifications.length}</strong>
                </article>
                <article>
                    <span>Estado</span>
                    <strong>{schemaReady ? 'Activo' : 'Pendiente'}</strong>
                </article>
            </section>

            <SystemNotificationsControl />

            {!schemaReady ? (
                <section className={styles.notice}>
                    <strong>La base todavia no tiene activadas las notificaciones.</strong>
                    <span>Ejecuta la migracion nueva de Supabase para crear la tabla y los triggers.</span>
                </section>
            ) : null}

            {error ? (
                <section className={styles.notice}>
                    <strong>No se pudieron cargar las notificaciones.</strong>
                    <span>{error}</span>
                </section>
            ) : null}

            <section className={styles.list} aria-label="Listado de notificaciones">
                {loading && notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Loader2 size={34} className={styles.spin} />
                        <p>Cargando notificaciones...</p>
                    </div>
                ) : null}

                {!loading && notifications.length === 0 && schemaReady && !error ? (
                    <div className={styles.emptyState}>
                        <Bell size={44} />
                        <h2>Sin novedades todavia</h2>
                        <p>Cuando un partido termine o tu equipo tenga un evento nuevo, lo vas a ver aca.</p>
                    </div>
                ) : null}

                {notifications.map((notification) => (
                    <Link
                        key={notification.id}
                        href={getNotificationHref(notification)}
                        className={`${styles.notificationItem} ${notification.read_at ? '' : styles.unread}`.trim()}
                        onClick={() => {
                            if (!notification.read_at) {
                                void markRead([notification.id]);
                            }
                        }}
                    >
                        <span className={styles.statusDot} />
                        <span className={styles.itemMain}>
                            <span className={styles.itemTop}>
                                <strong>{notification.title}</strong>
                                <span>{getTypeLabel(notification.type)}</span>
                            </span>
                            <span className={styles.itemBody}>{notification.body}</span>
                            <time>{formatFullDate(notification.created_at)}</time>
                        </span>
                    </Link>
                ))}
            </section>
        </main>
    );
}
