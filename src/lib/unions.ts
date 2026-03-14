import { getAllCountries } from '@/lib/data/countries';
import { SPORTS } from '@/lib/data/sports';

export const UNION_ENTITY_TYPES = [
    { value: 'union', label: 'Union' },
    { value: 'federation', label: 'Federacion' },
    { value: 'confederation', label: 'Confederacion' },
    { value: 'association', label: 'Asociacion' },
    { value: 'league_organizer', label: 'Organizador de ligas' },
] as const;

export const JURISDICTION_TYPES = [
    { value: 'international', label: 'Internacional' },
    { value: 'national', label: 'Nacional' },
    { value: 'regional', label: 'Regional' },
    { value: 'provincial', label: 'Provincial' },
    { value: 'municipal', label: 'Municipal' },
] as const;

export const UNION_STATUSES = [
    { value: 'active', label: 'Activa' },
    { value: 'inactive', label: 'Inactiva' },
    { value: 'in_formation', label: 'En formacion' },
    { value: 'archived', label: 'Archivada' },
] as const;

export const TAB_DEFINITIONS = [
    { id: 'overview', label: 'Resumen', short: '01' },
    { id: 'identity', label: 'Identidad institucional', short: '02' },
    { id: 'structure', label: 'Estructura y afiliaciones', short: '03' },
    { id: 'competitions', label: 'Competiciones', short: '04' },
    { id: 'rules', label: 'Reglamentos y defaults', short: '05' },
    { id: 'rankings', label: 'Rankings y estadisticas', short: '06' },
    { id: 'staff', label: 'Staff y permisos', short: '07' },
    { id: 'communication', label: 'Contenido y comunicacion', short: '08' },
    { id: 'public', label: 'Configuracion publica', short: '09' },
    { id: 'audit', label: 'Auditoria', short: '10' },
] as const;

export type UnionTabId = typeof TAB_DEFINITIONS[number]['id'];

export const ARGENTINA_REGIONS = [
    'Buenos Aires',
    'Catamarca',
    'Chaco',
    'Chubut',
    'Cordoba',
    'Corrientes',
    'Entre Rios',
    'Formosa',
    'Jujuy',
    'La Pampa',
    'La Rioja',
    'Mendoza',
    'Misiones',
    'Neuquen',
    'Rio Negro',
    'Salta',
    'San Juan',
    'San Luis',
    'Santa Cruz',
    'Santa Fe',
    'Santiago del Estero',
    'Tierra del Fuego',
    'Tucuman',
] as const;

export type UnionFormData = {
    official_name: string;
    short_name: string;
    acronym: string;
    entity_type: string;
    sport: string;
    logo: string;
    logo_alternative: string;
    crest: string;
    banner: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    font_family: string;
    slug: string;
    country: string;
    region: string;
    city: string;
    jurisdiction_type: string;
    headquarters: string;
    founded_year: string;
    parent_organization_id: string;
    continental_confederation: string;
    international_federation: string;
    system_level: string;
    associated_disciplines: string[];
    affiliated_clubs: string[];
    child_organizations: string[];
    representative_teams: string[];
    organized_tournaments: string[];
    status: string;
    public_visible: boolean;
    can_create_tournaments: boolean;
    can_manage_rankings: boolean;
    can_manage_clubs: boolean;
    can_manage_media: boolean;
    can_manage_staff: boolean;
    default_ruleset_id: string;
    description: string;
    long_description: string;
    history: string;
    website: string;
    email: string;
    phone: string;
    address: string;
    social_links: string;
    show_affiliated_clubs: boolean;
    show_tournaments: boolean;
    show_standings: boolean;
    show_authorities: boolean;
    show_sponsors: boolean;
    show_contact: boolean;
    show_news: boolean;
    show_documents: boolean;
    public_modules_order: string[];
    default_points_system: string;
    default_tiebreakers: string;
    competition_format: string;
    table_calculation_mode: string;
    default_bonus_rules: string;
    default_match_duration: string;
    default_players_per_side: string;
    default_competition_categories: string;
    player_eligibility_rules: string;
    disciplinary_rules: string;
    statute: string;
    competition_rules_document: string;
    disciplinary_code: string;
    official_documents: string;
    administrators: string;
    editors: string;
    operators: string;
    auditors: string;
    official_ranking_enabled: boolean;
    ranking_type: string;
    competition_weighting: string;
    points_by_competition: string;
    category_rankings: string;
    regional_rankings: string;
    historical_movement_tracking: boolean;
};

