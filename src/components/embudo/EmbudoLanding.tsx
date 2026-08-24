'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
    BarChart3,
    Radio,
    Shield,
    Sparkles,
    Target,
    Trophy,
    User,
    Users,
} from 'lucide-react';
import { useEffect } from 'react';
import type { ComponentType } from 'react';

import { trackEvent } from '@/lib/analytics';
import {
    hrefParaClubes,
    hrefParaTorneos,
    type ContenidoEmbudo,
    type Modulo,
    type PromoOrigen,
} from '@/content/embudo';
import DemoForm from './DemoForm';
import styles from './embudo.module.css';

/**
 * La landing del embudo, una sola para las dos puertas.
 *
 * `/para-torneos` y `/para-clubes` son la misma página con distinto contenido:
 * el que organiza y el que representa a un club no compran lo mismo. Todo lo que
 * se lee entra por `contenido`; acá no hay una sola frase escrita a mano.
 *
 * Entra por el `ConditionalLayout` como cualquier otra página pública: mismo
 * shell y mismo tema oscuro que el resto del sitio, no una landing suelta con
 * estética prestada.
 *
 * ── Las secciones y por qué están en ese orden ─────────────────────────────
 *
 *   Hero → Números → Momentos → Módulos → Pasos → Prueba → Puente → Preguntas
 *        → Demo → Cierre con formulario → Cruce
 *
 * Cuatro son OPCIONALES y no se dibujan si el contenido no las trae: momentos,
 * prueba, puente y demo. No es configuración por gusto — las dos puertas
 * argumentan distinto:
 *
 *  · /para-clubes ordena todo por MOMENTOS —el sábado, el lunes, la temporada—
 *    porque así vive el club el día de partido. No necesita la sección de prueba
 *    (el hero ya manda a la página de un club de verdad) ni la de demo (el
 *    cierre dice lo mismo), y sí necesita el PUENTE: su objeción más común es
 *    "mi torneo no está en G22".
 *
 *  · /para-torneos no tiene momentos —el que organiza administra el día, no lo
 *    vive— y sí tiene prueba y demo.
 *
 * Nada de reservar media pantalla para una sección sin contenido: si no está,
 * no existe.
 */

const ICONOS: Record<Modulo['icono'], ComponentType<{ size?: number; strokeWidth?: number }>> = {
    vivo: Radio,
    torneo: Trophy,
    stats: BarChart3,
    equipo: Users,
    fantasy: Sparkles,
    prode: Target,
    club: Shield,
    jugador: User,
};

const FLECHA = (
    <svg
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
);

type Props = {
    contenido: ContenidoEmbudo;
    origen: PromoOrigen | null;
};

