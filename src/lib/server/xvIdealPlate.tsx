// La placa del XV de cada persona: una imagen con SU cancha, lista para subir a
// historias (1080×1920) o al feed (1080×1350). Se dibuja en el servidor con
// `ImageResponse` de Next (satori): solo flexbox, sin grid ni filtros.
//
// Estética S22 de torneos nacionales: azul noche → azul → celeste, letras
// blancas, Articulat Heavy Oblique (la que hay en public/fonts; Dharma es una
// fuente local del equipo de diseño y no está en el repo).

import fs from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import type { VoteEmailRow } from '@/lib/xvIdeal/voteEmail';
import { XV_PITCH } from '@/lib/xvIdeal/xvIdeal';

export type XvPlateFormat = 'post' | 'story';

export function isXvPlateFormat(value: unknown): value is XvPlateFormat {
    return value === 'post' || value === 'story';
}

export interface XvPlateInput {
    rows: VoteEmailRow[];
    zoneName: string;
    format: XvPlateFormat;
}

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

let fontPromise: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
    fontPromise ??= fs.readFile(path.join(PUBLIC_DIR, 'fonts', 'articulat', 'ArticulatCF-HeavyOblique.otf'));
    return fontPromise;
}

const imageCache = new Map<string, string | null>();

/** Una imagen del sitio como data URI (satori no baja nada de la red). Solo rutas propias, sin `..`. */
async function imageData(publicPath: string | null): Promise<string | null> {
    if (!publicPath || publicPath.includes('..') || !publicPath.startsWith('/')) return null;
    if (imageCache.has(publicPath)) return imageCache.get(publicPath) ?? null;
    const mime = MIME[path.extname(publicPath).toLowerCase()];
    let data: string | null = null;
    if (mime) {
        try {
            const bytes = await fs.readFile(path.join(PUBLIC_DIR, publicPath));
            data = `data:${mime};base64,${bytes.toString('base64')}`;
        } catch {
            data = null;
        }
    }
    imageCache.set(publicPath, data);
    return data;
}

const W = 1080;

function Plate({ rows, zoneName, format, logos, awards }: XvPlateInput & { logos: Map<string, string | null>; awards: string | null }) {
    const story = format === 'story';
    const H = story ? 1920 : 1350;
    const padX = 64;
    const pitchPad = 22;
    const innerW = W - padX * 2 - pitchPad * 2;
    const tileW = story ? 214 : 196;
    const tileH = story ? 176 : 130;
    const byJersey = new Map(rows.map((row) => [row.jersey, row]));
    const titleSize = 76;

    // Dos bloques por fila van donde estarían los centros 4 y 8 de la cancha de 11 casilleros.
    const sideFor2 = Math.round(innerW * 0.318 - tileW / 2);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: W,
                height: H,
                padding: story ? `150px ${padX}px 120px` : `54px ${padX}px 48px`,
                background: 'linear-gradient(165deg, #07172B 0%, #0E5E98 58%, #0A3D68 100%)',
                color: '#FFFFFF',
                fontFamily: 'Articulat',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 78 }}>
                {awards ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={awards} width={142} height={105} style={{ width: 142, height: 105, objectFit: 'contain' }} alt="" />
                ) : (
                    <div style={{ display: 'flex', fontSize: 44 }}>SALIDA DE 22</div>
                )}
                <div style={{ display: 'flex', fontSize: 40, color: '#7DD3FC' }}>G22SCORES.COM</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 48 : 22 }}>
                <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 0.98, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>MI XV IDEAL DEL</div>
                <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 0.98, textTransform: 'uppercase', whiteSpace: 'nowrap', color: '#7DD3FC' }}>ARGENTINO JUVENIL M17</div>
                <div style={{ display: 'flex', fontSize: 32, marginTop: 12, textTransform: 'uppercase', color: '#CFE8F7' }}>
                    {`${zoneName} · 2026`}
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    flex: 1,
                    marginTop: story ? 44 : 22,
                    padding: `${pitchPad}px`,
                    borderRadius: 28,
                    border: '2px solid rgba(125, 211, 252, 0.35)',
                    background: 'rgba(7, 23, 43, 0.45)',
                }}
            >
                {XV_PITCH.map((line, index) => (
                    <div
                        key={index}
                        style={{
                            display: 'flex',
                            justifyContent: line.length === 3 ? 'space-between' : 'center',
                            gap: line.length === 3 ? 0 : innerW - 2 * sideFor2 - 2 * tileW,
                        }}
                    >
                        {line.map(({ jersey }) => {
                            const row = byJersey.get(jersey);
                            const logo = row?.logo ? logos.get(row.logo) ?? null : null;
                            return (
                                <div
                                    key={jersey}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        width: tileW,
                                        height: tileH,
                                        borderRadius: 16,
                                        overflow: 'hidden',
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        background: 'linear-gradient(180deg, #0E5E98, #0A2A4A)',
                                    }}
                                >
                                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                        {logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logo} width={story ? 100 : 66} height={story ? 100 : 66} style={{ objectFit: 'contain' }} alt="" />
                                        ) : (
                                            <div style={{ display: 'flex', fontSize: 64, color: 'rgba(255,255,255,0.5)' }}>{jersey}</div>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            height: story ? 62 : 48,
                                            padding: '0 10px',
                                            background: 'rgba(5, 14, 28, 0.9)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', fontSize: story ? 34 : 28, color: '#35CBEF', marginRight: 8 }}>{jersey}</div>
                                        <div
                                            style={{
                                                display: 'flex',
                                                flex: 1,
                                                fontSize: story ? 19 : 16,
                                                lineHeight: 1.05,
                                                textTransform: 'uppercase',
                                                maxHeight: story ? 42 : 34,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {row?.name ?? ''}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

export async function xvPlateImage(input: XvPlateInput): Promise<ImageResponse> {
    const [font, awards] = await Promise.all([loadFont(), imageData('/awards/oficiales/s22-awards-2026-blanco.png')]);
    const logos = new Map<string, string | null>();
    await Promise.all(
        [...new Set(input.rows.map((row) => row.logo).filter((logo): logo is string => Boolean(logo)))].map(async (logo) => {
            logos.set(logo, await imageData(logo));
        }),
    );
    const height = input.format === 'story' ? 1920 : 1350;
    return new ImageResponse(<Plate {...input} logos={logos} awards={awards} />, {
        width: W,
        height,
        fonts: [{ name: 'Articulat', data: font, style: 'normal', weight: 800 }],
    });
}

export async function xvPlateBuffer(input: XvPlateInput): Promise<Buffer> {
    return Buffer.from(await (await xvPlateImage(input)).arrayBuffer());
}
