// EL CAPITÁN — las decisiones de mercado. Prefijo `mer-`.
//
// Estas NO son datos estáticos: se arman en el momento con los clubes que te
// quieren, porque el texto tiene que decir el nombre del club y el sueldo. Es
// el mismo patrón que `career/engine/event-selector.ts`: la decoración de
// presentación se reconstruye en cada render y NO se persiste — en el estado
// viven las ofertas, y de ahí sale la tarjeta.

import type { CaptainEvent, CaptainOption } from '../../types/event.ts';
import type { CaptainState, ClubOffer } from '../../types/captain.ts';
import type { SquadRole } from '../../types/player.ts';
import { BELONGING_CAP_RIVAL_JUMP, BELONGING_TIERS } from '../../types/currencies.ts';
import { belongingTier } from '../../engine/belonging.ts';
import { isRivalJump } from '../../engine/betrayal.ts';
import { clubRatingOf, renewalFor } from '../../engine/clubs.ts';
import { selectionVisibility } from '../../engine/national-team.ts';
import { playingTimeOf } from '../../engine/statistics.ts';
import { getClub, sportingBandOf } from '../catalogs.ts';

export const MARKET_EVENT_ID = 'mer-oferta';
export const RETURN_EVENT_ID = 'mer-volver-a-casa';

/**
 * EN QUÉ LUGAR DEL PLANTEL CAERÍAS EN ESE CLUB.
 *
 * No es una estimación paralela: es `playingTimeOf`, LA MISMA función que va a
 * repartir los minutos de la temporada que viene, corrida con el rating del club
 * que te ofrece. Una segunda cuenta —«si el club te saca más de tanto, banco»—
 * sería una segunda fuente de verdad sobre la misma pregunta, y el día que las
 * dos no coincidieran la tarjeta estaría mintiendo justo donde más caro sale.
 *
 * Va sin `bonus`: el escalón que deja la decisión (`playingTime`) se aplica
 * DESPUÉS de firmar y por eso no puede estar en la promesa. Lo que la tarjeta
 * dice es dónde entrás hoy con tu media; lo que el desenlace cuenta es si la
 * adaptación fue blanda o dura.
 */
function roleAt(state: CaptainState, clubId: string | null): SquadRole {
    return playingTimeOf(state.player, clubRatingOf(clubId), state.damage.cuerpo).role;
}

/**
 * QUIÉN TE MIRA SI VAS AHÍ, con la MISMA función que lo va a cobrar.
 *
 * Es el hermano exacto de `roleAt`: no es una estimación paralela sino
 * `selectionVisibility`, la que devuelve el delta que `selectionValue` le va a
 * sumar o restar a tu valor de selección la temporada que viene. Una segunda
 * cuenta acá —«si la liga es chica, poné que no te ven»— sería una segunda
 * fuente de verdad sobre la misma pregunta, y el día que las bandas se muevan la
 * tarjeta estaría mintiendo justo en la columna que este renglón vino a agregar.
 *
 * La etapa entra porque el recargo del amateurismo ya cotiza la liga chica: al
 * amateur no se le puede decir que ahí no lo ven, porque lo que lo tapa es el
 * vínculo y se lo estaríamos cobrando dos veces en la pantalla.
 */
function scoutingAt(state: CaptainState, clubId: string | null): CaptainOption['scouting'] {
    const club = clubId ? getClub(clubId) : null;
    const { label, tone } = selectionVisibility(club ? sportingBandOf(club) : null, state.stage === 'amateur');
    return { label, tone };
}

/**
 * EL COSTO DE CADA LUGAR, EN UNA LÍNEA.
 *
 * El §4 del CLAUDE.md pide que el `hint` diga lo que resignás y no solo lo que
 * ganás, y en una mesa de cinco clubes lo que se resigna casi siempre es la
 * camiseta: el que mejor paga es el que te sienta. Por eso el rótulo del rol
 * viaja en `squadRole` —que la tarjeta dibuja como ficha— y esta frase dice lo
 * que la ficha no puede: qué significa ese lugar en el año que viene.
 */
