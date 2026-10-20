'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { GrupoDeTipo, SeccionDeLista } from '@/lib/leagueRegions';
import { MARCAS_DE_UNION } from '@/lib/unionBrand';
import { COLORES_DE_BANDERA } from '@/lib/flagColors';
import { findCountryRecord, getCountryFlagCode } from '@/lib/data/countries';
import CountryFlag from '@/components/CountryFlag';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import { competitionLogoByName } from '@/lib/competitionLogos';
import { saveLastDirectoryHref } from '@/lib/recentTournaments';
import styles from './LeagueDrilldown.module.css';

/**
 * El selector de ligas como navegación por NIVELES, no como acordeón.
 *
 *   países  ->  uniones (o confederaciones)  ->  competiciones  ->  grados de una familia
 *
 * Cada nivel reemplaza al anterior y trae una barra para volver. La pantalla nunca
 * muestra más que un nivel de opciones a la vez, que es lo que el acordeón no podía
 * evitar: abrir Argentina volcaba cientos de filas debajo del país.
 *
 * Todo lo que se toca es un BLOQUE del mismo diseño —país, unión, competición—: una
 * marca (bandera o logo) sobre un degradé con los colores de esa marca. Una
 * competición toma los colores de su unión, así que las de una misma unión se leen
 * como familia aunque comparten el logo.
 *
 * Adentro de una unión, la lista se parte en Competiciones / Reserva / Juveniles
 * (`gruposPorTipo`): lo que antes eran pestañas de la pantalla.
 */

export interface MiembroNavegable {
  id: string;
  label: string;
  detalle: string | null;
}

/** Lo mínimo que el navegador necesita saber de una competición para dibujarla. */
export interface Navegable {
  id: string;
  name: string;
  familyMembers?: MiembroNavegable[];
  unionId?: string | null;
  logoUrl?: string | null;
  seasonId?: string | null;
  scope?: string | null;
}

export interface DrillCountry<T> {
  id: string;
  name: string;
  /** Null cuando todavía no se sabe el número real: es mejor no ponerlo que aproximarlo. */
  count: number | null;
  loading: boolean;
  error: string | null;
  notice?: string | null;
  /** Las uniones del país; null o una sola = el país muestra sus competiciones directo. */
  sections: Array<SeccionDeLista<T>> | null;
  /** La lista del país partida en Competiciones / Reserva / Juveniles (cuando no hay uniones). */
  groups?: Array<GrupoDeTipo<T>>;
  tournaments: T[];
}

interface LeagueDrilldownProps<T extends Navegable> {
  countries: Array<DrillCountry<T>>;
  /** Con búsqueda activa, los resultados de todos los países en una lista plana. */
  searchResults: T[] | null;
  /** A dónde lleva una competición (cada pantalla sabe armar su enlace). */
  hrefFor: (tournament: T) => string;
  isFavorite: (tournament: T) => boolean;
  /** Etiqueta de temporada cuando no es la en curso ("2018"); null si no aporta. */
  seasonLabel?: (tournament: T) => string | null;
  /** Se llama al entrar a un país: ahí la pantalla dispara la carga de sus ligas. */
  onOpenCountry: (countryId: string) => void;
  /** Profundidad actual (0 = países). La pantalla la usa para ocultar lo que sobra. */
  onDepthChange?: (depth: number) => void;
  /** Cómo se llama el nivel de países en el botón de volver ("Rugby"). */
  rootLabel: string;
  emptyMessage: ReactNode;
  /**
   * Guardar el nivel en la URL (`?nivel=`). Con esto el botón Atrás del
   * teléfono vuelve un nivel —antes sacaba de la pantalla—, una recarga no
   * manda al principio y "los torneos de la URBA" se pueden compartir.
   * Solo la pantalla de Torneos lo pide: en la barra lateral del inicio
   * ensuciaría la URL de la portada.
   */
  syncWithUrl?: boolean;
}

type Step = { kind: 'country' | 'section' | 'family'; id: string };

const URL_PARAM = 'nivel';
const STEP_KINDS = new Set<Step['kind']>(['country', 'section', 'family']);

function parseSteps(value: string | null): Step[] {
  if (!value) return [];
  const steps: Step[] = [];
  for (const segment of value.split('/')) {
    const colon = segment.indexOf(':');
    if (colon <= 0) return [];
    const kind = segment.slice(0, colon) as Step['kind'];
    if (!STEP_KINDS.has(kind)) return [];
    try {
      steps.push({ kind, id: decodeURIComponent(segment.slice(colon + 1)) });
    } catch {
      return [];
    }
  }
  return steps;
}

