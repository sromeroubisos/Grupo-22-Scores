'use client';

import { useCallback, useEffect, useState } from 'react';
import { LINK_TTL_DAYS, linkAirPath, linkStatus, linksSummary, normalizeLinkPath, type SavedLink } from '@/lib/overlay/overlayLinks';
import styles from './studio.module.css';
import own from './mine.module.css';

/**
 * "Mis overlays": los enlaces guardados para OBS / vMix, con su vencimiento.
 *
 * Cada enlace vale 15 días desde que se guarda o se renueva. Renovar mantiene la
 * MISMA URL: no hay que tocar la fuente en OBS. El aviso de arriba cuenta los
 * que vencen en 3 días o menos y los ya vencidos.
 */

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const formatExpiry = (iso: string) => dateFmt.format(new Date(iso));

/** La hora, corregida con la del servidor y refrescada cada minuto (los avisos cambian solos). */
function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const id = window.setInterval(() => setNow(Date.now() + offset), 60_000);
    return () => window.clearInterval(id);
  }, [offset]);
  return now;
}

async function call(input: string, init?: RequestInit) {
  const response = await fetch(input, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json' } });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo completar.');
  return body ?? {};
}

const offsetFrom = (body: Record<string, unknown>) => {
  const server = typeof body.serverNow === 'string' ? Date.parse(body.serverNow) : NaN;
  return Number.isFinite(server) ? server - Date.now() : 0;
};

