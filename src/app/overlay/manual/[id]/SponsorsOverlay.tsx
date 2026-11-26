'use client';

/* eslint-disable @next/next/no-img-element -- logos subidos a Storage y el wordmark local. */

import { useEffect, useState, type CSSProperties } from 'react';
import { readManualState } from '@/lib/overlay/manualOverlay';
import {
  SPONSOR_TIERS,
  bandPages,
  cornerSequence,
  rotationIndex,
  tierBoxes,
  type ManualSponsorsState,
  type SponsorLogo,
  type SponsorTier,
} from '@/lib/overlay/sponsorsOverlay';
import type { OverlayConfig } from '../../_lib/config';
import OverlayStage from '../../_components/OverlayStage';
import styles from './sponsors.module.css';

/**
 * Overlay de sponsors: los logos que el productor sube en cuatro niveles. El
 * tamaño de cada logo sale de `tierBoxes` (nivel + proporción + cuántos hay);
 * acá solo se dibuja.
 */

const TIER_LABEL = Object.fromEntries(SPONSOR_TIERS.map((tier) => [tier.id, tier.plural])) as Record<SponsorTier, string>;

const demoLogo = (id: string, ratio: number): SponsorLogo => ({ id, url: `/overlay-demo/logos/${id}.svg`, name: id, ratio });

export const DEMO_SPONSORS: ManualSponsorsState = {
  visible: true,
  layout: 'grilla',
  showLabels: true,
  heading: 'Gracias a los que hacen posible este torneo',
  rotate: 5,
  surface: 'oscuro',
  tiers: {
    title: [demoLogo('aurora', 3.25)],
    main: [demoLogo('ruta', 5.57), demoLogo('nativa', 1), demoLogo('molino', 2.33)],
    sponsor: [demoLogo('pampa', 1.8), demoLogo('delta', 0.8), demoLogo('faro', 3.2), demoLogo('cumbre', 1)],
    acompanante: [demoLogo('nativa', 1), demoLogo('faro', 3.2), demoLogo('pampa', 1.8), demoLogo('delta', 0.8), demoLogo('cumbre', 1), demoLogo('molino', 2.33)],
  },
};

const DEFAULT_POSITION: Record<ManualSponsorsState['layout'], OverlayConfig['position']> = {
  grilla: 'centro',
  banda: 'abajo',
  esquina: 'arriba-der',
};

export default function SponsorsOverlay({ id, config, demo = false }: { id: string; config: OverlayConfig; demo?: boolean }) {
  const [state, setState] = useState<ManualSponsorsState | null>(demo ? DEMO_SPONSORS : null);
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
            setState(readManualState('sponsors', body.state));
            const serverNow = Date.parse(body.serverNow);
            if (Number.isFinite(serverNow)) setOffset(serverNow - (requestedAt + Date.now()) / 2);
          }
        }
      } catch {
        // Una falla suelta no borra lo que está al aire: se reintenta.
      }
      if (!cancelled) timer = window.setTimeout(tick, 2_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, demo]);

  // La banda y la esquina rotan con el reloj del servidor.
  useEffect(() => {
    if (!state) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [state]);

  if (!state) return null;
  // `?forma=` muestra la muestra (o un overlay) en otra forma sin tocar el panel.
  const layout = config.sponsorLayout ?? state.layout;
  const placement = config.positionSet ? config : { ...config, position: DEFAULT_POSITION[layout] };
  const surface = state.surface === 'claro' ? 'claro' : 'oscuro';

  return (
    <OverlayStage config={placement} ready visible={state.visible}>
      {layout === 'banda' ? (
        <Band state={state} now={now + offset} surface={surface} />
      ) : layout === 'esquina' ? (
        <Corner state={state} now={now + offset} surface={surface} />
      ) : (
        <Grid state={state} surface={surface} />
      )}
    </OverlayStage>
  );
}

function Logo({ logo, width, height }: { logo: SponsorLogo; width: number; height: number }) {
  return (
    <span className={styles.logo} style={{ width, height }}>
      <img src={logo.url} alt={logo.name || 'Sponsor'} />
    </span>
  );
}

function Row({ logos, tier, layout }: { logos: SponsorLogo[]; tier: SponsorTier; layout: 'grilla' | 'banda' | 'esquina' }) {
  const { boxes, gap } = tierBoxes(logos, tier, layout);
  return (
    <div className={styles.row} style={{ gap: `${Math.round(gap * 0.6)}px ${gap}px` } as CSSProperties}>
      {logos.map((logo, index) => (
        <Logo key={`${logo.id}-${index}`} logo={logo} width={boxes[index].width} height={boxes[index].height} />
      ))}
    </div>
  );
}

function Empty({ surface }: { surface: string }) {
  return <div className={styles.empty} data-surface={surface}>Sumá logos desde el panel de control.</div>;
}

function Grid({ state, surface }: { state: ManualSponsorsState; surface: string }) {
  const tiers = SPONSOR_TIERS.filter((tier) => state.tiers[tier.id].length);
  if (!tiers.length) return <Empty surface={surface} />;
  return (
    <section className={styles.grid} data-surface={surface}>
      {state.heading ? (
        <header className={styles.gridHead}>
          <img src="/header-logo.png" alt="G22 Scores" />
          <span>{state.heading}</span>
        </header>
      ) : null}
      {tiers.map((tier) => (
        <div key={tier.id} className={styles.tier} data-tier={tier.id}>
          {state.showLabels ? <span className={styles.tierLabel}>{tier.plural}</span> : null}
          <Row logos={state.tiers[tier.id]} tier={tier.id} layout="grilla" />
        </div>
      ))}
    </section>
  );
}

function Band({ state, now, surface }: { state: ManualSponsorsState; now: number; surface: string }) {
  const pages = bandPages(state);
  if (!pages.length) return <Empty surface={surface} />;
  const index = rotationIndex(pages.length, state.rotate, now);
  const page = pages[index];
  return (
    <section className={styles.band} data-surface={surface}>
      {state.showLabels ? <span className={styles.bandLabel} key={`l-${index}`}>{TIER_LABEL[page.tier]}</span> : null}
      <div className={styles.bandLogos} key={`p-${index}`}>
        <Row logos={page.logos} tier={page.tier} layout="banda" />
      </div>
      {pages.length > 1 ? (
        <span className={styles.bandDots} aria-hidden="true">
          {pages.map((_, dot) => <i key={dot} data-on={dot === index ? '' : undefined} />)}
        </span>
      ) : null}
    </section>
  );
}

function Corner({ state, now, surface }: { state: ManualSponsorsState; now: number; surface: string }) {
  const sequence = cornerSequence(state);
  if (!sequence.length) return <Empty surface={surface} />;
  const index = rotationIndex(sequence.length, state.rotate, now);
  const { tier, logo } = sequence[index];
  // Los turnos seguidos de un mismo logo (el Title tiene tres) no lo re-animan.
  let runStart = index;
  while (runStart > 0 && sequence[runStart - 1].logo === logo) runStart -= 1;
  const { boxes } = tierBoxes([logo], tier, 'esquina');
  return (
    <section className={styles.corner} data-surface={surface}>
      {state.showLabels ? <span className={styles.cornerLabel}>{SPONSOR_TIERS.find((item) => item.id === tier)?.label}</span> : null}
      <div className={styles.cornerLogo} key={`${logo.id}-${runStart}`}>
        <Logo logo={logo} width={boxes[0].width} height={boxes[0].height} />
      </div>
    </section>
  );
}
