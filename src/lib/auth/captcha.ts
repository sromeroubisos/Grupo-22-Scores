/**
 * CAPTCHA en los formularios de auth (Cloudflare Turnstile).
 *
 * Es la única defensa que distingue un humano de un script **antes** de que se
 * verifique la credencial. Hace falta porque el rate limiting del login no se
 * puede implementar en este repo: `signInWithPassword` va del navegador directo
 * a Supabase, y aunque lo pasáramos por un endpoint propio, la anon key es
 * pública y `POST /auth/v1/token` queda accesible igual.
 *
 * Quien valida el token es **Supabase**, no nosotros: se manda en
 * `options.captchaToken` y el servidor de auth lo verifica contra Cloudflare
 * antes de mirar la contraseña. Por eso no alcanza con poner el widget: hay que
 * activar Captcha protection en el dashboard, o Supabase ignora el token y esto
 * queda de adorno. Ver SEGURIDAD_SUPABASE_DASHBOARD.md.
 *
 * Todo esto es **inerte** mientras no exista `NEXT_PUBLIC_TURNSTILE_SITE_KEY`:
 * sin site key el campo no se renderiza y los formularios no exigen token. Así
 * el código puede vivir en `main` antes de que exista la cuenta de Cloudflare,
 * sin romperle el login a nadie.
 */

export function getCaptchaSiteKey(): string | null {
    const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    return key && key.trim() ? key.trim() : null;
}

export function isCaptchaEnabled(): boolean {
    return getCaptchaSiteKey() !== null;
}

/**
 * Qué mandarle a Supabase. Cuando el CAPTCHA está apagado devuelve `undefined`
 * y no `null`: un `captchaToken: null` explícito hace que supabase-js mande el
 * campo en el body, y el servidor lo rechaza por inválido.
 */
export function captchaOptions(token: string | null): { captchaToken?: string } {
    return isCaptchaEnabled() && token ? { captchaToken: token } : {};
}

/** Mensaje único, para que las tres pantallas digan lo mismo. */
export const CAPTCHA_PENDING_MESSAGE = 'Completa la verificacion anti-robots para continuar.';
