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
    tabActiva,
}: {
    etiqueta: string;
    titulo: string;
    opciones: OpcionMenu[];
    tabActiva?: string | null;
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
                            href={`/tournaments/${o.id}${tabActiva ? `?tab=${encodeURIComponent(tabActiva)}` : ''}`}
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

export default function TournamentNavigation({
    tournamentId,
    tabActiva,
    onTemporadasChange,
}: {
    tournamentId: string;
    /**
     * Solapa activa de la página, para conservarla en el salto: cambiar de
     * grado o de temporada mirando la Clasificación tiene que aterrizar en la
     * Clasificación del destino, no en el Resumen. Si el destino no tiene esa
     * solapa, la página cae sola a la primera disponible.
     */
    tabActiva?: string | null;
    /**
     * Avisa si este componente terminó dibujando un selector de temporada.
     *
     * La cabecera tiene el suyo propio, que viene de otra fuente
     * (`availableSeasonOptions`) y cubre casos que la ruta de navegación no
     * atiende — por ejemplo un torneo de id externo, donde acá ni se pregunta.
     * Sin este aviso los dos se dibujaban a la vez y el año salía repetido:
     * «Rugby · Argentina · 2026 ⌄ · Superior ⌄ · 2026 ⌄».
     *
     * Gana este, que además ofrece el grado; la cabecera esconde el suyo.
     */
    onTemporadasChange?: (tieneTemporadas: boolean) => void;
}) {
    const [nav, setNav] = useState<Navegacion | null>(null);

    useEffect(() => {
        let vivo = true;
        // Un id externo (fs-, espn-, ras-, fih-wc-, fisu-) no tiene hermanos en la base:
        // no se pregunta. Preguntar era un 404 en la consola por cada visita.
        if (!tournamentId || /^(fs-|espn-|ras-|fih-wc-|fisu-)/i.test(tournamentId)) return;
        fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/navegacion`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (vivo && d) setNav(d); })
            .catch(() => { /* sin menú: la cabecera se ve igual */ });
        return () => { vivo = false; };
    }, [tournamentId]);

    const grados = nav?.grados ?? [];
    const temporadas = nav?.temporadas ?? [];

    // Antes del early return: los hooks no pueden quedar detrás de un if.
    const hayTemporadas = temporadas.length > 0;
    useEffect(() => {
        onTemporadasChange?.(hayTemporadas);
    }, [hayTemporadas, onTemporadasChange]);

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
                    tabActiva={tabActiva}
                />
            )}
            {temporadas.length > 0 && (
                <Desplegable
                    etiqueta={temporadaActual?.label ?? 'Temporada'}
                    titulo="Cambiar de temporada"
                    opciones={temporadas}
                    tabActiva={tabActiva}
                />
            )}
        </span>
    );
}
