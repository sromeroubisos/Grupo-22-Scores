'use client';

import type { PenaltyChoices } from '../../../../features/manager/engine/phases.ts';
import type { PenaltyDecision } from '../../../../features/manager/engine/expectedPoints.ts';
import styles from './manager.module.css';

interface Props {
    choices: PenaltyChoices;
    clubName: string;
    minute: number;
    /** Metros hasta los palos desde la marca. */
    distance: number;
    /** Quien patearía a los palos. */
    kicker: string | null;
    /** Tu ventaja en el marcador (negativa si vas abajo). */
    margin: number;
    onDecide: (decision: PenaltyDecision) => void;
}

const ORDER: PenaltyDecision[] = ['palos', 'touch', 'tap', 'scrum'];

const marginText = (margin: number): string => {
    if (margin === 0) return 'El partido está empatado.';
    return margin > 0 ? `Ganás por ${margin}.` : `Perdés por ${-margin}.`;
};

export default function PenaltyPanel({ choices, clubName, minute, distance, kicker, margin, onDecide }: Props) {
    const options: Record<PenaltyDecision, { title: string; hint: string }> = {
        palos: {
            title: 'A los palos',
            hint: `${Math.round(choices.kickProb * 100)}% de acertar. Son 3 puntos${kicker ? `, patea ${kicker}` : ''}. Si falla, el rival saca desde su 22.`,
        },
        touch: {
            title: 'A touch',
            hint: 'Ganás metros y sacás la touch en campo rival. Dependés de tu lanzador y tus saltadores.',
        },
        tap: {
            title: 'Jugarlo rápido',
            hint: 'Tap and go, sin dejar que la defensa se acomode. Arriesgás perder la pelota en el primer ruck.',
        },
        scrum: {
            title: 'Melé',
            hint: 'Tus delanteros empujan contra los suyos. Premia a un pack fuerte y castiga a uno flojo.',
        },
    };
    return (
        <div className={styles.decision} role="group" aria-labelledby="decision-title">
            <p className={styles.decisionKicker}>Partido detenido · {Math.floor(minute)}&apos;</p>
            <h3 id="decision-title" className={styles.decisionTitle}>
                Penal a favor de {clubName}
            </h3>
            <p className={styles.decisionSub}>
                A unos {Math.round(distance)} metros de los palos. {marginText(margin)}
            </p>
            <div className={styles.decisionGrid}>
                {ORDER.map((key) => (
                    <button key={key} type="button" className={styles.decisionBtn} onClick={() => onDecide(key)}>
                        <span className={styles.decisionName}>
                            {options[key].title}
                            {choices.auto === key && <span className={styles.decisionTag}>Lo que haría el motor</span>}
                        </span>
                        <span className={styles.decisionHint}>{options[key].hint}</span>
                        <span className={styles.decisionValue}>≈ {choices.scores[key].toFixed(1).replace('.', ',')} puntos esperados</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
