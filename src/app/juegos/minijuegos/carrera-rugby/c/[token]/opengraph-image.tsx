// La MISMA tarjeta que muestra la página, dibujada como imagen para el chat.
//
// No hay una segunda maqueta: se importa `CareerCard` y se le pasa el mismo
// `CareerCardData`. Si mañana cambia una cifra de la tarjeta, cambia en los dos
// lados o en ninguno.

import { ImageResponse } from 'next/og';
import CareerCard, { CARD_HEIGHT, CARD_WIDTH } from '../../CareerCard';
import { CARD_FONT_FAMILY } from '../../cardTypography';
import { cardFonts } from '@/lib/carrera/cardFonts';
import { resolveSharedCareer } from './shared';

export const alt = 'Resumen de una carrera de rugby en G22 Scores';
export const size = { width: CARD_WIDTH, height: CARD_HEIGHT };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const [shared, fonts] = await Promise.all([resolveSharedCareer(token), cardFonts()]);

    // Un link roto igual necesita imagen: sin ella el chat muestra un rectángulo
    // vacío y no se entiende si el problema es el link o el juego.
    if (shared.kind === 'broken') {
        return new ImageResponse(
            (
                <div
                    style={{
                        // Mismo fondo que la tarjeta: un link roto que llega
                        // en blanco al chat no se lee como el mismo producto.
                        width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', flexDirection: 'column',
                        justifyContent: 'center', backgroundColor: '#0e1512', color: '#ffffff',
                        padding: '0 72px',
                        fontFamily: CARD_FONT_FAMILY, fontStyle: 'italic', fontWeight: 500,
                    }}
                >
                    <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, letterSpacing: 3, color: '#00c476' }}>
                        CARRERA DE RUGBY
                    </div>
                    <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, marginTop: 16, lineHeight: 1.1 }}>
                        {shared.title}
                    </div>
                    <div style={{ display: 'flex', fontSize: 28, color: '#8fa39a', marginTop: 18 }}>
                        {shared.detail}
                    </div>
                </div>
            ),
            { ...size, fonts },
        );
    }

    return new ImageResponse(<CareerCard data={shared.card} />, { ...size, fonts });
}
