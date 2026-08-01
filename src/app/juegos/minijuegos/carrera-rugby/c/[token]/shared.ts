// Resolución del token compartido, COMPARTIDA entre la página y la og:image.
//
// Las dos tienen que llegar exactamente al mismo resultado: si la imagen del
// chat muestra una carrera y la página muestra otra (o un error), el link
// miente. Por eso el token se resuelve en un solo lugar.

import { headers } from 'next/headers';
import {
    decodeCareerToken, isLocale, replayRecipe, stringsFor, type CareerState, type Locale,
} from '@/features/career';
import { careerCardData, receiptCardData, type CareerCardData } from '../../careerCardData';

export type SharedCareer =
    /** El motor coincide: la carrera se reconstruyó entera. */
    | { kind: 'ok'; career: CareerState; card: CareerCardData }
    /**
     * El motor cambió, pero el token traía RECIBO: se muestra lo que era cierto
     * al compartir. El link no muere, se degrada — y lo dice.
     */
    | { kind: 'receipt'; card: CareerCardData }
    | { kind: 'broken'; title: string; detail: string };

/**
 * Origen absoluto. La og:image se arma en el servidor: una ruta relativa al
 * escudo de un club no resuelve contra nada ahí.
 */
export async function requestOrigin(): Promise<string> {
    const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');

    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
}

/**
 * Decodifica, vuelve a correr la carrera y arma la tarjeta.
 *
 * Nunca inventa: un token de otra versión del motor NO se aproxima con la
 * carrera más parecida. Es la misma regla que `loadCareer()` con `'outdated'` —
 * antes que mostrar una carrera que no es la que se jugó, se dice que el link
 * no se puede abrir.
 */
export async function resolveSharedCareer(token: string, locale: Locale = 'es'): Promise<SharedCareer> {
    const decoded = decodeCareerToken(token);
    const t = stringsFor(locale);

    if (decoded.kind === 'malformed') {
        return { kind: 'broken', title: t.shareBrokenLinkTitle, detail: t.shareBrokenLinkDetail };
    }

    if (decoded.kind === 'engine-mismatch') {
        // Con recibo el link SIGUE SIRVIENDO: muestra lo que decía al
        // compartirse. Sin recibo (tokens anteriores a que existiera) no queda
        // nada que mostrar y recién ahí es un link muerto.
        if (decoded.receipt !== null) {
            return { kind: 'receipt', card: receiptCardData(decoded.identity, decoded.receipt, locale) };
        }
        return { kind: 'broken', title: t.shareOldEngineTitle, detail: t.shareOldEngineDetail };
    }

    const replay = replayRecipe(decoded.recipe);
    if (replay.kind !== 'ok') {
        // Mismo criterio que el desajuste de motor de arriba: con RECIBO el link sigue
        // sirviendo. Para quien mira la tarjeta las dos fallas son la misma —la carrera
        // no se puede rearmar y lo unico cierto es lo que decia al compartirse—, asi que
        // no hay razon para que una degrade con gracia y la otra mate el link.
        //
        // Y el replay diverge por mas motivos que un motor viejo: el token sella
        // ENGINE_VERSION pero NO las versiones de catalogo, asi que un cambio de clubes
        // o del sistema argentino tira por aca sin pasar por `engine-mismatch`. Tambien
        // cae aca una carrera vieja que quedo en memoria: el token se estampa con el
        // ENGINE_VERSION de AHORA, no con el que la jugo.
        //
        // Sin esto la tarjeta terminaba en `broken`, /imagen respondia 404 text/plain y
        // el boton de bajar guardaba ESE TEXTO como archivo: un .txt en Descargas.
        if (decoded.recipe.receipt !== null) {
            return {
                kind: 'receipt',
                card: receiptCardData(
                    {
                        surname: decoded.recipe.surname,
                        position: decoded.recipe.position,
                        nationalityCountryCode: decoded.recipe.nationalityCountryCode,
                    },
                    decoded.recipe.receipt,
                    locale,
                ),
            };
        }

        return { kind: 'broken', title: t.shareReplayFailedTitle, detail: t.shareReplayFailedDetail };
    }

    return { kind: 'ok', career: replay.state, card: careerCardData(replay.state, await requestOrigin(), locale) };
}

/**
 * EL IDIOMA DEL LINK COMPARTIDO.
 *
 * En el servidor no hay `localStorage`: el idioma no puede salir de la
 * preferencia del que abre el link. Sale del propio link (`?lang=en`), que es lo
 * que pone el que comparte — y es lo correcto, porque la vista previa del chat y
 * la página tienen que decir lo mismo y ninguna de las dos sabe quién va a
 * mirarlas.
 *
 * Sin `?lang` queda el español, que es el idioma canónico del juego.
 */
export function localeFromQuery(searchParams: Record<string, string | string[] | undefined> | undefined): Locale {
    const raw = searchParams?.lang;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return isLocale(value) ? value : 'es';
}
