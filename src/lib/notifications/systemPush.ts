import 'server-only';
import { createPrivateKey, sign } from 'node:crypto';

export type StoredPushSubscription = {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
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

function base64UrlEncode(input: Buffer | string) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64');
}

function derToJoseSignature(derSignature: Buffer) {
    let offset = 0;

    if (derSignature[offset++] !== 0x30) {
        throw new Error('Invalid ECDSA signature sequence.');
    }

    const sequenceLength = derSignature[offset++];
    if (sequenceLength + offset !== derSignature.length) {
        throw new Error('Invalid ECDSA signature length.');
    }

    if (derSignature[offset++] !== 0x02) {
        throw new Error('Invalid ECDSA signature integer.');
    }
    const rLength = derSignature[offset++];
    const r = derSignature.subarray(offset, offset + rLength);
    offset += rLength;

    if (derSignature[offset++] !== 0x02) {
        throw new Error('Invalid ECDSA signature integer.');
    }
    const sLength = derSignature[offset++];
    const s = derSignature.subarray(offset, offset + sLength);

    const normalize = (value: Buffer) => {
        let trimmed = value;
        while (trimmed.length > 32 && trimmed[0] === 0) {
            trimmed = trimmed.subarray(1);
        }
        if (trimmed.length > 32) {
            throw new Error('Invalid ECDSA signature integer length.');
        }

        return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed]);
    };

    return Buffer.concat([normalize(r), normalize(s)]);
}

function getVapidConfig(): VapidConfig | null {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || 'mailto:admin@g22scores.com';

    if (!publicKey || !privateKey) {
        return null;
    }

    return { publicKey, privateKey, subject };
}

function createVapidToken(subscriptionEndpoint: string, config: VapidConfig) {
    const publicKeyBytes = base64UrlDecode(config.publicKey);
    if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
        throw new Error('WEB_PUSH_PUBLIC_KEY must be an uncompressed P-256 public key.');
    }

    const privateKey = createPrivateKey({
        key: {
            kty: 'EC',
            crv: 'P-256',
            x: base64UrlEncode(publicKeyBytes.subarray(1, 33)),
            y: base64UrlEncode(publicKeyBytes.subarray(33, 65)),
            d: config.privateKey,
        },
        format: 'jwk',
    });

    const tokenHeader = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const tokenPayload = base64UrlEncode(JSON.stringify({
        aud: new URL(subscriptionEndpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: config.subject,
    }));
    const unsignedToken = `${tokenHeader}.${tokenPayload}`;
    const signature = derToJoseSignature(sign('sha256', Buffer.from(unsignedToken), privateKey));

    return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

export function getPublicVapidKey() {
    return process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || null;
}

export function isSystemPushConfigured() {
    return Boolean(getVapidConfig());
}

export async function sendSystemPush(subscription: StoredPushSubscription): Promise<PushSendResult> {
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
        const token = createVapidToken(subscription.endpoint, config);
        const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: {
                TTL: '180',
                Urgency: 'high',
                Authorization: `vapid t=${token}, k=${config.publicKey}`,
            },
        });

        if (response.ok || response.status === 201 || response.status === 202 || response.status === 204) {
            return {
                ok: true,
                status: response.status,
                expired: false,
            };
        }

        const body = await response.text().catch(() => '');
        return {
            ok: false,
            status: response.status,
            expired: response.status === 404 || response.status === 410,
            error: body || response.statusText || 'push_send_failed',
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            expired: false,
            error: error instanceof Error ? error.message : 'push_send_failed',
        };
    }
}
