// LA TARJETA. Una sola definición para todos los destinos: la página que se abre
// al seguir el link, la og:image que se ve en el chat antes de abrirla, y las dos
// imágenes que el jugador se baja para publicar.
//
// Por eso está escrita con ESTILOS EN LÍNEA y sólo flexbox: es lo que Satori
// —el renderer que convierte JSX en la imagen— sabe interpretar. Nada de CSS
// modules, grid, `gap` ni pseudo-elementos acá adentro, aunque el resto del
// juego los use: lo que no entiende Satori se dibuja distinto en el chat que en
// la página, y entonces dejan de ser la misma tarjeta.
//
// TRES FORMATOS, UNA SOLA MAQUETA. El orden de lectura y las piezas son las
// mismas en los tres; lo que cambia son los tamaños y cuánto entra:
//
//   · `link`  1200×630  — apaisada, la proporción de vista previa de un link.
//   · `feed`  1080×1350 — 4:5, lo que Instagram y WhatsApp muestran entero.
//   · `story` 1080×1920 — 9:16, pantalla completa; la trayectoria respira y
//                          pasa a dos filas de escudos cuando hay más de seis.
//
// Ninguno se obtiene recortando a otro: una historia recortada de un feed deja
// la mitad de la tarjeta afuera, y un feed estirado a historia deja dos franjas
// negras. Cada uno se dibuja a su medida.
//
// El orden de lectura, de arriba abajo: QUIÉN FUE (el arquetipo), CÓMO TERMINÓ
// (OVR, chips), CUÁNTO HIZO (los tres números), DÓNDE (trayectoria) y QUÉ GANÓ
// (títulos). El arquetipo va primero y grande porque es lo nuestro: el
// simulador de fútbol del que sale esta composición no lo tiene.

import { CARD_FONT_FAMILY } from './cardTypography';
import type { CareerCardData, CardClub } from './careerCardData';

const FONDO = '#0e1512';
const PANEL = '#18211d';
const BORDE = '#243029';
const TINTA = '#ffffff';
const TENUE = '#8fa39a';
const VERDE = '#00c476';
/** El premio individual va en dorado: no es un torneo y no tiene que leerse como uno. */
const DORADO = '#d7b25a';
const BORDE_PREMIO = '#4a3c1c';

/** Relleno de la ficha de vitrina. Se achica con la escala, igual que el texto. */
function chipPad(format: CardFormat, escala: number): string {
    const v = Math.round((format === 'link' ? 8 : 12) * escala);
    const h = Math.round((format === 'link' ? 18 : 24) * escala);
    return `${v}px ${h}px`;
}

export type CardFormat = 'link' | 'feed' | 'story';

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
    link: { width: 1200, height: 630 },
    feed: { width: 1080, height: 1350 },
    story: { width: 1080, height: 1920 },
};

export const CARD_FORMATS = Object.keys(CARD_SIZES) as CardFormat[];

/** ¿Es uno de los tres formatos? Para validar el `?formato=` de la ruta. */
export function isCardFormat(value: string | null): value is CardFormat {
    return value !== null && (CARD_FORMATS as string[]).includes(value);
}

// La og:image y la página comparten la vertical de feed: es la que se ve entera
// en el chat, que es donde se pega el link.
export const CARD_WIDTH = CARD_SIZES.feed.width;
export const CARD_HEIGHT = CARD_SIZES.feed.height;

/**
 * Las medidas de cada formato, en un solo lugar.
 *
 * Están en una tabla y no repartidas en `format === 'story' ? … : …` por el
 * JSX: con veinte medidas y tres formatos, esos ternarios inline son sesenta
 * lugares donde ajustar un número, y basta olvidarse de uno para que la historia
 * salga con la tipografía del feed.
 */
interface Maqueta {
    padding: string;
    /** Padding lateral, aparte, para poder calcular el ancho útil de una fila. */
    padH: number;
    eyebrow: number;
    headline: number;
    nombre: number;
    aireSuperior: number;
    ovrLado: number;
    ovrRotulo: number;
    ovrValor: number;
    chip: number;
    banderaAncho: number;
    banderaAlto: number;
    numRotulo: number;
    numValor: number;
    seccion: number;
    aireSeccion: number;
    escudo: number;
    /** Aire máximo alrededor del escudo. El real se recorta si la fila no entra. */
    celdaExtra: number;
    clubNombre: number;
    maxClubes: number;
    porFila: number;
    trofeo: number;
    maxTrofeos: number;
    pie: number;
    pieLink: number;
}

