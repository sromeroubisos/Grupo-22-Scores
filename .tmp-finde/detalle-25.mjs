import { sb } from './sb.mjs';
const IDS={
 'interior-a':'ed986d61-7389-48e5-b478-c1703b0e8379',
 'urba-top-14':'d29703d0-125c-44a1-ab38-137450935a6e',
 'noa-a':'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
 'noa-b':'3a335922-dc88-42a8-84d3-c38b57b46bca',
 'urba-segunda':'6c91c204-f5d7-4d10-9f10-0b3171c5501b',
 'super-9-b':'b6ed4086-2e75-4e68-962b-2d2363c9694c',
 'copa-plata-oeste':'8e21ce2b-459c-40f5-8012-d0968d6a4d95',
};
const {data:ms,error}=await sb.from('matches').select('*').in('tournament_id',Object.values(IDS)).gte('date_time','2026-09-20T00:00:00Z').lt('date_time','2026-10-02T00:00:00Z').order('date_time');
if(error)throw error;
console.log(Object.keys(ms[0]).join(','));
const phaseIds=[...new Set(ms.map(m=>m.phase_id).filter(Boolean))];
const {data:ph}=await sb.from('tournament_phases').select('id,name,type').in('id',phaseIds);
const pn=new Map((ph??[]).map(p=>[p.id,p.name+'/'+p.type]));
const cids=[...new Set(ms.flatMap(m=>[m.home_club_id,m.away_club_id]))].filter(Boolean);
const {data:cs}=await sb.from('clubs').select('id,name,short_name').in('id',cids);
const cn=new Map(cs.map(c=>[c.id,c.short_name||c.name]));
for(const [slug,id] of Object.entries(IDS)){console.log('\n##',slug);for(const m of ms.filter(m=>m.tournament_id===id)){const ar=new Date(Date.parse(m.date_time)-3*3600e3).toISOString().slice(0,16).replace('T',' ');console.log(m.id.slice(0,8),ar,m.status,'|',cn.get(m.home_club_id)??m.home_club_id,'vs',cn.get(m.away_club_id)??m.away_club_id,'|',m.round_label,'|',pn.get(m.phase_id),'| grp',m.group_id?.slice(0,8),'|',m.venue??m.venue_name??'');}}
