// El panel de la votación del XV Ideal: cómo va, solo para el super admin.
//
// Los resultados NO son públicos. La página pública nunca recibe un conteo
// (ver `toPublicSummary`); acá se arma todo en el servidor, con el rol
// verificado contra Supabase. Cualquiera que no sea super admin ve un 404, como
// si la dirección no existiera (no se confirma ni que hay un panel).
// No muestra quién votó qué: solo agregados.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { isSuperAdminRole } from '@/lib/auth/roles';
import { getXvIdealAdminReport, XV_IDEAL_MIGRATION, type XvIdealAdminPoll } from '@/lib/server/xvIdeal';
import { byVotes, XV_PITCH, type XvCandidateResult } from '@/lib/xvIdeal/xvIdeal';
import styles from './Resultados.module.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ groupKey: string }> };

const KEY = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** El título sale solo para el super admin: al resto, ni el título delata que el panel existe. */
export async function generateMetadata(): Promise<Metadata> {
    const { role } = await getServerAuthRole();
    return {
        title: isSuperAdminRole(role) ? 'Cómo va la votación | G22 Scores' : undefined,
        robots: { index: false, follow: false },
    };
}

function when(iso: string | null): string {
    if (!iso) return 'todavía nadie votó';
    return new Date(iso).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'short',
        timeStyle: 'short',
        hourCycle: 'h23',
    });
}

function dayLabel(day: string): string {
    const [, month, date] = day.split('-');
    return `${date}/${month}`;
}

function Crest({ logo, className }: { logo: string | null; className: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return logo ? <img className={className} src={logo} alt="" loading="lazy" /> : <span className={className} />;
}

function PollReport({ poll }: { poll: XvIdealAdminPoll }) {
    const { summary } = poll;
    const leaders = new Map<number, XvCandidateResult | null>();
    for (const slot of summary.results) {
        const top = byVotes(slot.candidates)[0];
        leaders.set(slot.jersey, top && top.votes > 0 ? top : null);
    }
    const maxDay = Math.max(1, ...poll.byDay.map((entry) => entry.votes));

    return (
        <section className={styles.card} aria-labelledby={`zona-${summary.id}`}>
            <header className={styles.cardHead}>
                <h2 id={`zona-${summary.id}`} className={styles.zone}>{summary.name}</h2>
                <span className={styles.state} data-open={summary.isOpen}>{summary.isOpen ? 'Abierta' : 'Cerrada'}</span>
            </header>

            <dl className={styles.kpis}>
                <div>
                    <dt>Personas que votaron</dt>
                    <dd>{summary.voters}</dd>
                </div>
                <div>
                    <dt>Último voto</dt>
                    <dd className={styles.small}>{when(poll.lastActivityAt)}</dd>
                </div>
            </dl>

            {poll.byDay.length > 0 && (
                <div className={styles.days} aria-label="Votantes nuevos por día">
                    <h3 className={styles.sub}>Votantes nuevos por día</h3>
                    <ul>
                        {poll.byDay.map((entry) => (
                            <li key={entry.day}>
                                <span className={styles.dayBar} style={{ height: `${Math.max(8, Math.round((entry.votes / maxDay) * 100))}%` }} />
                                <strong>{entry.votes}</strong>
                                <span>{dayLabel(entry.day)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <h3 className={styles.sub}>El XV más votado hoy</h3>
            <div className={styles.pitch}>
                {XV_PITCH.map((line, index) => (
                    <div key={index} className={styles.line}>
                        {line.map(({ jersey }) => {
                            const leader = leaders.get(jersey) ?? null;
                            return (
                                <div key={jersey} className={styles.tile} data-empty={!leader}>
                                    <span className={styles.num}>{jersey}</span>
                                    {leader ? (
                                        <>
                                            <Crest logo={leader.logo} className={styles.tileLogo} />
                                            <span className={styles.tileName}>{leader.name}</span>
                                            <span className={styles.tilePct}>{leader.percent}%</span>
                                        </>
                                    ) : (
                                        <span className={styles.tileName}>Sin votos</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <h3 className={styles.sub}>Resultado por camiseta</h3>
            <div className={styles.slots}>
                {summary.results.map((slot) => {
                    const ranked = byVotes(slot.candidates);
                    return (
                        <details key={slot.jersey} className={styles.slot}>
                            <summary>
                                <span className={styles.num}>{slot.jersey}</span>
                                <span className={styles.slotLabel}>{slot.label}</span>
                                <span className={styles.slotTotal}>{slot.total} {slot.total === 1 ? 'voto' : 'votos'}</span>
                            </summary>
                            <ol>
                                {ranked.map((candidate) => (
                                    <li key={candidate.id} data-lead={slot.total > 0 && candidate.votes === ranked[0].votes}>
                                        <span className={styles.bar} style={{ width: `${candidate.percent}%` }} aria-hidden="true" />
                                        <Crest logo={candidate.logo} className={styles.rowLogo} />
                                        <span className={styles.rowName}>
                                            {candidate.name}
                                            <small>{candidate.team}</small>
                                        </span>
                                        <span className={styles.rowPct}>
                                            {candidate.percent}%
                                            <small>{candidate.votes} {candidate.votes === 1 ? 'voto' : 'votos'}</small>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </details>
                    );
                })}
            </div>
        </section>
    );
}

export default async function XvIdealResultsPage({ params }: Props) {
    const { groupKey } = await params;
    if (!KEY.test(groupKey)) notFound();

    // Rol verificado contra Supabase (getUser), no la cookie a secas.
    const { role } = await getServerAuthRole();
    if (!isSuperAdminRole(role)) notFound();

    const report = await getXvIdealAdminReport(groupKey).catch((error: unknown) => {
        console.error('[xv-ideal] admin report failed:', error);
        return { available: false, polls: [] as XvIdealAdminPoll[] };
    });
    if (report.available && report.polls.length === 0) notFound();

    const title = report.polls[0]?.summary.title ?? 'XV Ideal';
    const totalVoters = report.polls.reduce((sum, poll) => sum + poll.summary.voters, 0);

    return (
        <main className={styles.page}>
            <div className={styles.wrap}>
                <p className={styles.badge}>Solo super admin</p>
                <h1 className={styles.title}>Cómo va la votación</h1>
                <p className={styles.lede}>{title}</p>
                <p className={styles.meta}>
                    Datos al {when(new Date().toISOString())} · <Link href={`/xv-ideal/${groupKey}`}>Ver la página pública</Link>
                </p>

                {!report.available ? (
                    <p className={styles.empty}>
                        La votación no está habilitada: falta correr la migración <code>{XV_IDEAL_MIGRATION}</code>.
                    </p>
                ) : (
                    <>
                        <p className={styles.total}>
                            <strong>{totalVoters}</strong> {totalVoters === 1 ? 'persona votó' : 'personas votaron'} en total
                            <span> (una misma persona cuenta una vez por zona)</span>
                        </p>
                        <div className={styles.grid}>
                            {report.polls.map((poll) => (
                                <PollReport key={poll.summary.id} poll={poll} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
