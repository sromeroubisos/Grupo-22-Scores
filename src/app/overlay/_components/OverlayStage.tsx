'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { OverlayConfig } from '../_lib/config';
import { fontVars } from '../_lib/fonts';
import styles from './g22.module.css';

const EXIT_MS = 600;

/**
 * El escenario de cualquier overlay: ubica la tarjeta en el lienzo de 1920×1080
 * (esquina, centro, costado), la escala y la hace aparecer y desaparecer.
 *
 * Con `mostrar` + `ocultar` en la URL la tarjeta entra y sale sola en ciclo
 * ("15 s en pantalla, 45 afuera"). Sin eso queda fija y el operador la prende y
 * apaga desde OBS/vMix — en OBS conviene tildar "Actualizar el navegador cuando
 * la escena se activa" para que la entrada se anime cada vez.
 */
export default function OverlayStage({
  config,
  children,
  ready,
  visible = true,
}: {
  config: OverlayConfig;
  children: ReactNode;
  /** Hasta que no hay datos no se anima la entrada: si no, entra una tarjeta vacía. */
  ready: boolean;
  /** Lo prende y apaga un panel (overlays manuales): sale animada y vuelve a entrar. */
  visible?: boolean;
}) {
  const [phase, setPhase] = useState<'in' | 'out' | 'hidden'>(visible ? 'in' : 'hidden');

  useEffect(() => {
    if (visible) {
      setPhase('in');
      return undefined;
    }
    setPhase((current) => (current === 'hidden' ? 'hidden' : 'out'));
    const timer = window.setTimeout(() => setPhase('hidden'), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!ready || !visible || config.showFor === null || config.hideFor === null) return undefined;
    const showMs = config.showFor * 1000;
    const hideMs = config.hideFor * 1000;
    const timers: number[] = [];
    let cancelled = false;

    const cycle = () => {
      if (cancelled) return;
      setPhase('in');
      timers.push(window.setTimeout(() => setPhase('out'), showMs));
      timers.push(window.setTimeout(() => setPhase('hidden'), showMs + EXIT_MS));
      timers.push(window.setTimeout(cycle, showMs + EXIT_MS + hideMs));
    };
    cycle();
    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [ready, visible, config.showFor, config.hideFor]);

  const vertical = config.position.startsWith('arriba') ? 'top'
    : config.position.startsWith('abajo') ? 'bottom'
    : 'middle';
  const horizontal = config.position.endsWith('izq') || config.position === 'izq' ? 'left'
    : config.position.endsWith('der') || config.position === 'der' ? 'right'
    : 'center';

  const style = { '--ov-scale': config.scale, '--ov-margin': `${config.margin}px`, ...fontVars(config.fonts) } as CSSProperties;

  return (
    <div
      className={styles.stage}
      style={style}
      data-chroma={config.background === '#00b140' ? 'verde' : undefined}
    >
      <div className={styles.anchor} data-v={vertical} data-h={horizontal}>
        {ready && phase !== 'hidden' ? (
          <div className={styles.enter} data-leaving={phase === 'out' ? '' : undefined}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
