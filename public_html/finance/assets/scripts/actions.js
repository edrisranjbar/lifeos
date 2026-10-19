// ── ACTIONS ───────────────────────────────────────────────────────────────────
function openAddIncomeModal() {
  openModal(`
    <div class="modal-kicker">${esc("Income stream")}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc("Add Income")}</div>
    <p class="modal-copy">${esc("Log a new source of income, or update an existing one by reusing its name.")}</p>
    <label class="field-label" for="incomeName">${esc("Stream name")}</label>
    <input type="text" id="incomeName" placeholder="${esc("e.g. Salary")}" class="mb-3">
    <label class="field-label" for="incomeAmount">${esc(`Amount in ${currencyUnit()}`)}</label>
    <input type="number" id="incomeAmount" placeholder="${esc(`Amount in ${currencyUnit()}`)}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button class="btn-primary" onclick="saveNewIncome()">${esc("Save Income")}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("incomeName")?.focus(), 0);
}

function saveNewIncome() {
  const name = document.getElementById("incomeName").value.trim();
  const amount = parseFloat(document.getElementById("incomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert("Enter a name and valid amount.");
  const id = name.toLowerCase().replace(/\s+/g, "_");
  const existing = state.incomes.find((i) => i.id === id);
  if (existing) {
    existing.amount = amount;
  } else {
    state.incomes.push({ id, name, amount });
  }
  closeModal();
  save();
  render();
}

function deleteIncome(id) {
  if (protectLinkedExpense(id, 'income')) return;
  state.incomes = state.incomes.filter((i) => i.id !== id);
  save();
  render();
}

function openAddExpenseModal() {
  const catOptions = state.categories
    .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`)
    .join("");
  openModal(`
    <div class="modal-kicker">${esc("Ledger entry")}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc("Log Expense")}</div>
    <p class="modal-copy">${esc("Record what you paid and where it belongs in the budget.")}</p>
    <label class="field-label" for="expenseCategory">${esc("Category")}</label>
    <select id="expenseCategory" class="mb-3">
      <option value="">${esc("— Select Category —")}</option>
      ${catOptions}
    </select>
    <label class="field-label" for="expenseDesc">${esc("Description")}</label>
    <input type="text" id="expenseDesc" placeholder="${esc("Description (optional)")}" class="mb-3">
    <label class="field-label" for="expenseAmount">${esc(`Amount in ${currencyUnit()}`)}</label>
    <input type="number" id="expenseAmount" placeholder="${esc(`Amount in ${currencyUnit()}`)}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button class="btn-primary" onclick="saveNewExpense()">${esc("Log Expense")}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("expenseCategory-trigger")?.focus(), 0);
}

function saveNewExpense() {
  const catId = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  if (!catId) return alert("Select a category.");
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
  state.expenses.push({
    id: Date.now().toString(),
    categoryId: catId,
    desc: desc || "",
    amount,
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  });
  closeModal();
  save();
  render();
  showToast("✓ Expense logged.", "success");
}

function deleteExpense(id) {
  if (protectLinkedExpense(id)) return;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  render();
}

function saveNewBudget() {
  const emoji = document.getElementById("newCatEmoji").value.trim();
  const name = document.getElementById("newCatName").value.trim();
  const target = parseFloat(document.getElementById("newCatTarget").value);
  const unlimited = document.getElementById("newCatUnlimited").checked;
  if (!name) return alert("Enter a category name.");
  if (!unlimited && (!Number.isFinite(target) || target <= 0))
    return alert("Enter a valid budget amount.");
  const id = "cat_" + Date.now().toString(36);
  const label = emoji ? `${emoji} ${name}` : name;
  state.categories.push({ id, label, target: Number.isFinite(target) ? target : 0, unlimited });
  closeModal();
  save();
  render();
}

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    return showToast("Excel export library is unavailable.", "error");
  }

  const totalIncome = state.incomes.reduce((sum, item) => sum + item.amount, 0);
  const budgets = financeBudgetTotals();
  const totalBudget = budgets.total;
  const totalSpent = state.expenses.reduce((sum, item) => sum + item.amount, 0);
  const categoryName = (id) =>
    state.categories.find((category) => category.id === id)?.label || id;
  const unit = currencyUnit();
  const budgetRows = state.categories.map((category) => {
    const spent = state.expenses
      .filter((expense) => expense.categoryId === category.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      Category: category.label,
      [`Budget (${unit})`]: budgetIsUnlimited(category) ? "Unlimited" : category.target,
      [`Spent (${unit})`]: spent,
      [`Remaining (${unit})`]: budgetIsUnlimited(category) ? "" : category.target - spent,
      "Used (%)": budgetIsUnlimited(category) ? "" : category.target > 0 ? Math.round((spent / category.target) * 100) : 0,
    };
  });
  const expenseRows = state.expenses.map((expense) => ({
    Date: expense.date || "",
    Category: categoryName(expense.categoryId),
    Description: expense.desc || "",
    [`Amount (${unit})`]: expense.amount,
  }));
  const incomeRows = state.incomes.map((income) => ({
    Source: income.name,
    [`Amount (${unit})`]: income.amount,
  }));
  const summaryRows = [
    { Metric: "Income", [`Amount (${unit})`]: totalIncome },
    { Metric: "Allocated budget", [`Amount (${unit})`]: totalBudget },
    { Metric: "Spent", [`Amount (${unit})`]: totalSpent },
    { Metric: "Balance", [`Amount (${unit})`]: totalIncome - totalSpent },
    { Metric: "Capped budget available", [`Amount (${unit})`]: budgets.remaining },
    { Metric: "Unlimited category spending", [`Amount (${unit})`]: budgets.unlimitedSpent },
  ];

  const workbook = XLSX.utils.book_new();
  const sheets = [
    ["Summary", summaryRows],
    ["Budgets", budgetRows],
    ["Expenses", expenseRows],
    ["Income", incomeRows],
  ];
  sheets.forEach(([name, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: "No data" }]);
    const widths = Object.keys(rows[0] || { Status: "No data" }).map((key) => ({
      wch: Math.min(34, Math.max(14, key.length + 2)),
    }));
    sheet["!cols"] = widths;
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const periodSlug = activePeriod.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(workbook, `EdiFinance-${periodSlug || "period"}-${stamp}.xlsx`);
  showToast("Excel report exported.");
}

function printLedger() {
  const meta = document.getElementById("printMeta");
  if (meta) {
    const date = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    meta.textContent = __t("{period} financial report · {date} · Values in {unit}", { period: activePeriod, date, unit: currencyUnit() });
  }
  window.print();
}

function splitCategoryLabel(label) {
  const value = String(label || "").trim();
  const match = value.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  return match ? { emoji: match[1], name: match[2] } : { emoji: "", name: value };
}

function saveEditedBudget(id) {
  const emoji = document.getElementById("editCatEmoji").value.trim();
  const name = document.getElementById("editCatName").value.trim();
  const target = parseFloat(document.getElementById("editCatTarget").value);
  const unlimited = document.getElementById("editCatUnlimited").checked;
  if (!name) return showToast("Enter a category name.", "error");
  if (!unlimited && (!Number.isFinite(target) || target <= 0))
    return showToast("Enter a valid budget amount.", "error");
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  category.label = emoji ? `${emoji} ${name}` : name;
  category.target = Number.isFinite(target) ? target : 0;
  category.unlimited = unlimited;
  closeModal();
  save();
  render();
  showToast("Budget updated.");
}

function saveEditedIncome(id) {
  if (protectLinkedExpense(id, 'income')) return;
  const name = document.getElementById("editIncomeName").value.trim();
  const amount = parseFloat(document.getElementById("editIncomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert("Enter a name and valid amount.");
  const inc = state.incomes.find((i) => i.id === id);
  if (inc) {
    inc.name = name;
    inc.amount = amount;
  }
  closeModal();
  save();
  render();
}

function saveEditedExpense(id) {
  if (protectLinkedExpense(id)) return;
  const catId = document.getElementById("editExpenseCategory").value;
  const desc = document.getElementById("editExpenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("editExpenseAmount").value);
  if (!catId) return alert("Select a category.");
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
  const exp = state.expenses.find((e) => e.id === id);
  if (exp) {
    exp.categoryId = catId;
    exp.desc = desc;
    exp.amount = amount;
  }
  closeModal();
  save();
  render();
}

// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
function protectLinkedExpense(id, kind = 'expense') {
  try {
    const decisions = JSON.parse(appStorage.getItem('edi_obligations_v1') || '{}').decisions || {};
    const key = kind === 'income' ? 'incomeId' : 'expenseId';
    const linked = Object.entries(decisions).find(([, payment]) => payment.status === 'paid' && payment.period === activePeriod && payment[key] === String(id));
    if (!linked) return false;
    showToast(kind === 'income'
      ? 'This income records money owed to you. Undo the receipt in Debts & credits before changing it.'
      : 'This expense records a scheduled payment. Undo the payment in Debts & credits before changing it.', 'error');
    dispatchEvent(new CustomEvent('finance-open-payment', {detail:{id:linked[0]}}));
    return true;
  } catch {
    showToast('Unable to check payment links. Reload before changing this expense.', 'error');
    return true;
  }
}
let activeContextTarget = null;

function showContextMenu(e, type, id) {
  e.stopPropagation();
  closeContextMenu();
  activeContextTarget = { type, id };
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id = "activeContextMenu";
  menu.innerHTML = `
    <div class="context-menu-item" onclick="handleContextEdit()">${esc("✏️ Edit")}</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="handleContextDelete()">${esc("🗑️ Delete")}</div>
  `;
  document.body.appendChild(menu);
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let x = e.clientX,
    y = e.clientY;
  if (x + rect.width + pad > window.innerWidth)
    x = window.innerWidth - rect.width - pad;
  if (y + rect.height + pad > window.innerHeight)
    y = window.innerHeight - rect.height - pad;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

function closeContextMenu() {
  const m = document.getElementById("activeContextMenu");
  if (m) m.remove();
  activeContextTarget = null;
}

function handleContextEdit() {
  if (!activeContextTarget) return;
  const { type, id } = activeContextTarget;
  closeContextMenu();
  if (type === "income") openEditIncomeModal(id);
  else if (type === "expense") openEditExpenseModal(id);
}

function handleContextDelete() {
  if (!activeContextTarget) return;
  const { type, id } = activeContextTarget;
  closeContextMenu();
  if (type === "income") deleteIncome(id);
  else if (type === "expense") deleteExpense(id);
}

document.addEventListener("click", closeContextMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeContextMenu();
    closeModal();
  }
});
