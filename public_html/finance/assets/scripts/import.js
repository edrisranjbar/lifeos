// ── EXCEL IMPORT (Khordad Budget structure) ──────────────────────────────────
// Expected layout per the "Khordad Budget" sheet (0-indexed columns):
//   col1(B)=category name   col2(C)=budget total   col3(D)=spent
//   col6(G)=income name     col7(H)=income total
//   col9(J)=tx id  col10(K)=tx name  col11(L)=tx amount  col12(M)=type(want/need/saving)  col13(N)=tx category
let pendingWorkbook = null;
let pendingFileName = "";

function openImportModal() {
  openModal(
    `
    <div class="section-label" style="margin-bottom:18px;">${esc(window.lifeOsI18n.t("Import from Excel"))}</div>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:18px;">
      ${esc(window.lifeOsI18n.t("Upload your finance workbook. Sheets matching the Budget structure (category totals, income sources, and a transaction list) will be parsed automatically."))}
    </p>
    <div class="upload-zone" id="uploadZone">
      <input type="file" id="excelFileInput" accept=".xlsx,.xls" onchange="handleFileSelect(event)">
      <div style="font-size:14px;font-weight:600;color:var(--jade);">${esc(window.lifeOsI18n.t("📂 Choose .xlsx file"))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;">${esc(window.lifeOsI18n.t("or drag & drop here"))}</div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
    </div>
  `,
    true,
  );

  setTimeout(() => {
    const zone = document.getElementById("uploadZone");
    if (!zone) return;
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file && /\.(xlsx|xls)$/i.test(file.name)) {
        readWorkbookFile(file);
      } else {
        showToast(window.lifeOsI18n.t("Please drop an .xlsx or .xls file"), "error");
      }
    });
  }, 0);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  readWorkbookFile(file);
}

function readWorkbookFile(file) {
  pendingFileName = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      pendingWorkbook = XLSX.read(ev.target.result, { type: "array" });
      const sheetNames = pendingWorkbook.SheetNames;
      if (sheetNames.length === 1) {
        importFromSheet(sheetNames[0]);
      } else {
        showSheetPicker(sheetNames);
      }
    } catch (err) {
      showToast(__t("Could not read file: {err}", { err: err.message }), "error");
    }
  };
  reader.onerror = () => showToast(window.lifeOsI18n.t("Failed to read file"), "error");
  reader.readAsArrayBuffer(file);
}

function showSheetPicker(sheetNames) {
  const budgetSheetNames = sheetNames.filter((name) =>
    name.toLowerCase().includes("budget"),
  );
  const encodedBudgetSheets = encodeURIComponent(JSON.stringify(budgetSheetNames)).replace(
    /'/g,
    "%27",
  );
  const options = sheetNames
    .map((name) => {
      const lower = name.toLowerCase();
      let tag = `<span class="tag" style="background:var(--ink-line);color:var(--muted);">${esc(window.lifeOsI18n.t("Other"))}</span>`;
      if (lower.includes("budget"))
        tag = `<span class="tag tag-jade">${esc(window.lifeOsI18n.t("Budget"))}</span>`;
      else if (lower.includes("accounting"))
        tag = `<span class="tag" style="background:var(--brass-soft);color:var(--brass);">${esc(window.lifeOsI18n.t("Ledger"))}</span>`;
      return `<div class="sheet-option" onclick="importFromSheet('${esc(name)}')">
      <span style="font-size:13px;font-weight:600;">${esc(name)}</span>
      ${tag}
    </div>`;
    })
    .join("");

  openModal(
    `
    <div class="section-label" style="margin-bottom:8px;">${esc(window.lifeOsI18n.t("Multiple sheets found"))}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:18px;">${esc(__t("Choose which sheet to import from {file}.", { file: pendingFileName }))}</p>
    <div style="max-height:340px;overflow-y:auto;" class="scrollable">${options}</div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc(window.lifeOsI18n.t("Cancel"))}</button>
      ${budgetSheetNames.length > 1 ? `<button class="btn-primary" style="flex:1;" onclick="importBudgetSheets('${encodedBudgetSheets}')">${esc(window.lifeOsI18n.t("Import all Budget sheets"))}</button>` : ""}
    </div>
  `,
    true,
  );
}

