'use client';

/* eslint-disable @next/next/no-img-element -- el wordmark es un PNG local chico. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FONT_FAMILIES, ROLE_DEFAULTS, fontFamilyDef, parseRoleFont, roleFontParam, type FontRole, type RoleFont } from './_lib/fonts';
import {
  DEFAULT_ROWS, KIND_DEFS, KIND_GROUPS, SCOREBOARD_STYLES, UUID_RE,
  hasScoreboard, idFrom, isList, isManual, isMatchKind, isScoreboardStyle, needsTournament, requiredPlan,
  type Kind, type KindDef,
} from './_builder/catalog';
import { PLAN_LABELS, planAtLeast, planRules, type BrandPosition, type OverlayPlan } from '@/lib/overlay/overlayPlan';
import { teamAcronym, type NameMode } from '@/lib/overlay/teamAcronym';
import { Canvas } from './_builder/Canvas';
import { ClubPicker, Crest, MatchPicker, TournamentPicker, matchWhen, type OverlaySearchMatch } from './_builder/Pickers';
import { MyOverlays, SaveLink, useSavedLinks, type SavedLinks } from './_builder/MyOverlays';
import { manualKind, reader, savedTarget } from './_builder/fromPath';
import type { SavedLink } from '@/lib/overlay/overlayLinks';
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

/** El plan del usuario: qué se puede personalizar. Al aire se vuelve a aplicar. */
const PlanContext = createContext<OverlayPlan>('basico');
/** false = entró solo por overlays compartidos (sin el rol): gestiona esos, no crea nuevos. */
const CreateContext = createContext(true);

export default function OverlayBuilder({ plan, canCreate = true }: { plan: OverlayPlan; canCreate?: boolean }) {
  return (
    <PlanContext.Provider value={plan}>
      <CreateContext.Provider value={canCreate}>
        <Studio />
      </CreateContext.Provider>
    </PlanContext.Provider>
  );
}

type StudioTab = 'crear' | 'mios';

