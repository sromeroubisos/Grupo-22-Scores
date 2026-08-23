'use client';

import { track } from '@vercel/analytics';

/**
 * Los eventos del sitio, con una sola puerta.
 *
 * El proyecto ya monta `<Analytics />` de Vercel en el layout, pero nunca emitió
 * un evento propio: sólo mide páginas vistas. Esto agrega los eventos custom sin
 * atarse a la herramienta — si mañana entra otra, se cambia este archivo y no
 * los diez lugares que la llaman.
 *
 * **Nunca tira.** Una promo que rompe la página porque el bloqueador de
 * publicidad del visitante se comió el script de analytics es exactamente al
 * revés de lo que queremos: el hincha que entró a ver un resultado no se puede
 * quedar sin resultado por una métrica nuestra.
 *
 * Los eventos custom se ven en Vercel Analytics con plan Pro. Sin Pro se emiten
 * igual y no molestan a nadie.
 */

export type PropiedadesEvento = Record<string, string | number | boolean | null>;

export type EventoPromo =
    | 'clubs_promo_view'
    | 'clubs_promo_click'
    | 'demo_form_start'
    | 'demo_form_submit';

export function trackEvent(nombre: EventoPromo | string, propiedades?: PropiedadesEvento): void {
    try {
        if (propiedades) {
            track(nombre, propiedades);
        } else {
            track(nombre);
        }
    } catch {
        // Sin analytics (bloqueador, script caído, entorno sin red): la página sigue.
    }
}
