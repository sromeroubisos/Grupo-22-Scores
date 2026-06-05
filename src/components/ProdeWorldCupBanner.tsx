'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import ProdeWorldCupScreen from '@/components/prode/ProdeWorldCupScreen';
import type { ProdeWorldCupScreenData } from '@/lib/server/prodeWorldCupScreenData';
import {
    shouldShowProdeBanner,
    markShown,
    incrementDismissCount,
    markProdeJoined,
} from '@/lib/prodeWorldCupBannerPreferences';

const ANIM_MS = 220;
// "Apertura" al tocar Jugar: el popup hace zoom hacia adelante y se desvanece
// mientras navega, revelando la pantalla del prode por debajo.
const LAUNCH_MS = 340;

// FORCE_ALWAYS_SHOW: solo para QA. En false respeta las reglas reales
// (una vez cada 12 hs, máx. 2 descartes, no si ya se sumó).
const FORCE_ALWAYS_SHOW = false;

export default function ProdeWorldCupBanner() {
    const pathname = usePathname();

    // mounted = está en el DOM; visible = animado en pantalla (fade + scale-in)
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);
    const [data, setData] = useState<ProdeWorldCupScreenData | null>(null);
    // Respetar la preferencia de movimiento reducido: en ese caso, crossfade sin escala.
    const [reduceMotion, setReduceMotion] = useState(false);
    // launching = se tocó "Jugar ahora": dispara la animación de apertura del prode.
    const [launching, setLaunching] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduceMotion(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // No invitar al Prode si ya estamos dentro del Prode.
    const onProdeRoute = pathname?.startsWith('/prode') ?? false;

    // Decidir si mostrar (una vez, al iniciar) y traer los datos reales del Mundial.
    useEffect(() => {
        if (onProdeRoute) return;

        // Forzado para QA: /?prodeBanner=1 ignora la lógica de aparición.
        const forced =
            FORCE_ALWAYS_SHOW ||
            (typeof window !== 'undefined' &&
                new URLSearchParams(window.location.search).get('prodeBanner') === '1');

        if (!forced) {
            if (!shouldShowProdeBanner()) return;
        }

        const controller = new AbortController();
        (async () => {
            try {
                const res = await fetch('/api/prode/mundial', { signal: controller.signal });
                if (!res.ok) return;
                const payload = await res.json();
                // Solo mostramos si hay un prode del Mundial publicado.
                if (!payload?.available) return;
                // Si el usuario ya participa de la liga, no se muestra más (salvo QA forzado).
                if (!forced && payload.alreadyJoined) return;

                if (!forced) markShown();
                setData(payload as ProdeWorldCupScreenData);
                setMounted(true);
                requestAnimationFrame(() => setVisible(true));
            } catch {
                // Red/abort → el popup no aparece.
            }
        })();
        return () => controller.abort();
    }, [onProdeRoute]);

    const close = useCallback((countAsDismiss: boolean) => {
        if (countAsDismiss) incrementDismissCount();
        setVisible(false); // dispara fade-out
        window.setTimeout(() => setMounted(false), ANIM_MS);
    }, []);

    const handlePlay = useCallback(() => {
        markProdeJoined();
        // No navegamos a mano: el <Link> del CTA hace la navegación.
        // Movimiento reducido → cerramos directo. Si no, animamos la apertura.
        if (reduceMotion) {
            setMounted(false);
            return;
        }
        setLaunching(true);
        window.setTimeout(() => setMounted(false), LAUNCH_MS);
    }, [reduceMotion]);

    // Cerrar con Escape mientras esté abierto.
    useEffect(() => {
        if (!mounted) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(true);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mounted, close]);

    // Bloquear el scroll del fondo mientras el popup está abierto.
    useEffect(() => {
        if (!mounted) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [mounted]);

    if (!mounted || !data) return null;

    return (
        <div
            className="fixed inset-0 z-[960] flex items-center justify-center p-5"
            aria-hidden={!visible}
            // Click en el fondo glass → cerrar. Durante la apertura no bloquea (deja ver el prode).
            onClick={() => close(true)}
            style={{
                // Efecto glass sobre la pantalla.
                background: 'rgba(10, 6, 24, 0.55)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                opacity: launching ? 0 : visible ? 1 : 0,
                pointerEvents: launching ? 'none' : undefined,
                transition: launching
                    ? `opacity ${LAUNCH_MS}ms ease`
                    : `opacity ${reduceMotion ? 120 : ANIM_MS}ms ease`,
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Sumate al Prode del Mundial"
                className="w-full max-w-[360px]"
                // No propagar el click al fondo (evita cerrar al tocar la tarjeta).
                onClick={(e) => e.stopPropagation()}
                style={{
                    transformOrigin: 'center',
                    transform: launching
                        ? 'scale(1.08)'
                        : reduceMotion
                          ? 'none'
                          : visible
                            ? 'scale(1)'
                            : 'scale(0.92)',
                    opacity: launching ? 0 : visible ? 1 : 0,
                    filter: launching ? 'blur(4px)' : 'none',
                    willChange: 'transform, opacity, filter',
                    transition: launching
                        ? `transform ${LAUNCH_MS}ms cubic-bezier(0.23, 1, 0.32, 1), opacity ${LAUNCH_MS}ms ease, filter ${LAUNCH_MS}ms ease`
                        : reduceMotion
                          ? `opacity ${120}ms ease`
                          : `transform 260ms cubic-bezier(0.23, 1, 0.32, 1), opacity ${ANIM_MS}ms ease`,
                }}
            >
                <ProdeWorldCupScreen
                    mode="modal"
                    onClose={() => close(true)}
                    onPlay={handlePlay}
                    {...data}
                />
            </div>
        </div>
    );
}
