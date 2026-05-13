'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import type { UserNotification } from '@/lib/notifications/types';
import styles from './NotificationsBell.module.css';

function formatNotificationDate(value: string) {
    try {
        return new Intl.DateTimeFormat('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
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

export default function NotificationsBell() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const {
        notifications,
        unreadCount,
        loading,
        error,
        schemaReady,
        markRead,
        markAllRead,
    } = useNotifications({ limit: 8 });

    const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
    const isActive = pathname?.startsWith('/notifications') ?? false;
    const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('touchstart', handleOutsideClick, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('touchstart', handleOutsideClick);
        };
    }, []);

    if (!user) {
        return null;
    }

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <button
                type="button"
                className={`${styles.trigger} ${isActive ? styles.active : ''}`.trim()}
                aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : 'Notificaciones'}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                <Bell size={18} />
                {unreadCount > 0 ? <span className={styles.badge}>{unreadLabel}</span> : null}
            </button>

            {isOpen ? (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <div>
                            <strong>Notificaciones</strong>
                            <span>{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al dia'}</span>
                        </div>
                        <button
                            type="button"
                            className={styles.markButton}
                            aria-label="Marcar todas como leidas"
                            disabled={unreadCount === 0}
                            onClick={() => {
                                void markAllRead();
                            }}
                        >
                            <CheckCheck size={15} />
                        </button>
                    </div>

                    <div className={styles.list}>
                        {!schemaReady ? (
                            <div className={styles.empty}>
                                <strong>Activacion pendiente</strong>
                                <span>Aplica la migracion de notificaciones en Supabase.</span>
                            </div>
                        ) : error ? (
                            <div className={styles.empty}>
                                <strong>No se pudo cargar</strong>
                                <span>{error}</span>
                            </div>
                        ) : loading && latestNotifications.length === 0 ? (
                            <div className={styles.loading}>
                                <Loader2 size={18} className={styles.spin} />
                                <span>Cargando...</span>
                            </div>
                        ) : latestNotifications.length === 0 ? (
                            <div className={styles.empty}>
                                <strong>Sin novedades</strong>
                                <span>Cuando tus seguidos tengan actividad, va a aparecer aca.</span>
                            </div>
                        ) : (
                            latestNotifications.map((notification) => (
                                <Link
                                    key={notification.id}
                                    href={getNotificationHref(notification)}
                                    className={`${styles.item} ${notification.read_at ? '' : styles.unread}`.trim()}
                                    onClick={() => {
                                        setIsOpen(false);
                                        if (!notification.read_at) {
                                            void markRead([notification.id]);
                                        }
                                    }}
                                >
                                    <span className={styles.itemDot} />
                                    <span className={styles.itemContent}>
                                        <strong>{notification.title}</strong>
                                        <span>{notification.body}</span>
                                        <time>{formatNotificationDate(notification.created_at)}</time>
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>

                    <Link
                        href="/notifications"
                        className={styles.footerLink}
                        onClick={() => setIsOpen(false)}
                    >
                        Ver todas
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