function useSavedLinks({ list }: { list: boolean }) {
  const [links, setLinks] = useState<SavedLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!list) return;
    let cancelled = false;
    call('/api/overlay/enlaces')
      .then((body) => {
        if (cancelled) return;
        setLinks((body.links as SavedLink[]) ?? []);
        setOffset(offsetFrom(body));
      })
      .catch((problem: unknown) => {
        if (cancelled) return;
        setError(problem instanceof Error ? problem.message : 'No se pudo leer la lista.');
        setLinks([]);
      });
    return () => { cancelled = true; };
  }, [list]);

  const save = useCallback(async (path: string, title: string) => {
    const body = await call('/api/overlay/enlaces', { method: 'POST', body: JSON.stringify({ path, title }) });
    setOffset(offsetFrom(body));
    return body.link as SavedLink;
  }, []);

  const patch = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const body = await call(`/api/overlay/enlaces/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    const link = body.link as SavedLink;
    setLinks((current) => (current ?? []).map((item) => (item.id === id ? link : item)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await call(`/api/overlay/enlaces/${id}`, { method: 'DELETE' });
    setLinks((current) => (current ?? []).filter((item) => item.id !== id));
  }, []);

  return { links, error, offset, save, patch, remove };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ─────────────── la lista, en la galería ─────────────── */

export function MyOverlays({ origin }: { origin: string }) {
  const { links, error, offset, patch, remove } = useSavedLinks({ list: true });
  const now = useNow(offset);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (links === null) return null;
  const summary = linksSummary(links, now);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setProblem(null);
    try {
      await action();
    } catch (failure: unknown) {
      setProblem(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (link: SavedLink) => {
    if (await copyText(`${origin}${linkAirPath(link.path, link.token)}`)) {
      setCopied(link.id);
      window.setTimeout(() => setCopied(null), 1800);
    }
  };

  return (
    <section className={`${styles.shelf} ${own.mine}`} aria-labelledby="mis-overlays">
      <div className={styles.shelfHead}>
        <h2 id="mis-overlays">Mis overlays</h2>
        <p>Los enlaces que guardaste para OBS y vMix. Cada uno vale {LINK_TTL_DAYS} días; renovarlo no cambia la URL.</p>
      </div>

      {summary.soon || summary.expired ? (
        <div className={own.alert} role="status" data-tone={summary.expired ? 'vencido' : 'por-vencer'}>
          {summary.soon ? <span><b>{summary.soon === 1 ? '1 overlay vence' : `${summary.soon} overlays vencen`}</b> en los próximos días.</span> : null}
          {summary.expired ? <span><b>{summary.expired === 1 ? '1 overlay venció' : `${summary.expired} overlays vencieron`}</b> y ya no sale al aire.</span> : null}
          <span>Renovalos acá abajo: siguen con la misma URL.</span>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {links.length ? (
        <ul className={own.list}>
          {links.map((link) => {
            const status = linkStatus(link.expiresAt, now);
            return (
              <li key={link.id} className={own.item} data-state={status.state}>
                <div className={own.info}>
                  <input
                    className={own.title}
                    defaultValue={link.title}
                    maxLength={120}
                    aria-label="Nombre del overlay"
                    onBlur={(e) => {
                      const value = e.currentTarget.value.trim();
                      if (value && value !== link.title) void run(link.id, () => patch(link.id, { title: value }));
                    }}
                  />
                  <span className={own.path}>{link.path}</span>
                </div>
                <span className={own.badge} data-state={status.state} title={`Vence el ${formatExpiry(link.expiresAt)}`}>
                  {status.label}
                </span>
                <div className={own.actions}>
                  <button type="button" className={styles.secondary} onClick={() => void copy(link)} disabled={status.state === 'vencido'} title={status.state === 'vencido' ? 'Renovalo para volver a usarlo' : undefined}>
                    {copied === link.id ? 'Copiada' : 'Copiar URL'}
                  </button>
                  <button type="button" className={status.state === 'vigente' ? styles.secondary : styles.primary} disabled={busy === link.id} onClick={() => void run(link.id, () => patch(link.id, { renovar: true }))}>
                    {busy === link.id ? 'Renovando…' : `Renovar ${LINK_TTL_DAYS} días`}
                  </button>
                  {confirming === link.id ? (
                    <>
                      <button type="button" className={own.danger} onClick={() => { setConfirming(null); void run(link.id, () => remove(link.id)); }}>Borrar: deja de andar en OBS</button>
                      <button type="button" className={own.cancel} onClick={() => setConfirming(null)}>No</button>
                    </>
                  ) : (
                    <button type="button" className={own.remove} aria-label={`Borrar ${link.title}`} onClick={() => setConfirming(link.id)}>×</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={own.empty}>Todavía no guardaste ninguno. Elegí un gráfico, personalizalo y tocá «Guardar y copiar».</p>
      )}
      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </section>
  );
}

/* ─────────────── guardar, en el editor ─────────────── */

export function SaveLink({ relative, missing, origin, defaultTitle }: { relative: string; missing: string | null; origin: string; defaultTitle: string }) {
  const { save, offset } = useSavedLinks({ list: false });
  const now = useNow(offset);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<SavedLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Lo guardado es ESTA configuración: si cambia algo, hay que guardar de nuevo.
  const current = saved && saved.path === normalizeLinkPath(relative) ? saved : null;
  const airUrl = current ? `${origin}${linkAirPath(current.path, current.token)}` : '';

  const flash = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };

  const saveAndCopy = async () => {
    if (current) { if (await copyText(airUrl)) flash(); return; }
    setSaving(true);
    setProblem(null);
    try {
      const link = await save(relative, title.trim() || defaultTitle);
      setSaved(link);
      if (await copyText(`${origin}${linkAirPath(link.path, link.token)}`)) flash();
    } catch (failure: unknown) {
      setProblem(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={own.save}>
      <label className={own.saveField}>
        <span>Nombre en Mis overlays</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} maxLength={120} disabled={Boolean(missing)} />
      </label>
      <div className={styles.urlRow}>
        <input className={styles.url} readOnly value={airUrl} placeholder={missing ? 'La URL aparece acá' : saved ? 'Cambiaste ajustes: guardalo de nuevo' : 'Guardalo para tener la URL de OBS'} onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay para OBS o vMix" />
        <button type="button" className={styles.primary} onClick={() => void saveAndCopy()} disabled={Boolean(missing) || saving} title={missing ?? undefined}>
          {saving ? 'Guardando…' : copied ? 'Copiada' : current ? 'Copiar' : 'Guardar y copiar'}
        </button>
      </div>
      {current ? (
        <p className={own.savedNote}>
          Guardado en Mis overlays. <b>{linkStatus(current.expiresAt, now).label}</b> ({formatExpiry(current.expiresAt)}). Renovalo desde la lista y la URL sigue siendo la misma.
        </p>
      ) : (
        <p className={styles.hint}>{missing ?? `La URL de OBS sale al guardarlo. Vale ${LINK_TTL_DAYS} días y se renueva desde Mis overlays.`}</p>
      )}
      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </div>
  );
}
