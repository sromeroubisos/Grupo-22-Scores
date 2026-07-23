/**
 * Flags de LABORATORIO (Etapa 0) para aislar el costo de los procesos derivados
 * de una edición al medir. NO son un arreglo y NO deben volverse permanentes.
 *
 * Reglas de seguridad (imposible activarlos por accidente en producción):
 *   - Sólo tienen efecto si NODE_ENV !== 'production'.
 *   - Si aparecen activados en producción: se IGNORAN y se emite un warning
 *     sanitizado (una sola vez).
 *   - Apagados (default) => comportamiento normal, sin ningún cambio.
 *
 * Master:       PERF_TEST_SKIP_MATCH_DERIVED_RECALCULATIONS=true
 * Individuales: PERF_TEST_SKIP_RANKING / _STANDINGS / _ADVANCEMENT / _RESEED / _CACHE
 *
 * Cuando un proceso se omite, el call-site lo registra en el trace vía
 * appendEditTraceFact('skippedDerived', <proceso>).
 */
export type DerivedProcess = 'ranking' | 'standings' | 'advancement' | 'reseed' | 'cache';

const ENV_BY_PROCESS: Record<DerivedProcess, string> = {
  ranking: 'PERF_TEST_SKIP_RANKING',
  standings: 'PERF_TEST_SKIP_STANDINGS',
  advancement: 'PERF_TEST_SKIP_ADVANCEMENT',
  reseed: 'PERF_TEST_SKIP_RESEED',
  cache: 'PERF_TEST_SKIP_CACHE',
};

let warnedInProduction = false;

function anyLabFlagRequested(process_: DerivedProcess): boolean {
  const master = process.env.PERF_TEST_SKIP_MATCH_DERIVED_RECALCULATIONS === 'true';
  const individual = process.env[ENV_BY_PROCESS[process_]] === 'true';
  return master || individual;
}

/**
 * ¿Debe OMITIRSE este proceso derivado? Devuelve `true` SÓLO fuera de producción
 * y con un flag explícito. En producción devuelve `false` aunque el flag esté
 * seteado, y avisa una vez.
 */
export function isDerivedRecalcSkipped(process_: DerivedProcess): boolean {
  if (!anyLabFlagRequested(process_)) return false;

  if (process.env.NODE_ENV === 'production') {
    if (!warnedInProduction) {
      warnedInProduction = true;
      // Warning sanitizado: no revela valores de env ni datos.
      console.warn(
        '[labFlags] Se detectó un flag PERF_TEST_SKIP_* en producción: IGNORADO. ' +
          'Estos flags son exclusivamente para medición fuera de producción.',
      );
    }
    return false;
  }

  return true;
}

/** Sólo para tests: resetea el latch del warning de producción. */
export function __resetLabFlagWarningForTest(): void {
  warnedInProduction = false;
}
