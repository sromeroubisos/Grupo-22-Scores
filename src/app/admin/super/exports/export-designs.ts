import type {
    ExportCatalogDimension,
    ExportCatalogFormat,
    ExportCatalogStyleRule,
    ExportCatalogTypography,
    ExportPresetType,
} from '@/lib/exports/catalog';

export type ExportDesignStatus = 'active' | 'draft' | 'testing';
export type ExportDesignCategory = 'editorial' | 'stats';

export type ExportPresetSummary = {
    id: string;
    name: string;
    presetType: ExportPresetType;
    updatedAtLabel: string | null;
    createdAtLabel: string | null;
    layoutPresetId: string | null;
    gradientLeftColor: string | null;
    gradientRightColor: string | null;
    sponsorCount: number;
    hasTexture: boolean;
};

export type ExportColorToken = {
    id: string;
    label: string;
    value: string;
    note: string;
};

export type ExportUserConfigSummary = {
    personalized: boolean;
    ownerLabel: string;
    syncSourceLabel: string;
    totalPresets: number;
    editorialPresetCount: number;
    gradientPresetCount: number;
    firstCreatedAtLabel: string | null;
    lastUpdatedAtLabel: string | null;
    recentPresets: ExportPresetSummary[];
};

export type ExportDesign = {
    slug: string;
    name: string;
    shortDescription: string;
    longDescription: string;
    category: ExportDesignCategory;
    status: ExportDesignStatus;
    createdAtLabel: string | null;
    updatedAtLabel: string | null;
    previewLabel: string;
    previewAccent: string;
    previewBackground: string;
    previewSurface: string;
    formats: ExportCatalogFormat[];
    dimensions: ExportCatalogDimension[];
    typography: ExportCatalogTypography[];
    palette: ExportColorToken[];
    styleRules: ExportCatalogStyleRule[];
    baseGuidelines: string[];
    userConfig: ExportUserConfigSummary;
};

export function getExportStatusMeta(status: ExportDesignStatus) {
    switch (status) {
        case 'active':
            return { label: 'Activo', tone: 'success' as const };
        case 'draft':
            return { label: 'Borrador', tone: 'neutral' as const };
        case 'testing':
            return { label: 'En prueba', tone: 'warning' as const };
        default:
            return { label: status, tone: 'neutral' as const };
    }
}
