// EL CAPITÁN — corre el digest congelado contra un CHECKOUT LIMPIO.
//
// ── Por qué existe ──
// El Capitán no tiene catálogo propio: lee los clubes de `features/career/data/`,
// que es el mismo árbol donde se trabaja Carrera de Rugby. Con ediciones sin
// commitear ahí, las carreras congeladas se mueven enteras y el movimiento NO ES
// DEL MOTOR — el jugador termina en otro club porque el mercado que lo rodea es
// otro.
//
// Distinguir una cosa de la otra a mano cuesta montar un worktree, acordarse de
// borrarlo, y hacerlo igual que la vez anterior. La receta estaba escrita en un
// comentario arriba de la tabla, que es mejor que nada y peor que esto: la
// próxima vez alguien la hace distinto y compara contra otra cosa.
//
//   npm run test:captain-freeze            → contra HEAD
//   npm run test:captain-freeze -- <ref>   → contra el commit que quieras
//
// El worktree va a una carpeta temporal y se borra siempre, incluso si el test
// falla. No toca el árbol de trabajo de nadie.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST = 'src/features/captain/engine/__tests__/determinism.test.ts';

const ref = process.argv[2] ?? 'HEAD';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const sha = git('rev-parse', '--short', ref);
const sucio = git('status', '--porcelain', '--', 'src/features/career/data');

console.log(`\nEl Capitán · digest congelado contra checkout limpio de ${ref} (${sha})`);
if (sucio) {
    const cuantos = sucio.split('\n').length;
    console.log(
        `\n  Aviso: tenés ${cuantos} archivo(s) del catálogo sin commitear en `
        + 'features/career/data.\n  Por eso mismo se corre en un worktree: acá abajo NO se ven.\n',
    );
}

// `mkdtemp` en el tmp del sistema y no en el repo: un worktree adentro del árbol
// se lo comería el propio git status y encima lo verían los watchers del dev.
const carpeta = mkdtempSync(join(tmpdir(), 'captain-freeze-'));
const arbol = join(carpeta, 'arbol');

let codigo = 1;
try {
    execFileSync('git', ['worktree', 'add', '--detach', arbol, sha], { stdio: 'pipe' });
    const corrida = spawnSync(process.execPath, ['--test', TEST], {
        cwd: arbol,
        stdio: 'inherit',
    });
    codigo = corrida.status ?? 1;
} finally {
    // Siempre, aunque el test haya fallado: un worktree colgado ensucia
    // `git worktree list` y la próxima corrida no puede crear el mismo nombre.
    try {
        execFileSync('git', ['worktree', 'remove', '--force', arbol], { stdio: 'pipe' });
    } catch {
        // Windows a veces retiene el handle un instante. `prune` lo desregistra
        // igual y la carpeta temporal la borra el sistema.
        try { execFileSync('git', ['worktree', 'prune'], { stdio: 'pipe' }); } catch { /* ya está */ }
    }
    try { rmSync(carpeta, { recursive: true, force: true }); } catch { /* la limpia el SO */ }
}

console.log(
    codigo === 0
        ? '\n  Verde en checkout limpio: la tabla congelada es reproducible.\n'
        : '\n  Rojo en checkout limpio: esto SÍ es el motor (o el catálogo commiteado).\n',
);
process.exit(codigo);
