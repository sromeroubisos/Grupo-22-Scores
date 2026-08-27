'use client';

/**
 * ARMÁ TU FORMACIÓN.
 *
 * El hincha entra a la previa, elige quién juega en cada puesto y se lleva la placa.
 * Y ahí termina: NO SE GUARDA. Es un juego propio, no un pronóstico ni una votación,
 * así que el estado vive en este componente y se pierde al salir. Por eso tampoco
 * pide sesión: no hay nada que atribuirle a nadie.
 *
 * Los jugadores salen SOLO del plantel cargado del club. Si el club no tiene plantel,
 * la tarjeta lo dice y no ofrece un campo vacío: elegir entre ningún jugador no es
 * elegir. La alternativa —caer a las fichas sueltas de `people`— llenaría el selector
 * de gente que apareció una vez en la planilla de un partido y no está en el plantel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExportImage from '@/components/ExportImage';
import type { SportLineup, LineupSlot } from '@/lib/data/lineupPositions';

type SquadPlayer = {
    id: string;
    name: string;
    position: string | null;
    jerseyNumber: number | null;
};

type TeamOption = {
    teamKey: string;
    clubId: string | null;
    clubName: string | null;
    name: string;
    players: SquadPlayer[];
};

type TeamRef = {
    key: string;
    name: string;
    logo?: string | null;
};

type Props = {
    sport: string;
    home: TeamRef;
    away: TeamRef;
    tournament?: string | null;
    tournamentLogo?: string | null;
    dateLabel?: string | null;
    timeLabel?: string | null;
    venue?: string | null;
    kickoffAt?: string | null;
};

/** slotCode → playerId, por equipo. */
type Picks = Record<string, Record<string, string>>;

const CAJA: React.CSSProperties = {
    background: 'var(--color-glass, rgba(127,127,127,0.06))',
    border: '1px solid var(--color-glass-border, rgba(127,127,127,0.2))',
    borderRadius: 12,
};

