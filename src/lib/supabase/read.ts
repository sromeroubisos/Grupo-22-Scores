import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function getReadClient() {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return createAdminClient();
    }

    return createClient();
}
