'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_GAMES,
  SCORING,
  currentHeadline,
  manualElapsed,
  readManualState,
  resolveLinkedScore,
  type HeadlineItem,
  type ManualHeadlineState,
  type ManualKind,
  type ManualScoreState,
  type ManualSponsorsState,
  type ManualSport,
  type ManualState,
} from '@/lib/overlay/manualOverlay';
import { ClubPicker, MatchPicker } from '../../_builder/Pickers';
import { sevensClockPatch, teamsFromMatch } from '../../_builder/matchTeams';
import SponsorsPanel, { type UploadedLogo } from './SponsorsPanel';
import { g22ScoreOf, type G22Score } from '../../_components/g22Score';
import styles from './control.module.css';
import { linkAirPath, linkStatus } from '@/lib/overlay/overlayLinks';
import { CONVERSION_SECONDS, SHOT_LABEL, SHOT_TIMES, shotView } from '@/lib/overlay/shotClock';


type PanelLink = { path: string; token: string; expiresAt: string };

/**
 * Panel de un overlay manual. La clave llega en el fragmento de la URL
 * (`#clave=…`, que no viaja al servidor ni queda en logs) y se recuerda en este
 * navegador para no tener que pegarla de nuevo.
 *
 * Cada botón manda el cambio al instante; los textos, medio segundo después de
 * dejar de tipear. El panel relee el estado cada dos segundos: si dos personas
 * lo manejan a la vez, ven lo mismo.
 */

const KEY_STORAGE = (id: string) => `g22-overlay-key:${id}`;

type Patch = Record<string, unknown>;
type Payload = { state?: unknown; clock?: unknown; score?: unknown; shot?: unknown; game?: unknown; g22?: { home: number; away: number } };

