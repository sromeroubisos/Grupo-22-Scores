'use client';

/**
 * CARGA RÁPIDA DE PLANTEL.
 *
 * Pegar la lista y listo. La alternativa —un formulario con un alta por jugador—
 * es la razón por la que hoy hay plantel en 5 clubes de 2.976: nadie carga treinta
 * jugadores de a uno.
 *
 * Se acepta lo que uno pega de una planilla o de un comunicado, en cualquiera de
 * estas formas, una por línea:
 *
 *     9  Juan Pérez - Medio scrum
 *     10. Tomás Gómez, Apertura
 *     Nicolás Sánchez
 *
 * Y se muestra lo que se entendió ANTES de guardar, porque un parser que adivina
 * sin mostrar es un parser en el que no se puede confiar.
 */

import { useMemo, useState } from 'react';

export type QuickSquadPlayer = {
    number: number | null;
    name: string;
    position: string | null;
};

/**
 * Una línea → un jugador. El número de adelante es la camiseta; lo que venga
 * después de una coma, un guion o una barra es el puesto.
 */
export function parseSquadLines(texto: string): QuickSquadPlayer[] {
    return texto
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean)
        .map((linea) => {
            let resto = linea;
            let number: number | null = null;

            const conNumero = /^(\d{1,2})\s*[-.)]?\s+(.*)$/.exec(resto);
            if (conNumero) {
                number = Number.parseInt(conNumero[1], 10);
                resto = conNumero[2].trim();
            }

            let position: string | null = null;
            const conPuesto = /^(.*?)\s*(?:,|\||\s[-–—]\s)\s*(.+)$/.exec(resto);
            if (conPuesto) {
                resto = conPuesto[1].trim();
                position = conPuesto[2].trim() || null;
            }

            return { number, name: resto, position };
        })
        .filter((p) => p.name.length > 0);
}

type Props = {
    teamKey: string;
    teamName: string;
    sport: string;
    onClose: () => void;
    onSaved: () => void;
};

const CAMPO: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 13,
    background: 'var(--color-bg-secondary, rgba(127,127,127,0.12))',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-glass-border, rgba(127,127,127,0.25))',
};

type Coincidencia = {
    id: string;
    fullName: string;
    clubId: string | null;
    kind: 'exact' | 'similar';
};

type Pregunta = {
    name: string;
    matches: Coincidencia[];
};

/** Lo que se decidió para un nombre: el id de una ficha, o que es alguien nuevo. */
type Decision = string | 'nuevo';

