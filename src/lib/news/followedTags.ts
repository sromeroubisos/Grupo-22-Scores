'use client';

// Las etiquetas que el lector sigue. Viven en el dispositivo (localStorage):
// es una preferencia de lectura, no un dato de la cuenta. Sin acceso al
// almacenamiento (modo privado, cuota), el botón anda igual dentro de la
// pestaña pero no recuerda nada.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'g22:news-follow-tags:v1';
const EVENT = 'g22:news-follow-tags';

function read(): string[] {
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
    } catch {
        return [];
    }
}

function write(tags: string[]) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(tags));
    } catch {
        // Sin localStorage: queda en memoria hasta recargar.
    }
    window.dispatchEvent(new Event(EVENT));
}

export function useFollowedTags() {
    const [followed, setFollowed] = useState<string[]>([]);

    useEffect(() => {
        const sync = () => setFollowed(read());
        sync();
        window.addEventListener(EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const toggle = useCallback((tag: string) => {
        const current = read();
        write(current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    }, []);

    return { followed, toggle };
}
