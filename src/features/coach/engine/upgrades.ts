// Comprar mejoras para el club. Sin azar: comprar no toca el RNG, así que dos
// partidas con la misma semilla que compran lo mismo siguen idénticas, y una que
// no compra nada juega exactamente lo que jugaba antes de que existiera la tienda.

import {
    UPGRADES,
    UPGRADE_COST_FRACTION,
    UPGRADE_EFFECT,
    UPGRADE_MAX_LEVEL,
    UPGRADE_UPKEEP_FRACTION,
    getUpgrade,
    type UpgradeId,
} from '../data/upgrades.ts';
import type { ClubFinances, ClubRuntime, CoachState } from '../types/coach.ts';
import { CUOTA_ANUAL } from './economy.ts';
import { debtState } from './finance.ts';

/** Nivel de una mejora en el club, 0 si no se compró. */
export function upgradeLevel(club: Pick<ClubRuntime, 'upgrades'>, id: UpgradeId): number {
    return club.upgrades?.[id] ?? 0;
}

/** El efecto acumulado de una mejora: nivel × efecto por nivel. */
export function upgradeEffect(club: Pick<ClubRuntime, 'upgrades'>, id: UpgradeId): number {
    return upgradeLevel(club, id) * UPGRADE_EFFECT[id];
}

/**
 * Lo que cuesta el próximo nivel, redondeado a cien mil. `null` si ya está al
 * tope. Escala con lo que el club recauda por cuotas: es una fracción de un año
 * de socios, no una cifra fija que al chico le resulta imposible y al grande
 * gratis.
 */
export function upgradeCost(state: CoachState, id: UpgradeId): number | null {
    const level = upgradeLevel(state.club, id);
    if (level >= UPGRADE_MAX_LEVEL) return null;
    const raw = state.club.finances.socios * CUOTA_ANUAL * UPGRADE_COST_FRACTION[level];
    return Math.round(raw / 100_000) * 100_000;
}

/** Cuántos niveles de mejoras tiene el club, sumando todas. */
export function upgradeLevels(club: Pick<ClubRuntime, 'upgrades'>): number {
    return UPGRADES.reduce((sum, u) => sum + upgradeLevel(club, u.id), 0);
}

/**
 * Lo que cuesta mantener las mejoras compradas, por año (`UPGRADE_UPKEEP_FRACTION`).
 * Escala con las cuotas, como el precio.
 */
export function upkeepOf(club: Pick<ClubRuntime, 'upgrades'>, finances: Pick<ClubFinances, 'socios'>): number {
    const cuotas = finances.socios * CUOTA_ANUAL;
    return Math.round(
        UPGRADES.reduce((sum, u) => sum + upgradeLevel(club, u.id) * UPGRADE_UPKEEP_FRACTION[u.id] * cuotas, 0),
    );
}

/** Lo que agrega UN nivel más de esta mejora al mantenimiento anual. */
export function upkeepStep(state: Pick<CoachState, 'club'>, id: UpgradeId): number {
    return Math.round(state.club.finances.socios * CUOTA_ANUAL * UPGRADE_UPKEEP_FRACTION[id]);
}

export type UpgradeBlock = 'tope' | 'caja' | 'fase' | 'deuda' | null;

/** Por qué no se puede comprar, o `null` si se puede. La UI lo dice tal cual. */
export function upgradeBlock(state: CoachState, id: UpgradeId): UpgradeBlock {
    if (state.phase !== 'preseason') return 'fase';
    const cost = upgradeCost(state, id);
    if (cost === null) return 'tope';
    // Con la deuda complicada o peor, la subcomisión no firma una sola compra:
    // primero se paga lo que se debe (doc 2.4).
    if (debtState(state).restrictions.upgradesBlocked) return 'deuda';
    // Sin crédito: una mejora se paga con lo que hay. El club en rojo no se
    // endeuda más para comprarse un gimnasio.
    if (state.club.finances.caja < cost) return 'caja';
    return null;
}

/**
 * Compra el próximo nivel. Si no se puede, devuelve el MISMO estado: la UI no
 * tiene que adivinar si la compra salió, compara referencias.
 */
export function buyUpgrade(state: CoachState, id: UpgradeId): CoachState {
    if (!getUpgrade(id) || upgradeBlock(state, id) !== null) return state;
    const cost = upgradeCost(state, id) as number;
    return {
        ...state,
        club: {
            ...state.club,
            finances: { ...state.club.finances, caja: state.club.finances.caja - cost },
            upgrades: { ...state.club.upgrades, [id]: upgradeLevel(state.club, id) + 1 },
        },
    };
}