function importBudgetSheets(encodedSheetNames) {
  const sheetNames = JSON.parse(decodeURIComponent(encodedSheetNames));
  sheetNames.forEach((sheetName) => importFromSheet(sheetName));
  showToast(__t("✓ Imported {n} Budget sheets as separate periods.", { n: sheetNames.length }), "success");
}

const IMPORT_CAT_MAP = {
  "food & drinks": "food",
  "food and drinks": "food",
  food: "food",
  family: "family",
  "housing & construction": "housing",
  "housing and construction": "housing",
  home: "housing",
  "work & growth": "work",
  "work and growth": "work",
  "work expenses": "work",
  "project expenses": "project",
  project: "project",
  "saving & investment": "saving",
  "saving and investment": "saving",
  saving: "saving",
  transportation: "transport",
  transport: "transport",
  "loans & debts": "loans",
  "loans and debts": "loans",
  "debts and loans": "loans",
  "bills, internet, vpn": "bills",
  bills: "bills",
  internet: "bills",
  "charity & donation": "charity",
  "charity and donation": "charity",
  donation: "charity",
  "gift and donation": "charity",
  "health & beauty": "health",
  "health and beauty": "health",
  health: "health",
  clothing: "clothing",
  cloth: "clothing",
  banking: "work",
  "fun & entertainment": "work",
  charge: "bills",
  wedding: "family",
};

function matchImportCategory(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return IMPORT_CAT_MAP[key] || null;
}

function ensureCategory(catId, rawLabel) {
  let cat = state.categories.find((c) => c.id === catId);
  if (!cat) {
    cat = { id: catId, label: rawLabel || catId, target: 0 };
    state.categories.push(cat);
  }
  return cat;
}

function findBudgetHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const normalized = (rows[i] || []).map((cell) =>
      String(cell || "")
        .toLowerCase()
        .trim(),
    );
    const hasNameTotalPair = normalized.some(
      (cell, index) => cell === "name" && normalized[index + 1] === "total",
    );
    if (hasNameTotalPair && normalized.includes("id")) return i;
  }
  return -1;
}

