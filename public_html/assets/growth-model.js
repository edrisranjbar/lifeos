import './goal-progress.js';
// Connections live separately; source workspaces remain the owners of their records.
export const KEY = 'edi_growth_v1';
export const dimensions = [
  {id:'spirituality', name:'Religion & Spirituality', icon:'✧', color:'#b69ce0', hint:'Faith, meaning and a grounded inner life.'},
  {id:'health', name:'Health', icon:'♡', color:'#39e6ad', hint:'Care for your body, energy and wellbeing.'},
  {id:'relationships', name:'Relationships & Family', icon:'◎', color:'#e9918c', hint:'Be present for the people who matter.'},
  {id:'finance', name:'Finance', icon:'↗', color:'#f3c969', hint:'Build security and make intentional money decisions.'},
  {id:'self-growth', name:'Self Growth', icon:'◈', color:'#7da5ee', hint:'Learn, create and become more capable.'},
  {id:'rest', name:'Fun & Rest', icon:'☼', color:'#6bc6ce', hint:'Make space for joy, recovery and curiosity.'}
];
export const array = value => Array.isArray(value) ? value : [];
export function read(key, fallback = {}) {
  const raw = appStorage.getItem(key);
  if (!raw) return fallback;
  // A corrupt document must not silently become a blank editable document.
  return JSON.parse(raw);
}
export function documentState() {
  const doc = read(KEY, {version:1, plans:[], reviews:[]});
  if (!doc || typeof doc !== 'object' || doc.version!==1 || !Array.isArray(doc.plans) || !Array.isArray(doc.reviews) || doc.plans.some(p=>!p || typeof p.id!=='string' || !dimensions.some(d=>d.id===p.dimensionId)) || doc.reviews.some(r=>!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))) throw Error('Growth data could not be read. Reload before editing.');
  return doc;
}
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addDays(day, count) { const date = new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+count); return date.toISOString().slice(0,10); }
export function sources() {
  const goals = array(read('edi_goals_v1').goals);
  return {goals};
}
export async function habitData() {
  return LifeGoalProgress.load(sources().goals,true);
}

export function goalProgress(goal, habit = null) {
  if(goal.progressSource) return LifeGoalProgress.result(goal,habit).pct;
  const tasks=array(goal.tasks), measures=array(goal.measures).length ? goal.measures : [{target:goal.target,current:goal.current}];
  const ratios=measures.filter(m=>Number(m.target)>0 && m.current!==null && m.current!==undefined && Number.isFinite(Number(m.current))).map(m=>Math.max(0,Math.min(100,Number(m.current)/Number(m.target)*100)));
  const parts=[];
  if (ratios.length) parts.push(ratios.reduce((a,b)=>a+b,0)/ratios.length);
  if (tasks.length) parts.push(tasks.filter(t=>t.done).length/tasks.length*100);
  return parts.length ? Math.round(parts.reduce((a,b)=>a+b,0)/parts.length) : null;
}
export function summary(plans, source, habit) {
  const goalIds=new Set(plans.flatMap(p=>array(p.goalIds)).map(String));
  const habitIds=new Set(plans.flatMap(p=>array(p.habitIds)).map(String));
  const goals=source.goals.filter(g=>goalIds.has(String(g.id)) && g.status!=='archived');
  const habits=habit ? habit.habits.filter(h=>habitIds.has(String(h.id))) : [];
  const percentages=goals.map(g=>goalProgress(g,habit)).filter(p=>p!==null);
  let eligible=0, completed=0;
  for (const h of habits) for (let i=0;i<7;i++) {
    const day=addDays(today(),-i);
    const date=h.created_at ? new Date(/Z$|[+-]\d\d:\d\d$/.test(h.created_at)?h.created_at:h.created_at.replace(' ','T')+'Z') : null;
    const created=date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : null;
    if (created && day<created) continue;
    eligible++; if (array(habit.logs[day]).map(String).includes(String(h.id))) completed++;
  }
  const missing= [...goalIds].filter(id=>!source.goals.some(g=>String(g.id)===id)).length + (habit ? [...habitIds].filter(id=>!habit.habits.some(h=>String(h.id)===id)).length : 0);
  return {goals,habits,goalPct:percentages.length?Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length):null,habitPct:eligible?Math.round(completed/eligible*100):null,eligible,completed,missing,habitLinks:habitIds.size};
}
export const cadenceDays={weekly:7,monthly:30,quarterly:90};
export function nextReview(doc, cadence) {
  const days = cadenceDays[cadence];
  if (!days) return null;
  const last=doc.reviews.filter(r=>r.cadence===cadence).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  return last ? addDays(last.date,days) : today();
}
