// La ficha de una selección del Mundial de hockey.
//
// No hay fila en la base: todo sale del feed de la FIH (ver
// `server/worldCupProfiles.ts`). Por competencia se muestran la posición en el
// grupo, el fixture con resultados y el plantel, y cada jugadora abre su
// propia ficha.
//
// Un país puede jugar las dos competencias. Cuando el id no dice el género
// —el viejo `fih-team-ARG`, el que ponen las filas de partidos— la ficha
// muestra las dos, cada una en su bloque.

import Link from 'next/link';

import type { WorldCupSquadPlayer, WorldCupStanding, WorldCupTeamProfile as Profile } from '@/lib/server/worldCupProfiles';

import WorldCupMatchList from './WorldCupMatchList';
import styles from './WorldCup.module.css';

function Standing({ standing }: { standing: WorldCupStanding }) {
    const cells: Array<{ value: string; label: string }> = [
        { value: standing.rank !== null ? `${standing.rank}º` : '—', label: standing.pool },
        { value: String(standing.played ?? 0), label: 'jugados' },
        { value: `${standing.wins ?? 0}-${standing.draws ?? 0}-${standing.losses ?? 0}`, label: 'G-E-P' },
        { value: `${standing.goalsFor ?? 0}:${standing.goalsAgainst ?? 0}`, label: 'goles' },
        { value: String(standing.points ?? 0), label: 'puntos' },
    ];

    return (
        <ul className={styles.stats} aria-label={`Posición en ${standing.pool}`}>
            {cells.map((cell) => (
                <li key={cell.label} className={styles.stat}>
                    <span className={styles.statValue}>{cell.value}</span>
                    <span className={styles.statLabel}>{cell.label}</span>
                </li>
            ))}
        </ul>
    );
}

export function Squad({ players, emptyText }: { players: WorldCupSquadPlayer[]; emptyText: string }) {
    if (players.length === 0) {
        return <p className={styles.empty}>{emptyText}</p>;
    }

    return (
        <ul className={styles.squad}>
            {players.map((player) => {
                const detail = [
                    player.isGoalkeeper ? 'Arquera' : null,
                    player.caps !== null ? `${player.caps} ${player.caps === 1 ? 'cap' : 'caps'}` : null,
                ].filter(Boolean).join(' · ');

                return (
                    <li key={player.ref}>
                        <Link href={`/players/${player.ref}`} className={styles.squadItem}>
                            <span className={styles.squadNumber} aria-hidden="true">
                                {player.number ?? '—'}
                            </span>
                            <span className={styles.squadBody}>
                                <span className={styles.squadName}>{player.name}</span>
                                {detail && <span className={styles.squadMeta}>{detail}</span>}
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

export default function WorldCupTeamProfile({ profile }: { profile: Profile }) {
    // Con una sola competencia el nombre de esa competencia va arriba, en la
    // cabecera; con dos, cada bloque dice la suya y la cabecera no elige.
    const single = profile.competitions.length === 1 ? profile.competitions[0] : null;

    return (
        <div className={styles.page}>
            <Link href="/noticias" className={styles.backLink}>Volver a noticias</Link>

            <header className={styles.hero}>
                {/* eslint-disable-next-line @next/next/no-img-element -- bandera del CDN de la FIH; está sobre el pliegue. */}
                <img src={profile.flagUrl} alt="" className={styles.crest} />
                <div className={styles.heroBody}>
                    <h1 className={styles.heroTitle}>{profile.name}</h1>
                    <p className={styles.heroMeta}>
                        <span className={styles.badge}>Selección</span>
                        <span className={styles.dot} aria-hidden="true">·</span>
                        {single ? (
                            <Link href={`/tournaments/${single.competition.tournamentId}`}>{single.competition.name}</Link>
                        ) : (
                            <span>Hockey sobre césped</span>
                        )}
                    </p>
                </div>
            </header>

            {profile.competitions.map((entry) => (
                <section key={entry.ref} className={styles.competitionBlock} aria-labelledby={`comp-${entry.ref}`}>
                    <h2 id={`comp-${entry.ref}`} className={styles.competitionName}>
                        <Link href={`/tournaments/${entry.competition.tournamentId}`}>{entry.competition.name}</Link>
                    </h2>

                    {entry.standings.map((standing) => (
                        <Standing key={standing.pool} standing={standing} />
                    ))}

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Partidos</h3>
                        <WorldCupMatchList matches={entry.matches} empty="El fixture todavía no publica partidos para esta selección." />
                    </div>

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            Plantel{entry.squad.length > 0 ? ` (${entry.squad.length})` : ''}
                        </h3>
                        <Squad players={entry.squad} emptyText="La FIH todavía no publicó el plantel de esta selección." />
                    </div>
                </section>
            ))}
        </div>
    );
}
