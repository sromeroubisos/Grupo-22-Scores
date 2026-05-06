type AuthErrorLike = {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
};

function getAuthErrorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    const maybeError = error as AuthErrorLike;
    if (typeof maybeError?.message === 'string') return maybeError.message;
    if (typeof maybeError?.code === 'string') return maybeError.code;
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

    return message || fallback;
}
