// Script to replace clubService.ts to also insert related tables
const fs = require('fs');

let service = fs.readFileSync('src/lib/services/clubService.ts', 'utf8');

// Find the return block:
// return {
//   success: true,
//   club: club as ClubCore,
// };

const insertRelationships = `
    // Insert Profile (Card 4, 6, 7)
    if (
      input.admin_contact_name || input.admin_contact_email || input.admin_contact_phone ||
      input.website || input.instagram || input.x_url || input.youtube || input.tiktok ||
      input.venue_name || input.venue_address || input.venue_capacity || input.venue_notes ||
      input.organization_role
    ) {
      await supabase.from('club_profile').insert({
        club_id: club.id,
        admin_contact_name: normalizeText(input.admin_contact_name),
        admin_contact_email: normalizeEmail(input.admin_contact_email),
        admin_contact_phone: normalizeText(input.admin_contact_phone),
        website: normalizeUrl(input.website),
        instagram: normalizeInstagram(input.instagram),
        x_url: normalizeX(input.x_url),
        youtube: normalizeYouTube(input.youtube),
        tiktok: normalizeTikTok(input.tiktok),
        venue_name: normalizeText(input.venue_name),
        venue_address: normalizeText(input.venue_address),
        venue_capacity: normalizeNumber(input.venue_capacity),
        venue_notes: normalizeText(input.venue_notes),
        // Wait, organization_role is not in the DB type ClubProfile. Let's omit it if it's absent, 
        // to prevent DB crashing.
      });
    }

    // Insert Aliases (Card 5)
    if (input.aliases && input.aliases.length > 0) {
      const aliasInserts = input.aliases.map(a => ({
        club_id: club.id,
        alias: normalizeText(a)
      })).filter(a => a.alias);
      
      if (aliasInserts.length > 0) {
        await supabase.from('club_aliases').insert(aliasInserts);
      }
    }

    // Insert Secondary Unions (Card 4)
    if (input.secondary_unions && input.secondary_unions.length > 0) {
      const suInserts = input.secondary_unions.map(uId => ({
        club_id: club.id,
        union_id: uId
      }));
      await supabase.from('club_secondary_unions').insert(suInserts);
    }
`;

if (!service.includes('await supabase.from(\'club_profile\').insert')) {
    service = service.replace(
        /return \{\s*success:\s*true,\s*club:\s*club\s*as\s*ClubCore,?\s*\};/,
        insertRelationships + '\n    return { success: true, club: club as ClubCore };'
    );
    fs.writeFileSync('src/lib/services/clubService.ts', service);
}
