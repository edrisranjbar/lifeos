// ── SCROLL REVEAL ─────────────────────────────────────────────────────────────
function initReveal() {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
}

// ── RENDER ────────────────────────────────────────────────────────────────────
let incomeChart = null,
  spendChart = null;

function render() {
  renderPeriodSelector();
  const totalIncome = state.incomes.reduce((s, i) => s + i.amount, 0);
  const budgets = financeBudgetTotals();
  const totalBudget = budgets.total;
  const allUnlimited = budgets.unlimitedCount > 0 && budgets.limitedCount === 0;
  const totalSpent = state.expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalSpent;

  // Totals
  animateNumber(document.getElementById("metricIncome"), totalIncome, fmt);
  if (allUnlimited) document.getElementById("metricBudget").textContent = window.lifeOsI18n.t("Unlimited");
  else animateNumber(document.getElementById("metricBudget"), totalBudget, fmt);
  const budgetNote = document.getElementById("metricBudgetNote");
  if (budgetNote)
    budgetNote.textContent = allUnlimited
      ? window.lifeOsI18n.t("No capped categories")
      : __t(budgets.unlimitedCount ? "{unit} across capped categories" : "{unit} across all categories", { unit: currencyUnit() });
  animateNumber(document.getElementById("metricSpent"), totalSpent, fmt);
  const balEl = document.getElementById("metricBalance");
  animateNumber(balEl, balance, (v) => (balance < 0 ? "−" : "") + fmt(v));
  balEl.style.color = balance < 0 ? "var(--rust)" : "var(--jade)";

  // Income streams
  const il = document.getElementById("incomeList");
  il.innerHTML =
    state.incomes.length === 0
      ? emptyStateHtml("coins", window.lifeOsI18n.t("No income streams yet"), window.lifeOsI18n.t("Add your first source of income to open the ledger."))
      : state.incomes
          .map((inc) => {
            const when = inc.dateISO ? financeDateLabel(inc) : "";
            return `
      <div class="stream-row" data-income-id="${esc(inc.id)}" role="listitem" onclick="showContextMenu(event,'income','${inc.id}')">
        <div class="stream-main">
          <span class="stream-name" dir="auto">${esc(inc.name)}</span>
          ${when ? `<span class="stream-date">${esc(when)}</span>` : ""}
        </div>
        <span class="stream-amount num">${fmt(inc.amount)}</span>
        <button type="button" class="row-menu expense-menu-button" aria-label="${esc(window.lifeOsI18n.t('Income actions'))}" onclick="showContextMenu(event,'income','${inc.id}')">⋯</button>
      </div>`;
          })
          .join("");

  // Expense table
  const tbody = document.getElementById("txBody");
  const sorted = state.expenses
    .map((expense, index) => ({ expense, index }))
    .sort((a, b) => {
      const dateA = a.expense.dateISO || "";
      const dateB = b.expense.dateISO || "";
      return dateA === dateB ? a.index - b.index : dateA < dateB ? -1 : 1;
    })
    .reverse()
    .map(({ expense }) => expense);
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:0;border:0;">${emptyStateHtml(
      "receipt",
      window.lifeOsI18n.t("No expenses logged yet"),
      window.lifeOsI18n.t("Log your first expense and it will appear here."),
    )}</td></tr>`;
  } else {
    tbody.innerHTML = sorted
      .map((e) => {
        const cat = state.categories.find((c) => c.id === e.categoryId);
        const label = cat ? splitCategoryLabel(cat.label).name || cat.label : e.categoryId;
        return `<tr class="fade-in" data-expense-id="${esc(e.id)}" onclick="showContextMenu(event,'expense','${e.id}')">
        <td><span class="tx-cat">${esc(label)}</span></td>
        <td><span class="tx-desc" dir="auto">${esc(e.desc) || "—"}</span></td>
        <td><span class="tx-date">${esc(financeDateLabel(e))}</span></td>
        <td class="num-col"><span class="tx-amount num">${fmt(e.amount)}</span></td>
        <td><button type="button" class="row-menu expense-menu-button" aria-label="${esc(window.lifeOsI18n.t('Expense actions'))}" onclick="showContextMenu(event,'expense','${e.id}')">⋯</button></td>
      </tr>`;
      })
      .join("");
  }

  // Budget
  const bt = document.getElementById("budgetTracker");
  const budgetSummary = document.getElementById("budgetSummary");
  budgetSummary.classList.toggle("has-unlimited", budgets.unlimitedCount > 0);
  const budgetRemaining = budgets.remaining;
  const usedPct = totalBudget > 0 ? Math.round((budgets.spent / totalBudget) * 100) : 0;
  budgetSummary.innerHTML = `
    <div><span>${esc(window.lifeOsI18n.t(budgets.unlimitedCount ? "Capped budgets" : "Monthly plan"))}</span><strong class="num">${allUnlimited ? esc(window.lifeOsI18n.t("Unlimited")) : fmt(totalBudget)}</strong></div>
    <div><span>${esc(window.lifeOsI18n.t("Used"))}</span><strong class="num">${allUnlimited ? "—" : usedPct + "%"}</strong></div>
    <div><span>${esc(window.lifeOsI18n.t(budgetRemaining >= 0 ? "Available" : "Over plan"))}</span><strong class="num ${budgetRemaining < 0 ? "is-over" : ""}">${allUnlimited ? "—" : fmt(budgetRemaining)}</strong></div>
    ${budgets.unlimitedCount ? `<div><span>${esc(window.lifeOsI18n.t("Unlimited category spending"))}</span><strong class="num">${fmt(budgets.unlimitedSpent)}</strong></div>` : ""}
  `;
  bt.innerHTML =
    state.categories.length === 0
      ? emptyStateHtml(
          "layout",
          window.lifeOsI18n.t("No budget categories yet"),
          window.lifeOsI18n.t("Add a category to start tracking where the money goes."),
        )
      : state.categories
          .map((cat) => {
            const spent = state.expenses
              .filter((e) => e.categoryId === cat.id)
              .reduce((s, e) => s + e.amount, 0);
            const pct = cat.target > 0 ? (spent / cat.target) * 100 : 0;
            const pctDisplay = Math.round(pct);
            const fillPct = Math.min(pct, 100);
            const unlimited = budgetIsUnlimited(cat);
            const over = !unlimited && spent > cat.target;
            const ovBy = spent - cat.target;
            const remaining = cat.target - spent;
            return `
    <article class="budget-item${over ? " is-over" : ""}">
      <div class="budget-item-head">
        <span class="budget-name">${esc(cat.label)}</span>
        <button class="icon-btn" type="button" aria-label="${esc(__t('Edit {label} budget', { label: splitCategoryLabel(cat.label).name || cat.label }))}" title="${esc(window.lifeOsI18n.t("Edit budget"))}" onclick="openEditBudgetModal('${cat.id}')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
      </div>
      <div class="budget-amount-row">
        <div><span>${esc(window.lifeOsI18n.t("Spent"))}</span><strong class="num">${fmt(spent)}</strong></div>
        <div><span>${esc(window.lifeOsI18n.t(unlimited ? "Limit" : over ? "Over" : "Remaining"))}</span><strong class="num">${unlimited ? esc(window.lifeOsI18n.t("Unlimited")) : fmt(remaining)}</strong></div>
      </div>
      ${unlimited ? "" : `<div class="progress-track" role="progressbar" aria-label="${esc(cat.label)} budget usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pctDisplay, 100)}">
        <div class="progress-fill" style="width:${fillPct}%;background:${over ? "var(--rust)" : "var(--jade)"};"></div>
      </div>`}
      ${over ? `<span class="tag tag-rust over-note">${esc(__t("↑ {amount} over", { amount: fmt(ovBy) }))}</span>` : ""}
      <div class="budget-item-foot">${unlimited ? `<span>${esc(window.lifeOsI18n.t("No spending cap"))}</span>` : `<span>${pctDisplay}% ${esc(window.lifeOsI18n.t("used"))}</span><span class="num">${fmt(cat.target)} ${esc(window.lifeOsI18n.t("limit"))}</span>`}</div>
    </article>`;
          })
          .join("");

  const printBudgetBody = document.getElementById("printBudgetBody");
  if (printBudgetBody) {
    printBudgetBody.innerHTML = state.categories
      .map((category) => {
        const spent = state.expenses
          .filter((expense) => expense.categoryId === category.id)
          .reduce((sum, expense) => sum + expense.amount, 0);
        const remaining = category.target - spent;
        const used = category.target > 0 ? Math.round((spent / category.target) * 100) : 0;
        return `<tr>
          <td>${esc(category.label)}</td>
          <td class="num">${budgetIsUnlimited(category) ? esc(window.lifeOsI18n.t("Unlimited")) : fmt(category.target)}</td>
          <td class="num">${fmt(spent)}</td>
          <td class="num">${budgetIsUnlimited(category) ? "—" : (remaining < 0 ? "−" : "") + fmt(remaining)}</td>
          <td class="num">${budgetIsUnlimited(category) ? "—" : used + "%"}</td>
        </tr>`;
      })
      .join("");
  }

  // Charts
  try {
    renderCharts();
  } catch (err) {
    console.error("Chart render failed:", err);
  }
}

function setChartEmpty(canvasId, show, icon, title, hint) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas && canvas.parentElement;
  if (!wrap) return;
  let el = wrap.querySelector(".chart-empty");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.className = "chart-empty";
      el.innerHTML = emptyStateHtml(icon, window.lifeOsI18n.t(title), window.lifeOsI18n.t(hint));
      wrap.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

function renderCharts() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const numFont = "JetBrains Mono, monospace";
  const uiFont = "Inter, Vazirmatn, sans-serif";
  const incomeColors = ["#1FAE7E", "#C9A35F", "#E2633E", "#5C8AE6", "#9B6DFF", "#06B6D4", "#F0B429", "#4ADE80"];

  // Income doughnut
  const incCtx = document.getElementById("incomeChart").getContext("2d");
  if (incomeChart) incomeChart.destroy();

  setChartEmpty(
    "incomeChart",
    state.incomes.length === 0,
    "coins",
    window.lifeOsI18n.t("No income to break down"),
    window.lifeOsI18n.t("Income streams appear here as a donut once you add them."),
  );

  if (state.incomes.length === 0) {
    incomeChart = null;
  } else {
    incomeChart = new Chart(incCtx, {
      type: "doughnut",
      data: {
        labels: state.incomes.map((i) => i.name),
        datasets: [
          {
            data: state.incomes.map((i) => i.amount),
            backgroundColor: incomeColors.slice(0, state.incomes.length),
            borderColor: v("--chart-border"),
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: v("--chart-label"),
              font: { family: uiFont, size: 11 },
              padding: 12,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 10,
            titleFont: { family: uiFont, weight: "600" },
            bodyFont: { family: numFont },
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
            },
          },
        },
      },
    });
  }

  // Spending by category
  const spCtx = document.getElementById("spendChart").getContext("2d");
  if (spendChart) spendChart.destroy();

  const catTotals = state.categories
    .map((cat) => ({
      label: splitCategoryLabel(cat.label).name || cat.label,
      spent: state.expenses
        .filter((e) => e.categoryId === cat.id)
        .reduce((s, e) => s + e.amount, 0),
      target: budgetIsUnlimited(cat) ? null : cat.target,
    }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  setChartEmpty(
    "spendChart",
    catTotals.length === 0,
    "receipt",
    window.lifeOsI18n.t("Nothing spent yet"),
    window.lifeOsI18n.t("Log an expense to see spending by category."),
  );

  if (catTotals.length === 0) {
    spendChart = null;
  } else {
    spendChart = new Chart(spCtx, {
      type: "bar",
      data: {
        labels: catTotals.map((c) => c.label),
        datasets: [
          {
            label: window.lifeOsI18n.t("Spent"),
            data: catTotals.map((c) => c.spent),
            backgroundColor: catTotals.map((c) =>
              c.target !== null && c.spent > c.target ? "rgba(226,99,62,0.75)" : "rgba(31,174,126,0.75)",
            ),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 13,
          },
          {
            label: window.lifeOsI18n.t("Budget"),
            data: catTotals.map((c) => c.target),
            backgroundColor: v("--chart-bar-dim"),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 13,
          },
        ],
      },
      options: {
        animation: false,
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: v("--chart-label"),
              font: { family: uiFont, size: 11 },
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: "rectRounded",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 10,
            titleFont: { family: uiFont, weight: "600" },
            bodyFont: { family: numFont },
            callbacks: {
              label: (ctx) =>
                ctx.raw === null
                  ? ` ${ctx.dataset.label}: ${window.lifeOsI18n.t("Unlimited")}`
                  : ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: v("--chart-tick"),
              font: { size: 10, family: numFont },
            },
            grid: { color: v("--chart-grid") },
            border: { display: false },
          },
          y: {
            ticks: {
              color: v("--chart-label"),
              font: { size: 11, family: uiFont },
            },
            grid: { color: "transparent" },
            border: { display: false },
          },
        },
      },
    });
  }
}
