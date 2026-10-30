'use client';

import { useMemo, useState } from 'react';
import type { ID } from '../../../../features/manager/types/index.ts';
import { countriesOf } from '../../../../features/manager/game/queries.ts';
import type { ChooseView } from '../../../../features/manager/worker/protocol.ts';
import { ClubShield } from './Shared.tsx';
import styles from './manager.module.css';

interface Props {
    choose: ChooseView;
    onStart: (clubId: ID, name: string) => void;
    onBack: () => void;
}

export default function ChooseClub({ choose, onStart, onBack }: Props) {
    const leagues = choose.choices;
    const countries = useMemo(() => countriesOf(leagues), [leagues]);
    const [country, setCountry] = useState<string>(countries[0]);
    const [leagueId, setLeagueId] = useState<ID>(
        () => leagues.find((l) => l.countryName === countries[0])!.competition.id,
    );
    const [clubId, setClubId] = useState<ID | null>(null);
    const [name, setName] = useState('');

    const inCountry = useMemo(() => leagues.filter((l) => l.countryName === country), [leagues, country]);
    const league = inCountry.find((l) => l.competition.id === leagueId) ?? inCountry[0];

    const trimmed = name.trim();
    const missing = !clubId && !trimmed
        ? 'Elegí un club y escribí tu nombre para empezar.'
        : !clubId
            ? 'Elegí un club para empezar.'
            : !trimmed
                ? 'Escribí tu nombre para empezar.'
                : null;

    return (
        <section aria-labelledby="choose-title">
            <h2 id="choose-title" className={styles.sectionTitle}>Elegí tu club</h2>
            <p className={styles.lead}>
                Cada liga tiene su plantel y su nivel. Los clubes están ordenados por reputación; el número es el
                promedio del XV que pondrías hoy.
            </p>

            <div className={styles.choiceGroup} role="radiogroup" aria-label="País">
                {countries.map((name) => (
                    <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={name === country}
                        className={`${styles.choice} ${styles.leagueChoice}`}
                        onClick={() => {
                            setCountry(name);
                            setLeagueId(leagues.find((l) => l.countryName === name)!.competition.id);
                            setClubId(null);
                        }}
                    >
                        {name}
                    </button>
                ))}
            </div>

            <div className={styles.choiceGroup} role="radiogroup" aria-label="Liga">
                {inCountry.map(({ competition }) => (
                    <button
                        key={competition.id}
                        type="button"
                        role="radio"
                        aria-checked={competition.id === league.competition.id}
                        className={`${styles.choice} ${styles.leagueChoice}`}
                        onClick={() => {
                            setLeagueId(competition.id);
                            setClubId(null);
                        }}
                    >
                        {competition.shortName}
                    </button>
                ))}
            </div>

            <p className={styles.muted}>{league.competition.name} · {league.clubs.length} clubes</p>

            <div className={styles.clubList} role="radiogroup" aria-label={`Clubes de ${league.competition.name}`}>
                {league.clubs.map((club) => (
                    <button
                        key={club.id}
                        type="button"
                        role="radio"
                        aria-checked={club.id === clubId}
                        className={styles.choice}
                        onClick={() => setClubId(club.id)}
                    >
                        <ClubShield club={club} />
                        <span className={styles.choiceText}>
                            <span className={styles.choiceName}>{club.name}</span>
                            <span className={styles.choiceMeta}>{club.city} · reputación {club.reputation}</span>
                        </span>
                        <span className={styles.choiceRating}>
                            {choose.strengths[club.id]}
                            <small>XV</small>
                        </span>
                    </button>
                ))}
            </div>

            <div className={styles.startBar}>
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>Tu nombre</span>
                    <input
                        className={styles.input}
                        value={name}
                        maxLength={40}
                        autoComplete="off"
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}
                    disabled={missing !== null}
                    onClick={() => clubId && onStart(clubId, trimmed)}
                >
                    Empezar la temporada
                </button>
                <button type="button" className={styles.btn} onClick={onBack}>
                    Volver
                </button>
                {missing && <p className={styles.hint}>{missing}</p>}
            </div>
        </section>
    );
}
