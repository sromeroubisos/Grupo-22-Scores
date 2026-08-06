'use client';

import type { CaptainState } from '@/features/captain';
import {
    BELONGING_TIERS,
    belongingOf,
    belongingTier,
    clubLabel,
    competitionLabel,
    getFamily,
    potentialOf,
    TRACK_LABEL,
} from '@/features/captain';
import styles from './capitan.module.css';

/**
 * La cabecera del jugador.
 *
 * La jerarquía es la del rugby y no la del fútbol: los caps van antes que la
 * vitrina (CLAUDE.md §5). Y la Pertenencia tiene su propia barra debajo, porque
 * es la moneda que define el final del juego y no una ficha más.
 */
export default function PlayerHeader({ state }: { state: CaptainState }) {
    const { player } = state;
    const family = getFamily(player.family);
    const pertenencia = belongingOf(state.belonging, player.clubId);
    const tier = belongingTier(pertenencia);
    const tierDef = BELONGING_TIERS.find((t) => t.id === tier)!;

    const techo = potentialOf(player);
    const construido = Math.round(player.built);

    const club = clubLabel(player.clubId);
    const competencia = competitionLabel(player.clubId);

    return (
        <>
            <div className={styles.header}>
                <div className={styles.ovr}>
                    {player.ovr}
                    <span className={styles.ovrLabel}>MEDIA</span>
                    {/* La brecha, que es la otra mitad de la historia que cuenta
                        este juego: el que apuntó más alto y se quedó sin años
                        tiene que poder VERLO mientras pasa, no enterarse en el
                        retiro. Sin esta línea, terminar en 72 con techo 78 se
                        lee como una estafa y no como una decisión.

                        Y lo construido al lado, porque es el REGISTRO DE TUS
                        DECISIONES: el techo sorteado no lo elegiste, esos cuatro
                        puntos sí. Aparece recién cuando hay algo construido —a
                        los 18 un "(+0)" no cuenta nada. */}
                    <span className={styles.ovrCeiling}>
                        Techo {Math.round(techo)}
                        {construido > 0 ? ` (+${construido} construido)` : ''}
                    </span>
                </div>

                <div className={styles.identity}>
                    <p className={styles.name}>{player.name} {player.surname}</p>
                    <p className={styles.role}>
                        {family.labelEs} · {player.number} · {player.age} años
                    </p>
                </div>

                <div className={styles.headerStats}>
                    {/* Los caps primero: valen más que los títulos. */}
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{state.national.caps}</span>
                        <span className={styles.statLabel}>Caps</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{state.titles.length}</span>
                        <span className={styles.statLabel}>Títulos</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{state.damage.hia}</span>
                        <span className={styles.statLabel}>HIA</span>
                    </div>
                </div>
            </div>

            <div className={styles.belongingBar}>
                <div className={styles.belongingTop}>
                    <span className={styles.belongingTier}>
                        {tierDef.icon} {tierDef.labelEs}
                    </span>
                    <span className={styles.belongingClub}>
                        {club}{competencia ? ` · ${competencia}` : ''}
                    </span>
                </div>
                <div
                    className={styles.track}
                    role="progressbar"
                    aria-valuenow={Math.round(pertenencia)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Pertenencia con ${club}`}
                >
                    <span className={styles.fill} style={{ width: `${Math.min(100, pertenencia)}%` }} />
                </div>
                {state.national.track !== 'club' && (
                    <p className={styles.belongingClub} style={{ marginTop: 8 }}>
                        {TRACK_LABEL[state.national.track]}
                        {state.rival ? ` · te pelea el puesto ${state.rival.name} ${state.rival.surname}` : ''}
                    </p>
                )}
            </div>
        </>
    );
}
