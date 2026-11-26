'use client';

/* eslint-disable @next/next/no-img-element -- escudos chicos del proxy de logos. */

import { useEffect, useState } from 'react';
import type { OverlaySearchClub, OverlaySearchMatch, OverlaySearchResult, OverlaySearchTournament } from '@/lib/server/overlaySearch';
import { UUID_RE, idFrom } from './catalog';
import styles from './studio.module.css';

/**
 * Buscadores del generador y del panel manual: se escribe un nombre ("Olivos",
 * "Top 12") y aparecen los clubes, sus partidos cercanos y los torneos. Pegar
 * el link sigue andando: si lo escrito termina en un ID, se ofrece usarlo.
 */

export type { OverlaySearchClub, OverlaySearchMatch, OverlaySearchTournament };

const EMPTY: OverlaySearchResult = { clubs: [], matches: [], tournaments: [] };

export function useOverlaySearch(query: string) {
  const [result, setResult] = useState<OverlaySearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const term = query.trim();
  const searchable = term.length >= 2 && !/^https?:\/\//i.test(term) && !UUID_RE.test(term);

  useEffect(() => {
    if (!searchable) {
      setResult(EMPTY);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    // Un respiro entre teclas: no se busca por cada letra.
    const timer = window.setTimeout(() => {
      fetch(`/api/overlay?tipo=buscar&q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : EMPTY))
        .then((body: OverlaySearchResult) => setResult(body ?? EMPTY))
        .catch(() => { if (!controller.signal.aborted) setResult(EMPTY); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, searchable]);

  return { result, loading, searchable };
}

/** "sáb 28/11 · 16:30" en hora de Buenos Aires. */
export function matchWhen(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day}/${parts.month} · ${parts.hour}:${parts.minute}`;
}

const STATUS_LABEL: Record<string, string> = { live: 'En vivo', final: 'Final', finished: 'Final', scheduled: '' };

export function Crest({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={styles.crestFallback} style={{ width: size, height: size }} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
  }
  return <img src={src} alt="" width={size} height={size} loading="lazy" className={styles.crest} onError={() => setFailed(true)} />;
}

function MatchRow({ match, onPick, actionLabel }: { match: OverlaySearchMatch; onPick: () => void; actionLabel: string }) {
  const status = STATUS_LABEL[match.status] ?? '';
  return (
    <li>
      <button type="button" className={styles.result} onClick={onPick} aria-label={`${actionLabel}: ${match.home.name} contra ${match.away.name}`}>
        <span className={styles.resultTeams}>
          <span className={styles.resultTeam}><Crest src={match.home.logo} name={match.home.name} size={22} />{match.home.name}</span>
          <span className={styles.resultVs}>vs</span>
          <span className={styles.resultTeam}><Crest src={match.away.logo} name={match.away.name} size={22} />{match.away.name}</span>
        </span>
        <span className={styles.resultMeta}>
          {status ? <b data-live={match.status === 'live' ? '' : undefined}>{status}</b> : null}
          {matchWhen(match.dateTime)}
          {match.tournament ? ` · ${match.tournament}` : ''}
          {match.context ? ` · ${match.context}` : ''}
        </span>
      </button>
    </li>
  );
}

/**
 * Elegir un partido de G22: por nombre de club o pegando el link. `onPick`
 * recibe el ID y, si salió del buscador, el partido con sus equipos.
 */
export function MatchPicker({
  onPick,
  placeholder = 'Buscá un club (ej. Olivos) o pegá el link del partido',
  actionLabel = 'Elegir',
}: {
  onPick: (id: string, match: OverlaySearchMatch | null) => void;
  placeholder?: string;
  actionLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const { result, loading, searchable } = useOverlaySearch(query);
  const linkId = idFrom(query);
  const isLink = UUID_RE.test(linkId);

  return (
    <div className={styles.picker}>
      <input
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label="Buscar partido"
        autoComplete="off"
      />
      {isLink ? (
        <button type="button" className={styles.linkPick} onClick={() => { onPick(linkId, null); setQuery(''); }}>
          Usar el partido de este link
        </button>
      ) : null}
      {searchable ? (
        loading && !result.matches.length ? <p className={styles.searchNote}>Buscando…</p>
          : result.matches.length ? (
            <ul className={styles.results}>
              {result.matches.map((match) => (
                <MatchRow key={match.id} match={match} actionLabel={actionLabel} onPick={() => { onPick(match.id, match); setQuery(''); }} />
              ))}
            </ul>
          ) : (
            <p className={styles.searchNote}>
              {result.clubs.length
                ? 'Ese club no tiene partidos en G22 entre tres semanas atrás y tres adelante. Si es otro partido, pegá su link.'
                : 'No encontramos clubes con ese nombre. Probá con otra parte del nombre o pegá el link del partido.'}
            </p>
          )
      ) : null}
    </div>
  );
}

/** Elegir un club del catálogo: nombre, sigla, color y escudo de una. */
export function ClubPicker({ onPick, label }: { onPick: (club: OverlaySearchClub) => void; label: string }) {
  const [query, setQuery] = useState('');
  const { result, loading, searchable } = useOverlaySearch(query);
  return (
    <div className={styles.picker}>
      <input
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscá el club en G22"
        aria-label={label}
        autoComplete="off"
      />
      {searchable ? (
        loading && !result.clubs.length ? <p className={styles.searchNote}>Buscando…</p>
          : result.clubs.length ? (
            <ul className={styles.results}>
              {result.clubs.map((club) => (
                <li key={club.id}>
                  <button type="button" className={styles.result} onClick={() => { onPick(club); setQuery(''); }}>
                    <span className={styles.resultTeam}>
                      <Crest src={club.logo} name={club.name} size={24} />
                      {club.name}
                      {club.color ? <i className={styles.swatch} style={{ background: club.color }} aria-hidden="true" /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className={styles.searchNote}>No hay clubes con ese nombre. Podés escribir el nombre a mano abajo.</p>
      ) : null}
    </div>
  );
}

/** Elegir un torneo: por nombre o pegando el link. */
export function TournamentPicker({ onPick }: { onPick: (tournament: OverlaySearchTournament) => void }) {
  const [query, setQuery] = useState('');
  const { result, loading, searchable } = useOverlaySearch(query);
  const linkId = idFrom(query);
  const isLink = UUID_RE.test(linkId);
  return (
    <div className={styles.picker}>
      <input
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscá el torneo (ej. Top 12) o pegá su link"
        aria-label="Buscar torneo"
        autoComplete="off"
      />
      {isLink ? (
        <button type="button" className={styles.linkPick} onClick={() => { onPick({ id: linkId, name: 'Torneo del link', logo: null }); setQuery(''); }}>
          Usar el torneo de este link
        </button>
      ) : null}
      {searchable ? (
        loading && !result.tournaments.length ? <p className={styles.searchNote}>Buscando…</p>
          : result.tournaments.length ? (
            <ul className={styles.results}>
              {result.tournaments.map((tournament) => (
                <li key={tournament.id}>
                  <button type="button" className={styles.result} onClick={() => { onPick(tournament); setQuery(''); }}>
                    <span className={styles.resultTeam}><Crest src={tournament.logo} name={tournament.name} size={24} />{tournament.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className={styles.searchNote}>No encontramos torneos con ese nombre. Pegá el link del torneo.</p>
      ) : null}
    </div>
  );
}