const MAQUETA: Record<CardFormat, Maqueta> = {
    // Apaisada y baja: 630 de alto para las cinco piezas es poco, así que todo
    // va apretado y la trayectoria entra en UNA fila.
    link: {
        padding: '30px 44px 26px', padH: 44,
        eyebrow: 18, headline: 42, nombre: 20, aireSuperior: 18,
        ovrLado: 118, ovrRotulo: 16, ovrValor: 60,
        chip: 19, banderaAncho: 50, banderaAlto: 36,
        numRotulo: 15, numValor: 33,
        seccion: 15, aireSeccion: 12,
        escudo: 58, celdaExtra: 120, clubNombre: 14, maxClubes: 4, porFila: 4,
        trofeo: 18, maxTrofeos: 3,
        pie: 18, pieLink: 20,
    },
    feed: {
        padding: '64px 60px 52px', padH: 60,
        eyebrow: 26, headline: 76, nombre: 30, aireSuperior: 44,
        ovrLado: 208, ovrRotulo: 26, ovrValor: 108,
        chip: 28, banderaAncho: 72, banderaAlto: 52,
        numRotulo: 20, numValor: 54,
        seccion: 22, aireSeccion: 26,
        escudo: 118, celdaExtra: 60, clubNombre: 21, maxClubes: 8, porFila: 5,
        trofeo: 26, maxTrofeos: 4,
        pie: 26, pieLink: 30,
    },
    story: {
        padding: '132px 64px 118px', padH: 64,
        eyebrow: 30, headline: 88, nombre: 34, aireSuperior: 56,
        ovrLado: 236, ovrRotulo: 30, ovrValor: 124,
        chip: 32, banderaAncho: 84, banderaAlto: 60,
        numRotulo: 23, numValor: 64,
        seccion: 26, aireSeccion: 34,
        escudo: 120, celdaExtra: 80, clubNombre: 24, maxClubes: 8, porFila: 6,
        trofeo: 30, maxTrofeos: 6,
        pie: 30, pieLink: 34,
    },
};

/** Rango del OVR, en los mismos cortes que el juego (ver `ovrBand.ts`). */
function ovrColor(ovr: number): string {
    if (ovr >= 85) return '#B32E1B';
    if (ovr >= 75) return '#A85C0C';
    if (ovr >= 65) return '#00794A';
    if (ovr >= 55) return '#2F6FB0';
    return '#4A5B54';
}

/** Parte la trayectoria en filas. Una sola mientras entre; dos cuando no. */
function enFilas(clubes: CardClub[], porFila: number): CardClub[][] {
    if (clubes.length <= porFila) return [clubes];
    // Con dos filas se reparten parejo: 8 clubes son 4 y 4, no 6 y 2.
    const porFilaReal = Math.ceil(clubes.length / 2);
    const filas: CardClub[][] = [];
    for (let i = 0; i < clubes.length; i += porFilaReal) filas.push(clubes.slice(i, i + porFilaReal));
    return filas;
}

