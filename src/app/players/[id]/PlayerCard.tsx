/**
 * LA PLACA DEL JUGADOR. Una sola definicion para la vista previa del navegador
 * y para el archivo que se baja.
 *
 * Escrita con ESTILOS EN LINEA y solo flexbox, como la tarjeta de Carrera de
 * Rugby: es lo que entiende Satori, el renderer que convierte este JSX en la
 * imagen. Nada de CSS modules, grid, variables CSS ni pseudo-elementos —lo que
 * Satori no interpreta se dibuja distinto en el archivo que en la pantalla, y
 * entonces dejan de ser la misma placa.
 *
 * DOS FORMATOS, UNA MAQUETA:
 *   · `feed`  1080×1350 — 4:5, lo que Instagram y WhatsApp muestran entero.
 *   · `story` 1080×1920 — 9:16, pantalla completa; entran mas partidos.
 *
 * Ninguno sale de recortar al otro. Cada uno se dibuja a su medida.
 *
 * El orden de lectura: QUIEN (nombre y club), CUANTO (los numeros) y CONTRA
 * QUIEN (los ultimos partidos). El nombre manda porque la placa es de una
 * persona, no de una tabla.
 */

import { CARD_FONT_FAMILY } from '@/app/juegos/minijuegos/carrera-rugby/cardTypography';

const FONDO = '#0e1512';
const PANEL = '#18211d';
const BORDE = '#243029';
const TINTA = '#ffffff';
const TENUE = '#8fa39a';
const VERDE = '#00c476';
const ROJO = '#e05563';

export type PlayerCardFormat = 'feed' | 'story';

export const PLAYER_CARD_SIZES: Record<PlayerCardFormat, { width: number; height: number }> = {
    feed: { width: 1080, height: 1350 },
    story: { width: 1080, height: 1920 },
};

export const PLAYER_CARD_FORMATS = Object.keys(PLAYER_CARD_SIZES) as PlayerCardFormat[];

export function isPlayerCardFormat(value: string | null): value is PlayerCardFormat {
    return value !== null && (PLAYER_CARD_FORMATS as string[]).includes(value);
}

export type PlayerCardStat = { value: string; label: string };

export type PlayerCardMatch = {
    rival: string;
    crestUrl: string | null;
    score: string;
    result: 'win' | 'draw' | 'loss' | null;
    note: string;
};

export type PlayerCardData = {
    name: string;
    initials: string;
    photoUrl: string | null;
    clubName: string | null;
    clubCrestUrl: string | null;
    /** "Apertura · #10" ya resuelto: la placa no decide nada, solo dibuja. */
    subtitle: string;
    eyebrow: string;
    stats: PlayerCardStat[];
    matches: PlayerCardMatch[];
    footer: string;
};

/**
 * Las medidas de cada formato en UNA tabla. Repartidas por el JSX en ternarios
 * `format === 'story' ? … : …` son treinta lugares donde ajustar un numero, y
 * con olvidarse de uno la historia sale con la tipografia del feed.
 */
type Maqueta = {
    padding: number;
    eyebrow: number;
    nombre: number;
    subtitulo: number;
    avatar: number;
    inicial: number;
    statValor: number;
    statRotulo: number;
    filaAlto: number;
    filaTexto: number;
    escudo: number;
    partidos: number;
    seccion: number;
};

const MAQUETAS: Record<PlayerCardFormat, Maqueta> = {
    feed: {
        padding: 72,
        eyebrow: 26,
        nombre: 82,
        subtitulo: 32,
        avatar: 168,
        inicial: 64,
        statValor: 76,
        statRotulo: 22,
        filaAlto: 92,
        filaTexto: 32,
        escudo: 44,
        partidos: 6,
        seccion: 24,
    },
    story: {
        padding: 88,
        eyebrow: 30,
        nombre: 96,
        subtitulo: 36,
        avatar: 208,
        inicial: 80,
        statValor: 92,
        statRotulo: 26,
        filaAlto: 108,
        filaTexto: 36,
        escudo: 52,
        partidos: 10,
        seccion: 28,
    },
};

const RESULT_COLOR: Record<string, string> = { win: VERDE, draw: TENUE, loss: ROJO };

