// Pedir una URL ajena desde el servidor sin convertirlo en un telescopio hacia
// la red interna.
//
// El problema no es la URL que llega: es a DÓNDE termina conectando el socket.
// Chequear el texto del host no alcanza (un dominio público puede resolver a
// 10.0.0.5), chequear el DNS antes del fetch tampoco (el fetch vuelve a
// resolver y el atacante contesta otra IP la segunda vez: DNS rebinding), y
// `redirect: 'follow'` tira todo por la borda porque el primer salto es
// público y el segundo apunta a 169.254.169.254.
//
// Por eso esto no usa `fetch`: usa node:http/https con un `lookup` propio. La
// IP que se valida es la MISMA con la que se abre el socket, en cada salto, y
// los redirects se siguen a mano revalidando cada destino. Encima van tope de
// tiempo y tope de bytes, para que una página lenta o infinita no ate la
// función.
//
// No hay lista blanca de hosts a propósito: los escudos cargados a mano y los
// links de video viven en cualquier dominio público. Lo que se bloquea es el
// destino de red.

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { lookup as dnsLookupAsync } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable, Transform } from 'node:stream';
import zlib from 'node:zlib';

export type SafeFetchErrorCode =
    | 'invalid_url'
    | 'blocked_destination'
    | 'too_many_redirects'
    | 'timeout'
    | 'too_large'
    | 'network';

export class SafeFetchError extends Error {
    readonly code: SafeFetchErrorCode;

    constructor(code: SafeFetchErrorCode, message?: string) {
        super(message ?? code);
        this.name = 'SafeFetchError';
        this.code = code;
    }
}

// ─── Direcciones vedadas ──────────────────────────────────────────────────────

function parseIpv4(address: string): number[] | null {
    const parts = address.split('.');
    if (parts.length !== 4) return null;
    const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
}

export function isPrivateIpv4(address: string): boolean {
    const octets = parseIpv4(address);
    // Lo que no se puede leer como IPv4 se trata como vedado: ante la duda, no se conecta.
    if (!octets) return true;

    const [first, second] = octets;
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;                 // link-local: metadata de la nube
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && (second === 0 || second === 168)) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;  // CGNAT
    if (first === 198 && (second === 18 || second === 19)) return true; // benchmarking
    if (first >= 224) return true;                                     // multicast / reservados / broadcast
    return false;
}

/** Expande un IPv6 a sus 8 grupos de 16 bits. null si no es IPv6 válido. */
function expandIpv6(address: string): number[] | null {
    let text = address.toLowerCase().split('%')[0];
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);

    // Cola IPv4 embebida (::ffff:1.2.3.4, ::1.2.3.4): se pasa a dos grupos hex.
    const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (tail) {
        const octets = parseIpv4(tail[1]);
        if (!octets) return null;
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        text = `${text.slice(0, -tail[1].length)}${high}:${low}`;
    }

    const halves = text.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - rest.length;
    if (halves.length === 1 ? missing !== 0 : missing < 0) return null;

    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
    if (groups.length !== 8) return null;
    const values = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
    return values.every((value) => Number.isInteger(value)) ? values : null;
}