type UnionRecordLike = {
    id?: string | null;
    name?: string | null;
    short_name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
    banner_url?: string | null;
    primary_color?: string | null;
    website?: string | null;
    status?: string | null;
    country?: string | null;
    region?: string | null;
    sport?: string | null;
    union_level?: string | null;
    parent_union_id?: string | null;
    branding?: unknown;
};

export function getDefaultUnionForm(): UnionFormData {
    return {
        official_name: '',
        short_name: '',
        acronym: '',
        entity_type: 'union',
        sport: 'rugby',
        logo: '',
        logo_alternative: '',
        crest: '',
        banner: '',
        primary_color: '#00a365',
        secondary_color: '#002e4b',
        accent_color: '#00a365',
        font_family: 'Geist',
        slug: '',
        country: 'argentina',
        region: 'Cordoba',
        city: '',
        jurisdiction_type: 'provincial',
        headquarters: '',
        founded_year: '',
        parent_organization_id: '',
        continental_confederation: '',
        international_federation: '',
        system_level: 'regional_governing_body',
        associated_disciplines: [],
        affiliated_clubs: [],
        child_organizations: [],
        representative_teams: [],
        organized_tournaments: [],
        status: 'active',
        public_visible: true,
        can_create_tournaments: true,
        can_manage_rankings: true,
        can_manage_clubs: true,
        can_manage_media: true,
        can_manage_staff: true,
        default_ruleset_id: '',
        description: '',
        long_description: '',
        history: '',
        website: '',
        email: '',
        phone: '',
        address: '',
        social_links: '',
        show_affiliated_clubs: true,
        show_tournaments: true,
        show_standings: true,
        show_authorities: true,
        show_sponsors: true,
        show_contact: true,
        show_news: true,
        show_documents: true,
        public_modules_order: [
            'hero_institutional_header',
            'about_section',
            'official_competitions',
            'official_rankings',
            'affiliated_clubs_grid',
            'latest_news',
            'documents_and_regulations',
            'sponsors',
            'contact_and_social_links',
        ],
        default_points_system: '4 por victoria, 2 por empate, 0 por derrota',
        default_tiebreakers: 'Diferencia de puntos, tries, resultado entre si',
        competition_format: 'Liga regular + finales',
        table_calculation_mode: 'Puntos totales con bonus habilitados',
        default_bonus_rules: 'Bonus ofensivo y defensivo habilitados',
        default_match_duration: '80 minutos',
        default_players_per_side: '15',
        default_competition_categories: 'Primera, Intermedia, Juveniles, Desarrollo',
        player_eligibility_rules: '',
        disciplinary_rules: '',
        statute: '',
        competition_rules_document: '',
        disciplinary_code: '',
        official_documents: '',
        administrators: '',
        editors: '',
        operators: '',
        auditors: '',
        official_ranking_enabled: true,
        ranking_type: 'seasonal',
        competition_weighting: 'Primera 1.0, ascenso 0.7, juveniles 0.5',
        points_by_competition: '',
        category_rankings: '',
        regional_rankings: '',
        historical_movement_tracking: true,
    };
}

