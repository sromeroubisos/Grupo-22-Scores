'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCORING,
  currentHeadline,
  manualElapsed,
  readManualState,
  type HeadlineItem,
  type ManualHeadlineState,
  type ManualKind,
  type ManualScoreState,
  type ManualSport,
  type ManualState,
} from '@/lib/overlay/manualOverlay';
import { ClubPicker, MatchPicker } from '../../_builder/Pickers';
import { sevensClockPatch, teamsFromMatch } from '../../_builder/matchTeams';
import styles from './control.module.css';

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
type Payload = { state?: unknown; clock?: unknown; score?: unknown };

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

export default function ControlPanel({ id }: { id: string }) {
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<ManualKind | null>(null);
  const [state, setState] = useState<ManualState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');
  const pendingText = useRef<number | null>(null);
  const lastLocalEdit = useRef(0);

  useEffect(() => {
    setKey(readKey(id));
    setOrigin(window.location.origin);
  }, [id]);

  const applyServer = useCallback((body: { kind: ManualKind; state: unknown; serverNow?: string }, requestedAt: number) => {
    setKind(body.kind);
    setState(readManualState(body.kind, body.state));
    const serverNow = Date.parse(body.serverNow ?? '');
    if (Number.isFinite(serverNow)) setOffset(serverNow - (requestedAt + Date.now()) / 2);
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
          const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}`, { cache: 'no-store' });
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
  }, [id, applyServer]);

  const send = useCallback(async (payload: Payload) => {
    if (!key) {
      setError('Falta la clave del panel: abrí el link completo que te dio el generador.');
      return;
    }
    setSaving(true);
    const requestedAt = Date.now();
    try {
      const response = await fetch(`/api/overlay/control/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-overlay-key': key },
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
  }, [id, key, applyServer]);

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

  const overlayUrl = `${origin}/overlay/manual/${id}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Panel de control · G22</p>
          <h1 className={styles.h1}>{kind === 'titular' ? 'Titulares' : 'Marcador manual'}</h1>
        </div>
        <span className={styles.saving}>{saving ? 'Guardando…' : error ? '' : 'Al día'}</span>
      </header>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <section className={styles.urlBox}>
        <span>URL para OBS / vMix (1920×1080)</span>
        <div className={styles.urlRow}>
          <input readOnly value={overlayUrl} onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay" />
          <button type="button" onClick={() => void navigator.clipboard?.writeText(overlayUrl)}>Copiar</button>
        </div>
        <small>Guardá este panel en favoritos: el link ya trae la clave. Quien lo tenga puede manejar el overlay.</small>
      </section>

      {!state ? <p className={styles.muted}>Cargando…</p> : kind === 'titular'
        ? <HeadlinePanel state={state as ManualHeadlineState} offset={offset} patchNow={patchNow} patchText={patchText} />
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
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  const elapsed = manualElapsed(state.clock, now + offset);
  const shown = state.clock.countdown ? Math.max(0, state.clock.limit - elapsed) : elapsed;
  const expired = state.clock.limit > 0 && (state.clock.countdown ? shown === 0 : elapsed >= state.clock.limit);

  const score = (team: 'home' | 'away', type: string) => {
    // El jugador elegido sale en la placa ("TRY · Juan Pérez"); después se limpia.
    void send({ score: { event: { team, type, player: scorer[team] || null } } });
    setScorer((current) => ({ ...current, [team]: '' }));
  };

  const fixTime = () => {
    const seconds = parseMmss(setTime);
    if (seconds === null) return;
    void send({ clock: { set: seconds } });
    setSetTime('');
  };

  const recent = [...state.events].reverse().slice(0, 8);

  return (
    <div className={styles.grid}>
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
                patchNow(patch);
              })
              .catch(() => undefined)
              .finally(() => setLoadingTeams(false));
          }}
        />
        {loadingTeams ? <p className={styles.muted}>Trayendo equipos y planteles…</p> : null}
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

      {(['home', 'away'] as const).map((side) => {
        const team = state[side];
        return (
          <section className={styles.card} key={side} style={{ borderTopColor: team.color ?? undefined }}>
            <h2>{side === 'home' ? 'Local' : 'Visitante'} · {team.short}</h2>
            <div className={styles.score}>{team.score}</div>
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
              <button type="button" onClick={() => patchNow({ [side]: { score: Math.max(0, team.score - 1) } })}>−1 punto</button>
              <button type="button" onClick={() => patchNow({ [side]: { score: team.score + 1 } })}>+1 punto</button>
            </div>
            <details className={styles.details}>
              <summary>Equipo: nombre, sigla, color, escudo y plantel</summary>
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
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Sigla</span>
                  <input value={team.short} maxLength={16} onChange={(e) => patchText({ [side]: { short: e.target.value } })} />
                </label>
                <label className={styles.field}>
                  <span>Color</span>
                  <input type="color" value={team.color ?? '#00a365'} onChange={(e) => patchNow({ [side]: { color: e.target.value } })} />
                </label>
              </div>
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
                <button type="button" aria-label="Borrar este evento (resta sus puntos)" onClick={() => void send({ score: { undo: event.id } })}>×</button>
              </li>
            ))}
          </ul>
        ) : <p className={styles.muted}>Lo que cargues aparece acá. Con la × lo borrás y se restan sus puntos.</p>}
        <button type="button" onClick={() => void send({ score: { undo: true } })} disabled={!state.events.length}>Deshacer el último</button>
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
