'use client';

/* eslint-disable @next/next/no-img-element -- el wordmark es un PNG local chico. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FONT_FAMILIES, ROLE_DEFAULTS, fontFamilyDef, roleFontParam, type FontRole, type RoleFont } from './_lib/fonts';
import {
  DEFAULT_ROWS, KIND_DEFS, KIND_GROUPS, SCOREBOARD_STYLES, UUID_RE,
  hasScoreboard, idFrom, isList, isManual, isMatchKind, isScoreboardStyle, needsTournament,
  type Kind,
} from './_builder/catalog';
import { Canvas } from './_builder/Canvas';
import { ClubPicker, Crest, MatchPicker, TournamentPicker, matchWhen, type OverlaySearchMatch } from './_builder/Pickers';
import { sevensClockPatch, teamFromClub, teamsFromMatch, type ManualSport, type TeamInfo } from './_builder/matchTeams';
import styles from './_builder/studio.module.css';

/**
 * Generador de overlays en dos pantallas:
 *
 *  1. Galería: todos los gráficos con su muestra en vivo. Se elige uno.
 *  2. Editor: los datos (buscando por nombre o pegando el link), qué se ve,
 *     colores y nombres, y —un nivel más adentro— tipografías, ubicación y
 *     fondo. A la derecha, la vista previa y la URL para OBS o vMix.
 *
 * El gráfico elegido va en `?grafico=` para que el botón Atrás del navegador
 * vuelva a la galería.
 */

type PickedMatch = { id: string; home: TeamInfo | null; away: TeamInfo | null; when: string | null; context: string | null };
type PickedTournament = { id: string; name: string; logo: string | null };
type Options = {
  rounds: Array<{ id: string; name: string; phase: string | null }>;
  playoffPhases: Array<{ id: string; name: string }>;
  phases: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; phaseId: string; phase: string | null }>;
};
type ManualCreated = { id: string; key: string; kind: 'marcador' | 'titular' };

const POSITIONS = [
  ['arriba-izq', 'Arriba izquierda'], ['arriba', 'Arriba centro'], ['arriba-der', 'Arriba derecha'],
  ['izq', 'Centro izquierda'], ['centro', 'Centro'], ['der', 'Centro derecha'],
  ['abajo-izq', 'Abajo izquierda'], ['abajo', 'Abajo centro'], ['abajo-der', 'Abajo derecha'],
] as const;

const SPORTS = [
  ['', 'Todos los deportes'], ['rugby', 'Rugby'], ['football', 'Fútbol'], ['field-hockey', 'Hockey'],
  ['basketball', 'Básquet'], ['volleyball', 'Vóley'], ['handball', 'Handball'], ['tennis', 'Tenis'],
  ['american-football', 'Fútbol americano'], ['futsal', 'Futsal'],
] as const;

const MANUAL_SPORTS: Array<[ManualSport, string]> = [['rugby', 'Rugby'], ['futbol', 'Fútbol'], ['hockey', 'Hockey'], ['basquet', 'Básquet'], ['otro', 'Otro']];

const LEADER_STATS = [
  ['', 'Según el deporte'], ['puntos', 'Puntos'], ['tries', 'Tries (tryman)'], ['goles', 'Goles'],
  ['conversiones', 'Conversiones'], ['penales', 'Penales'], ['tarjetas', 'Tarjetas'],
] as const;

const ROLES: Array<{ id: FontRole; label: string; param: string }> = [
  { id: 'score', label: 'Resultado', param: 'resultado' },
  { id: 'num', label: 'Números', param: 'numeros' },
  { id: 'head', label: 'Títulos', param: 'titulos' },
  { id: 'text', label: 'Texto', param: 'texto' },
];

const HEADLINE_STYLES = [['noticiero', 'Zócalo de noticiero'], ['persona', 'Nombre de quien habla'], ['tarjeta', 'Tarjeta G22']] as const;

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function fromSearch(match: OverlaySearchMatch): PickedMatch {
  return {
    id: match.id,
    home: { name: match.home.name, short: match.home.short, color: match.home.color, logo: match.home.logo },
    away: { name: match.away.name, short: match.away.short, color: match.away.color, logo: match.away.logo },
    when: matchWhen(match.dateTime),
    context: [match.tournament, match.context].filter(Boolean).join(' · ') || null,
  };
}

/** Un partido elegido por link: se piden sus equipos para mostrarlo con nombre. */
async function describeMatch(id: string): Promise<PickedMatch> {
  try {
    const response = await fetch(`/api/overlay?tipo=partidos&ids=${id}`);
    const body = await response.json();
    const match = Array.isArray(body?.matches) ? body.matches[0] : null;
    if (!match) return { id, home: null, away: null, when: null, context: null };
    return {
      id,
      home: teamFromClub(match.homeClub),
      away: teamFromClub(match.awayClub),
      when: matchWhen(typeof match.date_time === 'string' ? match.date_time : null),
      context: [match.tournament?.name, match.context_label].filter(Boolean).join(' · ') || null,
    };
  } catch {
    return { id, home: null, away: null, when: null, context: null };
  }
}

const hexParam = (color: string) => color.replace('#', '');

