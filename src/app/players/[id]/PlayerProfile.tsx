'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Link2, Share2 } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { formatDateInTimeZone } from '@/lib/timezone';
import type {
    LocalPlayerProfile,
    PlayerProfileMatch,
    PlayerProfileSeason,
} from '@/lib/services/localPlayerProfile';
import PlayerShareOverlay from './PlayerShareOverlay';
import styles from './PlayerProfile.module.css';

type TabId = 'resumen' | 'partidos' | 'trayectoria';

const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'trayectoria', label: 'Trayectoria' },
];

const RESUMEN_MATCHES = 5;

function isTabId(value: string | null): value is TabId {
    return value === 'resumen' || value === 'partidos' || value === 'trayectoria';
}

function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatMatchDate(value: string | null) {
    if (!value) return 'Sin fecha';
    return (
        formatDateInTimeZone(value, 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) ||
        'Sin fecha'
    );
}

function ageFrom(birthDate: string | null) {
    if (!birthDate) return null;
    const born = new Date(birthDate);
    if (Number.isNaN(born.getTime())) return null;
    const diff = Date.now() - born.getTime();
    const years = Math.floor(diff / 31557600000);
    return years > 0 && years < 120 ? years : null;
}

/**
 * `1.83` y `183` son la misma altura escrita de dos formas, y las dos estan
 * cargadas en la base.
 *
 * Y lo que no cae en ningun rango humano NO SE MUESTRA. Hay fichas con
 * `height: 12`, que la version que solo miraba "es mayor que 3" publicaba como
 * "12 cm". Un dato absurdo con cara de dato es peor que un campo ausente: el
 * campo vacio se lee como "no lo cargamos", el absurdo se lee como que el sitio
 * esta roto.
 */
function formatHeight(value: number | string | null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1.4 && n <= 2.3) return `${n.toFixed(2)} m`;
    if (n >= 140 && n <= 230) return `${Math.round(n)} cm`;
    return null;
}

function formatWeight(value: number | string | null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 40 || n > 200) return null;
    return `${Math.round(n)} kg`;
}

const RESULT_LABEL: Record<string, string> = { win: 'G', draw: 'E', loss: 'P' };
const RESULT_TITLE: Record<string, string> = { win: 'Ganó', draw: 'Empató', loss: 'Perdió' };

