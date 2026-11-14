// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(html, wide) {
  closeContextMenu();
  closeModal();
  const overlay = document.createElement("div");
  overlay.id = "modalOverlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-box${wide ? " wide" : ""}" onclick="event.stopPropagation()">${html}</div>`;
  overlay.onclick = closeModal;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('#expenseCategory, #editExpenseCategory').forEach(enhanceCategorySelect);
}

// Keep the original select as the source of truth for existing save handlers.
function enhanceCategorySelect(select) {
  const fa = document.documentElement.lang === 'fa';
  const words = fa
    ? { label: 'دسته‌بندی', placeholder: 'انتخاب دسته‌بندی', search: 'جستجوی دسته‌بندی…', empty: 'دسته‌بندی پیدا نشد', remaining: 'باقی‌مانده', noBudget: 'بدون بودجه', count: 'دسته‌بندی' }
    : { label: 'Category', placeholder: 'Choose a category', search: 'Search categories…', empty: 'No categories found', remaining: 'remaining', noBudget: 'No budget set', count: 'categories' };
  const wrapper = document.createElement('div');
  wrapper.className = 'category-picker';
  wrapper.innerHTML = `<button type="button" class="category-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${words.label}"><span class="category-selected"></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="category-popover" hidden><div class="category-search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="text" role="combobox" aria-label="${words.search}" placeholder="${words.search}" aria-autocomplete="list" aria-expanded="false" autocomplete="off"></div><div class="category-options" role="listbox" aria-label="${words.label}"></div><div class="category-count"></div></div>`;
  select.after(wrapper);
  select.hidden = true;
  const trigger = wrapper.querySelector('.category-trigger');
  const panel = wrapper.querySelector('.category-popover');
  const input = wrapper.querySelector('input');
  const list = wrapper.querySelector('.category-options');
  list.id = select.id + '-options';
  input.setAttribute('aria-controls', list.id);
  trigger.setAttribute('aria-controls', list.id);
  const label = document.querySelector(`label[for="${select.id}"]`);
  trigger.id = select.id + '-trigger';
  if (label) label.htmlFor = trigger.id;
  let active = -1;
  let filtered = [];
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  function updateLabel() {
    wrapper.querySelector('.category-selected').textContent = select.value ? select.selectedOptions[0]?.textContent || words.placeholder : words.placeholder;
    trigger.classList.toggle('is-placeholder', !select.value);
  }
  function highlight() {
    const options = [...list.querySelectorAll('[role="option"]')];
    options.forEach((option, index) => option.classList.toggle('is-active', index === active));
    if (options[active]) {
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function draw() {
    filtered = state.categories.filter(category => normalize(category.label).includes(normalize(input.value)));
    list.replaceChildren();
    filtered.forEach((category, index) => {
      const parts = splitCategoryLabel(category.label);
      const spent = state.expenses.filter(expense => expense.categoryId === category.id).reduce((total, expense) => total + expense.amount, 0);
      const option = document.createElement('div');
      option.className = 'category-option';
      option.id = list.id + '-' + index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(select.value === category.id));
      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.textContent = parts.emoji || '◇';
      const copy = document.createElement('span');
      copy.className = 'category-option-copy';
      const name = document.createElement('strong');
      name.textContent = parts.name;
      const detail = document.createElement('small');
      detail.textContent = budgetIsUnlimited(category) ? __t("Unlimited") : category.target > 0 ? `${fmt(category.target - spent)} ${currencyUnit()} · ${words.remaining}` : words.noBudget;
      detail.classList.toggle('is-over', !budgetIsUnlimited(category) && category.target > 0 && spent > category.target);
      copy.append(name, detail);
      const check = document.createElement('span');
      check.className = 'category-check';
      check.textContent = select.value === category.id ? '✓' : '';
      option.append(icon, copy, check);
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(category));
      list.append(option);
    });
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'category-empty';
      empty.textContent = words.empty;
      list.append(empty);
    }
    wrapper.querySelector('.category-count').textContent = `${filtered.length} ${words.count}`;
    active = filtered.findIndex(category => category.id === select.value);
    highlight();
  }
  function close(returnFocus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }
  function choose(category) {
    select.value = category.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    updateLabel();
    close(true);
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) return close();
    input.value = '';
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-expanded', 'true');
    draw();
    input.focus();
  });
  input.addEventListener('input', draw);
  wrapper.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = filtered.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : -1;
      highlight();
    }
    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
      else if (filtered.length === 1) choose(filtered[0]);
    }
  });
  wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
  document.getElementById('modalOverlay').addEventListener('mousedown', event => {
    if (!wrapper.contains(event.target)) close();
  });
  updateLabel();
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.remove();
}

