// EL CAPITÁN — QUÉ TE DEJÓ LA DECISIÓN.
//
// Una decisión pasaba y la pantalla la contaba con una frase de crónica: el
// jugador leía «el referee levantó el brazo» y nunca se enteraba de que eso eran
// tres fechas de suspensión. El desenlace es el momento en que el juego tiene
// que rendir cuentas de lo que acaba de pasar, y hasta acá era la tarjeta más
// chica de todas.
//
// ── Por qué se DIFERENCIAN DOS ESTADOS y no se lee el efecto ─────────────────
// El camino corto sería leer el `CaptainEffect` del desenlace sorteado y
// dibujarlo. No sirve, y no por comodidad: el efecto es lo que la decisión
// PIDIÓ, no lo que el motor concedió. Entre uno y otro están el techo del
// potencial (`applyAttrs` recorta), la puerta de la plata (`money.ts` ignora el
// delta si sos amateur), el techo de la Pertenencia y su amortiguación, y el
// tope de la fama. Una tarjeta que dibujara el efecto prometería +3 de media a
// un jugador que ya está en su techo y no movió un punto.
//
// Diferenciando el estado de antes y el de después, la pantalla no puede mentir:
// muestra lo que de verdad cambió. Es la misma disciplina que el §3.1 del
// CLAUDE.md de Carrera —una decisión no puede prometer una cosa y hacer otra—
// aplicada del otro lado del reloj.
//
// ── Qué se puede diferenciar y qué no ───────────────────────────────────────
// La acción `CHOOSE` aplica el efecto y cierra la temporada (envejece y abre la
// pretemporada). Lo que ese cierre toca —`season`, `age`, `training`, `matches`—
// no se mira acá. Lo que el efecto toca no lo toca el cierre, así que la resta
// es limpia. El crecimiento por temporada vive en `simulate-season` y ya pasó
// antes de esta tarjeta: la media que se mueve acá la movió la decisión.
//
// ── Presentación, no motor ──────────────────────────────────────────────────
// Nada de esto se persiste ni entra en el `stateHash`: es la voz de la pantalla,
// igual que `headline()` en `SeasonResult`. Por eso vive en `app/` y no en
// `features/captain/engine/`, y por eso el nombre del club ENTRA POR PARÁMETRO:
// así el módulo no importa el catálogo y se puede probar solo.

import type { CaptainState } from '@/features/captain';

export type ImpactTone = 'up' | 'down';

export interface ImpactChip {
    key: string;
    /** Decorativo: la ficha se entiende entera sin él (va con `aria-hidden`). */
    icon: string;
    label: string;
    value: string;
    tone: ImpactTone;
}

export interface DecisionImpact {
    /** El veredicto en una línea. Sale del cambio real, así que no puede mentir. */
    headline: string;
    /** Lo que se movió, en orden de qué pesa más en una carrera. */
    chips: ImpactChip[];
    /** El club al que te fuiste, cuando la decisión te movió. */
    movedToClubId: string | null;
}

/** Con signo, siempre: un `+2` y un `2` no cuentan lo mismo. */
function signo(n: number): string {
    return n > 0 ? `+${n}` : String(n);
}

