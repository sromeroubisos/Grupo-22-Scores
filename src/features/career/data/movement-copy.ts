// Copys de mercado por `MovementKind`. FUENTE ÚNICA del texto del pase, para que
// motor, evento y UI digan siempre lo mismo. Regla dura (UAR): un club amateur
// NO "firma contrato" ni "ofrece salario" — se hace un PASE. Solo los clubes
// profesionales firman contrato. Sin números internos.

import type { MovementKind } from '../types/career.ts';
import type { ClubTenure } from '../engine/club-tenure.ts';

/** Etiqueta corta del vínculo/movimiento (para chips e hitos). */
export const MOVEMENT_LABELS: Readonly<Record<MovementKind, string>> = {
    stay: 'Seguir',
    'amateur-pass': 'Pase',
    'inter-union-pass': 'Pase interuniones',
    'international-pass': 'Pase internacional',
    'development-invite': 'Academia',
    'semi-pro-agreement': 'Acuerdo semipro',
    'professional-contract': 'Contrato profesional',
};

export interface MovementOptionCopy {
    label: string;
    hint: string;
}

/** Femenino, para contar temporadas. "Una más" se lee; "1 más" se cuenta. */
const SEASONS_AWAY = ['Cero', 'Una', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];

/**
 * Hint de "seguir en el club": dice QUÉ ESTÁ CONSTRUYENDO, no una abstracción.
 *
 * Enfrente hay dos ofertas con club, liga, escalón y motivo. Contra eso,
 * "Fidelidad y estabilidad" no compite: es una virtud, no un progreso. El
 * jugador tiene que poder ver que quedarse también avanza hacia algo.
 */
export function stayHint(tenure: ClubTenure): string {
    const season = `Tu ${tenure.current}ª temporada en el club.`;
    if (tenure.next === null) {
        return `${season} Ya sos ${tenure.tier ? tenure.tier.label.toLowerCase() : 'parte de la casa'} acá.`;
    }
    const away = SEASONS_AWAY[tenure.next.seasonsAway] ?? String(tenure.next.seasonsAway);
    return `${season} ${away} más para ser ${tenure.next.tier.label.toLowerCase()}.`;
}

/**
 * Texto de la opción de decisión para un movimiento concreto. `tenure` solo se
 * usa en `stay`: sin él la opción cae al texto genérico de siempre.
 */
export function movementOptionCopy(
    kind: MovementKind,
    clubName: string,
    roleLabel: string,
    tenure?: ClubTenure,
): MovementOptionCopy {
    switch (kind) {
        case 'amateur-pass':
            return { label: `Pasarte a ${clubName}`, hint: `Cambiar de club · ${roleLabel}` };
        case 'inter-union-pass':
            return { label: `Hacer el pase a ${clubName}`, hint: `Cambiar de unión · ${roleLabel}` };
        case 'international-pass':
            return { label: `Mudarte y jugar en ${clubName}`, hint: `Pase internacional · ${roleLabel}` };
        case 'development-invite':
            return { label: `Sumarte a la academia de ${clubName}`, hint: `Lugar de desarrollo · ${roleLabel}` };
        case 'semi-pro-agreement':
            return { label: `Acordar tu incorporación a ${clubName}`, hint: `Acuerdo semiprofesional · ${roleLabel}` };
        case 'professional-contract':
            return { label: `Firmar con ${clubName}`, hint: `Contrato profesional · ${roleLabel}` };
        case 'stay':
        default:
            return {
                label: `Seguir en ${clubName}`,
                hint: tenure ? stayHint(tenure) : 'Fidelidad y estabilidad.',
            };
    }
}

/** Etiqueta del movimiento en el escalafón de mercado. */
export const DIRECTION_LABELS: Readonly<Record<'up' | 'down' | 'lateral', string>> = {
    up: 'Subís un escalón',
    down: 'Bajás un escalón',
    lateral: 'Mismo escalón',
};

/**
 * Señales que explican POR QUÉ llegó una oferta. El motor ya las calcula
 * (`scorePathwayCandidate`: rendís por encima de tu club, titularidad, forma,
 * proyección) pero nunca las mostraba: el mérito relativo era una caja negra.
 */
export interface OfferSignals {
    /** Rinde por encima del nivel de su propio club. */
    outperformsClub: boolean;
    /** Temporadas consecutivas como titular. */
    starterSeasons: number;
    /** Viene en racha. */
    hot: boolean;
    /** El club de su país lo quiere de vuelta. */
    homecoming: boolean;
    /** Entró por una vía migratoria: lo vienen siguiendo de afuera. */
    pathway: boolean;
    /** Joven con techo por delante. */
    youngProspect: boolean;
}

/**
 * CUÁL es la razón más fuerte, como dato. La frase sale de acá (abajo) y también
 * la traducción: si la capa de idioma tuviera que deducirla del texto en español,
 * un motivo nuevo aparecería sin traducir y nadie se enteraría.
 */
export type OfferReasonKey =
    | 'outperformsClub'
    | 'starterSeasons'
    | 'homecoming'
    | 'pathway'
    | 'hot'
    | 'youngProspect';

/**
 * La razón MÁS FUERTE. Se elige una sola: dos o tres motivos juntos convierten la
 * tarjeta en un informe y dejan de leerse.
 */
export function offerReasonKey(s: OfferSignals): OfferReasonKey | null {
    if (s.outperformsClub) return 'outperformsClub';
    if (s.starterSeasons >= 2) return 'starterSeasons';
    if (s.homecoming) return 'homecoming';
    if (s.pathway) return 'pathway';
    if (s.hot) return 'hot';
    if (s.youngProspect) return 'youngProspect';
    return null;
}

/** La misma razón, ya escrita en una línea. */
export function offerReason(s: OfferSignals): string | null {
    switch (offerReasonKey(s)) {
        case 'outperformsClub': return 'Venís rindiendo por encima de tu club';
        case 'starterSeasons': return `Sos titular hace ${s.starterSeasons} temporadas`;
        case 'homecoming': return 'Te quieren de vuelta en casa';
        case 'pathway': return 'Te vienen siguiendo desde afuera';
        case 'hot': return 'Venís en racha';
        case 'youngProspect': return 'Les interesa tu proyección';
        default: return null;
    }
}

/** Frase de resultado al concretar el movimiento (para el revelado). */
export function movementResultText(kind: MovementKind, clubName: string): string {
    switch (kind) {
        case 'amateur-pass':
        case 'inter-union-pass':
            return `Hacés el pase a ${clubName}. Nuevo club, nuevos compañeros.`;
        case 'international-pass':
            return `Te mudás y empezás de cero en ${clubName}.`;
        case 'development-invite':
            return `Entrás a la academia de ${clubName} a pelear un lugar.`;
        case 'semi-pro-agreement':
            return `Acordás tu incorporación a ${clubName}.`;
        case 'professional-contract':
            return `Firmás por ${clubName}. Borrón y cuenta nueva.`;
        case 'stay':
        default:
            return `Seguís en ${clubName}.`;
    }
}
