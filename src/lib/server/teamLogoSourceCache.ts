import 'server-only';
import { revalidateTag } from 'next/cache';

/**
 * Etiqueta del Data Cache donde el proxy de escudos (`/api/assets/team-logo`)
 * guarda QUÉ imagen corresponde a cada pedido.
 *
 * Por qué existe: el CDN de Vercel cachea la respuesta del proxy, pero esa copia
 * es de cada deploy. Con decenas de deploys por día, cada escudo volvía a pagar
 * la cascada de clubs → club_derivatives → tournaments → external_teams (hasta
 * doce consultas en serie, cruzando regiones): 0,4 a 1,5 s por escudo contra
 * 0,2 s de un HIT. El Data Cache sobrevive a los deploys.
 *
 * Lo que entra es la FUENTE (una URL, una ruta de public/ o un data URI), no los
 * bytes: un escudo nuevo commiteado en public/ con el mismo nombre se ve en el
 * deploy siguiente porque los bytes se leen en cada pedido.
 */
export const TEAM_LOGO_SOURCE_TAG = 'team-logo-sources';

/** Tiempo máximo que un escudo cambiado sin token `v` tarda en verse. */
export const TEAM_LOGO_SOURCE_REVALIDATE_SECONDS = 6 * 60 * 60;

/** Al guardar un escudo: la próxima vuelta del proxy vuelve a buscar en la base. */
export function invalidateTeamLogoSources() {
    try {
        revalidateTag(TEAM_LOGO_SOURCE_TAG, { expire: 0 });
    } catch {
        // Fuera de un request (scripts) no hay cache que invalidar: vence solo.
    }
}
