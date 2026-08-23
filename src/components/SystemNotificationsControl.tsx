'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Smartphone, X } from 'lucide-react';
import styles from './SystemNotificationsControl.module.css';

type PushStatus = {
    publicKey: string | null;
    configured: boolean;
    schemaReady: boolean;
    subscribed: boolean;
};

type ControlState = 'checking' | 'unsupported' | 'not-configured' | 'needs-permission' | 'blocked' | 'inactive' | 'active' | 'signed-out' | 'error';

// Que fallo cuando el estado es 'error'. Sin esto las tres causas —sesion caida,
// service worker que no arranca, servidor que contesta mal— comparten el mismo
// "reintenta en unos segundos", que solo es cierto para una de las tres.
type FailureReason = 'service-worker' | 'server' | 'network';

function isLocalhost() {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function canUsePush() {
    if (typeof window === 'undefined') return false;

    return (
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        (window.location.protocol === 'https:' || isLocalhost())
    );
}

function base64UrlToUint8Array(value: string) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);

    for (let index = 0; index < raw.length; index += 1) {
        output[index] = raw.charCodeAt(index);
    }

    return output;
}

function describeError(error: unknown) {
    if (error instanceof Error) {
        return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
    }

    return String(error);
}

async function getReadyServiceWorker() {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return navigator.serviceWorker.ready;
}

