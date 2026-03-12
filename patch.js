const fs = require('fs');

let t = fs.readFileSync('src/lib/database.types.ts', 'utf8');

const tInsertRow = `
          sport: string | null
          category: string | null
          format: string | null
          country: string | null
          season_id: string | null
          age_grade: string | null
          is_visible: boolean
          region: string | null
          ruleset: any
          ruleset_version: number | null
          logo_url: string | null
          banner_url: string | null
          primary_color: string | null
          secondary_color: string | null
          streaming_url: string | null
          social_links: any
          sponsors: any`;
const tInsertOpt = tInsertRow.replace('is_visible: boolean', 'is_visible?: boolean');

const insertProperties = (tableName, target, properties) => {
    const tableIndex = t.indexOf(`      ${tableName}: {`);
    if (tableIndex === -1) return;

    // We only want to find the first occurrence of Row/Insert/Update *after* the table name
    const re = new RegExp(`(${tableName}:\\s*\\{[\\s\\S]*?${target}:\\s*\\{[^}]*)`);
    t = t.replace(re, (m, c) => `${c}${properties}`);
};

if (!t.match(/season_id:\s*string/)) {
    insertProperties('tournaments', 'Row', tInsertRow);
    insertProperties('tournaments', 'Insert', tInsertOpt);
    insertProperties('tournaments', 'Update', tInsertOpt);
}

const mInsert = `
          venue: string | null
          live_enabled: boolean | null`;
if (!t.match(/venue:\s*string/)) {
    insertProperties('matches', 'Row', mInsert);
    insertProperties('matches', 'Insert', mInsert);
    insertProperties('matches', 'Update', mInsert);
}

fs.writeFileSync('src/lib/database.types.ts', t);
