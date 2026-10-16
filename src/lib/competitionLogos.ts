/**
 * Logo curado de una competición a partir de su nombre.
 *
 * Sirve para lo que NO tiene `logo_url` propio: las ligas que llegan del catálogo
 * externo (Super Rugby Americas, Americas Championship...) y las filas de la base
 * que se cargaron sin escudo. Solo devuelve archivos de `public/competiciones/`,
 * los únicos que el selector acepta porque son transparentes.
 */

const normalizar = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["'“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const DIR = '/competiciones/';

/** Nombre normalizado -> archivo. Varios nombres pueden compartir logo. */
const LOGOS_POR_NOMBRE: Record<string, string> = {
  'super rugby americas': 'sra.png',
  'americas championship': 'americas-rugby-championship.png',
  'americas rugby championship': 'americas-rugby-championship.png',
  'super rugby': 'super-rugby.png',
  'super rugby pacific': 'super-rugby.png',
  'united rugby championship': 'urc.png',
  urc: 'urc.png',
  'top 14': 'top14.png',
  premiership: 'prem.png',
  'premiership rugby': 'prem.png',
  'gallagher premiership': 'prem.png',
  'champions cup': 'champions-cup.png',
  'european rugby champions cup': 'champions-cup.png',
  'challenge cup': 'challenge-cup.png',
  'european rugby challenge cup': 'challenge-cup.png',
  'tbilisi cup': 'tbilisi-cup.png',
  'irb tbilisi cup': 'tbilisi-cup.png',
  'bunnings npc': 'npc.png',
  'major league rugby': 'us-mlr.png',
  'currie cup': 'currie-premier.png',
  'league one': 'jpn-d1.png',
  'six nations': 'six-nations.webp',
  'rugby championship': 'rugby-championship.jpg',
  'the rugby championship': 'rugby-championship.jpg',
  'nations championship': 'nations-championship.png',
  'world cup': 'world-cup.svg',
  'rugby world cup': 'world-cup.svg',
  'world rugby nations cup': 'world-rugby.png',
  'rugby premier league': 'rugby-premier-league.png',
};

export function competitionLogoByName(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const archivo = LOGOS_POR_NOMBRE[normalizar(nombre)];
  return archivo ? `${DIR}${archivo}` : null;
}
