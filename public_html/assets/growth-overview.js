import {dimensions,dimensionIcon,documentState,sources,summary,nextReview,today} from './growth-model.js?v=persian-1';
const ARROW='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export function mountGrowthOverview(main) {
  const section=document.createElement('section');section.className='dash-card growth-summary';section.setAttribute('aria-label','Personal growth dimensions');
  section.innerHTML=`<div class="card-head"><div><span class="card-kicker">PERSONAL GROWTH</span><h3 class="card-title">Six dimensions. One direction.</h3></div><a class="growth-open" href="#growth">${window.lifeOsI18n.t("Open Growth")} ${ARROW}</a></div><div class="growth-summary-grid" id="growthSummary"></div><div class="growth-review" id="growthReviewHint" role="status"></div>`;
  main.querySelector('.dash-score').after(section);
  window.lifeOsI18n.apply(section);
  section.addEventListener('click',event=>{const link=event.target.closest('[data-growth-dimension]');if(!link)return;const frame=document.getElementById('growth');const url=new URL(frame.dataset.src,location.href);url.hash=link.dataset.growthDimension;frame.src=url.href;});
}
// "weekly, monthly and quarterly" reads better than a comma list.
const listText=items=>new Intl.ListFormat(window.lifeOsI18n.locale(),{style:'long',type:'conjunction'}).format(items);
export function refreshGrowthOverview(habit) {
  const {t,number}=window.lifeOsI18n;
  const target=document.getElementById('growthSummary'),hint=document.getElementById('growthReviewHint');if(!target)return;
  try {
    const doc=documentState(),source=sources();
    // All strings rendered here are fixed labels or derived numbers.
    target.innerHTML=dimensions.map(d=>{
      const plans=doc.plans.filter(p=>p.dimensionId===d.id&&p.status!=='archived'),s=summary(plans,source,habit),pct=s.goalPct;
      const meta=plans.length?t('{count} long-term goals',{count:number(plans.length)}):t('Set a direction');
      const label=`${d.name}: ${pct===null?t('No measured goals'):t('{percent} SMART progress',{percent:t('{value}%',{value:number(pct)})})}, ${plans.length?meta:t('No long-term goals yet')}`;
      return `<a href="#growth" class="growth-dim${plans.length?'':' is-empty'}" data-growth-dimension="${d.id}" style="--tone:${d.color}" aria-label="${label}">
        <span class="growth-dim-icon">${dimensionIcon(d.id)}</span>
        <span class="growth-dim-text"><span class="growth-dim-name">${d.name}</span><span class="growth-dim-meta">${meta}</span></span>
        <span class="growth-dim-score${pct===null?' is-empty':''}">${pct===null?'—':`${number(pct)}<small>${t("%")}</small>`}</span>
        <span class="growth-dim-track" aria-hidden="true"><span style="width:${pct??0}%"></span></span>
      </a>`;
    }).join('');
    const due=['weekly','monthly','quarterly'].filter(c=>nextReview(doc,c)<=today());
    if(hint) hint.innerHTML=due.length
      ? `<span class="growth-review-badge">${t("Review due")}</span><span>${t('Your {cadences} reviews are waiting.',{cadences:listText(due.map(c=>t(c)))})}</span><a href="#growth">${t("Start a review")} ${ARROW}</a>`
      : `<span class="growth-review-badge is-done">${t('Up to date')}</span><span>${t('Your periodic reviews are complete.')}</span>`;
  }catch{target.textContent=t('Unable to read your growth connections. Open Growth to review.');if(hint)hint.textContent='';}
}
