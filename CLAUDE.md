# Cadence

A single-page daily efficiency tracker. No build step, no server, no dependencies —
open `index.html` in a browser and it runs. Data lives in `localStorage` under `cadence.v1`.

## Files

| File | |
|---|---|
| `index.html` | page shell: topbar, six tabs, `<main id="view">`, toast, hidden file input |
| `app.js` | everything — state, scoring, all six views, events (~1500 lines, one IIFE) |
| `styles.css` | all styling, light + dark via CSS custom properties |
| `smoke-test.html` | 146 tests, helper is `ok(label, cond)` — open in a browser, read the list at the bottom |
| `README.md` | user-facing docs — what the app does |
| `PLAN.md` | build record: what's shipped, what's known-broken, ideas not taken up |

## Working on it

- **Verify by opening `smoke-test.html` in a browser** and confirming the count and that
  nothing failed. There is no CLI test runner. Add cases for new behaviour — the count has
  grown 34 → 58 → 70 → 81 → 90 → 112 → 118 → 132 → 146 across stages, so it goes in the commit.
- **No build, no npm, no dependencies.** Plain DOM APIs and template-literal HTML. Keep it
  that way — the whole point is that the file opens from disk.
- **Keep `README.md` and `PLAN.md` current** in the same commit as the change. PLAN.md
  carries the "Known, not yet fixed" list; move things off it as they're fixed.

## Architecture

`app.js` is organised in commented banner sections, in this order: constants, state,
storage, helpers, scoring, render root, view: today, tasks, view: tasks, view: journal,
view: trends, view: calendar, view: settings, events, boot.

**State.** Two module-level `let`s: `db` (persisted; `{ profiles, activeProfileId, theme }`)
and `ui` (ephemeral view state — current date, range, journal query/filters). `save()`
writes `db` to localStorage; `render()` rebuilds `#view` wholesale from `ui.view`.

**Rendering is full-redraw.** Each `viewX()` returns/writes an HTML string; there is no
diffing. The one exception is `refreshScores()`, which updates the ring and row scores in
place while typing so the DOM isn't rebuilt under the caret.

**Events are delegated** from the document in `onClick` / `onChange` / `onInput`, dispatched
on `data-*` attributes. `onClick` opens with one long `closest()` selector listing every
recognised attribute — add new `data-` hooks there or the handler will never see them.

**Scoring** is `metricScore(m, raw)` (one metric, one day → 0–100) and `dayScore(k)`
(weighted average, or `null` if the day wasn't logged). Three metric types in `TYPES`:
yes/no, number-vs-goal (with an "at most" variant that slides to 0 at double the cap),
rating 1–10.

## Rules the code depends on

- **One entry per day, one store.** `entries[dateKey]` holds `{ values, note, starred,
  closedAt, tasks, scoring, type, off }`. `entry.note` *is* the journal entry — the Day tab and Journal tab
  write the same field. Never add a parallel store for prose.
- **Storage changes are additive.** New fields are read with defaults so old JSON backups
  import untouched. There is no migration step and there should not need to be one.
- **`isLogged(k)` requires at least one recorded value.** An entry object alone is not a
  logged day — writing a note or adding a task must not score the day 0% and drag averages
  down. This was a real bug; don't reintroduce it.
- **Closing a day is a marker, not a lock.** `dayScore()` ignores `closedAt` entirely. A
  closed day stays editable and keeps its stamp when edited; reopening is always allowed
  and only ever via an explicit button, never a side effect.
- **Tasks are unscored and never move.** They live on the day they were written; carry-over
  of unfinished tasks is computed at render time in `tasksOn(k)`, so nothing mutates at
  midnight. Deliberately excluded from `dayScore()` — a progress ring was built and removed
  because "1 of 5 done" rendered as a red 20%, which is the judgement the feature exists to
  avoid.
- **A day is scored by its own frozen rules.** `entry.scoring` records the categories,
  targets and weights in force when the day was logged; `scoringFor(k)` reads it and
  `dayScore()` / `ringGeometry()` both go through that, so the ring can't disagree with the
  number. Never score history off the live category list — that was the archiving bug.
  Only `resnapshotToday()` re-freezes, and only today.
- **Day types say what a day was for.** A type is a name, an icon and which categories
  count — no per-type targets or weights. Every day still scores: `setMetricOnDay()`
  refuses to drop the last category, because "all off" would be a way to delete a day from
  the averages. Categories switched off by hand go in `entry.off` and are *stored, not
  inferred* — inferring them from the snapshot means a newly added category reads as
  "dropped on purpose" and never reaches the day in progress.
- **Escape before interpolating.** `esc()` on anything user-typed. In `excerpt()`, escape
  first and mark the search query inside the escaped text — never the reverse.
- **Dates are `YYYY-MM-DD` local-time strings** via `dateKey()` / `parseKey()`. Never
  `toISOString()` — it shifts the day across timezones.
- **The calendar and any historical range start at `profileStart()`**, so the app never
  offers days that predate the profile.
