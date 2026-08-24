import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

type JsonObject = Record<string, unknown>;

// PostgREST corta cada respuesta en 1000 filas (db-max-rows): pedir `limit=2000`
// devuelve 1000 y nadie avisa. Para servir más que eso hay que paginar.
const CLUB_PAGE_SIZE = 1000;
const CLUB_MAX_LIMIT = 5000;
const CLUB_DEFAULT_LIMIT = 500;
const DIVISIONS_ID_CHUNK = 200;

type ClubDivisionInput = {
    name?: unknown;
    sport?: unknown;
    gender?: unknown;
    category?: unknown;
    season?: unknown;
    status?: unknown;
};

const OPTIONAL_CLUB_COLUMNS = [
    'categories',
    'city',
    'country',
    'is_visible',
    'logo_url',
    'primary_color',
    'region',
    'short_name',
    'slug',
    'sport',
    'sport_id',
    'union_id',
];

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function readText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableText(value: unknown): string | null {
    const text = readText(value);
    return text.length > 0 ? text : null;
}

function readPositiveInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return Array.from(new Set(
            value
                .map((item) => readText(item))
                .filter(Boolean),
        ));
    }

    if (typeof value === 'string') {
        return Array.from(new Set(
            value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
        ));
    }

    return [];
}

function buildCategories(body: JsonObject): string[] | null {
    const categories = new Set(readStringList(body.categories));
    const entityType = readText(body.entity_type) || 'club';
    const gender = readText(body.gender);
    const ageGrade = readText(body.age_grade);

    if (entityType) categories.add(`entity:${slugify(entityType) || entityType}`);
    if (gender) categories.add(`gender:${slugify(gender) || gender}`);
    if (ageGrade) categories.add(`age_grade:${slugify(ageGrade) || ageGrade}`);

    return categories.size > 0 ? Array.from(categories) : null;
}

function buildProfilePayload(body: JsonObject): JsonObject {
    const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)
        ? body.profile as JsonObject
        : {};

    const payload: JsonObject = {
        admin_contact_name: readNullableText(body.admin_contact_name ?? profile.admin_contact_name),
        admin_contact_email: readNullableText(body.admin_contact_email ?? profile.admin_contact_email),
        admin_contact_phone: readNullableText(body.admin_contact_phone ?? profile.admin_contact_phone),
        website: readNullableText(body.website ?? profile.website),
        instagram: readNullableText(body.instagram ?? profile.instagram),
        x_url: readNullableText(body.x_url ?? profile.x_url),
        youtube: readNullableText(body.youtube ?? profile.youtube),
        tiktok: readNullableText(body.tiktok ?? profile.tiktok),
        venue_name: readNullableText(body.venue_name ?? profile.venue_name),
        venue_address: readNullableText(body.venue_address ?? profile.venue_address),
        venue_capacity: readPositiveInt(body.venue_capacity ?? profile.venue_capacity),
        venue_notes: readNullableText(body.venue_notes ?? profile.venue_notes),
    };

    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null));
}

function buildDivisions(body: JsonObject, clubId: string, fallbackSport: string, fallbackSeason: string) {
    if (!Array.isArray(body.divisions)) return [];

    return body.divisions
        .map((item): ClubDivisionInput | null => (
            item && typeof item === 'object' && !Array.isArray(item) ? item as ClubDivisionInput : null
        ))
        .filter((item): item is ClubDivisionInput => Boolean(item))
        .map((division) => ({
            club_id: clubId,
            name: readText(division.name),
            sport: readNullableText(division.sport) ?? fallbackSport,
            gender: readNullableText(division.gender),
            category: readNullableText(division.category),
            season: readNullableText(division.season) ?? fallbackSeason,
            status: readNullableText(division.status) ?? 'active',
        }))
        .filter((division) => division.name.length >= 2);
}