/** Qué gráfico es un overlay guardado. Los manuales lo preguntan al overlay. */
async function kindOfSaved(link: SavedLink): Promise<Kind | null> {
  const target = savedTarget(link.path);
  if (!target) return null;
  if (target.kind) return target.kind;
  if (!target.routeId) return null;
  try {
    const response = await fetch(`/api/overlay/control/${target.routeId}`, { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    return typeof body?.kind === 'string' ? manualKind(body.kind) : null;
  } catch {
    return null;
  }
}

function Studio() {
  const canCreate = useContext(CreateContext);
  const plan = useContext(PlanContext);
  const [kind, setKind] = useState<Kind | null>(null);
  const [tab, setTab] = useState<StudioTab>('crear');
  const [origin, setOrigin] = useState('https://www.g22scores.com');
  const store = useSavedLinks();
  // Un overlay de Mis overlays abierto en el editor (va en `?editar=<id>`).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedLink | null>(null);
  const [editProblem, setEditProblem] = useState<string | null>(null);
  // Cada vez que se ABRE el editor (no cuando se guarda adentro) arranca de cero.
  const [session, setSession] = useState('nuevo');

  // El gráfico elegido, la pestaña y el overlay en edición viven en la URL: Atrás vuelve a donde estaba.
  useEffect(() => {
    setOrigin(window.location.origin);
    const read = () => {
      const search = new URLSearchParams(window.location.search);
      const editId = search.get('editar');
      setEditingId(editId);
      setSession(editId ?? 'nuevo');
      if (editId) return;
      setEditing(null);
      const value = search.get('grafico') as Kind | null;
      setKind(canCreate && value && KIND_DEFS.has(value) ? value : null);
      setTab(!canCreate || search.get('vista') === 'mios' ? 'mios' : 'crear');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [canCreate]);

  // Con la lista leída, el overlay en edición se abre con su gráfico.
  const links = store.links;
  useEffect(() => {
    if (!editingId || !links) return undefined;
    const link = links.find((item) => item.id === editingId);
    if (!link) {
      setEditProblem('Ese overlay ya no está en Mis overlays.');
      setEditingId(null);
      setTab('mios');
      setKind(null);
      setEditing(null);
      return undefined;
    }
    if (editing?.id === link.id) return undefined;
    let cancelled = false;
    setEditProblem(null);
    void kindOfSaved(link).then((found) => {
      if (cancelled) return;
      if (!found) {
        setEditProblem('No pudimos abrir ese overlay para editarlo.');
        setEditingId(null);
        setTab('mios');
        setKind(null);
        return;
      }
      setEditing(link);
      setKind(found);
    });
    return () => { cancelled = true; };
  }, [editingId, links, editing?.id]);

  // Quien ya tiene overlays guardados entra a Mis overlays (con «Crear overlay» a la vista).
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !links) return;
    landed.current = true;
    if (links.length && !window.location.search) {
      window.history.replaceState(null, '', '/overlay?vista=mios');
      setTab('mios');
    }
  }, [links]);

  const open = useCallback((next: Kind) => {
    window.history.pushState(null, '', `/overlay?grafico=${next}`);
    setEditingId(null);
    setEditing(null);
    setSession('nuevo');
    setKind(next);
    window.scrollTo({ top: 0 });
  }, []);

  const openSaved = useCallback((link: SavedLink) => {
    window.history.pushState(null, '', `/overlay?editar=${link.id}`);
    setEditing(null);
    setKind(null);
    setEditProblem(null);
    setSession(link.id);
    setEditingId(link.id);
    window.scrollTo({ top: 0 });
  }, []);

  /** Desde el editor: si se abrió desde Mis overlays (o ya se guardó), vuelve a la lista. */
  const back = useCallback(() => {
    const toMine = Boolean(editingId);
    window.history.pushState(null, '', toMine ? '/overlay?vista=mios' : '/overlay');
    setEditingId(null);
    setEditing(null);
    setKind(null);
    setTab(toMine ? 'mios' : 'crear');
  }, [editingId]);

  /** Cambiar de estilo de marcador no agrega una entrada al historial. */
  const switchStyle = useCallback((next: Kind) => {
    window.history.replaceState(null, '', editingId ? `/overlay?editar=${editingId}` : `/overlay?grafico=${next}`);
    setKind(next);
  }, [editingId]);

  /** Las dos pestañas: crear (la galería) y los propios. Desde el editor, también vuelven. */
  const goTab = useCallback((wanted: StudioTab) => {
    const next: StudioTab = canCreate ? wanted : 'mios';
    window.history.pushState(null, '', next === 'mios' ? '/overlay?vista=mios' : '/overlay');
    setEditingId(null);
    setEditing(null);
    setEditProblem(null);
    setKind(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  }, [canCreate]);

  const current: StudioTab = editingId ? 'mios' : kind ? 'crear' : tab;
  const count = links?.length ?? 0;

  return (
    <main className={styles.studio}>
      <nav className={styles.siteNav} aria-label="Overlays">
        <a href="/" className={styles.homeLink}>
          <span aria-hidden="true">←</span>
          <img src="/header-logo.png" alt="" className={styles.homeLogo} />
          <span>Volver a G22 Scores</span>
        </a>
        <div className={styles.navRight}>
          <div className={styles.tabs} role="tablist" aria-label="Secciones de overlays">
            {canCreate ? (
              <button type="button" role="tab" aria-selected={current === 'crear'} className={styles.tab} onClick={() => goTab('crear')}>
                Crear
              </button>
            ) : null}
            <button type="button" role="tab" aria-selected={current === 'mios'} className={styles.tab} onClick={() => goTab('mios')}>
              Mis overlays{count ? <span className={styles.tabCount}>{count}</span> : null}
            </button>
          </div>
          {/* Con el editor abierto NO: «Crear overlay» llevaba a la galería y se perdía lo configurado. */}
          {canCreate && current === 'mios' && !kind ? (
            <button type="button" className={`${styles.primary} ${styles.navCreate}`} onClick={() => goTab('crear')}>
              <span aria-hidden="true">+</span> Crear<b>&nbsp;overlay</b>
            </button>
          ) : null}
        </div>
      </nav>

      {kind ? (
        // Un overlay compartido se edita con el plan de su DUEÑO: es el que manda al aire.
        <PlanContext.Provider value={editing?.access === 'member' && editing.ownerPlan ? editing.ownerPlan : plan}>
        <Editor
          key={`${session}:${isScoreboardStyle(kind) ? 'scoreboard' : kind}`}
          kind={kind}
          origin={origin}
          onBack={back}
          onStyle={switchStyle}
          store={store}
          saved={editing}
          onCreate={() => goTab('crear')}
          onSaved={(link) => {
            if (editing) return;
            // Recién guardado: desde ahora se edita ese mismo enlace (y Atrás vuelve a Mis overlays).
            window.history.replaceState(null, '', `/overlay?editar=${link.id}`);
            setEditing(link);
            setEditingId(link.id);
          }}
        />
        </PlanContext.Provider>
      ) : editingId ? (
        <p className={styles.loadingSaved} role="status">Abriendo tu overlay…</p>
      ) : tab === 'mios' ? (
        <div role="tabpanel" aria-label="Mis overlays">
          {editProblem ? <p className={styles.error} role="alert">{editProblem}</p> : null}
          <MyOverlays origin={origin} store={store} onCreate={canCreate ? () => goTab('crear') : undefined} onEdit={openSaved} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Crear overlays">
          <Gallery onOpen={open} savedCount={count} onMine={() => goTab('mios')} />
        </div>
      )}
    </main>
  );
}

/* ─────────────── Galería ─────────────── */

/**
 * Los estilos de marcador son variantes del mismo gráfico: en la galería van
 * en una sola tarjeta y se eligen adentro, en el editor.
 */
function galleryKinds(kinds: KindDef[]): KindDef[] {
  return kinds.flatMap((item) => {
    if (item.id === 'marcador') {
      return [{ ...item, label: 'Marcador', hint: `${SCOREBOARD_STYLES.length} estilos: esquina, zócalo, bloques, sesgado y más. El estilo lo elegís adentro.` }];
    }
    return isScoreboardStyle(item.id) && item.id !== 'partido' ? [] : [item];
  });
}

function Gallery({ onOpen, savedCount, onMine }: { onOpen: (kind: Kind) => void; savedCount: number; onMine: () => void }) {
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
  const plan = useContext(PlanContext);
  // Una categoría por vez: veintiocho tarjetas en fila cansaban la vista.
  const [groupId, setGroupId] = useState(KIND_GROUPS[0].id);
  const group = KIND_GROUPS.find((item) => item.id === groupId) ?? KIND_GROUPS[0];

  return (
    <>
      <header className={styles.hero}>

        <div>
          <h1 className={styles.title}>Overlays para transmisión</h1>
          <p className={styles.lead}>Gráficos en vivo para OBS, vMix o Streamlabs que se actualizan solos con lo que pasa en G22.</p>
          <p className={styles.planLine}>
            <span className={styles.planBadge} data-plan={plan}>Plan {PLAN_LABELS[plan]}</span>
            {plan === 'basico'
              ? 'Estética de G22 y los marcadores de la casa. Con el plan Colores, todos los estilos y los colores de cada club; con Premium, el logo del torneo y los sponsors.'
              : plan === 'colores'
                ? 'Todos los estilos, colores y tipografías. Con Premium, el logo del torneo, los sponsors y sin la marca de G22.'
                : 'Todo: estilos, colores, tipografías, logo del torneo, sponsors y la marca de G22 opcional.'}
          </p>
        </div>
      </header>

      {savedCount ? (
        <button type="button" className={styles.mineStrip} onClick={onMine}>
          <span>
            <b>{savedCount === 1 ? 'Tenés 1 overlay guardado' : `Tenés ${savedCount} overlays guardados`}</b>
            Para cambiar uno que ya está en OBS, editalo desde Mis overlays: la URL no cambia.
          </span>
          <span className={styles.mineStripCta}>Ver y editar →</span>
        </button>
      ) : null}

      <ol className={styles.steps} aria-label="Cómo se usa">
        <li><b>1</b><span><strong>Elegí un gráfico.</strong> Pasá el mouse por una tarjeta para verla en movimiento.</span></li>
        <li><b>2</b><span><strong>Personalizalo.</strong> El partido o torneo, qué se ve, colores y tipografías.</span></li>
        <li><b>3</b><span><strong>Guardalo y copiá la URL</strong> para pegarla en OBS o vMix. Vale 15 días y se renueva desde la pestaña Mis overlays.</span></li>
      </ol>


      <div className={styles.segment} role="tablist" aria-label="Tipo de gráfico">
        {KIND_GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === group.id}
            className={styles.segmentItem}
            onClick={() => setGroupId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {[group].map((group) => (
        <section key={group.id} className={styles.shelf} role="tabpanel" aria-labelledby={`grupo-${group.id}`}>
          <div className={styles.shelfHead}>
            <h2 id={`grupo-${group.id}`}>{group.label}</h2>
            <p>{group.description}</p>
          </div>
          <div className={styles.cards}>
            {galleryKinds(group.kinds).map((item) => {
              const needs = requiredPlan(item.id);
              const locked = !planAtLeast(plan, needs);
              return (
              <button
                key={item.id}
                type="button"
                className={styles.card}
                data-locked={locked ? '' : undefined}
                disabled={locked}
                aria-label={locked ? `${item.label}: disponible con el plan ${PLAN_LABELS[needs]}` : undefined}
                onClick={() => onOpen(item.id)}
                onPointerEnter={(event) => startLive(item.id, event.pointerType)}
                onPointerLeave={stopLive}
              >
                {locked ? <span className={styles.cardLock}>Plan {PLAN_LABELS[needs]}</span> : null}
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
                <span className={styles.cardCta} aria-hidden="true">{locked ? `Con el plan ${PLAN_LABELS[needs]}` : 'Personalizar →'}</span>
              </button>
              );
            })}
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
            <li>El enlace vale <b>15 días</b>. Si vence, en vez del gráfico sale un aviso: renovalo en <b>Mis overlays</b> y la URL sigue igual.</li>
          </ol>
        </div>
      </div>
    </details>
  );
}

/* ─────────────── Editor ─────────────── */

function Editor({ kind, origin, onBack, onStyle, onCreate, store, saved, onSaved }: {
  /** Empezar otro overlay desde cero: vuelve a la galería. */
  onCreate: () => void;
  kind: Kind;
  origin: string;
  onBack: () => void;
  onStyle: (kind: Kind) => void;
  store: SavedLinks;
  /** Abierto desde Mis overlays: arranca con sus ajustes y guarda encima. */
  saved: SavedLink | null;
  onSaved: (link: SavedLink) => void;
}) {
  const def = KIND_DEFS.get(kind)!;
  const canCreate = useContext(CreateContext);
  // Lo guardado, leído UNA vez al abrir: los useState de abajo arrancan de acá.
  const [target] = useState(() => (saved ? savedTarget(saved.path) : null));
  const r = reader(target?.params ?? null);
  const isEditing = Boolean(target);

  // Datos
  const [match, setMatch] = useState<PickedMatch | null>(null);
  const [matches, setMatches] = useState<PickedMatch[]>([]);
  const [tournament, setTournament] = useState<PickedTournament | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [round, setRound] = useState(r.text('ronda'));
  const [phase, setPhase] = useState(r.text('fase'));
  const [group, setGroup] = useState(r.text('grupo'));
  const [stat, setStat] = useState(r.text('stat'));
  const [limit, setLimit] = useState(r.number('cantidad', 10));
  const [day, setDay] = useState(r.text('fecha'));
  const [dayTournaments, setDayTournaments] = useState<PickedTournament[]>([]);
  const [sport, setSport] = useState(r.text('deporte'));
  const [liveOnly, setLiveOnly] = useState(r.flag('vivo'));
  const [playerLink, setPlayerLink] = useState(kind === 'jugador' ? r.text('id') : '');
  const [newsLink, setNewsLink] = useState(kind === 'noticia' ? r.text('id') : '');
  const [bracketView, setBracketView] = useState<'llave' | 'columnas'>(kind === 'playoff' ? r.oneOf('vista', ['llave', 'columnas'] as const, 'llave') : 'llave');
  const [side, setSide] = useState<'ambos' | 'local' | 'visita'>(r.oneOf('lado', ['ambos', 'local', 'visita'] as const, 'ambos'));
  const [formView, setFormView] = useState<'auto' | 'cancha' | 'lista'>(kind === 'formacion' ? r.oneOf('vista', ['auto', 'cancha', 'lista'] as const, 'auto') : 'auto');

  // Qué se ve
  const [clockMode, setClockMode] = useState<'normal' | 'minutos' | 'oculto'>(r.oneOf('reloj', ['normal', 'minutos', 'oculto'] as const, 'normal'));
  const [showCards, setShowCards] = useState(!r.off('tarjetas'));
  const [plates, setPlates] = useState(!r.off('placas'));
  const [subs, setSubs] = useState(r.flag('cambios'));
  // La conversión va prendida por defecto; guardada, está prendida solo si quedó en la ruta.
  const [conversion, setConversion] = useState(isEditing && kind !== 'partido' ? Boolean(r.get('conversion')) : true);
  const [celebration, setCelebration] = useState<'marcador' | 'cinta'>(r.oneOf('festejo', ['marcador', 'cinta'] as const, 'marcador'));
  const [showTries, setShowTries] = useState(r.flag('tries'));
  const [showPeriod, setShowPeriod] = useState(r.flag('periodo'));
  const [header, setHeader] = useState(!r.off('encabezado'));
  const [title, setTitle] = useState(r.text('titulo'));

  // Colores y nombres (vacío = el del club)
  const [homeColor, setHomeColor] = useState(r.color('local'));
  const [awayColor, setAwayColor] = useState(r.color('visita'));
  const [homeName, setHomeName] = useState(r.text('local_nombre'));
  const [awayName, setAwayName] = useState(r.text('visita_nombre'));
  // Cómo se escribe cada club: siglas, nombre completo o automático (y el nombre, editable).
  const [nameMode, setNameMode] = useState<NameMode>(r.oneOf('nombres', ['auto', 'siglas', 'completo'] as const, 'auto'));
  const [homeFull, setHomeFull] = useState(r.text('local_largo'));
  const [awayFull, setAwayFull] = useState(r.text('visita_largo'));

  // Manual
  const [homeTeam, setHomeTeam] = useState<TeamInfo>({ name: 'Local', short: 'LOC', color: '#00a365', logo: null });
  const [awayTeam, setAwayTeam] = useState<TeamInfo>({ name: 'Visitante', short: 'VIS', color: '#f2f2f2', logo: null });
  const [homePlayers, setHomePlayers] = useState<string[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<string[]>([]);
  const [manualSport, setManualSport] = useState<ManualSport>('rugby');
  const [manualStyle, setManualStyle] = useState<Kind>(() => {
    const style = kind === 'manual-marcador' ? r.get('estilo') : null;
    if (!style) return 'marcador';
    if (style === 'tarjeta') return 'partido';
    return KIND_DEFS.has(style as Kind) && isScoreboardStyle(style as Kind) ? (style as Kind) : 'marcador';
  });
  const [manualTitle, setManualTitle] = useState('');
  const [manualClock, setManualClock] = useState<ReturnType<typeof sevensClockPatch>>(null);
  const [headline, setHeadline] = useState({ kicker: '', title: '', subtitle: '' });
  const [headlineStyle, setHeadlineStyle] = useState<(typeof HEADLINE_STYLES)[number][0]>('noticiero');
  const [sponsorLayout, setSponsorLayout] = useState<'grilla' | 'banda' | 'esquina'>('grilla');
  const [sponsorSurface, setSponsorSurface] = useState<'oscuro' | 'claro'>('oscuro');
  const [sponsorHeading, setSponsorHeading] = useState('');
  // Un manual guardado ya existe; su clave no se guarda en ningún lado (el panel va con el link de cuando se creó).
  const [manual, setManual] = useState<ManualCreated | null>(() => (isManual(kind) && target?.routeId ? { id: target.routeId, key: '', kind: kind === 'manual-titular' ? 'titular' : 'marcador' } : null));
  const [manualError, setManualError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);

  // Ubicación y tipografía
  const defaultPosition = kind === 'manual-titular' || kind === 'presentacion' ? 'abajo' : kind === 'manual-sponsors' ? 'auto' : 'centro';
  const [position, setPosition] = useState(r.text('pos', defaultPosition));
  const [scale, setScale] = useState(r.number('escala', 1));
  const [cycle, setCycle] = useState(Boolean(r.get('mostrar')));
  const [showFor, setShowFor] = useState(r.number('mostrar', 15));
  const [hideFor, setHideFor] = useState(r.number('ocultar', 45));
  const [rows, setRows] = useState(r.number('filas', DEFAULT_ROWS[kind] ?? 6));
  const [rotate, setRotate] = useState(r.number('rotar', 10));
  const [background, setBackground] = useState(r.text('fondo'));
  // Plan y marca: lo que el plan no permite, el generador no lo ofrece (y al aire se ignora).
  const plan = useContext(PlanContext);
  const rules = planRules(plan);
  const [brand, setBrand] = useState<BrandPosition>(r.oneOf('marca', ['arriba-der', 'abajo-der', 'no'] as const, 'arriba-der'));
  const [logo, setLogo] = useState(r.text('logo'));
  const [fonts, setFonts] = useState<Record<FontRole, RoleFont>>(() => {
    const next = { ...ROLE_DEFAULTS };
    for (const role of ROLES) {
      const raw = r.get(role.param);
      if (raw) next[role.id] = parseRoleFont(raw, ROLE_DEFAULTS[role.id]);
    }
    return next;
  });
  const savedFont = r.text('fuente');
  const savedFontKind = savedFont.slice(0, Math.max(0, savedFont.indexOf(':')));
  const [customKind, setCustomKind] = useState<'google' | 'url' | 'local'>(savedFontKind === 'url' || savedFontKind === 'local' ? savedFontKind : 'google');
  const [customValue, setCustomValue] = useState(savedFont.includes(':') ? savedFont.slice(savedFont.indexOf(':') + 1) : '');
  const [customScale, setCustomScale] = useState(r.number('fuente_escala', 1));
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { setDay((current) => current || todayKey()); }, []);

  // Lo que la ruta guarda como id se muestra con nombre: partido, partidos, torneo(s).
  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    const params = reader(target.params);
    const tournamentName = async (id: string): Promise<PickedTournament> => {
      try {
        const response = await fetch(`/api/overlay?tipo=opciones&torneo=${id}`);
        const body = await response.json();
        return { id, name: typeof body?.tournament?.name === 'string' ? body.tournament.name : 'Torneo', logo: null };
      } catch {
        return { id, name: 'Torneo', logo: null };
      }
    };
    void (async () => {
      if (isMatchKind(kind) && target.routeId) {
        const picked = await describeMatch(target.routeId);
        if (!cancelled) setMatch(picked);
      }
      if (kind === 'partidos') {
        const picked = await Promise.all(params.list('ids').map((id) => describeMatch(id)));
        if (!cancelled) setMatches(picked);
      }
      const torneo = params.get('torneo');
      if (torneo && UUID_RE.test(torneo)) {
        const picked = await tournamentName(torneo);
        if (!cancelled) setTournament(picked);
      }
      const torneos = params.list('torneos').filter((id) => UUID_RE.test(id));
      if (torneos.length) {
        const picked = await Promise.all(torneos.map(tournamentName));
        if (!cancelled) setDayTournaments(picked);
      }
    })();
    return () => { cancelled = true; };
    // Una sola vez, al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (isManual(kind) && !manual) return kind === 'manual-marcador' ? 'Creá el marcador para tener la URL.' : kind === 'manual-sponsors' ? 'Creá el overlay de sponsors para tener la URL.' : 'Creá el titular para tener la URL.';
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
      if (conversion && kind !== 'partido') params.set('conversion', '60');
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
    } else if (kind === 'tabla' || kind === 'grupo') {
      path = `/overlay/${kind}`;
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
      path = `/overlay/manual/${manual?.id ?? (kind === 'manual-sponsors' ? 'demo-sponsors' : 'demo')}`;
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
      if (homeFull.trim()) params.set('local_largo', homeFull.trim());
      if (awayFull.trim()) params.set('visita_largo', awayFull.trim());
    }
    if (hasScoreboard(kind)) {
      if (clockMode !== 'normal') params.set('reloj', clockMode);
      if (!showCards) params.set('tarjetas', '0');
      if (celebration === 'cinta' && kind !== 'partido') params.set('festejo', 'cinta');
      if (showTries && kind !== 'partido') params.set('tries', '1');
      if (showPeriod && kind !== 'partido') params.set('periodo', '1');
      if (nameMode !== 'auto') params.set('nombres', nameMode);
    }
    if (!header && (kind === 'partido' || kind === 'escudos' || kind === 'franja' || kind === 'bloques')) params.set('encabezado', '0');
    if (position !== defaultPosition && position !== 'auto') params.set('pos', position);
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
    if (brand !== 'arriba-der') params.set('marca', brand);
    if (logo && rules.tournamentLogo && hasScoreboard(kind)) params.set('logo', logo);
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
    playerLink, newsLink, bracketView, side, formView, manual, manualStyle, plates, subs, conversion, celebration, showTries, showPeriod, nameMode, homeFull, awayFull, homeColor, awayColor,
    homeName, awayName, clockMode, showCards, header, position, defaultPosition, scale, cycle, showFor, hideFor, rows, rotate,
    background, title, fonts, customKind, customValue, customScale, options, brand, logo, rules.tournamentLogo]);

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
      params.set('local_nombre', teamAcronym(homeTeam.name, homeTeam.short));
      params.set('visita_nombre', teamAcronym(awayTeam.name, awayTeam.short));
      return demo(`/overlay/partido/demo?${params}`);
    }
    if (kind === 'manual-sponsors') {
      const params = new URLSearchParams(relative.split('?')[1] ?? '');
      params.set('forma', sponsorLayout);
      return demo(`/overlay/manual/demo-sponsors?${params}`);
    }
    return demo(relative);
  }, [missing, relative, kind, manualStyle, homeTeam, awayTeam, sponsorLayout]);

  /** El nombre con que se guarda en Mis overlays si no se escribe otro. */
  const defaultTitle = useMemo(() => {
    const short = (team: TeamInfo | null | undefined) => team?.short || team?.name || '';
    if (isMatchKind(kind) && match?.home && match?.away) return `${def.label} · ${short(match.home)} vs ${short(match.away)}`;
    if (kind === 'manual-marcador') return `${def.label} · ${short(homeTeam)} vs ${short(awayTeam)}`;
    if (kind === 'manual-titular' && headline.title.trim()) return `${def.label} · ${headline.title.trim()}`.slice(0, 120);
    if (tournament?.name && (needsTournament(kind) || kind === 'jugador')) return `${def.label} · ${tournament.name}`;
    return def.label;
  }, [kind, def.label, match, homeTeam, awayTeam, headline.title, tournament]);

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
    // La pestaña del panel se abre YA (en el clic): abrirla después del pedido la bloquea el navegador.
    const panelTab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    setCreating(true);
    setManualError(null);
    const team = (info: TeamInfo, players: string[]) => ({ name: info.name, short: info.short, color: info.color, logo: info.logo, players });
    const state = kind === 'manual-titular'
      ? { style: headlineStyle, items: [{ id: 'h1', ...headline }], current: 0 }
      : kind === 'manual-sponsors'
        ? { layout: sponsorLayout, surface: sponsorSurface, heading: sponsorHeading }
        : { sport: manualSport, title: manualTitle, home: team(homeTeam, homePlayers), away: team(awayTeam, awayPlayers), ...(manualClock ?? {}) };
    try {
      const response = await fetch('/api/overlay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Los ajustes del generador (estilo, colores, tipografías…) van al enlace de OBS.
        body: JSON.stringify({
          kind: kind === 'manual-titular' ? 'titular' : kind === 'manual-sponsors' ? 'sponsors' : 'marcador',
          state,
          title: defaultTitle,
          query: relative.split('?')[1] ?? '',
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(body?.error ?? 'No se pudo crear.');
      const created = body as ManualCreated & { link?: SavedLink | null };
      setManual({ id: created.id, key: created.key, kind: created.kind });
      // El enlace ya quedó en Mis overlays: desde ahora el editor guarda ENCIMA de ese.
      if (created.link?.id) {
        store.adopt(created.link);
        onSaved(created.link);
      }
      const panel = `/overlay/control/${created.id}#clave=${created.key}`;
      if (panelTab && !panelTab.closed) panelTab.location.href = panel;
    } catch (error: unknown) {
      panelTab?.close();
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
  const showsVisibility = kind !== 'manual-titular' && kind !== 'manual-sponsors';
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
    kind === 'manual-sponsors' && 'sponsors',
    showsVisibility && 'visible',
    isScoreboardStyle(kind) && 'colores',
    'marca',
  ].filter((item): item is string => Boolean(item));
  stepOrder.forEach((id, index) => numbers.set(id, index + 1));
  const n = (id: string) => numbers.get(id) ?? 0;

  return (
    <>
      <div className={styles.topbar}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <span aria-hidden="true">←</span> {saved ? 'Mis overlays' : 'Todos los gráficos'}
        </button>
        <div className={styles.topTitle}>
          <span>{saved ? `Editando · ${def.label}` : def.group.label}</span>
          <h1>{saved ? saved.title : def.label}</h1>
        </div>
        <div className={styles.topActions}>
          {canCreate ? (
            // Vuelve a la galería para empezar OTRO: no crea este (antes decía «Crear overlay» y confundía).
            <button type="button" className={styles.topCreate} onClick={onCreate}>
              <span aria-hidden="true">+</span> Otro<span className={styles.topCreateWord}>&nbsp;overlay</span>
            </button>
          ) : null}
          {isManual(kind) && !manual ? (
            <button
              type="button"
              className={styles.topCopy}
              onClick={() => void createManual()}
              disabled={creating || (kind === 'manual-titular' && !headline.title.trim())}
              title={kind === 'manual-titular' && !headline.title.trim() ? 'Escribí el título para crearlo.' : undefined}
            >
              {creating ? 'Creando…' : 'Crear y abrir el panel'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.topCopy}
              onClick={() => document.getElementById('guardar')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              disabled={Boolean(missing)}
              title={missing ?? undefined}
            >
              {saved ? 'Guardar cambios' : 'Guardar para OBS'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.controls}>
          {isScoreboardStyle(kind) ? (
            <div className={styles.styleRow} role="radiogroup" aria-label="Estilo del marcador">
              {SCOREBOARD_STYLES.map((item) => {
                const needs = requiredPlan(item.id);
                const locked = !planAtLeast(plan, needs);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={kind === item.id}
                    className={styles.styleChip}
                    disabled={locked}
                    title={locked ? `Con el plan ${PLAN_LABELS[needs]}` : undefined}
                    onClick={() => onStyle(item.id)}
                  >
                    {item.label}{locked ? ' · ' + PLAN_LABELS[needs] : ''}
                  </button>
                );
              })}
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
              {(kind === 'tabla' || kind === 'grupo') && tournament ? (
                <div className={styles.pair}>
                  <Field label="Fase">
                    <select value={phase} onChange={(e) => { setPhase(e.target.value); setGroup(''); }} disabled={!options}>
                      <option value="">La actual</option>
                      {options?.phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Zona">
                    <select value={group} onChange={(e) => setGroup(e.target.value)} disabled={!options || !filteredGroups.length}>
                      <option value="">{kind === 'grupo' ? 'La primera' : 'Todas'}</option>
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
                  {SCOREBOARD_STYLES.map((item) => {
                    const needs = requiredPlan(item.id);
                    const locked = !planAtLeast(plan, needs);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={manualStyle === item.id}
                        className={styles.styleChip}
                        disabled={locked}
                        title={locked ? `Con el plan ${PLAN_LABELS[needs]}` : undefined}
                        onClick={() => setManualStyle(item.id)}
                      >
                        {item.label}{locked ? ' · ' + PLAN_LABELS[needs] : ''}
                      </button>
                    );
                  })}
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

          {kind === 'manual-sponsors' ? (
            <Step n={n('sponsors')} title="Cómo se ve" hint="Los logos se suben después, desde el panel: cuatro niveles (Title, Main, Sponsor y Acompañante) y los tamaños se acomodan solos.">
              {manual ? <p className={styles.hint}>Ya está creado. La forma, el fondo y los logos se cambian desde el panel de control.</p> : (
                <>
                  <Segment
                    label="Forma"
                    value={sponsorLayout}
                    options={[['grilla', 'Grilla'], ['banda', 'Banda abajo'], ['esquina', 'Esquina']]}
                    onChange={setSponsorLayout}
                  />
                  <p className={styles.hint}>
                    {sponsorLayout === 'grilla' && 'Todos los niveles juntos en una placa: para la previa o el entretiempo.'}
                    {sponsorLayout === 'banda' && 'Una franja abajo que pasa de a un nivel por vez.'}
                    {sponsorLayout === 'esquina' && 'Un logo por vez en una esquina; el Title se queda más tiempo.'}
                  </p>
                  <Segment
                    label="Fondo de la placa"
                    value={sponsorSurface}
                    options={[['oscuro', 'Oscuro G22'], ['claro', 'Claro']]}
                    onChange={setSponsorSurface}
                  />
                  <Field label="Título de la grilla (opcional)">
                    <input value={sponsorHeading} onChange={(e) => setSponsorHeading(e.target.value)} maxLength={60} placeholder="Gracias a nuestros sponsors" />
                  </Field>
                </>
              )}
            </Step>
          ) : null}

          {isManual(kind) ? (
            <div className={styles.createBox}>
              {manual ? (
                <>
                  <p>
                    <b>Listo.</b>{' '}
                    {kind === 'manual-sponsors'
                      ? 'Ahora abrí el panel y subí los PNG en cada nivel (Title, Main, Sponsor, Acompañante). La vista previa se actualiza sola.'
                      : 'Desde el panel de control lo manejás: puntos, reloj, tarjetas y anotadores (o los textos del titular). Anda en el celular.'}
                  </p>
                  {manual.key ? (
                    <>
                      <div className={styles.createActions}>
                        <a className={styles.primary} href={panelUrl} target="_blank" rel="noreferrer">Abrir el panel de control</a>
                        <button type="button" className={styles.secondary} onClick={() => void copy(panelUrl, 'panel')}>{copied === 'panel' ? 'Link copiado' : 'Copiar link del panel'}</button>
                      </div>
                      <p className={styles.hint}>El link del panel lleva la clave: quien lo tenga puede manejarlo. Guardalo.</p>
                    </>
                  ) : (
                    <>
                      <div className={styles.createActions}>
                        <a className={styles.primary} href={`/overlay/control/${manual.id}`} target="_blank" rel="noreferrer">Abrir el panel de control</a>
                      </div>
                      <p className={styles.hint}>El panel se abre con tu cuenta de G22. Acá cambiás cómo se ve al aire; «Guardar cambios» lo pasa a OBS con la misma URL.</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className={styles.primary} onClick={() => void createManual()} disabled={creating || (kind === 'manual-titular' && !headline.title.trim())}>
                    {creating ? 'Creando…' : kind === 'manual-marcador' ? 'Crear el marcador' : kind === 'manual-sponsors' ? 'Crear y subir los logos' : 'Crear el titular'}
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
                  {kind !== 'partido' ? <Check label="Contador de tries de cada equipo" checked={showTries} onChange={setShowTries} /> : null}
                  {kind !== 'partido' ? <Check label="Período junto al reloj (1T, 2T)" checked={showPeriod} onChange={setShowPeriod} disabled={clockMode === 'oculto'} /> : null}
                  {kind === 'manual-marcador' ? (
                    <Segment
                      label="Cómo se escriben los clubes"
                      value={nameMode}
                      options={[['auto', 'Automático'], ['siglas', 'Siglas'], ['completo', 'Nombre completo']]}
                      onChange={setNameMode}
                    />
                  ) : null}
                  {kind !== 'partido' ? (
                    <Segment
                      label="Festejo del tanto"
                      value={celebration}
                      options={[['marcador', 'Sobre el marcador'], ['cinta', 'Cinta a lo ancho']]}
                      onChange={setCelebration}
                    />
                  ) : null}
                </>
              ) : null}
              {isScoreboardStyle(kind) ? (
                <>
                  <Check label="Placa de quien anota (try, penal, tarjeta)" checked={plates} onChange={setPlates} />
                  <Check label="Placa de los cambios" checked={subs} onChange={setSubs} disabled={!plates} />
                  {kind !== 'partido' ? (
                    <Check label="Shot clock después de cada try (1:00)" checked={conversion} onChange={setConversion} />
                  ) : null}
                </>
              ) : null}
              {kind === 'manual-marcador' ? (
                <p className={styles.hint}>La cuenta de la conversión y las cuentas propias (TMO, tiempo médico) se manejan desde el panel.</p>
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
            <Step n={n('colores')} title={rules.colors ? 'Colores y nombres' : 'Nombres'} hint="Vacío = el color del club en G22, su nombre y la sigla que sale de él.">
              <Segment
                label="Cómo se escriben los clubes"
                value={nameMode}
                options={[['auto', 'Automático'], ['siglas', 'Siglas (MAR)'], ['completo', 'Nombre completo']]}
                onChange={setNameMode}
              />
              <p className={styles.hint}>
                {nameMode === 'auto'
                  ? 'Siglas en los marcadores chicos y el nombre completo en los anchos (zócalo, cápsula, línea, presentación).'
                  : nameMode === 'siglas'
                    ? 'La sigla en todos los marcadores.'
                    : 'El nombre completo en todos. En los marcadores chicos, un nombre largo se corta con puntos suspensivos.'}
              </p>
              <div className={styles.teams}>
                <ColorName label="Local" colors={rules.colors} color={homeColor} fallback={match?.home?.color ?? '#00a365'} onColor={setHomeColor} name={homeName} placeholder={teamAcronym(homeFull || match?.home?.name, match?.home?.short) || 'LOC'} onName={setHomeName} fullName={homeFull} fullPlaceholder={match?.home?.name ?? 'Nombre del club'} onFullName={setHomeFull} />
                <ColorName label="Visitante" colors={rules.colors} color={awayColor} fallback={match?.away?.color ?? '#2563eb'} onColor={setAwayColor} name={awayName} placeholder={teamAcronym(awayFull || match?.away?.name, match?.away?.short) || 'VIS'} onName={setAwayName} fullName={awayFull} fullPlaceholder={match?.away?.name ?? 'Nombre del club'} onFullName={setAwayFull} />
              </div>
              {!rules.colors ? (
                <PlanLock needs="colores">Con tu plan los marcadores salen con los colores de G22. Con el plan Colores elegís el color de cada club.</PlanLock>
              ) : null}
            </Step>
          ) : null}

          <Step n={n('marca')} title="Marca y logo" hint="G22 Scores apoya la transmisión: su marca sale arriba o abajo a la derecha.">
            <Segment
              label="Marca de G22"
              value={brand}
              options={[['arriba-der', 'Arriba a la derecha'], ['abajo-der', 'Abajo a la derecha'], ...(rules.hideBrand ? [['no', 'Sin marca'] as [BrandPosition, string]] : [])]}
              onChange={setBrand}
            />
            {!rules.hideBrand ? <p className={styles.hint}>Sacar la marca de G22 es del plan Premium.</p> : null}
            {hasScoreboard(kind) ? (
              rules.tournamentLogo ? (
                <TournamentLogoField logo={logo} onLogo={setLogo} tournamentLogo={tournament?.logo ?? null} />
              ) : (
                <PlanLock needs="premium">El logo del torneo en el marcador es del plan Premium. Con tu plan va el logo de G22.</PlanLock>
              )
            ) : null}
          </Step>

          <details className={styles.advanced}>
            <summary>Tipografías{rules.fonts ? '' : ' · plan Colores'}</summary>
            <div className={styles.advancedBody}>
              {!rules.fonts ? (
                <PlanLock needs="colores">Con tu plan los gráficos usan las tipografías de G22. Con el plan Colores elegís las tuyas.</PlanLock>
              ) : null}
              {rules.fonts ? <>
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
              </> : null}
            </div>
          </details>

          <details className={styles.advanced}>
            <summary>Ubicación, tamaño y fondo</summary>
            <div className={styles.advancedBody}>
              <Field label="Posición en pantalla">
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {kind === 'manual-sponsors' ? <option value="auto">Automática (según la forma)</option> : null}
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
          <div id="guardar">
            <SaveLink relative={relative} missing={missing} origin={origin} defaultTitle={defaultTitle} store={store} editing={saved} onSaved={onSaved} allowNew={canCreate} />
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

function ColorName({ label, color, fallback, onColor, name, placeholder, onName, fullName, fullPlaceholder, onFullName, colors = true }: {
  label: string; color: string; fallback: string; onColor: (value: string) => void; name: string; placeholder: string; onName: (value: string) => void;
  fullName: string; fullPlaceholder: string; onFullName: (value: string) => void;
  /** Sin el plan de colores, solo los nombres. */
  colors?: boolean;
}) {
  const safeFallback = /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#00a365';
  return (
    <div className={styles.team}>
      <span className={styles.teamLabel}>{label}</span>
      {colors ? (
        <div className={styles.colorRow}>
          <input type="color" value={color || safeFallback} onChange={(e) => onColor(e.target.value)} aria-label={`Color ${label.toLowerCase()}`} />
          {color ? <button type="button" className={styles.linkButton} onClick={() => onColor('')}>Usar el del club</button> : <span className={styles.hint}>El del club</span>}
        </div>
      ) : null}
      <Field label="Nombre completo">
        <input value={fullName} maxLength={40} placeholder={fullPlaceholder} onChange={(e) => onFullName(e.target.value)} />
      </Field>
      <Field label="Sigla (3 letras)">
        <input value={name} maxLength={4} placeholder={placeholder} onChange={(e) => onName(e.target.value.toUpperCase())} />
      </Field>
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

/** Lo que el plan no incluye: qué falta y con qué plan se destraba. */
function PlanLock({ needs, children }: { needs: OverlayPlan; children: ReactNode }) {
  return (
    <p className={styles.planLock}>
      <span className={styles.planBadge} data-plan={needs}>Plan {PLAN_LABELS[needs]}</span>
      {children}
    </p>
  );
}

/**
 * El logo del torneo (premium): se sube un PNG o se pega el link. Sin logo
 * propio, al aire va el del torneo en G22 si lo tiene; si no, el de G22.
 */
function TournamentLogoField({ logo, onLogo, tournamentLogo }: { logo: string; onLogo: (url: string) => void; tournamentLogo: string | null }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const response = await fetch('/api/overlay/logo-torneo', { method: 'POST', body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error(body?.error ?? 'No se pudo subir el logo.');
      onLogo(String(body.url));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir el logo.');
    } finally {
      setUploading(false);
    }
  };

  const shown = logo || tournamentLogo;
  return (
    <div className={styles.logoField}>
      <span className={styles.logoLabel}>Logo del torneo en el marcador</span>
      <div className={styles.logoRow}>
        <span className={styles.logoPreview}>
          {shown ? <img src={shown} alt="Logo del torneo elegido" /> : <img src="/header-logo.png" alt="Logo de G22 (sin logo de torneo)" />}
        </span>
        <div className={styles.logoActions}>
          <label className={styles.secondary}>
            {uploading ? 'Subiendo…' : logo ? 'Cambiar el PNG' : 'Subir un PNG'}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              hidden
              disabled={uploading}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }}
            />
          </label>
          {logo ? <button type="button" className={styles.linkButton} onClick={() => onLogo('')}>Sacar el logo</button> : null}
        </div>
      </div>
      <p className={styles.hint}>
        {logo
          ? 'Sale en los marcadores que llevan logo (cuadro, paneles, pestaña, presentación) y chico junto al reloj en los demás.'
          : tournamentLogo
            ? 'Sin subir nada se usa el logo del torneo en G22.'
            : 'Sin logo de torneo va el de G22. PNG con fondo transparente, hasta 4 MB.'}
      </p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