function readKey(id: string): string {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('clave');
  try {
    if (fromHash) {
      window.localStorage.setItem(KEY_STORAGE(id), fromHash);
      return fromHash;
    }
    return window.localStorage.getItem(KEY_STORAGE(id)) ?? '';
  } catch {
    return fromHash ?? '';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Mezcla de un nivel: `{ clock: { countdown } }` no borra el resto del reloj. */
function mergePatch<T extends object>(current: T, patch: Patch): T {
  const next: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const prev = next[key];
    next[key] = isObject(value) && isObject(prev) ? { ...prev, ...value } : value;
  }
  return next as T;
}

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function parseMmss(raw: string): number | null {
  const match = raw.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

export default function ControlPanel({ id, embedded = false, initialKey = '' }: {
  id: string;
  /** Adentro del editor de overlays: sin cabecera ni URL (están al lado). */
  embedded?: boolean;
  /** La clave recién creada (el editor la tiene; el link del panel la trae en el #). */
  initialKey?: string;
}) {
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<ManualKind | null>(null);
  const [state, setState] = useState<ManualState | null>(null);
  const [offset, setOffset] = useState(0);
  const [link, setLink] = useState<PanelLink | null | undefined>(undefined);
  const [serverClock, setServerClock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Sin clave: si la sesión de G22 lo puede manejar (propio o compartido).
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const askedSession = useRef(false);
  const [origin, setOrigin] = useState('');
  const pendingText = useRef<number | null>(null);
  const lastLocalEdit = useRef(0);

  useEffect(() => {
    setKey(initialKey || readKey(id));
    setOrigin(window.location.origin);
  }, [id, initialKey]);

  const applyServer = useCallback((body: { kind: ManualKind; state: unknown; serverNow?: string; link?: PanelLink | null; canEdit?: boolean }, requestedAt: number) => {
    setKind(body.kind);
    if (typeof body.canEdit === 'boolean') setCanEdit(body.canEdit);
    if (body.link !== undefined) setLink(body.link);
    setState(readManualState(body.kind, body.state));
    const serverNow = Date.parse(body.serverNow ?? '');
    if (Number.isFinite(serverNow)) {
      setOffset(serverNow - (requestedAt + Date.now()) / 2);
      setServerClock(serverNow);
    }
  }, []);

  // Lectura periódica (otra persona puede estar manejando el mismo overlay).
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      // Mientras se tipea no se pisa lo que está escribiendo el operador.
      if (Date.now() - lastLocalEdit.current > 2_500) {
        const requestedAt = Date.now();
        try {
          // Con la clave, el servidor también manda el enlace guardado para OBS y su vencimiento.
          // Sin clave, la primera lectura pregunta si la sesión lo puede manejar.
          const headers: Record<string, string> = key ? { 'x-overlay-key': key } : {};
          if (!key && !askedSession.current) {
            headers['x-overlay-session'] = '1';
            askedSession.current = true;
          }
          const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}`, { cache: 'no-store', headers });
          const body = await response.json().catch(() => null);
          if (!cancelled) {
            if (response.ok && body) {
              applyServer(body, requestedAt);
              setError(null);
            } else {
              setError(body?.error ?? 'No se pudo leer el overlay.');
            }
          }
        } catch {
          if (!cancelled) setError('Sin conexión con g22scores.');
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, 2_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, key, applyServer]);

  const send = useCallback(async (payload: Payload) => {
    if (!key && canEdit === false) {
      setError('Para manejarlo entrá con tu cuenta de G22 (la que tiene este overlay en Mis overlays) o abrí el link del panel con su clave.');
      return;
    }
    setSaving(true);
    const requestedAt = Date.now();
    try {
      const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: key ? { 'Content-Type': 'application/json', 'x-overlay-key': key } : { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body) {
        applyServer(body, requestedAt);
        setError(null);
      } else {
        setError(body?.error ?? 'No se pudo guardar.');
      }
    } catch {
      setError('Sin conexión con g22scores. El cambio no se guardó.');
    } finally {
      setSaving(false);
    }
  }, [id, key, canEdit, applyServer]);

  /** Cambio inmediato y optimista (botones). */
  const patchNow = useCallback((patch: Patch) => {
    setState((current) => (current ? mergePatch(current, patch) : current));
    void send({ state: patch });
  }, [send]);

  /** Cambio de texto: se ve al instante en el panel, se manda al dejar de tipear. */
  const patchText = useCallback((patch: Patch) => {
    lastLocalEdit.current = Date.now();
    setState((current) => (current ? mergePatch(current, patch) : current));
    if (pendingText.current) window.clearTimeout(pendingText.current);
    pendingText.current = window.setTimeout(() => void send({ state: patch }), 450);
  }, [send]);

  /** Sube un logo del overlay de sponsors; devuelve su URL y su proporción ya recortada. */
  const uploadLogo = useCallback(async (file: Blob, name: string): Promise<UploadedLogo> => {
    if (!key && canEdit === false) throw new Error('Entrá con tu cuenta de G22 o abrí el link del panel con su clave.');
    const form = new FormData();
    form.append('file', file, name);
    const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}/logo`, {
      method: 'POST',
      headers: key ? { 'x-overlay-key': key } : undefined,
      body: form,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url) throw new Error(body?.error ?? 'No se pudo subir.');
    return { url: String(body.url), ratio: Number(body.ratio) || 2 };
  }, [id, key, canEdit]);

  const overlayUrl = link ? `${origin}${linkAirPath(link.path, link.token)}` : '';
  const linkInfo = link && serverClock ? linkStatus(link.expiresAt, serverClock) : null;

  return (
    <main className={embedded ? `${styles.page} ${styles.embedded}` : styles.page}>
      {embedded ? null : (
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Panel de control · G22</p>
          <h1 className={styles.h1}>{kind === 'titular' ? 'Titulares' : kind === 'sponsors' ? 'Sponsors' : 'Marcador manual'}</h1>
        </div>
        <span className={styles.saving}>{saving ? 'Guardando…' : error ? '' : 'Al día'}</span>
      </header>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {embedded ? null : (
      <section className={styles.urlBox}>
        <span>URL para OBS / vMix (1920×1080)</span>
        <div className={styles.urlRow}>
          <input readOnly value={overlayUrl} placeholder={link === null ? 'Guardalo en Mis overlays (g22scores.com/overlay)' : 'Cargando…'} onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay" />
          <button type="button" disabled={!overlayUrl} onClick={() => void navigator.clipboard?.writeText(overlayUrl)}>Copiar</button>
        </div>
        {linkInfo ? (
          <p className={styles.linkExpiry} data-state={linkInfo.state} role={linkInfo.state === 'vigente' ? undefined : 'status'}>
            {linkInfo.state === 'vencido'
              ? `${linkInfo.label}: ya no sale al aire. Renovalo en g22scores.com/overlay, en Mis overlays; la URL sigue siendo la misma.`
              : linkInfo.state === 'por-vencer'
                ? `${linkInfo.label}. Renovalo en g22scores.com/overlay, en Mis overlays, antes de salir al aire.`
                : `${linkInfo.label}. Se renueva en g22scores.com/overlay, en Mis overlays.`}
          </p>
        ) : null}
        <small>
          {key
            ? 'Guardá este panel en favoritos: el link ya trae la clave. Quien lo tenga puede manejar el overlay.'
            : canEdit
              ? 'Lo manejás con tu cuenta de G22. Para sumar a alguien, compartilo desde Mis overlays.'
              : canEdit === false
                ? 'Solo lectura: entrá con la cuenta que tiene este overlay en Mis overlays, o abrí el link del panel con su clave.'
                : ''}
        </small>
      </section>
      )}

      {!state ? <p className={styles.muted}>Cargando…</p> : kind === 'titular'
        ? <HeadlinePanel state={state as ManualHeadlineState} offset={offset} patchNow={patchNow} patchText={patchText} />
        : kind === 'sponsors'
          ? <SponsorsPanel state={state as ManualSponsorsState} patchNow={patchNow} patchText={patchText} uploadLogo={uploadLogo} />
          : <ScorePanel state={state as ManualScoreState} offset={offset} patchNow={patchNow} patchText={patchText} send={send} />}
    </main>
  );
}

/* ─── marcador ─── */

const SPORT_LABELS: Record<ManualSport, string> = { rugby: 'Rugby', futbol: 'Fútbol', hockey: 'Hockey', basquet: 'Básquet', otro: 'Otro' };

function ScorePanel({
  state,
  offset,
  patchNow,
  patchText,
  send,
}: {
  state: ManualScoreState;
  offset: number;
  patchNow: (patch: Patch) => void;
  patchText: (patch: Patch) => void;
  send: (payload: Payload) => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [setTime, setSetTime] = useState('');
  const [scorer, setScorer] = useState<Record<'home' | 'away', string>>({ home: '', away: '' });
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [shotTime, setShotTime] = useState('1:00');
  const [shotTeam, setShotTeam] = useState<'' | 'home' | 'away'>('');
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  const elapsed = manualElapsed(state.clock, now + offset);
  const shown = state.clock.countdown ? Math.max(0, state.clock.limit - elapsed) : elapsed;
  const expired = state.clock.limit > 0 && (state.clock.countdown ? shown === 0 : elapsed >= state.clock.limit);

  // Puntos de un partido de G22: se lee su resultado y se muestra lo que va al aire.
  const [followMatch, setFollowMatch] = useState(true);
  const [g22, setG22] = useState<G22Score | null>(null);
  const linkedMatch = state.link?.matchId ?? null;
  useEffect(() => {
    if (!linkedMatch) { setG22(null); return undefined; }
    let cancelled = false;
    const read = () => void g22ScoreOf(linkedMatch).then((value) => { if (!cancelled) setG22(value); });
    read();
    const interval = window.setInterval(read, 2_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [linkedMatch]);
  const linked = resolveLinkedScore(state, g22);
  const teamScore = (side: 'home' | 'away') => linked[side];
  // Toda corrección sobre un marcador vinculado lleva cómo se ve G22: el servidor parte de lo que está al aire.
  const withG22 = (payload: Payload): Payload => (state.link && g22 ? { ...payload, g22 } : payload);

  const score = (team: 'home' | 'away', type: string) => {
    // El jugador elegido sale en la placa ("TRY · Juan Pérez"); después se limpia.
    void send(withG22({ score: { event: { team, type, player: scorer[team] || null } } }));
    setScorer((current) => ({ ...current, [team]: '' }));
  };

  /** ±1 punto: sobre lo que se ve al aire. */
  const nudge = (side: 'home' | 'away', delta: number) => {
    const value = Math.max(0, teamScore(side) + delta);
    if (state.link && g22) void send({ state: { [side]: { score: value } }, g22 });
    else patchNow({ [side]: { score: value } });
  };

  const fixTime = () => {
    const seconds = parseMmss(setTime);
    if (seconds === null) return;
    void send({ clock: { set: seconds } });
    setSetTime('');
  };

  const recent = [...state.events].reverse().slice(0, 8);
  const shot = shotView(state.shot, now + offset);
  const startOwnShot = () => {
    const seconds = parseMmss(shotTime);
    if (!seconds) return;
    void send({ shot: { start: { label: SHOT_LABEL, seconds, team: shotTeam || null } } });
  };

  return (
    <div className={styles.grid}>
      <GamesCard state={state} send={send} />
      <section className={styles.card}>
        <h2>En pantalla</h2>
        <button type="button" className={styles.visible} data-on={state.visible ? '' : undefined} onClick={() => patchNow({ visible: !state.visible })}>
          {state.visible ? 'Visible · tocá para ocultar' : 'Oculto · tocá para mostrar'}
        </button>
        <div className={styles.segment} role="radiogroup" aria-label="Estado del partido">
          {(['previa', 'vivo', 'final'] as const).map((status) => (
            <button key={status} type="button" role="radio" aria-checked={state.status === status} onClick={() => patchNow({ status })}>
              {status === 'previa' ? 'Previa' : status === 'vivo' ? 'En vivo' : 'Final'}
            </button>
          ))}
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>Deporte (botones de anotar)</span>
            <select value={state.sport} onChange={(e) => patchNow({ sport: e.target.value })}>
              {(Object.keys(SPORT_LABELS) as ManualSport[]).map((sport) => <option key={sport} value={sport}>{SPORT_LABELS[sport]}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Título (torneo, opcional)</span>
            <input value={state.title} maxLength={60} onChange={(e) => patchText({ title: e.target.value })} />
          </label>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Equipos</h2>
        <p className={styles.muted}>
          {state.home.name} vs {state.away.name}. Para cambiarlos, traé los dos de un partido de G22 (con colores, escudos y planteles) o elegí cada club en su tarjeta, abajo.
        </p>
        <MatchPicker
          actionLabel="Traer equipos"
          onPick={(id, found) => {
            setLoadingTeams(true);
            teamsFromMatch(id, found)
              .then((teams) => {
                const patch: Patch = { sport: teams.sport, ...(sevensClockPatch(teams) ?? {}) };
                if (teams.home) patch.home = teams.home;
                if (teams.away) patch.away = teams.away;
                if (teams.title) patch.title = teams.title;
                patch.link = followMatch ? { matchId: id } : null;
                patchNow(patch);
              })
              .catch(() => undefined)
              .finally(() => setLoadingTeams(false));
          }}
        />
        <label className={styles.checkRow}>
          <input type="checkbox" checked={followMatch} onChange={(e) => setFollowMatch(e.target.checked)} />
          <span>Tomar también los <b>puntos</b> de ese partido de G22 (los podés corregir a mano acá)</span>
        </label>
        {loadingTeams ? <p className={styles.muted}>Trayendo equipos y planteles…</p> : null}
      </section>

      <section className={styles.card}>
        <h2>Puntos</h2>
        <div className={styles.segment} role="radiogroup" aria-label="De dónde salen los puntos">
          <button type="button" role="radio" aria-checked={!state.link} onClick={() => { if (state.link) patchNow({ link: null }); }}>
            Los cargo yo
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={Boolean(state.link)}
            disabled={!state.link}
            title={state.link ? undefined : 'Traé los equipos de un partido de G22 con «Tomar también los puntos» tildado.'}
          >
            Del partido de G22
          </button>
        </div>
        {state.link ? (
          <>
            <p className={styles.muted} role="status">
              {linked.source === 'corregido'
                ? `Corregido a mano: va ${linked.home} – ${linked.away}. Cuando G22 cargue algo nuevo vuelve a mandar G22${g22 ? ` (G22 tiene ${g22.home} – ${g22.away})` : ''}.`
                : g22
                  ? `Siguiendo a G22: ${g22.home} – ${g22.away}. Si la carga viene atrasada, anotá abajo y se corrige.`
                  : 'Buscando el resultado en G22…'}
            </p>
            {linked.source === 'corregido' ? (
              <button type="button" onClick={() => patchNow({ link: { seen: null } })}>Volver a G22 ya</button>
            ) : null}
          </>
        ) : (
          <p className={styles.muted}>Los cargás con los botones de cada equipo. Para que salgan solos, traé los equipos de un partido de G22 con «Tomar también los puntos».</p>
        )}
      </section>

      <section className={styles.card}>
        <h2>Reloj</h2>
        <div className={styles.clock} data-expired={expired ? '' : undefined}>{mmss(shown)}</div>
        <div className={styles.buttons}>
          {state.clock.running
            ? <button type="button" className={styles.primary} onClick={() => void send({ clock: 'pause' })}>Pausar</button>
            : <button type="button" className={styles.primary} onClick={() => void send({ clock: 'start', state: state.status === 'previa' ? { status: 'vivo' } : undefined })}>Arrancar</button>}
          <button type="button" onClick={() => void send({ clock: 'reset' })}>Reiniciar</button>
        </div>
        <div className={styles.adjust} aria-label="Corregir el tiempo">
          {[-60, -10, -1, 1, 10, 60].map((delta) => (
            <button key={delta} type="button" onClick={() => void send({ clock: { adjust: delta } })}>
              {delta > 0 ? '+' : '−'}{Math.abs(delta) >= 60 ? `${Math.abs(delta) / 60}′` : `${Math.abs(delta)}″`}
            </button>
          ))}
        </div>
        <div className={styles.inline}>
          <input value={setTime} onChange={(e) => setSetTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fixTime(); }} placeholder="mm:ss" aria-label="Fijar tiempo (mm:ss)" />
          <button type="button" onClick={fixTime} disabled={parseMmss(setTime) === null}>Fijar tiempo</button>
        </div>
        <div className={styles.periods}>
          {['1T', '2T', 'HT', 'ET', 'PEN'].map((period) => (
            <button key={period} type="button" aria-pressed={state.period === period} onClick={() => patchNow({ period })}>{period}</button>
          ))}
          <input value={state.period} maxLength={12} aria-label="Período (texto libre)" onChange={(e) => patchText({ period: e.target.value })} />
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>El período termina a los (min)</span>
            <input
              type="number"
              min={0}
              max={180}
              value={Math.round(state.clock.limit / 60)}
              onChange={(e) => patchNow({ clock: { limit: Math.max(0, Number(e.target.value) || 0) * 60 } })}
            />
          </label>
          <label className={styles.field}>
            <span>Sin-bin de la amarilla (min)</span>
            <input type="number" min={0} max={20} value={Math.round(state.sinBin / 60)} onChange={(e) => patchNow({ sinBin: Math.max(0, Number(e.target.value) || 0) * 60 })} />
          </label>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={state.clock.countdown} onChange={(e) => patchNow({ clock: { countdown: e.target.checked } })} />
          <span>Contar para atrás (hasta 0). Al cumplirse el tiempo, el reloj se pone en rojo.</span>
        </label>
      </section>

      <section className={styles.card}>
        <h2>Shot clock</h2>
        {shot ? (
          <>
            <p className={styles.shotNow}>
              {shot.team ? `${state[shot.team].short} · ` : ''}Corriendo{shot.paused ? ' · en pausa' : shot.done ? ' · terminó' : ''}
            </p>
            <div className={styles.clock} data-expired={shot.urgent ? '' : undefined}>{shot.time}</div>
            <div className={styles.buttons}>
              {shot.paused
                ? <button type="button" className={styles.primary} onClick={() => void send({ shot: 'resume' })}>Seguir</button>
                : <button type="button" className={styles.primary} onClick={() => void send({ shot: 'pause' })} disabled={shot.done}>Pausar</button>}
              <button type="button" onClick={() => void send({ shot: 'stop' })}>Sacar</button>
            </div>
            {state.sport === 'rugby' ? <KickResult state={state} team={shot.team} send={send} /> : null}
          </>
        ) : (
          <p className={styles.muted}>Una cuenta corta debajo del marcador. Se va sola cuando llega a cero.</p>
        )}
        <div className={styles.periods} aria-label="Arrancar el shot clock">
          {SHOT_TIMES.map((seconds) => (
            <button key={seconds} type="button" onClick={() => void send({ shot: { start: { label: SHOT_LABEL, seconds, team: shotTeam || null } } })}>
              {mmss(seconds)}
            </button>
          ))}
        </div>
        <div className={styles.inline}>
          <input value={shotTime} placeholder="1:00" aria-label="Otro tiempo (mm:ss)" onChange={(e) => setShotTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') startOwnShot(); }} />
          <button type="button" onClick={startOwnShot} disabled={!parseMmss(shotTime)} title={parseMmss(shotTime) ? undefined : 'Poné el tiempo en mm:ss'}>Arrancar este tiempo</button>
          <select value={shotTeam} onChange={(e) => setShotTeam(e.target.value as '' | 'home' | 'away')} aria-label="De qué equipo es el shot clock">
            <option value="">Sin equipo</option>
            <option value="home">{state.home.short}</option>
            <option value="away">{state.away.short}</option>
          </select>
        </div>
        {!parseMmss(shotTime) ? <p className={styles.muted}>Poné el tiempo en mm:ss para arrancarlo.</p> : null}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={state.autoShot > 0}
            onChange={(e) => patchNow({ autoShot: e.target.checked ? CONVERSION_SECONDS : 0 })}
          />
          <span>Arranca solo después de cada try. La conversión, hecha o errada, lo saca.</span>
        </label>
        {state.autoShot > 0 ? (
          <label className={styles.field}>
            <span>Tiempo después del try</span>
            <select value={state.autoShot} onChange={(e) => patchNow({ autoShot: Number(e.target.value) })}>
              {[...new Set<number>([...SHOT_TIMES, state.autoShot])].sort((a, b) => a - b).map((seconds) => (
                <option key={seconds} value={seconds}>{mmss(seconds)}{seconds === CONVERSION_SECONDS ? ' (conversión)' : ''}</option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {(['home', 'away'] as const).map((side) => {
        const team = state[side];
        return (
          <section className={styles.card} key={side} style={{ borderTopColor: team.color ?? undefined }}>
            <div className={styles.teamHead}>
              <h2>{side === 'home' ? 'Local' : 'Visitante'} · {team.short}</h2>
              <label className={styles.teamColor}>
                <span>Color</span>
                <input type="color" value={team.color ?? '#00a365'} onChange={(e) => patchNow({ [side]: { color: e.target.value } })} aria-label={`Color del ${side === 'home' ? 'local' : 'visitante'} en el marcador`} />
              </label>
            </div>
            <div className={styles.score}>{teamScore(side)}</div>
            <label className={styles.field}>
              <span>Quién (opcional: sale en la placa)</span>
              <select value={scorer[side]} onChange={(e) => setScorer((current) => ({ ...current, [side]: e.target.value }))}>
                <option value="">— Sin jugador —</option>
                {team.players.map((player) => <option key={player} value={player}>{player}</option>)}
              </select>
            </label>
            <div className={styles.scoreButtons}>
              {SCORING[state.sport].map((button) => (
                <button key={button.type} type="button" className={styles.plus} onClick={() => score(side, button.type)}>
                  {button.label} <b>+{button.points}</b>
                </button>
              ))}
            </div>
            <div className={styles.cardButtons}>
              <button type="button" className={styles.yellow} onClick={() => score(side, 'yellow_card')}>Amarilla</button>
              <button type="button" className={styles.red} onClick={() => score(side, 'red_card')}>Roja</button>
              <button type="button" onClick={() => nudge(side, -1)}>−1 punto</button>
              <button type="button" onClick={() => nudge(side, 1)}>+1 punto</button>
            </div>
            <details className={styles.details}>
              <summary>Equipo: nombre, sigla, escudo y plantel</summary>
              <div className={styles.field}>
                <span>Elegir un club de G22 (nombre, sigla, color y escudo de una)</span>
                <ClubPicker
                  label={`Buscar club ${side === 'home' ? 'local' : 'visitante'}`}
                  onPick={(club) => patchNow({ [side]: { name: club.name, short: club.short, color: club.color ?? team.color, logo: club.logo } })}
                />
              </div>
              <label className={styles.field}>
                <span>Nombre</span>
                <input value={team.name} maxLength={40} onChange={(e) => patchText({ [side]: { name: e.target.value } })} />
              </label>
              <label className={styles.field}>
                <span>Sigla</span>
                <input value={team.short} maxLength={16} onChange={(e) => patchText({ [side]: { short: e.target.value } })} />
              </label>
              <label className={styles.field}>
                <span>Escudo (link https a una imagen, opcional)</span>
                <input value={team.logo ?? ''} placeholder="https://…/escudo.png" onChange={(e) => patchText({ [side]: { logo: e.target.value } })} />
              </label>
              <label className={styles.field}>
                <span>Plantel (uno por renglón, ej. «10 Juan Pérez»)</span>
                <textarea
                  key={team.players.join('|')}
                  rows={6}
                  defaultValue={team.players.join('\n')}
                  onBlur={(e) => patchNow({ [side]: { players: e.target.value.split('\n') } })}
                />
              </label>
            </details>
          </section>
        );
      })}

      <section className={styles.card}>
        <h2>Últimos cargados</h2>
        {recent.length ? (
          <ul className={styles.events}>
            {recent.map((event) => (
              <li key={event.id}>
                <span>{Math.floor(event.at / 60) + 1}′ · {state[event.team].short} · {labelOf(state.sport, event.type)}{event.player ? ` · ${event.player}` : ''}</span>
                <button type="button" aria-label="Borrar este evento (resta sus puntos)" onClick={() => void send(withG22({ score: { undo: event.id } }))}>×</button>
              </li>
            ))}
          </ul>
        ) : <p className={styles.muted}>Lo que cargues aparece acá. Con la × lo borrás y se restan sus puntos.</p>}
        <button type="button" onClick={() => void send(withG22({ score: { undo: true } }))} disabled={!state.events.length}>Deshacer el último</button>
      </section>
    </div>
  );
}

function labelOf(sport: ManualSport, type: string) {
  if (type === 'yellow_card') return 'Amarilla';
  if (type === 'red_card') return 'Roja';
  return SCORING[sport].find((button) => button.type === type)?.label ?? type;
}

/* ─── titulares (noticiero) ─── */

function HeadlinePanel({
  state,
  offset,
  patchNow,
  patchText,
}: {
  state: ManualHeadlineState;
  offset: number;
  patchNow: (patch: Patch) => void;
  patchText: (patch: Patch) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const onAir = currentHeadline(state, now + offset).index;

  const setItems = (items: HeadlineItem[], text = false) => (text ? patchText : patchNow)({ items });
  const edit = (index: number, field: 'kicker' | 'title' | 'subtitle', value: string) =>
    setItems(state.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)), true);
  const add = () => setItems([...state.items, { id: `h${Date.now().toString(36)}`, kicker: state.items.at(-1)?.kicker ?? '', title: '', subtitle: '' }]);
  const remove = (index: number) => setItems(state.items.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= state.items.length) return;
    const items = [...state.items];
    [items[index], items[target]] = [items[target], items[index]];
    setItems(items);
  };
  const go = (index: number) => patchNow({ current: (index + state.items.length) % state.items.length, rotate: 0, visible: true });

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h2>Al aire</h2>
        <button type="button" className={styles.visible} data-on={state.visible ? '' : undefined} onClick={() => patchNow({ visible: !state.visible })}>
          {state.visible ? 'Al aire · tocá para sacarlo' : 'Fuera del aire · tocá para mostrarlo'}
        </button>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={() => go(onAir + 1)}>Siguiente título</button>
          <button type="button" onClick={() => go(onAir - 1)}>Anterior</button>
        </div>
        <div className={styles.segment} role="radiogroup" aria-label="Estilo">
          {([['noticiero', 'Noticiero'], ['persona', 'Nombre de quien habla'], ['tarjeta', 'Tarjeta']] as const).map(([style, label]) => (
            <button key={style} type="button" role="radio" aria-checked={state.style === style} onClick={() => patchNow({ style })}>{label}</button>
          ))}
        </div>
        <label className={styles.field}>
          <span>Rotar solos cada (segundos, 0 = a mano)</span>
          <input type="number" min={0} max={600} value={state.rotate} onChange={(e) => patchNow({ rotate: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className={styles.field}>
          <span>Texto que corre abajo (opcional, solo noticiero)</span>
          <input value={state.ticker} maxLength={400} onChange={(e) => patchText({ ticker: e.target.value })} />
        </label>
      </section>

      <section className={styles.card}>
        <h2>Títulos ({state.items.length})</h2>
        <ol className={styles.headlines}>
          {state.items.map((item, index) => (
            <li key={item.id} data-on={index === onAir ? '' : undefined}>
              <div className={styles.headlineFields}>
                <input value={item.kicker} maxLength={40} placeholder={state.style === 'persona' ? 'Etiqueta (ej. COMENTARISTA)' : 'Antetítulo (ej. ÚLTIMO MOMENTO)'} onChange={(e) => edit(index, 'kicker', e.target.value)} />
                <input value={item.title} maxLength={140} placeholder={state.style === 'persona' ? 'Nombre' : 'Titular'} onChange={(e) => edit(index, 'title', e.target.value)} />
                <input value={item.subtitle} maxLength={200} placeholder={state.style === 'persona' ? 'Rol o club' : 'Bajada (opcional)'} onChange={(e) => edit(index, 'subtitle', e.target.value)} />
              </div>
              <div className={styles.headlineActions}>
                <button type="button" className={index === onAir ? styles.primary : undefined} onClick={() => go(index)}>
                  {index === onAir ? 'Al aire' : 'Mostrar'}
                </button>
                <button type="button" aria-label="Subir" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" aria-label="Bajar" onClick={() => move(index, 1)} disabled={index === state.items.length - 1}>↓</button>
                <button type="button" aria-label={`Borrar «${item.title || 'título'}»`} onClick={() => remove(index)} disabled={state.items.length === 1}>×</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={add} disabled={state.items.length >= 30}>+ Agregar título</button>
      </section>
    </div>
  );
}

/* ─── varios marcadores ─── */

type DraftTeam = { name: string; short: string; color: string | null; logo: string | null };
const EMPTY_TEAM: DraftTeam = { name: '', short: '', color: null, logo: null };

const STATUS_LABELS: Record<ManualScoreState['status'], string> = { previa: 'Previa', vivo: 'En vivo', final: 'Final' };

/**
 * Los partidos del marcador: el que está al aire y la fila de los que siguen.
 * «Pasar al siguiente» saca al aire el primero de la fila (el overlay hace el
 * cambio animado) y el que sale va al final, con su resultado y el reloj parado.
 */
function GamesCard({ state, send }: { state: ManualScoreState; send: (payload: Payload) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [home, setHome] = useState<DraftTeam>(EMPTY_TEAM);
  const [away, setAway] = useState<DraftTeam>(EMPTY_TEAM);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const full = state.queue.length >= MAX_GAMES - 1;
  const next = state.queue[0] ?? null;

  const reset = () => { setHome(EMPTY_TEAM); setAway(EMPTY_TEAM); setTitle(''); setAdding(false); };
  const clean = (team: DraftTeam) => (team.name.trim() ? { ...team, name: team.name.trim(), short: team.short.trim() || undefined } : undefined);
  const add = () => {
    void send({ game: { add: { home: clean(home), away: clean(away), title: title.trim() || undefined } } });
    reset();
  };
  const missing = !home.name.trim() || !away.name.trim() ? 'Poné los dos equipos (o elegí cada club) para agregarlo.' : null;

  return (
    <section className={`${styles.card} ${styles.gamesCard}`}>
      <div className={styles.gamesHead}>
        <h2>Marcadores · {state.queue.length + 1}</h2>
        {next ? (
          <button type="button" className={styles.primaryBtn} onClick={() => void send({ game: { switch: next.id } })}>
            Pasar al siguiente: {next.home.short} vs {next.away.short} →
          </button>
        ) : null}
      </div>

      <ol className={styles.games}>
        <li data-on="">
          <span className={styles.gameOnAir}>Al aire</span>
          <span className={styles.gameName}>{state.home.name} <b>{state.home.score} – {state.away.score}</b> {state.away.name}</span>
          <span className={styles.muted}>{STATUS_LABELS[state.status]}</span>
        </li>
        {state.queue.map((game, index) => (
          <li key={game.id}>
            <span className={styles.gameOrder}>{index === 0 ? 'Sigue' : `${index + 1}°`}</span>
            <span className={styles.gameName}>{game.home.name} <b>{game.home.score} – {game.away.score}</b> {game.away.name}</span>
            <span className={styles.gameActions}>
              <button type="button" onClick={() => void send({ game: { switch: game.id } })}>Pasar al aire</button>
              {confirming === game.id ? (
                <>
                  <button type="button" className={styles.dangerBtn} onClick={() => { setConfirming(null); void send({ game: { remove: game.id } }); }}>Sacarlo</button>
                  <button type="button" onClick={() => setConfirming(null)}>No</button>
                </>
              ) : (
                <button type="button" aria-label={`Sacar ${game.home.name} vs ${game.away.name}`} onClick={() => setConfirming(game.id)}>×</button>
              )}
            </span>
          </li>
        ))}
      </ol>

      {!state.queue.length ? (
        <p className={styles.muted}>Cargá acá los partidos que vienen y, cuando termine este, pasás al siguiente sin armar otro overlay. Cada uno guarda su resultado.</p>
      ) : null}

      {adding ? (
        <div className={styles.gameForm}>
          <div className={styles.field}>
            <span>Traer los dos equipos de un partido de G22</span>
            <MatchPicker
              actionLabel="Agregar este partido"
              onPick={(id, found) => {
                setLoading(true);
                teamsFromMatch(id, found)
                  .then((teams) => {
                    void send({ game: { add: { sport: teams.sport, home: teams.home ?? undefined, away: teams.away ?? undefined, title: teams.title ?? undefined } } });
                    reset();
                  })
                  .catch(() => undefined)
                  .finally(() => setLoading(false));
              }}
            />
            {loading ? <p className={styles.muted}>Trayendo equipos…</p> : null}
          </div>
          <p className={styles.muted}>O cargalo a mano:</p>
          <div className={styles.gameTeams}>
            {([['Local', home, setHome], ['Visitante', away, setAway]] as const).map(([label, team, setTeam]) => (
              <div key={label} className={styles.field}>
                <span>{label}</span>
                <ClubPicker label={`Buscar club ${label.toLowerCase()}`} onPick={(club) => setTeam({ name: club.name, short: club.short, color: club.color, logo: club.logo })} />
                <input value={team.name} maxLength={40} placeholder="Nombre" onChange={(e) => setTeam({ ...team, name: e.target.value })} aria-label={`Nombre del ${label.toLowerCase()}`} />
                <div className={styles.gameTeamRow}>
                  <input value={team.short} maxLength={16} placeholder="Sigla" onChange={(e) => setTeam({ ...team, short: e.target.value })} aria-label={`Sigla del ${label.toLowerCase()}`} />
                  <input type="color" value={team.color ?? (label === 'Local' ? '#00a365' : '#f2f2f2')} onChange={(e) => setTeam({ ...team, color: e.target.value })} aria-label={`Color del ${label.toLowerCase()}`} />
                </div>
              </div>
            ))}
          </div>
          <label className={styles.field}>
            <span>Título (torneo, opcional)</span>
            <input value={title} maxLength={60} placeholder={state.title || 'Igual que el de ahora'} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className={styles.gameActions}>
            <button type="button" className={styles.primaryBtn} disabled={Boolean(missing)} title={missing ?? undefined} onClick={add}>Agregar a la fila</button>
            <button type="button" onClick={reset}>Cancelar</button>
          </div>
          {missing ? <p className={styles.muted}>{missing}</p> : null}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} disabled={full} title={full ? `Entran hasta ${MAX_GAMES} partidos` : undefined}>
          + Agregar otro marcador
        </button>
      )}
      {full && !adding ? <p className={styles.muted}>Llegaste a {MAX_GAMES} partidos. Sacá uno que ya terminó para sumar otro.</p> : null}
    </section>
  );
}

/* ─── resultado de la patada ─── */

const KICKS: Array<{ type: string; made: string; missed: string; points: number }> = [
  { type: 'conversion', made: 'Conversión acertada', missed: 'Conversión fallida', points: 2 },
  { type: 'penalty_goal', made: 'Penal convertido', missed: 'Penal fallido', points: 3 },
];

/**
 * Con el shot clock corriendo: cómo terminó la patada. La acertada suma los
 * puntos (y el servidor corta el shot clock al cargarla); la fallida solo lo
 * corta. Si el shot clock no tiene equipo, se elige de quién fue.
 */
function KickResult({ state, team, send }: { state: ManualScoreState; team: 'home' | 'away' | null; send: (payload: Payload) => Promise<void> }) {
  const sides = team ? [team] : (['home', 'away'] as const);
  return (
    <div className={styles.kick}>
      <span className={styles.kickTitle}>Resultado de la patada</span>
      {sides.map((side) => (
        <div key={side} className={styles.kickRow}>
          {!team ? <b className={styles.kickTeam}>{state[side].short}</b> : null}
          {KICKS.map((kick) => (
            <span key={kick.type} className={styles.kickPair}>
              <button type="button" className={styles.kickMade} onClick={() => void send({ score: { event: { team: side, type: kick.type, player: null } } })}>
                {kick.made} <b>+{kick.points}</b>
              </button>
              <button type="button" className={styles.kickMissed} onClick={() => void send({ shot: 'stop' })}>
                {kick.missed}
              </button>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
