/**
 * Sponsors de clubes y torneos: los dos formatos y la regla que decide si una
 * imagen sirve.
 *
 * Este archivo lo importan el navegador (la vista previa del gestor) y el
 * servidor (la ruta de subida). Es a propósito: la vista previa no puede decir
 * "está bien" a una imagen que después el servidor rechaza. Sin dependencias.
 */

export type SponsorOwnerType = 'club' | 'tournament';
export type SponsorFormat = 'banner' | 'logo';

export interface SponsorFormatSpec {
    id: SponsorFormat;
    label: string;
    ratioLabel: string;
    /** ancho / alto */
    ratio: number;
    /** Lo que se le recomienda cargar. */
    recommended: { width: number; height: number };
    /** Por debajo de esto la imagen se ve pixelada en desktop. */
    minimum: { width: number; height: number };
    /** Lo que se guarda: el servidor achica todo lo que pase de acá. */
    stored: { width: number; height: number };
    usage: string;
}

export const SPONSOR_FORMATS: Record<SponsorFormat, SponsorFormatSpec> = {
    banner: {
        id: 'banner',
        label: 'Banner',
        ratioLabel: '16:9',
        ratio: 16 / 9,
        recommended: { width: 1920, height: 1080 },
        minimum: { width: 960, height: 540 },
        stored: { width: 1920, height: 1080 },
        usage: 'Presencia grande, a lo ancho de la sección.',
    },
    logo: {
        id: 'logo',
        label: 'Logo',
        ratioLabel: '1:1',
        ratio: 1,
        recommended: { width: 1080, height: 1080 },
        minimum: { width: 400, height: 400 },
        stored: { width: 1080, height: 1080 },
        usage: 'Marca en la grilla de logos.',
    },
};

export const SPONSOR_FORMAT_ORDER: SponsorFormat[] = ['banner', 'logo'];

/** El archivo que elige el usuario. El servidor igual lo re-codifica y lo achica. */
export const SPONSOR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const SPONSOR_MAX_UPLOAD_LABEL = '5 MB';

export const SPONSOR_ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const SPONSOR_ACCEPTED_LABEL = 'JPG, PNG o WebP';

/**
 * Cuánto se puede apartar la proporción antes de rechazar. Un 1920×1078 es un
 * 16:9 para cualquier persona; un 4:3 no.
 */
export const SPONSOR_RATIO_TOLERANCE = 0.02;

export const SPONSOR_NAME_MAX = 120;

/**
 * Plana y no unión discriminada: el proyecto compila sin `strict`, y ahí
 * `if (!check.ok)` no estrecha el tipo.
 */
export interface SponsorImageCheck {
    ok: boolean;
    /** null cuando está bien. */
    reason: 'ratio' | 'small' | null;
    /** Vacío cuando está bien. */
    message: string;
}

function describeRatio(width: number, height: number) {
    const ratio = width / height;
    if (Math.abs(ratio - 16 / 9) < 0.03) return '16:9';
    if (Math.abs(ratio - 1) < 0.03) return '1:1';
    if (Math.abs(ratio - 4 / 3) < 0.03) return '4:3';
    if (Math.abs(ratio - 3 / 4) < 0.03) return '3:4';
    if (Math.abs(ratio - 9 / 16) < 0.03) return '9:16';
    return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

export function matchesSponsorRatio(format: SponsorFormat, width: number, height: number) {
    if (width <= 0 || height <= 0) return false;
    const target = SPONSOR_FORMATS[format].ratio;
    return Math.abs(width / height - target) / target <= SPONSOR_RATIO_TOLERANCE;
}

export function checkSponsorImage(format: SponsorFormat, width: number, height: number): SponsorImageCheck {
    const spec = SPONSOR_FORMATS[format];

    if (!matchesSponsorRatio(format, width, height)) {
        return {
            ok: false,
            reason: 'ratio',
            message: `La imagen es ${width}×${height} (${describeRatio(width, height)}) y un ${spec.label.toLowerCase()} tiene que ser ${spec.ratioLabel}.`,
        };
    }

    if (width < spec.minimum.width || height < spec.minimum.height) {
        return {
            ok: false,
            reason: 'small',
            message: `La imagen es ${width}×${height} y se vería pixelada. El mínimo para un ${spec.label.toLowerCase()} es ${spec.minimum.width}×${spec.minimum.height}.`,
        };
    }

    return { ok: true, reason: null, message: '' };
}

export function isSponsorFormat(value: unknown): value is SponsorFormat {
    return value === 'banner' || value === 'logo';
}

export function isSponsorOwnerType(value: unknown): value is SponsorOwnerType {
    return value === 'club' || value === 'tournament';
}

/** Lo que devuelve la API, en camelCase. */
export interface Sponsor {
    id: string;
    ownerType: SponsorOwnerType;
    ownerId: string;
    name: string;
    format: SponsorFormat;
    imageUrl: string;
    imageWidth: number | null;
    imageHeight: number | null;
    sortOrder: number;
    isActive: boolean;
    tier: 'principal' | 'secundario' | null;
    placement: string;
    linkUrl: string | null;
    startsAt: string | null;
    endsAt: string | null;
}

/** Lo mínimo que necesita la vitrina pública. */
export type PublicSponsor = Pick<
    Sponsor,
    'id' | 'name' | 'format' | 'imageUrl' | 'imageWidth' | 'imageHeight' | 'tier' | 'placement' | 'linkUrl'
>;
