'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Activity, Trophy, User, CalendarClock, X, ArrowRight } from 'lucide-react';

type NextMatch = {
    homeLabel: string;
    awayLabel: string;
    homeLogoUrl: string | null;
    awayLogoUrl: string | null;
    startsAt: string;
};

interface ProdeWorldCupScreenProps {
    playHref: string;
    competitionName: string;
    finished: boolean;
    memberCount: number;
    openEvents: number;
    incentive: { label: string | null; value: string };
    nextMatch: NextMatch | null;
    // 'page' = pantalla completa (/prode/mundial). 'modal' = dentro del popup glass.
    mode?: 'page' | 'modal';
    onClose?: () => void;
    onPlay?: () => void;
}

type Countdown = { d: number; h: number; m: number; s: number };

function diffToCountdown(targetMs: number): Countdown {
    const diff = Math.max(0, targetMs - Date.now());
    return {
        d: Math.floor(diff / 86400000),
        h: Math.floor(diff / 3600000) % 24,
        m: Math.floor(diff / 60000) % 60,
        s: Math.floor(diff / 1000) % 60,
    };
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function ProdeWorldCupScreen({
    playHref,
    competitionName,
    finished,
    memberCount,
    openEvents,
    incentive,
    nextMatch,
    mode = 'page',
    onClose,
    onPlay,
}: ProdeWorldCupScreenProps) {
    const isModal = mode === 'modal';
    // Guard: startsAt puede venir inválido de la fuente externa; NaN rompería el contador.
    const parsedStartMs = nextMatch ? new Date(nextMatch.startsAt).getTime() : NaN;
    const targetMs = Number.isNaN(parsedStartMs) ? 0 : parsedStartMs;
    const [cd, setCd] = useState<Countdown>({ d: 0, h: 0, m: 0, s: 0 });
    // La fecha formateada se calcula tras montar para evitar desajustes de hidratación
    // (la zona horaria del server puede diferir de la del cliente).
    const [kickoffLabel, setKickoffLabel] = useState('');

    useEffect(() => {
        if (!nextMatch) return;
        const tick = () => setCd(diffToCountdown(targetMs));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [nextMatch, targetMs]);

    useEffect(() => {
        if (!nextMatch) return;
        const startsAt = new Date(nextMatch.startsAt);
        // Guard: Intl.DateTimeFormat.format lanza RangeError con fecha inválida y este
        // componente se monta globalmente. Si la fecha es inválida, no mostramos el texto.
        if (Number.isNaN(startsAt.getTime())) {
            setKickoffLabel('');
            return;
        }
        setKickoffLabel(
            new Intl.DateTimeFormat('es-AR', {
                weekday: 'long',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            }).format(startsAt),
        );
    }, [nextMatch]);

    // Entrada escalonada del contenido (solo popup): cada bloque sube y aparece en cascada.
    // Curva ease-out fuerte de Emil Kowalski; respeta prefers-reduced-motion (solo crossfade).
    const [entered, setEntered] = useState(false);
    const [reduce, setReduce] = useState(false);
    useEffect(() => {
        if (!isModal) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduce(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
        mq.addEventListener('change', onChange);
        // Doble rAF: garantiza que el estado inicial (oculto) pinte antes de animar.
        const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
        return () => {
            mq.removeEventListener('change', onChange);
            cancelAnimationFrame(raf);
        };
    }, [isModal]);

    const reveal = (i: number): React.CSSProperties | undefined => {
        if (!isModal) return undefined;
        return {
            opacity: entered ? 1 : 0,
            transform: entered || reduce ? 'none' : 'translateY(12px)',
            transition: reduce
                ? 'opacity 240ms ease'
                : 'opacity 440ms cubic-bezier(0.23,1,0.32,1), transform 440ms cubic-bezier(0.23,1,0.32,1)',
            transitionDelay: reduce ? '0ms' : `${i * 55}ms`,
            willChange: 'opacity, transform',
        };
    };

    const units: Array<[string, number]> = [
        ['Días', cd.d],
        ['Hs', cd.h],
        ['Min', cd.m],
        ['Seg', cd.s],
    ];

    return (
        <div
            className={`relative isolate mx-auto flex w-full flex-col text-white ${
                isModal
                    ? 'max-w-[420px] overflow-hidden rounded-none ring-1 ring-inset ring-white/10'
                    : 'min-h-[100dvh] max-w-md'
            }`}
            style={{
                // Superficie premium: glow magenta horneado en el fondo (robusto, no se cae por z-index)
                // sobre una base violeta profunda. Sin arcoíris saturado.
                background:
                    'radial-gradient(135% 80% at 50% -8%, rgba(236,72,153,0.45), rgba(236,72,153,0) 50%), linear-gradient(168deg, #321060 0%, #3A1247 55%, #2B1029 100%)',
                ...(isModal ? { maxHeight: '92dvh', boxShadow: '0 30px 70px -12px rgba(0,0,0,0.6)' } : {}),
            }}
        >
            {/* Brillo blanco sutil en el borde superior para el "filo" del cristal. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }}
            />

            {/* Botón cerrar (solo en popup) */}
            {isModal && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full text-white/65 transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-90"
                >
                    <X size={18} />
                </button>
            )}

            {/* Contenido */}
            <div
                className={`relative z-10 flex flex-1 flex-col ${
                    isModal ? 'min-h-0 justify-center overflow-y-auto' : 'gap-9 px-6 pb-28 pt-12'
                }`}
                // Espaciado inline en modal: el dev server de Tailwind no siempre regenera
                // clases nuevas (px-7 computaba 0) → el botón tocaba los bordes. Inline = robusto.
                style={isModal ? { paddingTop: 44, paddingBottom: 32, paddingLeft: 24, paddingRight: 24, rowGap: 28 } : undefined}
            >
                {/* Sección 1 — Cabecera + contador */}
                <section className="flex flex-col items-center text-center" style={reveal(0)}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
                        <Trophy size={12} className="text-amber-300" />
                        {competitionName}
                    </span>

                    <p className="mt-4 text-sm font-medium text-white/60">
                        {finished ? 'El Mundial terminó' : nextMatch ? 'Arranca en' : 'Muy pronto'}
                    </p>

                    {nextMatch && (
                        <div
                            className={`mt-4 flex w-full justify-center ${
                                isModal ? 'max-w-[296px] gap-2' : 'gap-3'
                            }`}
                        >
                            {units.map(([label, value]) => (
                                <TimeCell key={label} value={value} label={label} isModal={isModal} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Sección 2 — Partido (sin caja anidada: vive sobre la superficie). */}
                {nextMatch && (
                    <section style={reveal(1)}>
                        <div className={`flex items-center justify-center ${isModal ? 'gap-4' : 'gap-6'}`}>
                            <TeamSide name={nextMatch.homeLabel} logo={nextMatch.homeLogoUrl} isModal={isModal} />
                            <VsBadge isModal={isModal} />
                            <TeamSide name={nextMatch.awayLabel} logo={nextMatch.awayLogoUrl} isModal={isModal} />
                        </div>

                        {kickoffLabel && (
                            <div className="mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white/75">
                                <CalendarClock size={14} className="shrink-0" />
                                <span className="capitalize">{kickoffLabel}</span>
                            </div>
                        )}
                    </section>
                )}

                {/* Grupo inferior: CTA + incentivo + stats, anclado al fondo del sheet. */}
                <div className="flex flex-col gap-5">
                {/* Sección 3 — CTA principal. El wrapper hace el reveal; el Link conserva su
                    propio transform para el press (scale en :active). */}
                <div style={reveal(2)}>
                    <Link
                        href={playHref}
                        onClick={onPlay}
                        className="group flex w-full items-center justify-center gap-2 rounded-none bg-white py-4 text-center text-lg font-extrabold transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#3A1046] active:scale-[0.97]"
                        // Color inline: garantiza el texto oscuro aunque el JIT no genere el color arbitrario.
                        style={{ color: '#3A1046', boxShadow: '0 12px 32px -10px rgba(236,72,153,0.5)' }}
                    >
                        {finished ? 'Ver resultados' : 'Jugar ahora'}
                        <ArrowRight
                            size={20}
                            className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                        />
                    </Link>
                </div>

                {/* Sección 4 — Incentivo social (sin caja: callout limpio). */}
                <div className="flex items-center justify-center gap-2 text-center" style={reveal(3)}>
                    <Trophy size={16} className="shrink-0 text-amber-300" />
                    <p className="text-sm text-white/80">
                        {incentive.label ? (
                            <>
                                {incentive.label}: <span className="font-bold text-white">{incentive.value}</span>
                            </>
                        ) : (
                            <span className="font-medium text-white">{incentive.value}</span>
                        )}
                    </p>
                </div>

                {/* Sección 5 — Comunidad: dos números centrados con divisor, sin cajas ni clipping. */}
                <section className="border-t border-white/10 pt-5" style={reveal(4)}>
                    <div className="grid grid-cols-2">
                        <StatBlock value={String(memberCount)} label="Jugando el prode" />
                        <div className="border-l border-white/10">
                            <StatBlock value={String(openEvents)} label="Partidos por predecir" />
                        </div>
                    </div>
                </section>
                </div>
            </div>

            {/* Barra de navegación inferior (solo en pantalla completa, no en el popup) */}
            {!isModal && (
                <nav
                    className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center justify-around border-t border-white/10 px-2 pb-[env(safe-area-inset-bottom,8px)] pt-3"
                    style={{ background: 'rgba(20,8,40,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
                >
                    <NavLink href="/" icon={<Home size={22} />} label="Inicio" />
                    <NavLink href={playHref} icon={<Activity size={22} />} label="Pronósticos" active />
                    <NavLink href="/prode/ranking-global" icon={<Trophy size={22} />} label="Ranking" />
                    <NavLink href="/profile" icon={<User size={22} />} label="Perfil" />
                </nav>
            )}
        </div>
    );
}

function TimeCell({ value, label, isModal }: { value: number; label: string; isModal: boolean }) {
    return (
        <div
            className={`flex flex-1 flex-col items-center rounded-none ${isModal ? 'py-5' : 'py-4'}`}
            style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.07)',
            }}
        >
            <span
                className={`font-extrabold leading-none tabular-nums ${isModal ? 'text-[38px]' : 'text-5xl'}`}
                style={{ textShadow: '0 0 22px rgba(255,120,200,0.45)' }}
            >
                {pad(value)}
            </span>
            <span
                className={`mt-1.5 font-semibold uppercase tracking-wider text-white/50 ${
                    isModal ? 'text-[10px]' : 'text-xs'
                }`}
            >
                {label}
            </span>
        </div>
    );
}

function VsBadge({ isModal }: { isModal: boolean }) {
    return (
        <div
            className={`grid shrink-0 place-items-center rounded-full font-extrabold text-white/85 ${
                isModal ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-sm'
            }`}
            style={{ background: 'rgba(255,255,255,0.10)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)' }}
        >
            VS
        </div>
    );
}

function TeamSide({ name, logo, isModal }: { name: string; logo: string | null; isModal: boolean }) {
    return (
        <div className={`flex flex-col items-center gap-3 ${isModal ? 'w-28' : 'w-32'}`}>
            <div
                className={`grid place-items-center overflow-hidden rounded-none ${isModal ? 'h-20 w-20' : 'h-24 w-24'}`}
                style={{
                    background: 'rgba(255,255,255,0.10)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16), 0 8px 20px rgba(0,0,0,0.22)',
                }}
            >
                {logo ? (
                    <img
                        src={logo}
                        alt={name}
                        className={`object-contain drop-shadow ${isModal ? 'h-11 w-11' : 'h-14 w-14'}`}
                        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    />
                ) : (
                    <span className={isModal ? 'text-2xl' : 'text-3xl'}>⚽</span>
                )}
            </div>
            <span className={`text-center font-bold leading-tight ${isModal ? 'text-[15px]' : 'text-lg'}`}>{name}</span>
        </div>
    );
}

function StatBlock({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col items-center px-2 text-center">
            <p className="text-[32px] font-extrabold leading-none tabular-nums">{value}</p>
            <p className="mt-1.5 text-[12px] leading-snug text-white/60">{label}</p>
        </div>
    );
}

function NavLink({
    href,
    icon,
    label,
    active = false,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
                active ? 'text-white' : 'text-white/55'
            }`}
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
