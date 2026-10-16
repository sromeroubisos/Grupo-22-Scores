// GENERADO por scripts/regiones-uniones/logos.mjs: no se edita a mano.
//
// El logo de cada unión (en /public/uniones, sin fondo) y los dos colores del
// degradé de su bloque en el selector de ligas, sacados del propio logo.
// Una unión sin entrada acá se dibuja con un bloque neutro y sus iniciales.

export interface MarcaDeUnion {
  logo: string;
  c1: string;
  /** Null cuando el logo tiene un solo color: el degradé usa una variante oscura del primero. */
  c2: string | null;
}

export const MARCAS_DE_UNION: Record<string, MarcaDeUnion> = {
  'urba': { logo: '/uniones/urba.png', c1: '#8b1112', c2: '#003c7e' },
  'uroba': { logo: '/uniones/uroba.png', c1: '#6b7785', c2: '#38414c' },
  'urne': { logo: '/uniones/urne.png', c1: '#243c1c', c2: '#eec649' },
  'union-austral': { logo: '/uniones/union-austral.png', c1: '#00903e', c2: null },
  'union-de-rugby-de-alto-valle': { logo: '/uniones/union-de-rugby-de-alto-valle.png', c1: '#e5132b', c2: null },
  'union-andina-de-rugby': { logo: '/uniones/union-andina-de-rugby.png', c1: '#4b3828', c2: null },
  '0c515ac1-af49-4699-b3c5-7273bc424357': { logo: '/uniones/0c515ac1-af49-4699-b3c5-7273bc424357.png', c1: '#d30101', c2: '#a88947' },
  'union-de-rugby-del-valle-del-chubut': { logo: '/uniones/union-de-rugby-del-valle-del-chubut.png', c1: '#3d4654', c2: '#1d232c' },
  '40159cd1-5876-4720-b953-d639b09d5f5b': { logo: '/uniones/40159cd1-5876-4720-b953-d639b09d5f5b.png', c1: '#271068', c2: '#ffc400' },
  'union-entrerriana-de-rugby': { logo: '/uniones/union-entrerriana-de-rugby.png', c1: '#e73b27', c2: '#079955' },
  'union-de-rugby-de-formosa': { logo: '/uniones/union-de-rugby-de-formosa.png', c1: '#5eb2eb', c2: '#c23729' },
  'union-de-rugby-de-mar-del-plata': { logo: '/uniones/union-de-rugby-de-mar-del-plata.png', c1: '#017943', c2: '#2c84ac' },
  'a37639f8-197c-44c6-a095-2f16f40d7b04': { logo: '/uniones/a37639f8-197c-44c6-a095-2f16f40d7b04.png', c1: '#193b87', c2: null },
  '4263f793-04d6-4dd9-9b43-b7e9823bf721': { logo: '/uniones/4263f793-04d6-4dd9-9b43-b7e9823bf721.png', c1: '#ab0104', c2: null },
  '765e6c46-b1c1-4e44-8490-aa0085ebeb99': { logo: '/uniones/765e6c46-b1c1-4e44-8490-aa0085ebeb99.png', c1: '#282544', c2: '#673a10' },
  'union-santafesina-de-rugby': { logo: '/uniones/union-santafesina-de-rugby.png', c1: '#9c5641', c2: '#092848' },
  'union-santiaguena-de-rugby': { logo: '/uniones/union-santiaguena-de-rugby.png', c1: '#92d7f8', c2: '#eb3237' },
  'union-de-rugby-del-sur': { logo: '/uniones/union-de-rugby-del-sur.png', c1: '#0274d7', c2: null },
  'union-de-rugby-de-tierra-del-fuego': { logo: '/uniones/union-de-rugby-de-tierra-del-fuego.png', c1: '#c76806', c2: null },
  'e558d0d9-c01b-40ce-a1c7-e533cb81f97c': { logo: '/uniones/e558d0d9-c01b-40ce-a1c7-e533cb81f97c.png', c1: '#ff6600', c2: '#010168' },
  'union-de-rugby-de-misiones': { logo: '/uniones/union-de-rugby-de-misiones.png', c1: '#865625', c2: null },
};
