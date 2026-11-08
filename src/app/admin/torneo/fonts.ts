import { JetBrains_Mono } from 'next/font/google';

/**
 * Plus Jakarta Sans NO pasa por `next/font/google`: al build de Vercel (iad1)
 * Google le sirve URLs `fonts.gstatic.com/l/font?kit=...&skey=...`, y el `&`
 * suelto rompe el import map de Turbopack (Next 16.1.6): "next/font/google
 * queries have exactly one entry". Se caía el build entero por esta fuente.
 * Se carga con un <link> en el layout; el CSS ya la nombra directo.
 */
export const JAKARTA_STYLESHEET =
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&display=swap';

export const mono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-mono-vitreous',
    display: 'swap',
});
