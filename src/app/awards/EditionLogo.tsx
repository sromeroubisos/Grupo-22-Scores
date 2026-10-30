import type { AwardEditionConfig } from '@/lib/awards/config';
import styles from './awards.module.css';

/**
 * El título de una edición, como logo.
 *  - Con archivos de logo (`config.logo`): la imagen, una versión por tema.
 *  - Sin archivos pero con `wordmark`: el logo armado en CSS con el mismo
 *    esquema que el de Salida 22 (letras blancas, contorno y sombra gruesa),
 *    hasta que haya archivos oficiales.
 *  - Sin ninguno: el nombre en letras.
 * Es el `h1` de la página (o el `h2` en el índice).
 */
export default function EditionLogo({ config, as: Tag = 'h1', year = 2026 }: { config: AwardEditionConfig; as?: 'h1' | 'h2'; year?: number }) {
    if (config.logo) {
        const [width, height] = config.logo.size ?? [2000, 1478];
        // Mismo archivo en los dos temas: una sola imagen.
        if (config.logo.light === config.logo.dark) {
            return (
                <Tag className={styles.logoTitle}>
                    {/* Arriba del pliegue: sin lazy. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.logo} style={{ display: 'block' }} src={config.logo.light} alt={config.logo.alt} width={width} height={height} />
                </Tag>
            );
        }
        return (
            <Tag className={styles.logoTitle}>
                {/* Dos versiones, una por tema (la que no corresponde se oculta por CSS). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={`${styles.logo} ${styles.logoLight}`} src={config.logo.light} alt={config.logo.alt} width={width} height={height} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={`${styles.logo} ${styles.logoDark}`} src={config.logo.dark} alt="" aria-hidden="true" width={width} height={height} />
            </Tag>
        );
    }
    if (config.wordmark) {
        return (
            <Tag className={styles.logoTitle} aria-label={`${config.name} ${year}`}>
                <span className={styles.wm} aria-hidden="true">
                    <span className={styles.wmTop}>{config.wordmark}</span>
                    <span className={styles.wmMid}>Awards</span>
                    <span className={styles.wmYear}>
                        <span className={styles.wmStar}>★</span>
                        {year}
                        <span className={styles.wmStar}>★</span>
                    </span>
                </span>
            </Tag>
        );
    }
    return <Tag className={`${styles.display} ${styles.gold} ${styles.heroTitle}`}>{config.name}</Tag>;
}
