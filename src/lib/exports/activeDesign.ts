export type ExportDesignSlug = 'g22-base' | 'momentum-v2' | 'poster-v3';
export type ExportVisualFamily = 'g22Base' | 'momentumV2' | 'posterV3';

const ACTIVE_EXPORT_DESIGN_KEY = 'g22-active-export-design-v1';
const DEFAULT_ACTIVE_EXPORT_DESIGN: ExportDesignSlug = 'g22-base';

export function getDefaultActiveExportDesign(): ExportDesignSlug {
    return DEFAULT_ACTIVE_EXPORT_DESIGN;
}

export function isExportDesignSlug(value: string | null | undefined): value is ExportDesignSlug {
    return value === 'g22-base' || value === 'momentum-v2' || value === 'poster-v3';
}

export function readActiveExportDesign(): ExportDesignSlug {
    if (typeof window === 'undefined') return DEFAULT_ACTIVE_EXPORT_DESIGN;

    try {
        const stored = window.localStorage.getItem(ACTIVE_EXPORT_DESIGN_KEY);
        return isExportDesignSlug(stored) ? stored : DEFAULT_ACTIVE_EXPORT_DESIGN;
    } catch {
        return DEFAULT_ACTIVE_EXPORT_DESIGN;
    }
}

export function persistActiveExportDesign(slug: ExportDesignSlug) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(ACTIVE_EXPORT_DESIGN_KEY, slug);
        window.dispatchEvent(new CustomEvent('g22:active-export-design-change', { detail: slug }));
    } catch {
        // Ignore storage failures and keep the in-memory selection.
    }
}

export function mapDesignSlugToVisualFamily(slug: ExportDesignSlug): ExportVisualFamily {
    if (slug === 'momentum-v2') return 'momentumV2';
    if (slug === 'poster-v3') return 'posterV3';
    return 'g22Base';
}

export function mapVisualFamilyToDesignSlug(family: ExportVisualFamily): ExportDesignSlug {
    if (family === 'momentumV2') return 'momentum-v2';
    if (family === 'posterV3') return 'poster-v3';
    return 'g22-base';
}
