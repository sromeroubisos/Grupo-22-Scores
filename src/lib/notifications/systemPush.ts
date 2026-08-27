import 'server-only';
// web-push es CommonJS: los exports nombrados no existen para un import ESM
// (fallo al probarlo en Node puro), asi que se entra por el default.
import webPush from 'web-push';

export type StoredPushSubscription = {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
};

/**
 * Lo que viaja adentro del push, cifrado (RFC 8291). Es lo que el service
 * worker muestra en la bandeja SIN volver a preguntarle nada al servidor.
 * Antes el push iba vacio y el SW salia a buscar el detalle a
 * `/api/notifications` con la cookie de sesion; con la app cerrada varias
 * horas esa sesion suele estar vencida y el aviso salia generico o no salia.
 */
export type SystemPushPayload = {
    id: string;
    title: string;
    body: string;
    entity_type?: string | null;
    entity_id?: string | null;
    match_id?: string | null;
};

export type PushSendResult = {
    ok: boolean;
    status: number;
    expired: boolean;
    error?: string;
};

type VapidConfig = {
    publicKey: string;
    privateKey: string;
    subject: string;
};

/**
 * Cuanto tiempo retiene el push service el mensaje si el celular no responde.
 * Con 180 segundos, un telefono bloqueado en modo ahorro (Doze en Android,
 * background app refresh en iOS) se despertaba tarde y el push ya no existia:
 * "no me llegan cuando tengo el celular bloqueado" era literalmente esto.
 * Seis horas cubren una noche entera; un resultado sigue valiendo a la manana.
 */
export const PUSH_TTL_SECONDS = 6 * 60 * 60;

const FALLBACK_VAPID_SUBJECT = 'mailto:hola@g22scores.com';

/**
 * El `sub` de un JWT VAPID solo admite `mailto:` o `https:`. NEXT_PUBLIC_SITE_URL
 * no sirve como fallback a ciegas: en desarrollo vale `http://localhost:3000` y
 * con eso el push service rechaza el envio con 400.
 */
function normalizeVapidSubject(candidate: string | undefined): string | null {
    const value = candidate?.trim();
    if (!value) return null;

    const scheme = value.toLowerCase();
    return scheme.startsWith('mailto:') || scheme.startsWith('https://') ? value : null;
}

function getVapidConfig(): VapidConfig | null {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY;
    // La privada es el campo `d` del JWK (32 bytes en base64url), no un PEM.
    // Es exactamente el formato que web-push espera como privateKey.
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
    const subject = normalizeVapidSubject(process.env.WEB_PUSH_SUBJECT)
        ?? normalizeVapidSubject(process.env.NEXT_PUBLIC_SITE_URL)
        ?? FALLBACK_VAPID_SUBJECT;

    if (!publicKey || !privateKey) {
        return null;
    }

    return { publicKey, privateKey, subject };
}

export function getPublicVapidKey() {
    return process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || null;
}

export function isSystemPushConfigured() {
    return Boolean(getVapidConfig());
}

function serializePayload(payload: SystemPushPayload | null | undefined) {
    if (!payload) return null;

    return JSON.stringify({
        id: payload.id,
        title: payload.title,
        body: payload.body,
        entity_type: payload.entity_type ?? null,
        entity_id: payload.entity_id ?? null,
        match_id: payload.match_id ?? null,
    });
}

export async function sendSystemPush(
    subscription: StoredPushSubscription,
    payload?: SystemPushPayload | null,
): Promise<PushSendResult> {
    const config = getVapidConfig();
    if (!config) {
        return {
            ok: false,
            status: 0,
            expired: false,
            error: 'web_push_not_configured',
        };
    }

    try {
        const response = await webPush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            serializePayload(payload),
            {
                vapidDetails: {
                    subject: config.subject,
                    publicKey: config.publicKey,
                    privateKey: config.privateKey,
                },
                TTL: PUSH_TTL_SECONDS,
                urgency: 'high',
                contentEncoding: 'aes128gcm',
            },
        );

        return {
            ok: true,
            status: response.statusCode,
            expired: false,
        };
    } catch (error) {
        if (error instanceof webPush.WebPushError) {
            const body = typeof error.body === 'string' ? error.body : '';

            // Una suscripcion creada con otro par VAPID rebota para siempre: Apple lo
            // dice con VapidPkHashMismatch y otros push services con un 403. No se
            // arregla reintentando, asi que se marca para que el cron la apague en
            // vez de fallar con cada notificacion hasta el fin de los tiempos.
            const keyMismatch = error.statusCode === 403 || body.includes('VapidPkHashMismatch');

            return {
                ok: false,
                status: error.statusCode,
                expired: error.statusCode === 404 || error.statusCode === 410 || keyMismatch,
                error: body || error.message || 'push_send_failed',
            };
        }

        return {
            ok: false,
            status: 0,
            expired: false,
            error: error instanceof Error ? error.message : 'push_send_failed',
        };
    }
}
