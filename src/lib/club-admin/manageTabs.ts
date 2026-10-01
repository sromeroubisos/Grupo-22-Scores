/**
 * Las secciones del gestor de club.
 *
 * La consola vieja tenía once pestañas (entrenamientos, rendimiento, pizarra,
 * partidos, competencias, contenido...). Esas se fueron a un producto aparte —
 * la copia congelada está en `proyecto-club-suite/`. Acá quedó lo que define a
 * un club dentro de G22 Scores: quién es, quién juega, quién lo administra, con
 * qué otros clubes está emparentado y qué marcas lo acompañan. Sponsors volvió
 * en 2026-09 con otro modelo (tabla `entity_sponsors`, compartida con torneos).
 *
 * Los alias existen porque hay links viejos dando vueltas (favoritos, mails,
 * la tabla de clubes del super admin). Un `tab` que ya no está no tiene que
 * romper: cae en Inicio.
 *
 * 2026-10: "Inicio" es la portada de accesos rápidos (lo primero que ve un club
 * al entrar, y adonde lleva "Volver al panel") y "Crear partido" monta el mismo
 * formulario del panel de la ficha pública. "Clubes relacionados" pasó a
 * llamarse "Clubes de la familia"; el id sigue siendo `relacionados` para no
 * romper links.
 */

export type ClubManagerTabId =
    | 'inicio'
    | 'partido'
    | 'general'
    | 'jugadores'
    | 'sedes'
    | 'usuarios'
    | 'relacionados'
    | 'sponsors'
    | 'publicar';

export const CLUB_MANAGER_TABS: ReadonlyArray<{ id: ClubManagerTabId; label: string }> = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'partido', label: 'Crear partido' },
    { id: 'general', label: 'General' },
    { id: 'jugadores', label: 'Jugadores' },
    { id: 'relacionados', label: 'Clubes de la familia' },
    { id: 'sedes', label: 'Sedes' },
    { id: 'usuarios', label: 'Usuarios' },
    { id: 'sponsors', label: 'Sponsors' },
    { id: 'publicar', label: 'Publicar' },
];

const ALLOWED = new Set<ClubManagerTabId>(CLUB_MANAGER_TABS.map((tab) => tab.id));

/** Nombres viejos → sección actual. Todo lo que no figure cae en Inicio. */
const ALIASES: Record<string, ClubManagerTabId> = {
    inicio: 'inicio',
    home: 'inicio',
    panel: 'inicio',
    partido: 'partido',
    partidos: 'partido',
    'crear-partido': 'partido',
    resumen: 'general',
    identidad: 'general',
    configuracion: 'general',
    equipos: 'jugadores',
    planteles: 'jugadores',
    plantel: 'jugadores',
    roster: 'jugadores',
    jugadores: 'jugadores',
    accesos: 'usuarios',
    usuarios: 'usuarios',
    familia: 'relacionados',
    related: 'relacionados',
    relacionados: 'relacionados',
    sedes: 'sedes',
    venues: 'sedes',
    canchas: 'sedes',
    sponsors: 'sponsors',
    patrocinadores: 'sponsors',
    publicar: 'publicar',
    publish: 'publicar',
    publicacion: 'publicar',
    divisiones: 'jugadores',
};

export function normalizeClubManagerTab(requested?: string | null): ClubManagerTabId {
    const key = (requested ?? '').trim().toLowerCase();
    if (!key) return 'inicio';

    const aliased = ALIASES[key];
    if (aliased) return aliased;

    return ALLOWED.has(key as ClubManagerTabId) ? (key as ClubManagerTabId) : 'inicio';
}
