'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CareerState } from '@/features/career';
import { encodeCareerToken, recipeFromCareer } from '@/features/career';
import CareerCard, { CARD_SIZES, type CardFormat } from './CareerCard';
import { careerCardData } from './careerCardData';
import { useLocale } from './LocaleContext';
import styles from './carrera.module.css';

/**
 * LA CAPA DEL RESUMEN. Se abre desde el retiro y termina en la FOTO: se elige el
 * formato, se ve exactamente lo que va a salir y se comparte.
 *
 * La vista previa es EL MISMO COMPONENTE que dibuja la imagen, escalado con una
 * transformación. No es una maqueta parecida hecha en HTML: si fueran dos
 * piezas, la que se mira y la que se baja se irían separando con cada retoque, y
 * el jugador se enteraría recién al abrir el archivo.
 *
 * Lo que sí cambia entre una y otra es QUIÉN las dibuja —acá el navegador, allá
 * Satori en el servidor—, y por eso la imagen que se comparte no se arma en el
 * teléfono: tiene que salir idéntica en todos los aparatos.
 */

type Estado = 'listo' | 'preparando' | 'link-copiado' | 'sin-permiso' | 'sin-imagen';

export default function CareerCardOverlay({ career, onClose }: { career: CareerState; onClose: () => void }) {
    const { locale, t } = useLocale();
    const cerrarRef = useRef<HTMLButtonElement>(null);
    const [formato, setFormato] = useState<CardFormat>('feed');
    const [estado, setEstado] = useState<Estado>('listo');

    const FORMATOS: { id: CardFormat; label: string; medida: string }[] = [
        { id: 'feed', label: t.formatFeed, medida: '1080×1350' },
        { id: 'story', label: t.formatStory, medida: '1080×1920' },
    ];

    // El token es la carrera entera (semilla + decisiones). Se calcula una vez:
    // vuelve a correr el motor y no hace falta hacerlo en cada render.
    //
    // EL IDIOMA VIAJA EN EL LINK. La página que se abre y la imagen del chat se
    // arman en el servidor, donde no hay preferencia que leer: si no fuera en la
    // URL, alguien que jugó en inglés compartiría una tarjeta en español.
    const { data, base, link, apellido } = useMemo(() => {
        const origin = typeof window === 'undefined' ? '' : window.location.origin;
        const token = encodeCareerToken(recipeFromCareer(career));
        const pagina = `${origin}/juegos/minijuegos/carrera-rugby/c/${token}`;
        const lang = locale === 'es' ? '' : `?lang=${locale}`;
        return {
            data: careerCardData(career, origin, locale),
            base: `${pagina}/imagen`,
            link: `${pagina}${lang}`,
            apellido: career.player.surname,
        };
    }, [career, locale]);

    const urlDe = useCallback((f: CardFormat) => `${base}?formato=${f}&lang=${locale}`, [base, locale]);

    // La imagen se pide APENAS se elige el formato, no al tocar compartir. En el
    // celular, la hoja de compartir sólo se abre si la llama el gesto del dedo:
    // si entre el toque y la hoja hay una descarga de 150 KB, el sistema ya no la
    // considera parte del gesto y no abre nada.
    const archivos = useRef(new Map<CardFormat, Promise<File>>());
    const pedirArchivo = useCallback((f: CardFormat): Promise<File> => {
        const guardado = archivos.current.get(f);
        if (guardado) return guardado;
        const pedido = fetch(urlDe(f))
            .then((r) => {
                if (!r.ok) throw new Error(`la imagen respondió ${r.status}`);
                return r.blob();
            })
            .then((blob) => new File([blob], `carrera-rugby-${apellido.toLowerCase()}-${f}.png`, { type: 'image/png' }))
            .catch((err) => {
                // Un pedido fallido no se cachea: si la red vuelve, el próximo
                // intento tiene que poder pedirla de nuevo.
                archivos.current.delete(f);
                throw err;
            });
        archivos.current.set(f, pedido);
        return pedido;
    }, [apellido, urlDe]);

    useEffect(() => { void pedirArchivo(formato).catch(() => {}); }, [formato, pedirArchivo]);

    // Escape cierra, y el foco entra en la capa: se abre encima de todo, así que
    // si el foco se quedara atrás se seguiría tabulando por la pantalla tapada.
    useEffect(() => {
        cerrarRef.current?.focus();
        const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', alTeclear);
        return () => document.removeEventListener('keydown', alTeclear);
    }, [onClose]);

    // NO se navega a la URL de la imagen. `a.href` guarda lo que responda el servidor,
    // sea lo que sea: cuando la ruta contesta 404 `text/plain` —un link que no se pudo
    // reconstruir— el jugador terminaba con un .txt en Descargas y ningun aviso. Se baja
    // el archivo que YA se pidio y se valido, y si no hay archivo se dice.
    async function bajar(f: CardFormat): Promise<void> {
        const file = await pedirArchivo(f);
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    async function bajarDesdeBoton(f: CardFormat): Promise<void> {
        setEstado('preparando');
        try {
            await bajar(f);
            setEstado('listo');
        } catch {
            setEstado('sin-imagen');
        }
    }

    async function compartir(): Promise<void> {
        setEstado('preparando');
        try {
            const file = await pedirArchivo(formato);
            // `canShare` con el archivo en la mano: preguntar por `navigator.share`
            // a secas dice que sí en escritorios que después no aceptan archivos.
            if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: t.shareSystemTitle });
                setEstado('listo');
                return;
            }
            // Sin hoja de compartir con archivos (escritorio, navegadores viejos)
            // la foto igual tiene que llegar: se baja, que es lo que el jugador
            // vino a buscar.
            await bajar(formato);
            setEstado('listo');
        } catch {
            // Cancelar la hoja no es un error y no se avisa nada. Pero una imagen que
            // no se pudo pedir SI: antes los dos casos terminaban en 'listo' y el boton
            // volvia a su texto normal sin que pasara nada, que es como se ve un bug.
            setEstado(archivos.current.has(formato) ? 'listo' : 'sin-imagen');
        }
    }

    async function copiarLink(): Promise<void> {
        try {
            await navigator.clipboard.writeText(link);
            setEstado('link-copiado');
        } catch {
            // Sin permiso de portapapeles (http, permiso denegado): se muestra el
            // link para copiarlo a mano en vez de fallar en silencio.
            setEstado('sin-permiso');
        }
    }

    const { width, height } = CARD_SIZES[formato];

    return (
        <div
            className={styles.cardOverlay}
            role="dialog"
            aria-modal="true"
            aria-label={t.shareDialogLabel}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={styles.cardOverlayPanel}>
                <div className={styles.cardOverlayHead}>
                    <h2 className={styles.cardOverlayTitle}>{t.shareTitle}</h2>
                    <button
                        type="button"
                        ref={cerrarRef}
                        className={styles.cardOverlayClose}
                        onClick={onClose}
                        aria-label={t.closeSummary}
                    >
                        ✕
                    </button>
                </div>

                {/* EL FORMATO SE ELIGE ANTES, no después de bajar la que no era:
                    la vista previa cambia con la elección, así lo que se ve es lo
                    que va a salir. */}
                <div className={styles.cardFormatPicker} role="radiogroup" aria-label={t.formatPickerLabel}>
                    {FORMATOS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            role="radio"
                            aria-checked={formato === f.id}
                            className={`${styles.cardFormatOption} ${formato === f.id ? styles.cardFormatOptionOn : ''}`}
                            onClick={() => { setFormato(f.id); setEstado('listo'); }}
                        >
                            <span className={styles.cardFormatLabel}>{f.label}</span>
                            <span className={styles.cardOverlaySize}>{f.medida}</span>
                        </button>
                    ))}
                </div>

                <div
                    className={styles.cardOverlayFrame}
                    style={{
                        ['--card-w' as string]: `${width}px`,
                        ['--card-h' as string]: `${height}px`,
                        ['--card-ratio' as string]: `${width} / ${height}`,
                        // Ancho/alto como número puro: `calc()` sólo multiplica
                        // por números, no por razones.
                        ['--card-ar' as string]: String(width / height),
                    }}
                >
                    <div className={styles.cardOverlayScaler}>
                        <CareerCard data={data} format={formato} />
                    </div>
                </div>

                <div className={styles.cardOverlayActions}>
                    <button type="button" className={styles.primaryBtn} onClick={compartir} disabled={estado === 'preparando'}>
                        {estado === 'preparando' ? t.preparingImage : t.shareImage}
                    </button>
                    <div className={styles.cardOverlaySecundarias}>
                        <button type="button" className={styles.ghostBtn} onClick={() => void bajarDesdeBoton(formato)} disabled={estado === 'preparando'}>
                            {t.downloadImage}
                        </button>
                        <button type="button" className={styles.ghostBtn} onClick={copiarLink}>
                            {estado === 'link-copiado' ? t.linkCopied : t.copyLink}
                        </button>
                    </div>
                </div>

                {estado === 'sin-imagen' && (
                    <p className={styles.cardOverlayNote} role="status">{t.imageFailed}</p>
                )}

                {estado === 'sin-permiso' && (
                    <label className={styles.shareFallback}>
                        <span>{t.copyLinkManually}</span>
                        <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                    </label>
                )}

                <p className={styles.cardOverlayNote}>{t.shareNote}</p>
            </div>
        </div>
    );
}
