'use client';

import { useEffect, useState } from 'react';
import type { BunkerVerdict, CaptainState } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * EL BUNKER — el minijuego de esperar.
 *
 * Es un ANTI-MINIJUEGO y por eso funciona: es la única pantalla del juego donde
 * el jugador es espectador de su propio destino. No hay botón, no hay barra, no
 * hay nada que hacer. Ocho segundos mirando el replay mientras el oficial
 * revisor decide, igual que los ocho minutos reales.
 *
 * Y es fiel al reglamento vigente: desde el 6 Naciones 2026 la roja permanente
 * quedó reservada a los actos de matonaje —morder, golpear con el puño, contacto
 * con los ojos— y todo lo demás pasa por acá.
 *
 * El veredicto ya está decidido por el motor cuando esta pantalla se monta: la
 * cuenta regresiva no lo sortea, lo revela. Si lo sorteara la pantalla, una
 * recarga en el segundo siete cambiaría el resultado.
 */
export default function BunkerScene({
    state,
    verdict,
    onDone,
}: {
    state: CaptainState;
    verdict: BunkerVerdict;
    onDone: () => void;
}) {
    const [restante, setRestante] = useState(8);

    useEffect(() => {
        if (restante <= 0) return;
        const id = setTimeout(() => setRestante((n) => n - 1), 900);
        return () => clearTimeout(id);
    }, [restante]);

    const listo = restante <= 0;
    const minuto = state.pendingMoment?.minute ?? 0;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {minuto} · revisión</span>
            <h2 className={styles.cardTitle}>Al bunker</h2>
            <p className={styles.cardText}>
                El referee te mostró la amarilla con los brazos cruzados. Ahora hay un oficial
                revisor mirando el replay y vos no podés hacer nada.
            </p>

            <div className={styles.bunker} aria-live="polite">
                {listo ? (
                    <p className={`${styles.bunkerVerdict} ${verdict === 'roja-20' ? styles.verdictBad : ''}`}>
                        {verdict === 'roja-20'
                            ? 'La suben a roja. Veinte minutos y el equipo con catorce.'
                            : 'Queda en amarilla. Diez minutos afuera.'}
                    </p>
                ) : (
                    <>
                        <p className={styles.bunkerClock}>{restante}</p>
                        <p className={styles.bunkerHint}>Está revisando la altura del contacto.</p>
                    </>
                )}
            </div>

            <button
                type="button"
                className={styles.primary}
                onClick={onDone}
                disabled={!listo}
                style={{ marginTop: 16 }}
            >
                {listo ? 'Volver a la cancha' : 'Esperá'}
            </button>
            {!listo && (
                <span className={styles.primaryHint}>
                    No hay nada que hacer. Es la parte del rugby que no se juega.
                </span>
            )}
        </div>
    );
}
