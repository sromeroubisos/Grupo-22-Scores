import { createClient } from '@/lib/supabase/server';

export type EntityType = 'club' | 'tournament' | 'player' | 'match';

export type ResolvedEntityResult =
    | {
        kind: 'ok';
        entityType: EntityType;
        source: 'db';
        data: unknown;
        canonicalPath: string;
        adminPath: string;
    }
    | { kind: 'not_found' }
    | { kind: 'forbidden' }
    | { kind: 'error'; message: string };

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function getPaths(type: EntityType, id: string) {
    let canonicalPath = '';
    switch (type) {
        case 'club': canonicalPath = `/clubs/${id}`; break;
        case 'tournament': canonicalPath = `/tournaments/${id}`; break;
        case 'player': canonicalPath = `/players/${id}`; break;
        case 'match': canonicalPath = `/matches/${id}`; break;
    }
    const adminPath = `/admin/entities/${id}/manage?type=${type}`;
    return { canonicalPath, adminPath };
}

export async function resolveEntity(params: { id: string; type?: EntityType }): Promise<ResolvedEntityResult> {
    try {
        const supabase = await createClient();
        const { id, type } = params;

        const isUuid = UUID_REGEX.test(id);

        if (type) {
            let table = '';
            switch (type) {
                case 'club': table = 'clubs'; break;
                case 'tournament': table = 'tournaments'; break;
                case 'player': table = 'players'; break;
                case 'match': table = 'matches'; break;
            }

            // Database constraints check
            if (table !== 'clubs' && !isUuid) {
                return { kind: 'not_found' };
            }

            const { data, error } = await supabase.from(table).select('*').eq('id', id).single();

            if (error) {
                if (error.code === 'PGRST116') return { kind: 'not_found' };
                console.error(`Error resolving entity ${id} of type ${type}:`, error);
                return { kind: 'error', message: error.message };
            }

            return {
                kind: 'ok',
                entityType: type,
                source: 'db',
                data,
                ...getPaths(type, id)
            };
        }

        // Infer types since type was not provided
        if (isUuid) {
            // 1. Try tournaments
            const { data: tData, error: tError } = await supabase.from('tournaments').select('*').eq('id', id).single();
            if (!tError && tData) {
                return { kind: 'ok', entityType: 'tournament', source: 'db', data: tData, ...getPaths('tournament', id) };
            }

            // 2. Try matches
            const { data: mData, error: mError } = await supabase.from('matches').select('*').eq('id', id).single();
            if (!mError && mData) {
                return { kind: 'ok', entityType: 'match', source: 'db', data: mData, ...getPaths('match', id) };
            }

            // 3. Try players
            const { data: pData, error: pError } = await supabase.from('players').select('*').eq('id', id).single();
            if (!pError && pData) {
                return { kind: 'ok', entityType: 'player', source: 'db', data: pData, ...getPaths('player', id) };
            }
        } else {
            // Text id -> Try clubs
            const { data: cData, error: cError } = await supabase.from('clubs').select('*').eq('id', id).single();
            if (!cError && cData) {
                return { kind: 'ok', entityType: 'club', source: 'db', data: cData, ...getPaths('club', id) };
            }
        }

        return { kind: 'not_found' };

    } catch (e: unknown) {
        let message = 'Unknown error';
        if (e instanceof Error) message = e.message;
        console.error('Exception resolving entity:', e);
        return { kind: 'error', message };
    }
}
