'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import {
    FOLLOW_EVENT,
    enablePush,
    getPushAvailability,
    type EnableResult,
} from '@/lib/notifications/webPushClient';

const DISMISS_KEY = 'g22:push-prompt-dismissed';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

type Mode = 'ask' | 'install' | 'done' | 'failed';

function recentlyDismissed() {
    try {
        const raw = window.localStorage.getItem(DISMISS_KEY);
        const at = raw ? Number(raw) : 0;
        return Number.isFinite(at) && Date.now() - at < DISMISS_FOR_MS;
    } catch {
        return false;
    }
}

function rememberDismiss() {
    try {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
        // Sin localStorage (modo privado): se vuelve a ofrecer la proxima vez, no pasa nada.
    }
}

const FAILURE_COPY: Record<Exclude<EnableResult, 'ok'>, string> = {
    blocked: 'Los avisos están bloqueados. Habilitalos desde los permisos del navegador.',
    'signed-out': 'Entrá a tu cuenta y probá de nuevo.',
    'not-configured': 'Los avisos del celular todavía no están disponibles.',
    error: 'No se pudo activar. Probá de nuevo en unos segundos.',
};

/**
 * Pide activar los avisos del celular en el momento en que tiene sentido: cuando
 * el usuario acaba de seguir un club o una liga. Sin ese pedido, los avisos
 * dependian de que alguien encontrara la tarjeta de /notifications (hoy 17
 * dispositivos activos contra cientos de usuarios que reciben avisos).
 */
export default function PushActivationPrompt() {
    const [mode, setMode] = useState<Mode | null>(null);
    const [followed, setFollowed] = useState<string | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onFollowed = async (event: Event) => {
            if (recentlyDismissed()) return;

            const detail = (event as CustomEvent<{ name?: string }>).detail;
            const availability = await getPushAvailability();

            // Ya activos, bloqueados a mano o sin soporte: no se insiste.
            if (availability === 'subscribed' || availability === 'blocked' || availability === 'unsupported') return;

            setFollowed(detail?.name?.trim() || null);
            setFailure(null);
            setMode(availability === 'ios-needs-install' ? 'install' : 'ask');
        };

        window.addEventListener(FOLLOW_EVENT, onFollowed);
        return () => {
            window.removeEventListener(FOLLOW_EVENT, onFollowed);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, []);

    const close = useCallback(() => {
        rememberDismiss();
        setMode(null);
    }, []);

    const activate = useCallback(async () => {
        setBusy(true);
        const result = await enablePush();
        setBusy(false);

        if (result === 'ok') {
            setMode('done');
            hideTimer.current = setTimeout(() => setMode(null), 3500);
            return;
        }

        setFailure(FAILURE_COPY[result]);
        setMode('failed');
    }, []);

    if (!mode) return null;

    const title = mode === 'done'
        ? 'Avisos activados'
        : mode === 'install'
            ? 'Recibí los resultados en el iPhone'
            : followed
                ? `Seguís a ${followed}`
                : 'Seguí los partidos en vivo';

    const body = mode === 'done'
        ? 'Te vamos a mostrar el marcador en el celular mientras se juega.'
        : mode === 'install'
            ? 'En iPhone los avisos funcionan con la app instalada: tocá Compartir y elegí "Agregar a pantalla de inicio". Después abrila desde ahí.'
            : mode === 'failed'
                ? failure
                : 'Activá los avisos y el marcador queda en tu celular, con tries y finales, aunque no tengas la app abierta.';

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Activar avisos del celular"
            className="fixed inset-x-4 bottom-20 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-[#0f1b2d] p-4 text-white shadow-2xl md:bottom-6 md:left-auto md:right-6"
        >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                <BellRing size={18} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{title}</p>
                <p className="mt-1 text-[13px] leading-snug text-white/75">{body}</p>

                {mode === 'ask' || mode === 'failed' ? (
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={activate}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                            {mode === 'failed' ? 'Reintentar' : 'Activar avisos'}
                        </button>
                        <button
                            type="button"
                            onClick={close}
                            className="rounded-full px-3 py-2 text-sm text-white/70 hover:text-white"
                        >
                            Ahora no
                        </button>
                    </div>
                ) : null}

                {mode === 'install' ? (
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={close}
                            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                        >
                            Entendido
                        </button>
                    </div>
                ) : null}
            </div>

            <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="shrink-0 rounded-full p-1 text-white/60 hover:text-white"
            >
                <X size={16} aria-hidden="true" />
            </button>
        </div>
    );
}
