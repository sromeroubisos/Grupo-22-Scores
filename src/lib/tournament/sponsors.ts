/**
 * Sponsors por torneo: tipos, validación y reglas puras.
 *
 * Este módulo no toca la base ni React: lo usan las rutas de API, la pestaña
 * del gestor y la sección pública, y se prueba en Node (sponsors.test.ts).
 *
 * Reglas que viven acá y en ningún otro lado:
 *  - Un sponsor pertenece a un torneo (tournament_id).
 *  - El monto es administrativo: `toPublicSponsor` lo saca antes de publicar.
 *  - El monto NO tiene un valor predeterminado: NULL = todavía sin definir.
 *  - El resumen (total) se calcula SOLO sobre los sponsors activos.
 */

export type TournamentSponsorStatus = 'active' | 'inactive';

export const TOURNAMENT_SPONSOR_STATUSES: readonly TournamentSponsorStatus[] = ['active', 'inactive'];

export const SPONSOR_DEFAULT_CURRENCY = 'ARS';

/** Fila completa de `tournament_sponsors`, tal como la ve la administración. */
export type TournamentSponsor = {
    id: string;
    tournament_id: string;
    name: string;
    logo_url: string | null;
    /** Valor del espacio publicitario. `null` mientras no esté definido. */
    amount: number | null;
    currency: string;
    status: TournamentSponsorStatus;
    tier: string | null;
    placement: string | null;
    website_url: string | null;
    starts_at: string | null;
    ends_at: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
};

/** Lo único que sale a la página pública. Sin monto, sin moneda, sin estado. */
export type PublicTournamentSponsor = {
    id: string;
    name: string;
    logo_url: string | null;
    website_url: string | null;
    tier: string | null;
    placement: string | null;
    sort_order: number;
};

export type TournamentSponsorSummary = {
    total: number;
    active: number;
    inactive: number;
    /** Suma de `amount` de los sponsors ACTIVOS con monto definido. */
    activeAmount: number;
    /** Activos que todavía no tienen monto cargado. */
    activeWithoutAmount: number;
    currency: string;
};

export type TournamentSponsorInput = {
    name: string;
    amount: number | null;
    status: TournamentSponsorStatus;
    website_url: string | null;
    /** URL http(s) ya persistida, o data: URL recién elegida en el formulario. */
    logo_url: string | null;
};

export type SponsorValidationResult =
    | { ok: true; value: TournamentSponsorInput }
    | { ok: false; errors: Partial<Record<keyof TournamentSponsorInput, string>> };

export const SPONSOR_NAME_MAX_LENGTH = 120;
export const SPONSOR_AMOUNT_MAX = 999_999_999_999;

/** Formatos aceptados para el logo y tamaño máximo del archivo original. */
export const SPONSOR_LOGO_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const SPONSOR_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
};

function trimToNull(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
}

export function isTournamentSponsorStatus(value: unknown): value is TournamentSponsorStatus {
    return value === 'active' || value === 'inactive';
}

/**
 * Convierte lo que llega del formulario o del JSON en un monto.
 * Acepta número, string con coma o punto decimal, y vacío (→ null).
 * Devuelve `undefined` si no se puede interpretar.
 */
export function parseSponsorAmount(value: unknown): number | null | undefined {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? roundAmount(value) : undefined;
    }
    if (typeof value !== 'string') return undefined;

    const raw = value.trim();
    if (!raw) return null;

    // "1.234.567,50" → "1234567.50" ; "1234.5" → "1234.5" ; "1,5" → "1.5"
    let normalized = raw.replace(/\s/g, '').replace(/[$]/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
            ? normalized.replace(/\./g, '').replace(',', '.')
            : normalized.replace(/,/g, '');
    } else if (hasComma) {
        normalized = normalized.replace(',', '.');
    }

    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? roundAmount(parsed) : undefined;
}

function roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export function isDataImageUrl(value: unknown): boolean {
    return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

/** Mime type declarado en un data: URL de imagen, normalizado (jpg → jpeg). */
export function dataUrlMimeType(value: string): string | null {
    const match = value.match(/^data:([^;,]+)[;,]/i);
    if (!match) return null;
    const mime = match[1].toLowerCase();
    return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

/** Tamaño en bytes del binario codificado en un data: URL base64. */
export function dataUrlByteLength(value: string): number {
    const comma = value.indexOf(',');
    if (comma < 0) return 0;
    const payload = value.slice(comma + 1);
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.floor((payload.length * 3) / 4) - padding;
}

export function extensionForMime(mime: string): string {
    return MIME_TO_EXTENSION[mime] || 'png';
}

/**
 * Valida el logo tal como llega del formulario (data: URL). Devuelve el
 * mensaje de error o null si pasa. Se usa igual en el cliente (antes de
 * mostrar el preview) y en el servidor (antes de subirlo a Storage).
 */
export function validateSponsorLogoDataUrl(value: string): string | null {
    if (!isDataImageUrl(value)) return 'El archivo tiene que ser una imagen.';
    const mime = dataUrlMimeType(value);
    if (!mime || !SPONSOR_LOGO_MIME_TYPES.includes(mime)) {
        return 'Formato no soportado. Usá PNG, JPG, WEBP o SVG.';
    }
    if (dataUrlByteLength(value) > SPONSOR_LOGO_MAX_BYTES) {
        return `La imagen supera los ${Math.round(SPONSOR_LOGO_MAX_BYTES / 1024 / 1024)} MB.`;
    }
    return null;
}

/** Misma validación pero sobre el File elegido, antes de leerlo. */
export function validateSponsorLogoFile(file: { type: string; size: number; name?: string }): string | null {
    const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    const looksSvg = !type && typeof file.name === 'string' && file.name.toLowerCase().endsWith('.svg');
    if (!SPONSOR_LOGO_MIME_TYPES.includes(type) && !looksSvg) {
        return 'Formato no soportado. Usá PNG, JPG, WEBP o SVG.';
    }
    if (file.size > SPONSOR_LOGO_MAX_BYTES) {
        return `La imagen supera los ${Math.round(SPONSOR_LOGO_MAX_BYTES / 1024 / 1024)} MB.`;
    }
    return null;
}

/**
 * Valida y normaliza el payload de alta/edición. Los mensajes están pensados
 * para mostrarse debajo del campo.
 */
export function validateSponsorInput(raw: Record<string, unknown>): SponsorValidationResult {
    const errors: Partial<Record<keyof TournamentSponsorInput, string>> = {};

    const name = trimToNull(raw.name);
    if (!name) {
        errors.name = 'El nombre del sponsor es obligatorio.';
    } else if (name.length > SPONSOR_NAME_MAX_LENGTH) {
        errors.name = `El nombre no puede superar los ${SPONSOR_NAME_MAX_LENGTH} caracteres.`;
    }

    const amount = parseSponsorAmount(raw.amount);
    if (amount === undefined) {
        errors.amount = 'El monto tiene que ser un número.';
    } else if (amount !== null && amount < 0) {
        errors.amount = 'El monto no puede ser negativo.';
    } else if (amount !== null && amount > SPONSOR_AMOUNT_MAX) {
        errors.amount = 'El monto es demasiado grande.';
    }

    const statusRaw = raw.status === undefined || raw.status === null ? 'active' : raw.status;
    if (!isTournamentSponsorStatus(statusRaw)) {
        errors.status = 'Estado inválido.';
    }

    const website = trimToNull(raw.website_url);
    if (website && !isHttpUrl(website)) {
        errors.website_url = 'El link tiene que empezar con https://';
    }

    const logo = trimToNull(raw.logo_url);
    if (logo) {
        if (isDataImageUrl(logo)) {
            const logoError = validateSponsorLogoDataUrl(logo);
            if (logoError) errors.logo_url = logoError;
        } else if (!isHttpUrl(logo) && !logo.startsWith('/')) {
            errors.logo_url = 'El logo tiene que ser una imagen válida.';
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            name: name as string,
            amount: amount as number | null,
            status: statusRaw as TournamentSponsorStatus,
            website_url: website,
            logo_url: logo,
        },
    };
}

/** Saca todo lo administrativo. Es lo ÚNICO que puede viajar a la página pública. */
export function toPublicSponsor(sponsor: TournamentSponsor | PublicTournamentSponsor): PublicTournamentSponsor {
    return {
        id: sponsor.id,
        name: sponsor.name,
        logo_url: sponsor.logo_url ?? null,
        website_url: sponsor.website_url ?? null,
        tier: sponsor.tier ?? null,
        placement: sponsor.placement ?? null,
        sort_order: sponsor.sort_order ?? 0,
    };
}

/** Orden estable de aparición: sort_order, después nombre. */
export function sortSponsors<T extends { sort_order: number; name: string; id: string }>(list: readonly T[]): T[] {
    return [...list].sort((a, b) =>
        (a.sort_order - b.sort_order)
        || a.name.localeCompare(b.name, 'es')
        || a.id.localeCompare(b.id),
    );
}

/** Solo los activos, ya ordenados y sin datos administrativos. */
export function selectPublicSponsors(list: readonly TournamentSponsor[]): PublicTournamentSponsor[] {
    return sortSponsors(list.filter((sponsor) => sponsor.status === 'active')).map(toPublicSponsor);
}

export function summarizeSponsors(list: readonly TournamentSponsor[]): TournamentSponsorSummary {
    let active = 0;
    let activeAmount = 0;
    let activeWithoutAmount = 0;
    let currency: string | null = null;

    for (const sponsor of list) {
        if (sponsor.status !== 'active') continue;
        active += 1;
        if (typeof sponsor.amount === 'number' && Number.isFinite(sponsor.amount)) {
            activeAmount = roundAmount(activeAmount + sponsor.amount);
            currency = currency ?? sponsor.currency;
        } else {
            activeWithoutAmount += 1;
        }
    }

    return {
        total: list.length,
        active,
        inactive: list.length - active,
        activeAmount,
        activeWithoutAmount,
        currency: currency ?? list[0]?.currency ?? SPONSOR_DEFAULT_CURRENCY,
    };
}

export function formatSponsorAmount(amount: number | null | undefined, currency: string = SPONSOR_DEFAULT_CURRENCY): string {
    if (amount === null || amount === undefined || !Number.isFinite(amount)) return 'Sin definir';
    try {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
            minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toLocaleString('es-AR')}`;
    }
}
