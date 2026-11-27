'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LinkGate } from '../_lib/linkGate';
import type { BrandPosition } from '@/lib/overlay/overlayPlan';
import styles from './linkNotice.module.css';

/**
 * Lo que envuelve a cada página al aire.
 *
 * Con un enlace guardado, vigila su vencimiento mientras OBS lo tiene abierto:
 * al llegar la hora pregunta al servidor; si el dueño lo renovó sigue con la
 * fecha nueva, si no, apaga el gráfico y muestra el aviso. Si la consulta falla
 * (sin red), sigue al aire y reintenta: un corte no apaga una transmisión.
 */

const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

export default function LinkWatch({ gate, brand = 'arriba-der', children }: { gate: LinkGate; brand?: BrandPosition; children: ReactNode }) {
  const token = gate.status === 'ok' ? gate.token : null;
  const [expiresAt, setExpiresAt] = useState(gate.status === 'ok' ? gate.expiresAt : null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token || !expiresAt || expired) return;
    let cancelled = false;
    let timer = 0;
    const check = async () => {
      const left = Date.parse(expiresAt) - Date.now();
      if (left > 0) {
        timer = window.setTimeout(() => void check(), Math.min(left + 1000, MAX_TIMER_MS));
        return;
      }
      try {
        const response = await fetch(`/api/overlay/enlaces/estado?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (response.status === 404) { setExpired(true); return; }
        const body = (await response.json().catch(() => null)) as { expiresAt?: string } | null;
        if (response.ok && body?.expiresAt && Date.parse(body.expiresAt) > Date.now()) { setExpiresAt(body.expiresAt); return; }
        if (response.ok) { setExpired(true); return; }
      } catch {
        // Sin red: se reintenta.
      }
      if (!cancelled) timer = window.setTimeout(() => void check(), 60_000);
    };
    void check();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [token, expiresAt, expired]);

  if (gate.status !== 'ok') return <LinkNotice status={gate.status} />;
  if (expired) return <LinkNotice status="vencido" />;
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