const ROLE_HINT: Record<SquadRole, string> = {
    titular: 'Ahí entrás de arranque.',
    rotacion: 'Ahí alternás entre los quince y el banco.',
    banco: 'Ahí arrancás en el banco.',
    reserva: 'Ahí el año lo jugás en Intermedia.',
};

/**
 * EL NOMBRE VA COMPLETO, y `shortName` no se usa NUNCA en prosa.
 *
 * `shortName` lo genera `shortNameOf()` recortando el nombre a tres letras para
 * que entre en una celda de tabla: La Plata es "LAP" y Los Cedros es "LOS". En
 * una tarjeta de decisión eso daba «Pasarte a LAP» y «Quedarte en LOS», que no
 * es una abreviatura sino un código — el jugador no sabe a qué club se va.
 */
/**
 * EL COSTO DE FIRMAR NO ES EL MISMO DOS VECES.
 *
 * Dejar de ser jugador de tu club es la frase más cara del juego —el reglamento
 * URBA no te deja volver mientras dure el contrato— y le pasa al AMATEUR que da
 * el salto. Al que ya es profesional no le pasa: ya lo pagó, y lo suyo es
 * rescindir y firmar en otro lado.
 *
 * Estaba escrito en los dos casos porque la ventana se abría cada tanto y el
 * segundo casi no se veía. Con la mesa puesta todos los años, un profesional
 * leía cinco veces por temporada un costo que ya no tiene.
 */
/**
 * EL PLAZO EN PALABRAS. Una sola forma de decirlo en todo el archivo, porque
 * «1 años» en una tarjeta de decisión es de las cosas que el jugador no perdona.
 */
export function yearsLabel(years: number): string {
    return `${years} ${years === 1 ? 'año' : 'años'}`;
}

/**
 * EL COSTO DEL PLAZO, que es el que no se ve.
 *
 * El sueldo y el lugar en el plantel ya viajan como fichas. Lo que el plazo hace
 * y ninguna ficha dice es CERRAR EL MERCADO: firmar tres años es resignar tres
 * junios de mesa puesta. Se dice en una frase y solo cuando dura más de un año —
 * al contrato de un año no hay nada que advertirle.
 */
function plazoHint(years: number): string {
    return years > 1 ? ` No vas a volver a escuchar ofertas por ${yearsLabel(years)}.` : '';
}

function proHint(state: CaptainState, rol: SquadRole, years: number): string {
    return state.stage === 'professional'
        ? `${ROLE_HINT[rol]} Rescindís donde estás y firmás por ${yearsLabel(years)} allá.${plazoHint(years)}`
        : `${ROLE_HINT[rol]} Dejás de ser jugador de tu club: el reglamento no te deja volver mientras dure el contrato.${plazoHint(years)}`;
}

/**
 * EL ESCALÓN MÁS ALTO AL QUE LLEGA UN TRAIDOR.
 *
 * DERIVADO y no escrito: es el techo del salto al clásico leído con la misma
 * función que traduce cualquier valor a escalón. Escribir «Titular» a mano en la
 * tarjeta duraría hasta la próxima recalibración de `BELONGING_TIERS` —que ya
 * pasó una vez, en la 0.28.0, y movió los cinco pisos— y a partir de ahí la
 * pantalla prometería un castigo distinto del que el motor aplica.
 */
const TECHO_DEL_SALTO = BELONGING_TIERS
    .find((t) => t.id === belongingTier(BELONGING_CAP_RIVAL_JUMP))!.labelEs;

/**
 * LA ADVERTENCIA DEL CLÁSICO.
 *
 * El §4 del CLAUDE raíz pide que el `hint` diga lo que resignás, y no hay nada
 * en el juego que se resigne más caro que esto: la cuenta del club que dejás no
 * baja, se borra, y su techo no vuelve a subir ni volviendo ni ganando.
 *
 * Tiene que estar escrito ANTES de elegir. Un castigo de esta magnitud que se
 * entera después no es una decisión difícil: es una trampa, y el jugador tiene
 * razón en leerlo como un bug del juego.
 */
