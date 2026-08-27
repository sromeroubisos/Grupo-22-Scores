/**
 * ¿ES EL MISMO JUGADOR?
 *
 * Cuando se carga el plantel de una temporada nueva, la mayoría de los nombres ya
 * existen de la temporada anterior. La pregunta es cuáles son la misma persona.
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────────
 * Se compara el NOMBRE COMPLETO, no el apellido solo:
 *
 *   · Mismo nombre y apellido            → se pregunta (`exact`).
 *   · Escritura parecida                 → se pregunta (`similar`).
 *   · Mismo apellido, otro nombre        → NO se pregunta.
 *
 * Esa última línea es la que hace útil a las otras dos. En un plantel de rugby los
 * hermanos son moneda corriente: si alcanzara con el apellido, cargar Los Pumas
 * abriría una consulta por cada Pérez contra cada otro Pérez y nadie leería
 * ninguna. Comparando el nombre entero, "Juan Pérez" y "Pedro Pérez" ni se rozan.
 *
 * ── POR QUÉ NO ALCANZA CON COMPARAR TEXTO ─────────────────────────────────────
 * El normalizador que ya existía en el proyecto no plegaba acentos, y por eso hay
 * fichas duplicadas donde la única diferencia es una tilde. Acá se pliegan.
 *
 * Y hay un segundo caso, el más común de todos en una planilla: el segundo nombre
 * que a veces está y a veces no. "Juan Ignacio Pérez" y "Juan Pérez" están a ocho
 * letras de distancia —ninguna medida de parecido los junta— y son la misma
 * persona. Por eso, con el apellido igual, un nombre que es el principio del otro
 * también se pregunta.
 */

export type NameMatchKind = 'exact' | 'similar';

export type PersonNameRef = {
    id: string;
    fullName: string;
};

export type NameMatch = {
    person: PersonNameRef;
    kind: NameMatchKind;
};

export function normalizePlayerName(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

type NombrePartido = {
    /** Todos los nombres de pila, en orden. */
    first: string[];
    /** El último token: el apellido con el que se lo conoce. */
    last: string;
};

export function splitPlayerName(normalized: string): NombrePartido {
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0) return { first: [], last: '' };
    if (tokens.length === 1) return { first: [], last: tokens[0] };
    return { first: tokens.slice(0, -1), last: tokens[tokens.length - 1] };
}

/** Distancia de edición, con corte: si se pasa del máximo no importa cuánto. */
function distancia(a: string, b: string, maximo: number): number {
    if (Math.abs(a.length - b.length) > maximo) return maximo + 1;

    let previa = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i += 1) {
        const actual = [i];
        let mejorDeLaFila = i;

        for (let j = 1; j <= b.length; j += 1) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            const valor = Math.min(
                actual[j - 1] + 1,
                previa[j] + 1,
                previa[j - 1] + costo,
            );
            actual.push(valor);
            if (valor < mejorDeLaFila) mejorDeLaFila = valor;
        }

        if (mejorDeLaFila > maximo) return maximo + 1;
        previa = actual;
    }

    return previa[b.length];
}

/**
 * Cuánto puede diferir un nombre y seguir siendo un error de tipeo. Escala con el
 * largo porque una letra de más en "Gil" pesa mucho más que en "Bertranou".
 */
function toleranciaPara(largo: number): number {
    if (largo <= 6) return 1;
    if (largo <= 14) return 2;
    return 3;
}

/**
 * `null` cuando son personas distintas y no hay nada que preguntar.
 */
export function comparePlayerNames(a: unknown, b: unknown): NameMatchKind | null {
    const na = normalizePlayerName(a);
    const nb = normalizePlayerName(b);
    if (!na || !nb) return null;

    if (na === nb) return 'exact';

    const pa = splitPlayerName(na);
    const pb = splitPlayerName(nb);

    // Apellidos distintos de verdad: no es la misma persona escrita distinto.
    const toleranciaApellido = toleranciaPara(Math.max(pa.last.length, pb.last.length));
    if (distancia(pa.last, pb.last, toleranciaApellido) > toleranciaApellido) return null;

    // Mismo apellido y un nombre que es el principio del otro: el segundo nombre que
    // en una planilla está y en la otra no.
    const firstA = pa.first.join(' ');
    const firstB = pb.first.join(' ');
    if (firstA && firstB) {
        const corto = firstA.length <= firstB.length ? firstA : firstB;
        const largo = firstA.length <= firstB.length ? firstB : firstA;
        if (largo === corto || largo.startsWith(`${corto} `)) return 'similar';
    }

    // Y si no, el nombre entero tiene que estar a distancia de tipeo. Acá es donde
    // "Juan Pérez" y "Pedro Pérez" quedan afuera: comparten el apellido pero el
    // nombre completo está lejísimos.
    const tolerancia = toleranciaPara(Math.max(na.length, nb.length));
    return distancia(na, nb, tolerancia) <= tolerancia ? 'similar' : null;
}

/**
 * Las fichas que podrían ser esta misma persona, de más parecida a menos. Se
 * devuelven todas las candidatas y no una sola: quien carga el plantel es quien
 * sabe, y elegir por él es exactamente como se arman las fichas duplicadas.
 */
export function findPlayerMatches(nombre: unknown, candidatos: PersonNameRef[]): NameMatch[] {
    const encontrados: NameMatch[] = [];

    for (const candidato of candidatos) {
        const kind = comparePlayerNames(nombre, candidato.fullName);
        if (kind) encontrados.push({ person: candidato, kind });
    }

    return encontrados.sort((x, y) => {
        if (x.kind !== y.kind) return x.kind === 'exact' ? -1 : 1;
        return x.person.fullName.localeCompare(y.person.fullName, 'es');
    });
}