export default function MyLineupBuilder({
    sport, home, away, tournament, tournamentLogo, dateLabel, timeLabel, venue, kickoffAt,
}: Props) {
    const [lineup, setLineup] = useState<SportLineup | null>(null);
    const [teams, setTeams] = useState<TeamOption[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState(false);
    const [equipoActivo, setEquipoActivo] = useState(0);
    const [picks, setPicks] = useState<Picks>({});

    useEffect(() => {
        if (!sport || (!home.key && !away.key)) {
            setCargando(false);
            return;
        }

        const controller = new AbortController();

        (async () => {
            try {
                const params = new URLSearchParams({ sport });
                if (home.key) { params.set('home', home.key); params.set('home_name', home.name); }
                if (away.key) { params.set('away', away.key); params.set('away_name', away.name); }

                const res = await fetch(`/api/lineup-options?${params.toString()}`, { signal: controller.signal });
                const payload = await res.json();
                if (controller.signal.aborted) return;

                if (!res.ok) { setFallo(true); return; }
                setLineup(payload.lineup ?? null);
                setTeams(Array.isArray(payload.teams) ? payload.teams : []);
            } catch (error) {
                if ((error as Error)?.name === 'AbortError') return;
                setFallo(true);
            } finally {
                if (!controller.signal.aborted) setCargando(false);
            }
        })();

        return () => controller.abort();
    }, [sport, home.key, home.name, away.key, away.name]);

    const equipo = teams[equipoActivo] ?? null;
    const picksDelEquipo = equipo ? (picks[equipo.teamKey] ?? {}) : {};

    const elegir = useCallback((teamKey: string, slotCode: string, playerId: string) => {
        setPicks((previo) => {
            const delEquipo = { ...(previo[teamKey] ?? {}) };

            if (!playerId) {
                delete delEquipo[slotCode];
                return { ...previo, [teamKey]: delEquipo };
            }

            // Un jugador no puede estar en dos puestos a la vez: si ya estaba en otro,
            // se muda. Es lo que espera cualquiera que mueva un nombre de un casillero
            // a otro, y evita el XV con el mismo apertura repetido.
            for (const [codigo, id] of Object.entries(delEquipo)) {
                if (id === playerId && codigo !== slotCode) delete delEquipo[codigo];
            }

            delEquipo[slotCode] = playerId;
            return { ...previo, [teamKey]: delEquipo };
        });
    }, []);

    const limpiar = useCallback((teamKey: string) => {
        setPicks((previo) => ({ ...previo, [teamKey]: {} }));
    }, []);

    const jugadoresPorId = useMemo(() => {
        const mapa = new Map<string, SquadPlayer>();
        for (const t of teams) for (const p of t.players) mapa.set(`${t.teamKey}|${p.id}`, p);
        return mapa;
    }, [teams]);

    const filasParaExport = useCallback((team: TeamOption | null, soloTitulares: boolean) => {
        if (!team || !lineup) return [];
        const elegidos = picks[team.teamKey] ?? {};

        return lineup.slots
            .filter((s) => (soloTitulares ? s.group !== 'bench' : s.group === 'bench'))
            .map((s) => {
                const jugador = jugadoresPorId.get(`${team.teamKey}|${elegidos[s.code]}`);
                if (!jugador) return null;
                return {
                    id: jugador.id,
                    number: s.number,
                    name: jugador.name,
                    position: s.label,
                    role: soloTitulares ? 'starter' : 'substitute',
                };
            })
            .filter(Boolean);
    }, [jugadoresPorId, lineup, picks]);

    /**
     * La placa lleva LOS 23, no los 15. El banco es parte de la formación que uno
     * arma —el 23 es justamente de lo que habla todo el mundo— y exportar solo los
     * titulares deja afuera la mitad de las decisiones que tomó el que la armó.
     *
     * Van en `starters` porque la plantilla del export dibuja lo que le den y cada
     * fila ya viaja con su número y su puesto: el 16 se lee como suplente solo.
     */
    const formacionCompleta = (team: TeamOption | null) => [
        ...filasParaExport(team, true),
        ...filasParaExport(team, false),
    ];

    const titularesLocal = formacionCompleta(teams[0] ?? null);
    const titularesVisita = formacionCompleta(teams[1] ?? null);
    const hayAlgoParaExportar = titularesLocal.length > 0 || titularesVisita.length > 0;

    if (cargando) {
        return (
            <div style={{ ...CAJA, padding: 18, marginTop: 20 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Buscando los planteles…</p>
            </div>
        );
    }

    // Un deporte sin formación declarada, o un error: la sección no aparece. Es una
    // función extra, y una tarjeta rota molesta más que una ausencia.
    if (fallo || !lineup) return null;

    const sinPlantel = teams.every((t) => t.players.length === 0);

    return (
        <section style={{ ...CAJA, padding: 18, marginTop: 20 }} aria-labelledby="mi-formacion-titulo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                    <h3 id="mi-formacion-titulo" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Armá {lineup.name}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        Elegí vos quién juega en cada puesto. No se guarda: si querés conservarla, exportala.
                    </p>
                </div>
            </div>

            {sinPlantel ? (
                <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Todavía no hay plantel cargado para estos equipos, así que no hay entre quiénes elegir.
                </p>
            ) : (
                <>
                    <div role="radiogroup" aria-label="Elegí el equipo" style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
                        {teams.map((t, i) => {
                            const activo = i === equipoActivo;
                            return (
                                <button
                                    key={t.teamKey || i}
                                    type="button"
                                    role="radio"
                                    aria-checked={activo}
                                    onClick={() => setEquipoActivo(i)}
                                    disabled={t.players.length === 0}
                                    title={t.players.length === 0 ? 'Este club todavía no tiene plantel cargado' : undefined}
                                    style={{
                                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                        cursor: t.players.length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: t.players.length === 0 ? 0.45 : 1,
                                        background: activo ? 'var(--color-accent)' : 'transparent',
                                        color: activo ? 'var(--color-accent-ink, #04140c)' : 'var(--color-text-primary)',
                                        border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--color-glass-border, rgba(127,127,127,0.25))'}`,
                                    }}
                                >
                                    {t.name}
                                </button>
                            );
                        })}
                    </div>

                    {equipo && equipo.players.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                            {equipo.name} todavía no tiene plantel cargado.
                        </p>
                    ) : equipo ? (
                        <>
                            {lineup.groups.map((grupo) => {
                                const puestos = lineup.slots.filter((s) => s.group === grupo.id);
                                if (puestos.length === 0) return null;

                                return (
                                    <fieldset key={grupo.id} style={{ border: 0, margin: '0 0 18px', padding: 0 }}>
                                        <legend style={{
                                            padding: 0, marginBottom: 8, fontSize: 11, fontWeight: 700,
                                            textTransform: 'uppercase', letterSpacing: '0.08em',
                                            color: 'var(--color-text-tertiary, var(--color-text-secondary))',
                                        }}>
                                            {grupo.label}
                                        </legend>

                                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                                            {puestos.map((puesto) => (
                                                <SlotRow
                                                    key={puesto.code}
                                                    slot={puesto}
                                                    players={equipo.players}
                                                    elegido={picksDelEquipo[puesto.code] ?? ''}
                                                    usados={picksDelEquipo}
                                                    onChange={(playerId) => elegir(equipo.teamKey, puesto.code, playerId)}
                                                />
                                            ))}
                                        </div>
                                    </fieldset>
                                );
                            })}

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={() => limpiar(equipo.teamKey)}
                                    disabled={Object.keys(picksDelEquipo).length === 0}
                                    style={{
                                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                        background: 'transparent',
                                        border: '1px solid var(--color-glass-border, rgba(127,127,127,0.25))',
                                        color: 'var(--color-text-secondary)',
                                        cursor: Object.keys(picksDelEquipo).length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: Object.keys(picksDelEquipo).length === 0 ? 0.45 : 1,
                                    }}
                                >
                                    Vaciar {equipo.name}
                                </button>

                                {hayAlgoParaExportar ? (
                                    <ExportImage
                                        template="lineups"
                                        filename={`mi-formacion-${home.name}-${away.name}`}
                                        data={{
                                            tournament: tournament || 'Mi formación',
                                            tournamentLogo,
                                            date: dateLabel || '',
                                            time: timeLabel || '',
                                            venue: venue || '',
                                            kickoffAt,
                                            homeTeam: {
                                                name: home.name,
                                                logo: home.logo,
                                                lineupLabel: 'Mi formación',
                                                starters: titularesLocal,
                                            },
                                            awayTeam: {
                                                name: away.name,
                                                logo: away.logo,
                                                lineupLabel: 'Mi formación',
                                                starters: titularesVisita,
                                            },
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        Elegí al menos un jugador para poder exportar la placa.
                                    </span>
                                )}
                            </div>
                        </>
                    ) : null}
                </>
            )}
        </section>
    );
}

function SlotRow({
    slot, players, elegido, usados, onChange,
}: {
    slot: LineupSlot;
    players: SquadPlayer[];
    elegido: string;
    usados: Record<string, string>;
    onChange: (playerId: string) => void;
}) {
    const idCampo = `puesto-${slot.code}`;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
                aria-hidden="true"
                style={{
                    flex: '0 0 auto', width: 28, height: 28, borderRadius: 6,
                    display: 'grid', placeItems: 'center',
                    fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    background: 'var(--color-bg-secondary, rgba(127,127,127,0.12))',
                    color: 'var(--color-text-secondary)',
                }}
            >
                {slot.number}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
                <label
                    htmlFor={idCampo}
                    style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary, var(--color-text-secondary))' }}
                >
                    {slot.label}
                </label>
                <select
                    id={idCampo}
                    value={elegido}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13,
                        background: 'var(--color-bg-secondary, rgba(127,127,127,0.12))',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-glass-border, rgba(127,127,127,0.25))',
                    }}
                >
                    <option value="">— libre —</option>
                    {players.map((p) => {
                        // El que ya está en otro puesto se marca, pero no se bloquea:
                        // elegirlo acá lo mueve, que es lo que uno espera.
                        const enOtroPuesto = Object.entries(usados)
                            .some(([codigo, id]) => id === p.id && codigo !== slot.code);
                        return (
                            <option key={p.id} value={p.id}>
                                {p.name}
                                {p.position ? ` · ${p.position}` : ''}
                                {enOtroPuesto ? ' (ya está en otro puesto)' : ''}
                            </option>
                        );
                    })}
                </select>
            </div>
        </div>
    );
}