export default function OverlayBuilder() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [origin, setOrigin] = useState('https://www.g22scores.com');

  // El gráfico elegido vive en la URL: Atrás vuelve a la galería.
  useEffect(() => {
    setOrigin(window.location.origin);
    const read = () => {
      const value = new URLSearchParams(window.location.search).get('grafico') as Kind | null;
      setKind(value && KIND_DEFS.has(value) ? value : null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const open = useCallback((next: Kind) => {
    window.history.pushState(null, '', `/overlay?grafico=${next}`);
    setKind(next);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    window.history.pushState(null, '', '/overlay');
    setKind(null);
  }, []);

  /** Cambiar de estilo de marcador no agrega una entrada al historial. */
  const switchStyle = useCallback((next: Kind) => {
    window.history.replaceState(null, '', `/overlay?grafico=${next}`);
    setKind(next);
  }, []);

  return (
    <main className={styles.studio}>
      {kind ? (
        <Editor key={isScoreboardStyle(kind) ? 'scoreboard' : kind} kind={kind} origin={origin} onBack={back} onStyle={switchStyle} />
      ) : (
        <Gallery onOpen={open} />
      )}
    </main>
  );
}

/* ─────────────── Galería ─────────────── */

function Gallery({ onOpen }: { onOpen: (kind: Kind) => void }) {
  // Las tarjetas muestran una imagen fija; la muestra en vivo se monta sólo en
  // la que está bajo el mouse, de a una. Veinte iframes a la vez trababan el navegador.
  const [live, setLive] = useState<Kind | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const startLive = (id: Kind, pointerType: string) => {
    if (pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setLive(id), 350);
  };
  const stopLive = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setLive(null);
  };

  return (
    <>
      <header className={styles.hero}>
        <img src="/header-logo.png" alt="G22 Scores" className={styles.logo} />
        <div>
          <h1 className={styles.title}>Overlays para transmisión</h1>
          <p className={styles.lead}>Gráficos en vivo para OBS, vMix o Streamlabs que se actualizan solos con lo que pasa en G22.</p>
        </div>
      </header>

      <ol className={styles.steps} aria-label="Cómo se usa">
        <li><b>1</b><span><strong>Elegí un gráfico.</strong> Pasá el mouse por una tarjeta para verla en movimiento.</span></li>
        <li><b>2</b><span><strong>Personalizalo.</strong> El partido o torneo, qué se ve, colores y tipografías.</span></li>
        <li><b>3</b><span><strong>Copiá la URL</strong> y pegala como fuente de navegador en OBS o vMix.</span></li>
      </ol>

      {KIND_GROUPS.map((group) => (
        <section key={group.id} className={styles.shelf} aria-labelledby={`grupo-${group.id}`}>
          <div className={styles.shelfHead}>
            <h2 id={`grupo-${group.id}`}>{group.label}</h2>
            <p>{group.description}</p>
          </div>
          <div className={styles.cards}>
            {group.kinds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.card}
                onClick={() => onOpen(item.id)}
                onPointerEnter={(event) => startLive(item.id, event.pointerType)}
                onPointerLeave={stopLive}
              >
                <span className={styles.cardMedia}>
                  <img src={`/overlay-thumbs/${item.id}.webp`} alt="" width={960} height={540} loading="lazy" decoding="async" className={styles.cardImg} />
                  {live === item.id ? (
                    <Canvas src={`${item.thumb}${item.thumb.includes('?') ? '&' : '?'}prueba=1`} title={`Muestra en vivo: ${item.label}`} className={styles.cardLive} />
                  ) : null}
                </span>
                <span className={styles.cardBody}>
                  <b>{item.label}</b>
                  <span>{item.hint}</span>
                </span>
                <span className={styles.cardCta} aria-hidden="true">Personalizar →</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <HowTo />
    </>
  );
}

function HowTo() {
  return (
    <details className={styles.howto}>
      <summary>Cómo pegarlo en OBS o vMix</summary>
      <div className={styles.howtoGrid}>
        <div>
          <h3>OBS / Streamlabs</h3>
          <ol>
            <li>Fuentes → <b>+</b> → <b>Navegador</b>.</li>
            <li>Pegá la URL. Ancho <b>1920</b>, alto <b>1080</b>.</li>
            <li>No toques el CSS personalizado: ya deja el fondo transparente.</li>
            <li>Dejá <b>sin tildar</b> “Apagar la fuente cuando no está visible”.</li>
            <li>Usá OBS 31 o más nuevo.</li>
          </ol>
        </div>
        <div>
          <h3>vMix</h3>
          <ol>
            <li><b>Add Input</b> → <b>Web Browser</b>.</li>
            <li>Pegá la URL, <b>1920×1080</b>. La transparencia sale sola.</li>
            <li>Mandalo a un <b>Overlay</b> (1 a 4) y prendelo desde ahí.</li>
            <li>Si algo se traba: clic derecho → <b>Refresh</b>.</li>
            <li>Tené vMix actualizado.</li>
          </ol>
        </div>
        <div>
          <h3>Al aire</h3>
          <ol>
            <li>La PC necesita internet: se actualiza sola cada pocos segundos.</li>
            <li>Si se corta, queda lo último y reintenta. Nunca sale un cartel de error.</li>
            <li>Probalo antes con <b>modo prueba</b>, en la misma PC.</li>
          </ol>
        </div>
      </div>
    </details>
  );
}

/* ─────────────── Editor ─────────────── */

function Editor({ kind, origin, onBack, onStyle }: { kind: Kind; origin: string; onBack: () => void; onStyle: (kind: Kind) => void }) {
  const def = KIND_DEFS.get(kind)!;

  // Datos
  const [match, setMatch] = useState<PickedMatch | null>(null);
  const [matches, setMatches] = useState<PickedMatch[]>([]);
  const [tournament, setTournament] = useState<PickedTournament | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [round, setRound] = useState('');
  const [phase, setPhase] = useState('');
  const [group, setGroup] = useState('');
  const [stat, setStat] = useState('');
  const [limit, setLimit] = useState(10);
  const [day, setDay] = useState('');
  const [dayTournaments, setDayTournaments] = useState<PickedTournament[]>([]);
  const [sport, setSport] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [playerLink, setPlayerLink] = useState('');
  const [newsLink, setNewsLink] = useState('');
  const [bracketView, setBracketView] = useState<'llave' | 'columnas'>('llave');
  const [side, setSide] = useState<'ambos' | 'local' | 'visita'>('ambos');
  const [formView, setFormView] = useState<'auto' | 'cancha' | 'lista'>('auto');

  // Qué se ve
  const [clockMode, setClockMode] = useState<'normal' | 'minutos' | 'oculto'>('normal');
  const [showCards, setShowCards] = useState(true);
  const [plates, setPlates] = useState(true);
  const [subs, setSubs] = useState(false);
  const [header, setHeader] = useState(true);
  const [title, setTitle] = useState('');

  // Colores y nombres (vacío = el del club)
  const [homeColor, setHomeColor] = useState('');
  const [awayColor, setAwayColor] = useState('');
  const [homeName, setHomeName] = useState('');
  const [awayName, setAwayName] = useState('');

  // Manual
  const [homeTeam, setHomeTeam] = useState<TeamInfo>({ name: 'Local', short: 'LOC', color: '#00a365', logo: null });
  const [awayTeam, setAwayTeam] = useState<TeamInfo>({ name: 'Visitante', short: 'VIS', color: '#f2f2f2', logo: null });
  const [homePlayers, setHomePlayers] = useState<string[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<string[]>([]);
  const [manualSport, setManualSport] = useState<ManualSport>('rugby');
  const [manualStyle, setManualStyle] = useState<Kind>('marcador');
  const [manualTitle, setManualTitle] = useState('');
  const [manualClock, setManualClock] = useState<ReturnType<typeof sevensClockPatch>>(null);
  const [headline, setHeadline] = useState({ kicker: '', title: '', subtitle: '' });
  const [headlineStyle, setHeadlineStyle] = useState<(typeof HEADLINE_STYLES)[number][0]>('noticiero');
  const [manual, setManual] = useState<ManualCreated | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);

  // Ubicación y tipografía
  const [position, setPosition] = useState(kind === 'manual-titular' ? 'abajo' : 'centro');
  const [scale, setScale] = useState(1);
  const [cycle, setCycle] = useState(false);
  const [showFor, setShowFor] = useState(15);
  const [hideFor, setHideFor] = useState(45);
  const [rows, setRows] = useState(DEFAULT_ROWS[kind] ?? 6);
  const [rotate, setRotate] = useState(10);
  const [background, setBackground] = useState('');
  const [fonts, setFonts] = useState<Record<FontRole, RoleFont>>({ ...ROLE_DEFAULTS });
  const [customKind, setCustomKind] = useState<'google' | 'url' | 'local'>('google');
  const [customValue, setCustomValue] = useState('');
  const [customScale, setCustomScale] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { setDay(todayKey()); }, []);

  const tournamentId = tournament?.id ?? '';
  const validTournament = UUID_RE.test(tournamentId);
  const needsOptions = needsTournament(kind) && validTournament;

  useEffect(() => {
    if (!needsOptions) { setOptions(null); return undefined; }
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

  const pickMatch = async (id: string, found: OverlaySearchMatch | null) => {
    setMatch(found ? fromSearch(found) : { id, home: null, away: null, when: null, context: null });
    if (!found) setMatch(await describeMatch(id));
  };

  const addMatch = async (id: string, found: OverlaySearchMatch | null) => {
    if (matches.some((item) => item.id === id)) return;
    const picked = found ? fromSearch(found) : await describeMatch(id);
    setMatches((current) => (current.some((item) => item.id === id) ? current : [...current, picked]));
  };

  /** Marcador manual desde un partido de G22: equipos, colores, escudos, deporte y planteles. */
  const loadManualFromMatch = async (id: string, found: OverlaySearchMatch | null) => {
    setLoadingMatch(true);
    try {
      const teams = await teamsFromMatch(id, found);
      if (teams.home) {
        const { players, ...info } = teams.home;
        setHomeTeam(info);
        setHomePlayers(players);
      }
      if (teams.away) {
        const { players, ...info } = teams.away;
        setAwayTeam(info);
        setAwayPlayers(players);
      }
      setManualSport(teams.sport);
      setManualClock(sevensClockPatch(teams));
      if (teams.title) setManualTitle(teams.title);
    } catch {
      // Sin conexión: los equipos quedan como estaban y se pueden elegir a mano.
    } finally {
      setLoadingMatch(false);
    }
  };

  /** Qué falta para tener una URL utilizable. null = nada. */
  const missing = useMemo(() => {
    if (isMatchKind(kind) && !match) return 'Elegí el partido para tener la URL.';
    if (kind === 'partidos' && !matches.length) return 'Sumá al menos un partido para tener la URL.';
    if (needsTournament(kind) && !tournament) return 'Elegí el torneo para tener la URL.';
    if (kind === 'jugador' && !idFrom(playerLink)) return 'Pegá el link de la ficha del jugador para tener la URL.';
    if (kind === 'noticia' && !idFrom(newsLink)) return 'Pegá el link de la noticia para tener la URL.';
    if (isManual(kind) && !manual) return kind === 'manual-marcador' ? 'Creá el marcador para tener la URL.' : 'Creá el titular para tener la URL.';
    return null;
  }, [kind, match, matches, tournament, playerLink, newsLink, manual]);

  const relative = useMemo(() => {
    const params = new URLSearchParams();
    let path = '';
    if (isScoreboardStyle(kind)) {
      path = `/overlay/partido/${match?.id ?? 'demo'}`;
      if (kind !== 'partido') params.set('estilo', kind);
      if (!plates) params.set('placas', '0');
      if (subs) params.set('cambios', '1');
    } else if (kind === 'formacion') {
      path = `/overlay/formacion/${match?.id ?? 'demo'}`;
      if (side !== 'ambos') params.set('lado', side);
      if (formView !== 'auto') params.set('vista', formView);
    } else if (kind === 'partidos') {
      path = '/overlay/partidos';
      if (matches.length) params.set('ids', matches.map((item) => item.id).join(','));
    } else if (kind === 'fecha') {
      path = '/overlay/fecha';
      if (tournamentId) params.set('torneo', tournamentId);
      if (round && options) params.set('ronda', round);
    } else if (kind === 'dia' || kind === 'home') {
      path = `/overlay/${kind}`;
      if (day && day !== todayKey()) params.set('fecha', day);
      if (kind === 'home' && sport) params.set('deporte', sport);
      if (dayTournaments.length) params.set('torneos', dayTournaments.map((item) => item.id).join(','));
      if (kind === 'home' && liveOnly) params.set('vivo', '1');
    } else if (kind === 'tabla') {
      path = '/overlay/tabla';
      if (tournamentId) params.set('torneo', tournamentId);
      if (phase && options) params.set('fase', phase);
      if (group && options) params.set('grupo', group);
    } else if (kind === 'goleadores') {
      path = '/overlay/goleadores';
      if (tournamentId) params.set('torneo', tournamentId);
      if (stat) params.set('stat', stat);
      if (limit !== 10) params.set('cantidad', String(limit));
    } else if (kind === 'playoff') {
      path = '/overlay/playoff';
      if (tournamentId) params.set('torneo', tournamentId);
      if (phase && options) params.set('fase', phase);
      if (bracketView !== 'llave') params.set('vista', bracketView);
    } else if (kind === 'jugador') {
      path = '/overlay/jugador';
      if (idFrom(playerLink)) params.set('id', idFrom(playerLink));
      if (tournamentId) params.set('torneo', tournamentId);
    } else if (kind === 'noticia') {
      path = '/overlay/noticia';
      if (idFrom(newsLink)) params.set('id', idFrom(newsLink));
    } else {
      path = `/overlay/manual/${manual?.id ?? 'demo'}`;
      if (kind === 'manual-marcador') {
        const style = manualStyle === 'partido' ? 'tarjeta' : manualStyle;
        if (style !== 'marcador') params.set('estilo', style);
      }
    }
    if (isScoreboardStyle(kind)) {
      if (homeColor) params.set('local', hexParam(homeColor));
      if (awayColor) params.set('visita', hexParam(awayColor));
      if (homeName.trim()) params.set('local_nombre', homeName.trim());
      if (awayName.trim()) params.set('visita_nombre', awayName.trim());
    }
    if (hasScoreboard(kind)) {
      if (clockMode !== 'normal') params.set('reloj', clockMode);
      if (!showCards) params.set('tarjetas', '0');
    }
    if (!header && (kind === 'partido' || kind === 'escudos' || kind === 'franja' || kind === 'bloques')) params.set('encabezado', '0');
    const defaultPos = kind === 'manual-titular' ? 'abajo' : 'centro';
    if (position !== defaultPos) params.set('pos', position);
    if (scale !== 1) params.set('escala', String(scale));
    if (cycle && !isManual(kind)) {
      params.set('mostrar', String(showFor));
      params.set('ocultar', String(hideFor));
    }
    if (isList(kind)) {
      if (rows !== DEFAULT_ROWS[kind]) params.set('filas', String(rows));
      if (rotate !== 10) params.set('rotar', String(rotate));
    }
    if (background) params.set('fondo', background);
    if (title.trim() && !isManual(kind)) params.set('titulo', title.trim());
    for (const role of ROLES) {
      const font = fonts[role.id];
      const fallback = ROLE_DEFAULTS[role.id];
      if (font.family !== fallback.family || font.weight !== fallback.weight) params.set(role.param, roleFontParam(font));
    }
    if (Object.values(fonts).some((font) => font.family === 'propia') && customValue.trim()) {
      params.set('fuente', `${customKind}:${customValue.trim()}`);
      if (customScale !== 1) params.set('fuente_escala', String(customScale));
    }
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }, [kind, match, matches, tournamentId, round, phase, group, stat, limit, day, dayTournaments, sport, liveOnly,
    playerLink, newsLink, bracketView, side, formView, manual, manualStyle, plates, subs, homeColor, awayColor,
    homeName, awayName, clockMode, showCards, header, position, scale, cycle, showFor, hideFor, rows, rotate,
    background, title, fonts, customKind, customValue, customScale, options]);

  const url = `${origin}${relative}`;

  // Sin datos completos, la vista previa muestra una muestra con los mismos ajustes.
  const previewUrl = useMemo(() => {
    const demo = (path: string) => `${path}${path.includes('?') ? '&' : '?'}prueba=1`;
    if (!missing) return relative;
    if (kind === 'manual-marcador') {
      const params = new URLSearchParams(relative.split('?')[1] ?? '');
      params.set('estilo', manualStyle === 'partido' ? 'tarjeta' : manualStyle);
      params.set('local', hexParam(homeTeam.color ?? '#00a365'));
      params.set('visita', hexParam(awayTeam.color ?? '#f2f2f2'));
      params.set('local_nombre', homeTeam.short || homeTeam.name);
      params.set('visita_nombre', awayTeam.short || awayTeam.name);
      return demo(`/overlay/partido/demo?${params}`);
    }
    return demo(relative);
  }, [missing, relative, kind, manualStyle, homeTeam, awayTeam]);

  const panelUrl = manual ? `${origin}/overlay/control/${manual.id}#clave=${manual.key}` : '';

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Sin permiso de portapapeles: la URL queda seleccionable en el campo.
    }
  };

  const createManual = async () => {
    setCreating(true);
    setManualError(null);
    const team = (info: TeamInfo, players: string[]) => ({ name: info.name, short: info.short, color: info.color, logo: info.logo, players });
    const state = kind === 'manual-titular'
      ? { style: headlineStyle, items: [{ id: 'h1', ...headline }], current: 0 }
      : { sport: manualSport, title: manualTitle, home: team(homeTeam, homePlayers), away: team(awayTeam, awayPlayers), ...(manualClock ?? {}) };
    try {
      const response = await fetch('/api/overlay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind === 'manual-titular' ? 'titular' : 'marcador', state }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(body?.error ?? 'No se pudo crear.');
      setManual(body as ManualCreated);
    } catch (error: unknown) {
      setManualError(error instanceof Error ? error.message : 'No se pudo crear.');
    } finally {
      setCreating(false);
    }
  };

  const setRoleFont = (role: FontRole, patch: Partial<RoleFont>) => {
    setFonts((current) => {
      const nextFont = { ...current[role], ...patch };
      const family = fontFamilyDef(nextFont.family);
      if (family && !family.weights.includes(nextFont.weight)) {
        nextFont.weight = family.weights.reduce((best, w) => (Math.abs(w - nextFont.weight) < Math.abs(best - nextFont.weight) ? w : best), family.weights[0]);
      }
      return { ...current, [role]: nextFont };
    });
  };

  const usesCustom = Object.values(fonts).some((font) => font.family === 'propia');
  const filteredGroups = options?.groups.filter((item) => !phase || item.phaseId === phase) ?? [];
  const showsHeaderToggle = kind === 'partido' || kind === 'escudos' || kind === 'franja' || kind === 'bloques';
  const showsVisibility = kind !== 'manual-titular';
  // Los pasos se numeran en el orden en que aparecen.
  const numbers = new Map<string, number>();
  const stepOrder = [
    isMatchKind(kind) && 'partido',
    kind === 'partidos' && 'partidos',
    (needsTournament(kind) || kind === 'jugador') && 'torneo',
    (kind === 'dia' || kind === 'home') && 'dia',
    kind === 'jugador' && 'jugador',
    kind === 'noticia' && 'noticia',
    kind === 'manual-marcador' && 'equipos',
    kind === 'manual-marcador' && 'diseno',
    kind === 'manual-titular' && 'titular',
    showsVisibility && 'visible',
    isScoreboardStyle(kind) && 'colores',
  ].filter((item): item is string => Boolean(item));
  stepOrder.forEach((id, index) => numbers.set(id, index + 1));
  const n = (id: string) => numbers.get(id) ?? 0;

  return (
    <>
      <div className={styles.topbar}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <span aria-hidden="true">←</span> Todos los gráficos
        </button>
        <div className={styles.topTitle}>
          <span>{def.group.label}</span>
          <h1>{def.label}</h1>
        </div>
        <button
          type="button"
          className={styles.topCopy}
          onClick={() => void copy(url, 'url')}
          disabled={Boolean(missing)}
          title={missing ?? undefined}
        >
          {copied === 'url' ? 'URL copiada' : 'Copiar URL'}
        </button>
      </div>

      <div className={styles.editor}>
        <div className={styles.controls}>
          {isScoreboardStyle(kind) ? (
            <div className={styles.styleRow} role="radiogroup" aria-label="Estilo del marcador">
              {SCOREBOARD_STYLES.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={kind === item.id} className={styles.styleChip} onClick={() => onStyle(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          {isMatchKind(kind) ? (
            <Step n={n('partido')} title="El partido" hint="Buscalo por el nombre de un club, o pegá el link de la ficha del partido.">
              {match ? (
                <MatchSummary match={match} onClear={() => setMatch(null)} />
              ) : (
                <MatchPicker onPick={(id, found) => void pickMatch(id, found)} />
              )}
              {kind === 'formacion' ? (
                <div className={styles.pair}>
                  <Field label="Equipo">
                    <select value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
                      <option value="ambos">Los dos</option>
                      <option value="local">Solo el local</option>
                      <option value="visita">Solo el visitante</option>
                    </select>
                  </Field>
                  <Field label="Cómo se dibuja">
                    <select value={formView} onChange={(e) => setFormView(e.target.value as typeof formView)} disabled={side === 'ambos'}>
                      <option value="auto">Automático (rugby: en la cancha)</option>
                      <option value="cancha">En la cancha</option>
                      <option value="lista">En lista</option>
                    </select>
                  </Field>
                </div>
              ) : null}
            </Step>
          ) : null}

          {kind === 'partidos' ? (
            <Step n={n('partidos')} title="Los partidos" hint="Sumalos en el orden en que querés que aparezcan.">
              {matches.length ? (
                <ol className={styles.pickedList}>
                  {matches.map((item, index) => (
                    <li key={item.id}>
                      <MatchSummary match={item} compact />
                      <div className={styles.pickedActions}>
                        <button
                          type="button"
                          aria-label="Subir"
                          disabled={index === 0}
                          onClick={() => setMatches((list) => {
                            const reordered = [...list];
                            [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                            return reordered;
                          })}
                        >↑</button>
                        <button type="button" aria-label="Quitar" onClick={() => setMatches((list) => list.filter((other) => other.id !== item.id))}>×</button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
              <MatchPicker onPick={(id, found) => void addMatch(id, found)} actionLabel="Sumar" placeholder="Buscá un club para sumar su partido, o pegá un link" />
            </Step>
          ) : null}

          {(needsTournament(kind) || kind === 'jugador') ? (
            <Step
              n={n('torneo')}
              title={kind === 'jugador' ? 'Torneo (opcional)' : 'El torneo'}
              hint={kind === 'jugador' ? 'Si elegís uno, la ficha muestra solo sus números en ese torneo.' : 'Buscalo por nombre o pegá el link del torneo.'}
            >
              {tournament ? (
                <div className={styles.picked}>
                  <div className={styles.pickedTeams}>
                    <span><Crest src={tournament.logo} name={tournament.name} size={30} />{tournament.name}</span>
                  </div>
                  <button type="button" className={styles.linkButton} onClick={() => { setTournament(null); setRound(''); setPhase(''); setGroup(''); }}>Cambiar</button>
                </div>
              ) : (
                <TournamentPicker onPick={(item) => setTournament(item)} />
              )}
              {optionsError && needsOptions ? <p className={styles.error}>{optionsError}</p> : null}
              {kind === 'fecha' && tournament ? (
                <Field label="Fecha">
                  <select value={round} onChange={(e) => setRound(e.target.value)} disabled={!options}>
                    <option value="">La más cercana a hoy (cambia sola)</option>
                    {options?.rounds.map((item) => <option key={item.id} value={item.id}>{item.phase ? `${item.phase} · ` : ''}{item.name}</option>)}
                  </select>
                </Field>
              ) : null}
              {kind === 'tabla' && tournament ? (
                <div className={styles.pair}>
                  <Field label="Fase">
                    <select value={phase} onChange={(e) => { setPhase(e.target.value); setGroup(''); }} disabled={!options}>
                      <option value="">La actual</option>
                      {options?.phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Zona">
                    <select value={group} onChange={(e) => setGroup(e.target.value)} disabled={!options || !filteredGroups.length}>
                      <option value="">Todas</option>
                      {filteredGroups.map((item) => <option key={item.id} value={item.id}>{item.phase && !phase ? `${item.phase} · ` : ''}{item.name}</option>)}
                    </select>
                  </Field>
                </div>
              ) : null}
              {kind === 'goleadores' ? (
                <div className={styles.pair}>
                  <Field label="Qué contar">
                    <select value={stat} onChange={(e) => setStat(e.target.value)}>
                      {LEADER_STATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Cuántos">
                    <input type="number" min={3} max={20} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 10)} />
                  </Field>
                </div>
              ) : null}
              {kind === 'playoff' && tournament ? (
                <>
                  <Field label="Cuadro">
                    <select value={phase} onChange={(e) => setPhase(e.target.value)} disabled={!options}>
                      <option value="">El último armado</option>
                      {options?.playoffPhases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Segment
                    label="Cómo se dibuja"
                    value={bracketView}
                    options={[['llave', 'Como llave'], ['columnas', 'En columnas']]}
                    onChange={setBracketView}
                  />
                </>
              ) : null}
            </Step>
          ) : null}

          {(kind === 'dia' || kind === 'home') ? (
            <Step n={n('dia')} title="Qué día" hint="Por defecto, hoy. Se puede limitar a algunos torneos.">
              <div className={styles.pair}>
                <Field label="Día"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
                {kind === 'home' ? (
                  <Field label="Deporte">
                    <select value={sport} onChange={(e) => setSport(e.target.value)}>
                      {SPORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                ) : null}
              </div>
              {dayTournaments.length ? (
                <ul className={styles.tagList}>
                  {dayTournaments.map((item) => (
                    <li key={item.id}>
                      {item.name}
                      <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => setDayTournaments((list) => list.filter((other) => other.id !== item.id))}>×</button>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.hint}>Todos los torneos. Para limitar, sumá alguno:</p>}
              <TournamentPicker onPick={(item) => setDayTournaments((list) => (list.some((other) => other.id === item.id) ? list : [...list, item]))} />
              {kind === 'home' ? <Check label="Solo los que se están jugando" checked={liveOnly} onChange={setLiveOnly} /> : null}
            </Step>
          ) : null}

          {kind === 'jugador' ? (
            <Step n={n('jugador')} title="El jugador" hint="Pegá el link de su ficha en G22.">
              <input className={styles.search} value={playerLink} onChange={(e) => setPlayerLink(e.target.value)} placeholder="https://www.g22scores.com/players/…" aria-label="Link de la ficha del jugador" />
            </Step>
          ) : null}

          {kind === 'noticia' ? (
            <Step n={n('noticia')} title="La noticia" hint="Pegá el link de la nota publicada en G22.">
              <input className={styles.search} value={newsLink} onChange={(e) => setNewsLink(e.target.value)} placeholder="https://www.g22scores.com/noticias/…" aria-label="Link de la noticia" />
            </Step>
          ) : null}

          {kind === 'manual-marcador' ? (
            <>
              <Step n={n('equipos')} title="Los equipos" hint="Traé los dos de un partido de G22, o elegí cada club. También podés escribirlos a mano.">
                {manual ? (
                  <p className={styles.hint}>Los equipos ya están en el marcador. Para cambiarlos, usá el panel de control.</p>
                ) : (
                  <>
                    <div className={styles.fromMatch}>
                      <span>Desde un partido de G22</span>
                      <MatchPicker onPick={(id, found) => void loadManualFromMatch(id, found)} actionLabel="Traer equipos" />
                      {loadingMatch ? <p className={styles.searchNote}>Trayendo equipos y planteles…</p> : null}
                    </div>
                    <div className={styles.teams}>
                      <TeamEditor label="Local" team={homeTeam} players={homePlayers.length} onChange={setHomeTeam} />
                      <TeamEditor label="Visitante" team={awayTeam} players={awayPlayers.length} onChange={setAwayTeam} />
                    </div>
                  </>
                )}
              </Step>
              <Step n={n('diseno')} title="Deporte y diseño" hint="El deporte define los botones para anotar en el panel.">
                <div className={styles.pair}>
                  <Field label="Deporte">
                    <select value={manualSport} onChange={(e) => setManualSport(e.target.value as ManualSport)} disabled={Boolean(manual)}>
                      {MANUAL_SPORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Título (torneo, opcional)">
                    <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} maxLength={60} disabled={Boolean(manual)} />
                  </Field>
                </div>
                <div className={styles.styleRow} role="radiogroup" aria-label="Diseño del marcador">
                  {SCOREBOARD_STYLES.map((item) => (
                    <button key={item.id} type="button" role="radio" aria-checked={manualStyle === item.id} className={styles.styleChip} onClick={() => setManualStyle(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </Step>
            </>
          ) : null}

          {kind === 'manual-titular' ? (
            <Step n={n('titular')} title="El primer titular" hint="Después sumás más títulos desde el panel y los hacés rotar.">
              {manual ? <p className={styles.hint}>El titular ya está creado. Los textos se cambian desde el panel de control.</p> : (
                <>
                  <Field label="Volanta (arriba, chica)"><input value={headline.kicker} onChange={(e) => setHeadline({ ...headline, kicker: e.target.value })} maxLength={40} placeholder="EN VIVO" /></Field>
                  <Field label="Título"><input value={headline.title} onChange={(e) => setHeadline({ ...headline, title: e.target.value })} maxLength={90} placeholder="Olivos gana y se mete en semifinales" /></Field>
                  <Field label="Bajada (opcional)"><input value={headline.subtitle} onChange={(e) => setHeadline({ ...headline, subtitle: e.target.value })} maxLength={120} /></Field>
                  <Field label="Cómo se ve">
                    <select value={headlineStyle} onChange={(e) => setHeadlineStyle(e.target.value as typeof headlineStyle)}>
                      {HEADLINE_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                </>
              )}
            </Step>
          ) : null}

          {isManual(kind) ? (
            <div className={styles.createBox}>
              {manual ? (
                <>
                  <p><b>Listo.</b> Desde el panel de control lo manejás: puntos, reloj, tarjetas y anotadores (o los textos del titular). Anda en el celular.</p>
                  <div className={styles.createActions}>
                    <a className={styles.primary} href={panelUrl} target="_blank" rel="noreferrer">Abrir el panel de control</a>
                    <button type="button" className={styles.secondary} onClick={() => void copy(panelUrl, 'panel')}>{copied === 'panel' ? 'Link copiado' : 'Copiar link del panel'}</button>
                  </div>
                  <p className={styles.hint}>El link del panel lleva la clave: quien lo tenga puede manejarlo. Guardalo.</p>
                </>
              ) : (
                <>
                  <button type="button" className={styles.primary} onClick={() => void createManual()} disabled={creating || (kind === 'manual-titular' && !headline.title.trim())}>
                    {creating ? 'Creando…' : kind === 'manual-marcador' ? 'Crear el marcador' : 'Crear el titular'}
                  </button>
                  {kind === 'manual-titular' && !headline.title.trim() ? <p className={styles.hint}>Escribí el título para crearlo.</p> : null}
                  {manualError ? <p className={styles.error}>{manualError}</p> : null}
                </>
              )}
            </div>
          ) : null}

          {showsVisibility ? (
            <Step n={n('visible')} title="Qué se ve">
              {hasScoreboard(kind) ? (
                <>
                  <Segment
                    label="Reloj"
                    value={clockMode}
                    options={[['normal', '34:12'], ['minutos', '34′'], ['oculto', 'Sin reloj']]}
                    onChange={setClockMode}
                  />
                  <Check label="Amarillas, rojas y sin-bin" checked={showCards} onChange={setShowCards} />
                </>
              ) : null}
              {isScoreboardStyle(kind) ? (
                <>
                  <Check label="Placa de quien anota (try, penal, tarjeta)" checked={plates} onChange={setPlates} />
                  <Check label="Placa de los cambios" checked={subs} onChange={setSubs} disabled={!plates} />
                </>
              ) : null}
              {showsHeaderToggle ? <Check label="Torneo, fase y zona arriba del marcador" checked={header} onChange={setHeader} /> : null}
              {!isManual(kind) && kind !== 'marcador' && kind !== 'barra' && kind !== 'compacto' && kind !== 'tira' ? (
                <Field label="Título (opcional)">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Por defecto, el nombre del torneo" maxLength={80} />
                </Field>
              ) : null}
              {isList(kind) ? (
                <div className={styles.pair}>
                  <Field label="Filas por página"><input type="number" min={1} max={12} value={rows} onChange={(e) => setRows(Number(e.target.value) || 6)} /></Field>
                  <Field label="Segundos por página"><input type="number" min={3} max={120} value={rotate} onChange={(e) => setRotate(Number(e.target.value) || 10)} /></Field>
                </div>
              ) : null}
            </Step>
          ) : null}

          {isScoreboardStyle(kind) ? (
            <Step n={n('colores')} title="Colores y nombres" hint="Vacío = el color y el nombre del club en G22.">
              <div className={styles.teams}>
                <ColorName label="Local" color={homeColor} fallback={match?.home?.color ?? '#00a365'} onColor={setHomeColor} name={homeName} placeholder={match?.home?.short ?? 'Nombre del club'} onName={setHomeName} />
                <ColorName label="Visitante" color={awayColor} fallback={match?.away?.color ?? '#2563eb'} onColor={setAwayColor} name={awayName} placeholder={match?.away?.short ?? 'Nombre del club'} onName={setAwayName} />
              </div>
            </Step>
          ) : null}

          <details className={styles.advanced}>
            <summary>Tipografías</summary>
            <div className={styles.advancedBody}>
              {ROLES.map((role) => {
                const font = fonts[role.id];
                const family = fontFamilyDef(font.family);
                return (
                  <div key={role.id} className={styles.fontRow}>
                    <span>{role.label}</span>
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
                <>
                  <Segment
                    label="De dónde sale la fuente propia"
                    value={customKind}
                    options={[['google', 'Google Fonts'], ['url', 'Link a un archivo'], ['local', 'Instalada en la PC']]}
                    onChange={setCustomKind}
                  />
                  <input
                    className={styles.search}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder={customKind === 'google' ? 'Oswald' : customKind === 'url' ? 'https://…/mi-fuente.woff2' : 'Nombre exacto, como aparece en tu PC'}
                    aria-label="Fuente propia"
                  />
                  <Field label={`Ajuste de tamaño: ${Math.round(customScale * 100)}%`}>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={customScale} onChange={(e) => setCustomScale(Number(e.target.value))} />
                  </Field>
                </>
              ) : <p className={styles.hint}>Elegí «Fuente propia» en cualquiera para usar una de Google Fonts, un archivo o una instalada en la PC.</p>}
              <button type="button" className={styles.linkButton} onClick={() => setFonts({ ...ROLE_DEFAULTS })}>Volver a las de G22</button>
            </div>
          </details>

          <details className={styles.advanced}>
            <summary>Ubicación, tamaño y fondo</summary>
            <div className={styles.advancedBody}>
              <Field label="Posición en pantalla">
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {POSITIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </Field>
              <Field label={`Tamaño: ${Math.round(scale * 100)}%`}>
                <input type="range" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
              </Field>
              {!isManual(kind) ? (
                <>
                  <Check label="Que aparezca y desaparezca sola" checked={cycle} onChange={setCycle} />
                  {cycle ? (
                    <div className={styles.pair}>
                      <Field label="Segundos en pantalla"><input type="number" min={3} max={3600} value={showFor} onChange={(e) => setShowFor(Number(e.target.value) || 15)} /></Field>
                      <Field label="Segundos oculta"><input type="number" min={1} max={3600} value={hideFor} onChange={(e) => setHideFor(Number(e.target.value) || 45)} /></Field>
                    </div>
                  ) : null}
                </>
              ) : null}
              <Field label="Fondo">
                <select value={background} onChange={(e) => setBackground(e.target.value)}>
                  <option value="">Transparente (OBS, vMix)</option>
                  <option value="verde">Verde chroma</option>
                  <option value="azul">Azul chroma</option>
                  <option value="negro">Negro (luma key)</option>
                </select>
              </Field>
            </div>
          </details>
        </div>

        <aside className={styles.output} aria-label="Vista previa y URL">
          <Canvas src={previewUrl} title="Vista previa del overlay" className={styles.bigCanvas} />
          <p className={styles.previewNote}>{missing ? `Muestra con datos de prueba. ${missing}` : 'Así sale al aire, con los datos reales.'}</p>
          <div className={styles.urlRow}>
            <input className={styles.url} readOnly value={missing ? '' : url} placeholder="La URL aparece acá" onFocus={(e) => e.currentTarget.select()} aria-label="URL del overlay" />
            <button type="button" className={styles.primary} onClick={() => void copy(url, 'url')} disabled={Boolean(missing)}>
              {copied === 'url' ? 'Copiada' : 'Copiar'}
            </button>
          </div>
          {!missing ? (
            <div className={styles.outActions}>
              <a href={url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
              {!isManual(kind) ? <a href={`${url}${url.includes('?') ? '&' : '?'}prueba=1`} target="_blank" rel="noreferrer">Abrir en modo prueba</a> : null}
            </div>
          ) : null}
          <HowTo />
        </aside>
      </div>
    </>
  );
}

/* ─────────────── piezas ─────────────── */

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={styles.step}>
      <header>
        <b aria-hidden="true">{n}</b>
        <div>
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
      </header>
      <div className={styles.stepBody}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={styles.check} data-disabled={disabled ? '' : undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

function Segment<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<readonly [NoInfer<T>, string]>; onChange: (value: NoInfer<T>) => void }) {
  return (
    <div className={styles.segmentWrap}>
      <span>{label}</span>
      <div className={styles.segment} role="radiogroup" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function MatchSummary({ match, onClear, compact = false }: { match: PickedMatch; onClear?: () => void; compact?: boolean }) {
  return (
    <div className={styles.picked} data-compact={compact ? '' : undefined}>
      <div className={styles.pickedTeams}>
        <span><Crest src={match.home?.logo ?? null} name={match.home?.name ?? '?'} size={compact ? 22 : 30} />{match.home?.name ?? 'Partido elegido'}</span>
        {match.away ? <span className={styles.resultVs}>vs</span> : null}
        {match.away ? <span><Crest src={match.away.logo} name={match.away.name} size={compact ? 22 : 30} />{match.away.name}</span> : null}
      </div>
      {!compact && (match.when || match.context) ? <p className={styles.pickedMeta}>{[match.when, match.context].filter(Boolean).join(' · ')}</p> : null}
      {onClear ? <button type="button" className={styles.linkButton} onClick={onClear}>Cambiar</button> : null}
    </div>
  );
}

function TeamEditor({ label, team, players, onChange }: { label: string; team: TeamInfo; players: number; onChange: (team: TeamInfo) => void }) {
  return (
    <div className={styles.team}>
      <div className={styles.teamHead}>
        <Crest src={team.logo} name={team.name} size={34} />
        <div>
          <span>{label}</span>
          <b>{team.name}</b>
          {players ? <small>{players} jugadores del plantel</small> : null}
        </div>
      </div>
      <ClubPicker label={`Buscar club ${label.toLowerCase()}`} onPick={(club) => onChange({ name: club.name, short: club.short, color: club.color ?? team.color, logo: club.logo })} />
      <div className={styles.teamFields}>
        <Field label="Nombre"><input value={team.name} maxLength={40} onChange={(e) => onChange({ ...team, name: e.target.value })} /></Field>
        <Field label="Sigla"><input value={team.short} maxLength={16} onChange={(e) => onChange({ ...team, short: e.target.value })} /></Field>
        <Field label="Color"><input type="color" value={team.color ?? '#00a365'} onChange={(e) => onChange({ ...team, color: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function ColorName({ label, color, fallback, onColor, name, placeholder, onName }: {
  label: string; color: string; fallback: string; onColor: (value: string) => void; name: string; placeholder: string; onName: (value: string) => void;
}) {
  const safeFallback = /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#00a365';
  return (
    <div className={styles.team}>
      <span className={styles.teamLabel}>{label}</span>
      <div className={styles.colorRow}>
        <input type="color" value={color || safeFallback} onChange={(e) => onColor(e.target.value)} aria-label={`Color ${label.toLowerCase()}`} />
        {color ? <button type="button" className={styles.linkButton} onClick={() => onColor('')}>Usar el del club</button> : <span className={styles.hint}>El del club</span>}
      </div>
      <Field label="Nombre en pantalla"><input value={name} maxLength={24} placeholder={placeholder} onChange={(e) => onName(e.target.value)} /></Field>
    </div>
  );
}

function weightLabel(weight: number) {
  const names: Record<number, string> = {
    100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
    600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Heavy',
  };
  return `${weight} · ${names[weight] ?? ''}`;
}