export default function CareerCard({ data, format = 'feed' }: { data: CareerCardData; format?: CardFormat }) {
    const { width, height } = CARD_SIZES[format];
    const m = MAQUETA[format];
    const chips = [data.employment, data.number === null ? '' : `#${data.number}`, data.position].filter(Boolean);
    const clubes = data.clubs.slice(0, m.maxClubes);
    const filas = enFilas(clubes, m.porFila);
    // Ancho de cada escudo con su nombre debajo. Se reparte el ancho útil entre
    // los de la fila, con un tope: sin el tope, tres clubes quedan separadísimos;
    // sin el reparto, seis se salen de la tarjeta.
    const anchoUtil = width - m.padH * 2;
    const anchoCelda = (enFila: number) => Math.min(m.escudo + m.celdaExtra, Math.floor(anchoUtil / enFila));

    /**
     * LA VITRINA NO SE RECORTA: SE ACHICA.
     *
     * Antes la tarjeta cortaba en `maxTrofeos` (3, 4 o 6 según el formato) y el
     * resto no aparecía en ningún lado — una carrera con ocho títulos mostraba
     * cuatro y mentía por omisión, que es lo peor que puede hacer una vitrina.
     * Ahora entran todos y lo que cede es el CUERPO de la ficha: la escala baja
     * con la raíz de cuántas hay, así que ocho fichas ocupan aproximadamente lo
     * mismo que cuatro y no el doble.
     *
     * El piso de 0,58 es el punto donde el texto deja de leerse en un chat. Una
     * vitrina de veinte títulos va a quedar apretada, y está bien: es un jugador
     * que ganó veinte títulos.
     */
    const fichas = data.trophies.length + data.awards.length;
    const escala = fichas <= m.maxTrofeos ? 1 : Math.max(0.58, Math.sqrt(m.maxTrofeos / fichas));
    const cuerpo = Math.round(m.trofeo * escala);

    return (
        <div
            style={{
                width, height, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', backgroundColor: FONDO, color: TINTA,
                padding: m.padding,
                // Articulat CF, SIEMPRE en oblicua. Los pesos hacen la jerarquía:
                // Heavy (900) los títulos, DemiBold (600) los rótulos y Medium
                // (500) lo que sólo desempata. La familia se hereda; abajo sólo
                // se cambia el peso.
                fontFamily: CARD_FONT_FAMILY, fontStyle: 'italic', fontWeight: 500,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* EL ARQUETIPO, arriba de todo. Es lo único que se lee si la
                    tarjeta pasa de largo en un chat. */}
                <div style={{ display: 'flex', fontSize: m.eyebrow, fontWeight: 600, letterSpacing: 3, color: VERDE }}>
                    CARRERA DE RUGBY
                </div>
                <div style={{ display: 'flex', fontSize: m.headline, fontWeight: 900, marginTop: 12, lineHeight: 1.02 }}>
                    {data.headline}
                </div>
                <div style={{ display: 'flex', fontSize: m.nombre, color: TENUE, marginTop: 14 }}>
                    {[data.surname, data.nationality].filter(Boolean).join(' · ')}
                </div>

                {/* EL OVR Y LOS CHIPS. El OVR es un BLOQUE DE COLOR por rango,
                    no un número teñido: es el mismo lenguaje que la cabecera del
                    juego, así que el que jugó lo reconoce sin leer el rótulo. */}
                <div style={{ display: 'flex', alignItems: 'stretch', marginTop: m.aireSuperior }}>
                    <div
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            width: m.ovrLado, height: m.ovrLado, borderRadius: 28, backgroundColor: ovrColor(data.ovr),
                        }}
                    >
                        <div style={{ display: 'flex', fontSize: m.ovrRotulo, fontWeight: 600, letterSpacing: 4, opacity: 0.9 }}>OVR</div>
                        <div style={{ display: 'flex', fontSize: m.ovrValor, fontWeight: 900, lineHeight: 1 }}>{data.ovr}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 26, flex: 1 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {data.flagUrl !== null && (
                                // eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img>
                                <img
                                    src={data.flagUrl}
                                    alt=""
                                    width={m.banderaAncho}
                                    height={m.banderaAlto}
                                    style={{ width: m.banderaAncho, height: m.banderaAlto, borderRadius: 10, marginRight: 14, marginBottom: 14, objectFit: 'cover' }}
                                />
                            )}
                            {chips.map((chip) => (
                                <div
                                    key={chip}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: 999, border: `2px solid ${BORDE}`, backgroundColor: PANEL,
                                        padding: format === 'link' ? '8px 18px' : '12px 26px', marginRight: 14, marginBottom: 14,
                                        fontSize: m.chip, fontWeight: 600,
                                    }}
                                >
                                    {chip}
                                </div>
                            ))}
                        </div>

                        {/* LOS TRES NÚMEROS. Partidos, puntos y caps: los caps
                            van sí o sí, que en rugby pesan más que los títulos. */}
                        <div
                            style={{
                                display: 'flex', borderRadius: 24, border: `2px solid ${BORDE}`,
                                backgroundColor: PANEL, padding: format === 'link' ? '12px 6px' : '20px 8px', marginTop: 6,
                            }}
                        >
                            {data.headline3.map((stat) => (
                                <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                                    <div style={{ display: 'flex', fontSize: m.numRotulo, fontWeight: 600, letterSpacing: 2, color: TENUE }}>
                                        {stat.label.toUpperCase()}
                                    </div>
                                    <div style={{ display: 'flex', fontSize: m.numValor, fontWeight: 900, marginTop: 4 }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* TRAYECTORIA: los escudos EN ORDEN, del primer club al último. Un
                club es su escudo; el nombre debajo, chico, sólo desempata. */}
            {clubes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', fontSize: m.seccion, fontWeight: 600, letterSpacing: 6, color: TENUE }}>
                        TRAYECTORIA
                    </div>
                    {filas.map((fila, i) => (
                        <div key={fila[0].name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginTop: i === 0 ? m.aireSeccion : 18 }}>
                            {fila.map((club) => (
                                <div
                                    key={club.name}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        width: anchoCelda(fila.length),
                                        // Sin este aire, dos nombres largos de la
                                        // misma fila se tocan y se leen como uno.
                                        paddingLeft: 8, paddingRight: 8,
                                    }}
                                >
                                    {club.crestUrl !== null ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- Satori sólo entiende <img>
                                        <img src={club.crestUrl} alt="" width={m.escudo} height={m.escudo} style={{ width: m.escudo, height: m.escudo, objectFit: 'contain' }} />
                                    ) : (
                                        <div
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                width: m.escudo, height: m.escudo, borderRadius: 999,
                                                backgroundColor: club.color, color: TINTA,
                                                fontSize: Math.round(m.escudo * 0.35), fontWeight: 900,
                                            }}
                                        >
                                            {club.initials}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', fontSize: m.clubNombre, color: TENUE, marginTop: 12, textAlign: 'center', lineHeight: 1.15 }}>
                                        {club.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* TÍTULOS, con contador. Repetidos colapsados: "Top 14 ×3" y no
                tres fichas iguales. */}
            {(data.trophies.length > 0 || data.awards.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', fontSize: m.seccion, fontWeight: 600, letterSpacing: 6, color: TENUE }}>
                        TÍTULOS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: m.aireSeccion - 4 }}>
                        {data.trophies.map((t) => (
                            <div
                                key={t.name}
                                style={{
                                    display: 'flex', alignItems: 'center',
                                    borderRadius: 999, border: `2px solid ${BORDE}`, backgroundColor: PANEL,
                                    padding: chipPad(format, escala),
                                    marginLeft: 8 * escala, marginRight: 8 * escala, marginBottom: 10 * escala,
                                }}
                            >
                                {t.iconUrl !== null && (
                                    // eslint-disable-next-line @next/next/no-img-element -- se dibuja con satori
                                    <img
                                        src={t.iconUrl}
                                        alt=""
                                        width={cuerpo * 1.5}
                                        height={cuerpo * 1.5}
                                        style={{ objectFit: 'contain', marginRight: 8 }}
                                    />
                                )}
                                <div style={{ display: 'flex', fontSize: cuerpo, fontWeight: 600 }}>{t.name}</div>
                                {t.count > 1 && (
                                    <div style={{ display: 'flex', fontSize: cuerpo, fontWeight: 900, color: VERDE, marginLeft: 10 }}>
                                        ×{t.count}
                                    </div>
                                )}
                            </div>
                        ))}
                        {/* LOS PREMIOS INDIVIDUALES, en la misma grilla y con borde
                            dorado: son de la misma vitrina, pero no son un torneo. */}
                        {data.awards.map((a) => (
                            <div
                                key={a.name}
                                style={{
                                    display: 'flex', alignItems: 'center',
                                    borderRadius: 999, border: `2px solid ${BORDE_PREMIO}`, backgroundColor: PANEL,
                                    padding: chipPad(format, escala),
                                    marginLeft: 8 * escala, marginRight: 8 * escala, marginBottom: 10 * escala,
                                }}
                            >
                                {a.iconUrl !== null && (
                                    // eslint-disable-next-line @next/next/no-img-element -- se dibuja con satori
                                    <img
                                        src={a.iconUrl}
                                        alt=""
                                        width={cuerpo * 1.5}
                                        height={cuerpo * 1.5}
                                        style={{ objectFit: 'contain', marginRight: 8 }}
                                    />
                                )}
                                <div style={{ display: 'flex', fontSize: cuerpo, fontWeight: 600, color: DORADO }}>{a.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data.notice !== undefined && (
                <div style={{ display: 'flex', fontSize: m.clubNombre, color: TENUE, lineHeight: 1.4 }}>{data.notice}</div>
            )}

            {/* PIE. La invitación a la izquierda y el link a la derecha: es lo
                que hace que la tarjeta salga del chat y vuelva al juego. */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', height: 2, backgroundColor: BORDE, marginBottom: format === 'link' ? 18 : 26 }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', fontSize: m.pie, fontWeight: 600, color: TENUE }}>Jugá tu carrera en</div>
                    <div style={{ display: 'flex', fontSize: m.pieLink, fontWeight: 900, color: VERDE }}>g22scores.com/juegos</div>
                </div>
            </div>
        </div>
    );
}
