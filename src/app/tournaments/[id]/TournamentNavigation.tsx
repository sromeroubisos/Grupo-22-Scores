'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import styles from './TournamentNavigation.module.css';

/**
 * Los dos desplegables de la cabecera: grado y temporada.
 *
 * ── No dibuja nada cuando no hay a dónde ir ────────────────────────────────
 * Los menús llegan VACÍOS de la ruta cuando el torneo no tiene hermanos, y el
 * componente devuelve `null`. No hay contenedor reservado, ni separador, ni un
 * desplegable deshabilitado: un torneo sin hermanos se ve exactamente igual que
 * antes de que esto existiera.
 *
 * ── Por qué se pide después de pintar ──────────────────────────────────────
 * La cabecera no espera al menú. Si la ruta tarda o falla, el torneo se ve igual
 * y los desplegables simplemente no aparecen — nunca al revés.
 */

interface OpcionMenu {
    id: string;
    label: string;
    detalle: string | null;
    esActual: boolean;
}

interface Navegacion {
    grados: OpcionMenu[];
    temporadas: OpcionMenu[];
}

function Desplegable({
    etiqueta,
    titulo,
    opciones,
}: {
    etiqueta: string;
    titulo: string;
    opciones: OpcionMenu[];
}) {
    const [abierto, setAbierto] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!abierto) return;
        const afuera = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
        };
        const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', afuera);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', afuera);
            document.removeEventListener('keydown', escape);
        };
    }, [abierto]);

    return (
        <span className={styles.switcher} ref={ref}>
            <button
                type="button"
                className={styles.trigger}
                onClick={() => setAbierto((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                title={titulo}
            >
                <span>{etiqueta}</span>
                <svg
                    className={`${styles.caret} ${abierto ? styles.caretOpen : ''}`}
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {abierto && (
                <div className={styles.menu} role="listbox" aria-label={titulo}>
                    {opciones.map((o) => (
                        <Link
                            key={o.id}
                            href={`/tournaments/${o.id}`}
                            className={`${styles.item} ${o.esActual ? styles.itemActive : ''}`}
                            role="option"
                            aria-selected={o.esActual}
                            onClick={() => setAbierto(false)}
                        >
                            <span className={styles.itemLabel}>{o.label}</span>
                            {o.detalle && <span className={styles.itemDetalle}>{o.detalle}</span>}
                        </Link>
                    ))}
                </div>
            )}
        </span>
    );
}

export default function TournamentNavigation({ tournamentId }: { tournamentId: string }) {
    const [nav, setNav] = useState<Navegacion | null>(null);

    useEffect(() => {
        let vivo = true;
        // Un id externo (fs-, espn-) no tiene hermanos en la base: no se pregunta.
        if (!tournamentId || /^(fs-|espn-|ras-)/i.test(tournamentId)) return;
        fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/navegacion`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (vivo && d) setNav(d); })
            .catch(() => { /* sin menú: la cabecera se ve igual */ });
        return () => { vivo = false; };
    }, [tournamentId]);

    const grados = nav?.grados ?? [];
    const temporadas = nav?.temporadas ?? [];
    if (!grados.length && !temporadas.length) return null;

    const gradoActual = grados.find((o) => o.esActual);
    const temporadaActual = temporadas.find((o) => o.esActual);

    return (
        <span className={styles.wrap}>
            {grados.length > 0 && (
                <Desplegable
                    etiqueta={gradoActual?.label ?? 'Grado'}
                    titulo="Cambiar de grado o zona"
                    opciones={grados}
                />
            )}
            {temporadas.length > 0 && (
                <Desplegable
                    etiqueta={temporadaActual?.label ?? 'Temporada'}
                    titulo="Cambiar de temporada"
                    opciones={temporadas}
                />
            )}
        </span>
    );
}
