'use client';

/**
 * Perfil de jugador, propuesta inspirada en las fichas de FotMob (cabecera con
 * identidad, pestañas, tarjetas de datos, forma reciente y estadisticas por
 * competicion) pero con los tokens de G22: nada de color suelto.
 *
 * La version anterior (`PlayerProfile`) sigue disponible con `?diseno=anterior`
 * para poder comparar. De ella se reusan `MatchRow`, `SeasonTable` y los
 * formateadores: no se duplican.
 *
 * Regla de datos: todo sale de `LocalPlayerProfile`. Si una metrica no tiene
 * fuente verificable, no hay tarjeta. Un guion es "sin registros" — el dato sale
 * de los eventos cargados en cada partido, asi que un 0 real y un evento que
 * nadie cargo se ven igual en la base, y la pantalla no los confunde con un
 * numero.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ImageDown, Share2 } from 'lucide-react';
import PlayerHeadIcon from '@/components/PlayerHeadIcon';
import TeamLogo from '@/components/TeamLogo';
import { formatDateInTimeZone } from '@/lib/timezone';
import type { LocalPlayerProfile, PlayerProfileMatch } from '@/lib/services/localPlayerProfile';
import { otherActionsOf, seasonKeyOf, totalsOf } from '@/lib/services/playerProfileAggregate';
import PlayerShareOverlay from './PlayerShareOverlay';
import {
    EmptyMatches,
    MatchRow,
    SeasonTable,
    ageFrom,
    formatHeight,
    formatMatchDate,
    formatWeight,
} from './PlayerProfile';
import styles from './PlayerProfileV2.module.css';

// El motor de export es pesado (comparte el de las placas de tablas y fixture):
// solo se descarga cuando alguien abre el modal.
const PlayerExportModal = dynamic(() => import('./PlayerExportModal'), { ssr: false });

type TabId = 'resumen' | 'partidos' | 'estadisticas' | 'trayectoria';

const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'resumen', label: 'Perfil' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'estadisticas', label: 'Estadísticas' },
    { id: 'trayectoria', label: 'Trayectoria' },
];

const FORM_MATCHES = 5;
const RECENT_MATCHES = 5;
const ALL_SEASONS = 'all';

function isTabId(value: string | null): value is TabId {
    return TABS.some((tab) => tab.id === value);
}

/** Un valor en cero se muestra como guion: ver el comentario del archivo. */
function tileValue(value: number): string {
    return value > 0 ? String(value) : '–';
}

type Tile = { key: string; label: string; value: string; tone?: 'caution' | 'danger' | 'accent'; hint?: string };

