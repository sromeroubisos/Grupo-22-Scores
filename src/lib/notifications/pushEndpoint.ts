// El endpoint de una suscripción Web Push lo manda el navegador... o cualquiera
// que llame a /api/notifications/system con un JSON armado a mano. El servidor
// después le hace un POST desde adentro de Vercel: sin control, era un SSRF ciego
// (`http://169.254.169.254/...`) o un tarpit (un host que nunca contesta y ata
// el cron de avisos). Solo pasan los push services reales de los navegadores.
//
// Sin `*.googleapis.com` a secas a propósito: ahí también vive storage.googleapis.com,
// que sirve buckets de cualquiera. Chrome, Edge (Chromium), Opera y Samsung usan FCM.

const EXACT_HOSTS = new Set([
    'fcm.googleapis.com',
    'android.googleapis.com',
    'updates.push.services.mozilla.com',
]);

const HOST_SUFFIXES = [
    '.push.services.mozilla.com', // Firefox
    '.push.apple.com',            // Safari (web.push.apple.com)
    '.notify.windows.com',        // Edge legacy / WNS (wns2-*.notify.windows.com)
];

export function isAllowedPushEndpoint(raw: string): boolean {
    if (!raw || raw.length > 2048) return false;

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'https:') return false;
    if (parsed.port && parsed.port !== '443') return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    if (EXACT_HOSTS.has(host)) return true;
    return HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
