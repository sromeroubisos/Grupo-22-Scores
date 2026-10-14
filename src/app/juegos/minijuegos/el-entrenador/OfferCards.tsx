'use client';

import {
    competitionName,
    getClub,
    getUnion,
    initialFinances,
    type ClubDef,
    type ClubOffer,
    type OfferTier,
    type WorldState,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

/**
 * Ciudad y unión, sin repetir cuando se llaman igual: "Formosa · Formosa" parece
 * un error. Si no están verificadas, lo dice: no se inventa una ciudad.
 */
export function placeOf(club: ClubDef): string {
    const union = getUnion(club.unionId)?.short;
    const parts = [club.city, union && union !== club.city ? union : ''].filter((p) => p !== '');
    return parts.length > 0 ? parts.join(' · ') : 'Ciudad sin verificar';
}

const TIER_WORD: Record<OfferTier, string> = {
    A: 'de los de arriba',
    B: 'del medio',
    C: 'de los de abajo',
};

const TIER_CLASS: Record<OfferTier, string> = {
    A: styles.tierA,
    B: styles.tierB,
    C: styles.tierC,
};

/**
 * Las ofertas de trabajo como tarjetas para elegir una. Cada una dice dónde está
 * el club en su torneo y qué te van a pedir: es lo que se firma.
 */
export default function OfferCards({
    offers,
    world,
    selectedId,
    onSelect,
    label,
}: {
    offers: readonly ClubOffer[];
    world: WorldState;
    selectedId: string | null;
    onSelect: (clubId: string) => void;
    label: string;
}) {
    return (
        <div className={styles.offerGrid} role="radiogroup" aria-label={label}>
            {offers.map((offer) => {
                const club = getClub(offer.clubId);
                if (!club) return null;
                const fin = initialFinances(club);
                const place = placeOf(club);
                const selected = selectedId === offer.clubId;
                return (
                    <button
                        key={offer.clubId}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`${styles.offerCard} ${selected ? styles.offerSelected : ''}`}
                        onClick={() => onSelect(offer.clubId)}
                    >
                        <span className={styles.offerHead}>
                            <ClubCrest club={club} small />
                            <span className={styles.clubOptionText}>
                                <span className={styles.clubOptionName}>{club.name}</span>
                                <span className={styles.clubOptionMeta}>{place}</span>
                            </span>
                            <span className={`${styles.tierChip} ${TIER_CLASS[offer.tier]}`}>Tier {offer.tier}</span>
                        </span>
                        <span className={styles.offerLine}>
                            {competitionName(offer.competitionId)} · {offer.rank}° de {offer.teams} por fuerza,{' '}
                            {TIER_WORD[offer.tier]}.
                        </span>
                        <span className={styles.offerAsk}>{offer.objective.text}</span>
                        <span className={styles.offerStats}>
                            <span>
                                <span className={styles.statLabel}>Socios</span>
                                <span className={styles.statValue}>{fin.socios}</span>
                            </span>
                            <span>
                                <span className={styles.statLabel}>Estructura</span>
                                <span className={styles.statValue}>{fin.estructura}</span>
                            </span>
                            <span>
                                <span className={styles.statLabel}>Gente</span>
                                <span className={styles.statValue}>{fin.hinchada}</span>
                            </span>
                            <span>
                                <span className={styles.statLabel}>Fuerza</span>
                                <span className={styles.statValue}>{(world.ratings[offer.clubId] ?? 0).toFixed(1)}</span>
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
