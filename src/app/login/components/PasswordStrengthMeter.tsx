import type { PasswordCheck } from '@/lib/auth/passwordPolicy'
import styles from '../login.module.css'

const SEGMENTOS = [1, 2, 3, 4] as const

/**
 * La barra dice cuán fuerte es; la lista dice qué falta para que se acepte.
 * Son cosas distintas a propósito: una contraseña puede ser válida y todavía
 * mejorable, y el usuario tiene que poder distinguir "no te lo tomo" de
 * "te lo tomo pero podrías hacerlo mejor".
 *
 * No se muestra nada hasta que el campo tiene algo escrito: una lista de
 * requisitos en rojo sobre un campo vacío se lee como un error que el usuario
 * todavía no cometió.
 */
export default function PasswordStrengthMeter({ check, password }: { check: PasswordCheck; password: string }) {
    if (!password) {
        return null
    }

    return (
        <div className={styles.strengthMeter}>
            <div className={styles.strengthTrack} aria-hidden="true">
                {SEGMENTOS.map((segmento) => (
                    <span
                        key={segmento}
                        className={[
                            styles.strengthSegment,
                            segmento <= check.strength
                                ? styles[`strengthSegmentOn${check.strength}` as keyof typeof styles]
                                : '',
                        ].filter(Boolean).join(' ')}
                    />
                ))}
            </div>

            {/* aria-live para que el lector de pantalla cante el cambio de nivel
                sin que el usuario tenga que salir del campo. */}
            <span className={styles.strengthLabel} aria-live="polite">
                Seguridad: {check.label}
            </span>

            {check.problems.length > 0 && (
                <ul className={styles.passwordProblems}>
                    {check.problems.map((problema) => (
                        <li key={problema}>{problema}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}
