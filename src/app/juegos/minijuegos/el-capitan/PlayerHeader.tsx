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

    /** ¿La planilla tiene algo que contar? Ver el comentario del bloque. */
    const hayPlanilla = state.national.caps > 0 || state.titles.length > 0 || state.damage.hia > 0;

    return (
        <>
            <div className={styles.header}>
                <div className={styles.ovr}>
                    {player.ovr}
                    <span className={styles.ovrLabel}>MEDIA</span>
                </div>

                <div className={styles.identity}>
                    <p className={styles.name}>{player.name} {player.surname}</p>
                    <p className={styles.role}>
                        {family.labelEs} · {player.number} · {player.age} años
                        {/* La brecha, que es la otra mitad de la historia que
                            cuenta este juego: el que apuntó más alto y se quedó
                            sin años tiene que poder VERLO mientras pasa, no
                            enterarse en el retiro. Sin esto, terminar en 72 con
                            techo 78 se lee como una estafa y no como una
                            decisión.

                            Y lo construido al lado, porque es el REGISTRO DE TUS
                            DECISIONES: el techo sorteado no lo elegiste, esos
                            cuatro puntos sí. Aparece recién cuando hay algo
                            construido —a los 18 un "(+0)" no cuenta nada.

                            Vive acá y no adentro del chip de la media porque en
                            62 px no entra a un tamaño que se lea; el porqué
                            completo está en `.ceiling`. */}
                        {' · '}
                        <span className={styles.ceiling}>
                            techo {Math.round(techo)}
                            {construido > 0 ? ` (+${construido} construido)` : ''}
                        </span>
                    </p>
                </div>

                {/* La planilla aparece cuando tiene algo que contar.
                    Con los tres en cero ocupa el tercio derecho de la cabecera
                    —el lugar más caro de la única pantalla donde el alto ya
                    falta— para decir que a los 18 años todavía no pasó nada. Eso
                    no es un dato: es un estado vacío disfrazado de dato.
                    Y aparecer la primera vez que un número deja de ser cero es,
                    además, un momento del juego. */}
                {hayPlanilla && (
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
                )}
            </div>

            <div className={styles.belongingBar}>
                <div className={styles.belongingTop}>
                    <span className={styles.belongingTier}>
                        {tierDef.icon} {tierDef.labelEs}
                    </span>
                    <span className={`${styles.belongingClub} ${styles.belongingClubMain}`}>
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
