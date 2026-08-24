'use client';

import Image from 'next/image';
import { BarChart3, Radio, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { useEffect } from 'react';
import type { ComponentType } from 'react';

import { trackEvent } from '@/lib/analytics';
import {
    CIERRE,
    DEMO,
    FAQ,
    HERO,
    MODULOS,
    NUMEROS,
    PASOS,
    type Modulo,
    type PromoOrigen,
} from '@/content/para-clubes';
import DemoForm from './DemoForm';
import styles from './para-clubes.module.css';

/**
 * La landing del embudo, con el mismo shell y el mismo tema oscuro que el resto
 * del sitio. No es una landing suelta con estética prestada: entra por el
 * `ConditionalLayout` como cualquier otra página pública.
 *
 * Lo que NO tiene, a propósito: un torneo embebido. La prueba en vivo de verdad
 * es la demo del fin de semana con un partido del club que pregunta. Un fixture
 * ajeno arriba de una página de ventas demuestra que la plataforma anda, no que
 * le sirve a él.
 */

const ICONOS: Record<Modulo['icono'], ComponentType<{ size?: number; strokeWidth?: number }>> = {
    vivo: Radio,
    torneo: Trophy,
    stats: BarChart3,
    equipo: Users,
    fantasy: Sparkles,
    prode: Target,
};

export default function ParaClubesClient({ origen }: { origen: PromoOrigen | null }) {
    useEffect(() => {
        trackEvent('clubs_promo_view', { location: 'landing', origin: origen ?? 'directo' });
    }, [origen]);

    return (
        <div className={styles.pagina}>
            {/* ── Hero ────────────────────────────────────────────────────── */}
            <section className={styles.hero}>
                <div className={styles.heroTexto}>
                    <span className={styles.etiqueta}>{HERO.etiqueta}</span>
                    <h1 className={styles.heroTitulo}>{HERO.titulo}</h1>
                    <p className={styles.heroSubtitulo}>{HERO.subtitulo}</p>

                    <div className={styles.heroAcciones}>
                        <a
                            href="#demo"
                            className={styles.botonPrimario}
                            onClick={() => trackEvent('clubs_promo_click', { location: 'hero' })}
                        >
                            {HERO.accionPrimaria}
                        </a>
                        <a href="#como-funciona" className={styles.botonSecundario}>
                            {HERO.accionSecundaria}
                        </a>
                    </div>
                </div>

                {/*
                  Decorativa y sólo en desktop (el CSS la apaga abajo de 900px,
                  donde la cabecera ya muestra el mismo logo). Va perezosa a
                  propósito: así el teléfono ni siquiera baja el PNG.
                */}
                <div className={styles.heroMarca} aria-hidden="true">
                    <Image
                        src="/G22%20GEADER.png"
                        alt=""
                        width={3862}
                        height={1083}
                        sizes="320px"
                        loading="lazy"
                        className={styles.heroLogo}
                    />
                </div>
            </section>

            {/* ── La demo ─────────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-labelledby="demo-titulo">
                <div className={styles.demoCaja}>
                    <h2 id="demo-titulo" className={styles.seccionTitulo}>{DEMO.titulo}</h2>
                    <p className={styles.seccionTexto}>{DEMO.texto}</p>

                    <ul className={styles.demoPuntos}>
                        {DEMO.puntos.map((punto) => (
                            <li key={punto} className={styles.demoPunto}>
                                <span className={styles.demoTilde} aria-hidden="true">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                </span>
                                {punto}
                            </li>
                        ))}
                    </ul>

                    <a
                        href="#demo"
                        className={styles.botonPrimario}
                        onClick={() => trackEvent('clubs_promo_click', { location: 'demo-seccion' })}
                    >
                        {DEMO.accion}
                    </a>
                </div>
            </section>

            {/* ── Tres números ────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-label="En números">
                <div className={styles.numeros}>
                    {NUMEROS.map((numero) => (
                        <div key={numero.etiqueta} className={styles.numero}>
                            <span className={styles.numeroValor}>{numero.valor}</span>
                            <span className={styles.numeroEtiqueta}>{numero.etiqueta}</span>
                            <p className={styles.numeroDetalle}>{numero.detalle}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Módulos ─────────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-labelledby="modulos-titulo">
                <h2 id="modulos-titulo" className={styles.seccionTitulo}>Lo que se publica</h2>
                <p className={styles.seccionTexto}>
                    Todo sale de la misma carga. No hay que subir la información dos veces.
                </p>

                <div className={styles.modulos}>
                    {MODULOS.map((modulo) => {
                        const Icono = ICONOS[modulo.icono];
                        return (
                            <article key={modulo.id} className={styles.modulo}>
                                <span className={styles.moduloIcono} aria-hidden="true">
                                    <Icono size={18} strokeWidth={2} />
                                </span>
                                <h3 className={styles.moduloTitulo}>{modulo.titulo}</h3>
                                <p className={styles.moduloTexto}>{modulo.texto}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            {/* ── Cómo se ve en la cancha ─────────────────────────────────── */}
            <section className={styles.seccion} id="como-funciona" aria-labelledby="pasos-titulo">
                <h2 id="pasos-titulo" className={styles.seccionTitulo}>Cómo se ve en la cancha</h2>

                <ol className={styles.pasos}>
                    {PASOS.map((paso) => (
                        <li key={paso.numero} className={styles.paso}>
                            <span className={styles.pasoNumero} aria-hidden="true">{paso.numero}</span>
                            <h3 className={styles.pasoTitulo}>{paso.titulo}</h3>
                            <p className={styles.pasoTexto}>{paso.texto}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/* ── Preguntas ───────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-labelledby="faq-titulo">
                <h2 id="faq-titulo" className={styles.seccionTitulo}>Preguntas</h2>

                <div className={styles.faq}>
                    {FAQ.map((item) => (
                        /*
                         * `<details>` nativo: se abre con Enter y con Espacio, lo
                         * anuncia el lector de pantalla solo y funciona sin JS.
                         * Un acordeón a mano con aria-expanded haría lo mismo con
                         * más código y más formas de romperse.
                         */
                        <details key={item.pregunta} className={styles.faqItem}>
                            <summary className={styles.faqPregunta}>
                                {item.pregunta}
                                <svg
                                    className={styles.faqChevron}
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </summary>
                            <p className={styles.faqRespuesta}>{item.respuesta}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ── Cierre + formulario ─────────────────────────────────────── */}
            <section className={styles.cierre} id="demo" aria-labelledby="cierre-titulo">
                <div className={styles.cierreTexto}>
                    <h2 id="cierre-titulo" className={styles.cierreTitulo}>{CIERRE.titulo}</h2>
                    <p className={styles.seccionTexto}>{CIERRE.texto}</p>
                </div>

                <DemoForm origen={origen} />
            </section>
        </div>
    );
}
