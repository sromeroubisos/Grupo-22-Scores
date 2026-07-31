// EL CAPITÁN — cabeza y cuerpo.
//
// El reloj real de la carrera, y lo que hace que este juego no pueda ser El
// Ídolo con tries. Los números que lo justifican: 76 lesiones por 1.000 horas
// de juego —unas 47 por club y temporada—, severidad media de 38 días, el
// tackle causando el 50% de todas, y la conmoción como lesión número uno con el
// 24% del total.
//
// ── Por qué dos contadores y no uno ──
// Porque la evidencia los separa. El estudio prospectivo en Brain (2025), con
// 200 ex jugadores de élite contra 33 controles, encontró que la carga de
// síntomas correlacionó con el NÚMERO DE CONMOCIONES auto-reportadas, no con la
// duración de la carrera. El neuropatológico de Glasgow encontró que cada año
// adicional de carrera sube el riesgo un 14%. Dos causas distintas, dos
// horizontes distintos, dos cuentas.
//
// ── La regla que no se negocia ──
// 🧠 SUBE Y NO BAJA. Nunca, por ningún camino. No está garantizado por la
// disciplina de quien escriba el próximo evento: está garantizado acá, con un
// `Math.max` que hace imposible que un delta negativo o un bug de signo la
// muevan para atrás. Hay un test que lo prueba pasándole números negativos.
//
// Y el efecto a largo plazo NO ES DETERMINISTA. Con 🧠 alto sube la chance de
// un epílogo difícil; nunca es seguro, porque en la vida real tampoco lo es: en
// ese mismo estudio la cognición de los ex jugadores a los 44 años era
// prácticamente normal y no hubo un solo caso de CTE probable. Lo que sí estaba
// muy elevado era la salud mental —depresión clínica en 28,5% contra 3,1%—, y
// eso es lo que el epílogo tiene que poder contar, sin melodrama.

import { BODY_MAX, BODY_MIN, HEAD_MAX, HEAD_PER_HIA } from '../types/currencies.ts';
import type { DamageLedger } from '../types/currencies.ts';

/** Un cuerpo entero y una cabeza sin golpes. */
export function emptyDamage(): DamageLedger {
    return { cabeza: 0, cuerpo: 0, hia: 0 };
}

/**
 * Suma HIA positivos. MONÓTONA: el resultado nunca es menor que el anterior.
 *
 * `hits` negativo o cero no hace nada. No es tolerancia a datos malos: es que
 * bajar esta cuenta no tiene sentido físico y no queremos que exista el camino.
 */
export function addHeadDamage(damage: DamageLedger, hits = 1): DamageLedger {
    if (hits <= 0) return damage;
    const cabeza = Math.min(HEAD_MAX, Math.max(damage.cabeza, damage.cabeza + hits * HEAD_PER_HIA));
    return { ...damage, cabeza, hia: damage.hia + hits };
}

/**
 * Mueve el desgaste físico. Este SÍ puede bajar: el descanso, la kinesiología y
 * un buen aguante lo aflojan. Acotado a [0, 100].
 */
export function addBodyDamage(damage: DamageLedger, delta: number): DamageLedger {
    if (delta === 0) return damage;
    const cuerpo = Math.min(BODY_MAX, Math.max(BODY_MIN, damage.cuerpo + delta));
    return { ...damage, cuerpo: Math.round(cuerpo * 1000) / 1000 };
}
