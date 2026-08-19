import Link from 'next/link';
import styles from './ProdeCompetitionCard.module.css';
import {
    formatAbsolute,
    formatCountdown,
    formatDay,
    getCompetitionState,
    getSportLabel,
    isUrgent,
    STATE_LABEL,
    type CompetitionState,
} from './competitionState';
import type { PublicProdeCompetition } from '@/lib/prode/types';

const STATE_CLASS: Record<CompetitionState, string> = {
    live: styles.stateLive,
    open: styles.stateOpen,
    playing: styles.statePlaying,
    done: styles.stateDone,
    idle: styles.stateIdle,
};

export function SportIcon({ sportId, className }: { sportId: string | null; className?: string }) {
    if (sportId === 'rugby') {
        return (
            <svg className={className || styles.sportIcon} viewBox="0 0 24 24" aria-hidden="true">
                <ellipse cx="12" cy="12" rx="10" ry="6.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.7" />
            </svg>
        );
    }

    return (
        <svg className={className || styles.sportIcon} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 6.8l3.2 2.3-1.2 3.7h-4L8.8 9.1z" fill="currentColor" />
        </svg>
    );
}

export function StateBadge({ state, className }: { state: CompetitionState; className?: string }) {
    return (
        <span className={`${styles.state} ${STATE_CLASS[state]} ${className || ''}`}>
            <span className={styles.stateDot} aria-hidden="true" />
            {STATE_LABEL[state]}
        </span>
    );
}

/** El cierre, con la fecha absoluta como texto de servidor y la cuenta regresiva una
 *  vez montado. `now` llega en null hasta que el componente vive en el cliente. */
export function LockTime({ iso, now, className }: { iso: string; now: number | null; className?: string }) {
    const countdown = now === null ? null : formatCountdown(iso, now);
    const urgent = now !== null && isUrgent(iso, now);

    return (
        <time
            dateTime={iso}
            title={formatAbsolute(iso)}
            className={`${className || ''} ${urgent ? styles.countdownUrgent : ''}`.trim()}
        >
            {countdown || formatDay(iso)}
        </time>
    );
}

/**
 * Tarjeta grande de competencia. La usan el lobby (las 10 de la portada) y la
 * pantalla de todas, así que el estado y el escudo se dibujan igual en los dos lados.
 *
 * El escudo entra SIEMPRE por `/api/assets/team-logo`: el proxy resuelve el logo del
 * torneo del lado del servidor y, si no hay ninguno, devuelve el escudo de iniciales
 * estándar del sitio. Por eso no hace falta un estado de imagen rota.
 */
export default function ProdeCompetitionCard({
    competition,
    now,
}: {
    competition: PublicProdeCompetition;
    now: number | null;
}) {
    const state = getCompetitionState(competition);
    const playable = state === 'open' || state === 'live';
    const featured = competition.metadata?.featured === true;
    const { open, total } = competition.stats;

    const fixtureLabel = playable
        ? `${open} ${open === 1 ? 'partido abierto' : 'partidos abiertos'}`
        : total > 0
            ? `${total} ${total === 1 ? 'partido' : 'partidos'}`
            : 'Sin partidos cargados';

    return (
        <Link href={`/prode/${competition.slug}`} className={styles.card}>
            <div className={styles.head}>
                <span className={styles.crest}>
                    {competition.logoUrl ? (
                        <img
                            src={competition.logoUrl}
                            alt=""
                            width={44}
                            height={44}
                            loading="lazy"
                            decoding="async"
                            className={styles.crestImg}
                        />
                    ) : (
                        <SportIcon sportId={competition.sportId} className={styles.crestFallback} />
                    )}
                </span>

                <span className={styles.badges}>
                    <StateBadge state={state} />
                    {competition.viewerIsMember ? (
                        <span className={styles.badge}>Anotado</span>
                    ) : featured ? (
                        <span className={styles.badge}>Destacada</span>
                    ) : null}
                </span>
            </div>

            <div className={styles.body}>
                <h3 className={styles.name}>{competition.name}</h3>
                <p className={styles.meta}>
                    <span className={styles.metaSport}>
                        <SportIcon sportId={competition.sportId} />
                        {getSportLabel(competition.sportId)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                        <span className={styles.metaNum}>{competition.members.totalMembers}</span>
                        {' '}{competition.members.totalMembers === 1 ? 'participante' : 'participantes'}
                    </span>
                </p>
            </div>

            <div className={styles.footer}>
                <span className={styles.fixture}>{fixtureLabel}</span>
                {playable && competition.stats.nextLockAt ? (
                    <span className={styles.lock}>
                        cierra{' '}
                        <LockTime iso={competition.stats.nextLockAt} now={now} className={styles.countdown} />
                    </span>
                ) : null}
            </div>
        </Link>
    );
}
