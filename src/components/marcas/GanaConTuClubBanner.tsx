import styles from './GanaConTuClubBanner.module.css';

/** A dónde lleva la placa. La pieza es de un tercero: sale del sitio en pestaña nueva. */
const DESTINO = 'https://ganacontuclub.com.ar/';

/**
 * La placa de "Ganá con tu club", entre la franja de titulares y el selector de
 * día de la home.
 *
 * Es un GIF de 1200 × 110, y va como `<img>` pelado a propósito: `next/image`
 * no anima un GIF sin `unoptimized`, y acá no hay nada que optimizar. El alto
 * lo fija la proporción del archivo, así que la placa no salta cuando carga.
 *
 * Es la primera imagen sobre el pliegue: no lleva `loading="lazy"`.
 */
export default function GanaConTuClubBanner() {
    return (
        <a
            href={DESTINO}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={styles.placa}
            aria-label="Ganá con tu club (se abre en otra pestaña)"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- GIF animado, next/image lo congela */}
            <img
                src="/marcas/gana-con-tu-club.gif"
                alt="Ganá con tu club"
                width={1200}
                height={110}
                className={styles.imagen}
            />
        </a>
    );
}
