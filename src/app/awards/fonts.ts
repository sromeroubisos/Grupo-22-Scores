import { Big_Shoulders } from 'next/font/google';

/** La tipografía de títulos de los premios: condensada, de cartel deportivo. */
export const awardsDisplay = Big_Shoulders({
    subsets: ['latin'],
    weight: ['700', '900'],
    variable: '--font-awards-display',
    display: 'swap',
});
