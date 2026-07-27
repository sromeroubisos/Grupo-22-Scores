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
