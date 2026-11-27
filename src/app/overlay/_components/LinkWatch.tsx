'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LinkGate } from '../_lib/linkGate';
import type { BrandPosition } from '@/lib/overlay/overlayPlan';
import { linkAirPath } from '@/lib/overlay/overlayLinks';
import styles from './linkNotice.module.css';

/**
 * Lo que envuelve a cada página al aire.
 *
 * Con un enlace guardado, pregunta al servidor cada medio minuto mientras OBS
 * lo tiene abierto:
 *   - si el dueño lo EDITÓ, se recarga con la configuración nueva (misma URL en OBS);
 *   - si venció, apaga el gráfico y muestra el aviso; si después lo renuevan, vuelve;
 *   - si lo borraron, el aviso de enlace inexistente.
 * Si la consulta falla (sin red), sigue al aire y reintenta: un corte no apaga
 * una transmisión.
 */

const POLL_MS = 30_000;

export default function LinkWatch({ gate, brand = 'arriba-der', children }: { gate: LinkGate; brand?: BrandPosition; children: ReactNode }) {
  const token = gate.status === 'ok' ? gate.token : null;
  const path = gate.status === 'ok' ? gate.path ?? null : null;
  const [gone, setGone] = useState<'vencido' | 'inexistente' | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer = 0;
    const check = async () => {
      try {
        const response = await fetch(`/api/overlay/enlaces/estado?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (response.status === 404) {
          setGone('inexistente');
        } else if (response.ok) {
          const body = (await response.json().catch(() => null)) as { expiresAt?: string; path?: string } | null;
          if (cancelled) return;
          if (body?.path && path && body.path !== path) {
            window.location.replace(linkAirPath(body.path, token));
            return;
          }
          if (body?.expiresAt) setGone(Date.parse(body.expiresAt) > Date.now() ? null : 'vencido');
        }
      } catch {
        // Sin red: sigue al aire y se reintenta.
      }
      if (!cancelled) timer = window.setTimeout(() => void check(), POLL_MS);
    };
    timer = window.setTimeout(() => void check(), POLL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [token, path]);

  if (gate.status !== 'ok') return <LinkNotice status={gate.status} />;
  if (gone) return <LinkNotice status={gone} />;
  return (
    <>
      {children}
      {brand !== 'no' ? <BrandMark position={brand} /> : null}
    </>
  );
}

/**
 * La marca de G22 sobre la transmisión: "G22 Scores apoya esta transmisión".
 * Arriba o abajo a la derecha; solo el plan premium la puede sacar.
 */
function BrandMark({ position }: { position: Exclude<BrandPosition, 'no'> }) {
  return (
    <div className={styles.brand} data-pos={position} aria-label="G22 Scores apoya esta transmisión">
      <span className={styles.brandKicker}>Apoya</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- PNG local chico; next/image no suma en OBS. */}
      <img src="/header-logo.png" alt="G22 Scores" className={styles.brandLogo} />
    </div>
  );
}

const COPY: Record<'vencido' | 'sin-enlace' | 'inexistente', [string, string]> = {
  vencido: ['Este overlay venció', 'Renovalo en g22scores.com/overlay, en Mis overlays. La URL de OBS sigue siendo la misma.'],
  'sin-enlace': ['Falta guardar este overlay', 'Guardalo en g22scores.com/overlay y pegá en OBS o vMix el enlace de Mis overlays.'],
  inexistente: ['Este enlace no existe', 'Se borró o se copió mal. Copialo de nuevo desde Mis overlays en g22scores.com/overlay.'],
};

function LinkNotice({ status }: { status: keyof typeof COPY }) {
  const [title, text] = COPY[status];
  return (
    <div className={styles.notice} role="status">
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}
