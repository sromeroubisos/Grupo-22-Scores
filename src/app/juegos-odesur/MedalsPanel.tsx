'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Star } from 'lucide-react';
import OdesurFlag from './OdesurFlag';
import { EmptyState, ErrorState, MedalDot, METALS, SkeletonRows } from './OdesurBits';
import { formatTime } from './odesurClient';
import type { OdesurMedalTableView, OdesurMedalsView } from './types';
import type { OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';

const METAL_WORD: Record<string, string> = { gold: 'oro', silver: 'plata', bronze: 'bronce' };

function FollowStar({ code, name, follows }: { code: string; name: string; follows: OdesurFollows }) {
    const on = follows.orgs.has(code);
    const label = on ? `Dejar de seguir a ${name}` : `Seguir a ${name}`;
    return (
        <button
            type="button"
            className={`${styles.starBtn} ${on ? styles.starBtnOn : ''}`}
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => follows.toggleOrg(code)}
        >
            <Star size={16} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
    );
}

function MedalTable({ table, caption, follows }: { table: OdesurMedalTableView; caption: string; follows: OdesurFollows }) {
    // Lo que se sigue va resaltado; si no se sigue nada, Argentina, que es la casa.
    const highlight = follows.orgs.size > 0 ? follows.orgs : new Set(['ARG']);
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <caption className={styles.srOnly}>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col" className={styles.thPos}>#</th>
                        <th scope="col">País</th>
                        {METALS.map((metal) => (
                            <th key={metal.id} scope="col" className={styles.thNum}>
                                <MedalDot metal={metal.id} />
                                <span className={styles.thMetalLabel}>{metal.label}</span>
                            </th>
                        ))}
                        <th scope="col" className={styles.thNum}>Total</th>
                        <th scope="col" className={styles.thStar}><span className={styles.srOnly}>Seguir</span></th>
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((row) => (
                        <tr key={row.code} className={highlight.has(row.code) ? styles.rowHighlight : undefined}>
                            <td className={styles.posCell}>{row.position}</td>
                            <td>
                                <span className={styles.teamCell}>
                                    <OdesurFlag code={row.code} name={row.name} size={26} />
                                    <strong>{row.name}</strong>
                                </span>
                            </td>
                            <td className={styles.numCell}>{row.gold}</td>
                            <td className={styles.numCell}>{row.silver}</td>
                            <td className={styles.numCell}>{row.bronze}</td>
                            <td className={`${styles.numCell} ${styles.totalCell}`}>{row.total}</td>
                            <td className={styles.starCell}>
                                <FollowStar code={row.code} name={row.name} follows={follows} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function MedalsPanel({
    medals,
    loading,
    error,
    onRetry,
    follows,
    onOpenSport,
}: {
    medals: OdesurMedalsView | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    follows: OdesurFollows;
    onOpenSport: (code: string) => void;
}) {
    if (!medals) {
        if (error) return <ErrorState message={error} onRetry={onRetry} />;
        return loading ? <SkeletonRows count={8} label="Cargando el medallero..." /> : null;
    }

    const { general, byDiscipline, latest } = medals;

    return (
        <div className={styles.medalsLayout}>
            <section aria-labelledby="medallero-general" className={styles.block}>
                <div className={styles.blockHead}>
                    <h2 id="medallero-general" className={styles.sectionTitle}>Medallero general</h2>
                    <Link href="/rankings?sport=rugby&ranking=odesur-2026-medallero" className={styles.moreLink}>
                        Ver en Rankings <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>
                {general.rows.length ? (
                    <>
                        <MedalTable table={general} caption="Medallero general de los Juegos" follows={follows} />
                        <p className={styles.hint}>Tocá la ★ de un país para seguirlo: la agenda te lo marca en todos los deportes.</p>
                    </>
                ) : (
                    <EmptyState title="Todavía no se entregaron medallas." />
                )}
            </section>

            {latest.length || byDiscipline.length ? (
                <div className={styles.medalsAside}>
                    {latest.length ? (
                        <section aria-labelledby="ultimas-medallas" className={styles.block}>
                            <h2 id="ultimas-medallas" className={styles.sectionTitle}>Últimas medallas</h2>
                            <ul className={styles.latestList}>
                                {latest.slice(0, 10).map((item, index) => (
                                    <li key={`${item.eventName}-${item.metal}-${item.name}-${index}`} className={styles.latestRow}>
                                        <MedalDot metal={item.metal} label={`Medalla de ${METAL_WORD[item.metal]}`} />
                                        <OdesurFlag code={item.orgCode} name={item.orgName} size={22} />
                                        <span className={styles.latestCopy}>
                                            <strong>{item.name}{item.isTeam ? '' : `, ${item.orgName}`}</strong>
                                            <span>{item.disciplineName} · {item.eventName}</span>
                                        </span>
                                        {item.awardedAtIso ? <span className={styles.latestTime}>{formatTime(item.awardedAtIso)}</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {byDiscipline.length ? (
                        <section aria-labelledby="medallero-deportes" className={styles.block}>
                            <h2 id="medallero-deportes" className={styles.sectionTitle}>Por deporte</h2>
                            <ul className={styles.sportMedalList}>
                                {byDiscipline.map((table) => (
                                    <li key={table.discipline}>
                                        <button type="button" className={styles.sportMedalRow} onClick={() => onOpenSport(table.discipline)}>
                                            <span className={styles.sportMedalName}>{table.disciplineName}</span>
                                            <span className={styles.sportMedalLeaders}>
                                                {table.rows.slice(0, 3).map((row) => (
                                                    <span key={row.code} className={styles.sportMedalLeader}>
                                                        <OdesurFlag code={row.code} name={row.name} size={20} />
                                                        <span className={styles.srOnly}>{row.name}: </span>
                                                        <span className={styles.sportMedalGold}>{row.gold}</span>
                                                        <span className={styles.srOnly}> de oro. </span>
                                                    </span>
                                                ))}
                                            </span>
                                            <ChevronRight size={16} className={styles.chev} aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
