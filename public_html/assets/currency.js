// Display currency chosen in Settings. Amounts are stored as plain numbers and
// are never converted; this only changes the unit shown next to them.
(() => {
  const KEY = 'edi_currency_v1';
  const CURRENCIES = [
    { code: 'IRT', name: 'Iranian toman', unit: 'Toman' },
    { code: 'IRR', name: 'Iranian rial', unit: 'Rial' },
    { code: 'USD', name: 'US dollar', unit: 'USD' },
    { code: 'EUR', name: 'Euro', unit: 'EUR' },
    { code: 'GBP', name: 'British pound', unit: 'GBP' },
    { code: 'AED', name: 'UAE dirham', unit: 'AED' },
    { code: 'TRY', name: 'Turkish lira', unit: 'TRY' },
    { code: 'CAD', name: 'Canadian dollar', unit: 'CAD' },
    { code: 'AUD', name: 'Australian dollar', unit: 'AUD' },
    { code: 'CHF', name: 'Swiss franc', unit: 'CHF' },
    { code: 'JPY', name: 'Japanese yen', unit: 'JPY' },
    { code: 'CNY', name: 'Chinese yuan', unit: 'CNY' },
    { code: 'INR', name: 'Indian rupee', unit: 'INR' },
    { code: 'SEK', name: 'Swedish krona', unit: 'SEK' },
    { code: 'NOK', name: 'Norwegian krone', unit: 'NOK' },
    { code: 'DKK', name: 'Danish krone', unit: 'DKK' },
    { code: 'PLN', name: 'Polish zloty', unit: 'PLN' },
    { code: 'CZK', name: 'Czech koruna', unit: 'CZK' },
    { code: 'BRL', name: 'Brazilian real', unit: 'BRL' },
    { code: 'MXN', name: 'Mexican peso', unit: 'MXN' },
    { code: 'ARS', name: 'Argentine peso', unit: 'ARS' },
    { code: 'CLP', name: 'Chilean peso', unit: 'CLP' },
    { code: 'COP', name: 'Colombian peso', unit: 'COP' },
    { code: 'SAR', name: 'Saudi riyal', unit: 'SAR' },
    { code: 'QAR', name: 'Qatari riyal', unit: 'QAR' },
    { code: 'KWD', name: 'Kuwaiti dinar', unit: 'KWD' },
    { code: 'EGP', name: 'Egyptian pound', unit: 'EGP' },
    { code: 'ZAR', name: 'South African rand', unit: 'ZAR' },
    { code: 'NGN', name: 'Nigerian naira', unit: 'NGN' },
    { code: 'PKR', name: 'Pakistani rupee', unit: 'PKR' },
    { code: 'BDT', name: 'Bangladeshi taka', unit: 'BDT' },
  ];

  function current() {
    let code = null;
    try { code = window.appStorage?.getItem(KEY); } catch { /* Storage not ready yet. */ }
    return CURRENCIES.find(currency => currency.code === code) || CURRENCIES[0];
  }

  const unit = () => current().unit;

  // Static markup marks unit labels with data-currency-unit.
  function apply(root = document) {
    const text = unit();
    root.querySelectorAll('[data-currency-unit]').forEach(node => { node.textContent = text; });
  }

  window.lifeOsCurrency = { KEY, list: CURRENCIES, current, unit, apply };
  window.appStorageReady?.then(() => apply()).catch(() => {});
  addEventListener('app-storage-change', () => apply());
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => apply(), { once: true });
})();
