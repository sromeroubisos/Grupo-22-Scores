'use client';

// Botón de compartir de un toque para torneos y partidos: un clic copia el link
// de la página y avisa "Link copiado". Si la copia falla (http, iframes), cae
// al menú de compartir del sistema y, sin eso, muestra el link para copiarlo a mano.

import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { copyToClipboard } from '@/components/news/ShareButton';

import styles from './ShareLinkButton.module.css';

interface ShareLinkButtonProps {
    /** Título que acompaña al link en el menú de compartir del sistema. */
    title: string;
    /** Link absoluto; por defecto, el de la página abierta. */
    url?: string;
    className?: string;
}

export default function ShareLinkButton({ title, url, className }: ShareLinkButtonProps) {
    const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');
    const [manualUrl, setManualUrl] = useState('');
    const timer = useRef<number | null>(null);

    useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current);
    }, []);

    const onClick = useCallback(async () => {
        const link = url ?? window.location.href.split('#')[0];
        if (timer.current) window.clearTimeout(timer.current);
        if (await copyToClipboard(link)) {
            setState('ok');
            timer.current = window.setTimeout(() => setState('idle'), 2200);
            return;
        }
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({ title, url: link });
            } catch {
                // Cerró el menú del sistema: no es un error.
            }
            return;
        }
        setManualUrl(link);
        setState('manual');
    }, [title, url]);

    return (
        <span className={`${styles.root} ${className ?? ''}`}>
            <button
                type="button"
                className={`${styles.trigger} ${state === 'ok' ? styles.triggerOk : ''}`}
                onClick={onClick}
                aria-label={state === 'ok' ? 'Link copiado' : 'Copiar link para compartir'}
                title="Copiar link"
            >
                {state === 'ok' ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
                {state === 'ok' && <span className={styles.label}>Link copiado</span>}
            </button>
            {state === 'manual' && (
                <input
                    className={styles.manualLink}
                    type="text"
                    readOnly
                    value={manualUrl}
                    aria-label="Link para copiar a mano"
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => setState('idle')}
                />
            )}
            <span className={styles.srOnly} role="status" aria-live="polite">
                {state === 'ok' ? 'Link copiado al portapapeles' : ''}
            </span>
        </span>
    );
}