function deleteCategory(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const count = state.expenses.filter((e) => e.categoryId === id).length;
  if (!confirm(__t("Delete \"{label}\" and its {n} expense(s)? This cannot be undone.", { label: category.label, n: count })))
    return;
  state.categories = state.categories.filter((cat) => cat.id !== id);
  state.expenses = state.expenses.filter((e) => e.categoryId !== id);
  closeModal();
  save();
  render();
}

function openAddBudgetModal() {
  openModal(`
    <div class="modal-kicker">${esc(window.lifeOsI18n.t("Budget"))}</div>
    <div class="modal-title">${esc(window.lifeOsI18n.t("Add category"))}</div>
    <p class="modal-copy">${esc(window.lifeOsI18n.t("Give this category a name, an optional icon and a monthly limit."))}</p>
    <div class="modal-fields">
      <div class="field-row">
        <div>
          <label class="field-label" for="newCatEmoji">${esc(window.lifeOsI18n.t("Icon"))}</label>
          <input type="text" id="newCatEmoji" placeholder="🎮" maxlength="4" autocomplete="off">
        </div>
        <div>
          <label class="field-label" for="newCatName">${esc(window.lifeOsI18n.t("Category name"))}</label>
          <input type="text" id="newCatName" placeholder="${esc(window.lifeOsI18n.t("e.g. Entertainment"))}" autocomplete="off">
        </div>
      </div>
      <div>
        <label class="field-label" for="newCatTarget">${esc(window.lifeOsI18n.t("Monthly limit"))}</label>
        <div class="amount-field">
          <input type="number" id="newCatTarget" min="1" step="any" placeholder="0" inputmode="numeric">
          <span class="amount-unit" data-currency-unit>${esc(currencyUnit())}</span>
        </div>
      </div>
      <label class="budget-unlimited-choice"><input type="checkbox" id="newCatUnlimited" onchange="toggleBudgetLimit('newCat')"><span>${esc(window.lifeOsI18n.t("Unlimited budget"))}<small>${esc(window.lifeOsI18n.t("Track spending without a limit or over-budget alerts."))}</small></span></label>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
      <button class="btn-primary" onclick="saveNewBudget()">${esc(window.lifeOsI18n.t("Add category"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("newCatName")?.focus(), 0);
}

function toggleBudgetLimit(prefix) {
  const unlimited = document.getElementById(`${prefix}Unlimited`).checked;
  document.getElementById(`${prefix}Target`).disabled = unlimited;
}

function openEditBudgetModal(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const parts = splitCategoryLabel(category.label);
  openModal(`
    <div class="modal-kicker">${esc(window.lifeOsI18n.t("Budget category"))}</div>
    <div class="modal-title">${esc(window.lifeOsI18n.t("Edit budget"))}</div>
    <p class="modal-copy">${esc(window.lifeOsI18n.t("Change its name, icon, or monthly limit. Existing expenses stay attached."))}</p>
    <div class="modal-fields">
      <div class="field-row">
        <div>
          <label class="field-label" for="editCatEmoji">${esc(window.lifeOsI18n.t("Icon"))}</label>
          <input type="text" id="editCatEmoji" value="${esc(parts.emoji)}" placeholder="${esc(window.lifeOsI18n.t("Optional emoji"))}" maxlength="8" autocomplete="off">
        </div>
        <div>
          <label class="field-label" for="editCatName">${esc(window.lifeOsI18n.t("Category name"))}</label>
          <input type="text" id="editCatName" value="${esc(parts.name)}" placeholder="${esc(window.lifeOsI18n.t("Category name"))}" autocomplete="off">
        </div>
      </div>
      <div>
        <label class="field-label" for="editCatTarget">${esc(window.lifeOsI18n.t("Monthly limit"))}</label>
        <div class="amount-field">
          <input type="number" id="editCatTarget" value="${Number(category.target) || 0}" ${budgetIsUnlimited(category) ? 'disabled' : ''} min="1" step="any" inputmode="numeric">
          <span class="amount-unit" data-currency-unit>${esc(currencyUnit())}</span>
        </div>
      </div>
      <label class="budget-unlimited-choice"><input type="checkbox" id="editCatUnlimited" ${budgetIsUnlimited(category) ? 'checked' : ''} onchange="toggleBudgetLimit('editCat')"><span>${esc(window.lifeOsI18n.t("Unlimited budget"))}<small>${esc(window.lifeOsI18n.t("Track spending without a limit or over-budget alerts."))}</small></span></label>
    </div>
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteCategory('${id}')">${esc(window.lifeOsI18n.t("Delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
      <button type="button" class="btn-primary" onclick="saveEditedBudget('${id}')">${esc(window.lifeOsI18n.t("Save changes"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("editCatName")?.focus(), 0);
}

function openEditIncomeModal(id) {
  if (editLinkedIncomePlan(id)) return;
  const inc = state.incomes.find((i) => i.id === id);
  if (!inc) return;
  openModal(`
    <div class="modal-kicker">${esc(window.lifeOsI18n.t("Income"))}</div>
    <div class="modal-title">${esc(window.lifeOsI18n.t("Edit income"))}</div>
    <div class="modal-fields" style="margin-top:20px;">
      <div>
        <label class="field-label" for="editIncomeName">${esc(window.lifeOsI18n.t("Stream name"))}</label>
        <input type="text" id="editIncomeName" value="${esc(inc.name)}" placeholder="${esc(window.lifeOsI18n.t("Stream name"))}" autocomplete="off">
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="editIncomeAmount">${esc(window.lifeOsI18n.t("Amount"))}</label>
          <div class="amount-field">
            <input type="number" id="editIncomeAmount" value="${inc.amount}" min="1" step="1" inputmode="numeric">
            <span class="amount-unit" data-currency-unit>${esc(currencyUnit())}</span>
          </div>
        </div>
        <div>
          <label class="field-label" for="editIncomeDate">${esc(window.lifeOsI18n.t("Date received"))}</label>
          <input type="date" id="editIncomeDate" value="${inc.dateISO || financeTodayISO()}" max="${financeTodayISO()}">
        </div>
      </div>
    </div>
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteIncome('${id}')">${esc(window.lifeOsI18n.t("Delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
      <button type="button" class="btn-primary" onclick="saveEditedIncome('${id}')">${esc(window.lifeOsI18n.t("Save changes"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("editIncomeName")?.focus(), 0);
}

function openEditExpenseModal(id) {
  if (protectLinkedExpense(id)) return;
  const exp = state.expenses.find((e) => e.id === id);
  if (!exp) return;
  const catOptions = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === exp.categoryId ? "selected" : ""}>${c.label}</option>`,
    )
    .join("");
  openModal(`
    <div class="modal-kicker">${esc(window.lifeOsI18n.t("Expense"))}</div>
    <div class="modal-title">${esc(window.lifeOsI18n.t("Edit expense"))}</div>
    <div class="modal-fields" style="margin-top:20px;">
      <div>
        <label class="field-label" for="editExpenseAmount">${esc(window.lifeOsI18n.t("Amount"))}</label>
        <div class="amount-field">
          <input type="number" id="editExpenseAmount" value="${exp.amount}" min="1" step="1" inputmode="numeric">
          <span class="amount-unit" data-currency-unit>${esc(currencyUnit())}</span>
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="editExpenseCategory">${esc(window.lifeOsI18n.t("Category"))}</label>
          <select id="editExpenseCategory">${catOptions}</select>
        </div>
        <div>
          <label class="field-label" for="editExpenseDate">${esc(window.lifeOsI18n.t("Date"))}</label>
          <input type="date" id="editExpenseDate" value="${exp.dateISO || financeTodayISO()}" max="${financeTodayISO()}">
        </div>
      </div>
      <div>
        <label class="field-label" for="editExpenseDesc">${esc(window.lifeOsI18n.t("Description"))}</label>
        <input type="text" id="editExpenseDesc" value="${esc(exp.desc || "")}" placeholder="${esc(window.lifeOsI18n.t("Description (optional)"))}" autocomplete="off">
      </div>
    </div>
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteExpense('${id}')">${esc(window.lifeOsI18n.t("Delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
      <button type="button" class="btn-primary" onclick="saveEditedExpense('${id}')">${esc(window.lifeOsI18n.t("Save changes"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("editExpenseAmount")?.focus(), 0);
}
