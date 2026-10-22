'use client';

/**
 * LA CAPA DE COMPARTIR. Se elige el formato, se ve EXACTAMENTE lo que va a
 * salir, y se comparte o se baja.
 *
 * La vista previa es LA MISMA IMAGEN que se descarga, pedida al servidor con
 * `?preview=1`. No es una maqueta parecida hecha en HTML: si fueran dos piezas,
 * la que se mira y la que se baja se irian separando con cada retoque y el
 * usuario se enteraria recien al abrir el archivo.
 *
 * La imagen se pide APENAS se elige el formato, no al tocar compartir: en el
 * celular la hoja de compartir solo se abre si la llama el gesto del dedo, y un
 * `await fetch` en el medio la deja afuera de esa ventana.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Link2, Share2, X } from 'lucide-react';
import { PLAYER_CARD_SIZES, type PlayerCardFormat } from './PlayerCard';
import styles from './PlayerShareOverlay.module.css';

type Estado = 'listo' | 'preparando' | 'link-copiado' | 'sin-imagen';

const FORMATOS: Array<{ id: PlayerCardFormat; label: string; medida: string }> = [
    { id: 'feed', label: 'Posteo', medida: '1080×1350' },
    { id: 'story', label: 'Historia', medida: '1080×1920' },
];

export default function PlayerShareOverlay({
    playerId,
    playerName,
    clubName,
    onClose,
}: {
    playerId: string;
    playerName: string;
    clubName: string | null;
    onClose: () => void;
}) {
    const [formato, setFormato] = useState<PlayerCardFormat>('feed');
    const [estado, setEstado] = useState<Estado>('listo');
    const [cargando, setCargando] = useState(true);
    const cerrarRef = useRef<HTMLButtonElement>(null);
    const blobRef = useRef<Map<PlayerCardFormat, Blob>>(new Map());

    const { imagenUrl, previewUrl, pagina } = useMemo(() => {
        const origin = typeof window === 'undefined' ? '' : window.location.origin;
        const base = `${origin}/players/${playerId}/imagen`;
        return {
            imagenUrl: `${base}?formato=${formato}`,
            previewUrl: `${base}?formato=${formato}&preview=1`,
            pagina: `${origin}/players/${playerId}`,
        };
    }, [formato, playerId]);

    useEffect(() => {
        cerrarRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // El archivo se descarga apenas cambia el formato y queda guardado, para que
    // "Compartir" no tenga que esperar a la red.
    useEffect(() => {
        let vivo = true;
        setCargando(true);
        setEstado('listo');
        fetch(imagenUrl)
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
            .then((blob) => {
                if (!vivo) return;
                blobRef.current.set(formato, blob);
            })
            .catch(() => {
                if (vivo) setEstado('sin-imagen');
            })
            .finally(() => {
                if (vivo) setCargando(false);
            });
        return () => {
            vivo = false;
        };
    }, [formato, imagenUrl]);

    const nombreArchivo = useMemo(() => {
        const limpio = playerName
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^A-Za-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
        return `g22-${limpio || 'jugador'}-${formato}.png`;
    }, [formato, playerName]);

    const compartir = useCallback(async () => {
        const blob = blobRef.current.get(formato);
        const texto = clubName ? `${playerName} · ${clubName}` : playerName;

        // Compartir el ARCHIVO cuando se puede: mandar solo el link deja al otro
        // con una vista previa que depende de si su chat la resuelve.
        if (blob && typeof navigator !== 'undefined' && navigator.canShare) {
            const file = new File([blob], nombreArchivo, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: texto, text: texto });
                    return;
                } catch {
                    // Cancelo la hoja de compartir. No hay nada que avisar.
                    return;
                }
            }
        }

        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: texto, url: pagina });
                return;
            } catch {
                return;
            }
        }

        try {
            await navigator.clipboard.writeText(pagina);
            setEstado('link-copiado');
            window.setTimeout(() => setEstado('listo'), 2000);
        } catch {
            setEstado('listo');
        }
    }, [clubName, formato, nombreArchivo, pagina, playerName]);

    const copiarLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(pagina);
            setEstado('link-copiado');
            window.setTimeout(() => setEstado('listo'), 2000);
        } catch {
            setEstado('listo');
        }
    }, [pagina]);

    const proporcion = PLAYER_CARD_SIZES[formato];

    return (
        <div className={styles.backdrop} onClick={onClose} role="presentation">
            <div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.head}>
                    <h2 id="share-title" className={styles.title}>
                        Compartir la ficha
                    </h2>
                    <button ref={cerrarRef} type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className={styles.formats} role="radiogroup" aria-label="Formato de la imagen">
                    {FORMATOS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={formato === item.id}
                            className={`${styles.format} ${formato === item.id ? styles.formatActive : ''}`}
                            onClick={() => setFormato(item.id)}
                        >
                            <span className={styles.formatLabel}>{item.label}</span>
                            <span className={styles.formatSize}>{item.medida}</span>
                        </button>
                    ))}
                </div>

                <div
                    className={styles.preview}
                    // La caja reserva la proporcion exacta antes de que llegue la
                    // imagen: sin esto el panel salta de alto al cargar.
                    style={{ aspectRatio: `${proporcion.width} / ${proporcion.height}` }}
                >
                    {estado === 'sin-imagen' ? (
                        <p className={styles.previewError}>No pudimos generar la imagen. Probá de nuevo en un momento.</p>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- es un PNG generado, no un asset del build
                        <img
                            key={previewUrl}
                            src={previewUrl}
                            alt={`Placa de ${playerName} en formato ${formato === 'feed' ? 'posteo' : 'historia'}`}
                            className={styles.previewImg}
                            onLoad={() => setCargando(false)}
                        />
                    )}
                    {cargando && estado !== 'sin-imagen' && <div className={styles.previewLoader} aria-hidden="true" />}
                </div>

                <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={compartir} disabled={estado === 'sin-imagen'}>
                        {estado === 'link-copiado' ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
                        {estado === 'link-copiado' ? 'Link copiado' : 'Compartir'}
                    </button>
                    <a className={styles.secondary} href={imagenUrl} download={nombreArchivo}>
                        <Download size={16} aria-hidden="true" />
                        Descargar
                    </a>
                    <button type="button" className={styles.secondary} onClick={copiarLink}>
                        <Link2 size={16} aria-hidden="true" />
                        Copiar link
                    </button>
                </div>
            </div>
        </div>
    );
}
