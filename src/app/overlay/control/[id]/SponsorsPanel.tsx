'use client';

/* eslint-disable @next/next/no-img-element -- miniaturas de los logos subidos. */

import { useRef, useState } from 'react';
import {
  MAX_SPONSOR_LOGOS,
  SPONSOR_TIERS,
  totalLogos,
  type ManualSponsorsState,
  type SponsorLogo,
  type SponsorTier,
} from '@/lib/overlay/sponsorsOverlay';
import styles from './control.module.css';
import own from './sponsorsPanel.module.css';

/**
 * Panel del overlay de sponsors: cuatro niveles (Title, Main, Sponsor,
 * Acompañante) donde se suben los PNG —varios a la vez—, se ordenan, se pasan
 * de un nivel a otro o se sacan. El overlay acomoda los tamaños solo.
 */

type Patch = Record<string, unknown>;
export type UploadedLogo = { url: string; ratio: number };

const TIER_HINT: Record<SponsorTier, string> = {
  title: 'El más grande. Normalmente uno solo.',
  main: 'Grandes, en una o dos filas.',
  sponsor: 'Medianos.',
  acompanante: 'Los más chicos, en varias filas.',
};

/** Un PNG enorme se achica en el navegador antes de subir (Vercel corta en 4,5 MB). */
async function shrinkIfHuge(file: File): Promise<Blob> {
  if (file.size <= 3.5 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/png'));
}

/** Un id corto para el logo (solo distingue filas en la lista). */
function newLogoId() {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const cleanName = (fileName: string) => fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60);

export default function SponsorsPanel({
  state,
  patchNow,
  patchText,
  uploadLogo,
}: {
  state: ManualSponsorsState;
  patchNow: (patch: Patch) => void;
  patchText: (patch: Patch) => void;
  uploadLogo: (file: Blob, name: string) => Promise<UploadedLogo>;
}) {
  const [busy, setBusy] = useState<SponsorTier | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const total = totalLogos(state);

  const setTier = (tier: SponsorTier, logos: SponsorLogo[]) => patchNow({ tiers: { [tier]: logos } });

  const upload = async (tier: SponsorTier, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(tier);
    setProblem(null);
    const room = MAX_SPONSOR_LOGOS - total;
    const list = Array.from(files).slice(0, Math.max(0, room));
    const added: SponsorLogo[] = [];
    const failures: string[] = [];
    for (const file of list) {
      try {
        const blob = await shrinkIfHuge(file);
        const uploaded = await uploadLogo(blob, file.name);
        added.push({ id: newLogoId(), url: uploaded.url, name: cleanName(file.name), ratio: uploaded.ratio });
      } catch (error: unknown) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'no se pudo subir'}`);
      }
    }
    if (added.length) setTier(tier, [...state.tiers[tier], ...added]);
    if (files.length > list.length) failures.push(`Tope de ${MAX_SPONSOR_LOGOS} logos: ${files.length - list.length} quedaron afuera.`);
    setProblem(failures.length ? failures.join(' · ') : null);
    setBusy(null);
  };

  const move = (tier: SponsorTier, index: number, delta: -1 | 1) => {
    const logos = [...state.tiers[tier]];
    const target = index + delta;
    if (target < 0 || target >= logos.length) return;
    [logos[index], logos[target]] = [logos[target], logos[index]];
    setTier(tier, logos);
  };

  const changeTier = (from: SponsorTier, index: number, to: SponsorTier) => {
    if (from === to) return;
    const logo = state.tiers[from][index];
    patchNow({ tiers: { [from]: state.tiers[from].filter((_, at) => at !== index), [to]: [...state.tiers[to], logo] } });
  };

  const remove = (tier: SponsorTier, index: number) => setTier(tier, state.tiers[tier].filter((_, at) => at !== index));

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h2>En pantalla</h2>
        <button type="button" className={styles.visible} data-on={state.visible ? '' : undefined} onClick={() => patchNow({ visible: !state.visible })}>
          {state.visible ? 'Visible · tocá para ocultar' : 'Oculto · tocá para mostrar'}
        </button>
        <span className={own.label}>Forma</span>
        <div className={styles.segment} role="radiogroup" aria-label="Forma">
          {([['grilla', 'Grilla'], ['banda', 'Banda abajo'], ['esquina', 'Esquina']] as const).map(([value, text]) => (
            <button key={value} type="button" role="radio" aria-checked={state.layout === value} onClick={() => patchNow({ layout: value })}>{text}</button>
          ))}
        </div>
        <p className={styles.muted}>
          {state.layout === 'grilla' && 'Todos los niveles juntos, en una placa. Para la previa o el entretiempo.'}
          {state.layout === 'banda' && 'Una franja abajo que pasa de a un nivel por vez.'}
          {state.layout === 'esquina' && 'Un logo por vez en una esquina. El Title se queda más tiempo.'}
        </p>
        <span className={own.label}>Fondo</span>
        <div className={styles.segment} role="radiogroup" aria-label="Fondo">
          {([['oscuro', 'Oscuro G22'], ['claro', 'Claro']] as const).map(([value, text]) => (
            <button key={value} type="button" role="radio" aria-checked={state.surface === value} onClick={() => patchNow({ surface: value })}>{text}</button>
          ))}
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={state.showLabels} onChange={(e) => patchNow({ showLabels: e.target.checked })} />
          <span>Mostrar el nombre de cada nivel (“Main sponsors”, “Acompañan”)</span>
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>Título de la grilla (opcional)</span>
            <input value={state.heading} maxLength={60} placeholder="Gracias a nuestros sponsors" onChange={(e) => patchText({ heading: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Segundos por página</span>
            <input type="number" min={2} max={120} value={state.rotate} onChange={(e) => patchNow({ rotate: Number(e.target.value) || 8 })} />
          </label>
        </div>
        <p className={styles.muted}>{total} de {MAX_SPONSOR_LOGOS} logos cargados.</p>
      </section>

      {SPONSOR_TIERS.map((tier) => {
        const logos = state.tiers[tier.id];
        return (
          <section key={tier.id} className={styles.card}>
            <h2>{tier.label} · {logos.length}</h2>
            <p className={styles.muted}>{TIER_HINT[tier.id]}</p>
            <UploadButton
              disabled={busy !== null || total >= MAX_SPONSOR_LOGOS}
              busy={busy === tier.id}
              onFiles={(files) => void upload(tier.id, files)}
              label={`Subir logos a ${tier.label}`}
            />
            {logos.length ? (
              <ul className={own.logos}>
                {logos.map((logo, index) => (
                  <li key={`${logo.id}-${index}`}>
                    <span className={own.thumb} data-surface={state.surface}><img src={logo.url} alt="" /></span>
                    <input
                      className={own.name}
                      value={logo.name}
                      maxLength={60}
                      aria-label="Nombre del sponsor"
                      placeholder="Nombre (opcional)"
                      onChange={(e) => patchText({ tiers: { [tier.id]: logos.map((other, at) => (at === index ? { ...other, name: e.target.value } : other)) } })}
                    />
                    <div className={own.actions}>
                      <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => move(tier.id, index, -1)}>↑</button>
                      <button type="button" aria-label="Bajar" disabled={index === logos.length - 1} onClick={() => move(tier.id, index, 1)}>↓</button>
                      <select aria-label="Pasar a otro nivel" value={tier.id} onChange={(e) => changeTier(tier.id, index, e.target.value as SponsorTier)}>
                        {SPONSOR_TIERS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                      <button type="button" aria-label="Sacar" onClick={() => remove(tier.id, index)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </div>
  );
}

function UploadButton({ onFiles, disabled, busy, label }: { onFiles: (files: FileList | null) => void; disabled: boolean; busy: boolean; label: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        hidden
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
      />
      <button type="button" className={styles.primary} disabled={disabled} onClick={() => input.current?.click()} aria-label={label}>
        {busy ? 'Subiendo…' : 'Subir PNG (podés elegir varios)'}
      </button>
    </>
  );
}
