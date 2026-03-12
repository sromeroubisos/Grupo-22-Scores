import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1];
const SUPABASE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1];

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL or Key not found in .env.local');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log("Fetching unions matching 'cordobes' or 'Cordobesa'...");
    const { data: unions, error } = await supabase
        .from('unions')
        .select('*')
        .ilike('name', '%Cordobes%');

    if (error) {
        console.error("Error fetching unions:", error);
        return;
    }

    console.log("Found unions:");
    console.table(unions);

    if (!unions || unions.length === 0) return;

    // Pick one UUID as the target to keep, prefer proper UUIDs
    const targetUnion = unions.find(u => u.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));

    if (!targetUnion) {
        console.log("No valid UUID union found to keep as target.");
        return;
    }

    const targetId = targetUnion.id;
    const sourceIds = unions.filter(u => u.id !== targetId).map(u => u.id);

    console.log(`Target ID to keep: ${targetId}`);
    console.log(`Source IDs to merge: ${sourceIds}`);

    if (sourceIds.length === 0) {
        console.log("No other unions to merge.");
        return;
    }

    // Update clubs referencing sourceIds
    const { data: clubs, error: clubsErr } = await supabase
        .from('clubs')
        .select('id, union_id, name')
        .in('union_id', sourceIds);

    if (clubsErr) {
        console.error("Error fetching clubs:", clubsErr);
        return;
    }

    console.log(`Found ${clubs?.length || 0} clubs to update.`);
    if (clubs && clubs.length > 0) {
        for (const club of clubs) {
            console.log(`Updating club: ${club.name} (${club.id})`);
            const { error: updateErr } = await supabase
                .from('clubs')
                .update({ union_id: targetId })
                .eq('id', club.id);
            if (updateErr) {
                console.error("Error updating club:", updateErr);
            }
        }
    }

    // Update tournaments referencing sourceIds
    const { data: tournaments, error: tourneyErr } = await supabase
        .from('tournaments')
        .select('id, union_id, name')
        .in('union_id', sourceIds);

    if (tourneyErr) {
        console.error("Error fetching tournaments:", tourneyErr);
    } else {
        console.log(`Found ${tournaments?.length || 0} tournaments to update.`);
        if (tournaments && tournaments.length > 0) {
            for (const tournament of tournaments) {
                console.log(`Updating tournament: ${tournament.name} (${tournament.id})`);
                const { error: updateErr } = await supabase
                    .from('tournaments')
                    .update({ union_id: targetId })
                    .eq('id', tournament.id);
                if (updateErr) {
                    console.error("Error updating tournament:", updateErr);
                }
            }
        }
    }

    // Check if there are unions referencing them as parent_union_id
    const { data: parentUnions, error: parentUnionsErr } = await supabase
        .from('unions')
        .select('id, parent_union_id, name')
        .in('parent_union_id', sourceIds);

    if (parentUnions && parentUnions.length > 0) {
        for (const pu of parentUnions) {
            console.log(`Updating parent_union_id for union: ${pu.name} (${pu.id})`);
            await supabase.from('unions').update({ parent_union_id: targetId }).eq('id', pu.id);
        }
    }

    // Once everything is updated, delete the source unions
    for (const sourceId of sourceIds) {
        console.log(`Deleting union: ${sourceId}`);
        const { error: delErr } = await supabase
            .from('unions')
            .delete()
            .eq('id', sourceId);
        if (delErr) {
            console.error(`Error deleting union ${sourceId}:`, delErr);
        }
    }

    console.log("Merge complete!");
}

main().catch(console.error);
