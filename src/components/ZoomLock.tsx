'use client';

import { useEffect } from 'react';

/**
 * Bloquea el zoom con los dedos en todo el sitio.
 *
 * `user-scalable=no` en el meta viewport no alcanza: Safari de iPhone lo ignora
 * desde iOS 10. Lo que sí respeta es cancelar los eventos `gesture*` (pellizco)
 * y el segundo toque rápido del doble toque. El zoom del navegador o del sistema
 * (Ctrl +/-, ajustes de la compu) no se toca: eso no pasa por acá.
 *
 * Con el zoom bloqueado, la barra inferior no puede quedar desfasada del borde
 * por un viewport escalado, que era la causa de que flotara a mitad de pantalla.
 */
export default function ZoomLock() {
    useEffect(() => {
        const prevent = (event: Event) => event.preventDefault();

        // Pellizco en Safari de iOS.
        document.addEventListener('gesturestart', prevent);
        document.addEventListener('gesturechange', prevent);
        document.addEventListener('gestureend', prevent);

        // Pellizco con dos dedos donde `gesture*` no existe (Chrome/Android).
        const onTouchMove = (event: TouchEvent) => {
            if (event.touches.length > 1) event.preventDefault();
        };
        document.addEventListener('touchmove', onTouchMove, { passive: false });

        // Doble toque rápido = zoom en iOS.
        let lastTouchEnd = 0;
        const onTouchEnd = (event: TouchEvent) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) event.preventDefault();
            lastTouchEnd = now;
        };
        document.addEventListener('touchend', onTouchEnd, { passive: false });

        return () => {
            document.removeEventListener('gesturestart', prevent);
            document.removeEventListener('gesturechange', prevent);
            document.removeEventListener('gestureend', prevent);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
    }, []);

    return null;
}
