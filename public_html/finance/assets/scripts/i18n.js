// ── I18N ──────────────────────────────────────────────────────────────────────
// Tiny dependency-free translation layer. Static markup opts in via
// data-i18n / data-i18n-placeholder / data-i18n-aria attributes;
// dynamic strings call t(key, vars) directly.

const LANG_KEY = "edifinance_lang";

const I18N = {
  en: {
    // Header / actions
    period: "Period",
    importExcel: "Import Excel",
    exportExcel: "Export Excel",
    print: "Print",
    reset: "Reset",

    // Metrics
    mIncomeLabel: "01 · Income",
    mAllocatedLabel: "02 · Allocated",
    mSpentLabel: "03 · Spent",
    mBalanceLabel: "04 · Balance",
    mIncomeSub: "Toman logged this period",
    mAllocatedSub: "Toman across all categories",
    mSpentSub: "Toman actually paid out",
    mBalanceSub: "Toman remaining net",

    // Income card
    incomeStreams: "Income Streams",
    addIncomeStream: "Add Income Stream",

    // Expense card
    logExpenseHeading: "Log Expense",
    expensesHeading: "Expenses",
    logExpenseButton: "Log Expense",
    recentEntries: "Recent Entries",
    thCategory: "Category",
    thDesc: "Desc",
    thToman: "Toman",

    // Budget panel
    budgetTracker: "Budget Tracker",
    budgetCopy: "Set limits, track progress, and adjust a category at any time.",
    addCategoryShort: "Add category",
    addBudgetCategory: "＋ Add Budget Category",

    // Analytics
    incomeBreakdown: "Income Breakdown",
    spendingByCategory: "Spending by Category",

    // Footer
    footerNote:
      'localStorage, not "the cloud" — there is no cloud, it\'s just someone else\'s computer',

    // Import modal
    importTitle: "Import from Excel",
    importCopy:
      "Upload your finance workbook. Sheets matching the Budget structure (category totals, income sources, and a transaction list) will be parsed automatically.",
    chooseFile: "📂 Choose .xlsx file",
    dropHere: "or drag & drop here",
    cancel: "Cancel",
    multiSheetTitle: "Multiple sheets found",
    multiSheetCopy: "Choose which sheet to import from {file}.",
    tagOther: "Other",
    tagBudget: "Budget",
    tagLedger: "Ledger",
    importAllBudgets: "Import all Budget sheets",
    importedSheetsToast:
      "✓ Imported {n} Budget sheets as separate periods.",
    readFileError: "Could not read file: {err}",
    readFileFailed: "Failed to read file",
    badDropFile: "Please drop an .xlsx or .xls file",
    badStructure: "This sheet doesn't match the expected Budget structure",
    replacePeriodConfirm:
      'Replace the existing "{period}" period with this sheet?',
    noDataFound: 'No matching data found in "{sheet}"',
    importedPeriodToast:
      '✓ Imported "{sheet}" as a separate {period} period: {tx} transactions, {inc} income streams, {b} budgets',

    // Export / print
    exportLibMissing: "Excel export library is unavailable.",
    exportDone: "Excel report exported.",
    printMeta: "{period} financial report · {date} · Values in Toman",

    // Validation / confirms
    resetConfirm: 'Reset all data in "{period}" to defaults?',
    needNameAndAmount: "Enter a name and valid amount.",
    needCategory: "Select a category.",
    needValidAmount: "Enter a valid amount.",
    needCategoryName: "Enter a category name.",
    needBudgetAmount: "Enter a valid budget amount.",
    expenseLogged: "✓ Expense logged.",
    budgetUpdated: "Budget updated.",

    // Add income modal
    kickerIncome: "Income stream",
    addIncomeTitle: "Add Income",
    addIncomeCopy:
      "Log a new source of income, or update an existing one by reusing its name.",
    fieldStreamName: "Stream name",
    phStreamExample: "e.g. Salary",
    fieldAmount: "Amount in Toman",
    phAmountToman: "Amount in Toman",
    saveIncome: "Save Income",

    // Add expense modal
    kickerLedger: "Ledger entry",
    addExpenseTitle: "Log Expense",
    addExpenseCopy: "Record what you paid and where it belongs in the budget.",
    fieldCategory: "Category",
    selectCategory: "— Select Category —",
    fieldDescription: "Description",
    phDescription: "Description (optional)",
    logExpenseAction: "Log Expense",

    // Budget modals
    addBudgetTitle: "Add Budget Category",
    phEmojiExample: "Emoji (optional, e.g. 🎮)",
    phCategoryName: "Category name (e.g. Entertainment)",
    phMonthlyBudget: "Monthly budget in Toman",
    addCategoryAction: "Add Category",
    kickerBudget: "Budget category",
    editBudgetTitle: "Edit Budget",
    editBudgetCopy:
      "Change its name, icon, or monthly limit. Existing expenses stay attached.",
    fieldIcon: "Icon",
    phEmojiOptional: "Optional emoji",
    fieldCategoryName: "Category name",
    fieldMonthlyLimit: "Monthly limit in Toman",
    saveChanges: "Save changes",

    // Edit income / expense
    editIncomeTitle: "Edit Income",
    phStreamName: "Stream name",
    editExpenseTitle: "Edit Expense",

    // Context menu
    edit: "✏️ Edit",
    delete: "🗑️ Delete",

    // Empty states
    esNoIncome: "No income streams yet",
    esNoIncomeHint: "Add your first source of income to open the ledger.",
    esNoExpense: "No expenses logged yet",
    esNoExpenseHint: "Log your first expense and it will appear here.",
    esNoCategories: "No budget categories yet",
    esNoCategoriesHint: "Add a category to start tracking where the money goes.",
    esNoIncomeChart: "No income to break down",
    esNoIncomeChartHint: "Income streams appear here as a donut once you add them.",
    esNothingSpent: "Nothing spent yet",
    esNothingSpentHint: "Log an expense to see spending by category.",

    // Budget rendering
    spent: "Spent",
    remaining: "Remaining",
    over: "Over",
    usedPct: "used",
    limit: "limit",
    overByTag: "↑ {amount} over",
    monthlyPlan: "Monthly plan",
    usedLabel: "Used",
    available: "Available",
    overPlan: "Over plan",
    seriesSpent: "Spent",
    seriesBudget: "Budget",

    // Lang toggle
    langToggleTitle: "Switch language",

    // Settings modal
    kickerSettings: "Preferences",
    settingsTitle: "Settings",
    settingsAria: "Open settings",
    appearance: "Appearance",
    darkMode: "Dark",
    lightMode: "Light",
    language: "Language",
    langEn: "English",
    langFa: "فارسی",
    dangerZone: "Danger zone",
    resetTitle: "Reset all data",
    resetCopy:
      'Every income stream, expense and budget in "{period}" will be wiped and replaced with defaults. This cannot be undone.',
    resetAction: "Reset period data",

    // Period navigation
    prevPeriod: "Previous month",
    nextPeriod: "Next month",
    newPeriodToast: 'New period "{period}" created.',

    // Delete
    deleteCategoryConfirm:
      'Delete "{label}" and its {n} expense(s)? This cannot be undone.',
  },

  fa: {
    // Header / actions
    period: "دوره",
    importExcel: "ورود از اکسل",
    exportExcel: "خروجی اکسل",
    print: "چاپ",
    reset: "بازنشانی",

    // Metrics
    mIncomeLabel: "۰۱ · درآمد",
    mAllocatedLabel: "۰۲ · بودجه‌بندی",
    mSpentLabel: "۰۳ · هزینه‌شده",
    mBalanceLabel: "۰۴ · مانده",
    mIncomeSub: "تومان ثبت‌شده در این دوره",
    mAllocatedSub: "تومان در کل دسته‌ها",
    mSpentSub: "تومان که واقعاً پرداخت شده",
    mBalanceSub: "تومان ماندهٔ خالص",

    // Income card
    incomeStreams: "جریان‌های درآمد",
    addIncomeStream: "افزودن جریان درآمد",

    // Expense card
    logExpenseHeading: "ثبت هزینه",
    expensesHeading: "هزینه‌ها",
    logExpenseButton: "ثبت هزینه",
    recentEntries: "آخرین تراکنش‌ها",
    thCategory: "دسته",
    thDesc: "شرح",
    thToman: "تومان",

    // Budget panel
    budgetTracker: "ردیاب بودجه",
    budgetCopy: "محدودیت تعیین کنید، پیشرفت را ببینید و هر وقت خواستید دسته‌ها را تنظیم کنید.",
    addCategoryShort: "افزودن دسته",
    addBudgetCategory: "＋ افزودن دسته بودجه",

    // Analytics
    incomeBreakdown: "تفکیک درآمد",
    spendingByCategory: "هزینه‌ها بر اساس دسته",

    // Footer
    footerNote:
      "لوکال‌استوریج، نه «ابر» — ابر وجود ندارد؛ فقط کامپیوترِ کسی دیگر است",

    // Import modal
    importTitle: "ورود از اکسل",
    importCopy:
      "کتاب کار مالی‌تان را بارگذاری کنید. شیت‌هایی که با ساختار بودجه (جمع دسته‌ها، منابع درآمد و فهرست تراکنش‌ها) هم‌خوانی داشته باشند، خودکار پردازش می‌شوند.",
    chooseFile: "📂 انتخاب فایل xlsx",
    dropHere: "یا بکشید و اینجا رها کنید",
    cancel: "انصراف",
    multiSheetTitle: "چند شیت پیدا شد",
    multiSheetCopy: "انتخاب کنید از کدام شیت وارد شود: {file}",
    tagOther: "سایر",
    tagBudget: "بودجه",
    tagLedger: "دفتر",
    importAllBudgets: "ورود همه شیت‌های بودجه",
    importedSheetsToast: "✓ {n} شیت بودجه به‌عنوان دورهٔ جداگانه وارد شد.",
    readFileError: "خواندن فایل ممکن نشد: {err}",
    readFileFailed: "خواندن فایل ناموفق بود",
    badDropFile: "لطفاً یک فایل xlsx یا xls رها کنید",
    badStructure: "ساختار این شیت با ساختار مورد انتظار بودجه هم‌خوانی ندارد",
    replacePeriodConfirm: "دورهٔ موجود «{period}» با این شیت جایگزین شود؟",
    noDataFound: "دادهٔ سازگاری در «{sheet}» پیدا نشد",
    importedPeriodToast:
      "✓ «{sheet}» به‌عنوان دورهٔ مجزای {period} وارد شد: {tx} تراکنش، {inc} جریان درآمد، {b} بودجه",

    // Export / print
    exportLibMissing: "کتابخانهٔ خروجی اکسل در دسترس نیست.",
    exportDone: "خروجی اکسل گرفته شد.",
    printMeta: "گزارش مالی {period} · {date} · مبالغ به تومان",

    // Validation / confirms
    resetConfirm: "همهٔ داده‌های دورهٔ «{period}» به حالت پیش‌فرض برگردد؟",
    needNameAndAmount: "نام و مبلغ معتبر وارد کنید.",
    needCategory: "یک دسته انتخاب کنید.",
    needValidAmount: "مبلغ معتبر وارد کنید.",
    needCategoryName: "نام دسته را وارد کنید.",
    needBudgetAmount: "مبلغ بودجهٔ معتبر وارد کنید.",
    expenseLogged: "✓ هزینه ثبت شد.",
    budgetUpdated: "بودجه به‌روزرسانی شد.",

    // Add income modal
    kickerIncome: "جریان درآمد",
    addIncomeTitle: "افزودن درآمد",
    addIncomeCopy:
      "یک منبع درآمد جدید ثبت کنید، یا با تکرار نام، مقدار قبلی را به‌روزرسانی کنید.",
    fieldStreamName: "نام جریان",
    phStreamExample: "مثلاً حقوق",
    fieldAmount: "مبلغ به تومان",
    phAmountToman: "مبلغ به تومان",
    saveIncome: "ذخیرهٔ درآمد",

    // Add expense modal
    kickerLedger: "قلم دفتر",
    addExpenseTitle: "ثبت هزینه",
    addExpenseCopy: "آنچه پرداخت کرده‌اید و جای آن در بودجه را ثبت کنید.",
    fieldCategory: "دسته",
    selectCategory: "— انتخاب دسته —",
    fieldDescription: "شرح",
    phDescription: "شرح (اختیاری)",
    logExpenseAction: "ثبت هزینه",

    // Budget modals
    addBudgetTitle: "افزودن دسته بودجه",
    phEmojiExample: "ایموجی (اختیاری، مثلاً 🎮)",
    phCategoryName: "نام دسته (مثلاً سرگرمی)",
    phMonthlyBudget: "بودجهٔ ماهانه به تومان",
    addCategoryAction: "افزودن دسته",
    kickerBudget: "دستهٔ بودجه",
    editBudgetTitle: "ویرایش بودجه",
    editBudgetCopy:
      "نام، نماد یا سقف ماهانه را تغییر دهید. هزینه‌های قبلی سر جای خود می‌مانند.",
    fieldIcon: "نماد",
    phEmojiOptional: "ایموجی (اختیاری)",
    fieldCategoryName: "نام دسته",
    fieldMonthlyLimit: "سقف ماهانه به تومان",
    saveChanges: "ذخیرهٔ تغییرات",

    // Edit income / expense
    editIncomeTitle: "ویرایش درآمد",
    phStreamName: "نام جریان",
    editExpenseTitle: "ویرایش هزینه",

    // Context menu
    edit: "✏️ ویرایش",
    delete: "🗑️ حذف",

    // Empty states
    esNoIncome: "هنوز جریان درآمدی ندارید",
    esNoIncomeHint: "برای باز شدن دفتر، نخستین منبع درآمد را اضافه کنید.",
    esNoExpense: "هنوز هزینه‌ای ثبت نشده",
    esNoExpenseHint: "نخستین هزینه را ثبت کنید تا اینجا نمایش داده شود.",
    esNoCategories: "هنوز دسته بودجه‌ای ندارید",
    esNoCategoriesHint: "برای ردیابی خرج‌ها یک دسته اضافه کنید.",
    esNoIncomeChart: "درآمدی برای تفکیک نیست",
    esNoIncomeChartHint: "با افزودن جریان‌های درآمد، نمودار اینجا ظاهر می‌شود.",
    esNothingSpent: "هنوز چیزی خرج نشده",
    esNothingSpentHint: "برای دیدن هزینه‌ها بر اساس دسته، هزینه‌ای ثبت کنید.",

    // Budget rendering
    spent: "هزینه‌شده",
    remaining: "باقی‌مانده",
    over: "بیشتر",
    usedPct: "مصرف",
    limit: "سقف",
    overByTag: "↑ {amount} بیشتر از سقف",
    monthlyPlan: "پلن ماهانه",
    usedLabel: "مصرف‌شده",
    available: "در دسترس",
    overPlan: "فراتر از پلن",
    seriesSpent: "هزینه",
    seriesBudget: "بودجه",

    // Lang toggle
    langToggleTitle: "تغییر زبان",

    // Settings modal
    kickerSettings: "تنظیمات",
    settingsTitle: "تنظیمات",
    settingsAria: "باز کردن تنظیمات",
    appearance: "ظاهر",
    darkMode: "تیره",
    lightMode: "روشن",
    language: "زبان",
    langEn: "English",
    langFa: "فارسی",
    dangerZone: "ناحیهٔ خطر",
    resetTitle: "بازنشانی همهٔ داده‌ها",
    resetCopy:
      "همهٔ جریان‌های درآمد، هزینه‌ها و بودجه‌های دورهٔ «{period}» پاک و با مقادیر پیش‌فرض جایگزین می‌شوند. این کار قابل بازگشت نیست.",
    resetAction: "بازنشانی داده‌های دوره",

    // Period navigation
    prevPeriod: "ماه قبل",
    nextPeriod: "ماه بعد",
    newPeriodToast: "دورهٔ جدید «{period}» ساخته شد.",

    // Delete
    deleteCategoryConfirm:
      "«{label}» و {n} هزینهٔ آن حذف شود؟ این کار قابل بازگشت نیست.",
  },
};

