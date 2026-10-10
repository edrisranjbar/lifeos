// Debts (money you owe) and credits (money owed to you), one-time or recurring.
// Paying a debt records an expense; receiving a credit records income.
const KEY='edi_obligations_v1', PERIODS='daramd_periods_v1', LEGACY='daramd_v1';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('en-US').format(value||0);
// Unit label from the currency chosen in Settings (amounts are never converted).
const unit=()=>window.lifeOsCurrency?.unit()??'Toman';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmt=(date,options)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));
const longDate=date=>fmt(date,{day:'numeric',month:'short',year:'numeric'});
const parse=key=>JSON.parse(appStorage.getItem(key)||'null');
function periods(){return parse(PERIODS)||{Current:parse(LEGACY)||{categories:[],expenses:[],incomes:[]}};}
const UNITS={daily:['day','days'],weekly:['week','weeks'],monthly:['month','months'],yearly:['year','years']};
const repeatLabel=(frequency,interval)=>interval===1?{daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly'}[frequency]:`Every ${interval} ${UNITS[frequency][1]}`;
// Words that change with direction, so every screen reads naturally.
const WORDS={
  debt:{tab:'I owe',kicker:'You owe',pay:'Pay',paid:'Paid',done:'paid',party:'Pay to',partyHint:'Person, bank or company',name:'Rent, loan, phone plan…',left:'Still to pay',record:'Record payment',defer:'Defer',empty:'Nothing you owe in this view.'},
  credit:{tab:'Owed to me',kicker:'Owed to you',pay:'Mark received',paid:'Received',done:'received',party:'From',partyHint:'Who pays you',name:'Loan to a friend, rent from tenant…',left:'Still to collect',record:'Record money received',defer:'Mark late',empty:'Nobody owes you anything in this view.'}
};
const params=new URLSearchParams(location.search);
let requested=params.get('payment'), payment=null, view=null, sequence=0, mutating=false, refreshTimer, action=null, editing=null;
let direction='debt', filter='open';
let month=/^\d{4}-(0[1-9]|1[0-2])/.test(params.get('due')||'')?params.get('due').slice(0,7):today().slice(0,7);

const root=document.createElement('section');root.id='obligations';root.className='obligations ledger-card';root.setAttribute('aria-labelledby','obHeading');
root.innerHTML=`<header class="ob-head">
  <div><span class="eyebrow">DEBTS &amp; CREDITS</span><h2 id="obHeading">Who owes what</h2><p>Money you owe and money owed to you, one-time or recurring. Paying or receiving updates your ledger.</p></div>
  <div class="ob-head-actions"><label class="ob-month"><span class="sr-only">Month</span><input id="obMonth" type="month" value="${month}" required aria-label="Month"></label><button id="obRefresh" class="ob-icon-btn" aria-label="Refresh" title="Refresh"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button><button id="obNew" class="btn-primary" disabled>＋ New</button></div>
</header>
<p id="obStatus" role="status" aria-live="polite">Loading…</p>
<div class="ob-sides" role="tablist" aria-label="Debts and credits">
  <button role="tab" id="obTab-debt" data-tab="debt" aria-controls="obPanel" class="ob-side ob-side-debt"></button>
  <button role="tab" id="obTab-credit" data-tab="credit" aria-controls="obPanel" class="ob-side ob-side-credit"></button>
</div>
<div id="obPanel" role="tabpanel" class="ob-panel">
  <div class="ob-stats" id="obStats"></div>
  <div class="ob-filters"><div class="ob-segment" role="group" aria-label="Show"><button data-filter="open">To do</button><button data-filter="paid" id="obFilterPaid">Done</button><button data-filter="rejected" id="obFilterRejected">Deferred</button><button data-filter="all">All</button></div><input id="obSearch" type="search" aria-label="Search" placeholder="Search name or person"></div>
  <div id="obList" class="ob-list"></div>
  <section class="ob-plans" aria-labelledby="obPlansHeading"><header><h3 id="obPlansHeading">Plans</h3><span class="ob-muted" id="obPlansCount"></span></header><div id="obPlans"></div></section>
</div>
<details class="ob-history"><summary>Recent activity</summary><div id="obHistory"></div></details>`;
document.querySelector('#pageRoot .main-grid').before(root);

function dialog(id,html){const d=document.createElement('dialog');d.id=id;d.className='ob-dialog';d.innerHTML=html;document.body.append(d);return d;}
const closeBtn='<button type="button" class="ob-close" data-close aria-label="Close">✕</button>';
const planDialog=dialog('obPlanDialog',`<form id="obPlanForm"><header class="ob-dialog-head"><h2 id="obPlanHeading">New entry</h2>${closeBtn}</header>
  <div class="ob-choice" role="radiogroup" aria-label="Direction"><label><input type="radio" name="direction" value="debt" checked><span><b>I owe</b><small>Money I need to pay</small></span></label><label><input type="radio" name="direction" value="credit"><span><b>Owed to me</b><small>Money I should receive</small></span></label></div>
  <div class="ob-tabs" role="radiogroup" aria-label="Schedule"><label><input type="radio" name="schedule" value="once" checked><span>One-time</span></label><label><input type="radio" name="schedule" value="recurring"><span>Recurring</span></label></div>
  <label>Name<input name="title" id="obTitle" required maxlength="180" dir="auto"></label>
  <label><span id="obPartyLabel">Pay to</span><input name="payee" id="obParty" maxlength="180" dir="auto"></label>
  <fieldset id="obRecurringMode" class="ob-tabs ob-tabs-sub" hidden><legend class="sr-only">Amount type</legend><label><input type="radio" name="mode" value="fixed" checked><span>Same amount each time</span></label><label><input type="radio" name="mode" value="split"><span>Split a total</span></label></fieldset>
  <div class="ob-fields"><label><span id="obAmountLabel">Amount · <span data-currency-unit>Toman</span></span><input name="amount" id="obAmount" type="number" inputmode="numeric" min="1" max="1000000000000" step="1" required></label><label><span id="obStartLabel">Due date</span><input name="startDate" id="obStart" type="date" min="2000-01-01" required></label></div>
  <div id="obRepeat" hidden>
    <div class="ob-fields"><label>Repeats every<span class="ob-inline"><input name="interval" id="obInterval" type="number" min="1" max="12" step="1" value="1" required><select name="frequency" id="obFrequency"><option value="monthly">month</option><option value="weekly">week</option><option value="yearly">year</option><option value="daily">day</option></select></span></label>
    <label id="obEndsLabel">Ends<select id="obEnds"><option value="never">Never</option><option value="count">After a number of payments</option><option value="date">On a date</option></select></label></div>
    <div class="ob-fields"><label id="obCountLabel" hidden>Number of payments<input name="count" id="obCount" type="number" min="1" max="600" step="1"></label><label id="obEndLabel" hidden>Last date<input name="endDate" id="obEnd" type="date"></label></div>
    <label class="ob-check" id="obOptionalLabel"><input id="obOptional" type="checkbox"> Optional subscription: I may skip a period</label>
  </div>
  <p id="obPreview" class="ob-preview"></p>
  <label>Notes<textarea name="notes" rows="2" maxlength="3000" dir="auto" placeholder="Optional"></textarea></label>
  <p class="ob-note">Amounts and dates are fixed once saved, so past dues never change. You can still rename an entry or delete it before anything is paid.</p>
  <p id="obPlanError" class="ob-error" role="alert"></p>
  <footer class="ob-dialog-actions"><button type="button" data-close class="btn-ghost">Cancel</button><button class="btn-primary" id="obSavePlan">Save</button></footer></form>`);
const editDialog=dialog('obEditDialog',`<form id="obEditForm"><header class="ob-dialog-head"><h2>Edit details</h2>${closeBtn}</header><label>Name<input id="obEditTitle" required maxlength="180" dir="auto"></label><label><span id="obEditPartyLabel">Pay to</span><input id="obEditParty" maxlength="180" dir="auto"></label><label>Notes<textarea id="obEditNotes" rows="3" maxlength="3000" dir="auto"></textarea></label><p class="ob-note">Amounts and dates stay as scheduled.</p><p id="obEditError" class="ob-error" role="alert"></p><footer class="ob-dialog-actions"><button type="button" data-close class="btn-ghost">Cancel</button><button class="btn-primary" id="obSaveEdit">Save</button></footer></form>`);
const payDialog=dialog('obPayDialog',`<form id="obPayForm"><header class="ob-dialog-head"><h2 id="obPayHeading">Record payment</h2>${closeBtn}</header><div class="ob-pay-summary" id="obPaySummary"></div><div class="ob-fields"><label>Ledger period<select id="obPayPeriod" required></select></label><label>Date<input id="obPayDate" type="date" required></label></div><label>In the ledger<select id="obPayMode"><option value="create" id="obPayCreate">Add a new expense</option><option value="link" id="obPayLink">Link an existing expense</option></select></label><label id="obCategoryLabel">Expense category<select id="obPayCategory"></select></label><label id="obEntryLabel" hidden><span id="obEntryText">Existing expense with the same amount</span><select id="obPayEntry"></select></label><label>Note<textarea id="obPayNote" rows="2" maxlength="1000" dir="auto" placeholder="Optional"></textarea></label><p id="obPayError" class="ob-error" role="alert"></p><footer class="ob-dialog-actions"><button type="button" data-close class="btn-ghost">Cancel</button><button class="btn-primary" id="obSavePayment">Confirm</button></footer></form>`);
const actionDialog=dialog('obActionDialog',`<form id="obActionForm"><header class="ob-dialog-head"><h2 id="obActionHeading"></h2>${closeBtn}</header><p id="obActionCopy" class="ob-dialog-copy"></p><label id="obStopLabel" hidden>Stop from<input id="obStopDate" type="date"></label><label id="obActionNoteLabel">Note<textarea id="obActionNote" rows="2" maxlength="1000" dir="auto" placeholder="Optional"></textarea></label><p id="obActionError" class="ob-error" role="alert"></p><footer class="ob-dialog-actions"><button type="button" data-close class="btn-ghost">Cancel</button><button class="btn-primary" id="obConfirmAction">Confirm</button></footer></form>`);
const dialogs=[planDialog,editDialog,payDialog,actionDialog];

const totalsFor=dir=>dir==='credit'?view.creditTotals:view.totals;
function statusOf(o){
  const w=WORDS[o.direction];
  if(o.paymentIssue)return['Check ledger','late'];
  if(o.status==='paid')return[w.paid,'done'];
  if(o.skipped)return['Skipped','muted'];
  if(o.status==='rejected')return[o.overdue?'Late · overdue':o.direction==='credit'?'Late':'Deferred','late'];
  if(o.overdue)return['Overdue','late'];
  return[o.date===today()?'Due today':'Upcoming','soon'];
}
function scheduleLabel(o){
  if(o.type==='once')return 'One-time';
  const repeat=repeatLabel(o.frequency,o.interval);
  return o.count?`${repeat} · ${o.index+1} of ${o.count}`:repeat;
}
function render(){
  if(!view)return;
  for(const dir of ['debt','credit']){
    const t=totalsFor(dir),w=WORDS[dir],tab=$('obTab-'+dir);
    tab.setAttribute('aria-selected',String(dir===direction));tab.tabIndex=dir===direction?0:-1;
    const due=t.remaining+t.carryOver;
    tab.innerHTML=`<span class="ob-side-label">${w.tab}</span><strong>${money(due)} <small>${esc(unit())}</small></strong><span class="ob-side-meta">${t.overdue+t.carryOver?`<em>${money(t.overdue+t.carryOver)} overdue</em>`:`${w.left.toLowerCase()} by month end`}</span>`;
  }
  const t=totalsFor(direction),w=WORDS[direction];
  $('obStats').innerHTML=[[`Due in ${fmt(month+'-15',{month:'long'})}`,t.committed,''],[w.paid,t.paid,'good'],[w.left,t.remaining,t.remaining?'warn':''],...(t.carryOver?[['From earlier months',t.carryOver,'bad']]:[])].map(([label,value,tone])=>`<div class="ob-stat ${tone}"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
  $('obFilterPaid').textContent=direction==='credit'?'Received':'Paid';
  $('obFilterRejected').textContent=direction==='credit'?'Late':'Deferred';
  root.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
  const q=$('obSearch').value.toLowerCase();
  const list=view.occurrences.filter(o=>o.direction===direction&&(filter==='all'||(filter==='open'?o.status!=='paid'&&!o.skipped:o.status===filter))&&`${o.title} ${o.payee}`.toLowerCase().includes(q));
  $('obList').innerHTML=list.length?list.map(o=>{
    const [label,tone]=statusOf(o),paid=o.decision.status==='paid';
    const more=paid?`<button data-ledger="${esc(o.decision.period)}" data-entry="${esc(o.decision.incomeId??o.decision.expenseId)}" data-kind="${o.direction==='credit'?'income':'expense'}">View in ledger</button><button data-action="undo" data-occurrence="${esc(o.id)}">Undo</button>`
      :o.status==='rejected'?`<button data-action="restore" data-occurrence="${esc(o.id)}">Mark as expected again</button>`
      :`<button data-action="reject" data-occurrence="${esc(o.id)}">${o.optional?'Skip this period':w.defer}</button>`;
    return `<article class="ob-row tone-${tone}${o.id===requested?' ob-selected':''}" data-id="${esc(o.id)}">
      <div class="ob-when" aria-label="${esc(longDate(o.date))}"><strong>${fmt(o.date,{day:'numeric'})}</strong><span>${fmt(o.date,{month:'short'})}${o.date.slice(0,4)!==month.slice(0,4)?' '+o.date.slice(0,4):''}</span></div>
      <div class="ob-info"><h4 dir="auto">${esc(o.title)}</h4><p>${o.payee?`<span dir="auto">${esc(o.payee)}</span> · `:''}${esc(scheduleLabel(o))}${o.optional?' · optional':''}</p>${o.decision.note?`<p class="ob-row-note" dir="auto">${esc(o.decision.note)}</p>`:''}${paid?`<p class="ob-row-note">${esc(w.paid)} ${esc(longDate(o.decision.paymentDate))} · ${esc(o.decision.period)}</p>`:''}</div>
      <div class="ob-amount"><strong>${money(o.amount)}</strong><span class="ob-pill ${tone}">${label}</span></div>
      <div class="ob-row-actions">${paid?'':`<button class="btn-primary ob-pay" data-pay="${esc(o.id)}">${w.pay}</button>`}<details class="ob-more"><summary aria-label="More actions for ${esc(o.title)}">⋯</summary><div class="ob-menu">${more}</div></details></div>
    </article>`;
  }).join(''):`<div class="ob-empty"><strong>${filter==='open'?'All clear.':'Nothing here.'}</strong><span>${w.empty} Use <b>＋ New</b> to add one, or pick another month.</span></div>`;
  const plans=view.plans.filter(p=>p.direction===direction);
  $('obPlansCount').textContent=plans.length?`${plans.length}`:'';
  $('obPlans').innerHTML=plans.length?plans.map(p=>{
    const finite=p.type!=='recurring'&&p.count>1,pct=finite&&p.totalAmount?Math.round(p.progress.paid/p.totalAmount*100):0;
    const terms=p.type==='once'?`One-time · due ${longDate(p.startDate)}`:`${repeatLabel(p.frequency,p.interval)} · from ${longDate(p.startDate)}${p.count&&p.type==='recurring'?` · ${p.count} payments`:''}${p.endDate?` · until ${longDate(p.endDate)}`:''}${p.cancelFrom?` · stopped from ${longDate(p.cancelFrom)}`:''}`;
    const amount=p.type==='recurring'?`${money(p.amount)} <small>each</small>`:`${money(p.totalAmount)} <small>total</small>`;
    return `<article class="ob-plan"><div class="ob-plan-main"><h4 dir="auto">${esc(p.title)}</h4><p>${p.payee?`<span dir="auto">${esc(p.payee)}</span> · `:''}${terms}</p>${finite?`<div class="ob-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.title)} progress"><span style="width:${pct}%"></span></div><p class="ob-progress-text">${money(p.progress.paid)} ${w.done} · ${money(p.progress.remaining)} left${p.count>1?` · ${p.progress.paidCount} of ${p.count}`:''}</p>`:''}${p.notes?`<p class="ob-row-note" dir="auto">${esc(p.notes)}</p>`:''}</div><div class="ob-plan-side"><strong>${amount}</strong><details class="ob-more"><summary aria-label="Plan actions for ${esc(p.title)}">⋯</summary><div class="ob-menu"><button data-edit="${esc(p.id)}">Edit details</button>${p.type==='recurring'&&!p.cancelFrom?`<button data-cancel="${esc(p.id)}">Stop future dues</button>`:''}<button data-delete="${esc(p.id)}" class="danger">Delete</button></div></details></div></article>`;
  }).join(''):`<p class="ob-muted">No plans yet.</p>`;
  const names=Object.fromEntries(view.plans.map(p=>[p.id,p.title]));
  const verbs={pay:'Recorded',undo:'Undid',reject:'Deferred',restore:'Restored',delete:'Deleted'};
  $('obHistory').innerHTML=view.history?.length?[...view.history].reverse().map(h=>`<p><span>${esc(new Date(h.at).toLocaleString('en-GB',{timeZone:'Asia/Tehran',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</span>${esc(verbs[h.action]||h.action)} · ${esc(names[h.occurrenceId.split(':')[0]]||(h.action==='delete'?h.note:'')||'Removed entry')}${h.note&&h.action!=='delete'?` · <i dir="auto">${esc(h.note)}</i>`:''}</p>`).join(''):'<p class="ob-muted">No activity yet.</p>';
  // Static controls (tabs, filters) outlive re-renders, so restore them after a save too.
  root.querySelectorAll('button').forEach(b=>b.disabled=mutating);
}
async function refresh(){
  const token=++sequence;$('obRefresh').disabled=true;
  try{
    const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    await appStorage.sync();
    const response=await fetch(`/finance-obligations.php?start=${first}&end=${last}`,{cache:'no-store',redirect:'error'}),result=await response.json();
    if(!response.ok)throw Error(result.error?.message||'Unable to load debts and credits.');
    if(token!==sequence)return;view=result.data;view.creditTotals??={scheduled:0,committed:0,paid:0,remaining:0,skipped:0,overdue:0,carryOver:0};
    render();$('obStatus').textContent='';
    if(requested){const row=[...root.querySelectorAll('[data-id]')].find(r=>r.dataset.id===requested);row?.scrollIntoView({block:'center',behavior:'auto'});requested=null;}
  }catch(error){if(token===sequence)$('obStatus').textContent=error.message;}
  finally{if(token===sequence)$('obRefresh').disabled=mutating;}
}
async function mutate(payload){
  mutating=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
  for(const d of dialogs)d.querySelector('form').inert=true;
  const keys=['pay','undo'].includes(payload.action)?[KEY,PERIODS,LEGACY]:[KEY];
  try{
    await appStorage.mutateItems(keys,async({csrf,revisions})=>{
      const response=await fetch('/finance-obligations.php',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...payload,revisions})});
      const result=await response.json();
      if(!response.ok){const error=Error(result.error?.message||'Unable to save.');error.stateConflict=response.status===409&&result.error?.code==='state_conflict';throw error;}
      return result.data;
    });
    await refresh();
  }finally{mutating=false;for(const d of dialogs)d.querySelector('form').inert=false;render();$('obRefresh').disabled=false;}
}

// ── New entry dialog ────────────────────────────────────────────────
const choice=name=>planDialog.querySelector(`input[name="${name}"]:checked`).value;
function planFields(){
  const dir=choice('direction'),w=WORDS[dir],recurring=choice('schedule')==='recurring',split=recurring&&choice('mode')==='split',ends=$('obEnds').value;
  $('obPlanHeading').textContent=dir==='credit'?'Money owed to me':'Money I owe';
  $('obTitle').placeholder=w.name;$('obPartyLabel').textContent=w.party;$('obParty').placeholder=w.partyHint;
  $('obRecurringMode').hidden=!recurring;$('obRepeat').hidden=!recurring;
  $('obAmountLabel').textContent=split?`Total amount · ${unit()}`:recurring?`Amount each time · ${unit()}`:`Amount · ${unit()}`;
  $('obStartLabel').textContent=recurring?'First due date':'Due date';
  // A split total always needs a payment count; a fixed amount can run forever.
  $('obEndsLabel').hidden=split;
  $('obCountLabel').hidden=!recurring||!(split||ends==='count');$('obCount').required=!$('obCountLabel').hidden;$('obCount').disabled=$('obCountLabel').hidden;
  $('obEndLabel').hidden=!recurring||split||ends!=='date';$('obEnd').required=!$('obEndLabel').hidden;$('obEnd').disabled=$('obEndLabel').hidden;
  $('obOptionalLabel').hidden=!recurring||split||dir!=='debt';if($('obOptionalLabel').hidden)$('obOptional').checked=false;
  const amount=Number($('obAmount').value),count=Number($('obCount').value),start=$('obStart').value,every=repeatLabel($('obFrequency').value,Number($('obInterval').value)||1).toLowerCase();
  let text='';
  if(!amount||!start)text='';
  else if(!recurring)text=`${money(amount)} ${unit()} ${dir==='credit'?'to receive':'to pay'} on ${longDate(start)}.`;
  else if(split)text=count>0&&amount>=count?`${count} payments of ${money(Math.floor(amount/count))} ${unit()}, ${every}, starting ${longDate(start)}${amount%count?` (last one ${money(Math.floor(amount/count)+amount%count)})`:''}.`:'Enter how many payments to split the total into.';
  else text=`${money(amount)} ${unit()} ${every}, starting ${longDate(start)}${ends==='count'&&count?`, ${count} times`:ends==='date'&&$('obEnd').value?`, until ${longDate($('obEnd').value)}`:', with no end date'}.`;
  $('obPreview').textContent=text;
}
function openNew(){
  $('obPlanForm').reset();
  planDialog.querySelector(`input[name="direction"][value="${direction}"]`).checked=true;
  $('obStart').value=today();$('obPlanError').textContent='';planFields();planDialog.showModal();$('obTitle').focus();
}
planDialog.addEventListener('change',planFields);planDialog.addEventListener('input',planFields);
$('obPlanForm').onsubmit=async event=>{
  event.preventDefault();$('obSavePlan').disabled=true;
  try{
    const form=new FormData(event.target),dir=choice('direction'),recurring=choice('schedule')==='recurring',split=recurring&&choice('mode')==='split',amount=Number(form.get('amount')),ends=$('obEnds').value;
    const base={title:form.get('title').trim(),payee:form.get('payee').trim(),direction:dir,startDate:form.get('startDate'),notes:form.get('notes').trim(),frequency:$('obFrequency').value,interval:Number($('obInterval').value)||1};
    const plan=!recurring?{...base,type:'once',amount}
      :split?{...base,type:'installment',totalAmount:amount,count:Number($('obCount').value)}
      :{...base,type:'recurring',amount,optional:$('obOptional').checked,count:ends==='count'?Number($('obCount').value):null,endDate:ends==='date'?$('obEnd').value:null};
    await mutate({action:'create',plan});direction=dir;filter='open';planDialog.close();render();
  }catch(error){$('obPlanError').textContent=error.message;}finally{$('obSavePlan').disabled=false;}
};

// ── Edit, pay, and confirm dialogs ──────────────────────────────────
function openEdit(id){
  editing=view.plans.find(p=>p.id===id);if(!editing)return;
  $('obEditTitle').value=editing.title;$('obEditParty').value=editing.payee||'';$('obEditNotes').value=editing.notes||'';
  $('obEditPartyLabel').textContent=WORDS[editing.direction].party;$('obEditError').textContent='';editDialog.showModal();
}
$('obEditForm').onsubmit=async event=>{
  event.preventDefault();$('obSaveEdit').disabled=true;
  try{await mutate({action:'update',planId:editing.id,plan:{title:$('obEditTitle').value.trim(),payee:$('obEditParty').value.trim(),notes:$('obEditNotes').value.trim()}});editDialog.close();}
  catch(error){$('obEditError').textContent=error.message;}finally{$('obSaveEdit').disabled=false;}
};
function paymentOptions(){
  const credit=payment.direction==='credit',p=periods()[$('obPayPeriod').value]||{},link=$('obPayMode').value==='link',ledger=credit?'incomes':'expenses',key=credit?'incomeId':'expenseId';
  $('obCategoryLabel').hidden=link||credit;$('obPayCategory').required=!link&&!credit;
  $('obEntryLabel').hidden=!link;$('obPayEntry').required=link;
  $('obPayCategory').innerHTML=(p.categories||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
  const used=new Set(Object.values(parse(KEY)?.decisions||{}).filter(d=>d.status==='paid'&&d.period===$('obPayPeriod').value).map(d=>String(d[key])));
  const choices=(p[ledger]||[]).filter(e=>Number(e.amount)===payment.amount&&!used.has(String(e.id)));
  $('obPayEntry').innerHTML=`<option value="">${choices.length?'Choose one':'None with this exact amount'}</option>`+choices.map(e=>`<option value="${esc(e.id)}">${esc(credit?e.name||'Income':`${e.date} · ${e.desc||'Expense'}`)} · ${money(e.amount)}</option>`).join('');
}
function openPay(id){
  payment=view.occurrences.find(o=>o.id===id);if(!payment)return;
  const credit=payment.direction==='credit',w=WORDS[payment.direction];
  $('obPayHeading').textContent=w.record;
  $('obPaySummary').innerHTML=`<strong>${money(payment.amount)} <small>${esc(unit())}</small></strong><span dir="auto">${esc(payment.title)}${payment.payee?' · '+esc(payment.payee):''}</span><span>Due ${esc(longDate(payment.date))}</span>`;
  $('obPayCreate').textContent=credit?'Add it as new income':'Add a new expense';
  $('obPayLink').textContent=credit?'Link an income already in the ledger':'Link an expense already in the ledger';
  $('obEntryText').textContent=credit?'Income with the same amount':'Expense with the same amount';
  $('obSavePayment').textContent=credit?'Mark received':'Confirm payment';
  $('obPayPeriod').innerHTML=Object.keys(periods()).map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const active=appStorage.getItem('daramd_active_period_v1');if(periods()[active])$('obPayPeriod').value=active;
  $('obPayMode').value='create';$('obPayDate').value=today();$('obPayDate').max=today();$('obPayNote').value='';$('obPayError').textContent='';paymentOptions();payDialog.showModal();
}
$('obPayPeriod').onchange=paymentOptions;$('obPayMode').onchange=paymentOptions;
$('obPayForm').onsubmit=async event=>{
  event.preventDefault();$('obSavePayment').disabled=true;
  try{
    const link=$('obPayMode').value==='link',credit=payment.direction==='credit';
    await mutate({action:'pay',occurrenceId:payment.id,period:$('obPayPeriod').value,categoryId:!link&&!credit?$('obPayCategory').value:'',[credit?'incomeId':'expenseId']:link?$('obPayEntry').value:'',paymentDate:$('obPayDate').value,note:$('obPayNote').value.trim()});
    payDialog.close();
  }catch(error){$('obPayError').textContent=error.message;}finally{$('obSavePayment').disabled=false;}
};
function openAction(name,id){
  const item=view.occurrences.find(o=>o.id===id),plan=view.plans.find(p=>p.id===id),credit=(item||plan)?.direction==='credit';
  action={action:name,...(['cancel','delete'].includes(name)?{planId:id}:{occurrenceId:id})};
  $('obActionHeading').textContent={cancel:'Stop future dues',delete:'Delete this entry?',undo:credit?'Undo receipt':'Undo payment',reject:item?.optional?'Skip this period':credit?'Mark as late':'Defer payment',restore:'Mark as expected again'}[name];
  $('obActionCopy').textContent={
    cancel:'No new dues are created from the chosen date. Earlier dues and anything already recorded stay as they are.',
    delete:`“${plan?.title||''}” and all of its upcoming dues will be removed. This is meant for mistakes; it only works while nothing has been ${credit?'received':'paid'}.`,
    undo:`The ${credit?'income':'expense'} created for this ${credit?'receipt':'payment'} is removed from the ledger (if you haven’t edited it). A linked existing entry is kept and just unlinked.`,
    reject:item?.optional?'Only this period is skipped. The next one stays scheduled.':credit?'The amount is still owed to you. It stays expected and shows as overdue after the due date.':'The amount is still owed. Deferring does not move the due date; it shows as overdue after it.',
    restore:'This due becomes expected again.'
  }[name];
  $('obConfirmAction').textContent=name==='delete'?'Delete':'Confirm';$('obConfirmAction').classList.toggle('ob-danger',name==='delete');
  $('obStopLabel').hidden=name!=='cancel';$('obStopDate').required=name==='cancel';$('obStopDate').value=today();$('obStopDate').min=today();
  $('obActionNoteLabel').hidden=!['reject','restore'].includes(name);$('obActionNote').value='';$('obActionError').textContent='';actionDialog.showModal();
}
$('obActionForm').onsubmit=async event=>{
  event.preventDefault();$('obConfirmAction').disabled=true;
  try{await mutate({...action,...(action.action==='cancel'?{cancelFrom:$('obStopDate').value}:['reject','restore'].includes(action.action)?{note:$('obActionNote').value.trim()}:{})});actionDialog.close();}
  catch(error){$('obActionError').textContent=error.message;}finally{$('obConfirmAction').disabled=false;}
};

// ── Events ──────────────────────────────────────────────────────────
function selectTab(dir,focus=false){direction=dir;render();if(focus)$('obTab-'+dir).focus();}
$('obNew').onclick=openNew;
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  // Close open "more" menus when clicking elsewhere.
  for(const menu of document.querySelectorAll('.ob-more[open]'))if(!menu.contains(event.target))menu.open=false;
  if(!button||mutating)return;
  if(button.hasAttribute('data-close')&&button.closest('.ob-dialog')){button.closest('dialog').close();return;}
  button.closest('.ob-more')?.removeAttribute('open');
  if(button.dataset.tab)selectTab(button.dataset.tab);
  if(button.dataset.filter){filter=button.dataset.filter;render();}
  if(button.dataset.pay)openPay(button.dataset.pay);
  if(button.dataset.action)openAction(button.dataset.action,button.dataset.occurrence);
  if(button.dataset.cancel)openAction('cancel',button.dataset.cancel);
  if(button.dataset.delete)openAction('delete',button.dataset.delete);
  if(button.dataset.edit)openEdit(button.dataset.edit);
  if(button.dataset.ledger){
    window.switchPeriod?.(button.dataset.ledger);
    const attr=button.dataset.kind==='income'?'data-income-id':'data-expense-id';
    const row=[...document.querySelectorAll(`[${attr}]`)].find(r=>r.getAttribute(attr)===button.dataset.entry);
    document.querySelectorAll('.ob-expense-highlight').forEach(r=>r.classList.remove('ob-expense-highlight'));
    row?.classList.add('ob-expense-highlight');(row||$('txTable'))?.scrollIntoView({block:'center'});
  }
});
root.querySelector('[role=tablist]').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();selectTab(direction==='debt'?'credit':'debt',true);
});
for(const d of dialogs)d.addEventListener('cancel',event=>{if(mutating)event.preventDefault();});
$('obMonth').onchange=()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test($('obMonth').value)){month=$('obMonth').value;refresh();}};
$('obRefresh').onclick=refresh;$('obSearch').oninput=render;
addEventListener('app-storage-change',()=>{if(!mutating){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);}});
addEventListener('finance-open-payment',async event=>{
  const id=event.detail?.id;if(!id||mutating)return;
  try{
    const response=await fetch('/finance-obligations.php?occurrence='+encodeURIComponent(id),{cache:'no-store',redirect:'error'}),result=await response.json();
    if(!response.ok)throw Error(result.error?.message||'Unable to open this due.');
    requested=id;month=result.data.date.slice(0,7);$('obMonth').value=month;direction=result.data.direction||'debt';filter='all';$('obSearch').value='';await refresh();
  }catch(error){$('obStatus').textContent=error.message;}
});
addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='finance-refresh')refresh();});
setInterval(()=>{if(document.visibilityState==='visible'&&!window.frameElement?.hidden&&!mutating)refresh();},60000);
try{await window.appStorageReady;await refresh();}catch{$('obStatus').textContent='Unable to load debts and credits. Reload to retry.';}
