/**
 * Política de contraseñas, compartida por el registro y el cambio de contraseña.
 *
 * Antes el único chequeo era `password.length < 6`, duplicado a mano en los dos
 * formularios: `123456` entraba.
 *
 * Sigue el criterio de NIST 800-63B: **largo antes que composición**. No se
 * exige mayúscula + número + símbolo, porque esa regla empuja a la gente a
 * `Password1!` —que es adivinable— y no agrega entropía real. Lo que sí se
 * rechaza es lo que de verdad se prueba primero en un ataque: contraseñas
 * comunes, secuencias, repeticiones y el propio email.
 *
 * OJO, esto corre en el navegador y por lo tanto es esquivable: un `signUp`
 * directo contra Supabase con la anon key no pasa por acá. La barrera real se
 * configura en el dashboard de Supabase (Auth → Password requirements, y
 * "leaked password protection", que consulta HaveIBeenPwned del lado del
 * servidor). Esto es la primera línea y el mensaje que lee el usuario; aquello
 * es el piso. Ver SEGURIDAD_SUPABASE_DASHBOARD.md.
 */

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Lo primero que prueba cualquier diccionario. No pretende ser exhaustiva —para
 * eso está la protección de contraseñas filtradas de Supabase, que consulta
 * HaveIBeenPwned— sino frenar lo obvio antes de que salga del navegador.
 */
const COMUNES = new Set([
    '123456', '1234567', '12345678', '123456789', '1234567890',
    'password', 'password1', 'password123', 'passw0rd',
    'contrasena', 'contraseña', 'contrasena1', 'contrasena123',
    'qwerty', 'qwertyui', 'qwerty123', 'asdfghjk', 'zxcvbnm',
    'iloveyou', 'admin', 'admin123', 'administrador', 'usuario',
    'welcome', 'bienvenido', 'letmein', 'abc123', 'abcd1234',
    'monkey', 'dragon', 'sunshine', 'princess', 'football',
    'futbol', 'futbol123', 'rugby', 'rugby123', 'deportes',
    'argentina', 'argentina1', 'boca', 'bocajuniors', 'river',
    'riverplate', 'messi', 'messi10', 'maradona', 'diego10',
    'g22scores', 'g22', 'scores', 'losandes', 'cordoba',
    'buenosaires', 'rosario', 'mendoza', 'tucuman',
    'holahola', 'hola1234', 'temporal', 'temporal1', 'cambiar',
    'cambiame', 'test1234', 'prueba123', 'aaaaaaaaaa', '0000000000',
]);

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export interface PasswordCheck {
    /** `true` cuando no queda ningún problema bloqueante. */
    ok: boolean;
    /** Qué le falta, en orden, listo para mostrar. Vacío cuando `ok`. */
    problems: string[];
    /** Solo para la barra: 0 = vacía, 4 = llena. No decide si se acepta. */
    strength: PasswordStrength;
    /** Rótulo de la barra. */
    label: string;
}

function normalizar(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/** Corridas de 4 o más caracteres consecutivos: `1234`, `abcd`, `dcba`. */
function tieneSecuencia(value: string): boolean {
    const lower = value.toLowerCase();
    let subiendo = 1;
    let bajando = 1;

    for (let i = 1; i < lower.length; i += 1) {
        const delta = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
        subiendo = delta === 1 ? subiendo + 1 : 1;
        bajando = delta === -1 ? bajando + 1 : 1;
        if (subiendo >= 4 || bajando >= 4) return true;
    }

    return false;
}

/** Corridas de 4 o más veces el mismo caracter: `aaaa`, `0000`. */
function tieneRepeticion(value: string): boolean {
    return /(.)\1{3,}/.test(value);
}

/**
 * `juan.perez@gmail.com` no puede tener `juanperez` de contraseña. Se compara
 * sin acentos ni separadores, porque `Juan.Perez` y `juanperez` son lo mismo
 * para quien esté adivinando.
 */
function contieneEmail(password: string, email?: string | null): boolean {
    const local = (email || '').split('@')[0];
    const aguja = normalizar(local).replace(/[^a-z0-9]/g, '');
    if (aguja.length < 4) return false;

    return normalizar(password).replace(/[^a-z0-9]/g, '').includes(aguja);
}

function calcularFuerza(password: string): PasswordStrength {
    if (!password) return 0;

    let puntos = 0;
    if (password.length >= PASSWORD_MIN_LENGTH) puntos += 1;
    if (password.length >= 14) puntos += 1;
    if (password.length >= 20) puntos += 1;

    // La variedad NO es obligatoria, pero sí suma en la barra: entre dos
    // contraseñas del mismo largo, la que mezcla clases es más cara de romper.
    const clases = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
        .filter((clase) => clase.test(password)).length;
    if (clases >= 3) puntos += 1;

    if (tieneSecuencia(password) || tieneRepeticion(password)) puntos -= 1;

    return Math.max(0, Math.min(4, puntos)) as PasswordStrength;
}

const ETIQUETAS: Record<PasswordStrength, string> = {
    0: 'Muy debil',
    1: 'Debil',
    2: 'Aceptable',
    3: 'Buena',
    4: 'Fuerte',
};

export function checkPassword(
    password: string,
    options?: { email?: string | null },
): PasswordCheck {
    const problems: string[] = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
        problems.push(`Tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    }

    if (/^\s|\s$/.test(password)) {
        problems.push('No puede empezar ni terminar con un espacio.');
    }

    if (COMUNES.has(normalizar(password))) {
        problems.push('Es una de las contrasenas mas usadas. Elegi otra.');
    }

    if (tieneRepeticion(password)) {
        problems.push('Repite el mismo caracter cuatro veces o mas.');
    }

    if (tieneSecuencia(password)) {
        problems.push('Tiene una secuencia obvia, como 1234 o abcd.');
    }

    if (contieneEmail(password, options?.email)) {
        problems.push('No puede contener tu email.');
    }

    const strength = calcularFuerza(password);

    return {
        ok: problems.length === 0,
        problems,
        strength,
        label: ETIQUETAS[strength],
    };
}