export default function PlayerCard({
    data,
    format = 'feed',
}: {
    data: PlayerCardData;
    format?: PlayerCardFormat;
}) {
    const m = MAQUETAS[format];
    const size = PLAYER_CARD_SIZES[format];
    const matches = data.matches.slice(0, m.partidos);

    return (
        <div
            style={{
                width: size.width,
                height: size.height,
                display: 'flex',
                flexDirection: 'column',
                background: FONDO,
                color: TINTA,
                fontFamily: CARD_FONT_FAMILY,
                fontStyle: 'italic',
                padding: m.padding,
            }}
        >
            {/* Cejilla: la marca a la izquierda, el torneo a la derecha. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', fontSize: m.eyebrow, fontWeight: 900, color: VERDE, letterSpacing: 2 }}>
                    G22 SCORES
                </div>
                {data.eyebrow ? (
                    <div style={{ display: 'flex', fontSize: m.eyebrow, fontWeight: 600, color: TENUE, letterSpacing: 1 }}>
                        {data.eyebrow.toUpperCase()}
                    </div>
                ) : null}
            </div>

            {/* Identidad */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: m.seccion * 1.6 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: m.avatar,
                        height: m.avatar,
                        borderRadius: m.avatar,
                        background: PANEL,
                        border: `2px solid ${BORDE}`,
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}
                >
                    {data.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
                        <img
                            src={data.photoUrl}
                            alt=""
                            width={m.avatar}
                            height={m.avatar}
                            style={{ width: m.avatar, height: m.avatar, objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{ display: 'flex', fontSize: m.inicial, fontWeight: 900, color: TENUE }}>
                            {data.initials}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: m.seccion * 1.4, flex: 1 }}>
                    <div style={{ display: 'flex', fontSize: m.nombre, fontWeight: 900, lineHeight: 1.02 }}>
                        {data.name.toUpperCase()}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginTop: 16,
                            fontSize: m.subtitulo,
                            fontWeight: 600,
                            color: TENUE,
                        }}
                    >
                        {data.clubCrestUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
                            <img
                                src={data.clubCrestUrl}
                                alt=""
                                width={m.escudo}
                                height={m.escudo}
                                style={{ width: m.escudo, height: m.escudo, objectFit: 'contain', marginRight: 14 }}
                            />
                        ) : null}
                        {data.subtitle}
                    </div>
                </div>
            </div>

            {/* Los numeros */}
            <div style={{ display: 'flex', marginTop: m.seccion * 1.8 }}>
                {data.stats.map((stat, index) => (
                    <div
                        key={stat.label}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                            paddingTop: m.seccion,
                            paddingBottom: m.seccion,
                            background: PANEL,
                            border: `1px solid ${BORDE}`,
                            borderRadius: 20,
                            marginLeft: index === 0 ? 0 : 16,
                        }}
                    >
                        <div style={{ display: 'flex', fontSize: m.statValor, fontWeight: 900, lineHeight: 1 }}>
                            {stat.value}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 10,
                                fontSize: m.statRotulo,
                                fontWeight: 600,
                                color: TENUE,
                                letterSpacing: 1,
                            }}
                        >
                            {stat.label.toUpperCase()}
                        </div>
                    </div>
                ))}
            </div>

            {/* Los partidos */}
            {matches.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: m.seccion * 1.6, flex: 1 }}>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: m.statRotulo,
                            fontWeight: 600,
                            color: TENUE,
                            letterSpacing: 2,
                            marginBottom: 14,
                        }}
                    >
                        ULTIMOS PARTIDOS
                    </div>
                    {matches.map((match, index) => (
                        <div
                            key={`${match.rival}-${index}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: m.filaAlto,
                                borderTop: index === 0 ? `1px solid ${BORDE}` : 'none',
                                borderBottom: `1px solid ${BORDE}`,
                            }}
                        >
                            {match.crestUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
                                <img
                                    src={match.crestUrl}
                                    alt=""
                                    width={m.escudo}
                                    height={m.escudo}
                                    style={{ width: m.escudo, height: m.escudo, objectFit: 'contain', marginRight: 18 }}
                                />
                            ) : (
                                <div style={{ display: 'flex', width: m.escudo, marginRight: 18 }} />
                            )}
                            <div
                                style={{
                                    display: 'flex',
                                    flex: 1,
                                    fontSize: m.filaTexto,
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                }}
                            >
                                {match.rival}
                            </div>
                            {match.note ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: m.filaTexto * 0.8,
                                        fontWeight: 600,
                                        color: VERDE,
                                        marginRight: 24,
                                    }}
                                >
                                    {match.note}
                                </div>
                            ) : null}
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: m.filaTexto,
                                    fontWeight: 900,
                                    color: match.result ? RESULT_COLOR[match.result] : TINTA,
                                }}
                            >
                                {match.score}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', flex: 1 }} />
            )}

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: m.seccion,
                    fontSize: m.statRotulo,
                    fontWeight: 600,
                    color: TENUE,
                    letterSpacing: 1,
                }}
            >
                <div style={{ display: 'flex' }}>{data.footer.toUpperCase()}</div>
                <div style={{ display: 'flex', color: VERDE }}>G22SCORES.COM</div>
            </div>
        </div>
    );
}
