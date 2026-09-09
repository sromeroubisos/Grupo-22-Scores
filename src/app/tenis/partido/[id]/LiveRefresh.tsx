'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refresco del partido en vivo.
 *
 * La ficha es un componente de servidor: sin esto, el cartel "En vivo" y el
 * punto en juego se quedan congelados en el momento en que se abrió la página,
 * y el diseño estaría mintiendo. Se apaga con la pestaña oculta porque nadie
 * mira un partido que no tiene en pantalla, y el bridge cachea 30 s de todos
 * modos: pedir más seguido no traería nada nuevo.
 */
export default function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
    const router = useRouter();

    useEffect(() => {
        const tick = () => {
            if (document.visibilityState === 'visible') router.refresh();
        };
        const id = window.setInterval(tick, intervalMs);
        document.addEventListener('visibilitychange', tick);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [router, intervalMs]);

    return null;
}
