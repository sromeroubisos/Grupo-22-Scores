'use client';

/* eslint-disable @next/next/no-img-element -- el wordmark es un PNG local chico. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FONT_FAMILIES, ROLE_DEFAULTS, fontFamilyDef, roleFontParam, type FontRole, type RoleFont } from './_lib/fonts';
import styles from './builder.module.css';

/**
 * Generador de overlays: elegís la versión, pegás el link del partido, torneo,
 * jugador o noticia, ajustás cómo aparece y la tipografía, y te llevás la URL
 * para OBS / vMix con la vista previa en vivo al lado. Los overlays manuales
 * (marcador y titular que manejás vos) se crean acá y se manejan desde su panel.
 */

type Kind =
  | 'partido' | 'marcador' | 'barra' | 'franja' | 'compacto' | 'bloques' | 'escudos' | 'tira' | 'formacion'
  | 'partidos' | 'fecha' | 'dia' | 'home'
  | 'tabla' | 'goleadores' | 'playoff' | 'jugador' | 'noticia'
  | 'manual-marcador' | 'manual-titular';

const KIND_GROUPS: Array<{ label: string; kinds: Array<{ id: Kind; label: string; hint: string }> }> = [
  {
    label: 'Un partido',
    kinds: [
      { id: 'partido', label: 'Tarjeta del partido', hint: 'Escudos, resultado, anotadores y placas de try.' },
      { id: 'marcador', label: 'Marcador de esquina', hint: 'Chico, con el reloj, todo el partido.' },
      { id: 'barra', label: 'Zócalo del partido', hint: 'Barra ancha abajo con nombres completos.' },
      { id: 'franja', label: 'Franja de colores', hint: 'Bloques del color de cada club, reloj al medio.' },
      { id: 'compacto', label: 'Marcador compacto', hint: 'Una píldora chica: siglas, resultado y minuto.' },
      { id: 'bloques', label: 'Bloques grandes', hint: 'Dos cuadrados con el resultado y el reloj abajo.' },
      { id: 'escudos', label: 'Escudos grandes', hint: 'Los escudos a los costados y el resultado al medio.' },
      { id: 'tira', label: 'Tira fina', hint: 'Una línea mínima: siglas, resultado y tiempo.' },
      { id: 'formacion', label: 'Formaciones', hint: 'Los dos planteles, o uno en la cancha.' },
    ],
  },
  {
    label: 'Varios partidos',
    kinds: [
      { id: 'partidos', label: 'Partidos elegidos', hint: 'Los que pegues, en ese orden.' },
      { id: 'fecha', label: 'Fecha de un torneo', hint: 'Todos los partidos de una fecha.' },
      { id: 'dia', label: 'Día (torneos G22)', hint: 'Los partidos cargados en G22 un día.' },
      { id: 'home', label: 'Home: todos los deportes', hint: 'Lo mismo que la home, con externos.' },
    ],
  },
  {
    label: 'Torneo y jugadores',
    kinds: [
      { id: 'tabla', label: 'Tabla de posiciones', hint: 'Por fase y por zona.' },
      { id: 'goleadores', label: 'Goleadores / tryman', hint: 'Puntos, tries, goles, tarjetas.' },
      { id: 'playoff', label: 'Playoff', hint: 'El cuadro como llave o en columnas.' },
      { id: 'jugador', label: 'Jugador', hint: 'Ficha con estadísticas.' },
    ],
  },
  {
    label: 'Noticias y manuales',
    kinds: [
      { id: 'noticia', label: 'Noticia de G22', hint: 'Una nota publicada, con foto.' },
      { id: 'manual-marcador', label: 'Marcador manual', hint: 'Lo manejás vos: puntos y reloj.' },
      { id: 'manual-titular', label: 'Titular manual', hint: 'Escribís el texto y lo mandás al aire.' },
    ],
  },
];

const KIND_LABEL = new Map(KIND_GROUPS.flatMap((group) => group.kinds).map((kind) => [kind.id, kind.label]));

const POSITIONS = [
  ['arriba-izq', 'Arriba izquierda'], ['arriba', 'Arriba centro'], ['arriba-der', 'Arriba derecha'],
  ['izq', 'Centro izquierda'], ['centro', 'Centro'], ['der', 'Centro derecha'],
  ['abajo-izq', 'Abajo izquierda'], ['abajo', 'Abajo centro'], ['abajo-der', 'Abajo derecha'],
] as const;

