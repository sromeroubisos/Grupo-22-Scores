const fs = require('fs');

let t = fs.readFileSync('src/lib/database.types.ts', 'utf8');

const tablesToAdd = {
    tournament_participants: {
        Row: { id: 'string', tournament_id: 'string', club_id: 'string', group_id: 'string | null', status: 'string' }
    },
    tournament_phases: {
        Row: { id: 'string', tournament_id: 'string', name: 'string | null', order_logic: 'number | null', type: 'string | null' }
    },
    tournament_groups: {
        Row: { id: 'string', phase_id: 'string', name: 'string | null' }
    },
    tournament_standings: {
        Row: { id: 'string', group_id: 'string', team_id: 'string', played: 'number', won: 'number', drawn: 'number', lost: 'number', points_for: 'number', points_against: 'number', points_difference: 'number', tries_for: 'number', tries_against: 'number', bonus_points: 'number', total_points: 'number' }
    },
    discipline_incidents: {
        Row: { id: 'string', action: 'string', actor_user_id: 'string', changes: 'Json', created_at: 'string', entity_id: 'string', entity_type: 'string', request_id: 'string | null', source: 'string | null', tournament_id: 'string|null', match_id: 'string|null', player_id: 'string|null', player_name: 'string|null' }
    },
    discipline_sanctions: {
        Row: { id: 'string', incident_id: 'string', summary: 'string', weeks: 'number', start_date: 'string', end_date: 'string|null' }
    },
    regulations: {
        Row: { id: 'string', scope_type: 'string', scope_id: 'string', content: 'string', updated_at: 'string' }
    }
};

let additionalTablesStr = '';
for (const [name, def] of Object.entries(tablesToAdd)) {
    const rowStr = Object.entries(def.Row).map(([k, v]) => `          ${k}: ${v}`).join('\n');
    const optRowStr = Object.entries(def.Row).map(([k, v]) => `          ${k}?: ${v}`).join('\n');
    additionalTablesStr += `
      ${name}: {
        Row: {\n${rowStr}\n        }
        Insert: {\n${optRowStr}\n        }
        Update: {\n${optRowStr}\n        }
        Relationships: []
      }
`;
}

t = t.replace(/(\n\s*)(\}\s*Views:\s*\{)/, (m, space, views) => {
    return space.replace('\n', '') + additionalTablesStr + '    ' + views;
});

fs.writeFileSync('src/lib/database.types.ts', t);
