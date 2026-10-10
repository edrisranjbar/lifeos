# Debts and credits

Finance has a **Debts & credits** workspace alongside its expenses, income streams and budgets. It uses Tehran dates and shows amounts in the currency chosen in **Settings** (Toman by default; amounts are never converted). Existing ledger periods and categories are preserved; no SQL schema migration is required.

## Two directions

- **I owe (debt):** money you pay. Recording a payment adds an **expense** to the ledger.
- **Owed to me (credit):** money someone pays you. Recording a receipt adds an **income** entry to the ledger.

Each side has its own totals, list and plans; the two sides are never mixed. Plans saved before directions existed are debts.

## Schedules

Both directions support the same schedules:

- **One-time:** a single amount on one due date.
- **Recurring, same amount each time:** daily, weekly, monthly or yearly, every 1–12 periods. It can run with no end, for a number of payments, or until a date. A recurring payment you owe can be marked as an optional subscription so single periods can be skipped.
- **Recurring, split a total:** a total (including any agreed charges) divided into a fixed number of payments. Amounts are whole units of the chosen currency; the rounding remainder goes into the last payment.

Amounts and dates are fixed after creation, so changing a plan cannot rewrite past dues. You can still:

- **Edit details:** name, person/company and notes.
- **Stop future dues** of a recurring same-amount plan from a date; earlier dues and decisions remain.
- **Delete** a plan entered by mistake, but only while none of its dues are paid or received. Undo those first.

For new terms, stop the old plan and create a replacement.

## Generated dues and statuses

The backend derives due occurrences when Finance or Calendar loads a date range. No cron job or placeholder expenses are needed. Occurrence identities are stable (`plan UUID:index`); refreshes cannot create duplicate dues. Monthly/yearly dates are anchored to the first due day and clamp to the end of shorter months (31 January → 28/29 February → 31 March).

| Stored status | Meaning |
| --- | --- |
| Pending | Payable; becomes overdue after the original due date. |
| Paid | Linked to a specific expense in an explicitly selected ledger period. |
| Rejected, optional subscription | That occurrence is skipped, excluded from remaining commitments and Calendar. Later occurrences remain scheduled. |
| Rejected, anything else (debt or credit) | Deferred (debt) or late (credit), still owed; becomes overdue after the original due date. The due date and amount do not change. |

An occurrence may be restored from rejected to pending. Paid occurrences must be undone before status changes. There are no bank transfers, automatic debits, interest calculations or background notification deliveries.

## Recording and undoing payments

For a debt, choose either **Add a new expense** (with a category) or **Link an expense already in the ledger** with the exact amount. For a credit, choose **Add it as new income** or **Link an income already in the ledger**. A ledger entry can back only one due. This version records full occurrence payments; use an installment schedule to split a debt. A payment date may be today or earlier; a future due can be paid early.

The payment decision and the expense are committed in one MySQL transaction. Revision checks cover the commitments document and both ledger documents after their rows are locked. Retried/double submissions cannot append a second expense to an already paid occurrence.

Undo atomically returns the due to pending. An unchanged expense created by that payment is removed. A preexisting expense that was merely linked, or an expense edited since payment, is retained and unlinked. Editing or deleting a linked expense or income through the normal Finance controls is blocked until the payment or receipt is undone. “View expense” selects its period and highlights the transaction.

Bulk reset/import can replace expenses. If a linked expense disappears or its amount no longer matches, the commitment is shown as needing reconciliation and counted as unpaid. Undo the stale payment, review the retained expense if present, then record/link the correct payment. Payment changes have an audit history.

## Dashboard and Calendar

Totals below are shown separately for each side (I owe / Owed to me). The due-month picker uses **Gregorian months**, independently of imported/custom ledger period names. Payment entry always asks for the destination ledger period instead of guessing from its name.

- **Commitments:** all due amounts in the selected month, minus optional skips.
- **Paid:** those monthly dues with a valid linked expense, regardless of which ledger period holds it.
- **Remaining:** monthly commitments minus verified paid amounts; includes required rejections.
- **Optional skips:** excluded monthly amounts, shown separately.
- **Earlier unpaid dues:** outstanding dues before the selected month, separately from monthly totals. For future selected months this includes earlier obligations that may not yet be overdue today.
- **Overdue this month:** unpaid monthly dues dated before today. Today is not overdue until the next Tehran date.

Each split or one-time plan also shows how much has been paid or received and the balance across its full schedule, including future dues.

Calendar has a Financial commitments filter alongside board filters. It loads generated dues for its 42-day month grid and earlier unpaid dues. Paid entries follow the existing include-completed switch; optional skips are omitted. Clicking a due opens Finance at its month and occurrence. A Finance loading failure is explicit and does not silently hide obligations while claiming there are no dues.

## Architecture

- `lib/obligations.php`: validation, recurrence, integer repayment allocation, summaries and atomic payment mutations.
- `finance-obligations.php`: authenticated session API. `GET ?start=YYYY-MM-DD&end=YYYY-MM-DD` returns plans, generated dues, totals and recent history; `GET ?occurrence=ID` resolves a single due. POST uses the shared session CSRF token, expected revisions and an action (`create`, `update`, `delete`, `cancel`, `pay`, `undo`, `reject`, `restore`). The view returns debt totals as `totals` and credit totals as `creditTotals`.
- `edi_obligations_v1`: separate `app_state` document with `version`, `plans[]`, `decisions[occurrenceId]` and `history[]`. It is read through shared storage but can be changed only through the commitments service, not generic state PUTs.
- `appStorage.mutateItems`: sequences multi-document backend mutations with ordinary saves and adopts all returned revisions/data together. Finance adopts those records without resaving an old in-memory copy.
- `daramd_periods_v1` remains the primary ledger; `daramd_v1` remains its active-period compatibility mirror. Existing source metadata is preserved.

This adds no dedicated MCP tool; existing Finance integrations see payment expenses through the existing expense API. The session endpoint is not a bearer-token endpoint. Deploy the endpoint, library, StateStore changes, storage bridge, Finance assets, Calendar assets and navigation together.
