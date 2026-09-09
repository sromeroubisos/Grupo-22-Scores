'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { normalizar, type CruceVM, type CuadroVM, type LadoVM, type RondaVM } from './drawModel';
import styles from './page.module.css';

/**
 * El cuadro, en pantalla.
 *
 * Un cuadro de Grand Slam tiene 127 cruces en siete rondas, y las dos formas de
 * mirarlo son distintas: el que entra el domingo quiere ver el ÁRBOL —quién
 * puede cruzarse con quién camino a la final— y el que entra el martes quiere
 * LA RONDA que se juega hoy, con sus fechas y sus horarios. Por eso son dos
 * vistas y no una: dibujar 64 cruces de primera ronda como árbol da una
 * columna larguísima, y dibujar la final como lista pierde el árbol.
 *
 * La vista de árbol arranca en la ronda que se está jugando y no en la primera.
 * Es lo que hace que la pantalla sea legible sin tocar nada: de octavos a la
 * final son quince cruces que entran de una, mientras que la primera ronda son
 * 64 y obligan a scrollear para llegar a lo que pasa hoy.
 */

type Vista = 'cuadro' | 'ronda';

/**
 * Además del número, un sembrado puede ser la VÍA de entrada al cuadro. Las dos
 * letras se muestran como vienen —así se leen en la planilla— con el nombre
 * completo en el título, porque fuera del ambiente "LL" no significa nada.
 */
const VIAS_DE_ENTRADA: Record<string, string> = {
    Q: 'Entró por la clasificación',
    LL: 'Lucky loser',
    WC: 'Invitación',
    PR: 'Ranking protegido',
    A: 'Alterno',
};

function Sembrado({ lado }: { lado: LadoVM }) {
    // Sin sembrado igual se ocupa la celda: si no, el nombre se corre a la
    // izquierda y en una columna de 64 cruces los nombres quedan en zigzag.
    if (!lado.sembrado) return <span className={styles.seedEmpty} aria-hidden="true" />;
    const esNumero = /^\d+$/.test(lado.sembrado);
    const titulo = esNumero
        ? `Sembrado ${lado.sembrado}`
        : VIAS_DE_ENTRADA[lado.sembrado.toUpperCase()] ?? lado.sembrado;

    return (
        <span className={`${styles.seed} ${esNumero ? '' : styles.seedVia}`} title={titulo}>
            {lado.sembrado}
        </span>
    );
}

