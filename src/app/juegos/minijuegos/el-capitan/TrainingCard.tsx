'use client';

import type { CaptainState, TrainingDef } from '@/features/captain';
import {
    ATTRIBUTE_LABEL,
    POTENTIAL_BAND,
    TRAINING_CEILING,
    getFamily,
    trainingsFor,
} from '@/features/captain';
import styles from './capitan.module.css';

/**
 * La carta de pretemporada: cuatro entrenamientos, elegís uno.
 *
 * Reemplaza al reparto de las seis fichas. La diferencia de forma es la que
 * importa: no hay botón de confirmar ni estado intermedio que administrar —cada
 * opción ES el botón, igual que en una tarjeta de decisión— así que tampoco hay
 * un deshabilitado que explicar (CLAUDE.md §6).
 *
 * Los cuatro entrenamientos salen del catálogo de TU familia, y por eso hablan
 * de tu puesto: el pilar ve la máquina de scrum y el wing ve el pique.
 *
 * ── Por qué el costo se dibuja y no solo se cuenta en el hint ──
 * Porque las cuatro ya no reparten lo mismo. Elegir entre "+3 Liderazgo, gratis"
 * y "+6 Empuje +2 Choque, y lo pagás" es una decisión; elegir entre dos frases
 * que suenan parecido es adivinar. El ⚠️ de El Ídolo funciona porque cumple lo
 * que amenaza, y para cumplirlo primero tiene que estar a la vista.
 */
export default function TrainingCard({
    state,
    onChoose,
}: {
    state: CaptainState;
    onChoose: (trainingId: string) => void;
}) {
    const opciones = trainingsFor(state.player.family);
    const familia = getFamily(state.player.family);

    // Pasado el pico, `aging` ya no suma nada a `built`, y una carta que
    // prometiera techo ahí estaría mintiendo — así que la línea desaparece en
    // vez de mostrar una flecha que no se va a cumplir.
    const seConstruye = state.player.age <= familia.age.peak[1];

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>
                Temporada {state.season} · {state.player.age} años · {familia.labelEs}
            </span>
            <h2 className={styles.cardTitle}>La pretemporada</h2>
            <p className={styles.cardText}>
                Elegís una cosa para trabajar todo el año. Lo que no elegís, no se entrena.
            </p>

            <div className={styles.options} role="group" aria-label="Entrenamiento de la pretemporada">
                {opciones.map((t, i) => (
                    <button
                        key={t.id}
                        type="button"
                        className={styles.option}
                        // El número del atajo. Va como dato y no como texto: la
                        // tecla la resuelve el orquestador, y así la tarjeta no
                        // tiene que saber nada del teclado.
                        data-choice={i + 1}
                        onClick={() => onChoose(t.id)}
                    >
                        <span className={styles.optionKey} aria-hidden="true">{i + 1}</span>
                        <span className={styles.optionLabel}>{t.labelEs}</span>

                        <span className={styles.trainingGain}>
                            {t.gain.map((g) => (
                                <span key={g.attr} className={styles.trainingChip}>
                                    +{g.points} {ATTRIBUTE_LABEL[g.attr]}
                                </span>
                            ))}
                        </span>

                        {seConstruye && aporteDeTecho(state, t) >= 0.05 && (
                            <span className={styles.trainingCeiling}>
                                ↑ Techo +{decimal(aporteDeTecho(state, t))}
                            </span>
                        )}

                        <span className={t.cost ? styles.trainingCost : styles.trainingFree}>
                            {costLabel(t)}
                        </span>

                        <span className={styles.optionHint}>{t.hint}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * CUÁNTO TECHO APORTA esta carta — no con cuál te deja.
 *
 * Mostrar la contribución y no un absoluto nuevo resuelve el problema de los
 * decimales sin tener que elegir entre ser honesto y ser legible: el techo queda
 * entero en la ficha, que es donde se mira el estado, y acá se lee lo único que
 * esta decisión cambia. Una carta media aporta 0,35, y "+0,4" dice la verdad
 * donde "74 → 74" mentía por redondeo.
 *
 * El tope de la banda entra en la cuenta y no después: si ya construiste 5,8 de
 * 6, la cara aporta 0,2 y eso es lo que tiene que decir. Prometer +0,9 con la
 * banda casi llena sería la misma mentira que arreglamos, escrita más chico.
 *
 * Repite la cuenta de `aging.ts` en vez de llamarla porque `ageOneSeason` muta
 * al jugador y una previsualización no puede tener efectos.
 */
function aporteDeTecho(state: CaptainState, t: TrainingDef): number {
    const { built } = state.player;
    return Math.min(POTENTIAL_BAND, built + TRAINING_CEILING[t.tier]) - built;
}

/** Un decimal, con coma. */
function decimal(n: number): string {
    return n.toFixed(1).replace('.', ',');
}

/**
 * Lo que se paga, en una línea y en el idioma del jugador.
 *
 * Se arma de los tres campos y no de un texto guardado en el catálogo: si
 * alguien sube el riesgo de una carta y se olvida de reescribir la frase, la
 * frase mentiría. Acá no puede.
 *
 * ── Se probó en fichas, y es peor ───────────────────────────────────────────
 * La idea era la simétrica de `.trainingGain`: lo que ganás en fichas verdes,
 * lo que pagás en fichas rojas. No funciona porque estas frases no son rótulos:
 * «perdés lugar en el equipo» son 24 caracteres, o sea una ficha de dos
 * renglones —que se lee rota— y tres fichas apiladas ocupando más que la prosa
 * que venían a reemplazar. Acortarlas a «minutos» las arreglaría de forma y las
 * rompería de fondo: el §4 pide el idioma del jugador, no el del motor.
 * Lo que sí era cierto del diagnóstico —tres renglones de rojo gritan— se
 * arregla donde estaba el problema, que es el tamaño y el peso de la tinta.
 */
function costLabel(t: TrainingDef): string {
    if (!t.cost) return 'Sin costo.';

    const partes: string[] = [];
    if (t.cost.body > 0) partes.push('el cuerpo lo paga');
    if (t.cost.minutes > 0) partes.push('perdés lugar en el equipo');
    if (t.cost.injuryRisk > 0) partes.push(`${Math.round(t.cost.injuryRisk * 100)}% de romperte`);

    if (partes.length === 0) return 'Sin costo.';
    return `⚠️ ${partes.join(' · ')}`;
}
