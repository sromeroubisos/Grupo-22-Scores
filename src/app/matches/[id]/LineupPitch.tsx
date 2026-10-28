'use client';

/**
 * Los dos XV sobre una cancha de rugby, de lado a lado: el local a la
 * izquierda atacando hacia la derecha, el visitante espejado. Cada jugador va
 * donde lo pone su camiseta (1 a 15). Es solo de escritorio: en el telefono la
 * pestana sigue siendo la lista.
 */
import React from 'react';
import styles from './LineupPitch.module.css';

export type PitchPlayer = {
    id?: string | null;
    name?: string | null;
    number?: number | string | null;
    isCaptain?: boolean | null;
};

type Side = { name: string; color: string; players: PitchPlayer[] };

/** Se llama al tocar un jugador; sin esto la cancha es solo para mirar. */
export type PlayerPick = (player: PitchPlayer & { n: number }, team: "home" | "away") => void;

// [x, y] en la mitad propia: x=0 es la linea de try propia y x=1 el medio de la
// cancha; y=0 es arriba. Los forwards quedan al frente, los backs atras.
const SLOT: Record<number, [number, number]> = {
    1: [0.86, 0.28], 2: [0.86, 0.5], 3: [0.86, 0.72],
    4: [0.74, 0.39], 5: [0.74, 0.61],
    6: [0.62, 0.15], 7: [0.62, 0.85], 8: [0.62, 0.5],
    9: [0.5, 0.64],
    10: [0.42, 0.45], 12: [0.34, 0.31], 13: [0.26, 0.19],
    11: [0.15, 0.07], 14: [0.15, 0.93], 15: [0.07, 0.5],
};

function shortName(full: string) {
    const parts = full.trim().split(/\s+/);
    if (parts.length <= 1) return full;
    // Apellido: la ultima palabra, o las dos ultimas si la anterior es una particula.
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    return /^(de|del|la|las|los|da|di|van|von|le|mc|mac)$/i.test(prev) ? `${prev} ${last}` : last;
}

/** Los jugadores que se pueden ubicar por su numero (1 a 15, sin repetir). */
export function placeablePlayers(players: PitchPlayer[]) {
    const seen = new Set<number>();
    const out: Array<PitchPlayer & { n: number }> = [];
    for (const p of players) {
        const n = Number(p.number);
        if (!p.name || !Number.isInteger(n) || n < 1 || n > 15 || seen.has(n)) continue;
        seen.add(n);
        out.push({ ...p, n });
    }
    return out;
}

function Team({ side, mirror, onPick }: { side: Side; mirror: boolean; onPick?: PlayerPick }) {
    const placed = placeablePlayers(side.players);
    return (
        <>
            {placed.map((p) => {
                const [sx, sy] = SLOT[p.n];
                const x = (mirror ? 1 - sx / 2 : sx / 2) * 100;
                const y = (mirror ? 1 - sy : sy) * 100;
                return (
                    <button
                        type="button"
                        key={`${mirror ? 'a' : 'h'}-${p.n}`}
                        className={styles.player}
                        style={{ left: `${x}%`, top: `${y}%`, '--team-c': side.color } as React.CSSProperties}
                        disabled={!onPick}
                        onClick={() => onPick?.(p, mirror ? "away" : "home")}
                        aria-label={`Ver a ${String(p.name)}`}
                    >
                        <span className={styles.shirt}>
                            {p.n}
                            {p.isCaptain ? <i className={styles.captain} aria-label="Capitán">C</i> : null}
                        </span>
                        <span className={styles.label}>{shortName(String(p.name))}</span>
                    </button>
                );
            })}
        </>
    );
}

export default function LineupPitch({ home, away, label, subtitle, mobile = false, onPlayerClick }: { home: Side; away: Side; label: string; subtitle?: string; mobile?: boolean; onPlayerClick?: PlayerPick }) {
    const total = placeablePlayers(home.players).length + placeablePlayers(away.players).length;
    if (total < 8) return null;
    return (
        <section className={`${styles.wrap} ${mobile ? "" : styles.desktopOnly}`} aria-label={label}>
            {subtitle ? (
                <div className={styles.titleBlock}>
                    <h3 className={styles.title}>{label}</h3>
                    <p className={styles.subtitle}>{subtitle}</p>
                </div>
            ) : null}
            <header className={styles.head}>
                <span className={styles.club}><i style={{ background: home.color }} />{home.name}</span>
                <span className={styles.tag}>{subtitle ? '' : label}</span>
                <span className={styles.club}>{away.name}<i style={{ background: away.color }} /></span>
            </header>
            <div className={styles.pitch}>
                <div className={styles.lines} aria-hidden="true">
                    <span style={{ left: '10%' }} /><span style={{ left: '38%' }} /><span style={{ left: '50%' }} className={styles.half} /><span style={{ left: '62%' }} /><span style={{ left: '90%' }} />
                </div>
                <Team side={home} mirror={false} onPick={onPlayerClick} />
                <Team side={away} mirror onPick={onPlayerClick} />
            </div>
            <div className={styles.mobileList}>
                {[home, away].map((side, i) => (
                    <ol key={i} className={styles.mobileCol} style={{ '--team-c': side.color } as React.CSSProperties}>
                        <li className={styles.mobileTitle}>{side.name}</li>
                        {placeablePlayers(side.players)
                            .sort((a, b) => a.n - b.n)
                            .map((p) => (
                                <li key={p.n}>
                                    <button
                                        type="button"
                                        className={styles.mobileRow}
                                        disabled={!onPlayerClick}
                                        onClick={() => onPlayerClick?.(p, i === 0 ? "home" : "away")}
                                    >
                                        <span className={styles.mobileNum}>{p.n}</span>
                                        <span className={styles.mobileName}>{String(p.name)}</span>
                                    </button>
                                </li>
                            ))}
                    </ol>
                ))}
            </div>
        </section>
    );
}
