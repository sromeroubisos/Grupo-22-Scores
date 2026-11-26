/**
 * Crea (o actualiza) un usuario con el rol "Usuario con overlays".
 *
 * Uso:
 *   npx tsx scripts/create-overlay-user.ts <email> <contraseña> [nombre]
 *
 * Sirve para dar de alta a quien maneja las transmisiones, o para una cuenta de
 * prueba (por ejemplo prueba.overlay@g22scores.test). Al entrar ve "Overlays" en
 * su perfil y abre /overlay; no ve ningún panel de administración.
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const ROLE = 'usuario_overlay';

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
    console.error('Uso: npx tsx scripts/create-overlay-user.ts <email> <contraseña> [nombre]');
    process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;
const name = (nameArg || 'Usuario de overlays').trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(): Promise<{ id: string } | null> {
    let page = 1;
    while (page < 100) {
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
        console.log(`Usuario existente (${email}): se actualiza la contraseña y el rol.`);
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: { name },
        });
        if (error) throw error;
        userId = existing.id;
    } else {
        console.log(`Creando usuario nuevo (${email})…`);
        const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name },
        });
        if (error) throw error;
        if (!data.user) throw new Error('createUser no devolvió usuario');
        userId = data.user.id;
    }

    // El rol vive en public.users (el CHECK users_role_check ya acepta 'usuario_overlay').
    const { error: upsertError } = await admin
        .from('users')
        .upsert({ id: userId, email, name, role: ROLE }, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    console.log('\n✓ Usuario con overlays listo.');
    console.log(`  email:   ${email}`);
    console.log(`  user id: ${userId}`);
    console.log('\nEntrá en /login con ese email y la contraseña que pasaste: vas a ver "Overlays" en el perfil.');
}

main().catch((err) => {
    console.error('Falló la creación del usuario:', err);
    process.exit(1);
});
