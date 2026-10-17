import {dimensions,dimensionIcon,documentState,sources,summary,nextReview,today} from './growth-model.js?v=issue19-1';
const ARROW='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export function mountGrowthOverview(main) {
  const section=document.createElement('section');section.className='dash-card growth-summary';section.setAttribute('aria-label','Personal growth dimensions');
  section.innerHTML=`<div class="card-head"><div><span class="card-kicker">PERSONAL GROWTH</span><h3 class="card-title">Six dimensions. One direction.</h3></div><a class="growth-open" href="#growth">Open Growth ${ARROW}</a></div><div class="growth-summary-grid" id="growthSummary"></div><div class="growth-review" id="growthReviewHint" role="status"></div>`;
  main.querySelector('.dash-score').after(section);
  section.addEventListener('click',event=>{const link=event.target.closest('[data-growth-dimension]');if(!link)return;const frame=document.getElementById('growth');const url=new URL(frame.dataset.src,location.href);url.hash=link.dataset.growthDimension;frame.src=url.href;});
}
// "weekly, monthly and quarterly" reads better than a comma list.
const listText=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
export function refreshGrowthOverview(habit) {
  const target=document.getElementById('growthSummary'),hint=document.getElementById('growthReviewHint');if(!target)return;
  try {
    const doc=documentState(),source=sources();
    // All strings rendered here are fixed labels or derived numbers.
    target.innerHTML=dimensions.map(d=>{
      const plans=doc.plans.filter(p=>p.dimensionId===d.id&&p.status!=='archived'),s=summary(plans,source,habit),pct=s.goalPct;
      const meta=plans.length?`${plans.length} long-term goal${plans.length===1?'':'s'}`:'Set a direction';
      const label=`${d.name}: ${pct===null?'no measured progress yet':`${pct}% SMART progress`}, ${plans.length?meta:'no long-term goals yet'}`;
      return `<a href="#growth" class="growth-dim${plans.length?'':' is-empty'}" data-growth-dimension="${d.id}" style="--tone:${d.color}" aria-label="${label}">
        <span class="growth-dim-icon">${dimensionIcon(d.id)}</span>
        <span class="growth-dim-text"><span class="growth-dim-name">${d.name}</span><span class="growth-dim-meta">${meta}</span></span>
        <span class="growth-dim-score${pct===null?' is-empty':''}">${pct===null?'—':`${pct}<small>%</small>`}</span>
        <span class="growth-dim-track" aria-hidden="true"><span style="width:${pct??0}%"></span></span>
      </a>`;
    }).join('');
    const due=['weekly','monthly','quarterly'].filter(c=>nextReview(doc,c)<=today());
    if(hint) hint.innerHTML=due.length
      ? `<span class="growth-review-badge">Review due</span><span>Your ${listText(due)} review${due.length===1?' is':'s are'} waiting.</span><a href="#growth">Start a review ${ARROW}</a>`
      : '<span class="growth-review-badge is-done">Up to date</span><span>Your periodic reviews are complete.</span>';
  }catch{target.textContent='Unable to read your growth connections. Open Growth to review.';if(hint)hint.textContent='';}
}
