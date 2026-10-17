# Personal growth workspace

Growth adds a planning and review layer over the existing Goals and Habittify workspaces. It does not copy or rewrite their records, automatically categorize private data, or alter finance history.

## Getting started

Goal progress respects the selected tracking source. For older goals without a saved source, an empty checklist plus a positive numeric target uses success measures (for example, 900 of 1,000 is 90%); goals with checklist items keep checklist tracking. The Goals detail progress refreshes when a current measure value is changed. Habit-linked goals continue to derive progress from Habittify.

1. Open **Growth** from the navigation or the six-dimension summary in Overview.
2. Choose a dimension and add a long-term goal: title, reason and optional target date.
3. Search and select existing SMART goals and daily habits. Growth does not connect to Kanban cards or individual tasks; a goal's own checklist still counts toward that goal's progress.
4. Open a linked goal to update it in Goals. Manage habits in Habittify. Create SMART goals with the existing Goals wizard and then connect them.
5. Complete a weekly, monthly or quarterly review. Record a reflection and a concrete next step for each dimension. The previous next step is shown during your next review.

The six fixed dimensions are Religion & Spirituality, Health, Relationships & Family, Finance, Self Growth, and Fun & Rest. A goal may support multiple dimensions through explicit connections. Within a dimension, repeated references count once.

Long-term goals can be active, achieved or archived. Archived plans remain editable and keep their connections, but do not contribute to dimension indicators. An achieved plan stays visible and contributes until archived; it does not force its underlying SMART goals to complete.

## Progress definitions

- **SMART progress:** average of linked, non-archived goals that have usable measurements. Each goal averages recorded measure ratios (current / positive target, clamped to 0–100%) and task completion, equally if both exist. Measures with an unknown current value are excluded. A goal with neither usable measures nor tasks is unmeasured, rather than assumed complete or zero.
- **Habit consistency:** completions divided by eligible daily opportunities across the most recent seven Tehran dates, including today. Days before a habit's creation are excluded. Habittify currently treats active habits as daily. Unavailable habit data is shown explicitly and does not erase saved connections.
- Missing/deleted source records and inactive habits are excluded from calculations; connections remain visible in the editor for deliberate unlinking. Archived goals are excluded without removing their saved references.

These indicators are not a wellbeing score. No composite life percentage is invented. A dimension without measured goals shows an empty measurement state.

## Reviews

Life Review is an eight-step flow: choose a cadence, reflect on each of the six dimensions, then edit the final summary before saving. Each dimension shows its connected progress and previous next step. Back/Continue and the step navigation retain input. Closing the modal keeps the draft in memory while the Growth page remains open; reloading or navigating away from that page discards the unsaved draft. Only the final Save review action writes a review. The layout uses a sidebar on desktop and compact step markers on mobile.

Reviews store the Tehran date, cadence, reflection and next step per dimension, and a numeric snapshot of goal and habit indicators at save time. Reviews saved before tasks were removed keep their old task numbers, which are no longer shown. Historical snapshots stay unchanged when source records change. Due dates follow a rolling interval from the latest review of the same cadence: weekly 7 days, monthly 30 days, quarterly 90 days. A cadence without a previous review is due today. There are no background notifications or email reminders.

## Persistence and architecture

`edi_growth_v1` is an authenticated, revision-protected `app_state` document:

```text
version: 1
plans[]: id, dimensionId, title, why, targetDate, status,
         goalIds[], habitIds[], createdAt, updatedAt
reviews[]: id, cadence, date, createdAt,
           notes[dimensionId]: reflection, next
           snapshot[dimensionId]: goalPct, habitPct,
                                  habitAvailable, goals, habits,
                                  completed, eligible
```

Plans saved before tasks were removed may still hold a `taskKeys[]` list; it is ignored and dropped the next time the plan is saved. Goal and habit IDs are normalized to strings for MySQL/browser compatibility. Additional document properties are preserved on edits.

`assets/growth-model.js` provides shared source resolution and calculations for Growth and Overview. `growth/app.js` owns forms and reviews. Growth writes through the shared storage mutation queue, session authentication, CSRF token and compare-and-swap revisions, and shows success only after the server confirms the write. A form opened before another change must be reopened instead of overwriting it. No SQL schema migration is required.

No dedicated growth endpoint or MCP tool has been added. Existing integration clients continue to edit source goals and habits, and Growth derives updated indicators on refresh. Deploy the new growth assets together with `state.php`, shared storage, navigation, dashboard and Goals deep-link changes.

## Habit-driven SMART goals

Choose **Linked habit** in the goal editor's Measurable step, select a habit and completed-day target, then set a start date and deadline. Habittify is the attendance record: unique completed dates inside the inclusive window, through today in Asia/Tehran, divided by the target (capped at 100%). Undoing attendance updates progress too. Historical logs still count after archiving a habit. No automatic attendance or duplicated goal tasks are created.

The goal card and detail show the count, automatic quarter milestones and a Habittify link. Habit settings only appear for this source; manual measure inputs and checklist controls are hidden. Existing checklist goals retain their behavior. Explicit Success measures goals use the average capped current/target ratio of their numeric measures.

Goal API/MCP accepts `progressSource` (`checklist`, `measure`, `habit`) and `habitProgress` (`habitId`, optional `habitName`, `targetDays`). Habit goals require valid start/deadline dates and a whole-day target within that window. GET goals includes derived `progress` and `effectiveStatus`; these are read-only outputs, never stored attendance. Overview and Life Review use the same habit progress definition. If logs cannot be read, the goal displays unavailable progress and keeps its saved settings.
