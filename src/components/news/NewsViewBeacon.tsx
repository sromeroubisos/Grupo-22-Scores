'use client';

// Anota una vista de la nota. No dibuja nada.
//
// Una por navegador y por nota cada 12 horas: recargar o volver a la nota no
// suma. La marca vive en localStorage; si no hay acceso (modo privado), se
// cuenta una vez por carga de la página y no pasa nada más.

import { useEffect } from 'react';

const STORAGE_KEY = 'g22:news-views';
const WINDOW_MS = 12 * 60 * 60 * 1000;

function readSeen(): Record<string, number> {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
    } catch {
        return {};
    }
}

export default function NewsViewBeacon({ newsId }: { newsId: string }) {
    useEffect(() => {
        const now = Date.now();
        const seen = readSeen();
        const last = seen[newsId];
        if (typeof last === 'number' && now - last < WINDOW_MS) return;

        try {
            // De paso se tiran las marcas vencidas para que el mapa no crezca.
            const fresh = Object.fromEntries(
                Object.entries(seen).filter(([, at]) => typeof at === 'number' && now - at < WINDOW_MS),
            );
            fresh[newsId] = now;
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        } catch {
            // Sin localStorage: se cuenta igual.
        }

        void fetch('/api/news/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: newsId }),
            keepalive: true,
        }).catch(() => undefined);
    }, [newsId]);

    return null;
}