/** Separador de miles a mano: `toLocaleString` depende del entorno. */
function miles(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fechas(n: number): string {
    return n === 1 ? '1 fecha' : `${n} fechas`;
}

function escalones(n: number): string {
    const abs = Math.abs(n);
    return `${signo(n)} ${abs === 1 ? 'escalón' : 'escalones'}`;
}

/**
 * Lo que la decisión le hizo a la carrera, restando el estado de después menos
 * el de antes.
 *
 * `clubName` lo trae la pantalla: acá se decide QUÉ se dice, no cómo se llama un
 * club.
 */
export function decisionImpact(
    antes: CaptainState,
    despues: CaptainState,
    clubName: (clubId: string) => string,
): DecisionImpact {
    const chips: ImpactChip[] = [];

    const clubAntes = antes.player.clubId;
    const clubDespues = despues.player.clubId;
    const sePaso = clubDespues !== null && clubDespues !== clubAntes;

    const media = despues.player.ovr - antes.player.ovr;
    const tiempo = despues.pendingPlayingTime - antes.pendingPlayingTime;
    const lesion = despues.pendingInjury - antes.pendingInjury;
    const sancion = despues.pendingSanction - antes.pendingSanction;
    const planilla = despues.pendingStatBoost - antes.pendingStatBoost;
    const cartel = Math.round((despues.fame - antes.fame) * 10) / 10;
    const plata = despues.money - antes.money;
    const cabeza = despues.damage.cabeza - antes.damage.cabeza;
    const cuerpo = despues.damage.cuerpo - antes.damage.cuerpo;
    const hia = despues.damage.hia - antes.damage.hia;

    /* La Pertenencia se mide SIEMPRE SOBRE EL CLUB DE ANTES, incluso cuando la
       decisión te movió, y por dos razones que apuntan al mismo lado:

       · Es donde el efecto aterrizó. `applyEffect` aplica el delta de
         Pertenencia ANTES de resolver el pase, así que la cuenta que se movió es
         la del club que dejás — que es exactamente lo que la opción prometía
         cuando decía «en el tuyo lo van a sentir».
       · Restar la del club nuevo contra la del viejo serían dos cuentas
         distintas: se lleva por club y no se lleva puesta, así que irse a un club
         donde nunca jugaste mostraría un «-40» que no le pasó a nadie. */
    const pertenencia = clubAntes
        ? Math.round((despues.belonging.byClub[clubAntes] ?? 0) - (antes.belonging.byClub[clubAntes] ?? 0))
        : 0;

    // El orden es el de la jerarquía del §3.1: primero lo que te sube o te baja
    // como jugador, después lo que te saca de la cancha, y al final el cuerpo y
    // el entorno.
    if (media !== 0) {
        chips.push({ key: 'media', icon: '⭐', label: 'Media', value: signo(media), tone: media > 0 ? 'up' : 'down' });
    }

    if (tiempo !== 0) {
        chips.push({
            key: 'tiempo',
            icon: '🕒',
            label: 'Tiempo de juego',
            value: escalones(tiempo),
            tone: tiempo > 0 ? 'up' : 'down',
        });
    }

    if (lesion > 0) {
        chips.push({ key: 'lesion', icon: '🩹', label: 'Afuera', value: fechas(lesion), tone: 'down' });
    }

    if (sancion > 0) {
        chips.push({ key: 'sancion', icon: '🚫', label: 'Suspensión', value: fechas(sancion), tone: 'down' });
    }

    if (planilla !== 0) {
        chips.push({
            key: 'planilla',
            icon: '📈',
            label: 'Planilla',
            value: signo(planilla),
            tone: planilla > 0 ? 'up' : 'down',
        });
    }

    if (pertenencia !== 0) {
        chips.push({
            key: 'pertenencia',
            icon: '💙',
            label: 'Pertenencia',
            value: signo(pertenencia),
            tone: pertenencia > 0 ? 'up' : 'down',
        });
    }

    if (cartel !== 0) {
        chips.push({ key: 'cartel', icon: '🌟', label: 'Cartel', value: signo(cartel), tone: cartel > 0 ? 'up' : 'down' });
    }

    // La cabeza se cuenta en HIA cuando hubo uno: es la unidad con la que el
    // jugador la ve en su ficha. El puntaje crudo queda para los golpes que no
    // pasaron por el protocolo.
    if (hia > 0) {
        chips.push({ key: 'hia', icon: '🧠', label: 'HIA', value: signo(hia), tone: 'down' });
    } else if (cabeza !== 0) {
        chips.push({ key: 'cabeza', icon: '🧠', label: 'Cabeza', value: signo(cabeza), tone: 'down' });
    }

    if (cuerpo !== 0) {
        chips.push({ key: 'cuerpo', icon: '🦴', label: 'Cuerpo', value: signo(cuerpo), tone: cuerpo > 0 ? 'down' : 'up' });
    }

    // La plata va última y sólo existe siendo profesional: `money.ts` ignora el
    // delta en amateur, así que acá el cero no hay que filtrarlo a mano.
    if (plata !== 0) {
        chips.push({
            key: 'plata',
            icon: '💵',
            label: 'Plata',
            value: `${plata > 0 ? '+' : '-'}US$ ${miles(Math.abs(plata))}`,
            tone: plata > 0 ? 'up' : 'down',
        });
    }

    return {
        headline: titular({
            antes,
            despues,
            sePaso,
            clubDespues,
            clubName,
            media,
            tiempo,
            lesion,
            sancion,
            pertenencia,
            cartel,
            hia,
        }),
        chips,
        movedToClubId: sePaso ? clubDespues : null,
    };
}

/**
 * El veredicto, en una línea.
 *
 * Cadena de `if` deliberadamente aburrida y sin azar, igual que el titular del
 * año: la misma decisión tiene que dar el mismo titular siempre. El orden es el
 * de qué manda en una carrera —se terminó, te fuiste, te rompiste, te
 * suspendieron— y recién después lo que te movió como jugador.
 *
 * Cuando nada medible se movió, el titular vuelve a ser el rótulo de siempre: la
 * decisión fue de relato y la frase de abajo la cuenta entera. Es la única
 * respuesta honesta — inventar un veredicto donde no lo hubo es exactamente lo
 * que este módulo existe para no hacer.
 */
function titular(d: {
    antes: CaptainState;
    despues: CaptainState;
    sePaso: boolean;
    clubDespues: string | null;
    clubName: (clubId: string) => string;
    media: number;
    tiempo: number;
    lesion: number;
    sancion: number;
    pertenencia: number;
    cartel: number;
    hia: number;
}): string {
    if (d.despues.player.retired && !d.antes.player.retired) return 'Se terminó acá';

    if (d.despues.stage === 'professional' && d.antes.stage === 'amateur') {
        return 'Firmaste tu primer contrato';
    }

    if (d.sePaso && d.clubDespues) return `Te vas a ${d.clubName(d.clubDespues)}`;

    if (d.sancion > 0) return `Te comés ${fechas(d.sancion)}`;
    if (d.lesion > 0) return 'Te rompiste';
    if (d.hia > 0) return 'Otro golpe en la cabeza';

    if (d.media >= 2) return 'Pegaste un salto';
    if (d.media <= -2) return 'Lo pagaste con la media';

    if (d.tiempo > 0) return 'Te ganaste el puesto';
    if (d.tiempo < 0) return 'Perdés lugar en el equipo';

    if (d.pertenencia >= 5) return 'El club te lo reconoce';
    if (d.pertenencia <= -5) return 'Te ganaste una bronca en el club';

    if (d.media > 0) return 'Algo sumaste';
    if (d.media < 0) return 'Algo te costó';

    if (d.cartel >= 2) return 'Se habla de vos';

    return 'Lo que dejó la decisión';
}
