
import { getTournamentById } from '../src/lib/data/tournaments/index';

const id = 'rugby-championship';
const t = getTournamentById(id);

console.log('Tournament:', t);
console.log('URL:', t?.url);
