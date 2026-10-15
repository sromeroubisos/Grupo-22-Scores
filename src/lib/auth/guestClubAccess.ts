/**
 * Acceso de invitado a un club (demo de La Tablada).
 *
 * `GET /api/auth/guest-club-family` no pide credenciales: setea una cookie que
 * `getGuestAccessContext()` convierte en una membresia `club_family / editor`
 * con acceso al panel del club. Cualquiera que visite esa URL entra.
 *
 * Queda APAGADO salvo que se prenda a proposito con
 * `GUEST_CLUB_ACCESS_ENABLED=true`. Se chequea en los dos extremos —la ruta que
 * emite la cookie y el resolutor que la lee— para que una cookie ya emitida
 * deje de valer apenas se apaga el flag, sin esperar a que expire.
 *
 * ## Por qué la cookie va firmada
 *
 * Antes era JSON plano (`{kind, clubHint, membershipRole}`) y el servidor
 * respetaba el `membershipRole` que viniera: cualquiera editaba la cookie en su
 * navegador, ponia `'admin'` y quedaba admin de la familia del club. Ahora:
 *
 * - El rol lo fija el servidor (`GUEST_CLUB_MEMBERSHIP_ROLE`) y la cookie ni lo
 *   lleva.
 * - La cookie va firmada con HMAC-SHA256 sobre `GUEST_ACCESS_SECRET`, con un
 *   vencimiento ADENTRO del payload firmado: el `maxAge` de la cookie lo
 *   controla el navegador, el `exp` lo controla el servidor.
 * - Sin secreto, el acceso de invitado queda deshabilitado aunque el flag este
 *   prendido. Falla cerrado: mejor una demo caida que una puerta sin llave.
 *
 * Se usa Web Crypto (`crypto.subtle`) y no `node:crypto` porque esto lo lee
 * tambien `src/proxy.ts`, y asi no depende del runtime en el que corra.
 * `crypto.subtle.verify` compara la firma en tiempo constante.
 */
export const GUEST_CLUB_ACCESS_COOKIE = 'g22_guest_club_access';

/** El techo del invitado: edita el panel del club, no administra la familia. */
export const GUEST_CLUB_MEMBERSHIP_ROLE = 'editor';

/** Lo mismo que el `maxAge` de la cookie, pero verificado del lado del servidor. */
export const GUEST_CLUB_ACCESS_TTL_SECONDS = 60 * 60 * 12;

const COOKIE_VERSION = 'v1';
/** Un secreto corto se fuerza por diccionario; 32 caracteres es el piso. */
const MIN_SECRET_LENGTH = 32;

export type GuestClubCookiePayload = {
    kind: 'club_family_guest';
    clubHint: string;
    /** Vencimiento en segundos epoch. */
    exp: number;
};

function getGuestAccessSecret(): string | null {
    const secret = process.env.GUEST_ACCESS_SECRET?.trim() ?? '';
    return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function isGuestClubAccessEnabled(): boolean {
    return process.env.GUEST_CLUB_ACCESS_ENABLED === 'true' && getGuestAccessSecret() !== null;
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
    try {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/')
            + '='.repeat((4 - (value.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
}

async function importKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
}

/**
 * Arma el valor de la cookie: `v1.<payload base64url>.<firma base64url>`.
 * Devuelve null si no hay secreto: el emisor tiene que contestar 404.
 */
export async function signGuestClubCookie(clubHint: string, nowMs: number = Date.now()): Promise<string | null> {
    const secret = getGuestAccessSecret();
    if (!secret) return null;

    const payload: GuestClubCookiePayload = {
        kind: 'club_family_guest',
        clubHint,
        exp: Math.floor(nowMs / 1000) + GUEST_CLUB_ACCESS_TTL_SECONDS,
    };
    const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const signed = `${COOKIE_VERSION}.${body}`;
    const signature = await crypto.subtle.sign('HMAC', await importKey(secret), new TextEncoder().encode(signed));

    return `${signed}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Devuelve el payload solo si la firma es valida y no vencio. Cualquier otra
 * cosa —sin secreto, formato viejo en JSON plano, firma rota, vencida— es null.
 */
export async function verifyGuestClubCookie(rawValue?: string | null, nowMs: number = Date.now()): Promise<GuestClubCookiePayload | null> {
    const secret = getGuestAccessSecret();
    if (!secret || !rawValue) return null;

    const parts = rawValue.split('.');
    if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return null;

    const [version, body, signaturePart] = parts;
    const signature = fromBase64Url(signaturePart);
    const bodyBytes = fromBase64Url(body);
    if (!signature || !bodyBytes) return null;

    try {
        const valid = await crypto.subtle.verify(
            'HMAC',
            await importKey(secret),
            signature as BufferSource,
            new TextEncoder().encode(`${version}.${body}`),
        );
        if (!valid) return null;

        const parsed = JSON.parse(new TextDecoder().decode(bodyBytes)) as Partial<GuestClubCookiePayload>;
        if (parsed?.kind !== 'club_family_guest') return null;
        if (typeof parsed.clubHint !== 'string' || !parsed.clubHint) return null;
        if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= nowMs) return null;

        return { kind: 'club_family_guest', clubHint: parsed.clubHint, exp: parsed.exp };
    } catch {
        return null;
    }
}
