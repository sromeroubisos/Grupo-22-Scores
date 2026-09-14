'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { ODESUR_DISCIPLINES, odesurOrgName, type OdesurDisciplineCode } from '@/lib/services/odesur2026Parser';
import AgendaPanel from './AgendaPanel';
import FollowPanel from './FollowPanel';
import MedalsPanel from './MedalsPanel';
import OdesurFlag from './OdesurFlag';
import SportsPanel from './SportsPanel';
import { MedalDot } from './OdesurBits';
import { daysBetween, replaceUrl, useOdesurApi } from './odesurClient';
import { useOdesurFollows, type OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';
import type { OdesurAgendaView, OdesurMedalsView, OdesurSportsIndexView } from './types';

type View = 'agenda' | 'medallero' | 'deportes';
type Gender = 'm' | 'w';

const VIEWS: Array<{ id: View; label: string }> = [
    { id: 'agenda', label: 'Agenda' },
    { id: 'medallero', label: 'Medallero' },
    { id: 'deportes', label: 'Deportes' },
];

const FOLLOW_PANEL_ID = 'odesur-que-seguis';

function isTeamSport(code: string): boolean {
    return Boolean(ODESUR_DISCIPLINES[code as OdesurDisciplineCode]);
}

/**
 * La vista y el deporte con que se abre la página. Los links viejos siguen
 * andando: `vista=equipos` era la pestaña de deportes de equipo (hoy es el
 * deporte dentro de Deportes) y `vista=medallistas` vive en cada deporte y en
 * el medallero.
 */
function resolveInitial(view: string, discipline: string): { view: View; sport: string } {
    const sport = discipline.trim().toUpperCase();
    const validSport = /^[A-Z0-9]{3}$/.test(sport) ? sport : '';
    if (view === 'equipos') return { view: 'deportes', sport: validSport || 'HOC' };
    if (view === 'deportes') return { view: 'deportes', sport: validSport };
    if (view === 'medallero' || view === 'medallistas') return { view: 'medallero', sport: '' };
    return { view: 'agenda', sport: '' };
}

/**
 * El medallero de lo que se sigue, arriba de todo: si no se sigue ningún
 * país, el de Argentina, que es la casa. Es lo primero que se pregunta de
 * unos Juegos y no tiene que costar un toque.
 */
function MedalStrip({ medals, follows, onOpen }: { medals: OdesurMedalsView | null; follows: OdesurFollows; onOpen: () => void }) {
    if (!medals) return null;
    const codes = follows.orgs.size > 0 ? [...follows.orgs] : ['ARG'];
    const rows = medals.general.rows;

    return (
        <ul className={styles.tally} aria-label={follows.orgs.size > 0 ? 'Medallero de los países que seguís' : 'Medallero de Argentina'}>
            {codes.map((code) => {
                const row = rows.find((item) => item.code === code);
                const name = odesurOrgName(code);
                return (
                    <li key={code}>
                        <button type="button" className={styles.tallyItem} onClick={onOpen}>
                            <OdesurFlag code={code} name={name} size={26} />
                            <span className={styles.tallyName}>{name}</span>
                            {row ? (
                                <>
                                    <span className={styles.tallyPos}>{row.position}.º</span>
                                    <span className={styles.tallyMetals}>
                                        <span><MedalDot metal="gold" /><span className={styles.srOnly}>Oro: </span>{row.gold}</span>
                                        <span><MedalDot metal="silver" /><span className={styles.srOnly}>Plata: </span>{row.silver}</span>
                                        <span><MedalDot metal="bronze" /><span className={styles.srOnly}>Bronce: </span>{row.bronze}</span>
                                    </span>
                                </>
                            ) : (
                                <span className={styles.tallyNone}>sin medallas todavía</span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

export type OdesurHubProps = {
    firstDay: string;
    lastDay: string;
    today: string;
    initialView: string;
    initialDay: string;
    initialDiscipline: string;
    initialGender: Gender | '';
    initialMedals: OdesurMedalsView | null;
    initialAgenda: OdesurAgendaView | null;
};

export default function OdesurHub(props: OdesurHubProps) {
    const { firstDay, lastDay, today } = props;
    const days = useMemo(() => daysBetween(firstDay, lastDay), [firstDay, lastDay]);
    const initial = useMemo(
        () => resolveInitial(props.initialView, props.initialDiscipline),
        [props.initialView, props.initialDiscipline],
    );

    const [view, setView] = useState<View>(initial.view);
    const [day, setDay] = useState(props.initialDay);
    const [sport, setSport] = useState(initial.sport);
    // El día que se mira dentro de un deporte. Si el deporte no compite ese
    // día, el servidor elige el próximo en que sí.
    const [sportDay, setSportDay] = useState(initial.view === 'deportes' ? props.initialDay : '');
    const [gender, setGender] = useState<Gender>(props.initialGender || 'w');
    const [followOpen, setFollowOpen] = useState(false);

    const follows = useOdesurFollows();

    const agenda = useOdesurApi<OdesurAgendaView>(
        view === 'agenda' ? `view=agenda&day=${day}` : null,
        props.initialAgenda ? { query: `view=agenda&day=${props.initialAgenda.day}`, data: props.initialAgenda } : null,
        useCallback((data: OdesurAgendaView) => Boolean(data.partial), []),
    );
    const medals = useOdesurApi<OdesurMedalsView>(
        'view=medals',
        props.initialMedals ? { query: 'view=medals', data: props.initialMedals } : null,
    );
    const index = useOdesurApi<OdesurSportsIndexView>('view=index');

    // La URL dice qué se está mirando, para compartirlo y para sobrevivir a un F5.
    useEffect(() => {
        replaceUrl({
            vista: view === 'agenda' ? '' : view,
            dia: view === 'agenda' ? day : (view === 'deportes' && sport ? sportDay : ''),
            deporte: view === 'deportes' ? sport.toLowerCase() : '',
            rama: view === 'deportes' && isTeamSport(sport) ? gender : '',
        });
    }, [view, day, sport, sportDay, gender]);

    const openSport = useCallback((code: string, targetDay?: string) => {
        setSport(code.toUpperCase());
        setSportDay(targetDay ?? '');
        setView('deportes');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const openFollow = useCallback(() => {
        setFollowOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const dayNumber = days.indexOf(today) + 1;
    const liveNow = view === 'agenda' && day === today
        ? (agenda.data?.items ?? []).filter((item) => item.state === 'live').length
        : 0;

    return (
        <div className={styles.page}>
            <div className="container">
                <header className={styles.hero}>
                    {/* Arriba del pliegue: sin `loading="lazy"`. El título ya
                        nombra los Juegos, así que el logo es decorativo. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/odesur/santa-fe-2026-logo.webp"
                        alt=""
                        width={300}
                        height={213}
                        className={styles.heroLogo}
                    />
                    <div className={styles.heroText}>
                        <h1 className={styles.title}>Juegos Suramericanos Santa Fe 2026</h1>
                        <p className={styles.heroMeta}>
                            {dayNumber > 0 ? <span>Día {dayNumber} de {days.length}</span> : <span>Del 13 al 26 de septiembre</span>}
                            {liveNow > 0 ? (
                                <span className={styles.heroLive}>
                                    <span className={styles.liveDot} aria-hidden="true" />
                                    {liveNow} en vivo
                                </span>
                            ) : null}
                            <span>Horarios de Argentina</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        className={`${styles.followCta} ${follows.count > 0 ? styles.followCtaOn : ''}`}
                        aria-expanded={followOpen}
                        aria-controls={FOLLOW_PANEL_ID}
                        onClick={() => setFollowOpen((value) => !value)}
                    >
                        <Star size={16} fill={follows.count > 0 ? 'currentColor' : 'none'} aria-hidden="true" />
                        {follows.count > 0 ? `Siguiendo ${follows.count}` : 'Seguir'}
                    </button>
                </header>

                <MedalStrip medals={medals.data} follows={follows} onOpen={() => setView('medallero')} />

                <div className={styles.torch} aria-hidden="true" />

                <div id={FOLLOW_PANEL_ID}>
                    {followOpen ? <FollowPanel follows={follows} onClose={() => setFollowOpen(false)} /> : null}
                </div>

                <div className={styles.tabs} role="tablist" aria-label="Secciones de los Juegos">
                    {VIEWS.map((item) => (
                        <button
                            key={item.id}
                            id={`tab-${item.id}`}
                            type="button"
                            role="tab"
                            aria-selected={view === item.id}
                            aria-controls={`panel-${item.id}`}
                            className={`${styles.tab} ${view === item.id ? styles.tabActive : ''}`}
                            onClick={() => {
                                // Volver a tocar Deportes estando en uno vuelve al calendario.
                                if (item.id === 'deportes' && view === 'deportes') setSport('');
                                setView(item.id);
                            }}
                        >
                            {item.label}
                            {item.id === 'deportes' ? <span className={styles.tabCount}>60</span> : null}
                        </button>
                    ))}
                </div>

                <section id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className={styles.panel}>
                    {view === 'agenda' ? (
                        <AgendaPanel
                            days={days}
                            day={day}
                            today={today}
                            onDay={setDay}
                            agenda={agenda.data}
                            loading={agenda.loading}
                            error={agenda.error}
                            onRetry={agenda.reload}
                            index={index.data}
                            follows={follows}
                            onOpenFollow={openFollow}
                            onOpenSport={openSport}
                        />
                    ) : null}

                    {view === 'medallero' ? (
                        <MedalsPanel
                            medals={medals.data}
                            loading={medals.loading}
                            error={medals.error}
                            onRetry={medals.reload}
                            follows={follows}
                            onOpenSport={openSport}
                        />
                    ) : null}

                    {view === 'deportes' ? (
                        <SportsPanel
                            days={days}
                            today={today}
                            index={index.data}
                            indexLoading={index.loading}
                            indexError={index.error}
                            onRetryIndex={index.reload}
                            sport={sport}
                            sportDay={sportDay}
                            onOpenSport={openSport}
                            onBack={() => setSport('')}
                            gender={gender}
                            onGender={setGender}
                            follows={follows}
                        />
                    ) : null}
                </section>
            </div>
        </div>
    );
}