function clasicoHint(state: CaptainState, destinoId: string): string {
    const actual = state.player.clubId;
    if (!actual || !isRivalJump(actual, destinoId)) return '';
    return ` Es el clásico de ${getClub(actual).name}: lo que construiste ahí se borra, y si volvés no pasás de ${TECHO_DEL_SALTO}.`;
}

function optionForOffer(state: CaptainState, offer: ClubOffer, index: number): CaptainOption {
    const club = getClub(offer.clubId);
    const rol = roleAt(state, offer.clubId);

    if (offer.kind === 'professional') {
        return {
            id: `firmar-${index}`,
            label: `Firmar con ${club.name}`,
            clubId: offer.clubId,
            // El sueldo va por `salary` y NO repetido en el hint: la tarjeta lo
            // dibuja en grande y decirlo dos veces obligaría a mantener dos
            // copias del mismo número.
            salary: offer.salary,
            // El plazo SÍ se dice dos veces —ficha y hint— y no es un descuido:
            // la ficha dice cuántos años y el hint dice qué significan. Sin la
            // ficha, el plazo se lee como letra chica; sin la frase, tres años se
            // leen como tres veces la plata y no como tres junios sin mercado.
            contractYears: offer.years,
            squadRole: rol,
            scouting: scoutingAt(state, offer.clubId),
            hint: proHint(state, rol, offer.years) + clasicoHint(state, offer.clubId),
            outcomes: [
                {
                    weight: 70,
                    effect: { takeOffer: true, fame: 6, playingTime: -1 },
                    resultText: `Firmaste con ${club.name}. El primer año te costó entrar, pero entraste.`,
                },
                {
                    weight: 30,
                    effect: { takeOffer: true, fame: 3, playingTime: -2, body: 8 },
                    resultText: `Firmaste con ${club.name} y el salto te quedó grande. Entrenaste todo el año con los que no juegan.`,
                },
            ],
        };
    }

    return {
        id: `pasar-${index}`,
        label: `Pasarte a ${club.name}`,
        clubId: offer.clubId,
        squadRole: rol,
        scouting: scoutingAt(state, offer.clubId),
        // El hint YA NO DICE «un club más grande». Con el mercado abierto la mesa
        // trae clubes a tu altura, y varios de ellos son más chicos que el tuyo:
        // esa es justamente la oferta que le sirve al que no está jugando. Decir
        // «más grande» en los cinco renglones sería falso en la mitad.
        hint: `${ROLE_HINT[rol]} La Pertenencia arranca de cero y en el tuyo lo van a sentir.${clasicoHint(state, offer.clubId)}`,
        outcomes: [
            {
                weight: 65,
                effect: { takeOffer: true, playingTime: 1 },
                resultText: `Te fichaste en ${club.name}. Te ganaste el lugar desde la pretemporada.`,
            },
            {
                weight: 35,
                effect: { takeOffer: true, playingTime: -1 },
                resultText: `Te fichaste en ${club.name} y te costó entrar en el grupo. Hay que ganárselo otra vez.`,
            },
        ],
    };
}

/**
 * La tarjeta de mercado de esta temporada, o `null` si no hay nada sobre la
 * mesa. Nunca devuelve una decisión de una sola opción: quedarse siempre es una
 * de las opciones, y siempre es la última.
 */
