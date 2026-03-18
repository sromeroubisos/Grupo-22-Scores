import { FixtureService } from './src/lib/services/fixtureService';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function runDiagnostic() {
  const tournamentId = '55f28144-3d92-484b-a57d-646e06740808';
  console.log(`Testing FixtureService.getTournamentFixture for: ${tournamentId}`);
  
  try {
    const fixture = await FixtureService.getTournamentFixture(tournamentId);
    
    if (!fixture) {
      console.log('RESULT: Fixture returned NULL');
      return;
    }
    
    console.log(`RESULT: Fixture found for "${fixture.tournamentName}"`);
    console.log(`Phases count: ${fixture.phases.length}`);
    console.log(`Participants count: ${fixture.participants.length}`);
    
    fixture.phases.forEach((p, pIdx) => {
      console.log(`\nPhase ${pIdx + 1}: ${p.name} (ID: ${p.id})`);
      console.log(`  Rounds count: ${p.rounds.length}`);
      
      p.rounds.forEach((r, rIdx) => {
        console.log(`    Round ${rIdx + 1}: ${r.name} (ID: ${r.id}) - Match count: ${r.matchCount}`);
        if (r.matches && r.matches.length > 0) {
          r.matches.forEach((m, mIdx) => {
            console.log(`      Match ${mIdx + 1}: ${m.homeClub?.name || 'Unknown'} vs ${m.awayClub?.name || 'Unknown'} (ID: ${m.id})`);
          });
        }
      });
    });

  } catch (error) {
    console.error('ERROR during diagnostic:', error);
  }
}

runDiagnostic();
