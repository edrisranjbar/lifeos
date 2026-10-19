import {dimensions,documentState,sources,summary,nextReview,today} from './growth-model.js?v=goal-measures-2';
export function mountGrowthOverview(main) {
  const section=document.createElement('section');section.className='dash-card growth-summary';section.setAttribute('aria-label','Personal growth dimensions');
  section.innerHTML='<div class="card-head"><div><span class="card-kicker">PERSONAL GROWTH</span><h3 class="card-title">Six dimensions. One direction.</h3></div><a href="#growth">Open Growth →</a></div><div class="growth-summary-grid" id="growthSummary"></div><p id="growthReviewHint" class="meta"></p>';
  main.querySelector('.dash-score').after(section);
  window.lifeOsI18n.apply(section);
  section.addEventListener('click',event=>{const link=event.target.closest('[data-growth-dimension]');if(!link)return;const frame=document.getElementById('growth');const url=new URL(frame.dataset.src,location.href);url.hash=link.dataset.growthDimension;frame.src=url.href;});
}
export function refreshGrowthOverview(habit) {
  const {t,number}=window.lifeOsI18n;
  const target=document.getElementById('growthSummary');if(!target)return;
  try {
    const doc=documentState(),source=sources();
    // All strings rendered here are fixed labels or derived numbers.
    target.innerHTML=dimensions.map(d=>{const plans=doc.plans.filter(p=>p.dimensionId===d.id&&p.status!=='archived'),s=summary(plans,source,habit);return `<a href="#growth" data-growth-dimension="${d.id}"><span style="color:${d.color}">${d.icon}</span> ${t(d.name)}<small>${s.goalPct===null?t('No measured goals'):t('{percent} SMART progress',{percent:t('{value}%',{value:number(s.goalPct)})})} · ${t('{count} long-term goals',{count:number(plans.length)})}</small></a>`;}).join('');
    const due=['weekly','monthly','quarterly'].filter(c=>nextReview(doc,c)<=today());
    document.getElementById('growthReviewHint').textContent=due.length?t('Review due: {cadences}. Take a moment to reflect in Growth.',{cadences:due.map(c=>t(c)).join(t(', '))}):t('Your periodic reviews are up to date.');
  }catch{target.textContent=t('Unable to read your growth connections. Open Growth to review.');}
}
