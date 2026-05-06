/**
 * Create (or upgrade) a tournament-administrator user.
 *
 * Usage:
 *   npx tsx scripts/create-tournament-admin.ts <email> <password> [name]
 *
 * The user will land at /admin/torneo after login and only have access to
 * the Clubs and Tournaments sections of the admin panel.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
    console.error('Falta .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const [, , emailArg, passwordArg, nameArg] = process.argv;
if (!emailArg || !passwordArg) {
    console.error('Uso: npx tsx scripts/create-tournament-admin.ts <email> <password> [nombre]');
    process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;
const name = (nameArg || 'Admin de Torneos').trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(): Promise<{ id: string } | null> {
    let page = 1;
    while (page < 50) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        const found = data.users.find((u) => u.email?.toLowerCase() === email);
        if (found) return { id: found.id };
        if (data.users.length < 100) return null;
        page += 1;
    }
    return null;
}

async function main() {
    let userId: string;

    const existing = await findUserByEmail();

    if (existing) {
        console.log(`Usuario existente encontrado (${email}). Actualizando password y rol…`);
        const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: { name, role: 'admin_torneo' },
        });
        if (updateError) throw updateError;
        userId = existing.id;
    } else {
        console.log(`Creando usuario nuevo (${email})…`);
        const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, role: 'admin_torneo' },
        });
        if (error) throw error;
        if (!data.user) throw new Error('createUser no devolvió usuario');
        userId = data.user.id;
    }

    const { error: upsertError } = await admin
        .from('users')
        .upsert(
            { id: userId, email, name, role: 'admin_torneo' },
            { onConflict: 'id' },
        );
    if (upsertError) throw upsertError;

    console.log('\n✓ Usuario configurado como Administrador de Torneos.');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
    console.log(`  user id:  ${userId}`);
    console.log('\nIngresá en /login con esas credenciales y serás redirigido a /admin/torneo.');
}

main().catch((err) => {
    console.error('Falló la creación del usuario:', err);
    process.exit(1);
});