let currentLang = "en";

function t(key, vars) {
  let str =
    (I18N[currentLang] && I18N[currentLang][key]) ?? I18N.en[key] ?? key;
  if (vars) {
    for (const k in vars) str = str.replaceAll("{" + k + "}", String(vars[k]));
  }
  return str;
}

function uiFont() {
  return currentLang === "fa" ? "Vazirmatn, Inter" : "Inter";
}

function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function setLang(lang) {
  currentLang = I18N[lang] ? lang : "en";
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "fa" ? "rtl" : "ltr";
  try {
    localStorage.setItem(LANG_KEY, currentLang);
  } catch {}
  applyStaticI18n();
  const btn = document.getElementById("langToggle");
  if (btn) {
    btn.textContent = currentLang === "fa" ? "EN" : "فا";
    btn.title = t("langToggleTitle");
    btn.setAttribute("aria-label", t("langToggleTitle"));
  }
  if (typeof state !== "undefined") {
    try {
      render();
    } catch {}
  }
}

function toggleLang() {
  setLang(currentLang === "fa" ? "en" : "fa");
}

// Initialize from storage → browser preference. Runs before script.js,
// so `state` is undefined here and the render() call is safely skipped.
(function () {
  let saved = null;
  try {
    saved = localStorage.getItem(LANG_KEY);
  } catch {}
  setLang(
    saved ||
      ((navigator.language || "").toLowerCase().startsWith("fa")
        ? "fa"
        : "en"),
  );
})();
