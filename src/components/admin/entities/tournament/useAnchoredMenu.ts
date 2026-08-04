'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface AnchorPosition {
    top: number;
    left: number;
    width: number;
}

/**
 * Posiciona un menu flotante debajo de su disparador.
 *
 * Los menus del header se portalean a <body> para escapar del `backdrop-filter`
 * del header (que crea un bloque contenedor y rompe `position: fixed` en los
 * descendientes). Pero al portalear, el `position: absolute; top: calc(100% +
 * 8px)` con el que estaban escritos deja de medirse contra el disparador y pasa
 * a medirse contra el body: el menu aparecia al final del documento, alargando
 * la pagina. Acá se calculan coordenadas de viewport a partir del rect real del
 * disparador, para usarlas con `position: fixed`.
 *
 * En telefonos no se usa: tournament-mobile.css ancla estos menus como hoja
 * inferior con `!important`, que le gana al estilo inline.
 */
export function useAnchoredMenu(
    open: boolean,
    triggerRef: RefObject<HTMLElement | null>,
    preferredWidth: number,
): AnchorPosition | null {
    const [position, setPosition] = useState<AnchorPosition | null>(null);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const GUTTER = 12;
        const GAP = 8;

        const update = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;

            const rect = trigger.getBoundingClientRect();
            const width = Math.min(preferredWidth, window.innerWidth - GUTTER * 2);
            // Alineado a la derecha del disparador y acotado al viewport, para que
            // un disparador cerca del borde no empuje el menu fuera de pantalla.
            const left = Math.min(
                Math.max(GUTTER, rect.right - width),
                Math.max(GUTTER, window.innerWidth - width - GUTTER),
            );

            setPosition({ top: Math.round(rect.bottom + GAP), left: Math.round(left), width });
        };

        update();
        window.addEventListener('resize', update);
        // `true`: el header es sticky dentro del scroll de la pagina, asi que el
        // disparador se mueve con cualquier contenedor que scrollee.
        window.addEventListener('scroll', update, true);

        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [open, triggerRef, preferredWidth]);

    return position;
}
