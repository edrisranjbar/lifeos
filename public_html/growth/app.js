import '../assets/html-escape.js?v=issue19-1';
import {KEY, dimensions, array, documentState, sources, habitData, summary, goalProgress, today, nextReview} from '../assets/growth-model.js?v=goal-measures-2';
import {createReviewStepper} from './review-stepper.js?v=issue19-1';
import {shareReviewImage} from './share-image.js?v=issue19-1';
const $=id=>document.getElementById(id);
const esc = globalThis.lifeOsHtml.escapeHtml;
const {t,number}=window.lifeOsI18n;
const prettyDate=value=>value && !Number.isNaN(new Date(value+'T12:00:00Z').getTime())?window.lifeOsI18n.date(new Date(value+'T12:00:00Z'),{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'},'en-GB'):t('No target date');
let selected=dimensions.some(d=>d.id===location.hash.slice(1))?location.hash.slice(1):'spirituality';
let doc, source, habit=null, editing=null, baseline=null, refreshSequence=0, refreshing=false;
let reviewSaving=false;
const reviewStepper=createReviewStepper($('reviewDialog'),dimensions);
for (const id of ['addPlan','reviewBtn','refresh']) $(id).disabled=true;
const activePlans=id=>doc.plans.filter(p=>p.dimensionId===id && p.status!=='archived');
const snapshot=s=>({goalPct:s.goalPct,habitPct:s.habitPct,habitAvailable:!!habit,goals:s.goals.length,habits:s.habits.length,completed:s.completed,eligible:s.eligible});
function navigate(page, item={}) {
  const message={type:'growth-open',page,goalId:item.goalId,boardId:item.boardId,cardId:item.cardId};
  if (parent!==window) parent.postMessage(message,location.origin);
  else {
    const url=new URL(`../${page}/index.html`,location.href);
    if(item.goalId)url.searchParams.set('goal',item.goalId);
    if(item.boardId)url.searchParams.set('board',item.boardId);
    if(item.cardId)url.searchParams.set('card',item.cardId);
    location.href=url.href;
  }
}
const shortDate=value=>window.lifeOsI18n.date(new Date(value+'T12:00:00Z'),{day:'numeric',month:'short',timeZone:'UTC'},'en-GB');
const capital=value=>t(String(value||'').replace(/^./,c=>c.toUpperCase()));
const pct=value=>value===null||value===undefined?'—':t('{value}%',{value:number(value)});
const shareIcon='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';
async function shareReview(id,button) {
  const review=doc.reviews.find(r=>r.id===id);if(!review)return;
  button.disabled=true;
  try {const result=await shareReviewImage(review,dimensions,prettyDate(review.date));if(result==='downloaded')$('status').textContent=t('Review image downloaded. Share it wherever you like.');}
  catch(error){$('status').textContent=t(error.message||'Unable to create the review image.');}
  finally{button.disabled=false;}
}
function group(title,action,rows,empty) {
  return `<section class="link-group"><header><h4>${title}</h4>${action}</header>${rows.length?`<ul>${rows.join('')}</ul>`:`<p class="link-empty">${empty}</p>`}</section>`;
}
function render() {
  try {doc=documentState();source=sources();} catch(error){$('status').textContent=error.message;$('addPlan').disabled=true;$('reviewBtn').disabled=true;return;}
  $('addPlan').disabled=false;$('reviewBtn').disabled=false;
  $('cadences').innerHTML=['weekly','monthly','quarterly'].map(c=>{const next=nextReview(doc,c),due=next<=today();return `<button class="cadence${due?' is-due':''}" data-review="${c}" title="${esc(due?t('Start your {cadence} review',{cadence:t(c)}):t('Next {cadence} review: {date}',{cadence:t(c),date:prettyDate(next)}))}"><span class="cadence-name">${esc(capital(c))}</span><span class="cadence-when">${esc(due?t('Due now'):shortDate(next))}</span></button>`;}).join('');
  $('dimensions').innerHTML=dimensions.map(d=>{
    const plans=activePlans(d.id),s=summary(plans,source,habit);
    return `<button class="dimension" data-dimension="${d.id}" style="--tone:${d.color}" aria-pressed="${d.id===selected}">
      <span class="dimension-head"><span class="dimension-icon" aria-hidden="true">${d.icon}</span><span class="dimension-name">${d.name}</span></span>
      <span class="dimension-score${s.goalPct===null?' is-empty':''}"><strong>${s.goalPct===null?'—':number(s.goalPct)}</strong>${s.goalPct===null?'':`<small>${esc(t('%'))}</small>`}<span>${esc(t('SMART progress'))}</span></span>
      <span class="track" aria-hidden="true"><span style="width:${s.goalPct??0}%"></span></span>
      <span class="dimension-foot"><span>${esc(t('Habits'))} <b>${habit?pct(s.habitPct):'—'}</b></span><span>${esc(t('Plans'))} <b>${number(plans.length)}</b></span></span>
    </button>`;
  }).join('');
  const dimension=dimensions.find(d=>d.id===selected);
  $('detail').style.setProperty('--tone',dimension.color);
  $('dimensionIcon').textContent=dimension.icon;$('dimensionTitle').textContent=dimension.name;$('dimensionHint').textContent=dimension.hint;
  const plans=doc.plans.filter(p=>p.dimensionId===selected);
  $('plans').innerHTML=plans.length?plans.map(p=>{
    const s=summary([p],source,habit);
    const goalRows=s.goals.map(g=>{const value=goalProgress(g,habit),overdue=g.deadline&&g.deadline<today()&&array(g.tasks).some(t=>!t.done);return `<li><button class="link-row" data-goal="${esc(g.id)}"><span dir="auto">${esc(g.title)}</span><span class="link-value${overdue?' warning':''}">${overdue?esc(t('Overdue'))+' · ':''}${value===null?esc(t('No measures')):pct(value)}</span></button></li>`;});
    const habitRows=s.habits.map(h=>`<li><button class="link-row" data-page="habittify"><span dir="auto">${esc(h.name)}</span></button></li>`);
    const status=p.status||'active';
    return `<article class="plan">
      <header class="plan-head">
        <div class="plan-title"><h3 dir="auto">${esc(p.title)}</h3><div class="plan-meta"><span class="pill pill-${esc(status)}">${esc(capital(status))}</span><span>${p.targetDate?esc(t('Target {date}',{date:prettyDate(p.targetDate)})):esc(t('No target date'))}</span></div></div>
        <div class="plan-side"><div class="plan-progress"><strong>${pct(s.goalPct)}</strong><span>${esc(t('SMART'))}</span></div><button class="ghost" data-edit="${esc(p.id)}">${esc(t('Edit'))}</button></div>
      </header>
      ${p.why?`<p class="plan-why" dir="auto">${esc(p.why)}</p>`:''}
      <div class="plan-links">
        ${group(esc(t('SMART goals')),`<button class="text-link" data-page="goals">${esc(t('Manage'))}</button>`,goalRows,esc(t('No active goals linked.')))}
        ${group(esc(t('Habits')),`<button class="text-link" data-page="habittify">${esc(t('Manage'))}</button>`,habitRows,esc(t(habit?'No active habits linked.':'Habits unavailable right now.')))}
      </div>
      ${s.missing?`<p class="plan-warning">${esc(t(s.missing===1?'{count} saved connection is missing or no longer active. Edit to review.':'{count} saved connections are missing or no longer active. Edit to review.',{count:number(s.missing)}))}</p>`:''}
    </article>`;
  }).join(''):`<div class="empty"><strong>${esc(t('No long-term goals here yet.'))}</strong><span>${esc(t('Start with one meaningful direction, then connect the SMART goals and habits that move it forward.'))}</span></div>`;
  $('history').innerHTML=doc.reviews.length?[...doc.reviews].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(r=>{
    const noted=dimensions.filter(d=>r.notes?.[d.id]?.reflection||r.notes?.[d.id]?.next);
    return `<details class="history-entry"><summary><span class="history-name">${esc(t('{cadence} review',{cadence:capital(r.cadence)}))}</span><span class="history-meta">${esc(t('{count} of {total} reflected',{count:number(noted.length),total:number(dimensions.length)}))}</span><span class="history-date">${esc(prettyDate(r.date))}</span></summary><div class="history-actions"><button class="ghost share-btn" data-share="${esc(r.id)}">${shareIcon}${esc(t('Share as image'))}</button><span>${esc(t('Scores only. Your reflections stay private.'))}</span></div><div class="review-notes">${noted.map(d=>{const n=r.notes[d.id],s=r.snapshot?.[d.id]||{};return `<article class="review-note" style="--tone:${d.color}"><header><h3>${d.name}</h3><small>${esc(t('SMART'))} ${pct(s.goalPct??null)} · ${esc(t('Habits'))} ${pct(s.habitPct??null)}</small></header>${n.reflection?`<p dir="auto">${esc(n.reflection)}</p>`:''}${n.next?`<p class="review-next" dir="auto"><span>${esc(t('Next'))}</span>${esc(n.next)}</p>`:''}</article>`;}).join('')}</div></details>`;
  }).join(''):`<div class="empty"><strong>${esc(t('No reviews yet.'))}</strong><span>${esc(t('Your first review captures wins, obstacles and one practical next step for each dimension.'))}</span></div>`;
}
async function refresh() {
  const sequence=++refreshSequence;refreshing=true;$('refresh').disabled=true;
  try {await appStorage.sync();render();const next=await habitData();if(sequence!==refreshSequence)return;habit=next;$('status').textContent='';}
  catch(error){if(sequence!==refreshSequence)return;habit=null;$('status').textContent=t(error.message||'Unable to refresh. Please retry.');}
  finally{if(sequence===refreshSequence){refreshing=false;$('refresh').disabled=false;render();}}
}
function picker(name,title,items,selectedIds,disabled=false) {
  const ids=new Set(array(selectedIds).map(String));
  const missing=[...ids].filter(id=>!items.some(i=>String(i.id)===id));
  return `<fieldset><legend>${esc(t(title))}</legend><input type="search" class="picker-search" placeholder="${esc(t(title==='Habits'?'Search habits':'Search smart goals'))}" aria-label="${esc(t(title==='Habits'?'Search Habits':'Search SMART goals'))}" ${disabled?'disabled':''}><div class="picker-list">${items.map(i=>`<label data-search="${esc((i.title+' '+(i.group||'')).toLowerCase())}"><input type="checkbox" name="${name}" value="${esc(i.id)}" ${ids.has(String(i.id))?'checked':''} ${disabled?'disabled':''}><span dir="auto">${esc(i.title)}${i.group?`<small>${esc(i.group)}</small>`:''}</span></label>`).join('')}${missing.map(id=>`<label data-search="unavailable"><input type="checkbox" name="${name}" value="${esc(id)}" checked ${disabled?'disabled':''}><span>${esc(t('Unavailable record'))}<small>${esc(t('Retained connection. Uncheck to unlink.'))}</small></span></label>`).join('')}${!items.length&&!missing.length?`<p class="help">${esc(t('No records available. Use the original workspace to add them.'))}</p>`:''}</div></fieldset>`;
}
function openPlan(id=null) {
  editing=doc.plans.find(p=>p.id===id)||null;baseline=appStorage.getItem(KEY);
  $('planHeading').textContent=t(editing?'Edit long-term goal':'New long-term goal');
  $('planDimension').innerHTML=dimensions.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
  $('planDimension').value=editing?.dimensionId||selected;
  $('planTitle').value=editing?.title||'';$('planWhy').value=editing?.why||'';$('planDate').value=editing?.targetDate||'';$('planState').value=editing?.status||'active';
  $('pickers').innerHTML=picker('goalIds','SMART goals',source.goals.map(g=>({id:String(g.id),title:g.title,group:g.status==='archived'?t('Archived'):g.category})),editing?.goalIds)+picker('habitIds','Habits',habit?.habits.map(h=>({id:String(h.id),title:h.name,group:h.category}))||[],editing?.habitIds,!habit);
  $('planError').textContent='';$('planDialog').showModal();$('planTitle').focus();
}
function openReview(cadence='weekly') {
  baseline=appStorage.getItem(KEY);
  const reviews=[...doc.reviews].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  reviewStepper.open({cadence,habitAvailable:!!habit,lastDate:reviews[0]?prettyDate(reviews[0].date):null,stats:Object.fromEntries(dimensions.map(d=>[d.id,summary(activePlans(d.id),source,habit)])),previous:Object.fromEntries(dimensions.map(d=>[d.id,reviews.find(r=>r.notes?.[d.id]?.next)?.notes[d.id].next||'']))});
}
async function persist(next) {
  if (appStorage.getItem(KEY)!==baseline) throw Error(t('Your growth workspace changed while this form was open. Close and reopen it to use the latest connections.'));
  const value=JSON.stringify(next);
  await appStorage.mutateItem(KEY,async ({csrf,revision})=>{
    if(appStorage.getItem(KEY)!==baseline)throw Error(t('Growth data changed. Reopen this form before saving.'));
    const response=await fetch('/state.php',{method:'PUT',redirect:'error',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({key:KEY,value,revision})});
    const result=await response.json();
    if(!response.ok||!result.ok){const error=Error(t(result.error||'Unable to save. Please retry.'));error.stateConflict=response.status===409;throw error;}
    return {value,revision:result.revision};
  });
  render();$('status').textContent=t('Saved to your growth workspace.');
}
$('planForm').onsubmit=async event=>{
  event.preventDefault();if(!$('planTitle').value.trim()){$('planError').textContent=t('Enter a goal title.');return;}
  $('savePlan').disabled=true;
  try {
    const current=documentState(),form=new FormData(event.target),now=new Date().toISOString();
    const {taskKeys:_droppedTasks,...kept}=editing||{};
    const plan={...kept,id:editing?.id||crypto.randomUUID(),dimensionId:$('planDimension').value,title:$('planTitle').value.trim(),why:$('planWhy').value.trim(),targetDate:$('planDate').value||null,status:$('planState').value,goalIds:form.getAll('goalIds'),habitIds:habit?form.getAll('habitIds'):array(editing?.habitIds),createdAt:editing?.createdAt||now,updatedAt:now};
    const next={...current,plans:editing?current.plans.map(p=>p.id===editing.id?plan:p):[...current.plans,plan]};
    await persist(next);selected=plan.dimensionId;location.hash=selected;render();$('planDialog').close();
  }catch(error){$('planError').textContent=error.message;}finally{$('savePlan').disabled=false;}
};
$('reviewForm').onsubmit=async event=>{
  event.preventDefault();
  if(reviewSaving)return;
  if(!reviewStepper.isSummary()){reviewStepper.next();return;}
  reviewSaving=true;$('saveReview').disabled=true;reviewStepper.setBusy(true);
  try {
    // Capture current source activity, rather than the values at form opening.
    await appStorage.sync();
    try {habit=await habitData();} catch {habit=null;}
    const current=documentState(),form=new FormData(event.target),notes={},values={};
    for(const d of dimensions){notes[d.id]={reflection:String(form.get('reflection-'+d.id)||'').trim(),next:String(form.get('next-'+d.id)||'').trim()};values[d.id]=snapshot(summary(current.plans.filter(p=>p.dimensionId===d.id&&p.status!=='archived'),sources(),habit));}
    if(!Object.values(notes).some(n=>n.reflection||n.next))throw Error(t('Add a reflection or next step before completing your review.'));
    await persist({...current,reviews:[...current.reviews,{id:crypto.randomUUID(),cadence:$('cadence').value,date:today(),createdAt:new Date().toISOString(),notes,snapshot:values}]});reviewStepper.clearDraft();$('reviewDialog').close();
    const saved=documentState().reviews.at(-1);
    if(saved)$('status').innerHTML=`${esc(t('Review saved.'))} <button class="text-link status-share" data-share="${esc(saved.id)}">${esc(t('Share it as an image →'))}</button>`;
  }catch(error){$('reviewError').textContent=error.message;}finally{reviewSaving=false;$('saveReview').disabled=false;reviewStepper.setBusy(false);}
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-close')&&!(button.closest('dialog').id==='reviewDialog'?reviewSaving:$('savePlan').disabled))button.closest('dialog').close();
  if(button.dataset.dimension){selected=button.dataset.dimension;location.hash=selected;render();}
  if(button.dataset.share){shareReview(button.dataset.share,button);return;}
  if(button.dataset.review)openReview(button.dataset.review);
  if(button.dataset.edit)openPlan(button.dataset.edit);
  if(button.dataset.page)navigate(button.dataset.page);
  if(button.dataset.goal)navigate('goals',{goalId:button.dataset.goal});
});
document.addEventListener('input',event=>{if(!event.target.matches('.picker-search'))return;const q=event.target.value.toLowerCase();for(const row of event.target.closest('fieldset').querySelectorAll('[data-search]'))row.hidden=!row.dataset.search.includes(q);});
for (const dialog of [$('planDialog'),$('reviewDialog')]) dialog.addEventListener('cancel',event=>{if(dialog.id==='reviewDialog'?reviewSaving:$('savePlan').disabled)event.preventDefault();});
$('addPlan').onclick=()=>openPlan();$('reviewBtn').onclick=()=>openReview();$('refresh').onclick=refresh;
addEventListener('hashchange',()=>{if(dimensions.some(d=>d.id===location.hash.slice(1))){selected=location.hash.slice(1);render();}});
addEventListener('app-storage-change',render);
addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='growth-refresh'&&!refreshing)refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!refreshing)refresh();});
try {await window.appStorageReady;render();await refresh();}
catch(error){$('status').textContent=t('Unable to load your workspace. Reload to retry.');for(const id of ['addPlan','reviewBtn','refresh'])$(id).disabled=true;}
