// Detect in-app / embedded browsers (WKWebView / Android WebView used inside
// other apps). OAuth with Google is unreliable or outright blocked in these:
// the PKCE verifier cookie set via the start fetch frequently does not survive
// the cross-origin round-trip to accounts.google.com and back, so the worker
// lands on /login?error=auth-pkce-error. The robust path in these browsers is
// email + password (no cross-origin hop), or opening the site in the real
// system browser.

export type EmbeddedBrowserInfo = {
    isEmbedded: boolean;
    /** Best-effort host app label, e.g. "Gmail", "Instagram", null if generic. */
    app: string | null;
};

const NOT_EMBEDDED: EmbeddedBrowserInfo = { isEmbedded: false, app: null };

// Explicit in-app browser signatures (any OS).
const NAMED_APPS: Array<{ re: RegExp; app: string }> = [
    { re: /Instagram/i, app: 'Instagram' },
    { re: /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|FB4A|FBIOS/i, app: 'Facebook' },
    { re: /\bWhatsApp\b/i, app: 'WhatsApp' },
    { re: /\bLine\//i, app: 'LINE' },
    { re: /\bTwitter\b|TwitterAndroid/i, app: 'Twitter/X' },
    { re: /\bTikTok\b|musical_ly|BytedanceWebview/i, app: 'TikTok' },
    { re: /\bSnapchat\b/i, app: 'Snapchat' },
    { re: /\bGSA\b/i, app: 'Google' },
];

export function detectEmbeddedBrowser(userAgent?: string | null): EmbeddedBrowserInfo {
    const ua = (userAgent ?? '').trim();
    if (!ua) return NOT_EMBEDDED;

    for (const { re, app } of NAMED_APPS) {
        if (re.test(ua)) return { isEmbedded: true, app };
    }

    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    // Android WebView marks itself with "; wv)".
    if (isAndroid && /;\s*wv\)/i.test(ua)) {
        return { isEmbedded: true, app: null };
    }

    // iOS in-app WKWebViews keep the AppleWebKit token but, unlike real
    // Safari/Chrome/Firefox/Edge for iOS, do NOT advertise their own browser
    // token. Gmail's in-app browser (the reported case) falls here.
    if (isIOS && /AppleWebKit/i.test(ua)) {
        const isRealIOSBrowser = /(Safari|CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
        if (!isRealIOSBrowser) {
            return { isEmbedded: true, app: null };
        }
    }

    return NOT_EMBEDDED;
}

export function detectEmbeddedBrowserFromNavigator(): EmbeddedBrowserInfo {
    if (typeof navigator === 'undefined') return NOT_EMBEDDED;
    return detectEmbeddedBrowser(navigator.userAgent);
}
