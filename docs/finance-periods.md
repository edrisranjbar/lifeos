# Finance periods

Finance uses Persian calendar months, calculated in Asia/Tehran. When Finance opens, it creates the current month if absent and selects that newly created period. Subsequent visits preserve the selected period, including historical periods. Periods are created on opening Finance, not by a background server job.

The period selector includes Create period. Enter a Persian year/month, such as 1405/08; Persian and Arabic digits are supported. Choosing an existing month opens it without replacing data. Navigation arrows use Persian months.

New periods copy only the selected ledger's budget categories (including Unlimited flags). Income and expense lists start empty. Existing periods and transactions are preserved; no automatic balance carryover or transaction migration occurs. Legacy free-form period names remain available. New monthly ledgers include calendarPeriod metadata.