export default function PlayerProfileV2({ profile }: { profile: LocalPlayerProfile }) {
    const [tab, setTab] = useState<TabId>('resumen');
    const [compartiendo, setCompartiendo] = useState(false);
    const [exportando, setExportando] = useState(false);
    const [seasonKey, setSeasonKey] = useState<string>(ALL_SEASONS);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

    const age = ageFrom(profile.birthDate);
    const height = formatHeight(profile.height);
    const weight = formatWeight(profile.weight);
    const hasMatches = profile.matches.length > 0;

    // Datos de identidad: solo los que existen. Un dato inexistente no ocupa
    // lugar — la tarjeta se arma con lo que hay.
    const facts = useMemo(() => {
        const list: Array<{ key: string; value: string; label: string; note?: string }> = [];
        if (profile.position) {
            list.push({
                key: 'pos',
                value: profile.position,
                label: 'Puesto',
                note: profile.positionSource === 'jersey' ? `por el dorsal ${profile.mainNumber}` : undefined,
            });
        }
        if (profile.number !== null) list.push({ key: 'num', value: `#${profile.number}`, label: 'Dorsal' });
        if (age !== null) list.push({ key: 'age', value: `${age} años`, label: 'Edad' });
        if (height) list.push({ key: 'h', value: height, label: 'Altura' });
        if (weight) list.push({ key: 'w', value: weight, label: 'Peso' });
        if (profile.birthDate) {
            list.push({
                key: 'born',
                value:
                    formatDateInTimeZone(profile.birthDate, 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) ||
                    profile.birthDate,
                label: 'Nacimiento',
            });
        }
        return list;
    }, [age, height, profile.birthDate, profile.mainNumber, profile.number, profile.position, profile.positionSource, weight]);

    const latest = profile.seasons[0] || null;
    const form = profile.matches.slice(0, FORM_MATCHES);

    // ── Estadisticas: filtradas por competicion ─────────────────────────────
    const scopedMatches = useMemo(
        () =>
            seasonKey === ALL_SEASONS
                ? profile.matches
                : profile.matches.filter((match) => seasonKeyOf(match) === seasonKey),
        [profile.matches, seasonKey],
    );
    const scoped = useMemo(() => totalsOf(scopedMatches), [scopedMatches]);
    const scopedActions = useMemo(() => otherActionsOf(scopedMatches), [scopedMatches]);
    const withLineup = useMemo(() => scopedMatches.filter((match) => match.role !== null).length, [scopedMatches]);
    const scopeLabel =
        seasonKey === ALL_SEASONS
            ? 'Todas las competiciones'
            : (() => {
                  const season = profile.seasons.find((item) => item.key === seasonKey);
                  return season ? [season.tournamentName, season.year].filter(Boolean).join(' · ') : 'Competición';
              })();

    const groups = useMemo(() => {
        const t = scoped;
        const performance: Tile[] = [
            { key: 'pj', label: 'Partidos', value: String(t.matches) },
            { key: 'tit', label: 'De titular', value: tileValue(t.starts) },
            { key: 'sup', label: 'Desde el banco', value: tileValue(t.bench) },
            { key: 'cap', label: 'Como capitán', value: tileValue(t.captain) },
            {
                key: 'min',
                label: 'Minutos jugados',
                value: tileValue(t.minutes),
                tone: 'accent',
                hint: t.minutesKnown > 0 ? `${t.minutesKnown} de ${t.matches} partidos` : undefined,
            },
            {
                key: 'minavg',
                label: 'Minutos por partido',
                value: t.minutesKnown > 0 && t.minutes > 0 ? String(Math.round(t.minutes / t.minutesKnown)) : '–',
                hint: 'promedio',
            },
            { key: 'w', label: 'Ganados', value: tileValue(t.wins), tone: 'accent' },
            { key: 'd', label: 'Empatados', value: tileValue(t.draws) },
            { key: 'l', label: 'Perdidos', value: tileValue(t.losses) },
        ];
        const scoring: Tile[] = [
            { key: 'pts', label: 'Puntos', value: tileValue(t.points), tone: 'accent' },
            { key: 'avg', label: 'Puntos por partido', value: t.matches > 0 && t.points > 0 ? (t.points / t.matches).toFixed(1) : '–', hint: 'promedio' },
            { key: 'tries', label: 'Tries', value: tileValue(t.tries) },
            { key: 'conv', label: 'Conversiones', value: tileValue(t.conversions) },
            { key: 'pen', label: 'Penales', value: tileValue(t.penalties) },
            { key: 'drop', label: 'Drops', value: tileValue(t.dropGoals) },
        ];
        // Los errados solo se muestran si hubo: el default historico del
        // proyecto es "entro", asi que un cero no prueba que no fallo.
        if (t.kicksMissed > 0) {
            scoring.push({ key: 'miss', label: 'Patadas falladas', value: String(t.kicksMissed), tone: 'caution' });
        }
        const discipline: Tile[] = [
            { key: 'yc', label: 'Amarillas', value: tileValue(t.yellowCards), tone: t.yellowCards > 0 ? 'caution' : undefined },
            { key: 'rc', label: 'Rojas', value: tileValue(t.redCards), tone: t.redCards > 0 ? 'danger' : undefined },
        ];
        const subs: Tile[] = [
            { key: 'on', label: 'Entró desde el banco', value: tileValue(t.subbedOn) },
            { key: 'off', label: 'Salió reemplazado', value: tileValue(t.subbedOff) },
        ];
        return { performance, scoring, discipline, subs };
    }, [scoped]);

    const seasonChips = profile.seasons.length > 1 ? profile.seasons : [];

    return (
        <div className={styles.page}>
            <header className={styles.hero}>
                <div className={`container ${styles.heroInner}`}>
                    <div className={styles.topbar}>
                        <Link
                            href={profile.club ? `/clubs/${profile.club.id}` : '/'}
                            className={styles.back}
                            aria-label={profile.club ? `Volver a ${profile.club.name}` : 'Volver al inicio'}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </Link>
                        <div className={styles.topActions}>
                            <button
                                type="button"
                                className={styles.shareBtn}
                                onClick={() => setExportando(true)}
                                aria-label="Exportar la ficha como imágenes"
                                aria-haspopup="dialog"
                            >
                                <ImageDown size={16} aria-hidden="true" />
                                <span className={styles.shareLabel}>Exportar</span>
                            </button>
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
                    </div>

                    <div className={styles.identity}>
                        <div className={styles.avatarWrap}>
                            <div className={styles.avatar}>
                                {profile.photo ? (
                                    <img src={profile.photo} alt={profile.name} className={styles.avatarImg} />
                                ) : (
                                    <PlayerHeadIcon size={56} className={styles.avatarIcon} />
                                )}
                            </div>
                            {profile.club && (
                                <span className={styles.avatarCrest} aria-hidden="true">
                                    <TeamLogo
                                        name={profile.club.name}
                                        teamId={profile.club.id}
                                        shortName={profile.club.shortName}
                                        size={32}
                                    />
                                </span>
                            )}
                        </div>
                        <div className={styles.identityBody}>
                            <h1 className={styles.name}>{profile.name}</h1>
                            {profile.club && (
                                <Link href={`/clubs/${profile.club.id}`} className={styles.clubChip}>
                                    <span aria-hidden="true" className={styles.clubCrest}>
                                        <TeamLogo
                                            name={profile.club.name}
                                            teamId={profile.club.id}
                                            shortName={profile.club.shortName}
                                            size={22}
                                        />
                                    </span>
                                    {profile.club.name}
                                </Link>
                            )}
                        </div>
                    </div>

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

            <main className={`container ${styles.main}`}>
                {profile.truncated && (
                    <p className={styles.notice} role="note">
                        Hay más partidos o eventos cargados de los que se leen de una vez. Los números de esta ficha
                        pueden quedar cortos.
                    </p>
                )}

                {tab === 'resumen' && (
                    <div id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen" className={styles.panel}>
                        {facts.length > 0 && (
                            <section className={styles.card} aria-label="Datos del jugador">
                                <dl className={styles.facts}>
                                    {facts.map((fact) => (
                                        <div key={fact.key} className={styles.fact}>
                                            <dd className={styles.factValue}>{fact.value}</dd>
                                            <dt className={styles.factLabel}>{fact.label}</dt>
                                            {fact.note && <span className={styles.factNote}>{fact.note}</span>}
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        )}

                        {latest && (
                            <section className={styles.card} aria-label="Competición más reciente">
                                <header className={styles.cardHead}>
                                    <h2 className={styles.cardTitle}>
                                        {latest.tournamentId ? (
                                            <Link href={`/tournaments/${latest.tournamentId}`} className={styles.inlineLink}>
                                                {latest.tournamentName}
                                            </Link>
                                        ) : (
                                            latest.tournamentName
                                        )}
                                        {latest.year ? <span className={styles.cardTitleMeta}> {latest.year}</span> : null}
                                    </h2>
                                </header>
                                <dl className={styles.bigStats}>
                                    <div className={styles.bigStat}>
                                        <dd className={styles.bigValue}>{latest.matches}</dd>
                                        <dt className={styles.bigLabel}>{latest.matches === 1 ? 'Partido' : 'Partidos'}</dt>
                                    </div>
                                    <div className={styles.bigStat}>
                                        <dd className={styles.bigValue}>{tileValue(latest.tries)}</dd>
                                        <dt className={styles.bigLabel}>{latest.tries === 1 ? 'Try' : 'Tries'}</dt>
                                    </div>
                                    <div className={styles.bigStat}>
                                        <dd className={`${styles.bigValue} ${latest.points > 0 ? styles.bigValueAccent : ''}`}>
                                            {tileValue(latest.points)}
                                        </dd>
                                        <dt className={styles.bigLabel}>Puntos</dt>
                                    </div>
                                </dl>
                                <button type="button" className={styles.cardLink} onClick={() => selectTab('estadisticas')}>
                                    Ver todas las estadísticas
                                </button>
                            </section>
                        )}

                        {form.length > 0 && (
                            <section className={styles.card} aria-label="Forma reciente">
                                <header className={styles.cardHead}>
                                    <h2 className={styles.cardTitle}>Forma</h2>
                                    <span className={styles.cardHeadMeta}>Últimos {form.length}</span>
                                </header>
                                <ul className={styles.form}>
                                    {form.map((match) => {
                                        const own = match.side === 'away' ? match.away : match.home;
                                        const rival = match.side === 'away' ? match.home : match.away;
                                        const score =
                                            own.score !== null && rival.score !== null ? `${own.score}-${rival.score}` : '–';
                                        return (
                                            <li key={match.id}>
                                                <Link
                                                    href={`/matches/${match.id}`}
                                                    className={styles.formItem}
                                                    aria-label={`${rival.name}, ${score}, ${formatMatchDate(match.date)}`}
                                                >
                                                    <span
                                                        className={`${styles.formScore} ${
                                                            match.result ? styles[`form_${match.result}`] : styles.form_none
                                                        }`}
                                                    >
                                                        {score}
                                                    </span>
                                                    <span aria-hidden="true" className={styles.formCrest}>
                                                        <TeamLogo
                                                            name={rival.name}
                                                            teamId={rival.id}
                                                            shortName={rival.shortName}
                                                            size={28}
                                                        />
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

                        {hasMatches ? (
                            <section className={styles.card} aria-label="Últimos partidos">
                                <header className={styles.cardHead}>
                                    <h2 className={styles.cardTitle}>Últimos partidos</h2>
                                    {profile.matches.length > RECENT_MATCHES && (
                                        <button type="button" className={styles.linkBtn} onClick={() => selectTab('partidos')}>
                                            Ver los {profile.matches.length}
                                        </button>
                                    )}
                                </header>
                                <ul className={styles.matchList}>
                                    {profile.matches.slice(0, RECENT_MATCHES).map((match) => (
                                        <MatchRow key={match.id} match={match} />
                                    ))}
                                </ul>
                            </section>
                        ) : (
                            <EmptyMatches profile={profile} />
                        )}
                    </div>
                )}

                {tab === 'partidos' && (
                    <div id="panel-partidos" role="tabpanel" aria-labelledby="tab-partidos" className={styles.panel}>
                        <section className={styles.card}>
                            <header className={styles.cardHead}>
                                <h2 className={styles.cardTitle}>
                                    {hasMatches
                                        ? `${profile.matches.length} ${profile.matches.length === 1 ? 'partido' : 'partidos'}`
                                        : 'Partidos'}
                                </h2>
                            </header>
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

                {tab === 'estadisticas' && (
                    <div id="panel-estadisticas" role="tabpanel" aria-labelledby="tab-estadisticas" className={styles.panel}>
                        {!hasMatches ? (
                            <EmptyMatches profile={profile} />
                        ) : (
                            <>
                                {seasonChips.length > 0 && (
                                    <div className={styles.scopeBar} role="radiogroup" aria-label="Competición">
                                        {[{ key: ALL_SEASONS, label: 'Todas' }, ...seasonChips.map((season) => ({
                                            key: season.key,
                                            label: [season.tournamentName, season.year].filter(Boolean).join(' · '),
                                        }))].map((option) => (
                                            <button
                                                key={option.key}
                                                type="button"
                                                role="radio"
                                                aria-checked={seasonKey === option.key}
                                                className={`${styles.scopeChip} ${seasonKey === option.key ? styles.scopeChipActive : ''}`}
                                                onClick={() => setSeasonKey(option.key)}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <p className={styles.context}>
                                    <strong>{scopeLabel}</strong> · acumulado de {scoped.matches}{' '}
                                    {scoped.matches === 1 ? 'partido cargado' : 'partidos cargados'}. Un guion es sin
                                    registros: el dato sale de los eventos de cada planilla.
                                </p>

                                <StatGroup
                                    title="Rendimiento"
                                    tiles={groups.performance}
                                    note={[
                                        withLineup < scoped.matches
                                            ? `Titular y suplente se conocen en ${withLineup} de ${scoped.matches} partidos: los demás no tienen la formación cargada.`
                                            : null,
                                        'Los minutos se calculan con los cambios y las rojas cargados, sobre 80 minutos reglamentarios; sin ese dato el partido no suma.',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                />
                                <StatGroup title="Anotación" tiles={groups.scoring} />
                                <StatGroup title="Disciplina" tiles={groups.discipline} />
                                {(scoped.subbedOn > 0 || scoped.subbedOff > 0) && (
                                    <StatGroup title="Sustituciones" tiles={groups.subs} />
                                )}

                                {scopedActions.length > 0 && (
                                    <section className={styles.card} aria-label="Otras acciones">
                                        <header className={styles.cardHead}>
                                            <h2 className={styles.cardTitle}>Otras acciones registradas</h2>
                                        </header>
                                        <ul className={styles.actions}>
                                            {scopedActions.map((action) => (
                                                <li key={action.type} className={styles.action}>
                                                    <span className={styles.actionLabel}>{action.label}</span>
                                                    <span className={styles.actionCount}>{action.count}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                )}

                {tab === 'trayectoria' && (
                    <div id="panel-trayectoria" role="tabpanel" aria-labelledby="tab-trayectoria" className={styles.panel}>
                        <section className={styles.card}>
                            <header className={styles.cardHead}>
                                <h2 className={styles.cardTitle}>Trayectoria</h2>
                            </header>
                            {profile.seasons.length > 0 ? (
                                <SeasonTable seasons={profile.seasons} totals={profile.totals} />
                            ) : (
                                <EmptyMatches profile={profile} />
                            )}
                        </section>
                    </div>
                )}
            </main>

            {exportando && <PlayerExportModal profile={profile} onClose={() => setExportando(false)} />}

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

function StatGroup({ title, tiles, note }: { title: string; tiles: Tile[]; note?: string }) {
    return (
        <section className={styles.card} aria-label={title}>
            <header className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{title}</h2>
            </header>
            {note && <p className={styles.groupNote}>{note}</p>}
            <dl className={styles.tiles}>
                {tiles.map((tile) => (
                    <div key={tile.key} className={styles.tile}>
                        <dd
                            className={`${styles.tileValue} ${
                                tile.value === '–'
                                    ? styles.tileEmpty
                                    : tile.tone === 'caution'
                                      ? styles.toneCaution
                                      : tile.tone === 'danger'
                                        ? styles.toneDanger
                                        : tile.tone === 'accent'
                                          ? styles.toneAccent
                                          : ''
                            }`}
                        >
                            {tile.value}
                        </dd>
                        <dt className={styles.tileLabel}>
                            {tile.label}
                            {tile.hint ? <span className={styles.tileHint}> · {tile.hint}</span> : null}
                        </dt>
                    </div>
                ))}
            </dl>
        </section>
    );
}
