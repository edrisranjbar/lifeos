import '../assets/html-escape.js?v=issue19-1';
import {dimensionIcon} from '../assets/growth-model.js?v=issue19-1';
const escape = globalThis.lifeOsHtml.escapeHtml;
const pct = value => value === null ? 'Not measured' : `${value}%`;

export function createReviewStepper(dialog, dimensions) {
  const find = id => dialog.querySelector(`#${id}`);
  const steps = ['Set your intention', ...dimensions.map(d => d.name), 'Your next chapter'];
  let step = 0;
  let busy = false;
  let draft = {};
  let context;

  function capture() {
    for (const dimension of dimensions) {
      const reflection = dialog.querySelector(`[name="reflection-${dimension.id}"]`);
      const next = dialog.querySelector(`[name="next-${dimension.id}"]`);
      if (reflection && next) draft[dimension.id] = {reflection:reflection.value, next:next.value};
    }
  }
  const hasNote = dimension => !!(draft[dimension.id]?.reflection.trim() || draft[dimension.id]?.next.trim());

  function renderSummary() {
    capture();
    const count = dimensions.filter(hasNote).length;
    find('reviewSummaryCount').textContent = `${count} of 6 dimensions have a reflection or next step`;
    find('reviewSummary').innerHTML = dimensions.map((dimension, index) => {
      const notes = draft[dimension.id] || {};
      return `<article class="review-recap" style="--review-tone:${dimension.color}"><header><span class="review-recap-icon" aria-hidden="true">${dimensionIcon(dimension.id)}</span><h4>${dimension.name}</h4><button type="button" data-review-step="${index + 1}" aria-label="Edit ${dimension.name}">Edit</button></header>${notes.reflection?.trim() ? `<p dir="auto">${escape(notes.reflection)}</p>` : '<p class="review-quiet">No reflection added.</p>'}${notes.next?.trim() ? `<div class="review-recap-next"><span>NEXT STEP</span><p dir="auto">${escape(notes.next)}</p></div>` : '<small class="review-quiet">No next step added.</small>'}</article>`;
    }).join('');
    find('reviewSummaryCadence').textContent = `${find('cadence').value} review`;
  }

  function show(index, focus = true) {
    if (busy || index < 0 || index >= steps.length) return;
    capture();
    step = index;
    const dimension = dimensions[step - 1];
    dialog.style.setProperty('--review-tone', dimension?.color || 'var(--accent)');
    for (const panel of dialog.querySelectorAll('[data-review-panel]')) panel.hidden = Number(panel.dataset.reviewPanel) !== step;
    for (const button of find('reviewStepNav').querySelectorAll('button')) {
      const position = Number(button.dataset.reviewStep);
      const added = position > 0 && position <= dimensions.length && hasNote(dimensions[position - 1]);
      button.setAttribute('aria-current', position === step ? 'step' : 'false');
      button.classList.toggle('has-note', added);
      button.querySelector('.review-step-number').textContent = added && position !== step ? '✓' : position + 1;
    }
    find('reviewStepLabel').textContent = `Step ${step + 1} of ${steps.length} · ${steps[step]}`;
    find('reviewPosition').textContent = String(step + 1).padStart(2, '0');
    find('reviewProgress').setAttribute('aria-valuenow', step + 1);
    find('reviewProgress').setAttribute('aria-valuetext', `Step ${step + 1} of ${steps.length}`);
    find('reviewProgressFill').style.width = `${(step + 1) / steps.length * 100}%`;
    find('reviewBack').hidden = step === 0;
    find('reviewNext').hidden = step === steps.length - 1;
    find('saveReview').hidden = step !== steps.length - 1;
    find('reviewNext').textContent = step === 0 ? 'Begin review →' : step === dimensions.length ? 'See your summary →' : 'Continue →';
    if (step === steps.length - 1) renderSummary();
    find('reviewStage').scrollTop = 0;
    if (focus) dialog.querySelector(`[data-review-panel="${step}"] h3`)?.focus({preventScroll:true});
  }

  find('reviewBack').addEventListener('click', () => show(step - 1));
  find('reviewNext').addEventListener('click', () => show(step + 1));
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-review-step]');
    if (button) show(Number(button.dataset.reviewStep));
  });
  dialog.addEventListener('input', capture);
  dialog.addEventListener('change', event => {
    if (event.target.name === 'reviewCadenceChoice') find('cadence').value = event.target.value;
  });
  dialog.addEventListener('close', capture);

  return {
    open(nextContext) {
      context = nextContext;
      find('cadence').value = context.cadence;
      find('reviewStepNav').innerHTML = steps.map((title, index) => `<button type="button" data-review-step="${index}" aria-label="Step ${index + 1}: ${title}"><span class="review-step-number">${index + 1}</span><span>${title}</span></button>`).join('');
      find('reviewCadences').innerHTML = [['weekly', 'Weekly', 'A small reset', '7 days'], ['monthly', 'Monthly', 'See the bigger picture', '30 days'], ['quarterly', 'Quarterly', 'Reconnect with your direction', '90 days']].map(([value, title, description, interval]) => `<label class="review-cadence-choice"><input type="radio" name="reviewCadenceChoice" value="${value}" ${value === context.cadence ? 'checked' : ''}><span><strong>${title}</strong><small>${description}</small><em>Every ${interval}</em></span></label>`).join('');
      find('reviewLastDate').textContent = context.lastDate ? `Last review · ${context.lastDate}` : 'Your first review starts here';
      find('reviewFields').innerHTML = dimensions.map((dimension, index) => {
        const stats = context.stats[dimension.id];
        const notes = draft[dimension.id] || {};
        const previous = context.previous[dimension.id];
        return `<section class="review-dimension-panel" data-review-panel="${index + 1}" style="--review-tone:${dimension.color}" hidden><div class="review-dimension-heading"><span class="review-dimension-icon" aria-hidden="true">${dimensionIcon(dimension.id)}</span><div><span class="review-kicker">A MOMENT FOR ${dimension.name.toUpperCase()}</span><h3 tabindex="-1">${dimension.name}</h3><p>${dimension.hint}</p></div></div><div class="review-evidence"><div><span>SMART goals</span><strong>${pct(stats.goalPct)}</strong><small>${stats.goals.length} connected goals</small></div><div><span>Habits · 7 days</span><strong>${context.habitAvailable ? pct(stats.habitPct) : 'Unavailable'}</strong><small>Daily consistency</small></div></div>${previous ? `<aside class="review-previous"><span>YOUR PREVIOUS NEXT STEP</span><p dir="auto">${escape(previous)}</p></aside>` : '<p class="review-quiet review-first-note">A fresh start. Choose one small step that matters to you.</p>'}<label class="review-prompt" for="review-reflection-${dimension.id}"><span>Pause & reflect</span><small>What went well? What made it difficult? What would you change?</small></label><textarea id="review-reflection-${dimension.id}" name="reflection-${dimension.id}" rows="4" maxlength="3000" dir="auto" placeholder="A small win, an honest observation…">${escape(notes.reflection || '')}</textarea><label class="review-prompt" for="review-next-${dimension.id}"><span>One small next step</span><small>Make it specific enough to act on.</small></label><input id="review-next-${dimension.id}" name="next-${dimension.id}" maxlength="500" dir="auto" placeholder="What will you do next?" value="${escape(notes.next || '')}"></section>`;
      }).join('');
      find('reviewError').textContent = '';
      dialog.showModal();
      show(dimensions.some(hasNote) ? step : 0);
    },
    next: () => show(Math.min(step + 1, steps.length - 1)),
    isSummary: () => step === steps.length - 1,
    setBusy(value) {
      busy = value;
      find('reviewForm').inert = value;
      dialog.setAttribute('aria-busy', String(value));
      find('saveReview').textContent = value ? 'Saving your review…' : 'Save review';
    },
    clearDraft() {
      draft = {};
      step = 0;
      for (const field of dialog.querySelectorAll('#reviewFields textarea, #reviewFields input')) field.value = '';
    }
  };
}
