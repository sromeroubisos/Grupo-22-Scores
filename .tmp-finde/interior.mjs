import { sb } from './sb.mjs';
const {data}=await sb.from('matches').select('id,phase_id,date_time,status,home_club_id,away_club_id,notes').in('phase_id',['e56f6f25-839f-48f5-bfb9-5f8bcfc2f216','f0b6a674-5f4e-4c64-a10c-000000000000']).order('date_time');
console.log(data);
const {data:ph}=await sb.from('tournament_phases').select('id,name,type,tournament_id,order_index').eq('tournament_id','ed986d61-7389-48e5-b478-c1703b0e8379');console.log(ph);
const {data:rep}=await sb.from('matches').select('id,date_time,status,home_club_id,away_club_id,notes').eq('tournament_id','ed986d61-7389-48e5-b478-c1703b0e8379').gte('date_time','2026-09-01').order('date_time');console.log(rep.map(m=>[m.date_time.slice(0,16),m.status,m.home_club_id,m.away_club_id,m.notes].join(' | ')));
