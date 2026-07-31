import type { Injury, Player } from '../types/player.ts';
import type { Rng } from './random.ts';

const CATALOG: { name: string; severity: Injury['severity']; seasonsOut: number; ovrImpact: number; weight: number }[] = [
    { name: 'Esguince de tobillo', severity: 'leve', seasonsOut: 0.12, ovrImpact: 1, weight: 30 },
    { name: 'Desgarro isquiotibial', severity: 'leve', seasonsOut: 0.2, ovrImpact: 2, weight: 24 },
    { name: 'Hombro luxado', severity: 'moderada', seasonsOut: 0.35, ovrImpact: 3, weight: 16 },
    { name: 'Fisura de costilla', severity: 'moderada', seasonsOut: 0.3, ovrImpact: 3, weight: 12 },
    { name: 'Rotura de ligamentos de rodilla', severity: 'grave', seasonsOut: 0.75, ovrImpact: 6, weight: 6 },
    { name: 'Conmoción reiterada', severity: 'grave', seasonsOut: 0.55, ovrImpact: 5, weight: 5 },
    { name: 'Tendón de Aquiles', severity: 'grave', seasonsOut: 0.8, ovrImpact: 7, weight: 3 },
];

/**
 * Probabilidad de lesión en la temporada. Sube con fatiga, edad, riesgo propio
 * y con la cantidad de lesiones graves previas (fragilidad acumulada).
 */
export function seasonInjuryChance(player: Player): number {
    const { fatigue, injuryRisk } = player.dynamics;
    // Dos rampas: la del desgaste normal desde los 28 y una SEGUNDA, más
    // empinada, desde los 34. Es el precio de estirar la carrera: a partir de
    // que el retiro es una elección, seguir un año más tiene que costar algo
    // concreto, y en rugby ese algo es la lesión, no el aburrimiento.
    const ageFactor = Math.max(0, player.age - 28) * 0.010
        + Math.max(0, player.age - 33) * 0.022;
    const severePast = player.injuries.filter((i) => i.severity === 'grave').length * 0.03;
    const base = 0.10 + injuryRisk * 0.0035 + fatigue * 0.0025 + ageFactor + severePast;
    return Math.min(0.75, base);
}

/** Tira una posible lesión para la temporada. Muta player.injuries si ocurre. */
export function rollInjury(player: Player, rng: Rng, riskOverride?: number): Injury | null {
    // `riskOverride` llega del modelo de carga (environment.ts). El cálculo
    // propio queda como referencia para tests y para llamadas sin entorno.
    if (!rng.chance(riskOverride ?? seasonInjuryChance(player))) return null;

    const template = rng.weighted(CATALOG, (c) => c.weight);
    const injury: Injury = {
        season: player.seasonsPlayed,
        age: player.age,
        name: template.name,
        severity: template.severity,
        seasonsOut: template.seasonsOut,
        ovrImpact: template.ovrImpact,
    };
    player.injuries.push(injury);

    // Una lesión grave deja secuela: sube el riesgo base de por vida.
    if (injury.severity === 'grave') {
        player.dynamics.injuryRisk = Math.min(100, player.dynamics.injuryRisk + 8);
    } else if (injury.severity === 'moderada') {
        player.dynamics.injuryRisk = Math.min(100, player.dynamics.injuryRisk + 3);
    }

    return injury;
}
