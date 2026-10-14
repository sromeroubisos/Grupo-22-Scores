'use client';

import {
    UPGRADES,
    UPGRADE_MAX_LEVEL,
    formatMoney,
    upgradeBlock,
    upgradeCost,
    upgradeLevel,
    upkeepOf,
    upkeepStep,
    type CoachState,
    type UpgradeId,
} from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

/**
 * Las mejoras del club. Es la tienda de El Interino, pero sin partida especial:
 * se paga con la misma caja que paga el micro. Cada tarjeta dice el costo antes
 * que el beneficio, y el botón deshabilitado dice qué falta.
 */
export default function UpgradesBoard({
    state,
    onBuy,
}: {
    state: CoachState;
    onBuy: (id: UpgradeId) => void;
}) {
    const caja = state.club.finances.caja;
    const upkeep = upkeepOf(state.club, state.club.finances);

    return (
        <>
            <p className={styles.objectiveNote}>
                Hay {formatMoney(caja)} en la caja. Lo que pongas acá queda para siempre en el club,
                pero no vuelve: es la misma plata que paga el micro si se clasifica al Interior.
                Si cambiás de club, las mejoras se quedan donde estaban. Y no son gratis después:
                cada nivel cuesta mantenimiento todos los años
                {upkeep > 0 ? ` (hoy ${formatMoney(upkeep)} por año)` : ''}.
            </p>

            <ul className={styles.upgradeGrid}>
                {UPGRADES.map((u) => {
                    const level = upgradeLevel(state.club, u.id);
                    const cost = upgradeCost(state, u.id);
                    const block = upgradeBlock(state, u.id);
                    return (
                        <li key={u.id} className={styles.upgradeCard}>
                            <div className={styles.upgradeHead}>
                                <span className={styles.upgradeName}>{u.name}</span>
                                <span
                                    className={styles.upgradePips}
                                    role="img"
                                    aria-label={`Nivel ${level} de ${UPGRADE_MAX_LEVEL}`}
                                >
                                    {Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => (
                                        <span
                                            key={i}
                                            className={`${styles.upgradePip} ${i < level ? styles.upgradePipOn : ''}`}
                                        />
                                    ))}
                                </span>
                            </div>
                            <p className={styles.upgradeText}>{u.text}</p>
                            <p className={styles.upgradeEffect}>{u.perLevel}</p>

                            {cost === null ? (
                                <p className={styles.upgradeDone}>Al máximo</p>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={styles.upgradeBuy}
                                        disabled={block !== null}
                                        onClick={() => onBuy(u.id)}
                                    >
                                        {level === 0 ? 'Contratar' : `Subir a nivel ${level + 1}`} · {formatMoney(cost)}
                                    </button>
                                    <p className={styles.upgradeEffect}>
                                        Después, {formatMoney(upkeepStep(state, u.id))} más por año de mantenimiento.
                                    </p>
                                    {block === 'caja' && (
                                        <p className={styles.disabledNote}>
                                            Faltan {formatMoney(cost - caja)} en la caja.
                                        </p>
                                    )}
                                    {block === 'deuda' && (
                                        <p className={styles.disabledNote}>
                                            Con la deuda complicada no se compra nada: hay que bajar de tres meses de deuda.
                                        </p>
                                    )}
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