export function isPrivateIpv6(address: string): boolean {
    const groups = expandIpv6(address);
    if (!groups) return true;

    if (groups.every((group) => group === 0)) return true;                       // ::
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1

    const embeddedIpv4 = () => [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');

    // IPv4-mapped (::ffff:a.b.c.d) e IPv4-compatible (::a.b.c.d): manda la IPv4 de adentro.
    if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
        return isPrivateIpv4(embeddedIpv4());
    }
    // NAT64 (64:ff9b::/96): también envuelve una IPv4.
    if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
        return isPrivateIpv4(embeddedIpv4());
    }

    const first = groups[0];
    if ((first & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique local (ULA)
    if ((first & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true;   // fec0::/10 site-local (deprecado, igual vedado)
    if ((first & 0xff00) === 0xff00) return true;   // ff00::/8 multicast
    if (first === 0x2001 && groups[1] === 0x0db8) return true; // documentación
    return false;
}

export function isBlockedAddress(address: string, family?: number | string): boolean {
    const version = family === 6 || family === 'IPv6' ? 6 : family === 4 || family === 'IPv4' ? 4 : isIP(address);
    if (version === 4) return isPrivateIpv4(address);
    if (version === 6) return isPrivateIpv6(address);
    return true;
}

// ─── Forma de la URL ──────────────────────────────────────────────────────────

/**
 * La URL parseada si su FORMA es aceptable (http/https, puerto 80/443, sin
 * usuario:clave, host que no es local ni una IP vedada). No resuelve DNS: eso
 * pasa al conectar.
 */
export function parseSafeHttpUrl(raw: string | URL): URL | null {
    let parsed: URL;
    try {
        parsed = typeof raw === 'string' ? new URL(raw) : new URL(raw.toString());
    } catch {
        return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return null;
    // `https://user:pass@host` no lo necesita ningún escudo, y confunde a los
    // filtros que leen la URL como texto.
    if (parsed.username || parsed.password) return null;

    const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
    if (!hostname) return null;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.home.arpa')) return null;
    if (isIP(hostname) && isBlockedAddress(hostname)) return null;
    // Un nombre sin punto (`metadata`, `intranet`) solo resuelve dentro de una red privada.
    if (!isIP(hostname) && !hostname.includes('.')) return null;

    return parsed;
}

/**
 * Chequeo previo, para quien solo quiere saber si vale la pena intentar. NO
 * reemplaza a `safeFetch`: entre este lookup y el del fetch el DNS puede
 * cambiar. `safeFetch` vuelve a validar en el momento de conectar.
 */
export async function isPublicHttpUrl(raw: string | URL): Promise<boolean> {
    const parsed = parseSafeHttpUrl(raw);
    if (!parsed) return false;
    const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (isIP(hostname)) return true; // ya validada en parseSafeHttpUrl

    try {
        const addresses = await dnsLookupAsync(hostname, { all: true, verbatim: true });
        return addresses.length > 0 && addresses.every(({ address, family }) => !isBlockedAddress(address, family));
    } catch {
        return false;
    }
}

/**
 * El `lookup` que usa el socket. Resuelve TODAS las direcciones y rechaza si
 * cualquiera es privada: si se aceptara "alguna pública", el sistema podría
 * elegir la privada para conectar.
 */
function guardedLookup(
    hostname: string,
    options: LookupOptions,
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
    dnsLookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
        if (error) {
            callback(error, '', 0);
            return;
        }
        const list = addresses as LookupAddress[];
        if (list.length === 0 || list.some(({ address, family }) => isBlockedAddress(address, family))) {
            callback(new SafeFetchError('blocked_destination', `${hostname} resuelve a una dirección no pública`), '', 0);
            return;
        }
        if (options.all) {
            callback(null, list);
            return;
        }
        callback(null, list[0].address, list[0].family);
    });
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export type SafeFetchOptions = {
    method?: 'GET' | 'HEAD';
    headers?: Record<string, string>;
    /** Saltos de redirect permitidos. Cada uno se revalida entero. Default 3. */
    maxRedirects?: number;
    /** Tope de tiempo en ms. Default 5000. */
    timeoutMs?: number;
    /**
     * Si el tope de tiempo cubre también la lectura del cuerpo (default true).
     * Una descarga larga lo apaga y cubre solo hasta tener los encabezados.
     */
    timeoutCoversBody?: boolean;
    /** Tope de bytes del cuerpo YA descomprimido: más que eso corta el stream con `too_large`. */
    maxBytes?: number;
};

export type SafeFetchResult = {
    response: Response;
    /** La URL del último salto: contra la que hay que resolver links relativos. */
    url: string;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; stream: http.IncomingMessage };

function requestOnce(
    target: URL,
    options: SafeFetchOptions,
    register: (request: http.ClientRequest) => void,
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const transport = target.protocol === 'https:' ? https : http;
        const request = transport.request(target, {
            method: options.method ?? 'GET',
            headers: {
                'accept-encoding': 'gzip, deflate, br',
                ...options.headers,
            },
            lookup: guardedLookup as unknown as http.RequestOptions['lookup'],
            // Sin agente compartido: un socket del pool abierto por otro camino no
            // pasó por `guardedLookup`.
            agent: false,
        });
        register(request);
        request.once('response', (stream) => {
            // Un error del socket después de los encabezados (timeout, reset) llega
            // también al stream; sin oyente propio tumbaría el proceso. Quien lee el
            // cuerpo lo ve igual por su propio lado.
            stream.on('error', () => undefined);
            resolve({ status: stream.statusCode ?? 0, headers: stream.headers, stream });
        });
        // `on` y no `once`: el timer puede destruir el pedido después de un primer error.
        request.on('error', reject);
        request.end();
    });
}

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(raw)) {
        if (value === undefined || name === 'set-cookie') continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    return headers;
}

function decodeStream(stream: Readable, encoding: string | null): Readable {
    const normalized = (encoding || '').trim().toLowerCase();
    if (normalized === 'gzip' || normalized === 'x-gzip') return stream.pipe(zlib.createGunzip());
    if (normalized === 'deflate') return stream.pipe(zlib.createUnzip());
    if (normalized === 'br') return stream.pipe(zlib.createBrotliDecompress());
    return stream;
}

function capStream(stream: Readable, maxBytes: number): Readable {
    let received = 0;
    const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length;
            if (received > maxBytes) {
                callback(new SafeFetchError('too_large', `el cuerpo supera ${maxBytes} bytes`));
                return;
            }
            callback(null, chunk);
        },
    });
    stream.on('error', (error) => counter.destroy(error));
    return stream.pipe(counter);
}

