'use client';

import { useState } from 'react';
import {
    formatMoney,
    hasFrontRowCover,
    isForward,
    marketValue,
    startingXV,
    teamRating,
    type DealKind,
    type Personality,
    type PositionGroup,
    type ProStatus,
    type SquadPlayer,
} from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

const GROUP_LABEL: Record<PositionGroup, string> = {
    'primera-linea': 'Primera línea',
    'segunda-linea': 'Segunda línea',
    'tercera-linea': 'Tercera línea',
    medios: 'Medios',
    centros: 'Centros',
    fondo: 'Fondo',
};

const PERSONALITY_LABEL: Record<Personality, string> = {
    lider: 'Líder',
    profesional: 'Profesional',
    ambicioso: 'Ambicioso',
    leal: 'Leal',
    conflictivo: 'Conflictivo',
    tranquilo: 'Tranquilo',
};

const DEAL_LABEL: Record<DealKind, string> = {
    amateur: 'Amateur',
    beca: 'Beca',
    viatico: 'Viático',
    contrato: 'Contrato',
};

/** El vínculo en una línea: "Viático $ 0,02 M/mes · 1 año". */
function dealText(p: SquadPlayer): string {
    if (p.deal.kind === 'amateur' || p.deal.monthly <= 0) return 'Amateur, no cobra';
    const years = p.deal.years > 0 ? ` · ${p.deal.years} ${p.deal.years === 1 ? 'año' : 'años'}` : '';
    return `${DEAL_LABEL[p.deal.kind]} ${formatThousands(p.deal.monthly)} por mes${years}`;
}

/** Los vínculos son chicos para "M": "$ 22.000". */
function formatThousands(pesos: number): string {
    return `$ ${Math.round(pesos).toLocaleString('es-AR')}`;
}

function moraleWord(v: number): string {
    return v >= 70 ? 'contento' : v >= 45 ? 'normal' : v >= 35 ? 'molesto' : 'quiere irse';
}

/** El orden en que se dibuja el XV: el pack arriba, la línea abajo, como en la cancha. */
const ROWS: PositionGroup[] = ['primera-linea', 'segunda-linea', 'tercera-linea', 'medios', 'centros', 'fondo'];

function surname(name: string): string {
    const parts = name.trim().split(' ');
    return parts[parts.length - 1];
}

/** Cómo se lee un nivel al lado de los demás: no un número suelto. */
function levelClass(level: number, avg: number): string {
    if (level >= avg + 4) return styles.levelHigh;
    if (level <= avg - 4) return styles.levelLow;
    return '';
}

function PlayerCard({
    player,
    avg,
    starter,
    selected,
    onSelect,
}: {
    player: SquadPlayer;
    avg: number;
    starter: boolean;
    selected: boolean;
    onSelect: () => void;
}) {
    const headroom = player.potential - player.level;
    return (
        <button
            type="button"
            className={`${styles.player} ${starter ? styles.playerStarter : ''} ${selected ? styles.playerSelected : ''}`}
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={`${player.number} ${player.name}, ${GROUP_LABEL[player.group]}, nivel ${player.level}, ${player.age} años`}
        >
            <span className={styles.playerNumber}>{player.number}</span>
            <span className={styles.playerName}>{surname(player.name)}</span>
            <span className={`${styles.playerLevel} ${levelClass(player.level, avg)}`}>{Math.round(player.level)}</span>
            {headroom >= 8 && <span className={styles.playerTag} title="Tiene margen para crecer">▲</span>}
            {player.age >= 32 && <span className={styles.playerTag} title="En la última vuelta">●</span>}
        </button>
    );
}

/**
 * El plantel dibujado como se para en la cancha: el pack arriba, la línea abajo,
 * el banco al costado. Tocar un jugador abre su ficha. Los avisos de abajo son
 * los que un entrenador mira antes de la pretemporada: si hay recambio de
 * primera línea, quiénes tienen margen y quiénes están en la última vuelta.
 */
