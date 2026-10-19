import '../assets/html-escape.js?v=issue19-1';
import {dimensionIcon} from '../assets/growth-model.js?v=persian-1';
const escape = globalThis.lifeOsHtml.escapeHtml;
const { t, number } = window.lifeOsI18n;
const pct = value => value === null ? t('Not measured') : t('{value}%', { value: number(value) });

export function createReviewStepper(dialog, dimensions) {
  const find = id => dialog.querySelector(`#${id}`);
  const steps = () => [t('Set your intention'), ...dimensions.map(d => d.name), t('Your next chapter')];
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
    find('reviewSummaryCount').textContent = t('{count} of {total} dimensions have a reflection or next step', { count: number(count), total: number(dimensions.length) });
    find('reviewSummary').innerHTML = dimensions.map((dimension, index) => {
      const notes = draft[dimension.id] || {};
      return `<article class="review-recap" style="--review-tone:${dimension.color}"><header><span class="review-recap-icon" aria-hidden="true">${dimensionIcon(dimension.id)}</span><h4>${escape(dimension.name)}</h4><button type="button" data-review-step="${index + 1}" aria-label="${escape(t('Edit {name}', { name: dimension.name }))}">${escape(t('Edit'))}</button></header>${notes.reflection?.trim() ? `<p dir="auto">${escape(notes.reflection)}</p>` : `<p class="review-quiet">${escape(t('No reflection added.'))}</p>`}${notes.next?.trim() ? `<div class="review-recap-next"><span>${escape(t('NEXT STEP'))}</span><p dir="auto">${escape(notes.next)}</p></div>` : `<small class="review-quiet">${escape(t('No next step added.'))}</small>`}</article>`;
    }).join('');
    find('reviewSummaryCadence').textContent = t('{cadence} review', { cadence: t(find('cadence').value) });
  }

  function show(index, focus = true) {
    if (busy || index < 0 || index >= steps().length) return;
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
      button.querySelector('.review-step-number').textContent = added && position !== step ? '✓' : number(position + 1);
    }
    const names = steps();
    find('reviewStepLabel').textContent = t('Step {current} of {total} · {name}', { current: number(step + 1), total: number(names.length), name: names[step] });
    find('reviewPosition').textContent = window.lifeOsI18n.digits(String(step + 1).padStart(2, '0'));
    find('reviewProgress').setAttribute('aria-valuenow', step + 1);
    find('reviewProgress').setAttribute('aria-valuetext', t('Step {current} of {total}', { current: number(step + 1), total: number(names.length) }));
    find('reviewProgressFill').style.width = `${(step + 1) / names.length * 100}%`;
    find('reviewBack').hidden = step === 0;
    find('reviewNext').hidden = step === names.length - 1;
    find('saveReview').hidden = step !== names.length - 1;
    find('reviewNext').textContent = t(step === 0 ? 'Begin review →' : step === dimensions.length ? 'See your summary →' : 'Continue →');
    if (step === names.length - 1) renderSummary();
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
      find('reviewStepNav').innerHTML = steps().map((title, index) => `<button type="button" data-review-step="${index}" aria-label="${escape(t('Step {number}: {name}', { number: number(index + 1), name: title }))}"><span class="review-step-number">${number(index + 1)}</span><span>${escape(title)}</span></button>`).join('');
      find('reviewCadences').innerHTML = [['weekly', t('Weekly'), t('A small reset'), t('Every 7 days')], ['monthly', t('Monthly'), t('See the bigger picture'), t('Every 30 days')], ['quarterly', t('Quarterly'), t('Reconnect with your direction'), t('Every 90 days')]].map(([value, title, description, interval]) => `<label class="review-cadence-choice"><input type="radio" name="reviewCadenceChoice" value="${value}" ${value === context.cadence ? 'checked' : ''}><span><strong>${escape(title)}</strong><small>${escape(description)}</small><em>${escape(interval)}</em></span></label>`).join('');
      find('reviewLastDate').textContent = context.lastDate ? t('Last review · {date}', { date: context.lastDate }) : t('Your first review starts here');
      find('reviewFields').innerHTML = dimensions.map((dimension, index) => {
        const stats = context.stats[dimension.id];
        const notes = draft[dimension.id] || {};
        const previous = context.previous[dimension.id];
        return `<section class="review-dimension-panel" data-review-panel="${index + 1}" style="--review-tone:${dimension.color}" hidden><div class="review-dimension-heading"><span class="review-dimension-icon" aria-hidden="true">${dimensionIcon(dimension.id)}</span><div><span class="review-kicker">${escape(t('A MOMENT FOR {name}', { name: dimension.name.toUpperCase() }))}</span><h3 tabindex="-1">${escape(dimension.name)}</h3><p>${escape(dimension.hint)}</p></div></div><div class="review-evidence"><div><span>SMART goals</span><strong>${pct(stats.goalPct)}</strong><small>${escape(t('{count} connected goals', { count: number(stats.goals.length) }))}</small></div><div><span>Habits · 7 days</span><strong>${context.habitAvailable ? pct(stats.habitPct) : escape(t('Unavailable'))}</strong><small>Daily consistency</small></div></div>${previous ? `<aside class="review-previous"><span>YOUR PREVIOUS NEXT STEP</span><p dir="auto">${escape(previous)}</p></aside>` : '<p class="review-quiet review-first-note">A fresh start. Choose one small step that matters to you.</p>'}<label class="review-prompt" for="review-reflection-${dimension.id}"><span>Pause & reflect</span><small>What went well? What made it difficult? What would you change?</small></label><textarea id="review-reflection-${dimension.id}" name="reflection-${dimension.id}" rows="4" maxlength="3000" dir="auto" placeholder="A small win, an honest observation…">${escape(notes.reflection || '')}</textarea><label class="review-prompt" for="review-next-${dimension.id}"><span>One small next step</span><small>Make it specific enough to act on.</small></label><input id="review-next-${dimension.id}" name="next-${dimension.id}" maxlength="500" dir="auto" placeholder="What will you do next?" value="${escape(notes.next || '')}"></section>`;
      }).join('');
      // Static labels in the panels above translate here; notes stay untouched.
      window.lifeOsI18n.apply(find('reviewFields'));
      find('reviewError').textContent = '';
      dialog.showModal();
      show(dimensions.some(hasNote) ? step : 0);
    },
    next: () => show(Math.min(step + 1, steps().length - 1)),
    isSummary: () => step === steps().length - 1,
    setBusy(value) {
      busy = value;
      find('reviewForm').inert = value;
      dialog.setAttribute('aria-busy', String(value));
      find('saveReview').textContent = t(value ? 'Saving your review…' : 'Save review');
    },
    clearDraft() {
      draft = {};
      step = 0;
      for (const field of dialog.querySelectorAll('#reviewFields textarea, #reviewFields input')) field.value = '';
    }
  };
}
