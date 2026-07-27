// Copys de mercado por `MovementKind`. FUENTE ÚNICA del texto del pase, para que
// motor, evento y UI digan siempre lo mismo. Regla dura (UAR): un club amateur
// NO "firma contrato" ni "ofrece salario" — se hace un PASE. Solo los clubes
// profesionales firman contrato. Sin números internos.

import type { MovementKind } from '../types/career.ts';

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

/** Texto de la opción de decisión para un movimiento concreto. */
export function movementOptionCopy(
    kind: MovementKind,
    clubName: string,
    roleLabel: string,
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
            return { label: `Seguir en ${clubName}`, hint: 'Fidelidad y estabilidad.' };
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
 * La razón MÁS FUERTE, en una línea. Se muestra una sola: dos o tres motivos
 * juntos convierten la tarjeta en un informe y dejan de leerse.
 */
export function offerReason(s: OfferSignals): string | null {
    if (s.outperformsClub) return 'Venís rindiendo por encima de tu club';
    if (s.starterSeasons >= 2) return `Sos titular hace ${s.starterSeasons} temporadas`;
    if (s.homecoming) return 'Te quieren de vuelta en casa';
    if (s.pathway) return 'Te vienen siguiendo desde afuera';
    if (s.hot) return 'Venís en racha';
    if (s.youngProspect) return 'Les interesa tu proyección';
    return null;
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
