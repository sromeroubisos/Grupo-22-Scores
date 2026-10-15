type AuthErrorLike = {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
};

// Un mensaje EN BLANCO no es un mensaje. Supabase manda errores con `message`
// vacio y el dato util en `code`, y un string con un espacio adentro es truthy:
// se comia el `code`, despues se comia el fallback de getAuthErrorMessage y
// terminaba en la pantalla como un cartel rojo sin texto adentro. Por eso cada
// rama exige `.trim()` antes de dar por bueno lo que encontro.
function getAuthErrorText(error: unknown): string {
    const maybeError = error as AuthErrorLike;
    if (typeof maybeError?.message === 'string' && maybeError.message.trim()) return maybeError.message;
    if (typeof error === 'string' && error.trim()) return error;
    if (typeof maybeError?.code === 'string' && maybeError.code.trim()) return maybeError.code;
    return '';
}

export function isAuthRateLimitError(error: unknown): boolean {
    const maybeError = error as AuthErrorLike;
    const message = getAuthErrorText(error).toLowerCase();
    const code = typeof maybeError?.code === 'string' ? maybeError.code.toLowerCase() : '';
    const status = typeof maybeError?.status === 'number' ? maybeError.status : null;

    return (
        status === 429 ||
        code.includes('rate_limit') ||
        code.includes('too_many') ||
        message.includes('request rate limit reached') ||
        message.includes('rate limit') ||
        message.includes('too many requests')
    );
}

export function getAuthErrorMessage(
    error: unknown,
    fallback = 'Ocurrio un error de autenticacion. Intenta nuevamente.',
): string {
    const message = getAuthErrorText(error);

    if (isAuthRateLimitError(error)) {
        return 'Demasiados intentos seguidos. Espera un minuto y volve a intentar.';
    }

    if (
        message.includes('supabase_auth_unreachable') ||
        message.includes('Supabase auth request failed') ||
        message.includes('Failed to fetch')
    ) {
        return 'No pudimos contactar el servicio de autenticacion. Intenta de nuevo en unos segundos.';
    }

    if (message.includes('Invalid login credentials')) {
        return 'Credenciales incorrectas. Verifica tu email y contrasena.';
    }

    if (message.includes('Email not confirmed')) {
        return 'Tu email todavia no fue confirmado. Revisa tu correo y abre el enlace de confirmacion antes de iniciar sesion.';
    }

    return message.trim() || fallback;
}