function serializeSteps(steps: Step[]): string {
  return steps.map((step) => `${step.kind}:${encodeURIComponent(step.id)}`).join('/');
}

function readStepsFromUrl(): Step[] {
  if (typeof window === 'undefined') return [];
  return parseSteps(new URL(window.location.href).searchParams.get(URL_PARAM));
}

/** pushState nativo: Next lo refleja en useSearchParams sin re-renderizar la ruta. */
function writeStepsToUrl(steps: Step[], mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  if (steps.length > 0) url.searchParams.set(URL_PARAM, serializeSteps(steps));
  else url.searchParams.delete(URL_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  saveLastDirectoryHref(`${url.pathname}${url.search}`);
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (mode === 'push') window.history.pushState(window.history.state, '', next);
  else window.history.replaceState(window.history.state, '', next);
}

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** "Unión Argentina de Rugby" -> "UAR": las mayúsculas de cada palabra, hasta tres. */
const iniciales = (name: string): string =>
  name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).map((w) => w[0]).join('').slice(0, 3) || name.slice(0, 2).toUpperCase();

const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const Chevron = ({ dir, size = 16 }: { dir: 'left' | 'right'; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d={dir === 'right' ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
  </svg>
);

/** El bloque de "Regionales": una brújula, que no es de ninguna unión en particular. */
const IconoRegional = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
);

/**
 * El aspecto de un bloque: marca a la izquierda y degradé con los colores de esa
 * marca. Sin mosaico detrás: la sombra clara del logo es lo que mantiene a la vista
 * los escudos de trazo negro o gris sobre fondo oscuro.
 */
interface Look {
  tile: ReactNode;
  title: string;
  meta: string | null;
  star?: boolean;
  c1?: string;
  /** Null: el degradé usa una variante apagada del primero. */
  c2?: string | null;
}

const estiloDelDegrade = (look: Look, suave = false): CSSProperties | undefined => {
  if (!look.c1) return undefined;
  const k = suave ? 0.75 : 1;
  return {
    background: `linear-gradient(115deg, ${rgba(look.c1, 0.5 * k)} 0%, ${rgba(look.c2 ?? look.c1, (look.c2 ? 0.2 : 0.08) * k)} 100%), var(--color-bg-secondary)`,
    borderColor: rgba(look.c1, 0.5 * k),
  };
};

const imagen = (src: string, size: number) => (
  // Decorativa: el nombre ya está escrito al lado.
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="" width={size} height={size} loading="lazy" />
);

function lookDeUnion(section: SeccionDeLista<unknown>): Look {
  if (section.kind === 'regionales') {
    return {
      tile: <IconoRegional />,
      title: section.title,
      meta: cuenta(section.tournaments.length, 'competición', 'competiciones'),
      c1: '#22c55e',
      c2: '#0ea5e9',
    };
  }
  const marca = section.unionId ? MARCAS_DE_UNION[section.unionId] : undefined;
  return {
    tile: marca ? imagen(marca.logo, 40) : <span className={styles.initials}>{iniciales(section.title)}</span>,
    title: section.title,
    meta: cuenta(section.tournaments.length, 'competición', 'competiciones'),
    c1: marca?.c1,
    c2: marca?.c2,
  };
}

/** Internacional y los continentes: un mapa en vez de bandera, con el color de cada mapa. */
const MARCAS_DE_CONTINENTE: Record<string, { logo: string; c1: string }> = {
  international: { logo: '/continentes/international.png', c1: '#a78bfa' },
  africa: { logo: '/continentes/africa.png', c1: '#f59e0b' },
  asia: { logo: '/continentes/asia.png', c1: '#ef4444' },
  europe: { logo: '/continentes/europe.png', c1: '#3b82f6' },
  'north-central-america': { logo: '/continentes/north-central-america.png', c1: '#22c55e' },
  oceania: { logo: '/continentes/oceania.png', c1: '#06b6d4' },
  'south-america': { logo: '/continentes/south-america.png', c1: '#eab308' },
};

function lookDePais(country: DrillCountry<unknown>): Look {
  const continente = MARCAS_DE_CONTINENTE[country.id];
  if (continente) {
    return {
      tile: imagen(continente.logo, 40),
      title: country.name,
      meta: country.count !== null ? cuenta(country.count, 'competición', 'competiciones') : null,
      c1: continente.c1,
      c2: null,
    };
  }
  const code = getCountryFlagCode(findCountryRecord(country.id, country.name));
  const colores = code ? COLORES_DE_BANDERA[code] : undefined;
  // La misma bandera recortada que se ve en los resultados; si el país no la tiene, la SVG.
  const recortada = getNationalTeamFlag(country.name) ?? getNationalTeamFlag(country.id);
  return {
    tile: recortada ? imagen(recortada, 46) : <CountryFlag countryId={country.id} countryName={country.name} size={34} />,
    title: country.name,
    meta: country.sections && country.sections.length >= 2
      ? cuenta(country.sections.length, 'sección', 'secciones')
      : country.count !== null ? cuenta(country.count, 'competición', 'competiciones') : null,
    c1: colores?.c1,
    c2: colores?.c2,
  };
}

/** Una competición (o familia): el logo propio si es uno curado, si no el de su unión. */
function lookDeTorneo(t: Navegable, extra: { favorito: boolean; temporada: string | null }): Look {
  const marca = t.unionId ? MARCAS_DE_UNION[t.unionId] : undefined;
  // Sólo los logos curados de /competiciones son transparentes; los demás (subidos a
  // mano) traen fondo y quedarían como un cuadrado blanco sobre el degradé.
  const propio = t.logoUrl && (t.logoUrl.startsWith('/competiciones/') || t.logoUrl.startsWith('/uniones/')) ? t.logoUrl : null;
  const logo = propio ?? competitionLogoByName(t.name) ?? marca?.logo ?? null;
  const meta = t.familyMembers
    ? cuenta(t.familyMembers.length, 'división', 'divisiones')
    : t.scope === 'regional' ? 'Regional' : extra.temporada;
  return {
    tile: logo ? imagen(logo, 40) : <span className={styles.initials}>{iniciales(t.name)}</span>,
    title: t.name,
    meta,
    star: extra.favorito,
    c1: marca?.c1,
    c2: marca?.c2,
  };
}

function BloqueContenido({ look }: { look: Look }) {
  return (
    <>
      {look.tile !== null && <span className={styles.tile} aria-hidden="true">{look.tile}</span>}
      <span className={styles.blockText}>
        <span className={styles.blockTitle}>{look.star ? '★ ' : ''}{look.title}</span>
        {look.meta && <span className={styles.blockMeta}>{look.meta}</span>}
      </span>
      <span className={styles.rowTail}><Chevron dir="right" /></span>
    </>
  );
}

function Block({ look, compact, suave, onOpen, href }: {
  look: Look; compact?: boolean; suave?: boolean; onOpen?: () => void; href?: string;
}) {
  const className = `${styles.block} ${compact ? styles.blockCompact : ''}`;
  const style = estiloDelDegrade(look, suave);
  return href
    ? <Link href={href} className={className} style={style}><BloqueContenido look={look} /></Link>
    : <button type="button" className={className} style={style} onClick={onOpen}><BloqueContenido look={look} /></button>;
}

export default function LeagueDrilldown<T extends Navegable>({
  countries,
  searchResults,
  hrefFor,
  isFavorite,
  seasonLabel,
  onOpenCountry,
  onDepthChange,
  rootLabel,
  emptyMessage,
  syncWithUrl = false,
}: LeagueDrilldownProps<T>) {
  const [path, setPath] = useState<Step[]>([]);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const pathRef = useRef<Step[]>([]);
  pathRef.current = path;
  // Cuántos niveles empujó ESTA visita al historial: solo esos se deshacen con
  // history.back(). Si se entró directo a ?nivel=..., volver no puede sacar
  // de la página: se reemplaza la URL por el nivel de arriba.
  const pushedRef = useRef(0);
  const onOpenCountryRef = useRef(onOpenCountry);
  onOpenCountryRef.current = onOpenCountry;
  // Un camino que llega por URL (recarga, link compartido) se sostiene hasta
  // que el país termina de cargar sus uniones: antes de eso la sección todavía
  // no existe y el camino se descartaba por "roto". Con tope de tiempo, para no
  // quedar esperando un país que nunca carga.
  //   waiting: se pidió el país, todavía no empezó a cargar
  //   loading: el país está cargando
  //   idle:    no hay nada que esperar
  const [restoreState, setRestoreState] = useState<'idle' | 'waiting' | 'loading'>('idle');

  const push = useCallback((step: Step) => {
    setDirection('forward');
    const next = [...pathRef.current, step];
    if (syncWithUrl) {
      writeStepsToUrl(next, 'push');
      pushedRef.current += 1;
    }
    setPath(next);
  }, [syncWithUrl]);
  const back = useCallback(() => {
    if (syncWithUrl && pushedRef.current > 0) {
      // popstate pone el nivel; así el botón de la pantalla y el del
      // teléfono hacen exactamente lo mismo.
      window.history.back();
      return;
    }
    setDirection('back');
    const next = pathRef.current.slice(0, -1);
    if (syncWithUrl) writeStepsToUrl(next, 'replace');
    setPath(next);
  }, [syncWithUrl]);

  // El nivel sale de la URL al entrar y cada vez que se navega con Atrás /
  // Adelante. Al país del camino se le pide su carga, como si se lo tocara.
  useEffect(() => {
    if (!syncWithUrl) return;
    const apply = (dir: 'forward' | 'back') => {
      const steps = readStepsFromUrl();
      const countryStep = steps.find((step) => step.kind === 'country');
      if (countryStep) onOpenCountryRef.current(countryStep.id);
      saveLastDirectoryHref(`${window.location.pathname}${window.location.search}`);
      setDirection(dir);
      setPath(steps);
    };
    let giveUp: number | undefined;
    if (readStepsFromUrl().length > 0) {
      setRestoreState('waiting');
      giveUp = window.setTimeout(() => setRestoreState('idle'), 10000);
    }
    apply('forward');
    const onPop = () => {
      pushedRef.current = Math.max(0, pushedRef.current - 1);
      apply(readStepsFromUrl().length < pathRef.current.length ? 'back' : 'forward');
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.clearTimeout(giveUp);
      window.removeEventListener('popstate', onPop);
    };
  }, [syncWithUrl]);

  useEffect(() => { onDepthChange?.(path.length); }, [path.length, onDepthChange]);

  // El foco va al título del nivel nuevo, para que el lector de pantalla anuncie
  // dónde está; la primera vez no, así no se roba el foco al cargar.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    // El nivel nuevo es más corto que el anterior: si la vista quedó más abajo del
    // inicio del selector, se sube; si no, no se mueve nada.
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    titleRef.current?.focus({ preventScroll: true });
  }, [path.length]);

  // Si el país o la sección del camino ya no existen (cambió el filtro), se vuelve
  // a donde se pueda en vez de mostrar una pantalla vacía.
  const country = path[0] ? countries.find((c) => c.id === path[0].id) ?? null : null;
  const section = path[1]?.kind === 'section' ? country?.sections?.find((s) => s.key === path[1].id) ?? null : null;
  const listaActual = section
    ? (section.groups?.flatMap((g) => g.tournaments) ?? section.tournaments)
    : (country?.groups?.flatMap((g) => g.tournaments) ?? country?.tournaments ?? []);
  const familyStep = path.find((s) => s.kind === 'family');
  const family = familyStep ? listaActual.find((t) => t.id === familyStep.id) ?? null : null;

  const valid = path.length === 0
    || (!!country
      && (path.length < 2 || path[1].kind !== 'section' || !!section)
      && (!familyStep || !!family));
  // Entrando por URL, el país todavía puede estar cargando (o la lista de
  // países vacía): eso no es un camino roto, es un camino que llega.
  const countryLoading = !!country?.loading;
  useEffect(() => {
    if (restoreState === 'waiting' && countryLoading) setRestoreState('loading');
    else if (restoreState === 'loading' && !countryLoading) setRestoreState('idle');
  }, [countryLoading, restoreState]);
  const pending = path.length > 0 && (countries.length === 0 || countryLoading || restoreState !== 'idle');
  useEffect(() => {
    if (valid) {
      if (path.length > 0 && restoreState !== 'idle') setRestoreState('idle');
      return;
    }
    if (pending) return;
    setDirection('back');
    setPath([]);
    if (syncWithUrl) writeStepsToUrl([], 'replace');
  }, [path.length, pending, restoreState, syncWithUrl, valid]);

  const openCountry = (id: string) => {
    onOpenCountry(id);
    push({ kind: 'country', id });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && path.length > 0) {
      event.stopPropagation();
      back();
    }
  };

  const viewKey = useMemo(() => path.map((s) => `${s.kind}:${s.id}`).join('>') || 'root', [path]);

  const renderLeaf = (t: T) => {
    const look = lookDeTorneo(t, { favorito: isFavorite(t), temporada: seasonLabel?.(t) ?? null });
    return t.familyMembers
      ? <Block key={t.id} look={look} suave compact onOpen={() => push({ kind: 'family', id: t.id })} />
      : <Block key={t.id} look={look} suave compact href={hrefFor(t)} />;
  };

  const renderList = (list: T[]) => list.map(renderLeaf);

  /** Las tres secciones (Competiciones / Reserva / Juveniles), con título si hay más de una. */
  const renderGroups = (groups: Array<GrupoDeTipo<T>> | undefined, plano: T[]) => {
    if (!groups || groups.length === 0) return renderList(plano);
    const conTitulo = groups.length > 1 || groups[0].key !== 'competiciones';
    return groups.map((g) => (
      <div key={g.key}>
        {conTitulo && <div className={styles.eyebrow}>{g.title}</div>}
        {renderList(g.tournaments)}
      </div>
    ));
  };

  // ── qué se dibuja ──────────────────────────────────────────────────────────
  let body: ReactNode;
  let title: string | null = null;
  let banner: Look | null = null;
  let backLabel = rootLabel;

  if (searchResults) {
    body = searchResults.length > 0 ? renderList(searchResults) : <div className={styles.note}>{emptyMessage}</div>;
  } else if (!valid && pending) {
    // El camino de la URL todavía está llegando: esqueleto, no la lista de
    // países (que parpadeaba antes de saltar al nivel pedido).
    body = (
      <div className={styles.skeleton} role="status" aria-label="Cargando torneos">
        <span className={styles.skeletonRow} /><span className={styles.skeletonRow} /><span className={styles.skeletonRow} />
      </div>
    );
  } else if (path.length === 0 || !valid) {
    body = countries.length > 0
      ? countries.map((c) => <Block key={c.id} compact look={lookDePais(c)} onOpen={() => openCountry(c.id)} />)
      : <div className={styles.note}>{emptyMessage}</div>;
  } else if (family) {
    const look = lookDeTorneo(family, { favorito: false, temporada: null });
    title = family.name;
    banner = look;
    backLabel = section?.title ?? country?.name ?? rootLabel;
    body = (family.familyMembers ?? []).map((m) => (
      <Block
        key={m.id}
        look={{ ...look, tile: null, title: m.detalle ? `${m.label} · ${m.detalle}` : m.label, meta: null, star: false }}
        compact
        suave
        href={`/tournaments/${m.id}`}
      />
    ));
  } else if (section) {
    title = section.title;
    banner = lookDeUnion(section);
    backLabel = country?.name ?? rootLabel;
    body = renderGroups(section.groups, section.tournaments);
  } else if (country) {
    title = country.name;
    banner = lookDePais(country);
    backLabel = rootLabel;
    const useSections = (country.sections?.length ?? 0) >= 2;
    if (country.loading && country.tournaments.length === 0) {
      body = (
        <div className={styles.skeleton} role="status" aria-label="Cargando ligas">
          <span className={styles.skeletonRow} /><span className={styles.skeletonRow} /><span className={styles.skeletonRow} />
        </div>
      );
    } else if (country.error && country.tournaments.length === 0) {
      body = <div className={styles.note}>{country.error}</div>;
    } else if (useSections) {
      let lastEyebrow: string | null | undefined;
      body = (
        <>
          {country.notice && <div className={styles.note}>{country.notice}</div>}
          {country.sections!.map((s) => {
            const heading = s.eyebrow !== lastEyebrow && s.eyebrow ? <div className={styles.eyebrow}>{s.eyebrow}</div> : null;
            lastEyebrow = s.eyebrow;
            return (
              <div key={s.key}>
                {heading}
                <Block look={lookDeUnion(s)} onOpen={() => push({ kind: 'section', id: s.key })} />
              </div>
            );
          })}
        </>
      );
    } else {
      body = (
        <>
          {country.notice && <div className={styles.note}>{country.notice}</div>}
          {country.tournaments.length > 0 ? renderGroups(country.groups, country.tournaments) : <div className={styles.note}>{emptyMessage}</div>}
        </>
      );
    }
  }

  const showBar = !searchResults && path.length > 0 && valid;

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={onKeyDown}>
      {showBar && (
        <div className={styles.bar}>
          <button type="button" className={styles.back} onClick={back} aria-label={`Volver a ${backLabel}`}>
            <Chevron dir="left" size={22} />
            {backLabel}
          </button>
          {banner ? (
            <div className={`${styles.block} ${styles.banner}`} style={estiloDelDegrade(banner)}>
              <span className={styles.tile} aria-hidden="true">{banner.tile}</span>
              <span className={styles.blockText}>
                <h3 className={styles.bannerTitle} ref={titleRef} tabIndex={-1}>{banner.title}</h3>
                {banner.meta && <span className={styles.blockMeta}>{banner.meta}</span>}
              </span>
            </div>
          ) : (
            <h3 className={styles.title} ref={titleRef} tabIndex={-1}>{title}</h3>
          )}
        </div>
      )}
      <div key={viewKey} className={direction === 'back' ? styles.viewBack : styles.view}>
        {body}
      </div>
    </div>
  );
}