export function buildMarketEvent(state: CaptainState): CaptainEvent | null {
    if (state.offers.length === 0) return null;

    const hayProfesional = state.offers.some((o) => o.kind === 'professional');
    const club = state.player.clubId ? getClub(state.player.clubId) : null;
    const rolActual = roleAt(state, state.player.clubId);

    // EL SALTO SE PAGA UNA VEZ, y quién lo tiene por delante lo decide TU ETAPA
    // y no la clase de las ofertas. Colgado de `hayProfesional`, al que ya era
    // profesional le decía «otro año amateur» todos los junios.
    const daElSalto = hayProfesional && state.stage === 'amateur';

    // ── LA RENOVACIÓN, QUE ES LA OTRA MITAD DE UN MERCADO CON PLAZOS ────────
    //
    // Si sos profesional y estás parado en un club profesional, tu contrato se
    // vence —la mesa no se pone de otra manera, `generateOffers` la cierra
    // mientras corra— así que «quedarte» no existe como tal: o firmás de nuevo o
    // te vas. Por eso la última opción cambia de verbo en vez de sumarse una
    // sexta: dos opciones para el mismo club («quedarme» y «renovar») serían la
    // misma decisión escrita dos veces, y el jugador tendría que adivinar en qué
    // se diferencian.
    //
    // Los términos salen de `renewalFor`, la misma cuenta que produjo las ofertas
    // de enfrente, corrida con tu media de HOY: por eso el que creció renueva por
    // más y el que se cayó renueva por menos, sin una sola regla propia.
    const renovacion = state.player.clubId
        ? renewalFor(state.player, state.player.clubId, state.season)
        : null;

    const quedarse: CaptainOption = renovacion && club
        ? {
            id: 'quedarte',
            label: `Renovar con ${club.name}`,
            clubId: club.id,
            salary: renovacion.salary,
            contractYears: renovacion.years,
            squadRole: rolActual,
            scouting: scoutingAt(state, club.id),
            hint: `${ROLE_HINT[rolActual]} Seguís donde estás por ${yearsLabel(renovacion.years)}.${plazoHint(renovacion.years)}`,
            outcomes: [
                {
                    weight: 100,
                    effect: { renew: true, belonging: 3 },
                    resultText: `Renovaste con ${club.name}. En el buffet se enteraron de las otras ofertas y de que las rechazaste.`,
                },
            ],
        }
        : {
            id: 'quedarte',
            label: club ? `Quedarte en ${club.name}` : 'Quedarte donde estás',
            clubId: state.player.clubId ?? undefined,
            // QUEDARSE TAMBIÉN TIENE UN LUGAR, y esa es media decisión. Sin la
            // ficha acá, las cinco ofertas mostraban dónde caerías y la sexta
            // opción —la que la mayoría elige— no decía nada: el jugador
            // comparaba cinco futuros contra un presente que tenía que acordarse
            // de memoria.
            squadRole: rolActual,
            scouting: scoutingAt(state, state.player.clubId),
            hint: daElSalto
                ? `${ROLE_HINT[rolActual]} Otro año amateur: la franquicia no llama dos veces, salvo que la rompas.`
                : `${ROLE_HINT[rolActual]} Otro año con los tuyos, y suma Pertenencia.`,
            outcomes: [
                { weight: 100, effect: { belonging: 3 }, resultText: club ? `Te quedaste en ${club.name}. En el buffet se enteraron de la oferta y de que la rechazaste.` : 'Te quedaste donde estabas.' },
            ],
        };

    // LA MESA DE VARIOS TIENE SU PROPIA VOZ, y no es un detalle de copia: una
    // tarjeta que dice «un club preguntó por vos» arriba de cuatro escudos se
    // lee como un bug. El número sale de las ofertas y no de una constante, así
    // que subir `OPEN_MARKET_OFFERS` no deja este texto viejo.
    const varias = state.offers.length > 1;

    // ── EL RENGLÓN QUE HACE HONESTA A LA FICHA ──────────────────────────────
    // La ficha de cada opción dice un lugar en el plantel, y ese lugar sale de
    // tu media de HOY. La temporada que viene vas a haber crecido, o el club va
    // a haber ascendido, así que es una proyección y no una promesa. Decirlo una
    // vez en la tarjeta cuesta un renglón; no decirlo convierte cualquier
    // desajuste en una mentira del juego.
    const proyeccion = ' El lugar que dice cada oferta es el que te tocaría hoy con tu media.';

    // EL TÍTULO LO MANDA EL PAPEL QUE SE VENCE, no la cantidad de escudos. Para
    // el que ya es profesional esta pantalla no es una noticia del mercado: es el
    // junio en que se le termina el contrato, que es la única razón por la que
    // está viéndola. Nombrarlo «Se abrió el mercado» contaba el mundo desde
    // afuera justo el año en que el jugador lo vive desde adentro.
    const renueva = renovacion !== null;

    return {
        id: MARKET_EVENT_ID,
        category: 'mercado',
        title: renueva
            ? 'Se te vence el contrato'
            : hayProfesional
                ? (varias ? 'Se abrió el mercado' : 'Te llaman de la franquicia')
                : (varias ? 'Te quieren de varios clubes' : 'Te quieren de otro club'),
        text: (daElSalto
            ? `Hay ${varias ? `${state.offers.length} clubes` : 'un club'} sobre la mesa: entrenás todos los días, viajás y te ven los seleccionadores. Cada uno con su plazo, y mientras dure no vas a poder volver — el reglamento no te deja jugar en tu club con un contrato firmado.`
            : renueva
                ? `Se te termina el papel. ${club?.name ?? 'Tu club'} te ofrece renovar y hay ${varias ? `${state.offers.length} clubes` : 'un club'} esperando la respuesta. Lo que cambia es dónde jugás, cuánto cobrás y por cuánto tiempo.`
                : hayProfesional
                    ? `Hay ${varias ? `${state.offers.length} clubes` : 'un club'} sobre la mesa, cada uno con su sueldo y su plazo. Lo que cambia es dónde jugás y cuánto cobrás.`
                    : varias
                        ? `Preguntaron por vos de ${state.offers.length} clubes. El pase es un trámite, pero la cara de los tuyos no.`
                        : 'Otro club preguntó por vos. El pase es un trámite, pero la cara de los tuyos no.')
            + proyeccion,
        weight: 100,
        repeatable: true,
        options: [...state.offers.map((offer, i) => optionForOffer(state, offer, i)), quedarse],
    };
}

