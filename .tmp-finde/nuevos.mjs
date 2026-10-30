import { sb } from './sb.mjs';
const ids=['e5c74c61-ff94-4091-9773-ec7303088fdc','797e1b94-6397-4d73-a676-c166e40be5a9','d1c0af07-36ee-4234-8678-53fef1931e4f','1c4af912-d157-4c93-afd3-8dac0a4539b4','271638cc-3351-42ce-81bd-ef091e82515d','0b54dbb4-a823-4946-9783-2601f2d9c700'];
const {data:ts}=await sb.from('tournaments').select('id,name,logo_url').in('id',ids);
for(const t of ts)console.log(t.id.slice(0,8),t.name,'|',t.logo_url?.startsWith('data:')?'<b64>':t.logo_url);
const {data:ms}=await sb.from('matches').select('id,tournament_id,date_time,status,round_label,phase_id,venue,home_club_id,away_club_id').in('tournament_id',ids).gte('date_time','2026-09-25T03:00:00Z').lt('date_time','2026-09-28T03:00:00Z').order('date_time');
for(const m of ms)console.log(m.tournament_id.slice(0,8),m.date_time.slice(5,16),m.status,m.round_label,'|',m.home_club_id,'vs',m.away_club_id,'|',m.venue);
