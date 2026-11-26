'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './studio.module.css';

/**
 * El lienzo de 1920×1080 que ve OBS, achicado al ancho de la caja. El fondo es
 * un damero para que se note qué parte es transparente.
 *
 * `lazy`: la galería tiene una veintena de muestras vivas; cada iframe se monta
 * cuando entra en pantalla y se desmonta cuando sale lejos, así no corren todas
 * a la vez.
 */
export function Canvas({ src, title, lazy = false, className }: { src: string; title: string; lazy?: boolean; className?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);
  const [inView, setInView] = useState(!lazy);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const resize = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    resize.observe(box);
    let visibility: IntersectionObserver | null = null;
    if (lazy) {
      visibility = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '300px 0px' });
      visibility.observe(box);
    }
    return () => {
      resize.disconnect();
      visibility?.disconnect();
    };
  }, [lazy]);

  return (
    <div className={`${styles.canvas} ${className ?? ''}`} ref={boxRef}>
      {inView ? (
        <iframe
          src={src}
          title={title}
          className={styles.canvasFrame}
          style={{ '--canvas-scale': scale } as CSSProperties}
          tabIndex={-1}
          aria-hidden={lazy ? true : undefined}
        />
      ) : null}
    </div>
  );
}
