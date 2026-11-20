import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Metadata, Viewport } from 'next';
import SevenGame from './SevenGame';

export const metadata: Metadata = {
    title: 'Rugby Seven | G22 Scores',
    description: 'Seven de rugby en pixel art con selecciones reales: World Cup, Rugby Championship, Six Nations, Sudamericano Seven y más. Partidos de 3, 5 o 7 minutos.',
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
