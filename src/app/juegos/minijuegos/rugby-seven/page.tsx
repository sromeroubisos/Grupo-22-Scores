import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Metadata, Viewport } from 'next';
import SevenGame from './SevenGame';

export const metadata: Metadata = {
    title: 'Rugby Seven | G22 Scores',
    description: 'Seven de rugby en pixel art con selecciones reales: World Cup, Rugby Championship, Six Nations, Sudamericano Seven y más. Partidos de 3, 5 o 7 minutos.',
    // Manifiesto propio: "Agregar a la pantalla de inicio" desde acá instala Rugby Seven como
    // una app aparte, que abre directo en el juego y anda sin conexión (ver public/sw.js).
    manifest: '/juegos/rugby-seven/manifest.webmanifest',
    // El iPhone no lee los íconos del manifiesto: el acceso directo sale del apple-touch-icon.
    // Reemplaza entero el `icons` del layout, por eso va también el de la pestaña.
    icons: { icon: '/juegos/rugby-seven/icon-192.png', apple: '/juegos/rugby-seven/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: 'Rugby Argento', statusBarStyle: 'black-translucent' },
};

/**
 * En el celular la pantalla del juego queda fija: sin zoom (pellizcar o doble
 * toque) que mueva la cancha mientras se juega con gestos. El resto del sitio
 * conserva su zoom.
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

/** Música de fondo: se suma dejando el archivo en public/. Sin archivo, el juego no la pide. */
const MUSIC_PUBLIC_PATH = '/juegos/rugby-seven/musica.mp3';
/** Música de los menús (todo lo que no es el partido). */
const MENU_MUSIC_PUBLIC_PATH = '/juegos/rugby-seven/menu.mp3';
const inPublic = (p: string) => (existsSync(path.join(process.cwd(), 'public', p)) ? p : null);

export default function RugbySevenPage() {
    // La página es estática: esto se resuelve en el build (y en cada request en dev).
    const music = inPublic(MUSIC_PUBLIC_PATH);
    const menuMusic = inPublic(MENU_MUSIC_PUBLIC_PATH);
    // El único <h1> de la página es el título del juego y vive en SevenGame.
    return <SevenGame musicSrc={music} menuMusicSrc={menuMusic} />;
}
