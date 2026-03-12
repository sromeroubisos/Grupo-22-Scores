const fs = require('fs');
let content = fs.readFileSync('src/lib/types/clubs.ts', 'utf8');

// Añadir campos extendidos a ClubCreateInput
const insertFields = `
  // Campos de perfil y anexos para Create
  categories?: string[] | null;
  gender?: string | null;
  age_grade?: string | null;
  secondary_unions?: string[];
  organization_role?: string | null;
  admin_contact_name?: string | null;
  admin_contact_email?: string | null;
  admin_contact_phone?: string | null;
  aliases?: string[];
  venue_name?: string | null;
  venue_address?: string | null;
  venue_capacity?: number | null;
  venue_notes?: string | null;
  website?: string | null;
  instagram?: string | null;
  x_url?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
`;

if (!content.includes('admin_contact_name?: string | null;')) {
    content = content.replace(/notes_internal\?:\s*string\s*\|\s*null;\n}/, 'notes_internal?: string | null;\n' + insertFields + '}');
    fs.writeFileSync('src/lib/types/clubs.ts', content);
}