/**
 * GET/HEAD a una URL pública, con el destino validado en cada salto y en el
 * momento de conectar. Tira `SafeFetchError` si la URL o algún salto es
 * inaceptable, si se pasa de redirects o de tiempo. Las respuestas 4xx/5xx NO
 * tiran: vuelven como Response con su status, igual que `fetch`.
 */
export async function safeFetch(rawUrl: string | URL, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const coversBody = options.timeoutCoversBody ?? true;

    let current: http.ClientRequest | null = null;
    let activeBody: Readable | null = null;
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        const error = new SafeFetchError('timeout', `sin respuesta en ${timeoutMs} ms`);
        current?.destroy(error);
        activeBody?.destroy(error);
    }, timeoutMs);
    const stopTimer = () => clearTimeout(timer);

    let target = parseSafeHttpUrl(rawUrl);
    if (!target) {
        stopTimer();
        throw new SafeFetchError('invalid_url');
    }

    try {
        for (let hop = 0; ; hop += 1) {
            let raw: RawResponse;
            try {
                raw = await requestOnce(target, options, (request) => {
                    current = request;
                });
            } catch (error) {
                if (error instanceof SafeFetchError) throw error;
                if (timedOut) throw new SafeFetchError('timeout');
                // `guardedLookup` puede llegar envuelto por el socket: se busca el código.
                if ((error as { code?: string })?.code === 'blocked_destination') {
                    throw new SafeFetchError('blocked_destination');
                }
                throw new SafeFetchError('network', error instanceof Error ? error.message : String(error));
            }

            const location = raw.headers.location;
            if (REDIRECT_STATUSES.has(raw.status) && location) {
                raw.stream.resume();
                raw.stream.destroy();
                if (hop >= maxRedirects) throw new SafeFetchError('too_many_redirects');

                let next: URL | null = null;
                try {
                    next = parseSafeHttpUrl(new URL(location, target));
                } catch {
                    next = null;
                }
                if (!next) throw new SafeFetchError('blocked_destination', 'redirect a un destino no permitido');
                target = next;
                continue;
            }

            const headers = toHeaders(raw.headers);
            const finalUrl = target.toString();

            if (NULL_BODY_STATUSES.has(raw.status) || options.method === 'HEAD' || raw.status < 200 || raw.status > 599) {
                raw.stream.resume();
                raw.stream.destroy();
                stopTimer();
                const status = raw.status >= 200 && raw.status <= 599 ? raw.status : 502;
                return { response: new Response(null, { status, headers }), url: finalUrl };
            }

            let body: Readable = raw.stream;
            const encoding = headers.get('content-encoding');
            if (encoding && encoding.toLowerCase() !== 'identity') {
                body = decodeStream(raw.stream, encoding);
                raw.stream.on('error', (error) => body.destroy(error));
                // El largo y la codificación eran los del cuerpo comprimido.
                headers.delete('content-encoding');
                headers.delete('content-length');
            }
            if (options.maxBytes && options.maxBytes > 0) {
                body = capStream(body, options.maxBytes);
            }

            if (coversBody) {
                // Si vence a mitad del cuerpo, el timer corta también el stream que
                // está leyendo el llamador (los pipes no propagan el destroy solos).
                activeBody = body;
                body.once('close', stopTimer);
                body.once('end', stopTimer);
                body.once('error', stopTimer);
            } else {
                stopTimer();
            }

            const webBody = Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;
            return { response: new Response(webBody, { status: raw.status, headers }), url: finalUrl };
        }
    } catch (error) {
        stopTimer();
        throw error;
    }
}

/**
 * Lee el cuerpo entero con tope de bytes. Tira `too_large` si se pasa, en vez
 * de devolver un pedazo: un escudo truncado no es un escudo.
 */
export async function readBodyCapped(response: Response, maxBytes: number): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new SafeFetchError('too_large');
    }

    const reader = response.body?.getReader();
    if (!reader) return Buffer.alloc(0);

    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw new SafeFetchError('too_large');
            }
            chunks.push(value);
        }
    } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        const cause = (error as { cause?: unknown })?.cause;
        if (cause instanceof SafeFetchError) throw cause;
        throw new SafeFetchError('network', error instanceof Error ? error.message : String(error));
    }
    return Buffer.concat(chunks);
}

/** `safeFetch` + `readBodyCapped`: para quien quiere el cuerpo entero en memoria. */
export async function safeFetchBuffer(
    rawUrl: string | URL,
    options: SafeFetchOptions & { maxBytes: number },
): Promise<{ status: number; headers: Headers; url: string; body: Buffer }> {
    const { response, url } = await safeFetch(rawUrl, options);
    const body = await readBodyCapped(response, options.maxBytes);
    return { status: response.status, headers: response.headers, url, body };
}