export default function PlayerProfile({ profile }: { profile: LocalPlayerProfile }) {
    const [tab, setTab] = useState<TabId>('resumen');
    const [compartiendo, setCompartiendo] = useState(false);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    // El tab vive en la URL: sin esto no se puede compartir "la trayectoria de
    // Baronio" ni volver con el boton de atras. `pushState` nativo en vez de
    // `router.push` porque no hay que volver a pedir nada al servidor.
    useEffect(() => {
        const read = () => {
            const value = new URLSearchParams(window.location.search).get('tab');
            setTab(isTabId(value) ? value : 'resumen');
        };
        read();
        window.addEventListener('popstate', read);
        return () => window.removeEventListener('popstate', read);
    }, []);

    const selectTab = useCallback((next: TabId) => {
        setTab(next);
        const url = new URL(window.location.href);
        if (next === 'resumen') url.searchParams.delete('tab');
        else url.searchParams.set('tab', next);
        window.history.pushState(null, '', url);
    }, []);

    const onTabKeyDown = useCallback(
        (event: React.KeyboardEvent, index: number) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const delta = event.key === 'ArrowRight' ? 1 : -1;
            const next = (index + delta + TABS.length) % TABS.length;
            selectTab(TABS[next].id);
            tabRefs.current[next]?.focus();
        },
        [selectTab],
    );

    const { totals } = profile;
    const age = ageFrom(profile.birthDate);
    const height = formatHeight(profile.height);
    const weight = formatWeight(profile.weight);

    /**
     * La cinta de numeros muestra lo que el jugador HIZO. Partidos y titular
     * son la columna vertebral y van siempre; el resto entra solo si hay algo
     * que contar — un cero grande y centrado se lee como "jugo y no hizo
     * nada", que casi nunca es lo que pasa: lo que pasa es que no se cargo.
     */
    const stats = useMemo(() => {
        const list: Array<{ key: string; value: number; label: string; tone?: 'caution' | 'danger' }> = [
            { key: 'matches', value: totals.matches, label: totals.matches === 1 ? 'Partido' : 'Partidos' },
            { key: 'starts', value: totals.starts, label: 'Titular' },
        ];
        if (totals.points) list.push({ key: 'points', value: totals.points, label: 'Puntos' });
        if (totals.tries) list.push({ key: 'tries', value: totals.tries, label: totals.tries === 1 ? 'Try' : 'Tries' });
        if (totals.conversions) list.push({ key: 'conv', value: totals.conversions, label: 'Conversiones' });
        if (totals.penalties) list.push({ key: 'pen', value: totals.penalties, label: 'Penales' });
        if (totals.dropGoals) list.push({ key: 'drop', value: totals.dropGoals, label: 'Drops' });
        if (totals.yellowCards) list.push({ key: 'yc', value: totals.yellowCards, label: 'Amarillas', tone: 'caution' });
        if (totals.redCards) list.push({ key: 'rc', value: totals.redCards, label: 'Rojas', tone: 'danger' });
        return list.slice(0, 6);
    }, [totals]);

    const ficha = useMemo(() => {
        const rows: Array<{ label: string; value: React.ReactNode }> = [];
        if (profile.club) {
            rows.push({
                label: 'Club',
                value: (
                    <Link href={`/clubs/${profile.club.id}`} className={styles.inlineLink}>
                        {profile.club.name}
                    </Link>
                ),
            });
        }
        if (profile.position) {
            rows.push({
                label: 'Puesto',
                value: (
                    <>
                        {profile.position}
                        {/* Un puesto deducido se dice deducido. El numero de titular acierta
                            casi siempre, pero "casi" no es "siempre" y la ficha no puede
                            presentar las dos cosas como el mismo dato. */}
                        {profile.positionSource === 'jersey' && (
                            <span className={styles.fichaNote}>por el dorsal {profile.mainNumber}</span>
                        )}
                    </>
                ),
            });
        }
        if (profile.number !== null) rows.push({ label: 'Dorsal', value: `#${profile.number}` });
        if (age !== null) rows.push({ label: 'Edad', value: `${age} años` });
        if (profile.birthDate) {
            rows.push({
                label: 'Nacimiento',
                value:
                    formatDateInTimeZone(profile.birthDate, 'es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                    }) || profile.birthDate,
            });
        }
        if (height) rows.push({ label: 'Altura', value: height });
        if (weight) rows.push({ label: 'Peso', value: weight });
        return rows;
    }, [age, height, profile.birthDate, profile.club, profile.number, profile.position, weight]);

    const hasMatches = profile.matches.length > 0;

    return (
        <div className={styles.page}>
            <header className={styles.hero}>
                <div className="container">
                    <nav className={styles.breadcrumb} aria-label="Migas de pan">
                        <Link href="/">Inicio</Link>
                        <span aria-hidden="true">/</span>
                        {profile.club ? (
                            <>
                                <Link href={`/clubs/${profile.club.id}`}>{profile.club.name}</Link>
                                <span aria-hidden="true">/</span>
                            </>
                        ) : null}
                        <span className={styles.breadcrumbCurrent} aria-current="page">
                            {profile.name}
                        </span>
                    </nav>

                    <div className={styles.identity}>
                        <div className={styles.avatar} aria-hidden={profile.photo ? undefined : 'true'}>
                            {profile.photo ? (
                                <img src={profile.photo} alt={profile.name} className={styles.avatarImg} />
                            ) : (
                                <span className={styles.avatarInitials}>{initialsOf(profile.name)}</span>
                            )}
                        </div>

                        <div className={styles.identityBody}>
                            <h1 className={styles.name}>{profile.name}</h1>
                            <div className={styles.chips}>
                                {profile.club && (
                                    <Link href={`/clubs/${profile.club.id}`} className={styles.clubChip}>
                                        <span aria-hidden="true" className={styles.clubChipCrest}>
                                            <TeamLogo
                                                name={profile.club.name}
                                                teamId={profile.club.id}
                                                shortName={profile.club.shortName}
                                                size={20}
                                            />
                                        </span>
                                        {profile.club.name}
                                    </Link>
                                )}
                                {profile.position && (
                                    <span
                                        className={styles.chip}
                                        title={
                                            profile.positionSource === 'jersey'
                                                ? `Puesto deducido de la camiseta ${profile.mainNumber} que usa de titular`
                                                : undefined
                                        }
                                    >
                                        {profile.position}
                                        {profile.positionSource === 'jersey' && (
                                            <span className={styles.chipHint} aria-label="deducido del dorsal">
                                                ·{profile.mainNumber}
                                            </span>
                                        )}
                                    </span>
                                )}
                                {profile.number !== null && <span className={styles.chip}>#{profile.number}</span>}
                                {age !== null && <span className={styles.chip}>{age} años</span>}
                            </div>
                        </div>

                        <button
                            type="button"
                            className={styles.shareBtn}
                            onClick={() => setCompartiendo(true)}
                            aria-label="Compartir la ficha"
                            aria-haspopup="dialog"
                        >
                            <Share2 size={16} aria-hidden="true" />
                            <span className={styles.shareLabel}>Compartir</span>
                        </button>
                    </div>

                    {hasMatches && (
                        <dl className={styles.statRibbon}>
                            {stats.map((stat) => (
                                <div key={stat.key} className={styles.stat}>
                                    <dt className={styles.statLabel}>{stat.label}</dt>
                                    <dd
                                        className={`${styles.statValue} ${
                                            stat.tone === 'caution'
                                                ? styles.toneCaution
                                                : stat.tone === 'danger'
                                                  ? styles.toneDanger
                                                  : ''
                                        }`}
                                    >
                                        {stat.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    <div className={styles.tabs} role="tablist" aria-label="Secciones de la ficha">
                        {TABS.map((item, index) => (
                            <button
                                key={item.id}
                                ref={(node) => {
                                    tabRefs.current[index] = node;
                                }}
                                type="button"
                                role="tab"
                                id={`tab-${item.id}`}
                                aria-selected={tab === item.id}
                                aria-controls={`panel-${item.id}`}
                                tabIndex={tab === item.id ? 0 : -1}
                                className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
                                onClick={() => selectTab(item.id)}
                                onKeyDown={(event) => onTabKeyDown(event, index)}
                            >
                                {item.label}
                                {item.id === 'partidos' && hasMatches && (
                                    <span className={styles.tabCount}>{profile.matches.length}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="container">
                {tab === 'resumen' && (
                    <div id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen" className={styles.panel}>
                        {hasMatches ? (
                            <section className={styles.section}>
                                <div className={styles.sectionHead}>
                                    <h2 className={styles.sectionTitle}>Últimos partidos</h2>
                                    {profile.matches.length > RESUMEN_MATCHES && (
                                        <button type="button" className={styles.linkBtn} onClick={() => selectTab('partidos')}>
                                            Ver los {profile.matches.length}
                                        </button>
                                    )}
                                </div>
                                <ul className={styles.matchList}>
                                    {profile.matches.slice(0, RESUMEN_MATCHES).map((match) => (
                                        <MatchRow key={match.id} match={match} />
                                    ))}
                                </ul>
                            </section>
                        ) : (
                            <EmptyMatches profile={profile} />
                        )}

                        {ficha.length > 0 && (
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>Ficha</h2>
                                <dl className={styles.fichaGrid}>
                                    {ficha.map((row) => (
                                        <div key={row.label} className={styles.fichaItem}>
                                            <dt className={styles.fichaLabel}>{row.label}</dt>
                                            <dd className={styles.fichaValue}>{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        )}
                    </div>
                )}

                {tab === 'partidos' && (
                    <div id="panel-partidos" role="tabpanel" aria-labelledby="tab-partidos" className={styles.panel}>
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>
                                {hasMatches
                                    ? `${profile.matches.length} ${profile.matches.length === 1 ? 'partido' : 'partidos'}`
                                    : 'Partidos'}
                            </h2>
                            {hasMatches ? (
                                <ul className={styles.matchList}>
                                    {profile.matches.map((match) => (
                                        <MatchRow key={match.id} match={match} expanded />
                                    ))}
                                </ul>
                            ) : (
                                <EmptyMatches profile={profile} />
                            )}
                        </section>
                    </div>
                )}

                {tab === 'trayectoria' && (
                    <div id="panel-trayectoria" role="tabpanel" aria-labelledby="tab-trayectoria" className={styles.panel}>
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>Trayectoria</h2>
                            {profile.seasons.length > 0 ? (
                                <SeasonTable seasons={profile.seasons} totals={profile.totals} />
                            ) : (
                                <EmptyMatches profile={profile} />
                            )}
                        </section>
                    </div>
                )}
            </main>

            {compartiendo && (
                <PlayerShareOverlay
                    playerId={profile.id}
                    playerName={profile.name}
                    clubName={profile.club?.name || null}
                    onClose={() => setCompartiendo(false)}
                />
            )}
        </div>
    );
}

function MatchRow({ match, expanded = false }: { match: PlayerProfileMatch; expanded?: boolean }) {
    const scoring = match.events.filter((event) => event.category === 'score');
    const cards = match.events.filter((event) => event.category === 'card');
    const shown = expanded ? [...scoring, ...cards] : scoring;

    return (
        <li className={styles.matchItem}>
            <Link href={`/matches/${match.id}`} className={styles.matchLink}>
                <div className={styles.matchMeta}>
                    <span>{formatMatchDate(match.date)}</span>
                    {match.tournamentName && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className={styles.matchTournament}>{match.tournamentName}</span>
                        </>
                    )}
                </div>

                <div className={styles.matchTeams}>
                    {(['home', 'away'] as const).map((side) => {
                        const team = match[side];
                        const isPlayerSide = match.side === side;
                        const won =
                            match[side].score !== null &&
                            match[side === 'home' ? 'away' : 'home'].score !== null &&
                            (match[side].score as number) > (match[side === 'home' ? 'away' : 'home'].score as number);
                        return (
                            <div
                                key={side}
                                className={`${styles.matchTeam} ${isPlayerSide ? styles.matchTeamOwn : ''}`}
                            >
                                <span aria-hidden="true" className={styles.matchCrest}>
                                    <TeamLogo name={team.name} teamId={team.id} shortName={team.shortName} size={22} />
                                </span>
                                <span className={styles.matchTeamName}>{team.name}</span>
                                <span className={`${styles.matchScore} ${won ? styles.matchScoreWon : ''}`}>
                                    {team.score ?? '–'}
                                </span>
                            </div>
                        );
                    })}
                    {match.result && (
                        <span
                            className={`${styles.resultPill} ${styles[`result_${match.result}`]}`}
                            title={RESULT_TITLE[match.result]}
                        >
                            {RESULT_LABEL[match.result]}
                        </span>
                    )}
                </div>

                {(match.role || shown.length > 0 || match.points > 0) && (
                    <div className={styles.matchContribution}>
                        {match.number !== null && <span className={styles.roleTag}>#{match.number}</span>}
                        {match.role && (
                            <span className={styles.roleTag}>{match.role === 'starter' ? 'Titular' : 'Suplente'}</span>
                        )}
                        {match.isCaptain && <span className={styles.roleTag}>Capitán</span>}
                        {shown.map((event) => (
                            <span
                                key={event.type}
                                className={`${styles.eventTag} ${
                                    event.category === 'card' ? styles.eventTagCard : ''
                                }`}
                            >
                                {event.count > 1 ? `${event.count} × ` : ''}
                                {event.label}
                            </span>
                        ))}
                        {match.points > 0 && (
                            <span className={styles.pointsTag}>
                                {match.points} {match.points === 1 ? 'punto' : 'puntos'}
                            </span>
                        )}
                    </div>
                )}
            </Link>
        </li>
    );
}

function SeasonTable({
    seasons,
    totals,
}: {
    seasons: PlayerProfileSeason[];
    totals: LocalPlayerProfile['totals'];
}) {
    // Columnas de RUGBY. La tabla anterior tenia "G" y "A" —goles y
    // asistencias— con el acento puesto en los goles.
    const columns: Array<{ key: keyof PlayerProfileSeason; short: string; label: string }> = [
        { key: 'matches', short: 'PJ', label: 'Partidos jugados' },
        { key: 'starts', short: 'Tit', label: 'De titular' },
        { key: 'tries', short: 'Tries', label: 'Tries' },
        { key: 'conversions', short: 'Conv', label: 'Conversiones' },
        { key: 'penalties', short: 'Pen', label: 'Penales' },
        { key: 'dropGoals', short: 'Drop', label: 'Drops' },
        { key: 'points', short: 'Pts', label: 'Puntos' },
    ];

    return (
        <div className={styles.tableScroll}>
            <table className={styles.table}>
                <caption className={styles.tableCaption}>
                    Rendimiento por torneo. Los puntos salen de los eventos cargados en cada partido.
                </caption>
                <thead>
                    <tr>
                        <th scope="col" className={styles.thText}>
                            Torneo
                        </th>
                        {columns.map((column) => (
                            <th key={String(column.key)} scope="col" className={styles.thNum} title={column.label}>
                                <abbr title={column.label}>{column.short}</abbr>
                            </th>
                        ))}
                        <th scope="col" className={styles.thNum} title="Tarjetas">
                            <abbr title="Tarjetas amarillas y rojas">Tarj</abbr>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {seasons.map((season) => (
                        <tr key={season.key}>
                            <th scope="row" className={styles.tdText}>
                                <span className={styles.seasonName}>
                                    {season.tournamentId ? (
                                        <Link href={`/tournaments/${season.tournamentId}`} className={styles.inlineLink}>
                                            {season.tournamentName}
                                        </Link>
                                    ) : (
                                        season.tournamentName
                                    )}
                                </span>
                                <span className={styles.seasonMeta}>
                                    {[season.year, season.clubName].filter(Boolean).join(' · ')}
                                </span>
                            </th>
                            {columns.map((column) => (
                                <td key={String(column.key)} className={styles.tdNum}>
                                    {(season[column.key] as number) || '–'}
                                </td>
                            ))}
                            <td className={styles.tdNum}>
                                {season.yellowCards || season.redCards ? (
                                    <span className={styles.cardCounts}>
                                        {season.yellowCards > 0 && (
                                            <span className={styles.toneCaution} title="Amarillas">
                                                {season.yellowCards}
                                            </span>
                                        )}
                                        {season.redCards > 0 && (
                                            <span className={styles.toneDanger} title="Rojas">
                                                {season.redCards}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    '–'
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
                {seasons.length > 1 && (
                    <tfoot>
                        <tr>
                            <th scope="row" className={styles.tdText}>
                                Total
                            </th>
                            <td className={styles.tdNum}>{totals.matches}</td>
                            <td className={styles.tdNum}>{totals.starts || '–'}</td>
                            <td className={styles.tdNum}>{totals.tries || '–'}</td>
                            <td className={styles.tdNum}>{totals.conversions || '–'}</td>
                            <td className={styles.tdNum}>{totals.penalties || '–'}</td>
                            <td className={styles.tdNum}>{totals.dropGoals || '–'}</td>
                            <td className={styles.tdNum}>{totals.points || '–'}</td>
                            <td className={styles.tdNum}>
                                {totals.yellowCards || totals.redCards ? (
                                    <span className={styles.cardCounts}>
                                        {totals.yellowCards > 0 && (
                                            <span className={styles.toneCaution}>{totals.yellowCards}</span>
                                        )}
                                        {totals.redCards > 0 && <span className={styles.toneDanger}>{totals.redCards}</span>}
                                    </span>
                                ) : (
                                    '–'
                                )}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

/**
 * El vacio dice de donde SALDRIA el dato y ofrece a donde ir. "No hay
 * informacion disponible" no es una respuesta: deja al jugador en una pagina
 * sin salida.
 */
function EmptyMatches({ profile }: { profile: LocalPlayerProfile }) {
    const nombre = profile.name.split(/\s+/)[0] || 'este jugador';
    return (
        <div className={styles.empty}>
            <p className={styles.emptyTitle}>Todavía no hay partidos cargados de {nombre}.</p>
            <p className={styles.emptyBody}>
                La ficha se arma con las formaciones y los eventos de cada partido. Cuando se cargue una planilla donde
                aparezca, sus tries, conversiones y tarjetas van a salir acá.
            </p>
            {profile.club && (
                <Link href={`/clubs/${profile.club.id}`} className={styles.emptyCta}>
                    <Link2 size={15} aria-hidden="true" />
                    Ver {profile.club.name}
                </Link>
            )}
        </div>
    );
}
