// La ficha de una jugadora del Mundial de hockey.
//
// No hay fila en `people`: sale del plantel que publica la FIH y de las
// planillas de Sportradar (ver `server/worldCupProfiles.ts`). Lo que se ve:
// quién es —dorsal, puesto, caps, selección—, cómo le fue partido por partido
// y con quiénes juega.
//
// Cuando ninguna planilla se pudo leer, la ficha lo DICE en vez de mostrar
// ceros: un cero se lee como "jugó y no hizo nada", que es otra cosa.

import Link from 'next/link';

import type { WorldCupPlayerProfile as Profile } from '@/lib/server/worldCupProfiles';

import WorldCupMatchList from './WorldCupMatchList';
import { Squad } from './WorldCupTeamProfile';
import styles from './WorldCup.module.css';

/** Las iniciales, para cuando el feed no publica foto. */
function initialsOf(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export default function WorldCupPlayerProfile({ profile }: { profile: Profile }) {
    const role = profile.competition.genderLabel === 'Femenino' ? 'Jugadora' : 'Jugador';
    const keeper = profile.competition.genderLabel === 'Femenino' ? 'Arquera' : 'Arquero';

    const stats: Array<{ value: string; label: string }> = [
        { value: String(profile.totals.played), label: profile.totals.played === 1 ? 'partido' : 'partidos' },
        { value: String(profile.totals.goals), label: profile.totals.goals === 1 ? 'gol' : 'goles' },
    ];
    if (profile.totals.penaltyStrokes > 0) {
        stats.push({ value: String(profile.totals.penaltyStrokes), label: 'de penal' });
    }
    const cards = profile.totals.greenCards + profile.totals.yellowCards + profile.totals.redCards;
    if (cards > 0) {
        stats.push({ value: String(cards), label: cards === 1 ? 'tarjeta' : 'tarjetas' });
    }

    return (
        <div className={styles.page}>
            <Link href={`/clubs/${profile.team.ref}`} className={styles.backLink}>
                Volver a {profile.team.name}
            </Link>

            <header className={styles.hero}>
                {profile.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto del CDN de la FIH; está sobre el pliegue.
                    <img src={profile.image} alt={profile.name} className={styles.portrait} />
                ) : (
                    <span className={`${styles.portrait} ${styles.portraitEmpty}`} aria-hidden="true">
                        {initialsOf(profile.name)}
                    </span>
                )}

                <div className={styles.heroBody}>
                    <h1 className={styles.heroTitle}>{profile.name}</h1>
                    <p className={styles.heroMeta}>
                        {profile.number !== null && <span className={styles.badge}>#{profile.number}</span>}
                        {profile.isGoalkeeper && <span className={styles.badge}>{keeper}</span>}
                        <Link href={`/clubs/${profile.team.ref}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- bandera chica al lado del nombre del país. */}
                            <img src={profile.team.flagUrl} alt="" className={styles.miniFlag} />
                            {profile.team.name}
                        </Link>
                        <span className={styles.dot} aria-hidden="true">·</span>
                        <Link href={`/tournaments/${profile.competition.tournamentId}`}>{profile.competition.name}</Link>
                    </p>
                </div>
            </header>

            <section className={styles.section} aria-labelledby="wc-numeros">
                <h2 id="wc-numeros" className={styles.sectionTitle}>En el Mundial</h2>
                {profile.linesUnavailable ? (
                    <p className={styles.empty}>
                        Las planillas del Mundial no están disponibles en este momento, así que no se pueden
                        contar sus partidos ni sus goles. El fixture de su selección sí está más abajo.
                    </p>
                ) : (
                    <ul className={styles.stats} aria-label="Números en el Mundial">
                        {stats.map((stat) => (
                            <li key={stat.label} className={styles.stat}>
                                <span className={styles.statValue}>{stat.value}</span>
                                <span className={styles.statLabel}>{stat.label}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {profile.linesMissing > 0 && !profile.linesUnavailable && (
                    <p className={styles.sectionNote}>
                        Son los números de los partidos con planilla publicada: {profile.linesMissing}{' '}
                        {profile.linesMissing === 1 ? 'partido quedó' : 'partidos quedaron'} sin leer.
                    </p>
                )}
                {profile.caps !== null && (
                    <p className={styles.sectionNote}>
                        {profile.caps} {profile.caps === 1 ? 'partido' : 'partidos'} con {profile.team.name} en toda su carrera, según la FIH.
                    </p>
                )}
            </section>

            <section className={styles.section} aria-labelledby="wc-partidos">
                <h2 id="wc-partidos" className={styles.sectionTitle}>Los partidos de {profile.team.name}</h2>
                <WorldCupMatchList
                    matches={profile.matches}
                    empty="El fixture todavía no publica partidos para esta selección."
                    showLines
                />
            </section>

            <section className={styles.section} aria-labelledby="wc-plantel">
                <h2 id="wc-plantel" className={styles.sectionTitle}>
                    El resto del plantel{profile.teammates.length > 0 ? ` (${profile.teammates.length})` : ''}
                </h2>
                <Squad
                    players={profile.teammates}
                    emptyText={`La FIH no publica más nombres en el plantel de ${profile.team.name}.`}
                />
            </section>

            <p className={styles.sectionNote}>
                {role} del Mundial de Hockey: la ficha se arma con lo que publica la FIH, no con datos cargados a mano.
            </p>
        </div>
    );
}
