import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import type { Database } from '@/lib/database.types';
import {
    BASE_EXPORT_GUIDELINES,
    BASE_EXPORT_STYLE_RULES,
    EXPORT_DEFAULT_GRADIENT_PRESETS,
    EXPORT_EDITORIAL_LAYOUT_CATALOG,
    EXPORT_OUTPUT_FORMATS,
    EXPORT_PALETTE_CATALOG,
    EXPORT_TEMPLATE_CATALOG,
    EXPORT_TYPOGRAPHY_CATALOG,
    type ExportPresetType,
} from '@/lib/exports/catalog';
import type { ExportDesign, ExportPresetSummary } from '@/app/admin/super/exports/export-designs';

type UserExportPresetRow = Database['public']['Tables']['user_export_presets']['Row'];

function formatDateTimeLabel(value: string | null | undefined) {
    if (!value) return null;

    try {
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toSponsorCount(value: unknown) {
    return Array.isArray(value) ? value.filter((item) => {
        const sponsor = asRecord(item);
        return Boolean(toStringOrNull(sponsor.logo) || toStringOrNull(sponsor.name));
    }).length : 0;
}

function mapPresetSummary(row: UserExportPresetRow): ExportPresetSummary {
    const payload = asRecord(row.payload);
    const gradientImage = asRecord(payload.gradientImage);

    return {
        id: row.id,
        name: row.name,
        presetType: (row.preset_type === 'gradient' ? 'gradient' : 'editorial') as ExportPresetType,
        updatedAtLabel: formatDateTimeLabel(row.updated_at),
        createdAtLabel: formatDateTimeLabel(row.created_at),
        layoutPresetId: toStringOrNull(payload.layoutPresetId),
        gradientLeftColor: toStringOrNull(payload.gradientLeftColor),
        gradientRightColor: toStringOrNull(payload.gradientRightColor),
        sponsorCount: toSponsorCount(payload.sponsors),
        hasTexture: Boolean(toStringOrNull(gradientImage.src)),
    };
}

function isTrackedUserExportPreset(row: UserExportPresetRow) {
    return row.preset_type === 'editorial' || row.preset_type === 'gradient';
}

export async function getAdminExportDesigns(): Promise<ExportDesign[]> {
    const user = await requireSuperAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('user_export_presets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('[ExportsAdmin] Failed to read user_export_presets:', error);
    }

    const allRows = (data ?? []) as UserExportPresetRow[];
    const presetRows = allRows.filter(isTrackedUserExportPreset);
    const presetSummaries = presetRows.map(mapPresetSummary);
    const editorialPresetCount = presetRows.filter((row) => row.preset_type === 'editorial').length;
    const gradientPresetCount = presetRows.filter((row) => row.preset_type === 'gradient').length;
    const firstCreatedAtLabel = formatDateTimeLabel(
        presetRows
            .map((row) => row.created_at)
            .filter(Boolean)
            .sort()[0] ?? null,
    );
    const lastUpdatedAtLabel = formatDateTimeLabel(presetRows[0]?.updated_at ?? null);
    const latestGradientPreset = presetSummaries.find((preset) => preset.presetType === 'gradient');
    const latestEditorialPreset = presetSummaries.find((preset) => preset.presetType === 'editorial');
    const fallbackPalette = EXPORT_PALETTE_CATALOG[0];

    const previewLeft = latestGradientPreset?.gradientLeftColor || fallbackPalette.bg;
    const previewRight = latestGradientPreset?.gradientRightColor || fallbackPalette.accent;
    const previewAccent = latestEditorialPreset?.gradientRightColor
        || latestGradientPreset?.gradientRightColor
        || fallbackPalette.accent;
    const userConfig = {
        personalized: presetRows.length > 0,
        ownerLabel: user.name?.trim() || user.email,
        syncSourceLabel: presetRows.length > 0 ? 'Cloud / user_export_presets' : 'Sin presets cloud sincronizados',
        totalPresets: presetRows.length,
        editorialPresetCount,
        gradientPresetCount,
        firstCreatedAtLabel,
        lastUpdatedAtLabel,
        recentPresets: presetSummaries.slice(0, 8),
    };

    return [
        {
            slug: 'g22-base',
            name: 'G22 Base',
            shortDescription: 'Sistema real de exportacion actualmente activo en la web, conectado al motor ExportImage y a presets sincronizados en cloud.',
            longDescription:
                'Este diseno representa el sistema visual que hoy usa la plataforma para exportar tablas, resultados, fixtures, alineaciones, equipo de la semana, brackets y estadisticas. La pantalla toma datos reales del motor de exportacion y de user_export_presets para reflejar el estado actual del usuario.',
            category: 'stats',
            status: 'active',
            createdAtLabel: firstCreatedAtLabel,
            updatedAtLabel: lastUpdatedAtLabel,
            previewLabel: EXPORT_OUTPUT_FORMATS[0]
                ? `${EXPORT_OUTPUT_FORMATS[0].name} - ${EXPORT_OUTPUT_FORMATS[0].width} x ${EXPORT_OUTPUT_FORMATS[0].height}`
                : 'Sin formatos activos',
            previewAccent,
            previewBackground: `linear-gradient(135deg, ${previewLeft} 0%, ${previewRight} 100%)`,
            previewSurface: fallbackPalette.bg,
            formats: EXPORT_TEMPLATE_CATALOG,
            dimensions: EXPORT_OUTPUT_FORMATS,
            typography: EXPORT_TYPOGRAPHY_CATALOG,
            palette: EXPORT_PALETTE_CATALOG.map((palette) => ({
                id: palette.id,
                label: palette.name,
                value: palette.accent,
                note: `${palette.description} / fondo ${palette.bg}`,
            })),
            styleRules: [
                ...BASE_EXPORT_STYLE_RULES,
                {
                    id: 'cloud-presets',
                    label: 'Presets cloud del usuario',
                    value: `${presetRows.length} sincronizados (${editorialPresetCount} editoriales / ${gradientPresetCount} gradientes)`,
                },
                {
                    id: 'default-gradients',
                    label: 'Gradientes base',
                    value: `${EXPORT_DEFAULT_GRADIENT_PRESETS.length} presets incluidos en la app`,
                },
                {
                    id: 'editorial-layouts-live',
                    label: 'Layouts 4:5',
                    value: EXPORT_EDITORIAL_LAYOUT_CATALOG.map((layout) => layout.label).join(', '),
                },
            ],
            baseGuidelines: BASE_EXPORT_GUIDELINES,
            userConfig,
        },
        {
            slug: 'momentum-v2',
            name: 'Momentum V2',
            shortDescription: 'Segunda familia visual inspirada en los templates editoriales del paquete EXPORT V2, integrada al mismo motor real de exportacion.',
            longDescription:
                'Momentum V2 toma como referencia los templates del rar para crear una linea mas dramatica: fotografia dominante, paneles negros, titulares condensados, capsulas neon y composiciones de alto contraste para scores, fixtures, standings, lineups, equipo de la semana y player cards.',
            category: 'editorial',
            status: 'active',
            createdAtLabel: firstCreatedAtLabel,
            updatedAtLabel: lastUpdatedAtLabel,
            previewLabel: EXPORT_OUTPUT_FORMATS[0]
                ? `${EXPORT_OUTPUT_FORMATS[0].name} - ${EXPORT_OUTPUT_FORMATS[0].width} x ${EXPORT_OUTPUT_FORMATS[0].height}`
                : 'Sin formatos activos',
            previewAccent: '#f3dfbb',
            previewBackground: 'linear-gradient(135deg, #050505 0%, #2a1038 48%, #10385e 100%)',
            previewSurface: '#050505',
            formats: EXPORT_TEMPLATE_CATALOG,
            dimensions: EXPORT_OUTPUT_FORMATS,
            typography: EXPORT_TYPOGRAPHY_CATALOG,
            palette: [
                { id: 'momentum-gold', label: 'Momentum Gold', value: '#f3dfbb', note: 'Titular editorial sobre fondos matte' },
                { id: 'momentum-crimson', label: 'Momentum Crimson', value: '#fb7185', note: 'Acentos dramaticos para resultados y player cards' },
                { id: 'momentum-electric', label: 'Momentum Electric', value: '#38bdf8', note: 'Refuerzo frio para standings y fixtures' },
            ],
            styleRules: [
                ...BASE_EXPORT_STYLE_RULES,
                {
                    id: 'momentum-reference-pack',
                    label: 'Paquete de referencia',
                    value: 'Aplicado sobre los templates de scores, fixture, standing table, short table, lineups y highlighted player',
                },
                {
                    id: 'momentum-language',
                    label: 'Lenguaje visual',
                    value: 'Foto dominante, fondos matte, diagonales, tipografia condensada y acentos duales oro + neon',
                },
                {
                    id: 'momentum-coverage',
                    label: 'Cobertura',
                    value: 'Disponible en el mismo ExportImage para standings, fixtures, match stats, player stats, lineups, equipo de la semana y playoff',
                },
            ],
            baseGuidelines: [
                ...BASE_EXPORT_GUIDELINES,
                'La variante Momentum V2 mantiene las mismas opciones de exportacion pero cambia la composicion visual de cada template.',
            ],
            userConfig,
        },
        {
            slug: 'poster-v3',
            name: 'Poster V3',
            shortDescription: 'Tercera familia visual inspirada en el paquete EXPORT V3, con lenguaje de afiche, titulos gigantes y acentos neon.',
            longDescription:
                'Poster V3 lleva el motor de ExportImage hacia una estetica mas agresiva: fondos carbon, luces verticales, tipografia de alto impacto, contornos editoriales y bloques neon para fixtures, standings, lineups, equipo de la semana, resultados, playoff y player cards.',
            category: 'editorial',
            status: 'active',
            createdAtLabel: firstCreatedAtLabel,
            updatedAtLabel: lastUpdatedAtLabel,
            previewLabel: EXPORT_OUTPUT_FORMATS[0]
                ? `${EXPORT_OUTPUT_FORMATS[0].name} - ${EXPORT_OUTPUT_FORMATS[0].width} x ${EXPORT_OUTPUT_FORMATS[0].height}`
                : 'Sin formatos activos',
            previewAccent: '#d7ff00',
            previewBackground: 'linear-gradient(135deg, #03060f 0%, #07162c 46%, #111111 100%)',
            previewSurface: '#04070d',
            formats: EXPORT_TEMPLATE_CATALOG,
            dimensions: EXPORT_OUTPUT_FORMATS,
            typography: EXPORT_TYPOGRAPHY_CATALOG,
            palette: [
                { id: 'poster-neon', label: 'Poster Neon', value: '#d7ff00', note: 'Titulares, capsulas y barras de contraste tipo afiche' },
                { id: 'poster-fuchsia', label: 'Poster Fuchsia', value: '#ff5fa2', note: 'Marcadores y detalles calientes para resultados' },
                { id: 'poster-ice', label: 'Poster Ice', value: '#8be9ff', note: 'Refuerzo frio para tablas, playoff y agendas' },
            ],
            styleRules: [
                ...BASE_EXPORT_STYLE_RULES,
                {
                    id: 'poster-reference-pack',
                    label: 'Referencia visual',
                    value: 'Inspirado en el paquete EXPORT V3 adjuntado: fixtures densos, standings poster y layouts de alto contraste',
                },
                {
                    id: 'poster-language',
                    label: 'Lenguaje visual',
                    value: 'Afiche deportivo, fondos oscuros, outlines gigantes, luces verticales y acentos neon lima/fucsia',
                },
                {
                    id: 'poster-coverage',
                    label: 'Cobertura',
                    value: 'Disponible en ExportImage para match stats, fixtures, standings, lineups, equipo de la semana, playoff y player cards',
                },
            ],
            baseGuidelines: [
                ...BASE_EXPORT_GUIDELINES,
                'Poster V3 prioriza impacto visual, jerarquia tipografica y lectura rapida tipo social media poster.',
            ],
            userConfig,
        },
        {
            slug: 'impacto-v4',
            name: 'Impacto V4',
            shortDescription: 'Cuarta familia visual: placa de color pleno, titular condensado gigante y bloques de color por fila.',
            longDescription:
                'Impacto V4 abandona los paneles flotantes y los degradados: el color ocupa la pieza entera con textura y vineta, el titular parte la informacion en dos mitades (etapa - torneo) con tipografia condensada de alto impacto, y dos reglas blancas encierran el marcador. En tablas cada fila es un bloque del color de su zona con la condicion como columna; en fixtures los escudos se derraman fuera de la barra de cada partido.',
            category: 'editorial',
            status: 'testing',
            createdAtLabel: firstCreatedAtLabel,
            updatedAtLabel: lastUpdatedAtLabel,
            previewLabel: EXPORT_OUTPUT_FORMATS[0]
                ? `${EXPORT_OUTPUT_FORMATS[0].name} - ${EXPORT_OUTPUT_FORMATS[0].width} x ${EXPORT_OUTPUT_FORMATS[0].height}`
                : 'Sin formatos activos',
            previewAccent: '#ffffff',
            previewBackground: 'linear-gradient(135deg, #1d6d92 0%, #0f4c68 52%, #7a1416 100%)',
            previewSurface: '#0f4c68',
            formats: EXPORT_TEMPLATE_CATALOG,
            dimensions: EXPORT_OUTPUT_FORMATS,
            typography: EXPORT_TYPOGRAPHY_CATALOG,
            palette: [
                { id: 'impacto-field', label: 'Campo', value: '#1d6d92', note: 'El fondo pleno: sale de mezclar Fondo y Acento de la paleta elegida' },
                { id: 'impacto-ink', label: 'Tinta', value: '#ffffff', note: 'Titular, reglas y numeros; se invierte solo si el campo es claro' },
                { id: 'impacto-zone', label: 'Zona', value: '#16a34a', note: 'El color de cada fila lo pone la etiqueta de la tabla, no la paleta' },
            ],
            styleRules: [
                ...BASE_EXPORT_STYLE_RULES,
                {
                    id: 'impacto-language',
                    label: 'Lenguaje visual',
                    value: 'Campo de color con textura, titular condensado partido en etapa - torneo, reglas blancas y bloques planos',
                },
                {
                    id: 'impacto-coverage',
                    label: 'Cobertura propia',
                    value: 'Resultado de partido, tabla de posiciones y fixture de torneo; el resto de los templates cae a G22 Base',
                },
                {
                    id: 'impacto-zone-colors',
                    label: 'Color por fila',
                    value: 'Cada fila de la tabla toma el color de su etiqueta de zona; las filas sin etiqueta quedan neutras',
                },
            ],
            baseGuidelines: [
                ...BASE_EXPORT_GUIDELINES,
                'Impacto V4 usa la paleta como campo de color: Fondo y Acento se mezclan en un unico tono pleno en vez de repartirse en paneles.',
            ],
            userConfig,
        },
    ];
}
