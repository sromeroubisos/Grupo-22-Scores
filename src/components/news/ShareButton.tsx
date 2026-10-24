'use client';

// Compartir una noticia: copiar el link, WhatsApp, Telegram, X, Facebook y,
// donde el navegador lo ofrece (el celular, casi siempre), el menú de
// compartir del sistema con todas las apps instaladas.

import { Check, Copy, Share2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import styles from './ShareButton.module.css';

interface ShareButtonProps {
    /** El link absoluto de la nota. */
    url: string;
    title: string;
    /** Hacia dónde se abre el menú; abajo del todo conviene 'up'. */
    placement?: 'down' | 'up';
    className?: string;
}

export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Contextos sin la API (http, iframes): el camino viejo.
        try {
            const field = document.createElement('textarea');
            field.value = text;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(field);
            return ok;
        } catch {
            return false;
        }
    }
}

export default function ShareButton({ url, title, placement = 'down', className }: ShareButtonProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
    const [canNativeShare, setCanNativeShare] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    }, []);

    useEffect(() => {
        if (!open) setCopied('idle');
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    useEffect(() => {
        // El fallo se queda mientras el menú esté abierto: muestra el link para copiarlo a mano.
        if (copied !== 'ok') return;
        const timer = window.setTimeout(() => setCopied('idle'), 2200);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const copy = useCallback(async () => {
        setCopied((await copyToClipboard(url)) ? 'ok' : 'fail');
    }, [url]);

    const nativeShare = useCallback(async () => {
        try {
            await navigator.share({ title, url });
            setOpen(false);
        } catch {
            // Cerró el menú del sistema: no es un error.
        }
    }, [title, url]);

    const text = `${title} ${url}`;
    const targets = [
        { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(text)}` },
        { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
        { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
        { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    ];

    return (
        <div className={`${styles.root} ${className ?? ''}`} ref={rootRef}>
            <button
                type="button"
                className={styles.trigger}
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
            >
                <Share2 size={16} aria-hidden="true" />
                Compartir
            </button>

            {open && (
                <div
                    id={menuId}
                    className={`${styles.menu} ${placement === 'up' ? styles.menuUp : ''}`}
                    role="menu"
                    aria-label="Compartir la noticia"
                >
                    <button type="button" className={styles.item} role="menuitem" onClick={copy}>
                        {copied === 'ok' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                        {copied === 'ok' ? 'Link copiado' : copied === 'fail' ? 'No se pudo copiar' : 'Copiar link'}
                    </button>
                    {copied === 'fail' && (
                        <input
                            className={styles.manualLink}
                            type="text"
                            readOnly
                            value={url}
                            aria-label="Link de la noticia, para copiar a mano"
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                        />
                    )}
                    {targets.map((target) => (
                        <a
                            key={target.id}
                            className={styles.item}
                            role="menuitem"
                            href={target.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                        >
                            {target.label}
                        </a>
                    ))}
                    {canNativeShare && (
                        <button type="button" className={styles.item} role="menuitem" onClick={nativeShare}>
                            Más opciones…
                        </button>
                    )}
                </div>
            )}

            <span className={styles.srOnly} role="status" aria-live="polite">
                {copied === 'ok' ? 'Link copiado al portapapeles' : ''}
            </span>
        </div>
    );
}