function importFromSheet(sheetName) {
  closeModal();
  if (!pendingWorkbook) {
    showToast(window.lifeOsI18n.t("No file loaded"), "error");
    return;
  }
  const ws = pendingWorkbook.Sheets[sheetName];
  if (!ws) {
    showToast(window.lifeOsI18n.t("Sheet not found: ") + sheetName, "error");
    return;
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Budget sheets may have blank/decorative leading columns, so locate the
  // adjacent name/total pair and transaction id header wherever they appear.
  const headerIdx = findBudgetHeaderRow(rows);

  if (headerIdx < 0) {
    showToast(window.lifeOsI18n.t("This sheet doesn\'t match the expected Budget structure"), "error");
    return;
  }

  const importPeriod = String(sheetName).replace(/\s+Budget$/i, "").trim() || sheetName;
  if (
    periods[importPeriod] &&
    !confirm(__t("Replace the existing \"{period}\" period with this sheet?", { period: importPeriod }))
  ) {
    return;
  }

  // Persist the active ledger, then parse the selected sheet into an isolated
  // period. Imports must never append into the month currently being viewed.
  save();
  const previousPeriod = activePeriod;
  const previousState = cloneState(state);
  activePeriod = importPeriod;
  state = freshState();

  // Read column positions dynamically from the header row itself.
  // The header has two "name"/"total" pairs (categories + income) and one "id"/"name"/"total" triple (transactions).
  // We locate each group by scanning the header.
  const hdr = rows[headerIdx];
  let catNameIdx = -1,
    catTotalIdx = -1;
  let incNameIdx = -1,
    incTotalIdx = -1;
  let txIdIdx = -1,
    txNameIdx = -1,
    txAmtIdx = -1,
    txCatIdx = -1;

  let nameOccurrences = [];
  hdr.forEach((cell, idx) => {
    if (
      String(cell || "")
        .toLowerCase()
        .trim() === "name"
    )
      nameOccurrences.push(idx);
  });

  // First "name" group → categories
  if (nameOccurrences[0] !== undefined) {
    catNameIdx = nameOccurrences[0];
    catTotalIdx = catNameIdx + 1;
  }
  // Second "name" group → income sources
  if (nameOccurrences[1] !== undefined) {
    incNameIdx = nameOccurrences[1];
    incTotalIdx = incNameIdx + 1;
  }
  // "id" column → transaction block
  const txIdHdrIdx = hdr.findIndex(
    (c) =>
      String(c || "")
        .toLowerCase()
        .trim() === "id",
  );
  if (txIdHdrIdx !== -1) {
    txIdIdx = txIdHdrIdx;
    txNameIdx = txIdHdrIdx + 1;
    txAmtIdx = txIdHdrIdx + 2;
    // "category" may be at +3 (no Type col) or +4 (with Type col)
    const afterAmt = String(hdr[txIdHdrIdx + 3] || "")
      .toLowerCase()
      .trim();
    txCatIdx = afterAmt === "type" ? txIdHdrIdx + 4 : txIdHdrIdx + 3;
  }

  let newIncomeCount = 0,
    newExpenseCount = 0,
    updatedBudgets = 0;
  const newIncomeMap = {};

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // Budget categories
    if (catNameIdx !== -1) {
      const catName = r[catNameIdx];
      const catTotal = parseFloat(r[catTotalIdx]);
      const unlimited = ['unlimited', '∞', 'نامحدود', 'غير محدود'].includes(String(r[catTotalIdx] ?? '').trim().toLowerCase());
      if (catName && (unlimited || (Number.isFinite(catTotal) && catTotal > 0))) {
        const lowerCat = String(catName).toLowerCase().trim();
        const isSummary = ["want:", "need:", "saving:", "balance:"].includes(
          lowerCat,
        );
        if (!isSummary) {
          const catId = matchImportCategory(catName);
          if (catId) {
            const cat = ensureCategory(catId, catName);
            if (!unlimited) cat.target = catTotal;
            cat.unlimited = unlimited;
            updatedBudgets++;
          }
        }
      }
    }

    // Income sources
    if (incNameIdx !== -1) {
      const incName = r[incNameIdx];
      const incAmount = parseFloat(r[incTotalIdx]);
      if (incName && !isNaN(incAmount) && incAmount > 0) {
        const lowerName = String(incName).toLowerCase().trim();
        if (!["total icome:", "total income:", "goal:"].includes(lowerName)) {
          const id = lowerName.replace(/\s+/g, "_");
          newIncomeMap[id] = { id, name: String(incName), amount: incAmount };
          newIncomeCount++;
        }
      }
    }

    // Transactions
    if (txNameIdx !== -1) {
      const txName = r[txNameIdx];
      const txAmount = parseFloat(r[txAmtIdx]);
      const txCat = txCatIdx !== -1 ? r[txCatIdx] : null;
      if (
        txName &&
        !isNaN(txAmount) &&
        txAmount > 0 &&
        String(txName).toLowerCase().trim() !== "name"
      ) {
        let catId = matchImportCategory(txCat);
        if (!catId)
          catId = ensureCategory(
            "cat_" +
              String(txCat || "misc")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_"),
            txCat,
          ).id;
        state.expenses.push({
          id:
            Date.now().toString() +
            "_" +
            Math.random().toString(36).slice(2, 8),
          categoryId: catId,
          desc: String(txName),
          amount: txAmount,
          date: sheetName,
        });
        newExpenseCount++;
      }
    }
  }

  // Merge income streams: update existing, add new
  const existingIds = new Set(state.incomes.map((i) => i.id));
  Object.values(newIncomeMap).forEach((inc) => {
    if (existingIds.has(inc.id)) {
      const ex = state.incomes.find((i) => i.id === inc.id);
      ex.amount = inc.amount;
      ex.name = inc.name;
    } else {
      state.incomes.push(inc);
    }
  });

  if (newExpenseCount === 0 && newIncomeCount === 0 && updatedBudgets === 0) {
    activePeriod = previousPeriod;
    state = previousState;
    render();
    showToast(__t("No matching data found in \"{sheet}\"", { sheet: sheetName }), "error");
  } else {
    save();
    render();
    showToast(
      __t("✓ Imported \"{sheet}\" as a separate {period} period: {tx} transactions, {inc} income streams, {b} budgets", {
        sheet: sheetName,
        period: importPeriod,
        tx: newExpenseCount,
        inc: newIncomeCount,
        b: updatedBudgets,
      }),
      "success",
    );
  }
}
