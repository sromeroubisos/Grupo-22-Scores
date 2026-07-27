'use client';

import type { GameEvent } from '@/features/career';
import { DIRECTION_LABELS } from '@/features/career';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

interface Props {
    event: GameEvent;
    onChoose: (optionId: string) => void;
}

// Una sola situación por pantalla. Nunca se muestran números internos ni
// modificaciones de atributos: la consecuencia se descubre en el revelado.
// Las opciones son tarjetas: en desktop van en 2 columnas cuando hay 2.
export default function EventCard({ event, onChoose }: Props) {
    const two = event.options.length === 2;
    return (
        <section className={styles.event}>
            <p className={styles.eventCategory}>{categoryLabel(event.category)}</p>
            <h2 className={styles.eventTitle}>{event.title}</h2>
            <p className={styles.eventText}>{event.text}</p>
            <div className={`${styles.options} ${two ? styles.optionsTwo : ''}`}>
                {event.options.map((opt) => (
                    <button key={opt.id} type="button" className={styles.optionBtn} onClick={() => onChoose(opt.id)}>
                        {opt.offer && (
                            <ClubBadge clubId={opt.offer.clubId} clubName={opt.offer.clubName} size={40} />
                        )}
                        <span className={styles.optionBody}>
                            <span className={styles.optionLabel}>{opt.label}</span>
                            {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                            {opt.offer && (
                                <>
                                    <span className={styles.offerMeta}>
                                        <span className={styles.offerLeague}>{opt.offer.league}</span>
                                        <span className={`${styles.offerDir} ${styles[`dir_${opt.offer.direction}`]}`}>
                                            {DIRECTION_LABELS[opt.offer.direction]}
                                        </span>
                                    </span>
                                    {opt.offer.reason && (
                                        <span className={styles.offerReason}>{opt.offer.reason}</span>
                                    )}
                                </>
                            )}
                        </span>
                        <svg className={styles.optionChevron} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                ))}
            </div>
        </section>
    );
}

function categoryLabel(category: GameEvent['category']): string {
    switch (category) {
        case 'club': return 'Club';
        case 'injury': return 'Lesión';
        case 'national-team': return 'Selección';
        case 'personal': return 'Personal';
        case 'tactical': return 'Táctica';
        case 'media': return 'Prensa';
        case 'milestone': return 'Hito';
        default: return 'Decisión';
    }
}