/**
 * Volver al club de origen. Aparece cuando sos profesional y ya no sos el que
 * eras, o cuando el club te llama.
 *
 * Es reglamento real, no licencia poética: el régimen de pases de la URBA
 * exceptúa del cupo a los jugadores que regresan a su club de origen. El
 * sistema premia el retorno y el juego lo copia.
 *
 * ── Y ES EL ÚLTIMO CAPÍTULO, QUE ES LO QUE EL TEXTO SIEMPRE DIJO ────────────
 * «Terminar donde empezaste» no terminaba nada: se volvía, y el mercado seguía
 * poniendo la mesa todos los junios hasta el tope duro del puesto. Ahora la
 * opción lleva `farewell`, que cierra las dos puntas —no hay más ofertas y la
 * temporada que viene es la última— y el `hint` lo dice antes de que la elijas.
 * Una decisión que no avisa que es la última no es una decisión.
 */
export function buildReturnEvent(state: CaptainState): CaptainEvent | null {
    if (!state.homeClubId || state.player.clubId === state.homeClubId) return null;
    const home = getClub(state.homeClubId);

    return {
        id: RETURN_EVENT_ID,
        category: 'mercado',
        title: 'Te llaman de tu club',
        text: `En ${home.name} te preguntan si querés terminar donde empezaste. No hay contrato ni plata: hay una camiseta, un lugar en el vestuario de siempre y una temporada para despedirte.`,
        weight: 100,
        repeatable: true,
        options: [
            {
                id: 'volver',
                label: `Volver a ${home.name}`,
                clubId: state.homeClubId,
                hint: 'Recuperás la Pertenencia que dejaste. Se termina la plata y jugás una última temporada: te retirás ahí.',
                outcomes: [
                    { weight: 100, effect: { returnHome: true, farewell: true, fame: -2 }, resultText: `Volviste a ${home.name} para la última. El primer sábado la cancha estaba llena y no era por el partido.` },
                ],
            },
            {
                id: 'todavia-no',
                label: 'Todavía no',
                clubId: state.player.clubId ?? undefined,
                hint: 'Seguís donde estás. El club va a volver a preguntar.',
                outcomes: [
                    { weight: 100, effect: {}, resultText: 'Dijiste que todavía te quedaba algo por hacer afuera.' },
                ],
            },
        ],
    };
}
