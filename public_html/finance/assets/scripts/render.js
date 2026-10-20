// ── PERFORATION STRIP ─────────────────────────────────────────────────────────
function renderPerfStrip() {
  const row = document.getElementById("perfRow");
  if (!row) return;
  const width = row.parentElement.clientWidth || 1200;
  const count = Math.max(8, Math.floor(width / 16));
  row.innerHTML = Array(count).fill(window.lifeOsI18n.markup('<div class="perf-dot"></div>')).join("");
}

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

  // Metrics — tweened counters
  animateNumber(document.getElementById("metricIncome"), totalIncome, fmt);
  if (allUnlimited) document.getElementById("metricBudget").textContent = window.lifeOsI18n.t("Unlimited");
  else animateNumber(document.getElementById("metricBudget"), totalBudget, fmt);
  const budgetNote = document.querySelector('[data-i18n="mAllocatedSub"]');
  if (budgetNote) budgetNote.textContent = allUnlimited ? window.lifeOsI18n.t('No capped categories') : __t(budgets.unlimitedCount ? '{unit} across capped categories' : '{unit} across all categories', {unit:currencyUnit()});
  animateNumber(document.getElementById("metricSpent"), totalSpent, fmt);
  const balEl = document.getElementById("metricBalance");
  animateNumber(balEl, balance, (v) => (balance < 0 ? "−" : "") + fmt(v));
  balEl.style.color = balance < 0 ? "#FF8060" : "#39E6AD";

  // Income list
  const il = document.getElementById("incomeList");
  il.innerHTML =
    state.incomes.length === 0
      ? emptyStateHtml("coins", window.lifeOsI18n.t("No income streams yet"), window.lifeOsI18n.t("Add your first source of income to open the ledger."))
      : state.incomes
          .map(
            (inc) => `
      <div class="fade-in row-item income-stream-row" data-income-id="${esc(inc.id)}" onclick="showContextMenu(event,'income','${inc.id}')">
        <span class="income-stream-name" dir="auto">${esc(inc.name)}</span>
        <span class="num income-stream-amount">${fmt(inc.amount)}</span>
        <button type="button" class="expense-menu-button" aria-label="${esc(window.lifeOsI18n.t('Income actions'))}" onclick="showContextMenu(event,'income','${inc.id}')">⋯</button>
      </div>`,
          )
          .join("");

  // Transaction table
  const tbody = document.getElementById("txBody");
  const sorted = [...state.expenses].reverse();
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:0;">${emptyStateHtml(
      "receipt",
      window.lifeOsI18n.t("No expenses logged yet"),
      window.lifeOsI18n.t("Log your first expense and it will appear here."),
    )}</td></tr>`;
  } else {
    tbody.innerHTML = sorted
      .map((e) => {
        const cat = state.categories.find((c) => c.id === e.categoryId);
        return `<tr class="fade-in row-item" data-expense-id="${esc(e.id)}" style="border-top:1px solid var(--ink-line);" onclick="showContextMenu(event,'expense','${e.id}')">
        <td style="padding:11px 0;font-size:11px;color:var(--muted);">${cat ? esc(cat.label.substring(0, 14)) : esc(e.categoryId)}</td>
        <td style="padding:11px 4px;font-size:11px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.desc) || "—"}</td>
        <td class="num" style="padding:11px 0;text-align:end;font-size:12px;">${fmt(e.amount)}</td>
        <td style="padding:11px 0;text-align:end;"><button type="button" class="expense-menu-button" aria-label="${esc(window.lifeOsI18n.t('Expense actions'))}" onclick="showContextMenu(event,'expense','${e.id}')">⋯</button></td>
      </tr>`;
      })
      .join("");
  }

  // Budget tracker
  const bt = document.getElementById("budgetTracker");
  const budgetSummary = document.getElementById("budgetSummary");
  budgetSummary.classList.toggle('has-unlimited', budgets.unlimitedCount > 0);
  const budgetRemaining = budgets.remaining;
  const usedPct = totalBudget > 0 ? Math.round((budgets.spent / totalBudget) * 100) : 0;
  budgetSummary.innerHTML = `
    <div><span>${esc(window.lifeOsI18n.t(budgets.unlimitedCount ? "Capped budgets" : "Monthly plan"))}</span><strong class="num">${allUnlimited ? esc(window.lifeOsI18n.t("Unlimited")) : fmt(totalBudget)}</strong></div>
    <div><span>${esc(window.lifeOsI18n.t("Used"))}</span><strong class="num">${allUnlimited ? '—' : usedPct + '%'}</strong></div>
    <div><span>${esc(window.lifeOsI18n.t(budgetRemaining >= 0 ? "Available" : "Over plan"))}</span><strong class="num ${budgetRemaining < 0 ? "is-over" : ""}">${allUnlimited ? '—' : fmt(budgetRemaining)}</strong></div>
    ${budgets.unlimitedCount ? `<div><span>${esc(window.lifeOsI18n.t("Unlimited category spending"))}</span><strong class="num">${fmt(budgets.unlimitedSpent)}</strong></div>` : ''}
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
        <button class="icon-btn" type="button" aria-label="Edit ${esc(cat.label)} budget" title="${window.lifeOsI18n.t("Edit budget")}" onclick="openEditBudgetModal('${cat.id}')">${esc(window.lifeOsI18n.t("✏️ Edit")).replace("✏️ ", "")}</button>
      </div>
      <div class="budget-amount-row">
        <div><span>${esc(window.lifeOsI18n.t("Spent"))}</span><strong class="num">${fmt(spent)}</strong></div>
        <div><span>${esc(window.lifeOsI18n.t(unlimited ? "Limit" : over ? "Over" : "Remaining"))}</span><strong class="num">${unlimited ? esc(window.lifeOsI18n.t("Unlimited")) : fmt(remaining)}</strong></div>
      </div>
      ${unlimited ? '' : `<div class="progress-track" role="progressbar" aria-label="${esc(cat.label)} budget usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pctDisplay, 100)}">
        <div class="progress-fill" style="width:${fillPct}%;background:${over ? "var(--rust)" : "var(--jade)"};"></div>
      </div>`}
      ${over ? `<div style="display:flex;justify-content:flex-end;margin-top:9px;"><span class="tag tag-rust">${esc(__t("↑ {amount} over", { amount: fmt(ovBy) }))}</span></div>` : ""}
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
          <td class="num">${budgetIsUnlimited(category) ? '—' : (remaining < 0 ? "−" : "") + fmt(remaining)}</td>
          <td class="num">${budgetIsUnlimited(category) ? '—' : used + '%'}</td>
        </tr>`;
      })
      .join("");
  }

  // Charts
  try {
    renderCharts(totalIncome);
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

function renderCharts(totalIncome) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();

  // Income donut
  const incCtx = document.getElementById("incomeChart").getContext("2d");
  const incomeColors = [
    "#1FAE7E",
    "#C9A35F",
    "#E2633E",
    "#5C8AE6",
    "#9B6DFF",
    "#06B6D4",
    "#F0B429",
    "#4ADE80",
  ];
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
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: v("--chart-label"),
              font: { family: "Inter", size: 11 },
              padding: 14,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 12,
            titleFont: { family: "Inter", weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ` ${ctx.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
            },
          },
        },
      },
    });
  }

  // Spending bar chart
  const spCtx = document.getElementById("spendChart").getContext("2d");
  if (spendChart) spendChart.destroy();

  const catTotals = state.categories
    .map((cat) => ({
      label: cat.label,
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
            label: "Spent",
            data: catTotals.map((c) => c.spent),
            backgroundColor: catTotals.map((c) =>
              c.target !== null && c.spent > c.target
                ? "rgba(226,99,62,0.75)"
                : "rgba(31,174,126,0.75)",
            ),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 16,
          },
          {
            label: "Budget",
            data: catTotals.map((c) => c.target),
            backgroundColor: v("--chart-bar-dim"),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 16,
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
              font: { family: "Inter", size: 11 },
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 12,
            titleFont: { family: "Inter", weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ctx.raw === null ? ` ${ctx.dataset.label}: ${window.lifeOsI18n.t('Unlimited')}` : ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: v("--chart-tick"),
              font: { size: 10, family: "JetBrains Mono" },
            },
            grid: { color: v("--chart-grid") },
          },
          y: {
            ticks: {
              color: v("--chart-label"),
              font: { size: 11, family: "Inter" },
            },
            grid: { color: "transparent" },
          },
        },
      },
    });
  }
}
