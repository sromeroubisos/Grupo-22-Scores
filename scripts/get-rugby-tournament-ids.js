/**
 * Script to get FlashScore IDs for all rugby tournaments
 */

const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Main rugby tournaments to fetch IDs for
const RUGBY_TOURNAMENTS = [
    { name: 'Six Nations', url: '/rugby-union/europe/six-nations/' },
    { name: 'Rugby Championship', url: '/rugby-union/world/rugby-championship/' },
    { name: 'Super Rugby Americas', url: '/rugby-union/south-america/super-rugby-americas/' },
    { name: 'United Rugby Championship', url: '/rugby-union/world/united-rugby-championship/' },
    { name: 'Super Rugby', url: '/rugby-union/world/super-rugby/' },
    { name: 'Premiership Rugby', url: '/rugby-union/england/premiership-rugby/' },
    { name: 'Top 14', url: '/rugby-union/france/top-14/' },
    { name: 'Currie Cup', url: '/rugby-union/south-africa/currie-cup/' },
    { name: 'Bunnings NPC', url: '/rugby-union/new-zealand/bunnings-npc/' },
    { name: 'Top 14 Argentina', url: '/rugby-union/argentina/top-14/' },
];

async function getTournamentIds(url) {
    try {
        const response = await fetch(
            `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodeURIComponent(url)}`,
            {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': API_HOST,
                    'x-rapidapi-key': API_KEY
                }
            }
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching IDs for ${url}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🏉 FETCHING FLASHSCORE IDS FOR RUGBY TOURNAMENTS\n');
    console.log('='.repeat(80));

    const results = [];

    for (const tournament of RUGBY_TOURNAMENTS) {
        console.log(`\nFetching: ${tournament.name}`);
        console.log(`URL: ${tournament.url}`);

        const ids = await getTournamentIds(tournament.url);

        if (ids && ids.tournament_id) {
            console.log('✅ Found IDs:');
            console.log(`  tournament_id: "${ids.tournament_id}"`);
            console.log(`  tournament_stage_id: "${ids.tournament_stage_id || 'N/A'}"`);
            console.log(`  tournament_template_id: "${ids.tournament_template_id || 'N/A'}"`);
            console.log(`  season_id: "${ids.season_id || 'N/A'}"`);

            results.push({
                name: tournament.name,
                url: tournament.url,
                ids: {
                    tournamentId: ids.tournament_id,
                    tournamentStageId: ids.tournament_stage_id,
                    tournamentTemplateId: ids.tournament_template_id,
                    seasonId: ids.season_id
                }
            });
        } else {
            console.log('❌ No IDs found');
            results.push({
                name: tournament.name,
                url: tournament.url,
                ids: null
            });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📋 TYPESCRIPT CODE TO ADD TO RUGBY.TS:\n');

    results.forEach(result => {
        if (result.ids) {
            console.log(`// ${result.name}`);
            console.log(`flashScoreIds: {`);
            console.log(`    tournamentId: '${result.ids.tournamentId}',`);
            console.log(`    tournamentStageId: '${result.ids.tournamentStageId}',`);
            console.log(`    tournamentTemplateId: '${result.ids.tournamentTemplateId}',`);
            console.log(`    seasonId: '${result.ids.seasonId}'`);
            console.log(`},\n`);
        }
    });

    console.log('='.repeat(80));
    console.log(`\n✅ Processed ${results.length} tournaments`);
    console.log(`✅ Found IDs for ${results.filter(r => r.ids).length} tournaments`);
}

main().catch(console.error);
