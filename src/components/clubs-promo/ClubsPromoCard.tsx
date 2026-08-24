'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { trackEvent } from '@/lib/analytics';
import { hrefParaClubes, hrefParaTorneos, MODULOS, PROMO } from '@/content/embudo';
import styles from './ClubsPromoCard.module.css';

/**
 * La ÚNICA unidad promocional del sitio, en sus dos tamaños.
 *
 * Antes el embudo tenía cuatro superficies —esta placa, una barra inferior, una
 * línea contextual en tres páginas y el item del nav— y una sola landing. Ahora
 * es al revés: una sola unidad promocional y dos landings. Toda la señal se
 * concentra acá, así que si convierte o no se sabe enseguida.
 *
 * `sidebar` — la columna derecha de la home. Desde que las noticias se fueron
 * de ahí, la placa tiene la columna entera: además del título muestra los tres
 * pasos y las ventajas. Ojo con dónde se ve: `.sidebarRight` de la home se
 * apaga por CSS abajo de 1500px, así que esta variante es de pantalla grande y
 * de nadie más.
 *
 * `feed` — una tarjeta del ancho de una tarjeta de torneo, metida entre los
 * bloques del feed. Existe justamente porque abajo de 1500px la columna no
 * existe: sin esto, en una laptop de 1440 y en cualquier teléfono la promo no
 * la ve nadie. Se scrollea como cualquier otro contenido y no interrumpe nada.
 *
 * Las dos NUNCA conviven: `.feed` se apaga arriba de 1501px por CSS. No son dos
 * anuncios, es la misma unidad reubicada por viewport.
 *
 * ── Las dos puertas ────────────────────────────────────────────────────────
 *
 * "Un solo anuncio" no es "un solo destino". La tarjeta lleva las dos salidas
 * adentro, con jerarquía y no como dos botones iguales: el ojo va al botón, que
 * apunta a `/para-torneos` —la venta grande—, y el dirigente de club que ya se
 * vio reflejado en el título encuentra igual el link de abajo.
 *
 * Y por eso la tarjeta ENTERA ya no es un `<Link>`: dos links adentro de un link
 * es HTML inválido y el lector de pantalla lo lee mal. El contenedor es un div y
 * los dos `<a>` son las dos únicas paradas de foco. El `:hover` que levantaba la
 * tarjeta se mudó al botón: si toda la placa se mueve al pasar el mouse promete
 * ser clickeable entera, y no lo es.
 */

type Props = {
    variant: 'sidebar' | 'feed';
};

export default function ClubsPromoCard({ variant }: Props) {
    const esSidebar = variant === 'sidebar';
    const origen = esSidebar ? 'sidebar' : 'feed';
    const raiz = useRef<HTMLDivElement | null>(null);
    const avisado = useRef(false);

    useEffect(() => {
        const nodo = raiz.current;
        if (!nodo || typeof IntersectionObserver === 'undefined') return;

        const observador = new IntersectionObserver(
            (entradas) => {
                for (const entrada of entradas) {
                    // Una sola vez por montaje: si contáramos cada vez que entra
                    // y sale del viewport, un scroll nervioso valdría diez vistas.
                    if (entrada.isIntersecting && !avisado.current) {
                        avisado.current = true;
                        trackEvent('clubs_promo_view', { location: origen });
                        observador.disconnect();
                    }
                }
            },
            { threshold: 0.5 },
        );

        observador.observe(nodo);
        return () => observador.disconnect();
    }, [origen]);

    return (
        <div
            ref={raiz}
            className={`${styles.root} ${esSidebar ? styles.sidebar : styles.feed}`}
        >
            <div className={styles.caja}>
                <span className={styles.etiqueta}>{PROMO.etiqueta}</span>

                <h2 className={styles.titulo}>{PROMO.titulo}</h2>

                {esSidebar ? (
                    <>
                        {/*
                          La columna es alta: acá entran las ventajas una por
                          una en vez de las dos líneas condensadas de la
                          tarjeta del feed, que es chica y tiene que ser breve.
                        */}
                        <ul className={styles.ventajas}>
                            {MODULOS.map((modulo) => (
                                <li key={modulo.id} className={styles.ventaja}>{modulo.titulo}</li>
                            ))}
                        </ul>

                        <ol className={styles.pasos}>
                            {PROMO.pasos.map((paso, indice) => (
                                <li key={paso} className={styles.paso}>
                                    <span className={styles.pasoNumero} aria-hidden="true">{indice + 1}</span>
                                    {paso}
                                </li>
                            ))}
                        </ol>
                    </>
                ) : (
                    <p className={styles.modulos}>
                        {PROMO.modulos.map((linea) => (
                            <span key={linea} className={styles.moduloLinea}>{linea}</span>
                        ))}
                    </p>
                )}

                <div className={styles.acciones}>
                    <Link
                        href={hrefParaTorneos(origen)}
                        className={styles.botonPrimario}
                        onClick={() => trackEvent('clubs_promo_click', { location: origen, embudo: 'torneos' })}
                    >
                        {PROMO.accionTorneos}
                        <svg
                            className={styles.flecha}
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                        </svg>
                    </Link>

                    <Link
                        href={hrefParaClubes(origen)}
                        className={styles.enlaceSecundario}
                        onClick={() => trackEvent('clubs_promo_click', { location: origen, embudo: 'clubes' })}
                    >
                        {PROMO.accionClubes}
                        <svg
                            className={styles.flechaChica}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                        </svg>
                    </Link>
                </div>
            </div>
        </div>
    );
}
