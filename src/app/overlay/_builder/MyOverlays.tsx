'use client';

import { useCallback, useEffect, useState } from 'react';
import { LINK_TTL_DAYS, linkAirPath, linkStatus, linksSummary, normalizeLinkPath, sharePath, type SavedLink } from '@/lib/overlay/overlayLinks';
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

  /** Un enlace que creó otro pedido (el overlay manual crea el suyo al crearse). */
  const adopt = useCallback((link: SavedLink) => {
    setLinks((current) => [link, ...(current ?? []).filter((item) => item.id !== link.id)]);
  }, []);

  const patch = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const body = await call(`/api/overlay/enlaces/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    setOffset(offsetFrom(body));
    const link = body.link as SavedLink;
    // El PATCH devuelve el enlace pelado: se conserva lo de compartir que ya tenía la lista.
    let merged = link;
    setLinks((current) => (current ?? []).map((item) => {
      if (item.id !== id) return item;
      merged = { ...item, ...link };
      return merged;
    }));
    return merged;
  }, []);

  /** Dueño: genera (o lee) el link para compartir. */
  const share = useCallback(async (id: string) => {
    const body = await call(`/api/overlay/enlaces/${id}/compartir`, { method: 'POST' });
    const shareToken = String(body.shareToken ?? '');
    setLinks((current) => (current ?? []).map((item) => (item.id === id ? { ...item, shareToken } : item)));
    return shareToken;
  }, []);

  /** Dueño: corta el link (sin userId) o saca a una persona (con userId). */
  const unshare = useCallback(async (id: string, userId?: string) => {
    await call(`/api/overlay/enlaces/${id}/compartir`, { method: 'DELETE', body: JSON.stringify(userId ? { userId } : {}) });
    setLinks((current) => (current ?? []).map((item) => {
      if (item.id !== id) return item;
      return userId ? { ...item, members: (item.members ?? []).filter((member) => member.userId !== userId) } : { ...item, shareToken: null };
    }));
  }, []);

  const remove = useCallback(async (id: string) => {
    await call(`/api/overlay/enlaces/${id}`, { method: 'DELETE' });
    setLinks((current) => (current ?? []).filter((item) => item.id !== id));
  }, []);

  return { links, error, offset, save, adopt, patch, remove, share, unshare };
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

/** El id de un overlay manual (para abrir su panel), o null si no es manual. */
const manualIdOf = (path: string) => /^\/overlay\/manual\/([0-9a-f-]{36})(?:\?|$)/i.exec(path)?.[1] ?? null;

const inviteText = (title: string) => `Te comparto el overlay «${title}» de G22 Scores para que lo puedas gestionar. Entrá con tu cuenta:`;

/** El menú de compartir del sistema (celular); si no hay, copia el link. */
async function shareOrCopy(url: string, title: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Overlay · ${title}`, text: inviteText(title), url });
      return 'shared';
    } catch (problem: unknown) {
      if (problem instanceof DOMException && problem.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

/** Compartir un overlay propio: el link, enviarlo, y quiénes ya lo gestionan. */
function SharePanel({ link, origin, store }: { link: SavedLink; origin: string; store: SavedLinks }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const url = link.shareToken ? `${origin}${sharePath(link.shareToken)}` : '';
  const members = link.members ?? [];

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (failure: unknown) {
      setProblem(failure instanceof Error ? failure.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(null), 2200); };
  const send = async () => {
    const how = await shareOrCopy(url, link.title);
    if (how === 'copied') flash('Link copiado. Pegalo donde quieras.');
    if (how === 'shared') flash('Listo, enviado.');
  };

  return (
    <div className={own.sharePanel}>
      <p className={own.shareText}>
        Mandale este link a quien quieras que lo gestione. Va a tener que <b>entrar con su cuenta de G22</b> y después lo
        edita, lo renueva y maneja su panel igual que vos. Borrarlo sigue siendo solo tuyo.
      </p>
      {url ? (
        <>
          <div className={own.shareRow}>
            <input className={own.shareUrl} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link para compartir" />
            <button type="button" className={styles.primary} onClick={() => void send()}>Enviar link</button>
            <a
              className={styles.secondary}
              href={`https://wa.me/?text=${encodeURIComponent(`${inviteText(link.title)} ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
          {note ? <p className={own.shareText} role="status"><b>{note}</b></p> : null}
          <button type="button" className={own.cutLink} disabled={busy} onClick={() => void run(() => store.unshare(link.id))}>
            Cortar el link (quien ya entró lo sigue gestionando)
          </button>
        </>
      ) : (
        <div className={own.shareRow}>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void run(() => store.share(link.id))}>
            {busy ? 'Creando…' : 'Crear link para compartir'}
          </button>
        </div>
      )}
      {members.length ? (
        <ul className={own.members} aria-label="Quiénes lo gestionan">
          <li>Lo gestionan:</li>
          {members.map((member) => (
            <li key={member.userId} className={own.memberChip}>
              {member.name}
              <button type="button" aria-label={`Sacar a ${member.name}`} disabled={busy} onClick={() => void run(() => store.unshare(link.id, member.userId))}>×</button>
            </li>
          ))}
        </ul>
      ) : link.shareToken ? <p className={own.shareText}>Todavía no entró nadie con este link.</p> : null}
      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </div>
  );
}

/* ─────────────── la lista, en la pestaña ─────────────── */

export function MyOverlays({ origin, store, onCreate, onEdit }: { origin: string; store: SavedLinks; onCreate?: () => void; onEdit: (link: SavedLink) => void }) {
  const { links, error, offset, patch, remove } = store;
  const now = useNow(offset);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

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
          <p>Los que creaste y los que te compartieron, para OBS y vMix. «Editar» los abre con sus ajustes; al guardar, la URL de OBS sigue siendo la misma. «Compartir» le da a otra persona un link para gestionarlo. Cada uno vale {LINK_TTL_DAYS} días.</p>
        </div>
        {onCreate ? (
          <button type="button" className={`${styles.primary} ${own.create}`} onClick={onCreate}>
            <span aria-hidden="true">+</span> Crear overlay
          </button>
        ) : null}
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
            const isMember = link.access === 'member';
            const manualId = manualIdOf(link.path);
            const memberCount = link.members?.length ?? 0;
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
                  <span className={own.path}>
                    {isMember
                      ? <span className={own.sharedTag}>Compartido por {link.ownerName ?? 'otro usuario'}</span>
                      : memberCount ? <span className={own.sharedTag}>{memberCount === 1 ? 'Compartido con 1 persona' : `Compartido con ${memberCount} personas`}</span> : null}
                    <b>{linkKindLabel(link.path)}</b> · {link.path}
                  </span>
                </div>
                <span className={own.badge} data-state={status.state} title={`Vence el ${formatExpiry(link.expiresAt)}`}>
                  {status.label}
                </span>
                <div className={own.actions}>
                  <button type="button" className={styles.primary} onClick={() => onEdit(link)}>Editar</button>
                  {manualId ? (
                    <a className={styles.secondary} href={`/overlay/control/${manualId}`} target="_blank" rel="noopener noreferrer">Panel</a>
                  ) : null}
                  {!isMember ? (
                    <button type="button" className={styles.secondary} aria-expanded={sharing === link.id} onClick={() => setSharing((open) => (open === link.id ? null : link.id))}>
                      Compartir
                    </button>
                  ) : null}
                  <button type="button" className={styles.secondary} onClick={() => void copy(link)} disabled={status.state === 'vencido'} title={status.state === 'vencido' ? 'Renovalo para volver a usarlo' : undefined}>
                    {copied === link.id ? 'Copiada' : 'Copiar URL'}
                  </button>
                  <button type="button" className={styles.secondary} disabled={busy === link.id} onClick={() => void run(link.id, () => patch(link.id, { renovar: true }))}>
                    {busy === link.id ? 'Renovando…' : `Renovar ${LINK_TTL_DAYS} días`}
                  </button>
                  {confirming === link.id ? (
                    <>
                      <button type="button" className={own.danger} onClick={() => { setConfirming(null); void run(link.id, () => remove(link.id)); }}>
                        {isMember ? 'Dejar de gestionarlo' : 'Borrar: deja de andar en OBS'}
                      </button>
                      <button type="button" className={own.cancel} onClick={() => setConfirming(null)}>No</button>
                    </>
                  ) : (
                    <button type="button" className={own.remove} aria-label={isMember ? `Dejar de gestionar ${link.title}` : `Borrar ${link.title}`} onClick={() => setConfirming(link.id)}>×</button>
                  )}
                </div>
                {sharing === link.id && !isMember ? <SharePanel link={link} origin={origin} store={store} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={own.empty}>
          {onCreate ? (
            <>
              <p>Todavía no guardaste ninguno. Elegí un gráfico, personalizalo y tocá «Guardar y copiar».</p>
              <button type="button" className={styles.primary} onClick={onCreate}>Crear mi primer overlay</button>
            </>
          ) : (
            <p>Ya no tenés overlays compartidos. Si alguien te manda otro link, abrilo y aparece acá.</p>
          )}
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
export function SaveLink({ relative, missing, origin, defaultTitle, store, editing, onSaved, allowNew = true }: {
  relative: string;
  missing: string | null;
  origin: string;
  defaultTitle: string;
  store: SavedLinks;
  editing: SavedLink | null;
  onSaved: (link: SavedLink) => void;
  /** false = solo gestiona overlays compartidos: no puede guardar uno nuevo. */
  allowNew?: boolean;
}) {
  const { save, patch, offset } = store;
  const now = useNow(offset);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [saved, setSaved] = useState<SavedLink | null>(editing);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // El enlace puede llegar después de montar (el manual crea el suyo al crearse).
  useEffect(() => {
    if (editing && editing.id !== saved?.id) {
      setSaved(editing);
      setTitle((value) => value || editing.title);
    }
  }, [editing, saved?.id]);

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
          {allowNew ? <button type="button" className={own.asNew} onClick={() => void persist(true)} disabled={Boolean(missing) || saving}>O guardalo como un overlay nuevo</button> : null}
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
