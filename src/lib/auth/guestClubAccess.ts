/**
 * Acceso de invitado a un club (demo de La Tablada).
 *
 * `GET /api/auth/guest-club-family` no pide credenciales: setea una cookie que
 * `getGuestAccessContext()` convierte en una membresia `club_family / editor`
 * con acceso al panel del club. Cualquiera que visite esa URL entra.
 *
 * Queda APAGADO salvo que se prenda a proposito con
 * `GUEST_CLUB_ACCESS_ENABLED=true`. Se chequea en los dos extremos —la ruta que
 * emite la cookie y el resolutor que la lee— para que una cookie ya emitida
 * deje de valer apenas se apaga el flag, sin esperar a que expire.
 */
export const GUEST_CLUB_ACCESS_COOKIE = 'g22_guest_club_access';

export function isGuestClubAccessEnabled(): boolean {
    return process.env.GUEST_CLUB_ACCESS_ENABLED === 'true';
}
