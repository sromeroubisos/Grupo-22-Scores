import { sb } from './sb.mjs';
const ids=['ed986d61-7389-48e5-b478-c1703b0e8379','a4a4d389-5eaa-4e16-9024-81c54abe64cc','3a335922-dc88-42a8-84d3-c38b57b46bca','b6ed4086-2e75-4e68-962b-2d2363c9694c','8e21ce2b-459c-40f5-8012-d0968d6a4d95','d29703d0-125c-44a1-ab38-137450935a6e','6c91c204-f5d7-4d10-9f10-0b3171c5501b'];
const {data}=await sb.from('matches').select('id,tournament_id,status').in('tournament_id',ids).gte('date_time','2026-09-25T03:00:00Z').lt('date_time','2026-09-28T03:00:00Z');
console.log(JSON.stringify(data));
