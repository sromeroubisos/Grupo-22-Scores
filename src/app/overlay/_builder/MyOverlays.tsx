'use client';

import { useCallback, useEffect, useState } from 'react';
import { LINK_TTL_DAYS, linkAirPath, linkStatus, linksSummary, normalizeLinkPath, type SavedLink } from '@/lib/overlay/overlayLinks';
import { KIND_DEFS } from './catalog';
import { savedTarget } from './fromPath';
import styles from './studio.module.css';
import own from './mine.module.css';

/**
 * "Mis overlays": los enlaces guardados para OBS / vMix, con su vencimiento.
 *
 * Cada enlace vale 15 días desde que se guarda o se renueva. Renovar y EDITAR
 * mantienen la MISMA URL: no hay que tocar la fuente en OBS. El aviso de arriba
 * cuenta los que vencen en 3 días o menos y los ya vencidos.
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

export type SavedLinks = ReturnType<typeof useSavedLinks>;

/** La lista vive en el estudio: la pestaña la muestra con su cantidad y el editor guarda encima. */
export function useSavedLinks() {
  const [links, setLinks] = useState<SavedLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
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
  }, []);

  const save = useCallback(async (path: string, title: string) => {
    const body = await call('/api/overlay/enlaces', { method: 'POST', body: JSON.stringify({ path, title }) });
    setOffset(offsetFrom(body));
    const link = body.link as SavedLink;
    setLinks((current) => [link, ...(current ?? []).filter((item) => item.id !== link.id)]);
    return link;
  }, []);

  const patch = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const body = await call(`/api/overlay/enlaces/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    setOffset(offsetFrom(body));
    const link = body.link as SavedLink;
    setLinks((current) => (current ?? []).map((item) => (item.id === id ? link : item)));
    return link;
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

/** Qué gráfico es, para la lista: "Bloques grandes", "Tabla"… */
export function linkKindLabel(path: string): string {
  const kind = savedTarget(path)?.kind;
  return kind ? KIND_DEFS.get(kind)?.label ?? 'Overlay' : 'Overlay manual';
}

/* ─────────────── la lista, en la pestaña ─────────────── */

export function MyOverlays({ origin, store, onCreate, onEdit }: { origin: string; store: SavedLinks; onCreate: () => void; onEdit: (link: SavedLink) => void }) {
  const { links, error, offset, patch, remove } = store;
  const now = useNow(offset);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (links === null) return <p className={own.empty} role="status">Cargando tus overlays…</p>;
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
      <div className={own.head}>
        <div className={styles.shelfHead}>
          <h2 id="mis-overlays">Mis overlays</h2>
          <p>Los que creaste y guardaste para OBS y vMix. «Editar» los abre con sus ajustes; al guardar, la URL de OBS sigue siendo la misma. Cada uno vale {LINK_TTL_DAYS} días.</p>
        </div>
        <button type="button" className={`${styles.primary} ${own.create}`} onClick={onCreate}>
          <span aria-hidden="true">+</span> Crear overlay
        </button>
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
                  <span className={own.path}><b>{linkKindLabel(link.path)}</b> · {link.path}</span>
                </div>
                <span className={own.badge} data-state={status.state} title={`Vence el ${formatExpiry(link.expiresAt)}`}>
                  {status.label}
                </span>
                <div className={own.actions}>
                  <button type="button" className={styles.primary} onClick={() => onEdit(link)}>Editar</button>
                  <button type="button" className={styles.secondary} onClick={() => void copy(link)} disabled={status.state === 'vencido'} title={status.state === 'vencido' ? 'Renovalo para volver a usarlo' : undefined}>
                    {copied === link.id ? 'Copiada' : 'Copiar URL'}
                  </button>
                  <button type="button" className={styles.secondary} disabled={busy === link.id} onClick={() => void run(link.id, () => patch(link.id, { renovar: true }))}>
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
        <div className={own.empty}>
          <p>Todavía no guardaste ninguno. Elegí un gráfico, personalizalo y tocá «Guardar y copiar».</p>
          <button type="button" className={styles.primary} onClick={onCreate}>Crear mi primer overlay</button>
        </div>
      )}
      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </section>
  );
}

/* ─────────────── guardar, en el editor ─────────────── */

/**
 * Guardar desde el editor. Con `editing` (se abrió desde Mis overlays) guarda
 * ENCIMA del mismo enlace: mismo token, misma URL en OBS, y la página al aire
 * se pasa sola a la configuración nueva en menos de un minuto.
 */
export function SaveLink({ relative, missing, origin, defaultTitle, store, editing, onSaved }: {
  relative: string;
  missing: string | null;
  origin: string;
  defaultTitle: string;
  store: SavedLinks;
  editing: SavedLink | null;
  onSaved: (link: SavedLink) => void;
}) {
  const { save, patch, offset } = store;
  const now = useNow(offset);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [saved, setSaved] = useState<SavedLink | null>(editing);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Lo guardado es ESTA configuración: si cambia algo, hay que guardar de nuevo.
  const sameTitle = !saved || !title.trim() || title.trim() === saved.title;
  const current = saved && saved.path === normalizeLinkPath(relative) && sameTitle ? saved : null;
  const airUrl = saved ? `${origin}${linkAirPath(saved.path, saved.token)}` : '';
  const pending = Boolean(saved) && !current;

  const flash = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };

  const persist = async (asNew: boolean) => {
    if (current && !asNew) { if (await copyText(airUrl)) flash(); return; }
    setSaving(true);
    setProblem(null);
    try {
      const link = saved && !asNew
        ? await patch(saved.id, { path: relative, title: title.trim() || saved.title })
        : await save(relative, title.trim() || defaultTitle);
      setSaved(link);
      onSaved(link);
      if (await copyText(`${origin}${linkAirPath(link.path, link.token)}`)) flash();
    } catch (failure: unknown) {
      setProblem(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const label = saving ? 'Guardando…' : copied ? 'Copiada' : current ? 'Copiar' : saved ? 'Guardar cambios' : 'Guardar y copiar';

  return (
    <div className={own.save}>
      {editing ? <p className={own.editing}>Editando <b>{editing.title}</b>. Al guardar, la URL de OBS sigue siendo la misma.</p> : null}
      <label className={own.saveField}>
        <span>Nombre en Mis overlays</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} maxLength={120} disabled={Boolean(missing)} />
      </label>
      <div className={styles.urlRow}>
        <input className={styles.url} readOnly value={airUrl} placeholder={missing ? 'La URL aparece acá' : 'Guardalo para tener la URL de OBS'} onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay para OBS o vMix" />
        <button type="button" className={styles.primary} onClick={() => void persist(false)} disabled={Boolean(missing) || saving} title={missing ?? undefined}>
          {label}
        </button>
      </div>
      {pending ? (
        <p className={own.pendingNote}>
          Cambiaste ajustes. «Guardar cambios» los pasa al aire con la misma URL, en menos de un minuto.{' '}
          <button type="button" className={own.asNew} onClick={() => void persist(true)} disabled={Boolean(missing) || saving}>O guardalo como un overlay nuevo</button>
        </p>
      ) : current ? (
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
