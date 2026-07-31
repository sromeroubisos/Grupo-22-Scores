'use client';

import type { CaptainState } from '@/features/captain';
import {
    BELONGING_TIERS,
    belongingOf,
    belongingTier,
    clubLabel,
    getFamily,
    TRACK_LABEL,
} from '@/features/captain';
import styles from './capitan.module.css';

/**
 * El retiro.
 *
 * Dos reglas del epílogo, y son las que hacen que el sistema de conmociones sea
 * responsable en vez de sensacionalista:
 *
 *   · CERO DETERMINISMO. Con 🧠 alto sube la chance de un epílogo difícil, pero
 *     nunca es seguro — en la vida real tampoco lo es. En el estudio
 *     prospectivo de 2025 la cognición de los ex jugadores a los 44 era
 *     prácticamente normal y no hubo un solo caso de CTE probable.
 *   · NADA DE MELODRAMA. El epílogo correcto no es "te olvidás de tus hijos".
 *     Lo que sí estaba muy elevado era la salud mental, y eso se cuenta sin
 *     subrayarlo.
 *
 * El sorteo no vive acá: el texto se elige con el estado, que ya es
 * determinista. La pantalla no tira dados.
 */
function epilogo(state: CaptainState): string {
    const cabeza = state.damage.cabeza;
    const ocultados = state.player.flags['hia-ocultados'] ?? 0;

    // El umbral mira las dos cosas: cuántos golpes y cuántos te callaste.
    const carga = cabeza + ocultados * 8;

    if (carga === 0) {
        return 'A los cuarenta y cuatro te levantás sin que te duela nada y seguís yendo a la cancha los sábados. Te preguntan si volverías a hacerlo y decís que sí sin pensarlo.';
    }
    if (carga < 36) {
        return 'A los cuarenta y cuatro tenés las rodillas de alguien que jugó quince años y nada más. Vas a la cancha los sábados y te sentás en la última fila del buffet.';
    }
    if (carga < 72) {
        return 'A los cuarenta y cuatro te cuesta dormir y hubo un par de años oscuros. Fuiste al psicólogo. Estás bien. Te preguntan si volverías a hacerlo y decís que sí.';
    }
    return 'A los cuarenta y cuatro arrastrás dolores de cabeza que van y vienen, y hubo unos años en que no la pasaste bien. Hiciste el tratamiento y estás mejor. Cuando te preguntan si volverías a hacerlo, te tomás un segundo antes de contestar.';
}

export default function Retirement({
    state,
    onRestart,
}: {
    state: CaptainState;
    onRestart: () => void;
}) {
    const { player } = state;
    const family = getFamily(player.family);

    // La Pertenencia que cuenta es la más alta que alcanzaste en cualquier
    // club: es lo que el rugby recuerda.
    const clubes = Object.entries(state.belonging.byClub).sort((a, b) => b[1] - a[1]);
    const [mejorClubId, mejorPertenencia] = clubes[0] ?? [player.clubId, 0];
    const tier = belongingTier(mejorPertenencia as number);
    const tierDef = BELONGING_TIERS.find((t) => t.id === tier)!;

    const gloriaTotal = state.history.reduce((acc, h) => acc + h.glory, 0);
    const partidos = state.history.reduce((acc, h) => acc + h.matchesPlayed, 0);

    const motivo = player.retirementReason === 'tope-del-puesto'
        ? 'El puesto no da para más años.'
        : player.retirementReason === 'cuerpo'
            ? 'El cuerpo dijo basta antes que la cabeza.'
            : player.retirementReason === 'decision'
                ? 'Te fuiste cuando quisiste vos.'
                : 'Llegó la edad y se notó.';

    const vitalicio = (mejorPertenencia as number) >= 95;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>{state.history.length} temporadas</span>
            <h2 className={styles.finalTitle}>
                {vitalicio
                    ? `La cancha 1 lleva tu nombre`
                    : `Se terminó`}
            </h2>
            <p className={styles.finalLead}>
                {player.name} {player.surname}, {family.labelEs.toLowerCase()}, se retiró a los {player.age} en{' '}
                {clubLabel(player.clubId)}. {motivo}
            </p>

            <div className={styles.grid}>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Partidos</span>
                    <span className={styles.cellValue}>{partidos}</span>
                </div>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>{family.glory.primary.labelEs}</span>
                    <span className={styles.cellValue}>{Math.round(gloriaTotal)}</span>
                </div>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Caps</span>
                    <span className={styles.cellValue}>{state.national.caps}</span>
                </div>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Mejor media</span>
                    <span className={styles.cellValue}>
                        {Math.max(player.ovr, ...state.history.map((h) => h.ovr))}
                    </span>
                </div>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Conmociones</span>
                    <span className={styles.cellValue}>{state.damage.hia}</span>
                </div>
            </div>

            <p className={styles.note}>
                <strong>{tierDef.icon} {tierDef.labelEs}</strong> en {clubLabel(mejorClubId as string)}.{' '}
                {vitalicio
                    ? 'Carnet de socio vitalicio y una placa en la entrada.'
                    : state.national.bestTrack !== 'club'
                        ? `Lo más alto que pisaste: ${TRACK_LABEL[state.national.bestTrack].toLowerCase()}.`
                        : 'Toda la carrera en el club, sin que te llamara nadie de afuera.'}
            </p>

            {state.titles.length > 0 && (
                <div style={{ marginTop: 18 }}>
                    <span className={styles.eyebrow}>La vitrina</span>
                    <div className={styles.honours}>
                        {state.titles.map((t, i) => (
                            <div key={i} className={styles.honour}>
                                <span className={styles.honourYear}>T{t.season}</span>
                                <span>{t.labelEs} · {clubLabel(t.clubId)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className={styles.note} style={{ marginTop: 18 }}>{epilogo(state)}</p>

            <div style={{ marginTop: 20 }}>
                <button type="button" className={styles.primary} onClick={onRestart}>
                    Empezar otra carrera
                </button>
            </div>
        </div>
    );
}