export default function EmbudoLanding({ contenido, origen }: Props) {
    const {
        embudo,
        hero,
        numeros,
        momentos,
        modulos,
        pasos,
        prueba,
        puente,
        faq,
        demo,
        cierre,
        cruce,
    } = contenido;

    useEffect(() => {
        trackEvent('clubs_promo_view', {
            location: 'landing',
            embudo,
            origin: origen ?? 'directo',
        });
    }, [embudo, origen]);

    return (
        <div className={styles.pagina}>
            {/* ── Hero ────────────────────────────────────────────────────── */}
            <section className={styles.hero}>
                <div className={styles.heroTexto}>
                    <span className={styles.etiqueta}>{hero.etiqueta}</span>

                    {/*
                      El título puede venir partido en dos líneas. Se arma con
                      spans y no con un <br> metido en el string: así el texto
                      del contenido sigue siendo texto, y en pantalla chica cada
                      línea puede plegarse sola sin dejar un salto forzado en el
                      medio de una frase.
                    */}
                    <h1 className={styles.heroTitulo}>
                        {hero.titulo.map((linea) => (
                            <span key={linea} className={styles.heroTituloLinea}>{linea}</span>
                        ))}
                    </h1>

                    {/*
                      El gancho: la línea que hace verdadera la promesa del
                      título. Cuando el título ya la dice —el de /para-clubes son
                      dos líneas que ponen escena y promesa— viene vacío y no se
                      dibuja, en vez de repetir lo mismo más chico.
                    */}
                    {hero.gancho && <p className={styles.heroGancho}>{hero.gancho}</p>}

                    <p className={styles.heroSubtitulo}>{hero.subtitulo}</p>

                    <div className={styles.heroAcciones}>
                        <a
                            href="#demo"
                            className={styles.botonPrimario}
                            onClick={() => trackEvent('clubs_promo_click', { location: 'hero', embudo })}
                        >
                            {hero.accionPrimaria}
                        </a>

                        {/*
                          La salida secundaria manda al producto, no a otra
                          sección de la misma página de ventas. Es lo más barato
                          y lo más convincente que tiene esta landing: la
                          competencia muestra un mockup, acá se abre un club de
                          verdad con datos cargados.
                        */}
                        <Link
                            href={hero.accionSecundaria.href}
                            className={styles.botonSecundario}
                            onClick={() => trackEvent('clubs_promo_click', {
                                location: 'hero-prueba',
                                embudo,
                                destino: hero.accionSecundaria.href,
                            })}
                        >
                            {hero.accionSecundaria.texto}
                            {FLECHA}
                        </Link>
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

            {/* ── Tres números ────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-label="En números">
                <div className={styles.numeros}>
                    {numeros.map((numero) => (
                        <div key={numero.etiqueta} className={styles.numero}>
                            <span className={styles.numeroValor}>{numero.valor}</span>
                            <span className={styles.numeroEtiqueta}>{numero.etiqueta}</span>
                            <p className={styles.numeroDetalle}>{numero.detalle}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/*
              ── Los tres momentos ──────────────────────────────────────────

              El framing temporal ordena el argumento mejor que una lista de
              funciones, porque es como el dirigente vive el club: el sábado
              quiere saber qué está pasando, el lunes quiere los números, y en
              la temporada quiere que sus jugadores tengan historia.
            */}
            {momentos.length > 0 && (
                <section className={styles.seccion} aria-label="Los tres momentos">
                    <div className={styles.momentos}>
                        {momentos.map((momento) => (
                            <article key={momento.id} className={styles.momento}>
                                <span className={styles.momentoCuando}>{momento.cuando}</span>
                                <h2 className={styles.momentoTitulo}>{momento.titulo}</h2>
                                {momento.parrafos.map((parrafo) => (
                                    <p key={parrafo} className={styles.momentoTexto}>{parrafo}</p>
                                ))}
                            </article>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Módulos ─────────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-labelledby="modulos-titulo">
                <h2 id="modulos-titulo" className={styles.seccionTitulo}>{contenido.modulosTitulo}</h2>
                <p className={styles.seccionTexto}>{contenido.modulosTexto}</p>

                <div className={styles.modulos}>
                    {modulos.map((modulo) => {
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

            {/* ── Cómo funciona ───────────────────────────────────────────── */}
            <section className={styles.seccion} id="como-funciona" aria-labelledby="pasos-titulo">
                <h2 id="pasos-titulo" className={styles.seccionTitulo}>{contenido.pasosTitulo}</h2>

                <ol className={styles.pasos}>
                    {pasos.map((paso) => (
                        <li key={paso.numero} className={styles.paso}>
                            <span className={styles.pasoNumero} aria-hidden="true">{paso.numero}</span>
                            <h3 className={styles.pasoTitulo}>{paso.titulo}</h3>
                            <p className={styles.pasoTexto}>{paso.texto}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/*
              ── La prueba en vivo ──────────────────────────────────────────

              No hay un torneo embebido y no lo va a haber: un fixture ajeno
              arriba de una página de ventas demuestra que la plataforma anda, no
              que le sirve a él. La prueba son links al sitio de verdad.
            */}
            {prueba && prueba.enlaces.length > 0 && (
                <section className={styles.seccion} aria-labelledby="prueba-titulo">
                    <h2 id="prueba-titulo" className={styles.seccionTitulo}>{prueba.titulo}</h2>
                    <p className={styles.seccionTexto}>{prueba.texto}</p>

                    <div className={styles.prueba}>
                        {prueba.enlaces.map((enlace) => (
                            <Link
                                key={enlace.href}
                                href={enlace.href}
                                className={styles.pruebaEnlace}
                                onClick={() => trackEvent('clubs_promo_click', {
                                    location: 'prueba',
                                    embudo,
                                    destino: enlace.href,
                                })}
                            >
                                <span className={styles.pruebaTitulo}>
                                    {enlace.titulo}
                                    <span className={styles.pruebaFlecha}>{FLECHA}</span>
                                </span>
                                <span className={styles.pruebaTexto}>{enlace.texto}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/*
              ── El bloque puente ───────────────────────────────────────────

              La objeción que más frena al club —"¿para qué me sumo si mi torneo
              no está?"— y a la vez la mejor vía de entrada: un club adentro es
              una conversación abierta con la organización de su torneo.
            */}
            {puente && (
                <section className={styles.puente} aria-labelledby="puente-titulo">
                    <h2 id="puente-titulo" className={styles.puenteTitulo}>{puente.titulo}</h2>
                    <p className={styles.puenteTexto}>{puente.texto}</p>

                    <div className={styles.puenteAcciones}>
                        <a
                            href="#demo"
                            className={styles.botonPrimario}
                            onClick={() => trackEvent('clubs_promo_click', { location: 'puente', embudo })}
                        >
                            {puente.accion}
                            {FLECHA}
                        </a>

                        <Link
                            href={embudo === 'clubes' ? hrefParaTorneos('cruce') : hrefParaClubes('cruce')}
                            className={styles.puenteOtraPuerta}
                            onClick={() => trackEvent('clubs_promo_click', { location: 'puente-cruce', embudo })}
                        >
                            {puente.otraPuerta}
                            {FLECHA}
                        </Link>
                    </div>
                </section>
            )}

            {/* ── Preguntas ───────────────────────────────────────────────── */}
            <section className={styles.seccion} aria-labelledby="faq-titulo">
                <h2 id="faq-titulo" className={styles.seccionTitulo}>Preguntas</h2>

                <div className={styles.faq}>
                    {faq.map((item) => (
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

            {/* ── La demo ─────────────────────────────────────────────────── */}
            {demo && (
                <section className={styles.seccion} aria-labelledby="demo-titulo">
                    <div className={styles.demoCaja}>
                        <h2 id="demo-titulo" className={styles.seccionTitulo}>{demo.titulo}</h2>
                        <p className={styles.seccionTexto}>{demo.texto}</p>

                        <ul className={styles.demoPuntos}>
                            {demo.puntos.map((punto) => (
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
                            onClick={() => trackEvent('clubs_promo_click', { location: 'demo-seccion', embudo })}
                        >
                            {demo.accion}
                        </a>
                    </div>
                </section>
            )}

            {/* ── Cierre + formulario ─────────────────────────────────────── */}
            <section className={styles.cierre} id="demo" aria-labelledby="cierre-titulo">
                <div className={styles.cierreTexto}>
                    <h2 id="cierre-titulo" className={styles.cierreTitulo}>{cierre.titulo}</h2>
                    <p className={styles.seccionTexto}>{cierre.texto}</p>
                </div>

                <DemoForm contenido={contenido} origen={origen} />
            </section>

            {/*
              El cruce: para el que entró por la puerta equivocada.

              Va al pie, chico y sin competir con el formulario. El `?ref=cruce`
              es lo que después permite saber cuánta gente se equivoca de puerta
              — y si son muchos, que la jerarquía de la placa está mal puesta.
            */}
            <p className={styles.cruce}>
                <span className={styles.cruceTexto}>{cruce.texto}</span>
                <Link
                    href={cruce.destino === 'clubes' ? hrefParaClubes('cruce') : hrefParaTorneos('cruce')}
                    className={styles.cruceEnlace}
                    onClick={() => trackEvent('clubs_promo_click', { location: 'cruce', embudo })}
                >
                    {cruce.accion}
                </Link>
            </p>
        </div>
    );
}