export default function SquadBoard({
    squad,
    bancoCorto,
    status = 'amateur',
}: {
    squad: SquadPlayer[];
    bancoCorto: boolean;
    /** El estatus de la división: decide si hay valor de mercado. */
    status?: ProStatus;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const xv = startingXV(squad);
    const xvIds = new Set(xv.map((p) => p.id));
    const avg = squad.reduce((s, p) => s + p.level, 0) / Math.max(1, squad.length);
    const bench = squad.filter((p) => !xvIds.has(p.id)).sort((a, b) => a.number - b.number);
    const selected = squad.find((p) => p.id === selectedId) ?? null;

    const pack = xv.filter((p) => isForward(p.group));
    const line = xv.filter((p) => !isForward(p.group));
    const packAvg = pack.reduce((s, p) => s + p.level, 0) / Math.max(1, pack.length);
    const lineAvg = line.reduce((s, p) => s + p.level, 0) / Math.max(1, line.length);

    const cover = hasFrontRowCover(squad, bancoCorto);
    const rising = squad.filter((p) => p.age <= 23 && p.potential - p.level >= 8);
    const veterans = squad.filter((p) => p.age >= 32);
    const payroll = squad.reduce((s, p) => s + p.deal.monthly * 12, 0);
    const homegrown = squad.filter((p) => p.homegrown).length;
    const unhappy = squad.filter((p) => p.morale < 35);
    const showValue = status === 'semipro';

    return (
        <div className={styles.squadBoard}>
            <div className={styles.squadStats}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Fuerza del XV</span>
                    <span className={styles.ledgerValue}>{teamRating(squad).toFixed(1)}</span>
                    <span className={styles.ledgerHint}>escala de la pirámide, 4 a 48</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Pack</span>
                    <span className={styles.ledgerValue}>{packAvg.toFixed(1)}</span>
                    <span className={styles.ledgerHint}>nivel medio de los ocho</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Línea</span>
                    <span className={styles.ledgerValue}>{lineAvg.toFixed(1)}</span>
                    <span className={styles.ledgerHint}>nivel medio de los siete</span>
                </span>
            </div>

            <div className={styles.squadLayout}>
                <div className={styles.pitch} role="list" aria-label="XV titular">
                    {ROWS.map((group) => (
                        <div key={group} className={styles.pitchRow} role="listitem">
                            <span className={styles.pitchRowLabel}>{GROUP_LABEL[group]}</span>
                            <div className={styles.pitchRowPlayers}>
                                {xv
                                    .filter((p) => p.group === group)
                                    .map((p) => (
                                        <PlayerCard
                                            key={p.id}
                                            player={p}
                                            avg={avg}
                                            starter
                                            selected={p.id === selectedId}
                                            onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                                        />
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className={styles.bench}>
                    <p className={styles.benchTitle}>Banco y afuera del parte</p>
                    <div className={styles.benchList}>
                        {bench.map((p) => (
                            <PlayerCard
                                key={p.id}
                                player={p}
                                avg={avg}
                                starter={false}
                                selected={p.id === selectedId}
                                onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {selected && (
                <div className={styles.playerSheet} role="status">
                    <span className={styles.playerSheetName}>
                        {selected.number} · {selected.name}
                    </span>
                    <span className={styles.playerSheetMeta}>
                        {GROUP_LABEL[selected.group]} · {selected.age} años · {selected.seasonsAtClub}{' '}
                        {selected.seasonsAtClub === 1 ? 'temporada' : 'temporadas'} en el club
                    </span>
                    <span className={styles.playerSheetBar}>
                        <span className={styles.playerSheetFill} style={{ width: `${selected.level}%` }} />
                        <span className={styles.playerSheetCeil} style={{ left: `${selected.potential}%` }} />
                    </span>
                    <span className={styles.playerSheetMeta}>
                        Nivel {selected.level} · techo {selected.potential}
                        {selected.group === 'primera-linea'
                            && (selected.frontRowCertified ? ' · certificado para el scrum' : ' · sin certificar todavía')}
                        {xvIds.has(selected.id) ? ' · titular' : ' · suplente'}
                    </span>
                    <span className={styles.playerSheetMeta}>
                        {PERSONALITY_LABEL[selected.personality]} · ánimo {Math.round(selected.morale)} (
                        {moraleWord(selected.morale)}) · cansancio {Math.round(selected.fatigue)} · arraigo{' '}
                        {Math.round(selected.commitment)}
                        {selected.homegrown ? ' · formado en el club' : ''}
                        {selected.injury > 0 ? ` · lesionado, ${selected.injury} fechas afuera` : ''}
                    </span>
                    <span className={styles.playerSheetMeta}>
                        {dealText(selected)}
                        {(() => {
                            const v = marketValue(selected, status);
                            return v === null ? '' : ` · vale ${formatMoney(v)} en el mercado`;
                        })()}
                    </span>
                </div>
            )}

            <div className={styles.squadStats}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Sueldos del año</span>
                    <span className={styles.ledgerValue}>{formatMoney(payroll)}</span>
                    <span className={styles.ledgerHint}>becas, viáticos y contratos</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Del club</span>
                    <span className={styles.ledgerValue}>{homegrown}</span>
                    <span className={styles.ledgerHint}>de {squad.length} formados acá</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Con el ánimo bajo</span>
                    <span className={styles.ledgerValue}>{unhappy.length}</span>
                    <span className={styles.ledgerHint}>{unhappy.length > 0 ? 'por debajo de 35' : 'nadie pide salir'}</span>
                </span>
            </div>

            <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.squadTable}`}>
                    <caption className={styles.srOnly}>El plantel, jugador por jugador</caption>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Jugador</th>
                            <th scope="col">Nivel</th>
                            <th scope="col">Ánimo</th>
                            <th scope="col">Cansancio</th>
                            <th scope="col">Carácter</th>
                            <th scope="col">Club</th>
                            <th scope="col">Vínculo</th>
                            {showValue && <th scope="col">Valor</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {[...squad]
                            .sort((a, b) => a.number - b.number)
                            .map((p) => {
                                const v = showValue ? marketValue(p, status) : null;
                                return (
                                    <tr key={p.id}>
                                        <td>{p.number}</td>
                                        <td>
                                            <span className={styles.teamName}>{p.name}</span>
                                        </td>
                                        <td>{Math.round(p.level)}</td>
                                        <td className={p.morale < 35 ? styles.negative : ''}>{Math.round(p.morale)}</td>
                                        <td>{Math.round(p.fatigue)}</td>
                                        <td>{PERSONALITY_LABEL[p.personality]}</td>
                                        <td>{p.homegrown ? 'Formado' : 'De afuera'}</td>
                                        <td>
                                            {p.deal.monthly > 0
                                                ? `${DEAL_LABEL[p.deal.kind]} ${formatThousands(p.deal.monthly)}`
                                                : 'Amateur'}
                                        </td>
                                        {showValue && <td>{v === null ? '—' : formatMoney(v)}</td>}
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
            {!showValue && (
                <p className={styles.objectiveNote}>
                    {status === 'amateur'
                        ? 'En el amateur no hay pase ni valor de mercado: el club retiene con becas, no con plata.'
                        : 'Con viáticos no hay pase: el viático paga el transporte y la comida, no genera valor de mercado.'}
                </p>
            )}

            <ul className={styles.noteList}>
                <li className={cover ? styles.noteOk : styles.noteWarn}>
                    {cover
                        ? 'Hay primera línea certificada en el banco: si se lesiona un pilar, el scrum sigue.'
                        : 'Sin primera línea certificada en el banco. Una lesión de pilar o hooker manda a scrums simulados y el pack pierde su arma.'}
                </li>
                <li>
                    {rising.length > 0
                        ? `Con margen para crecer: ${rising.map((p) => surname(p.name)).join(', ')}. Formación y estructura deciden cuánto.`
                        : 'Nadie con margen grande para crecer: el plantel ya es lo que es.'}
                </li>
                {veterans.length > 0 && (
                    <li>
                        En la última vuelta: {veterans.map((p) => `${surname(p.name)} (${p.age})`).join(', ')}. Al
                        retirarse dejan el lugar a uno del M19.
                    </li>
                )}
            </ul>
        </div>
    );
}