/** Todo sale centrado: el productor lo escala y lo ubica en su programa. */
const DEFAULT_POSITION: Record<Kind, string> = {
  partido: 'centro', marcador: 'centro', barra: 'centro', franja: 'centro', compacto: 'centro', bloques: 'centro', escudos: 'centro', tira: 'centro', formacion: 'centro', partidos: 'centro', fecha: 'centro', dia: 'centro', home: 'centro',
  tabla: 'centro', goleadores: 'centro', playoff: 'centro', jugador: 'centro', noticia: 'centro',
  // El titular va abajo como un noticiero (el overlay lo ubica solo).
  'manual-marcador': 'centro', 'manual-titular': 'abajo',
};

const DEFAULT_ROWS: Partial<Record<Kind, number>> = { partidos: 6, fecha: 7, dia: 7, home: 7, tabla: 10, goleadores: 5 };

const SPORTS = [
  ['', 'Todos los deportes'], ['rugby', 'Rugby'], ['football', 'Fútbol'], ['field-hockey', 'Hockey'],
  ['basketball', 'Básquet'], ['volleyball', 'Vóley'], ['handball', 'Handball'], ['tennis', 'Tenis'],
  ['american-football', 'Fútbol americano'], ['futsal', 'Futsal'],
] as const;

const LEADER_STATS = [
  ['', 'Según el deporte'], ['puntos', 'Puntos (máximos anotadores)'], ['tries', 'Tries (tryman)'], ['goles', 'Goles'],
  ['conversiones', 'Conversiones'], ['penales', 'Penales'], ['tarjetas', 'Tarjetas'],
] as const;

const ROLES: Array<{ id: FontRole; label: string; param: string }> = [
  { id: 'score', label: 'Resultado (partido solo)', param: 'resultado' },
  { id: 'num', label: 'Números y estadísticas', param: 'numeros' },
  { id: 'head', label: 'Títulos', param: 'titulos' },
  { id: 'text', label: 'Texto (nombres, rótulos)', param: 'texto' },
];

const SCOREBOARD_KINDS: Kind[] = ['marcador', 'barra', 'franja', 'compacto', 'bloques', 'escudos', 'tira'];
const isMatchKind = (kind: Kind) => kind === 'partido' || kind === 'formacion' || SCOREBOARD_KINDS.includes(kind);
/** Las versiones que dibujan un marcador (con reloj y tarjetas). */
const hasScoreboard = (kind: Kind) => kind === 'partido' || kind === 'manual-marcador' || SCOREBOARD_KINDS.includes(kind);
const isManual = (kind: Kind) => kind === 'manual-marcador' || kind === 'manual-titular';
const needsTournament = (kind: Kind) => kind === 'fecha' || kind === 'playoff' || kind === 'tabla' || kind === 'goleadores';