async function insertClubWithFallback(writer: any, payload: JsonObject) {
    let result = await writer.from('clubs').insert([payload]).select('*').single();

    if (!result.error) return result;

    const missingColumns = OPTIONAL_CLUB_COLUMNS.filter((column) => isMissingColumnError(result.error, column));
    if (missingColumns.length === 0) return result;

    const reducedPayload = { ...payload };
    for (const column of missingColumns) {
        delete reducedPayload[column];
    }

    console.warn('[admin/torneo/clubs] Retrying club insert without optional columns:', missingColumns);
    result = await writer.from('clubs').insert([reducedPayload]).select('*').single();
    return result;
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);

    if (!scope.isUnlimited && scope.clubIds.size === 0) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '', 10);
    const limit = Math.min(
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : CLUB_DEFAULT_LIMIT,
        CLUB_MAX_LIMIT,
    );
    const parsedOffset = Number.parseInt(searchParams.get('offset') || '', 10);
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    // Service-role read: results are constrained to scope.clubIds below, but the
    // RLS SELECT policy (public read = is_visible only) would hide the caller's
    // own draft/hidden clubs.
    const reader = getServiceWriter(supabase, 'admin/torneo/clubs');
    const buildQuery = () => {
        let query = reader
            .from('clubs')
            // `logo_url` guarda el escudo en base64 y esta consulta es la del catálogo
            // COMPLETO: medida contra producción daba 56,8 MB en 5,5 s para quedarse
            // con una lista de nombres. El escudo sale abajo como URL del proxy, que
            // lo resuelve por `id`, así que el cajón de participantes lo pinta igual.
            .select('id, name, short_name, slug, sport, sport_id, city, region, country, is_visible, union_id, primary_color, categories, updated_at')
            .order('name', { ascending: true })
            // Desempate por PK: sin él, dos clubes con el mismo nombre pueden
            // repetirse o desaparecer entre páginas.
            .order('id', { ascending: true });

        if (!scope.isUnlimited) {
            query = query.in('id', Array.from(scope.clubIds));
        }

        if (search) {
            const escaped = escapePostgrestLike(search);
            query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%,short_name.ilike.%${escaped}%`);
        }

        return query;
    };

    type ScopedClubRow = { id: string; name: string; updated_at?: string | null };
    const data: ScopedClubRow[] = [];

    while (data.length < limit) {
        const size = Math.min(CLUB_PAGE_SIZE, limit - data.length);
        const from = offset + data.length;
        const page = await buildQuery().range(from, from + size - 1);

        if (page.error) {
            return err('No se pudieron cargar los clubes', 500, page.error.message);
        }

        const rows = (page.data ?? []) as ScopedClubRow[];
        data.push(...rows);
        if (rows.length < size) break;
    }

    // Los planteles solo los pinta el panel de clubes. Al cajón de participantes
    // le cuesta una consulta cada 200 ids y no muestra ninguno, así que puede
    // pedir el catálogo sin ellos.
    const wantsDivisions = searchParams.get('divisions') !== '0';
    const clubIds = wantsDivisions ? data.map((club) => club.id).filter(Boolean) : [];
    const divisionsByClub = new Map<string, unknown[]>();

    // El `in(...)` viaja en la URL: con una página entera de ids se pasa del
    // límite y PostgREST contesta 414. Va por tandas.
    for (let index = 0; index < clubIds.length; index += DIVISIONS_ID_CHUNK) {
        const { data: divisions, error: divisionsError } = await reader
            .from('club_divisions')
            .select('id, club_id, name, sport, gender, category, season, status')
            .in('club_id', clubIds.slice(index, index + DIVISIONS_ID_CHUNK))
            .order('name', { ascending: true });

        if (!divisionsError) {
            for (const division of divisions ?? []) {
                const current = divisionsByClub.get(division.club_id) ?? [];
                current.push(division);
                divisionsByClub.set(division.club_id, current);
            }
        }
    }

    return NextResponse.json({
        data: data.map((club) => ({
            ...club,
            logo_url: buildTeamLogoProxyUrl({
                key: club.id,
                name: club.name,
                version: club.updated_at,
            }),
            divisions: divisionsByClub.get(club.id) ?? [],
        })),
    });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: JsonObject;
    try {
        body = (await request.json()) as JsonObject;
    } catch {
        return err('Payload JSON invalido', 400);
    }

    const name = readText(body.name);
    const shortName = readNullableText(body.short_name);
    const sport = readText(body.sport ?? body.sport_id) || 'rugby';
    const city = readNullableText(body.city);
    const region = readNullableText(body.region);
    const country = readNullableText(body.country);
    const unionId = readNullableText(body.union_id);
    const logoUrl = readNullableText(body.logo_url);
    const primaryColor = readNullableText(body.primary_color);
    const visibility = readText(body.visibility);
    const isVisible = typeof body.is_visible === 'boolean'
        ? body.is_visible
        : ['visible', 'public', 'published', 'active'].includes(visibility);
    const requestedSlug = readText(body.slug);

    if (name.length < 2) {
        return err('El nombre del club debe tener al menos 2 caracteres', 400);
    }

    const slug = slugify(requestedSlug || name);
    if (!slug) {
        return err('El nombre genera un slug invalido', 400);
    }

    const writer = getServiceWriter(supabase, 'admin/torneo/clubs') as any;
    const { data: existing } = await writer
        .from('clubs')
        .select('id')
        .eq('id', slug)
        .maybeSingle();

    if (existing) {
        return err('Ya existe un club con ese nombre/slug', 409, { slug });
    }

    const payload: JsonObject = {
        id: slug,
        slug,
        name,
        short_name: shortName,
        sport,
        sport_id: sport,
        city,
        region,
        country,
        union_id: unionId,
        logo_url: logoUrl,
        primary_color: primaryColor,
        categories: buildCategories(body),
        is_visible: isVisible,
    };

    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined || value === '') {
            delete payload[key];
        }
    }

    const { data, error } = await insertClubWithFallback(writer, payload);

    if (error) {
        if (error.code === '23505') {
            return err('Ya existe un club con ese slug', 409, { slug });
        }
        return err('No se pudo crear el club', 500, error.message);
    }

    const warnings: string[] = [];

    // El creador obtiene acceso automatico (membership admin con scope=club).
    // Asi el club queda guardado en la DB y aparece en el panel sin tener que
    // solicitar acceso. La concesion se intenta con el admin client (service
    // role) para que RLS nunca la bloquee, con reintento ante fallos transitorios.
    const membershipRow = {
        user_id: context.userId,
        scope_type: 'club',
        scope_id: data.id,
        role: 'admin',
    };

    const grantMembership = async (client: any) =>
        client.from('memberships').insert([membershipRow]);

    let membershipResult = await grantMembership(writer);

    if (membershipResult.error && membershipResult.error.code !== '23505') {
        // Reintento explicito con admin client garantizado.
        let adminClient: any = null;
        try {
            adminClient = createAdminClient();
        } catch {
            adminClient = null;
        }
        membershipResult = await grantMembership(adminClient ?? writer);
    }

    const membershipError = membershipResult.error;
    if (membershipError && membershipError.code !== '23505') {
        // 23505 = ya existe (idempotente). Cualquier otro error real significa
        // que el club quedaria sin acceso. Hacemos rollback del club para que
        // sea todo-o-nada y un reintento no choque con el slug existente.
        console.error('[admin/torneo/clubs] Could not grant creator membership, rolling back club:', membershipError.message);
        await writer.from('clubs').delete().eq('id', data.id);
        return err(
            'No se pudo conceder el acceso automatico al club. No se creo nada, podes reintentar.',
            500,
            { membershipError: membershipError.message },
        );
    }

    const profilePayload = buildProfilePayload(body);
    if (Object.keys(profilePayload).length > 0) {
        const { error: profileError } = await writer
            .from('club_profile')
            .upsert({ club_id: data.id, ...profilePayload }, { onConflict: 'club_id' });

        if (profileError && !isMissingTableError(profileError, 'club_profile')) {
            warnings.push('No se pudo guardar el perfil extendido del club.');
            console.warn('[admin/torneo/clubs] profile warning:', profileError.message);
        }
    }

    const aliases = readStringList(body.aliases);
    if (aliases.length > 0) {
        const { error: aliasesError } = await writer
            .from('club_aliases')
            .insert(aliases.map((alias) => ({ club_id: data.id, alias })));

        if (aliasesError && aliasesError.code !== '23505' && !isMissingTableError(aliasesError, 'club_aliases')) {
            warnings.push('No se pudieron guardar los aliases.');
            console.warn('[admin/torneo/clubs] aliases warning:', aliasesError.message);
        }
    }

    const secondaryUnions = readStringList(body.secondary_unions);
    if (secondaryUnions.length > 0) {
        const { error: secondaryError } = await writer
            .from('club_secondary_unions')
            .insert(secondaryUnions.map((union_id) => ({ club_id: data.id, union_id })));

        if (secondaryError && secondaryError.code !== '23505' && !isMissingTableError(secondaryError, 'club_secondary_unions')) {
            warnings.push('No se pudieron guardar las uniones secundarias.');
            console.warn('[admin/torneo/clubs] secondary unions warning:', secondaryError.message);
        }
    }

    const divisions = buildDivisions(body, data.id, sport, String(new Date().getFullYear()));
    if (divisions.length > 0) {
        const { error: divisionsError } = await writer
            .from('club_divisions')
            .insert(divisions);

        if (divisionsError && !isMissingTableError(divisionsError, 'club_divisions')) {
            warnings.push('No se pudieron crear los planteles/divisiones iniciales.');
            console.warn('[admin/torneo/clubs] divisions warning:', divisionsError.message);
        }
    }

    return NextResponse.json({ data, warnings }, { status: 201 });
}
