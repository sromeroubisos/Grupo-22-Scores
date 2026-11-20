'use client';

/**
 * Activar los avisos del celular desde cualquier pantalla (no solo desde
 * /notifications). Es la misma secuencia que `SystemNotificationsControl`:
 * service worker -> permiso -> suscripcion con la clave VAPID -> guardarla.
 *
 * El permiso del navegador SOLO se puede pedir desde un toque del usuario, asi
 * que `enablePush()` se llama desde un boton, nunca solo al cargar la pagina.
 */

export const FOLLOW_EVENT = 'g22:followed';

export type PushAvailability =
    | 'unsupported'
    | 'ios-needs-install'
    | 'blocked'
    | 'subscribed'
    | 'available';

export type EnableResult = 'ok' | 'blocked' | 'signed-out' | 'not-configured' | 'error';

function isLocalhost() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function isIos() {
    const ua = navigator.userAgent;
    // iPadOS 13+ se presenta como Mac, pero con pantalla tactil.
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone() {
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function base64UrlToUint8Array(value: string) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
    return output;
}

export async function getPushAvailability(): Promise<PushAvailability> {
    if (typeof window === 'undefined') return 'unsupported';

    // En iPhone, Web Push solo existe con la app instalada en la pantalla de inicio:
    // desde una pestana de Safari no hay `PushManager` y no se puede pedir permiso.
    if (isIos() && !isStandalone()) return 'ios-needs-install';

    const supported =
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        (window.location.protocol === 'https:' || isLocalhost());
    if (!supported) return 'unsupported';

    if (Notification.permission === 'denied') return 'blocked';

    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') return 'subscribed';
    } catch {
        // Sin acceso al service worker: se trata como disponible y el boton lo intenta.
    }

    return 'available';
}

export async function enablePush(): Promise<EnableResult> {
    try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const registration = await navigator.serviceWorker.ready;

        const statusResponse = await fetch('/api/notifications/system', {
            cache: 'no-store',
            credentials: 'same-origin',
        });
        if (statusResponse.status === 401) return 'signed-out';
        if (!statusResponse.ok) return 'error';

        const status = await statusResponse.json() as {
            publicKey: string | null;
            configured: boolean;
            schemaReady: boolean;
        };
        if (!status.publicKey || !status.configured || !status.schemaReady) return 'not-configured';

        const permission = Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission !== 'granted') return 'blocked';

        const wanted = base64UrlToUint8Array(status.publicKey);
        let subscription = await registration.pushManager.getSubscription();

        // Una suscripcion nacida con otra clave VAPID rebota para siempre: se rehace.
        if (subscription) {
            const current = subscription.options?.applicationServerKey;
            const same = current
                ? (() => {
                    const actual = new Uint8Array(current);
                    return actual.length === wanted.length && actual.every((byte, i) => byte === wanted[i]);
                })()
                : false;
            if (!same) {
                await subscription.unsubscribe();
                subscription = null;
            }
        }

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: wanted,
            });
        }

        const save = await fetch('/api/notifications/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                userAgent: navigator.userAgent,
                platform: navigator.platform,
            }),
        });
        if (save.status === 401) return 'signed-out';
        if (save.status === 409) return 'not-configured';
        return save.ok ? 'ok' : 'error';
    } catch (error) {
        console.warn('[avisos] no se pudo activar', error);
        return 'error';
    }
}
