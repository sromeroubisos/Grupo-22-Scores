'use client';

/* eslint-disable @next/next/no-img-element -- el wordmark es un PNG local chico. */

import { useEffect, useState } from 'react';
import { currentHeadline, readManualState, type ManualHeadlineState, type ManualKind } from '@/lib/overlay/manualOverlay';
import type { OverlayConfig } from '../../_lib/config';
import OverlayStage from '../../_components/OverlayStage';
import { G22Card, SetupHint } from '../../_components/G22Card';
import MatchOverlay from '../../partido/[id]/MatchOverlay';
import styles from '../../_components/g22.module.css';

/**
 * Overlay manual: lo que el productor maneja desde su panel
 * (`/overlay/control/<id>`). Un marcador se dibuja con las mismas piezas que el
 * de un partido de G22; un titular, como la banda de un noticiero (abajo, a lo
 * ancho, con la gente hablando arriba), como el nombre de quien habla, o como
 * la tarjeta de marca.
 */
export default function ManualOverlay({ id, config }: { id: string; config: OverlayConfig }) {
  const [kind, setKind] = useState<ManualKind | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // `/overlay/manual/demo?prueba=1`: el titular de muestra del generador.
  const demo = config.demo && id === 'demo';

  useEffect(() => {
    if (demo) return undefined;
    let cancelled = false;
    fetch(`/api/overlay/control/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !body?.kind) setFailure(body?.error ?? 'No se encontró el overlay.');
        else setKind(body.kind as ManualKind);
      })
      .catch(() => { if (!cancelled) setFailure('Sin conexión con g22scores. Recargá la fuente.'); });
    return () => { cancelled = true; };
  }, [id, demo]);

  if (demo) return <HeadlineOverlay id={id} config={config} demo />;
  if (failure) return <SetupHint>G22 · {failure}</SetupHint>;
  if (kind === 'marcador') return <MatchOverlay matchId={id} config={config} manual />;
  if (kind === 'titular') return <HeadlineOverlay id={id} config={config} />;
  return null;
}

const DEMO_HEADLINE: ManualHeadlineState = {
  visible: true,
  style: 'noticiero',
  items: [
    { id: 'd1', kicker: 'Último momento', title: 'Así se ve tu titular al aire', subtitle: 'La bajada va acá: una línea corta que acompaña.' },
    { id: 'd2', kicker: 'Rugby', title: 'Los titulares rotan solos o los pasás vos', subtitle: 'Cargás varios en el panel y elegís cuál sale.' },
  ],
  current: 0,
  rotate: 6,
  ticker: 'G22 Scores · Resultados en vivo en g22scores.com · Seguí el torneo en la app',
};

function HeadlineOverlay({ id, config, demo = false }: { id: string; config: OverlayConfig; demo?: boolean }) {
  const [state, setState] = useState<ManualHeadlineState | null>(demo ? DEMO_HEADLINE : null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (demo) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const requestedAt = Date.now();
      try {
        const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (response.ok) {
          const body = await response.json();
          if (!cancelled) {
            setState(readManualState('titular', body.state));
            const serverNow = Date.parse(body.serverNow);
            if (Number.isFinite(serverNow)) setOffset(serverNow - (requestedAt + Date.now()) / 2);
          }
        }
      } catch {
        // Una falla suelta no borra lo que está al aire: se reintenta.
      }
      if (!cancelled) timer = window.setTimeout(tick, 1_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, demo]);

  // Si rotan solos, el reloj decide cuál toca (con la hora del servidor: dos
  // OBS distintos muestran el mismo título al mismo tiempo).
  useEffect(() => {
    if (!state || state.rotate <= 0) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [state]);

  if (!state || !state.items.length) return null;
  const { item } = currentHeadline(state, now + offset);
  const placement = config.positionSet
    ? config
    : { ...config, position: state.style === 'tarjeta' ? 'centro' as const : state.style === 'persona' ? 'abajo-izq' as const : 'abajo' as const };

  return (
    <OverlayStage config={placement} ready visible={state.visible}>
      {state.style === 'tarjeta' ? (
        <G22Card title={item.kicker || 'G22 Scores'} width={860}>
          <div className={styles.headline} key={item.id}>
            <h2 className={styles.headlineTitle}>{item.title}</h2>
            {item.subtitle ? <p className={styles.headlineSubtitle}>{item.subtitle}</p> : null}
          </div>
        </G22Card>
      ) : state.style === 'persona' ? (
        <div className={styles.person} key={item.id}>
          {item.kicker ? <span className={styles.personTag}>{item.kicker}</span> : null}
          <span className={styles.personName}>{item.title}</span>
          {item.subtitle ? <span className={styles.personRole}>{item.subtitle}</span> : null}
        </div>
      ) : (
        <div className={styles.newsBand}>
          <div className={styles.newsTop}>
            <span className={styles.newsBrand}><img src="/header-logo.png" alt="G22 Scores" /></span>
            {item.kicker ? <span className={styles.newsKicker} key={`k-${item.id}`}>{item.kicker}</span> : null}
          </div>
          <div className={styles.newsMain} key={item.id}>
            <span className={styles.newsTitle}>{item.title}</span>
            {item.subtitle ? <span className={styles.newsSub}>{item.subtitle}</span> : null}
          </div>
          {state.ticker ? (
            <div className={styles.newsTicker}>
              <span className={styles.newsTickerTag}>G22</span>
              <div className={styles.newsTickerTrack}>
                <span>{state.ticker}</span>
                <span aria-hidden="true">{state.ticker}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </OverlayStage>
  );
}