export function slugifyUnion(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

export function mapJurisdictionToLegacyLevel(jurisdictionType?: string | null): string | null {
    switch (jurisdictionType) {
        case 'international':
            return 'international';
        case 'national':
            return 'national';
        case 'regional':
        case 'provincial':
        case 'municipal':
            return 'regional';
        default:
            return null;
    }
}

export function mapLegacyLevelToJurisdiction(level?: string | null): string {
    switch ((level || '').toLowerCase()) {
        case 'international':
            return 'international';
        case 'national':
            return 'national';
        case 'regional':
        case 'sub_union':
            return 'regional';
        default:
            return 'provincial';
    }
}

export function safeObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

export function extractUnionBranding(record: UnionRecordLike | null | undefined): Record<string, unknown> {
    return safeObject(record?.branding);
}

export function getUnionOfficialName(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.official_name || record?.name || '';
}

export function getUnionShortName(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.short_name || record?.short_name || '';
}

export function getUnionAcronym(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.acronym || '';
}

export function getUnionSlug(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.slug || record?.slug || record?.id || '';
}

export function getUnionLogo(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.logo || branding.logo_url || record?.logo_url || '';
}

export function getUnionBanner(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.banner || branding.banner_url || record?.banner_url || '';
}

export function getUnionPrimaryColor(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.primary_color || branding.primary_color || record?.primary_color || '#00a365';
}

export function getUnionSecondaryColor(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.secondary_color || branding.secondary_color || '#002e4b';
}

export function getUnionStatus(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.operations?.status || record?.status || 'active';
}

export function getUnionCountry(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.jurisdiction?.country || record?.country || '';
}

export function getUnionRegion(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.jurisdiction?.region || record?.region || '';
}

export function getUnionSport(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.identity?.sport || record?.sport || '';
}

export function getUnionJurisdictionType(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.jurisdiction?.jurisdiction_type
        || mapLegacyLevelToJurisdiction(record?.union_level)
        || 'provincial';
}

export function getUnionParentId(record: UnionRecordLike | null | undefined): string {
    const branding = extractUnionBranding(record);
    return branding.organization?.relationships?.parent_organization_id || record?.parent_union_id || '';
}

export function hydrateUnionForm(record: UnionRecordLike | null | undefined): UnionFormData {
    const draft = getDefaultUnionForm();
    const branding = extractUnionBranding(record);
    const organization = safeObject(branding.organization);
    const identity = safeObject(organization.identity);
    const jurisdiction = safeObject(organization.jurisdiction);
    const relationships = safeObject(organization.relationships);
    const hierarchy = safeObject(organization.hierarchy);
    const operations = safeObject(organization.operations);
    const institutional = safeObject(branding.institutional_info);
    const publicConfig = safeObject(branding.public_config);
    const rules = safeObject(branding.rules);
    const documents = safeObject(branding.documents);
    const permissions = safeObject(branding.permissions);
    const rankings = safeObject(branding.rankings);

    return {
        ...draft,
        official_name: identity.official_name || record?.name || '',
        short_name: identity.short_name || '',
        acronym: identity.acronym || '',
        entity_type: identity.entity_type || 'union',
        sport: identity.sport || record?.sport || draft.sport,
        logo: identity.logo || branding.logo_url || record?.logo_url || '',
        logo_alternative: identity.logo_alternative || '',
        crest: identity.crest || '',
        banner: identity.banner || branding.banner_url || record?.banner_url || '',
        primary_color: identity.primary_color || branding.primary_color || record?.primary_color || draft.primary_color,
        secondary_color: identity.secondary_color || branding.secondary_color || draft.secondary_color,
        accent_color: identity.accent_color || draft.accent_color,
        font_family: identity.font_family || draft.font_family,
        slug: identity.slug || record?.slug || record?.id || '',
        country: jurisdiction.country || record?.country || draft.country,
        region: jurisdiction.region || record?.region || draft.region,
        city: jurisdiction.city || '',
        jurisdiction_type: jurisdiction.jurisdiction_type || mapLegacyLevelToJurisdiction(record?.union_level) || draft.jurisdiction_type,
        headquarters: jurisdiction.headquarters || '',
        founded_year: String(jurisdiction.founded_year || institutional.founded_year || ''),
        parent_organization_id: relationships.parent_organization_id || record?.parent_union_id || '',
        continental_confederation: hierarchy.continental_confederation || '',
        international_federation: hierarchy.international_federation || '',
        system_level: hierarchy.system_level || draft.system_level,
        associated_disciplines: relationships.associated_disciplines || [],
        affiliated_clubs: relationships.affiliated_clubs || [],
        child_organizations: relationships.child_organizations || [],
        representative_teams: relationships.representative_teams || [],
        organized_tournaments: relationships.organized_tournaments || [],
        status: operations.status || record?.status || draft.status,
        public_visible: operations.public_visible ?? draft.public_visible,
        can_create_tournaments: operations.can_create_tournaments ?? draft.can_create_tournaments,
        can_manage_rankings: operations.can_manage_rankings ?? draft.can_manage_rankings,
        can_manage_clubs: operations.can_manage_clubs ?? draft.can_manage_clubs,
        can_manage_media: operations.can_manage_media ?? draft.can_manage_media,
        can_manage_staff: operations.can_manage_staff ?? draft.can_manage_staff,
        default_ruleset_id: operations.default_ruleset_id || '',
        description: institutional.description || '',
        long_description: institutional.long_description || '',
        history: institutional.history || '',
        website: institutional.website || branding.website || record?.website || '',
        email: institutional.email || '',
        phone: institutional.phone || '',
        address: institutional.address || '',
        social_links: typeof institutional.social_links === 'string'
            ? institutional.social_links
            : JSON.stringify(institutional.social_links || {}, null, 2),
        show_affiliated_clubs: publicConfig.show_affiliated_clubs ?? draft.show_affiliated_clubs,
        show_tournaments: publicConfig.show_tournaments ?? draft.show_tournaments,
        show_standings: publicConfig.show_standings ?? draft.show_standings,
        show_authorities: publicConfig.show_authorities ?? draft.show_authorities,
        show_sponsors: publicConfig.show_sponsors ?? draft.show_sponsors,
        show_contact: publicConfig.show_contact ?? draft.show_contact,
        show_news: publicConfig.show_news ?? draft.show_news,
        show_documents: publicConfig.show_documents ?? draft.show_documents,
        public_modules_order: publicConfig.public_modules_order || draft.public_modules_order,
        default_points_system: rules.default_points_system || draft.default_points_system,
        default_tiebreakers: rules.default_tiebreakers || draft.default_tiebreakers,
        competition_format: rules.competition_format || draft.competition_format,
        table_calculation_mode: rules.table_calculation_mode || draft.table_calculation_mode,
        default_bonus_rules: rules.default_bonus_rules || draft.default_bonus_rules,
        default_match_duration: rules.default_match_duration || draft.default_match_duration,
        default_players_per_side: rules.default_players_per_side || draft.default_players_per_side,
        default_competition_categories: rules.default_competition_categories || draft.default_competition_categories,
        player_eligibility_rules: rules.player_eligibility_rules || '',
        disciplinary_rules: rules.disciplinary_rules || '',
        statute: documents.statute || '',
        competition_rules_document: documents.competition_rules || '',
        disciplinary_code: documents.disciplinary_code || '',
        official_documents: documents.official_documents || '',
        administrators: permissions.administrators || '',
        editors: permissions.editors || '',
        operators: permissions.operators || '',
        auditors: permissions.auditors || '',
        official_ranking_enabled: rankings.official_ranking_enabled ?? draft.official_ranking_enabled,
        ranking_type: rankings.ranking_type || draft.ranking_type,
        competition_weighting: rankings.competition_weighting || draft.competition_weighting,
        points_by_competition: rankings.points_by_competition || '',
        category_rankings: rankings.category_rankings || '',
        regional_rankings: rankings.regional_rankings || '',
        historical_movement_tracking: rankings.historical_movement_tracking ?? draft.historical_movement_tracking,
    };
}

export function buildUnionBrandingPayload(form: UnionFormData): Record<string, unknown> {
    let socialLinks: Record<string, unknown> = {};

    if (form.social_links.trim()) {
        try {
            socialLinks = JSON.parse(form.social_links);
        } catch {
            socialLinks = { raw: form.social_links.trim() };
        }
    }

    return {
        schema_version: 2,
        organization: {
            identity: {
                official_name: form.official_name.trim(),
                short_name: form.short_name.trim(),
                acronym: form.acronym.trim(),
                entity_type: form.entity_type,
                sport: form.sport,
                logo: form.logo,
                logo_alternative: form.logo_alternative.trim(),
                crest: form.crest.trim(),
                banner: form.banner,
                primary_color: form.primary_color,
                secondary_color: form.secondary_color,
                accent_color: form.accent_color,
                font_family: form.font_family.trim(),
                slug: form.slug,
            },
            jurisdiction: {
                country: form.country,
                region: form.region,
                city: form.city.trim(),
                jurisdiction_type: form.jurisdiction_type,
                headquarters: form.headquarters.trim(),
                founded_year: form.founded_year ? Number(form.founded_year) : null,
            },
            relationships: {
                parent_organization_id: form.parent_organization_id || null,
                associated_disciplines: form.associated_disciplines,
                affiliated_clubs: form.affiliated_clubs,
                child_organizations: form.child_organizations,
                representative_teams: form.representative_teams,
                organized_tournaments: form.organized_tournaments,
            },
            hierarchy: {
                continental_confederation: form.continental_confederation.trim(),
                international_federation: form.international_federation.trim(),
                system_level: form.system_level.trim(),
            },
            operations: {
                status: form.status,
                public_visible: form.public_visible,
                can_create_tournaments: form.can_create_tournaments,
                can_manage_rankings: form.can_manage_rankings,
                can_manage_clubs: form.can_manage_clubs,
                can_manage_media: form.can_manage_media,
                can_manage_staff: form.can_manage_staff,
                default_ruleset_id: form.default_ruleset_id || null,
            },
        },
        institutional_info: {
            description: form.description.trim(),
            long_description: form.long_description.trim(),
            history: form.history.trim(),
            founded_year: form.founded_year ? Number(form.founded_year) : null,
            website: form.website.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            social_links: socialLinks,
        },
        public_config: {
            show_affiliated_clubs: form.show_affiliated_clubs,
            show_tournaments: form.show_tournaments,
            show_standings: form.show_standings,
            show_authorities: form.show_authorities,
            show_sponsors: form.show_sponsors,
            show_contact: form.show_contact,
            show_news: form.show_news,
            show_documents: form.show_documents,
            public_modules_order: form.public_modules_order,
        },
        rules: {
            default_points_system: form.default_points_system.trim(),
            default_tiebreakers: form.default_tiebreakers.trim(),
            competition_format: form.competition_format.trim(),
            table_calculation_mode: form.table_calculation_mode.trim(),
            default_bonus_rules: form.default_bonus_rules.trim(),
            default_match_duration: form.default_match_duration.trim(),
            default_players_per_side: form.default_players_per_side.trim(),
            default_competition_categories: form.default_competition_categories.trim(),
            player_eligibility_rules: form.player_eligibility_rules.trim(),
            disciplinary_rules: form.disciplinary_rules.trim(),
        },
        documents: {
            statute: form.statute.trim(),
            competition_rules: form.competition_rules_document.trim(),
            disciplinary_code: form.disciplinary_code.trim(),
            official_documents: form.official_documents.trim(),
        },
        permissions: {
            administrators: form.administrators.trim(),
            editors: form.editors.trim(),
            operators: form.operators.trim(),
            auditors: form.auditors.trim(),
        },
        rankings: {
            official_ranking_enabled: form.official_ranking_enabled,
            ranking_type: form.ranking_type.trim(),
            competition_weighting: form.competition_weighting.trim(),
            points_by_competition: form.points_by_competition.trim(),
            category_rankings: form.category_rankings.trim(),
            regional_rankings: form.regional_rankings.trim(),
            historical_movement_tracking: form.historical_movement_tracking,
        },
        logo_url: form.logo,
        banner_url: form.banner,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        website: form.website.trim(),
    };
}

export const COUNTRY_OPTIONS = getAllCountries().map((country) => ({
    value: country.id,
    label: country.nameEs || country.name,
    code: country.code,
}));

export const SPORT_OPTIONS = Object.values(SPORTS)
    .sort((a, b) => a.priority - b.priority)
    .map((sport) => ({
        value: sport.id,
        label: sport.nameEs || sport.name,
    }));
