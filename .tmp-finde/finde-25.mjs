import { sb } from './sb.mjs';
const DESDE='2026-09-25T03:00:00Z', HASTA='2026-09-28T03:00:00Z';
let all=[];for(let from=0;;from+=1000){const {data,error}=await sb.from('matches').select('id,tournament_id,phase_id,status,date_time,round_label,sport_id').gte('date_time',DESDE).lt('date_time',HASTA).order('id').range(from,from+999);if(error)throw error;all=all.concat(data);if(data.length<1000)break;}
const tids=[...new Set(all.map(m=>m.tournament_id))].filter(Boolean);
const {data:ts,error}=await sb.from('tournaments').select('id,name,slug,sport_id,country').in('id',tids);if(error)throw error;
const tn=new Map(ts.map(t=>[t.id,t]));
const g={};for(const m of all){const k=m.tournament_id;(g[k]??=[]).push(m);}
for(const [k,v] of Object.entries(g).sort((a,b)=>(tn.get(a[0])?.name??'').localeCompare(tn.get(b[0])?.name??''))){const t=tn.get(k);const st={};v.forEach(m=>st[m.status]=(st[m.status]||0)+1);console.log(String(v.length).padStart(3),'|',t?.sport_id,'|',t?.name,'|',k,'|',JSON.stringify(st),'|',[...new Set(v.map(m=>m.round_label))].join(','));}
