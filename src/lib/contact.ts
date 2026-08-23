/**
 * El canal de WhatsApp, en un solo interruptor.
 *
 * Hoy no hay número: `NEXT_PUBLIC_WHATSAPP_NUMBER` está vacía y el sitio no
 * dibuja un solo botón verde de WhatsApp en ninguna parte. El día que haya
 * número, se setea la variable en Vercel y aparece — sin tocar código, sin API
 * de WhatsApp Business y sin cuenta de nada: `wa.me` sólo necesita el número.
 *
 * Por eso vive todo acá y no repartido en la página: encender el canal tiene
 * que ser un cambio en UN lugar, no una cacería de condicionales.
 */

/**
 * `process.env.NEXT_PUBLIC_*` se reemplaza en tiempo de build por su literal,
 * así que la lectura tiene que ser estática. Nada de índices dinámicos.
 */
const NUMERO_CRUDO = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

/**
 * wa.me quiere sólo dígitos, con código de país y sin `+`, sin espacios y sin
 * guiones. Limpiar acá evita que un `+54 9 351 ...` copiado del teléfono
 * genere un link roto que nadie prueba hasta que un dirigente lo toca.
 */
const NUMERO = NUMERO_CRUDO.replace(/\D/g, '');

/** Un número de país + área + abonado no baja de 8 dígitos en ningún lado. */
const MINIMO_DIGITOS = 8;

export const MENSAJE_DEMO = 'Hola, quiero ver una demo de G22 Scores';

export function hasWhatsapp(): boolean {
    return NUMERO.length >= MINIMO_DIGITOS;
}

/**
 * El link listo para usar, o `null` si todavía no hay número.
 *
 * Devuelve `null` en vez de un string vacío a propósito: un `href=""` navega a
 * la página actual y parece que el botón anda.
 */
export function whatsappUrl(mensaje: string = MENSAJE_DEMO): string | null {
    if (!hasWhatsapp()) return null;
    return `https://wa.me/${NUMERO}?text=${encodeURIComponent(mensaje)}`;
}