function Lado({ lado, resaltado }: { lado: LadoVM; resaltado: boolean }) {
    if (!lado.nombre) {
        return (
            <span className={`${styles.side} ${styles.sidePending}`}>
                <span className={styles.sideName}>Por definir</span>
            </span>
        );
    }

    return (
        <span
            className={[
                styles.side,
                lado.gano ? styles.sideWinner : '',
                resaltado ? styles.sideHit : '',
            ].filter(Boolean).join(' ')}
        >
            <Sembrado lado={lado} />
            <span className={styles.sideName}>{lado.nombre}</span>
            {lado.ranking ? <span className={styles.sideRank}>#{lado.ranking}</span> : null}
            <span className={styles.sideSets}>{lado.sets ?? ''}</span>
        </span>
    );
}

function Cruce({
    cruce,
    ronda,
    consulta,
}: {
    cruce: CruceVM;
    ronda: RondaVM;
    consulta: string;
}) {
    const [arriba, abajo] = cruce.lados;
    const pegaArriba = Boolean(consulta) && arriba.clave.includes(consulta);
    const pegaAbajo = Boolean(consulta) && abajo.clave.includes(consulta);

    const rivales = [arriba.nombre, abajo.nombre].filter(Boolean).join(' contra ');
    const etiqueta = rivales
        ? `${ronda.nombre}: ${rivales}`
        : `${ronda.nombre}: cruce todavía sin definir`;

    // La franja de arriba va SIEMPRE, aunque no tenga nada que decir. Es lo que
    // hace que todas las tarjetas midan igual, y de eso depende el árbol: las
    // ramas se reparten la columna en partes iguales, así que una tarjeta más
    // alta que las otras se le monta a la de al lado. Además es donde el estado
    // "en vivo" entra como TEXTO y no como un color, que solo no es un dato.
    const cabecera = cruce.enVivo ? (
        <span className={`${styles.crossHead} ${styles.crossHeadLive}`}>
            <span className={styles.liveDot} aria-hidden="true" />
            En vivo
        </span>
    ) : (
        <span className={styles.crossHead}>
            {cruce.abandono ? <span className={styles.retired}>Abandonó</span> : null}
            {cruce.fecha ? (
                <span>
                    {cruce.fecha}
                    {/* La hora sirve mientras el partido no se jugó. Una vez
                        terminado lo que importa es el día, no las 14:05. */}
                    {!cruce.terminado && cruce.hora ? ` · ${cruce.hora}` : ''}
                </span>
            ) : null}
        </span>
    );

    const cuerpo = (
        <>
            {cabecera}
            <Lado lado={arriba} resaltado={pegaArriba} />
            <Lado lado={abajo} resaltado={pegaAbajo} />
        </>
    );

    const clases = [
        styles.cross,
        cruce.enVivo ? styles.crossLive : '',
        consulta && !pegaArriba && !pegaAbajo ? styles.crossMuted : '',
    ].filter(Boolean).join(' ');

    // Sin id de partido el cruce no es un enlace: un <a> que no lleva a ningún
    // lado promete una ficha que no existe.
    if (!cruce.matchId) {
        return <div className={clases} aria-label={etiqueta}>{cuerpo}</div>;
    }

    return (
        <Link className={clases} href={`/tenis/partido/${cruce.matchId}`} aria-label={etiqueta}>
            {cuerpo}
        </Link>
    );
}

export default function TennisDraw({ cuadros }: { cuadros: CuadroVM[] }) {
    const [indice, setIndice] = useState(0);
    const [vista, setVista] = useState<Vista>('cuadro');
    const cuadro = cuadros[indice] ?? cuadros[0];
    const [desde, setDesde] = useState<number>(cuadro?.rondaInicial ?? 1);
    const [busqueda, setBusqueda] = useState('');

    // Con una sola letra pega medio cuadro y el resaltado no dice nada.
    const consulta = busqueda.trim().length >= 2 ? normalizar(busqueda) : '';
    const rondas = useMemo(() => cuadro?.rondas ?? [], [cuadro]);

    // Buscar un jugador abre el cuadro entero: su camino empieza en la primera
    // ronda, y mostrarlo desde octavos escondería justamente lo que se pidió.
    const rondasVisibles = useMemo(() => {
        if (vista === 'ronda') return rondas.filter((r) => r.order === desde);
        if (consulta) return rondas;
        return rondas.filter((r) => r.order >= desde);
    }, [rondas, vista, desde, consulta]);

    const encontrados = useMemo(() => {
        if (!consulta) return 0;
        return rondas.reduce(
            (total, ronda) =>
                total +
                ronda.cruces.filter((c) => c.lados.some((l) => l.clave.includes(consulta))).length,
            0,
        );
    }, [rondas, consulta]);

    if (!cuadro || rondas.length === 0) {
        return <p className={styles.notice}>El cuadro todavía no está publicado.</p>;
    }

    function cambiarCuadro(i: number) {
        setIndice(i);
        // Cada cuadro está en su propia ronda: la clasificación ya terminó
        // cuando el principal recién va por octavos.
        setDesde(cuadros[i]?.rondaInicial ?? 1);
    }

    const rondaElegida = rondas.find((r) => r.order === desde) ?? rondas[0];
    const crucesFiltrados = consulta
        ? rondaElegida.cruces.filter((c) => c.lados.some((l) => l.clave.includes(consulta)))
        : rondaElegida.cruces;

    return (
        <section className={styles.board} aria-label="Cuadro del torneo">
            <div className={styles.toolbar}>
                {cuadros.length > 1 ? (
                    <div className={styles.tabs} role="group" aria-label="Elegir cuadro">
                        {cuadros.map((c, i) => (
                            <button
                                key={c.id}
                                type="button"
                                className={styles.tab}
                                aria-pressed={i === indice}
                                onClick={() => cambiarCuadro(i)}
                            >
                                {c.nombre}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className={styles.toolbarEnd}>
                    <div className={styles.tabs} role="group" aria-label="Cómo ver el cuadro">
                        <button
                            type="button"
                            className={styles.tab}
                            aria-pressed={vista === 'cuadro'}
                            onClick={() => setVista('cuadro')}
                        >
                            Árbol
                        </button>
                        <button
                            type="button"
                            className={styles.tab}
                            aria-pressed={vista === 'ronda'}
                            onClick={() => setVista('ronda')}
                        >
                            Por ronda
                        </button>
                    </div>

                    <div className={styles.search}>
                        <label className={styles.searchLabel} htmlFor="buscar-jugador">
                            Buscar jugador
                        </label>
                        <input
                            id="buscar-jugador"
                            type="search"
                            className={styles.searchInput}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Apellido"
                            autoComplete="off"
                        />
                    </div>
                </div>
            </div>

            <div className={styles.rounds} role="group" aria-label="Rondas del cuadro">
                {rondas.map((ronda) => (
                    <button
                        key={ronda.id}
                        type="button"
                        className={[
                            styles.roundChip,
                            vista === 'cuadro' && !consulta && ronda.order > desde
                                ? styles.roundChipAhead
                                : '',
                            ronda.order === cuadro.rondaActual ? styles.roundChipNow : '',
                        ].filter(Boolean).join(' ')}
                        aria-pressed={ronda.order === desde}
                        aria-label={
                            vista === 'cuadro'
                                ? `Mostrar el árbol desde ${ronda.nombre}`
                                : `Ver ${ronda.nombre}`
                        }
                        onClick={() => setDesde(ronda.order)}
                    >
                        {ronda.nombreCorto}
                    </button>
                ))}
            </div>

            <p className={styles.hint}>
                {consulta
                    ? encontrados > 0
                        ? `${encontrados} ${encontrados === 1 ? 'cruce' : 'cruces'} de «${busqueda.trim()}». El resto del cuadro queda atenuado.`
                        : `Nadie en el cuadro se llama «${busqueda.trim()}».`
                    : vista === 'cuadro'
                        ? 'El árbol arranca en la ronda que elegís. Tocá un cruce para abrir la ficha del partido.'
                        : 'Una ronda por vez, con el día y el horario de cada cruce.'}
            </p>

            {vista === 'cuadro' ? (
                <div
                    className={styles.boardScroll}
                    role="region"
                    aria-label="Árbol del cuadro, se desplaza en horizontal"
                    tabIndex={0}
                >
                    <div className={styles.tree}>
                        {rondasVisibles.map((ronda, ri) => (
                            <div className={styles.column} key={ronda.id}>
                                <h3 className={styles.columnHead}>
                                    <span className={styles.columnName}>{ronda.nombre}</span>
                                    <span className={styles.columnCount}>{ronda.cruces.length}</span>
                                </h3>
                                <div className={styles.columnBody}>
                                    {ronda.cruces.map((cruce) => (
                                        <div className={styles.branch} key={cruce.id}>
                                            <Cruce
                                                cruce={cruce}
                                                ronda={ronda}
                                                consulta={consulta}
                                            />
                                            {/* Las líneas que unen este cruce con el de la
                                                ronda siguiente. Decorativas: el vínculo
                                                ya lo dice el orden de las columnas. */}
                                            {ri < rondasVisibles.length - 1 ? (
                                                <span className={styles.wire} aria-hidden="true" />
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className={styles.list}>
                    {crucesFiltrados.length === 0 ? (
                        <p className={styles.notice}>
                            No hay cruces de «{busqueda.trim()}» en {rondaElegida.nombre}.
                        </p>
                    ) : (
                        crucesFiltrados.map((cruce) => (
                            <Cruce
                                key={cruce.id}
                                cruce={cruce}
                                ronda={rondaElegida}
                                consulta={consulta}
                            />
                        ))
                    )}
                </div>
            )}
        </section>
    );
}