export default function QuickSquadModal({ teamKey, teamName, sport, onClose, onSaved }: Props) {
    const [lista, setLista] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
    const [decisiones, setDecisiones] = useState<Record<string, Decision>>({});
    const [paso, setPaso] = useState<'editar' | 'confirmar'>('editar');

    const jugadores = useMemo(() => parseSquadLines(lista), [lista]);

    const cuerpo = (extra: Record<string, unknown> = {}) => ({
        teamKey,
        teamName,
        sport,
        from: desde || null,
        to: hasta || null,
        ...extra,
    });

    /**
     * Antes de escribir nada se pregunta quién es quién. El orden importa: consultar
     * DESPUÉS de crear las fichas no sirve para nada, el duplicado ya existe.
     */
    const revisar = async () => {
        setGuardando(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/super/quick-squad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpo({ mode: 'check', players: jugadores })),
            });
            const payload = await res.json();
            if (!res.ok || payload?.error) {
                setError(payload?.error || 'No se pudo revisar el plantel.');
                return;
            }

            const encontradas: Pregunta[] = Array.isArray(payload.questions) ? payload.questions : [];
            if (encontradas.length === 0) {
                await guardar({});
                return;
            }

            setPreguntas(encontradas);
            setPaso('confirmar');
        } catch {
            setError('No se pudo revisar el plantel.');
        } finally {
            setGuardando(false);
        }
    };

    const guardar = async (elegidas: Record<string, Decision>) => {
        setGuardando(true);
        setError(null);
        try {
            const conDecision = jugadores.map((j) => {
                const decision = elegidas[j.name];
                if (!decision) return j;
                if (decision === 'nuevo') return { ...j, isNew: true };
                return { ...j, personId: decision };
            });

            const res = await fetch('/api/admin/super/quick-squad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpo({ players: conDecision })),
            });
            const payload = await res.json();
            if (!res.ok || payload?.error) {
                setError(payload?.error || 'No se pudo guardar el plantel.');
                return;
            }
            onSaved();
        } catch {
            setError('No se pudo guardar el plantel.');
        } finally {
            setGuardando(false);
        }
    };

    const sinResponder = preguntas.filter((p) => !decisiones[p.name]).length;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="carga-plantel-titulo"
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                display: 'grid', placeItems: 'center', padding: 16,
                background: 'rgba(0,0,0,0.6)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 20,
                borderRadius: 12,
                background: 'var(--color-bg-primary, #101010)',
                border: '1px solid var(--color-glass-border, rgba(127,127,127,0.25))',
            }}>
                <h2 id="carga-plantel-titulo" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Cargar el plantel de {teamName}
                </h2>
                <p style={{ margin: '6px 0 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Un jugador por línea. Podés poner el número adelante y el puesto después de una coma o un guion.
                </p>

                {paso === 'editar' ? (
                <>
                <label htmlFor="plantel-lista" style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                    Jugadores
                </label>
                <textarea
                    id="plantel-lista"
                    value={lista}
                    onChange={(e) => setLista(e.target.value)}
                    rows={10}
                    placeholder={'9 Juan Pérez - Medio scrum\n10. Tomás Gómez, Apertura\nNicolás Sánchez'}
                    style={{ ...CAMPO, fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }}
                />

                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', margin: '14px 0' }}>
                    <div>
                        <label htmlFor="plantel-desde" style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                            Desde
                        </label>
                        <input id="plantel-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={CAMPO} />
                    </div>
                    <div>
                        <label htmlFor="plantel-hasta" style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                            Hasta
                        </label>
                        <input id="plantel-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={CAMPO} />
                    </div>
                </div>
                <p style={{ margin: '-4px 0 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    El plazo que cubre este plantel. Si lo dejás vacío, queda sin fecha de corte.
                </p>

                {jugadores.length > 0 && (
                    <div style={{
                        margin: '0 0 14px', padding: 12, borderRadius: 8, maxHeight: 180, overflowY: 'auto',
                        background: 'var(--color-glass, rgba(127,127,127,0.06))',
                        border: '1px solid var(--color-glass-border, rgba(127,127,127,0.2))',
                    }}>
                        <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>
                            Así se van a guardar ({jugadores.length})
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--color-text-primary)' }}>
                            {jugadores.map((j, i) => (
                                <li key={`${j.name}-${i}`} style={{ padding: '2px 0' }}>
                                    <span style={{ display: 'inline-block', width: 26, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                        {j.number ?? '–'}
                                    </span>
                                    {j.name}
                                    {j.position ? <span style={{ color: 'var(--color-text-secondary)' }}> · {j.position}</span> : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-warning, #d99a2b)' }}>
                    Esto reemplaza el plantel de este mismo plazo. Los de otros períodos quedan.
                </p>
                </>
                ) : (
                <div style={{ margin: '0 0 16px' }}>
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        Algunos de estos nombres ya tienen ficha. Decinos cuáles son la misma persona
                        para no partirle el historial en dos.
                    </p>

                    {preguntas.map((pregunta) => (
                        <fieldset
                            key={pregunta.name}
                            style={{
                                border: '1px solid var(--color-glass-border, rgba(127,127,127,0.2))',
                                borderRadius: 8, padding: 12, margin: '0 0 10px',
                            }}
                        >
                            <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {pregunta.name}
                            </legend>

                            {pregunta.matches.map((coincidencia) => (
                                <label
                                    key={coincidencia.id}
                                    style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-primary)' }}
                                >
                                    <input
                                        type="radio"
                                        name={`quien-es-${pregunta.name}`}
                                        checked={decisiones[pregunta.name] === coincidencia.id}
                                        onChange={() => setDecisiones((p) => ({ ...p, [pregunta.name]: coincidencia.id }))}
                                    />
                                    <span>
                                        Es {coincidencia.fullName}
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                            {coincidencia.kind === 'exact' ? ' · mismo nombre' : ' · escrito parecido'}
                                            {coincidencia.clubId ? ` · ${coincidencia.clubId}` : ''}
                                        </span>
                                    </span>
                                </label>
                            ))}

                            <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                                <input
                                    type="radio"
                                    name={`quien-es-${pregunta.name}`}
                                    checked={decisiones[pregunta.name] === 'nuevo'}
                                    onChange={() => setDecisiones((p) => ({ ...p, [pregunta.name]: 'nuevo' }))}
                                />
                                <span>Es otro jugador, hacele ficha nueva</span>
                            </label>
                        </fieldset>
                    ))}
                </div>
                )}

                {error && (
                    <p role="alert" style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error, #e05252)' }}>
                        {error}
                    </p>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={paso === 'confirmar' ? () => setPaso('editar') : onClose}
                        style={{
                            padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
                            background: 'transparent',
                            border: '1px solid var(--color-glass-border, rgba(127,127,127,0.25))',
                            color: 'var(--color-text-secondary)',
                        }}
                    >
                        {paso === 'confirmar' ? 'Volver' : 'Cancelar'}
                    </button>
                    {paso === 'editar' ? (
                        <button
                            type="button"
                            onClick={revisar}
                            disabled={guardando || jugadores.length === 0}
                            title={jugadores.length === 0 ? 'Pegá al menos un jugador para poder seguir.' : undefined}
                            style={{
                                padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                cursor: guardando || jugadores.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: guardando || jugadores.length === 0 ? 0.5 : 1,
                                background: 'var(--color-accent)',
                                border: '1px solid var(--color-accent)',
                                color: 'var(--color-accent-ink, #04140c)',
                            }}
                        >
                            {guardando ? 'Revisando…' : `Guardar ${jugadores.length || ''}`.trim()}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => guardar(decisiones)}
                            disabled={guardando || sinResponder > 0}
                            title={sinResponder > 0 ? `Faltan ${sinResponder} por responder.` : undefined}
                            style={{
                                padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                cursor: guardando || sinResponder > 0 ? 'not-allowed' : 'pointer',
                                opacity: guardando || sinResponder > 0 ? 0.5 : 1,
                                background: 'var(--color-accent)',
                                border: '1px solid var(--color-accent)',
                                color: 'var(--color-accent-ink, #04140c)',
                            }}
                        >
                            {guardando ? 'Guardando…' : sinResponder > 0 ? `Faltan ${sinResponder}` : 'Confirmar y guardar'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