async function readRemoteStatus(subscription?: PushSubscription | null): Promise<PushStatus> {
    const params = new URLSearchParams();
    if (subscription?.endpoint) {
        params.set('endpoint', subscription.endpoint);
    }

    const response = await fetch(`/api/notifications/system${params.size ? `?${params.toString()}` : ''}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });

    if (response.status === 401) {
        throw new Error('unauthorized');
    }

    if (!response.ok) {
        throw new Error(`status_failed:${response.status}`);
    }

    return response.json() as Promise<PushStatus>;
}

async function saveSubscription(subscription: PushSubscription) {
    const response = await fetch('/api/notifications/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            subscription: subscription.toJSON(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
        }),
    });

    // 409 no es un fallo del dispositivo: es el servidor avisando que todavia no
    // tiene la tabla de suscripciones. Se distingue para no mandar al usuario a
    // "reintenta en unos segundos", que aca no arregla nada.
    if (response.status === 409) {
        throw new Error('schema_missing');
    }

    if (!response.ok) {
        throw new Error('subscribe_failed');
    }
}

async function deleteSubscription(endpoint: string) {
    const response = await fetch('/api/notifications/system', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ endpoint }),
    });

    if (!response.ok) {
        throw new Error('unsubscribe_failed');
    }
}

export default function SystemNotificationsControl() {
    const [state, setState] = useState<ControlState>('checking');
    const [status, setStatus] = useState<PushStatus | null>(null);
    const [failure, setFailure] = useState<FailureReason | null>(null);
    // El texto crudo de lo que fallo. Se muestra en la tarjeta a proposito: este
    // estado no deberia ocurrir nunca, y cuando ocurre el nombre del error vale
    // mas que una frase amable.
    const [failureDetail, setFailureDetail] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!canUsePush()) {
            setState('unsupported');
            return;
        }

        setState('checking');
        setFailure(null);
        setFailureDetail(null);

        let registration: ServiceWorkerRegistration;

        try {
            registration = await getReadyServiceWorker();
        } catch (error) {
            console.warn('[avisos] no se pudo preparar el service worker', error);
            setFailureDetail(describeError(error));
            setFailure('service-worker');
            setState('error');
            return;
        }

        try {
            const subscription = await registration.pushManager.getSubscription();
            const remoteStatus = await readRemoteStatus(subscription);
            setStatus(remoteStatus);

            if (!remoteStatus.schemaReady) {
                setState('not-configured');
                return;
            }

            if (!remoteStatus.configured || !remoteStatus.publicKey) {
                setState('not-configured');
                return;
            }

            if (Notification.permission === 'denied') {
                setState('blocked');
                return;
            }

            if (subscription && remoteStatus.subscribed && Notification.permission === 'granted') {
                setState('active');
                return;
            }

            setState(Notification.permission === 'default' ? 'needs-permission' : 'inactive');
        } catch (error) {
            // La sesion caida es el caso mas comun y no se arregla reintentando:
            // la pagina cree que hay usuario porque el cliente tiene sesion, pero
            // la cookie que lee el servidor ya no vale.
            if (error instanceof Error && error.message === 'unauthorized') {
                setState('signed-out');
                return;
            }

            console.warn('[avisos] no se pudo revisar el estado', error);
            setFailureDetail(describeError(error));
            setFailure(error instanceof Error && error.message.startsWith('status_failed') ? 'server' : 'network');
            setState('error');
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const content = useMemo(() => {
        if (state === 'active') {
            return {
                title: 'Avisos del celular activos',
                body: 'G22 va a mostrar resultados y eventos de tus equipos favoritos en la bandeja del sistema.',
                tone: styles.active,
            };
        }

        if (state === 'blocked') {
            return {
                title: 'Avisos bloqueados',
                body: 'Habilita las notificaciones de G22 Scores desde los permisos del navegador o del sistema.',
                tone: styles.warning,
            };
        }

        if (state === 'unsupported') {
            return {
                title: 'Avisos no disponibles',
                body: 'Este navegador no permite Web Push. En iPhone instala la app desde Safari; en Android usa Chrome o Edge.',
                tone: styles.warning,
            };
        }

        if (state === 'not-configured') {
            return {
                title: 'Configuracion pendiente',
                body: status && !status.schemaReady
                    ? 'Falta la tabla de suscripciones en el servidor. Mientras tanto los avisos siguen llegando dentro de la app.'
                    : 'Faltan las claves Web Push del servidor. Mientras tanto los avisos siguen llegando dentro de la app.',
                tone: styles.warning,
            };
        }

        if (state === 'signed-out') {
            return {
                title: 'Entra a tu cuenta',
                body: 'Los avisos se activan por dispositivo y necesitan tu sesion abierta. Volve a entrar y probamos de nuevo.',
                tone: styles.warning,
            };
        }

        if (state === 'error') {
            if (failure === 'service-worker') {
                return {
                    title: 'No se pudo revisar el estado',
                    body: failureDetail
                        ? `El service worker no arranco en este navegador. (${failureDetail})`
                        : 'El service worker no arranco en este navegador. Recarga la pagina.',
                    tone: styles.warning,
                };
            }

            const causa = failure === 'server'
                ? 'El servidor respondio con un error.'
                : 'No se pudo contactar al servidor.';

            return {
                title: 'No se pudo revisar el estado',
                body: failureDetail ? `${causa} (${failureDetail})` : causa,
                tone: styles.warning,
            };
        }

        return {
            title: 'Avisos del celular',
            body: 'Activalos para recibir novedades de tus equipos favoritos aunque no estes mirando la app.',
            tone: '',
        };
    }, [state, status, failure, failureDetail]);

    const activate = async () => {
        if (!canUsePush()) {
            setState('unsupported');
            return;
        }

        setBusy(true);

        try {
            const registration = await getReadyServiceWorker();
            const remoteStatus = status ?? await readRemoteStatus();
            if (!remoteStatus.publicKey) {
                setStatus(remoteStatus);
                setState('not-configured');
                return;
            }

            const permission = Notification.permission === 'default'
                ? await Notification.requestPermission()
                : Notification.permission;

            if (permission === 'denied') {
                setState('blocked');
                return;
            }

            const existingSubscription = await registration.pushManager.getSubscription();
            const subscription = existingSubscription ?? await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(remoteStatus.publicKey),
            });

            await saveSubscription(subscription);
            await refresh();
        } catch (error) {
            if (error instanceof Error && error.message === 'schema_missing') {
                setStatus((current) => (current ? { ...current, schemaReady: false } : current));
                setState('not-configured');
                return;
            }

            setState('error');
        } finally {
            setBusy(false);
        }
    };

    const deactivate = async () => {
        setBusy(true);

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await deleteSubscription(subscription.endpoint);
                await subscription.unsubscribe();
            }
            await refresh();
        } catch {
            setState('error');
        } finally {
            setBusy(false);
        }
    };

    const showActivate = state === 'needs-permission' || state === 'inactive' || state === 'error';
    const showDeactivate = state === 'active';

    return (
        <section className={`${styles.control} ${content.tone}`.trim()} aria-label="Notificaciones del sistema">
            <span className={styles.icon}>
                <Smartphone size={20} />
            </span>
            <span className={styles.copy}>
                <strong>{content.title}</strong>
                <span>{content.body}</span>
            </span>
            <span className={styles.actions}>
                {state === 'checking' ? (
                    <span className={styles.statusPill}>
                        <Loader2 size={14} className={styles.spin} />
                        Revisando
                    </span>
                ) : null}

                {showActivate ? (
                    <button type="button" className={styles.primaryAction} disabled={busy} onClick={activate}>
                        {busy ? <Loader2 size={15} className={styles.spin} /> : <BellRing size={15} />}
                        Activar
                    </button>
                ) : null}

                {showDeactivate ? (
                    <button type="button" className={styles.secondaryAction} disabled={busy} onClick={deactivate}>
                        {busy ? <Loader2 size={15} className={styles.spin} /> : <X size={15} />}
                        Desactivar
                    </button>
                ) : null}
            </span>
        </section>
    );
}
