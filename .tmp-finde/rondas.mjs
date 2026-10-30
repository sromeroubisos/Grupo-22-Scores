import { sb } from './sb.mjs';
const ids=['ed986d61-7389-48e5-b478-c1703b0e8379','a4a4d389-5eaa-4e16-9024-81c54abe64cc','3a335922-dc88-42a8-84d3-c38b57b46bca','b6ed4086-2e75-4e68-962b-2d2363c9694c','8e21ce2b-459c-40f5-8012-d0968d6a4d95','d29703d0-125c-44a1-ab38-137450935a6e','6c91c204-f5d7-4d10-9f10-0b3171c5501b'];
const {data:ts}=await sb.from('tournaments').select('id,name,display_name,logo_url').in('id',ids);
for(const t of ts)console.log(t.id.slice(0,8),t.name,'|',t.display_name,'|',t.logo_url?.startsWith('data:')?'<base64>':t.logo_url);
const r=await sb.from('tournament_rounds').select('*').in('tournament_id',ids).limit(1);console.log(r.error?.message??Object.keys(r.data[0]??{}));
const {data:ms}=await sb.from('matches').select('id,tournament_id,date_time,round_id,round_uuid,round_label,status').in('tournament_id',['a4a4d389-5eaa-4e16-9024-81c54abe64cc','b6ed4086-2e75-4e68-962b-2d2363c9694c','8e21ce2b-459c-40f5-8012-d0968d6a4d95']).order('date_time');
const by={};for(const m of ms){const k=m.tournament_id.slice(0,8);const d=m.date_time.slice(0,10);(by[k]??={})[d]=(by[k][d]||0)+1;}
for(const [k,v] of Object.entries(by))console.log(k,Object.entries(v).map(([d,n])=>d.slice(5)+':'+n).join(' '));
console.log(ms.filter(m=>m.date_time>'2026-09-25').map(m=>[m.id.slice(0,8),m.round_id,m.round_uuid,m.round_label]));