/** Del link pegado (o el ID suelto) se queda con el último tramo del camino. */
function idFrom(raw: string): string {
  return raw.trim().replace(/\/+$/, '').split('/').pop()?.split(/[?#]/)[0] ?? '';
}

function idsFrom(raw: string): string[] {
  return raw.split(/[\s,]+/).map(idFrom).filter(Boolean);
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

type Options = {
  rounds: Array<{ id: string; name: string; phase: string | null }>;
  playoffPhases: Array<{ id: string; name: string }>;
  phases: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; phaseId: string; phase: string | null }>;
};

type ManualCreated = { id: string; key: string; kind: 'marcador' | 'titular' };

export default function OverlayBuilder() {
  const [kind, setKind] = useState<Kind>('partido');
  const [matchLink, setMatchLink] = useState('');
  const [matchLinks, setMatchLinks] = useState('');
  const [tournamentLink, setTournamentLink] = useState('');
  const [round, setRound] = useState('');
  const [phase, setPhase] = useState('');
  const [group, setGroup] = useState('');
  const [stat, setStat] = useState('');
  const [limit, setLimit] = useState(10);
  const [day, setDay] = useState('');
  const [dayTournaments, setDayTournaments] = useState('');
  const [sport, setSport] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [playerLink, setPlayerLink] = useState('');
  const [newsLink, setNewsLink] = useState('');
  const [bracketView, setBracketView] = useState<'llave' | 'columnas'>('llave');
  const [manualStyle, setManualStyle] = useState<'marcador' | 'barra' | 'tarjeta' | 'franja' | 'compacto' | 'bloques' | 'escudos' | 'tira'>('marcador');
  const [clockMode, setClockMode] = useState<'normal' | 'minutos' | 'oculto'>('normal');
  const [showCards, setShowCards] = useState(true);
  const [side, setSide] = useState<'ambos' | 'local' | 'visita'>('ambos');
  const [formView, setFormView] = useState<'auto' | 'cancha' | 'lista'>('auto');
  const [manual, setManual] = useState<ManualCreated | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [position, setPosition] = useState(DEFAULT_POSITION.partido);
  const [scale, setScale] = useState(1);
  const [cycle, setCycle] = useState(false);
  const [showFor, setShowFor] = useState(15);
  const [hideFor, setHideFor] = useState(45);
  const [rows, setRows] = useState(6);
  const [rotate, setRotate] = useState(10);
  const [background, setBackground] = useState('');
  const [title, setTitle] = useState('');
  const [plates, setPlates] = useState(true);
  const [fonts, setFonts] = useState<Record<FontRole, RoleFont>>({ ...ROLE_DEFAULTS });
  const [customKind, setCustomKind] = useState<'google' | 'url' | 'local'>('google');
  const [customValue, setCustomValue] = useState('');
  const [customScale, setCustomScale] = useState(1);
  const [origin, setOrigin] = useState('https://www.g22scores.com');
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Origen y "hoy" se leen en el navegador: en el render del servidor darían otro valor.
  useEffect(() => {
    setOrigin(window.location.origin);
    setDay(todayKey());
  }, []);

  const chooseKind = (next: Kind) => {
    setKind(next);
    setPosition(DEFAULT_POSITION[next]);
    setRows(DEFAULT_ROWS[next] ?? 6);
    setManual(null);
    setManualError(null);
  };

  const tournamentId = idFrom(tournamentLink);
  const validTournament = /^[0-9a-f-]{36}$/i.test(tournamentId);
  const needsOptions = needsTournament(kind) && validTournament;

  useEffect(() => {
    if (!needsOptions) return undefined;
    const controller = new AbortController();
    fetch(`/api/overlay?tipo=opciones&torneo=${tournamentId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'No se pudo leer el torneo.');
        setOptions(body as Options);
        setOptionsError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOptions(null);
        setOptionsError(error instanceof Error ? error.message : 'No se pudo leer el torneo.');
      });
    return () => controller.abort();
  }, [needsOptions, tournamentId]);

  /** Qué falta para tener una URL utilizable. null = nada. */
  const missing = useMemo(() => {
    if (isMatchKind(kind) && !idFrom(matchLink)) return 'Pegá el link del partido para habilitar la URL.';
    if (kind === 'partidos' && !idsFrom(matchLinks).length) return 'Pegá al menos un link de partido para habilitar la URL.';
    if (needsTournament(kind) && !tournamentId) return 'Pegá el link del torneo para habilitar la URL.';
    if (kind === 'jugador' && !idFrom(playerLink)) return 'Pegá el link de la ficha del jugador para habilitar la URL.';
    if (kind === 'noticia' && !idFrom(newsLink)) return 'Pegá el link de la noticia para habilitar la URL.';
    if (isManual(kind) && !manual) return 'Creá el overlay manual para habilitar la URL.';
    return null;
  }, [kind, matchLink, matchLinks, tournamentId, playerLink, newsLink, manual]);

  // Ruta relativa: la vista previa la usa tal cual (mismo sitio); la URL para
  // copiar le suma el origen.
  const relative = useMemo(() => {
    const params = new URLSearchParams();
    let path = '';
    switch (kind) {
      case 'partido':
      case 'marcador':
      case 'barra':
      case 'franja':
      case 'compacto':
      case 'bloques':
      case 'escudos':
      case 'tira':
        path = `/overlay/partido/${idFrom(matchLink) || 'demo'}`;
        if (kind !== 'partido') params.set('estilo', kind);
        if (!plates) params.set('placas', '0');
        break;
      case 'formacion':
        path = `/overlay/formacion/${idFrom(matchLink) || 'demo'}`;
        if (side !== 'ambos') params.set('lado', side);
        if (formView !== 'auto') params.set('vista', formView);
        break;
      case 'partidos':
        path = '/overlay/partidos';
        params.set('ids', idsFrom(matchLinks).join(','));
        break;
      case 'fecha':
        path = '/overlay/fecha';
        params.set('torneo', tournamentId);
        if (round && options) params.set('ronda', round);
        break;
      case 'dia':
        path = '/overlay/dia';
        if (day && day !== todayKey()) params.set('fecha', day);
        if (idsFrom(dayTournaments).length) params.set('torneos', idsFrom(dayTournaments).join(','));
        break;
      case 'home':
        path = '/overlay/home';
        if (day && day !== todayKey()) params.set('fecha', day);
        if (sport) params.set('deporte', sport);
        if (idsFrom(dayTournaments).length) params.set('torneos', idsFrom(dayTournaments).join(','));
        if (liveOnly) params.set('vivo', '1');
        break;
      case 'tabla':
        path = '/overlay/tabla';
        params.set('torneo', tournamentId);
        if (phase && options) params.set('fase', phase);
        if (group && options) params.set('grupo', group);
        break;
      case 'goleadores':
        path = '/overlay/goleadores';
        params.set('torneo', tournamentId);
        if (stat) params.set('stat', stat);
        if (limit !== 10) params.set('cantidad', String(limit));
        break;
      case 'playoff':
        path = '/overlay/playoff';
        params.set('torneo', tournamentId);
        if (phase && options) params.set('fase', phase);
        if (bracketView !== 'llave') params.set('vista', bracketView);
        break;
      case 'jugador':
        path = '/overlay/jugador';
        params.set('id', idFrom(playerLink));
        if (tournamentId) params.set('torneo', tournamentId);
        break;
      case 'noticia':
        path = '/overlay/noticia';
        params.set('id', idFrom(newsLink));
        break;
      case 'manual-marcador':
      case 'manual-titular':
        path = `/overlay/manual/${manual?.id ?? 'demo'}`;
        if (kind === 'manual-marcador' && manualStyle !== 'marcador') params.set('estilo', manualStyle);
        break;
    }
    if (position !== DEFAULT_POSITION[kind]) params.set('pos', position);
    if (scale !== 1) params.set('escala', String(scale));
    if (cycle && !isManual(kind)) {
      params.set('mostrar', String(showFor));
      params.set('ocultar', String(hideFor));
    }
    if (DEFAULT_ROWS[kind] !== undefined) {
      if (rows !== DEFAULT_ROWS[kind]) params.set('filas', String(rows));
      if (rotate !== 10) params.set('rotar', String(rotate));
    }
    if (background) params.set('fondo', background);
    if (hasScoreboard(kind)) {
      if (clockMode !== 'normal') params.set('reloj', clockMode);
      if (!showCards) params.set('tarjetas', '0');
    }
    if (title.trim() && !isManual(kind) && kind !== 'marcador' && kind !== 'barra') params.set('titulo', title.trim());
    for (const role of ROLES) {
      const font = fonts[role.id];
      const fallback = ROLE_DEFAULTS[role.id];
      if (font.family !== fallback.family || font.weight !== fallback.weight) params.set(role.param, roleFontParam(font));
    }
    const usesCustom = Object.values(fonts).some((font) => font.family === 'propia');
    if (usesCustom && customValue.trim()) {
      params.set('fuente', `${customKind}:${customValue.trim()}`);
      if (customScale !== 1) params.set('fuente_escala', String(customScale));
    }
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }, [kind, matchLink, matchLinks, tournamentId, round, phase, group, stat, limit, day, dayTournaments, sport, liveOnly,
    playerLink, newsLink, bracketView, manual, manualStyle, position, scale, cycle, showFor, hideFor, rows, rotate,
    background, title, plates, clockMode, showCards, side, formView, fonts, customKind, customValue, customScale, options]);

  const url = `${origin}${relative}`;
  // Sin datos completos la vista previa muestra la versión de prueba, para ver cómo queda igual.
  const previewUrl = (() => {
    const demo = (path: string) => `${path}${path.includes('?') ? '&' : '?'}prueba=1`;
    if (!missing) return relative;
    // Manual todavía sin crear: un ejemplo con las mismas piezas (marcador de
    // muestra, o un titular de muestra).
    if (kind === 'manual-marcador') {
      const query = relative.split('?')[1] ?? '';
      const params = new URLSearchParams(query);
      params.set('estilo', manualStyle);
      return demo(`/overlay/partido/demo?${params}`);
    }
    if (kind === 'manual-titular') return demo(relative);
    return demo(relative);
  })();
  const panelUrl = manual ? `${origin}/overlay/control/${manual.id}#clave=${manual.key}` : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso de portapapeles: la URL queda seleccionable en el campo.
    }
  };

  const createManual = async () => {
    setCreating(true);
    setManualError(null);
    try {
      const response = await fetch('/api/overlay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind === 'manual-titular' ? 'titular' : 'marcador' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(body?.error ?? 'No se pudo crear el overlay.');
      setManual(body as ManualCreated);
    } catch (error: unknown) {
      setManualError(error instanceof Error ? error.message : 'No se pudo crear el overlay.');
    } finally {
      setCreating(false);
    }
  };

  const setRoleFont = (role: FontRole, patch: Partial<RoleFont>) => {
    setFonts((current) => {
      const next = { ...current[role], ...patch };
      const family = fontFamilyDef(next.family);
      // Al cambiar de familia, el peso salta al más cercano que esa familia tenga.
      if (family && !family.weights.includes(next.weight)) {
        next.weight = family.weights.reduce((best, w) => (Math.abs(w - next.weight) < Math.abs(best - next.weight) ? w : best), family.weights[0]);
      }
      return { ...current, [role]: next };
    });
  };

  const usesCustom = Object.values(fonts).some((font) => font.family === 'propia');
  const showsList = DEFAULT_ROWS[kind] !== undefined;
  const filteredGroups = options?.groups.filter((item) => !phase || item.phaseId === phase) ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <img src="/header-logo.png" alt="G22 Scores" className={styles.logo} />
        <div>
          <h1 className={styles.h1}>Overlays para transmisión</h1>
          <p className={styles.lead}>
            Una URL que se pega en OBS, vMix o Streamlabs como fuente de navegador y se actualiza sola con lo que pasa en G22.
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Configuración">
          <fieldset className={styles.group}>
            <legend>Versión</legend>
            {KIND_GROUPS.map((group) => (
              <div key={group.label} className={styles.kindGroup}>
                <span className={styles.kindGroupLabel}>{group.label}</span>
                <div className={styles.kinds} role="radiogroup" aria-label={group.label}>
                  {group.kinds.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={kind === item.id}
                      className={styles.kind}
                      onClick={() => chooseKind(item.id)}
                    >
                      <b>{item.label}</b>
                      <span>{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Qué mostrar · {KIND_LABEL.get(kind)}</legend>
            {isMatchKind(kind) && (
              <label className={styles.field}>
                <span>Link del partido</span>
                <input value={matchLink} onChange={(e) => setMatchLink(e.target.value)} placeholder="https://www.g22scores.com/matches/…" />
              </label>
            )}
            {kind === 'formacion' && (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Equipo</span>
                  <select value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
                    <option value="ambos">Los dos (en lista)</option>
                    <option value="local">Solo el local</option>
                    <option value="visita">Solo el visitante</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Cómo se dibuja</span>
                  <select value={formView} onChange={(e) => setFormView(e.target.value as typeof formView)} disabled={side === 'ambos'}>
                    <option value="auto">Automático (rugby: en la cancha)</option>
                    <option value="cancha">En la cancha</option>
                    <option value="lista">En lista</option>
                  </select>
                </label>
              </div>
            )}
            {kind === 'partidos' && (
              <label className={styles.field}>
                <span>Links de los partidos (uno por línea)</span>
                <textarea rows={4} value={matchLinks} onChange={(e) => setMatchLinks(e.target.value)} placeholder={'https://www.g22scores.com/matches/…\nhttps://www.g22scores.com/matches/…'} />
              </label>
            )}
            {(needsTournament(kind) || kind === 'jugador') && (
              <label className={styles.field}>
                <span>{kind === 'jugador' ? 'Link del torneo (opcional: solo sus números en ese torneo)' : 'Link del torneo'}</span>
                <input value={tournamentLink} onChange={(e) => setTournamentLink(e.target.value)} placeholder="https://www.g22scores.com/tournaments/…" />
              </label>
            )}
            {needsTournament(kind) && tournamentId && !validTournament ? (
              <p className={styles.error}>El link tiene que terminar en el ID del torneo (un código largo con guiones).</p>
            ) : null}
            {optionsError && needsOptions ? <p className={styles.error}>{optionsError}</p> : null}
            {kind === 'fecha' && (
              <label className={styles.field}>
                <span>Fecha</span>
                <select value={round} onChange={(e) => setRound(e.target.value)} disabled={!options || !needsOptions}>
                  <option value="">La más cercana a hoy (cambia sola)</option>
                  {needsOptions && options?.rounds.map((item) => (
                    <option key={item.id} value={item.id}>{item.phase ? `${item.phase} · ` : ''}{item.name}</option>
                  ))}
                </select>
              </label>
            )}
            {kind === 'tabla' && (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Fase</span>
                  <select value={phase} onChange={(e) => { setPhase(e.target.value); setGroup(''); }} disabled={!options || !needsOptions}>
                    <option value="">La actual</option>
                    {needsOptions && options?.phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Zona</span>
                  <select value={group} onChange={(e) => setGroup(e.target.value)} disabled={!options || !needsOptions || !filteredGroups.length}>
                    <option value="">Todas</option>
                    {needsOptions && filteredGroups.map((item) => <option key={item.id} value={item.id}>{item.phase && !phase ? `${item.phase} · ` : ''}{item.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            {kind === 'goleadores' && (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Qué contar</span>
                  <select value={stat} onChange={(e) => setStat(e.target.value)}>
                    {LEADER_STATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Cuántos</span>
                  <input type="number" min={3} max={20} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 10)} />
                </label>
              </div>
            )}
            {kind === 'playoff' && (
              <>
                <label className={styles.field}>
                  <span>Fase</span>
                  <select value={phase} onChange={(e) => setPhase(e.target.value)} disabled={!options || !needsOptions}>
                    <option value="">El último cuadro armado</option>
                    {needsOptions && options?.playoffPhases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <div className={styles.segment} role="radiogroup" aria-label="Cómo se dibuja el cuadro">
                  {(['llave', 'columnas'] as const).map((view) => (
                    <button key={view} type="button" role="radio" aria-checked={bracketView === view} onClick={() => setBracketView(view)}>
                      {view === 'llave' ? 'Como llave' : 'En columnas'}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>La llave con líneas se dibuja cuando cada ronda tiene la mitad de partidos que la anterior; si no (copas de clasificación), va en columnas.</p>
              </>
            )}
            {(kind === 'dia' || kind === 'home') && (
              <>
                <div className={styles.pair}>
                  <label className={styles.field}>
                    <span>Día</span>
                    <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                  </label>
                  {kind === 'home' ? (
                    <label className={styles.field}>
                      <span>Deporte</span>
                      <select value={sport} onChange={(e) => setSport(e.target.value)}>
                        {SPORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
                <label className={styles.field}>
                  <span>Torneos (opcional, uno por línea; vacío = todos)</span>
                  <textarea rows={3} value={dayTournaments} onChange={(e) => setDayTournaments(e.target.value)} placeholder="https://www.g22scores.com/tournaments/…" />
                </label>
                {kind === 'home' ? (
                  <label className={styles.check}>
                    <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} />
                    <span>Solo los que se están jugando</span>
                  </label>
                ) : null}
              </>
            )}
            {kind === 'jugador' && (
              <label className={styles.field}>
                <span>Link de la ficha del jugador</span>
                <input value={playerLink} onChange={(e) => setPlayerLink(e.target.value)} placeholder="https://www.g22scores.com/players/…" />
              </label>
            )}
            {kind === 'noticia' && (
              <label className={styles.field}>
                <span>Link de la noticia</span>
                <input value={newsLink} onChange={(e) => setNewsLink(e.target.value)} placeholder="https://www.g22scores.com/noticias/…" />
              </label>
            )}
            {isManual(kind) && (
              <div className={styles.manual}>
                {kind === 'manual-marcador' ? (
                  <label className={styles.field}>
                    <span>Cómo se ve</span>
                    <select value={manualStyle} onChange={(e) => setManualStyle(e.target.value as typeof manualStyle)}>
                      <option value="marcador">Marcador de esquina (con reloj)</option>
                      <option value="barra">Zócalo</option>
                      <option value="tarjeta">Tarjeta G22</option>
                      <option value="franja">Franja de colores</option>
                      <option value="compacto">Marcador compacto</option>
                      <option value="bloques">Bloques grandes</option>
                      <option value="escudos">Escudos grandes</option>
                      <option value="tira">Tira fina</option>
                    </select>
                  </label>
                ) : null}
                {manual ? (
                  <>
                    <p className={styles.hint}>Listo. Abrí el panel para manejarlo (ahí cambiás nombres, puntos, reloj o el texto, y lo mostrás u ocultás).</p>
                    <a className={styles.button} href={panelUrl} target="_blank" rel="noreferrer">Abrir el panel de control</a>
                    <button type="button" onClick={() => void copy(panelUrl)}>Copiar link del panel (con clave)</button>
                    <p className={styles.hint}>El link del panel lleva la clave: quien lo tenga puede manejar el overlay. Guardalo.</p>
                  </>
                ) : (
                  <>
                    <p className={styles.hint}>
                      {kind === 'manual-marcador'
                        ? 'Un marcador que no depende de cargar el partido en G22: nombres, colores, puntos y reloj los manejás vos desde un panel (sirve en el celular).'
                        : 'Un zócalo o tarjeta con el texto que escribas, que mandás al aire y sacás con un toque.'}
                    </p>
                    <button type="button" className={styles.primaryButton} onClick={() => void createManual()} disabled={creating}>
                      {creating ? 'Creando…' : kind === 'manual-marcador' ? 'Crear marcador manual' : 'Crear titular manual'}
                    </button>
                    {manualError ? <p className={styles.error}>{manualError}</p> : null}
                    <p className={styles.hint}>Hace falta estar logueado en G22.</p>
                  </>
                )}
              </div>
            )}
            {!isManual(kind) && kind !== 'marcador' && kind !== 'barra' ? (
              <label className={styles.field}>
                <span>Título (opcional)</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Por defecto, el nombre del torneo" maxLength={80} />
              </label>
            ) : null}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Tipografías</legend>
            {ROLES.map((role) => {
              const font = fonts[role.id];
              const family = fontFamilyDef(font.family);
              return (
                <div key={role.id} className={styles.fontRow}>
                  <span className={styles.fontLabel}>{role.label}</span>
                  <select value={font.family} onChange={(e) => setRoleFont(role.id, { family: e.target.value })} aria-label={`Familia: ${role.label}`}>
                    {FONT_FAMILIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <select value={font.weight} onChange={(e) => setRoleFont(role.id, { weight: Number(e.target.value) })} aria-label={`Peso: ${role.label}`}>
                    {(family?.weights ?? [400]).map((weight) => <option key={weight} value={weight}>{weightLabel(weight)}</option>)}
                  </select>
                </div>
              );
            })}
            {usesCustom ? (
              <div className={styles.custom}>
                <span className={styles.fontLabel}>Fuente propia</span>
                <div className={styles.segment} role="radiogroup" aria-label="De dónde sale la fuente propia">
                  {([['google', 'Google Fonts'], ['url', 'Link a un archivo'], ['local', 'Instalada en la PC']] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={customKind === id} onClick={() => setCustomKind(id)}>{label}</button>
                  ))}
                </div>
                <input
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder={customKind === 'google' ? 'Oswald' : customKind === 'url' ? 'https://…/mi-fuente.woff2' : 'Nombre exacto, como aparece en tu PC'}
                  aria-label="Fuente propia"
                />
                <p className={styles.hint}>
                  {customKind === 'google' && 'El nombre tal cual figura en fonts.google.com.'}
                  {customKind === 'url' && 'Un .woff2, .woff, .otf o .ttf publicado con CORS abierto (si el servidor lo bloquea, no carga).'}
                  {customKind === 'local' && 'Tiene que estar instalada en la PC donde corre OBS o vMix; en la vista previa se ve solo si también está en esta compu.'}
                </p>
                <label className={styles.field}>
                  <span>Ajuste de tamaño: {Math.round(customScale * 100)}%</span>
                  <input type="range" min={0.5} max={1.5} step={0.05} value={customScale} onChange={(e) => setCustomScale(Number(e.target.value))} />
                </label>
              </div>
            ) : (
              <p className={styles.hint}>Elegí «Fuente propia» en cualquier rol para usar una de Google Fonts, un archivo o una instalada en tu PC.</p>
            )}
            <button type="button" onClick={() => setFonts({ ...ROLE_DEFAULTS })}>Volver a las de G22</button>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Cómo aparece</legend>
            <label className={styles.field}>
              <span>Posición en pantalla</span>
              <select value={position} onChange={(e) => setPosition(e.target.value)}>
                {POSITIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Tamaño: {Math.round(scale * 100)}%</span>
              <input type="range" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </label>
            {!isManual(kind) ? (
              <label className={styles.check}>
                <input type="checkbox" checked={cycle} onChange={(e) => setCycle(e.target.checked)} />
                <span>Que aparezca y desaparezca sola</span>
              </label>
            ) : null}
            {cycle && !isManual(kind) ? (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Segundos en pantalla</span>
                  <input type="number" min={3} max={3600} value={showFor} onChange={(e) => setShowFor(Number(e.target.value) || 15)} />
                </label>
                <label className={styles.field}>
                  <span>Segundos oculta</span>
                  <input type="number" min={1} max={3600} value={hideFor} onChange={(e) => setHideFor(Number(e.target.value) || 45)} />
                </label>
              </div>
            ) : null}
            {showsList ? (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Filas por página</span>
                  <input type="number" min={1} max={12} value={rows} onChange={(e) => setRows(Number(e.target.value) || 6)} />
                </label>
                <label className={styles.field}>
                  <span>Segundos por página</span>
                  <input type="number" min={3} max={120} value={rotate} onChange={(e) => setRotate(Number(e.target.value) || 10)} />
                </label>
              </div>
            ) : null}
            {isMatchKind(kind) && kind !== 'formacion' ? (
              <label className={styles.check}>
                <input type="checkbox" checked={plates} onChange={(e) => setPlates(e.target.checked)} />
                <span>Placas automáticas de try, penal y tarjetas</span>
              </label>
            ) : null}
            {hasScoreboard(kind) ? (
              <>
                <label className={styles.field}>
                  <span>Reloj</span>
                  <select value={clockMode} onChange={(e) => setClockMode(e.target.value as typeof clockMode)}>
                    <option value="normal">Minutos y segundos (34:12)</option>
                    <option value="minutos">Solo minutos (34′, 40+2′)</option>
                    <option value="oculto">Sin reloj</option>
                  </select>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={showCards} onChange={(e) => setShowCards(e.target.checked)} />
                  <span>Amarillas, rojas y sin-bin en el marcador</span>
                </label>
                <p className={styles.hint}>Cuando se cumple el tiempo del período, el reloj se pone en rojo.</p>
              </>
            ) : null}
            <label className={styles.field}>
              <span>Fondo</span>
              <select value={background} onChange={(e) => setBackground(e.target.value)}>
                <option value="">Transparente (OBS, vMix)</option>
                <option value="verde">Verde chroma</option>
                <option value="azul">Azul chroma</option>
                <option value="negro">Negro (para luma key)</option>
              </select>
            </label>
          </fieldset>
        </section>

        <section className={styles.output} aria-label="Resultado">
          <Preview src={previewUrl} />
          {missing && !isManual(kind) ? <p className={styles.note}>Vista previa con datos de muestra.</p> : null}

          <div className={styles.urlRow}>
            <input className={styles.url} readOnly value={missing ? '' : url} placeholder="La URL aparece acá" onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay" />
            <button type="button" className={styles.copy} onClick={() => void copy(url)} disabled={Boolean(missing)}>
              {copied ? 'Copiada' : 'Copiar URL'}
            </button>
          </div>
          {missing ? <p className={styles.hint}>{missing}</p> : (
            <div className={styles.actions}>
              <a href={url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
              {!isManual(kind) ? <a href={`${url}${url.includes('?') ? '&' : '?'}prueba=1`} target="_blank" rel="noreferrer">Abrir en modo prueba</a> : null}
            </div>
          )}

          <div className={styles.howto}>
            <div>
              <h2>OBS / Streamlabs</h2>
              <ol>
                <li>Fuentes → <b>+</b> → <b>Navegador</b>.</li>
                <li>Pegá la URL. Ancho <b>1920</b>, alto <b>1080</b>.</li>
                <li>No toques el CSS personalizado: ya deja el fondo transparente.</li>
                <li>Tildá <b>Actualizar el navegador cuando la escena se activa</b> para que entre animada cada vez.</li>
                <li>Dejá <b>sin tildar</b> “Apagar la fuente cuando no está visible”: así sigue al día aunque no esté al aire.</li>
                <li>Usá OBS 31 o más nuevo (su navegador interno es Chromium 127).</li>
              </ol>
            </div>
            <div>
              <h2>vMix</h2>
              <ol>
                <li><b>Add Input</b> → <b>Web Browser</b>.</li>
                <li>Pegá la URL, resolución <b>1920×1080</b>. La transparencia sale sola: no hace falta chroma.</li>
                <li>Mandala a un <b>Overlay</b> (1 a 4) y prendela o apagala desde ahí. Dejá el input cargado desde antes de salir al aire.</li>
                <li>Si algo se ve trabado, clic derecho en el input → <b>Refresh</b>.</li>
                <li>Tené vMix actualizado: las versiones viejas traen un navegador (Chromium 86) que dibuja mal las tipografías y animaciones.</li>
              </ol>
            </div>
            <div>
              <h2>Al aire</h2>
              <ol>
                <li>La PC de la transmisión necesita internet: el overlay se actualiza solo cada pocos segundos.</li>
                <li>Si se corta la conexión, queda lo último que mostró y reintenta solo. Nunca sale un cartel de error.</li>
                <li>Probalo antes con <b>modo prueba</b> en la misma PC y el mismo programa.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function weightLabel(weight: number) {
  const names: Record<number, string> = {
    100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
    600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Heavy',
  };
  return `${weight} · ${names[weight] ?? ''}`;
}

/** El lienzo de 1920×1080 que ve OBS, escalado al ancho del panel. */
function Preview({ src }: { src: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={styles.preview} ref={boxRef}>
      <iframe
        src={src}
        title="Vista previa del overlay"
        className={styles.frame}
        style={{ '--preview-scale': scale } as CSSProperties}
      />
    </div>
  );
}
