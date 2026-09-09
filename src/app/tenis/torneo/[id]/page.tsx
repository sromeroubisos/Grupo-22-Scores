import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { etiquetaDeSuperficie } from '@/lib/tennis/labels';
import { getTennisTournament } from '@/lib/services/tennis';

import TennisDraw from './TennisDraw';
import { aCuadro, resumirCuadro } from './drawModel';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * Ficha de un torneo de tenis: el cuadro.
 *
 * Un torneo de tenis no tiene tabla de posiciones — tiene un cuadro de
 * eliminación. Por eso esto no reusa la pantalla de torneo del resto del sitio,
 * que está armada alrededor de `tournament_standings`.
 *
 * El ARMADO sí es el del resto del sitio: contexto arriba, cabecera con el
 * escudo del torneo, fichas de datos y el contenido abajo. Lo que cambia es con
 * qué se llena: donde el fútbol pone una tabla, el tenis pone el árbol.
 */

/**
 * El nombre del torneo, en castellano.
 *
 * Un proveedor puede pegar la rama al final ("US Open, Men") porque en inglés
 * se lee así. ESPN no lo hace —el torneo es uno y las modalidades son cuadros
 * adentro—, pero el corte se conserva por si el nombre viene con sufijo.
 */
const RAMAS: Record<string, string> = { men: 'Masculino', women: 'Femenino' };

function partirNombre(nombre: string): { titulo: string; rama: string | null } {
    const corte = nombre.lastIndexOf(', ');
    if (corte === -1) return { titulo: nombre, rama: null };
    const rama = RAMAS[nombre.slice(corte + 2).trim().toLowerCase()];
    return rama ? { titulo: nombre.slice(0, corte), rama } : { titulo: nombre, rama: null };
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    // El título no puede tumbar la página: si el proveedor no contesta, la
    // pantalla igual tiene que renderizar y decir lo suyo.
    let details = null;
    try {
        details = await getTennisTournament(id);
    } catch {
        details = null;
    }
    if (!details) return { title: 'Torneo de tenis · G22 Scores' };

    const { titulo, rama } = partirNombre(details.tournament.name);
    const nombre = rama ? `${titulo} ${rama.toLowerCase()}` : titulo;
    return {
        title: `${nombre} · Cuadro · G22 Scores`,
        description: `Cuadro completo de ${nombre}: los cruces ronda por ronda, los resultados y el camino a la final.`,
    };
}

function Aviso({ children }: { children: React.ReactNode }) {
    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <h1 className={styles.title}>Torneo de tenis</h1>
                <p className={styles.notice}>{children}</p>
                <Link className={styles.backLink} href="/">Volver a los partidos</Link>
            </div>
        </main>
    );
}

function Ficha({ label, value, tono }: { label: string; value: string; tono?: 'vivo' }) {
    return (
        <div className={`${styles.stat} ${tono === 'vivo' ? styles.statLive : ''}`}>
            <span className={styles.statLabel}>{label}</span>
            <strong className={styles.statValue}>
                {tono === 'vivo' ? <span className={styles.liveDot} aria-hidden="true" /> : null}
                {value}
            </strong>
        </div>
    );
}

export default async function TenisTorneoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let details;
    try {
        details = await getTennisTournament(id);
    } catch {
        return <Aviso>No pudimos consultar el proveedor. Probá de nuevo en un rato.</Aviso>;
    }

    if (!details) notFound();

    const { tournament, draw } = details;
    const { titulo, rama } = partirNombre(tournament.name);
    const superficie = etiquetaDeSuperficie(tournament.groundType);
    const contexto = [tournament.tour, tournament.country, superficie].filter(Boolean).join(' · ');

    // El cuadro principal va primero: la clasificación es el telonero, y en un
    // torneo empezado ya terminó.
    const cuadros = draw
        .map(aCuadro)
        .sort((a, b) => Number(a.esClasificacion) - Number(b.esClasificacion));
    const resumen = resumirCuadro(cuadros.find((c) => !c.esClasificacion) ?? cuadros[0]);

    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <nav className={styles.contextBar} aria-label="Dónde estás">
                    <Link className={styles.back} href="/" aria-label="Volver a los partidos">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M19 12H5" />
                            <path d="m12 19-7-7 7-7" />
                        </svg>
                    </Link>
                    <ol className={styles.breadcrumbs}>
                        <li className={styles.crumb}>Tenis</li>
                        {tournament.tour ? <li className={styles.crumb}>{tournament.tour}</li> : null}
                        <li className={`${styles.crumb} ${styles.crumbStrong}`}>{titulo}</li>
                    </ol>
                </nav>

                <header className={styles.header}>
                    {tournament.logo ? (
                        // Sobre el pliegue, así que no va `lazy`. Con medidas para que
                        // el título no salte cuando el escudo termina de bajar.
                        <img
                            src={tournament.logo}
                            alt=""
                            width={56}
                            height={56}
                            className={styles.logo}
                        />
                    ) : null}
                    <div className={styles.headerMeta}>
                        <h1 className={styles.title}>
                            {titulo}
                            {rama ? <span className={styles.titleBranch}>{rama}</span> : null}
                        </h1>
                        {contexto ? <p className={styles.context}>{contexto}</p> : null}
                    </div>
                </header>

                {cuadros.length > 0 ? (
                    <div className={styles.stats}>
                        {/* Un torneo terminado no dice qué se juega: dice quién lo
                            ganó, que es el dato por el que se entra meses después. */}
                        {resumen.rondaActual ? (
                            <Ficha label="Se juega" value={resumen.rondaActual} />
                        ) : resumen.campeon ? (
                            <Ficha label="Campeón" value={resumen.campeon} />
                        ) : null}
                        {resumen.enVivo > 0 ? (
                            <Ficha
                                label="Ahora"
                                tono="vivo"
                                value={`${resumen.enVivo} ${resumen.enVivo === 1 ? 'partido' : 'partidos'}`}
                            />
                        ) : null}
                        {resumen.fechas ? <Ficha label="Fechas" value={resumen.fechas} /> : null}
                        {resumen.jugadores ? (
                            <Ficha label="Cuadro" value={`${resumen.jugadores} jugadores`} />
                        ) : null}
                    </div>
                ) : null}

                {cuadros.length === 0 ? (
                    <div className={styles.empty}>
                        <p className={styles.emptyTitle}>El cuadro todavía no está sorteado.</p>
                        <p className={styles.notice}>
                            Cuando la organización lo publique, acá van a estar los cruces ronda por ronda.
                        </p>
                    </div>
                ) : (
                    <TennisDraw cuadros={cuadros} />
                )}
            </div>
        </main>
    );
}
