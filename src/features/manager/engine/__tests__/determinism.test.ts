// RED DE SEGURIDAD DEL PUERTO DE RUGBY MANAGER (Fase 0).
//
// Garantías, que conviene no mezclar:
//
//   1. REPRODUCIBILIDAD: misma semilla ⇒ mismo mundo, mismo año simulado.
//      Si falla, se coló una fuente de azar (Math.random, Date.now, reloj).
//   2. SIN SEMILLA NO HAY AZAR: usar el flujo sin sembrar tira un error.
//   3. ROUND-TRIP: serializar el mundo a JSON a mitad de año, restaurar el
//      estado del flujo y seguir da EXACTAMENTE lo mismo que no haber parado.
//      Es la garantía real detrás del "F5 y retoma idéntico".
//   4. DIGEST CONGELADO: foto del comportamiento actual. SÍ se rompe cuando el
//      motor cambia a propósito; ahí se actualiza EXPECTED.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import type { World } from '../../types/index.ts';
import { createDemoWorld } from '../../data/demoWorld.ts';
import { simulateScheduledMatchesUntil } from '../season.ts';
import { entropyState, restoreEntropy, seedEntropy } from '../../utils/entropy.ts';

const SEED = 42;
// El corte cae en la grilla de 14 días de `simulateTo` (13 tramos desde el 1 de julio). Un fin de
// semana es UNA jornada, así que el resultado depende de la secuencia de avances: guardar y recargar
// repite la misma secuencia, pero cortar en medio de un fin de semana la cambiaría.
const MID_YEAR = '2026-12-30';
const END_YEAR = '2027-06-30';

const digest = (w: World): string =>
    createHash('sha256').update(JSON.stringify(w)).digest('hex').slice(0, 16);

function freshWorld(seed: number): World {
    return createDemoWorld({ seed });
}

/** Simula en tramos de 14 días hasta `target` (igual que el avance del juego). */
function simulateTo(world: World, target: string): World {
    let w = world;
    while (w.currentDate < target) {
        const next = new Date(`${w.currentDate}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 14);
        const iso = next.toISOString().slice(0, 10);
        w = simulateScheduledMatchesUntil(w, iso < target ? iso : target);
    }
    return w;
}

describe('rugby-manager · determinismo del motor', () => {
    it('misma semilla ⇒ mismo mundo recién creado', () => {
        assert.equal(digest(freshWorld(SEED)), digest(freshWorld(SEED)));
    });

    it('semillas distintas ⇒ mundos distintos', () => {
        assert.notEqual(digest(freshWorld(SEED)), digest(freshWorld(SEED + 1)));
    });

    it('misma semilla ⇒ mismo año simulado', () => {
        const a = simulateTo(freshWorld(SEED), END_YEAR);
        const b = simulateTo(freshWorld(SEED), END_YEAR);
        assert.equal(digest(a), digest(b));
    });

    it('el motor nunca llama a Math.random', () => {
        const real = Math.random;
        let llamadas = 0;
        Math.random = () => { llamadas++; return real(); };
        try {
            simulateTo(freshWorld(SEED), '2026-09-15');
        } finally {
            Math.random = real;
        }
        assert.equal(llamadas, 0);
    });

    it('usar el azar sin sembrar tira un error en vez de caer a Math.random', async () => {
        // El query string fuerza una instancia nueva del módulo, con el flujo sin sembrar.
        const url = new URL('../../utils/entropy.ts?sin-sembrar', import.meta.url).href;
        const limpio = await import(url);
        assert.throws(() => limpio.random(), /sin sembrar/);
        assert.throws(() => limpio.entropyState(), /sin sembrar/);
    });

    it('round-trip: parar a mitad de año, serializar, restaurar y seguir da lo mismo', () => {
        const corrido = simulateTo(freshWorld(SEED), END_YEAR);

        const mitad = simulateTo(freshWorld(SEED), MID_YEAR);
        const guardado = JSON.stringify({ world: mitad, entropy: entropyState() });

        // "Recarga": se pierde el estado en memoria salvo lo guardado.
        seedEntropy(999);
        const cargado = JSON.parse(guardado) as { world: World; entropy: number };
        restoreEntropy(cargado.entropy);
        const retomado = simulateTo(cargado.world, END_YEAR);

        assert.equal(digest(retomado), digest(corrido));
    });

    it('digest congelado del año simulado con semilla 42', () => {
        // Cambió a propósito con el mundo completo (28 divisiones argentinas, Uruguay, Chile),
        // los índices de lectura, el arreglo de las pirámides y el de las fechas de la Champions Cup:
        // motor 0.2.0, esquema del mundo 4.
        // Y de nuevo con el rendimiento de carga: una jornada por fin de semana, jugadores que se
        // copian solo si cambian y ciclos mundialistas solo cuando se juega algo que los toca.
        const EXPECTED = '2b7044935d4d4246';
        const got = digest(simulateTo(freshWorld(SEED), END_YEAR));
        assert.equal(got, EXPECTED, `Digest actual: ${got}`);
    });
});
