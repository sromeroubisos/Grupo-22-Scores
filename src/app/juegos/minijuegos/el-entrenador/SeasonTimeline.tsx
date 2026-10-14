import { getClub, type SeasonEntry } from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

export function seasonNote(s: SeasonEntry): string {
    const bits: string[] = [];
    if (s.nacional) bits.push('Campeón del Nacional de Clubes');
    if (s.tdi === 'campeon') bits.push('Campeón del Interior');
    else if (s.tdi) bits.push(`Interior: ${s.tdi}`);
    if (s.champion) bits.push('Campeón');
    if (s.movement === 'ascenso') bits.push('Ascenso');
    if (s.movement === 'descenso') bits.push('Descenso');
    if (bits.length === 0) bits.push(s.objectiveMet ? 'Objetivo cumplido' : 'Objetivo no cumplido');
    return bits.join(' · ');
}

/** La trayectoria, temporada a temporada, con la posición y lo que pasó. */
export default function SeasonTimeline({ seasons }: { seasons: SeasonEntry[] }) {
    if (seasons.length === 0) {
        return <p className={styles.objectiveNote}>Todavía no jugaste ninguna temporada.</p>;
    }
    return (
        <div className={styles.timeline}>
            {[...seasons].reverse().map((s) => {
                const club = getClub(s.clubId);
                const good = s.champion || s.movement === 'ascenso' || s.nacional || s.tdi === 'campeon';
                const bad = s.movement === 'descenso' || (!s.objectiveMet && !good);
                return (
                    <div
                        key={`${s.season}-${s.clubId}`}
                        className={`${styles.season} ${good ? styles.seasonGood : ''} ${bad ? styles.seasonBad : ''}`}
                    >
                        <span className={styles.seasonYear}>{s.year}</span>
                        {club && <ClubCrest club={club} small />}
                        <span className={styles.seasonBody}>
                            <span className={styles.seasonComp}>
                                {club?.short ?? s.clubId} · {s.competitionName}
                            </span>
                            <span className={styles.seasonNote}>{seasonNote(s)}</span>
                        </span>
                        <span className={styles.seasonPos}>
                            {s.position}°<span className={styles.seasonOf}>/{s.teams}</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
