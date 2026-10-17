// Derived progress: habit logs remain the single attendance record.
(() => {
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const measures = goal => Array.isArray(goal.measures) ? goal.measures : (goal.target != null ? [{target:goal.target,current:goal.current ?? null}] : []);
  function progressSource(goal) {
    if (goal.progressSource) return goal.progressSource;
    // Older numeric goals never saved a source; an empty checklist cannot track them.
    return !(goal.tasks || []).length && measures(goal).some(m => Number(m.target) > 0) ? 'measure' : 'checklist';
  }
  function result(goal, context) {
    const source=progressSource(goal);
    if(source==='habit') {
      const target=Number(goal.habitProgress?.targetDays), start=goal.startDate, end=goal.deadline;
      if(!context || !start || !end || !(target>0)) return {pct:null,done:null,total:target,unit:'days',source};
      const done=Object.entries(context.logs).filter(([date,ids])=>date>=start && date<=end && date<=today() && ids.map(String).includes(String(goal.habitProgress.habitId))).length;
      return {pct:done>=target?100:Math.min(99,Math.round(done/target*100)),done,total:target,unit:'days',source};
    }
    if(source==='measure') {
      const validMeasures=measures(goal).filter(m=>Number(m.target)>0);
      const pct=validMeasures.length ? Math.round(validMeasures.reduce((sum,m)=>sum+Math.max(0,Math.min(100,Number(m.current||0)/Number(m.target)*100)),0)/validMeasures.length):0;
      return {pct,done:null,total:null,unit:'measures',source};
    }
    const tasks=goal.tasks||[], done=tasks.filter(t=>t.done).length;
    return {pct:tasks.length?done===tasks.length?100:Math.min(99,Math.round(done/tasks.length*100)):0,done,total:tasks.length,unit:'tasks',source};
  }
  async function load(goals=[], includeHabits=false) {
    const end=today(), starts=goals.filter(g=>g.progressSource==='habit' && g.startDate && g.startDate<=end).map(g=>g.startDate);
    const week=new Date(end+'T12:00:00Z'); week.setUTCDate(week.getUTCDate()-6);
    const start=[week.toISOString().slice(0,10),...starts].sort()[0];
    const requests=[fetch(`/habittify/api.php?route=logs&start=${start}&end=${end}`,{cache:'no-store',redirect:'error'})];
    if(includeHabits)requests.push(fetch('/habittify/api.php?route=habits',{cache:'no-store',redirect:'error'}));
    const responses=await Promise.all(requests);
    if(responses.some(r=>!r.ok))throw Error('Habit progress unavailable. Refresh to retry.');
    const [logs,habits]=await Promise.all(responses.map(r=>r.json()));
    if(!logs.logs || typeof logs.logs!=='object' || (includeHabits && !Array.isArray(habits?.habits)))throw Error('Invalid habit response.');
    return {logs:logs.logs,habits:habits?.habits||[]};
  }
  window.LifeGoalProgress={result,source:progressSource,load,today};
})();
