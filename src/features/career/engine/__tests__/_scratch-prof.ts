import { runCareer, hashSeed, type Chooser } from '../../index.ts';
import type { Position } from '../../types/player.ts';
import type { StartRouteId } from '../../types/career.ts';
const ch: Chooser=(e,s)=>e.options[hashSeed(`${e.id}:${s.player.seasonsPlayed}`)%e.options.length].id;
const acc: Chooser=(e)=>{const m=e.options.find(o=>o.id.startsWith('move-'));return m?m.id:e.options[0].id};
// 1) apariciones de desarrollo (replica del test de market-routes)
const dev:number[]=[];
for(const nat of ['nz','fr','jp','za'])for(let i=0;i<40;i++){
 const st=runCareer({position:'centre',nationalityCountryCode:nat,origin:'academia-club',startRoute:'development'},(i+1)*7919,acc);
 for(const e of st.history)if(e.squadTrack==='development')dev.push(e.appearances);}
dev.sort((a,b)=>a-b);
console.log(`desarrollo: mediana ${dev[Math.floor(dev.length/2)]}  <10: ${Math.round(dev.filter(x=>x<10).length/dev.length*100)}%  max ${dev[dev.length-1]}`);
// 2) equilibrio de perfiles por grupo
const FW: Position[]=['prop','hooker','lock','backrow'];const BK: Position[]=['scrumhalf','flyhalf','centre','wing','fullback'];
const R: StartRouteId[]=['amateur','development','professional'];const C=['ar','fr','nz','gb-eng','za','jp'];
const rows:{prof:string;grp:string;peak:number;gap:number;peakAge:number;o22:number;o30:number}[]=[];
for(const [grp,POS] of [['forward',FW],['back',BK]] as const)
for(const pos of POS)for(const route of R)for(let i=0;i<40;i++){
 const st=runCareer({position:pos,nationalityCountryCode:C[i%C.length],startRoute:route},77000+i*89+pos.length*31,ch);
 const h=st.history;if(!h.length)continue;const o=h.map(x=>x.ovr);const peak=Math.max(...o);
 const at=(a:number)=>{const e=h.find(x=>x.age===a);return e?e.ovr:0};
 rows.push({prof:st.player.developmentProfile,grp,peak,gap:st.player.potential-peak,peakAge:h[o.indexOf(peak)].age,o22:at(22),o30:at(30)});}
const med=(x:number[])=>{const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
for(const grp of ['back','forward']){console.log(`\n-- ${grp} --  perfil | pico | brecha | edad pico | OVR22 | OVR30`);
 for(const p of ['early','normal','late']){const r=rows.filter(x=>x.grp===grp&&x.prof===p);if(!r.length)continue;
  const nz=(f:(x:typeof rows[0])=>number)=>med(r.map(f).filter(v=>v>0));
  console.log(`          ${p.padEnd(6)} | ${String(med(r.map(x=>x.peak))).padStart(4)} | ${String(med(r.map(x=>x.gap))).padStart(6)} | ${String(med(r.map(x=>x.peakAge))).padStart(9)} | ${String(nz(x=>x.o22)).padStart(5)} | ${String(nz(x=>x.o30)).padStart(5)}`)}}
