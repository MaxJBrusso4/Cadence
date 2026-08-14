# Cadence — build plan

**Status: all four stages built and passing (90 smoke tests).** What follows is the plan
they were built from; it doubles as the record of what the app now does.

Four pieces of work, in order. Nothing here needs a build step, a server, or a data
migration — every change is additive to the existing `cadence.v1` localStorage shape.

## Principles

- **One entry per day.** The journal is not a separate store; `entry.note` *is* the
  journal entry. Everything that reads or writes prose reads and writes that field.
- **Any day, any time.** You can write for any date whenever you like — the journal
  is not "today only" and never locks you out of the past.
- **Additive storage.** New fields get defaults on read. Old backups import unchanged.

---

## 1. Journal ✅

A fifth tab, between Today and Trends.

**Storage.** `entries[key]` gains two optional fields:

```js
{ values: {}, note: '', starred: false, closedAt: null }
```

Both are read with defaults, so existing data and old JSON backups work untouched.

**The list view.** Every day that has a note, newest first. Each row shows:

- date, a miniature score ring (the segmented one from §2, small),
- the first ~2 lines of the entry,
- word count, star toggle.

**Finding things.** Above the list:

- a search box — plain substring match across every note in the profile;
- score filter chips — `All` / `Great (80+)` / `Middling (55–79)` / `Rough (<55)` /
  `Unscored`. This is the feature no other journal can have: read back everything you
  wrote on your best days, or your worst, as a set.
- a `★ Starred` toggle.

**The read/write view.** Click a row to open that day full-width: the entry in a large
textarea, the day's score and category breakdown beside it, prev/next day arrows, and a
link through to Today for editing the numbers. Writing here saves to the same place the
Today note does — there is only ever one text per day.

**Blank page.** When a note is empty, show a rotating prompt above the box ("What made
today work?", "What did you avoid?", "What would you do differently?"). Prompt is chosen
deterministically from the date so it doesn't shuffle while you look at it.

**Writing stats,** in the list header: entries written, words this month, current
writing streak (consecutive days with a non-empty note), longest writing streak. These
reuse the existing `streak()` / `bestStreak()` helpers.

## 2. Today — segmented ring + context ✅

**Segmented ring.** Replace the single arc with one arc per active category. Each
category owns an angular slice proportional to its weight; within its slice a faint
track shows the full extent and a colored arc fills to that category's score. Small gap
between slices. Center still shows the weighted total and the word "efficiency".

Result: the ring stops being an abstract number and becomes a picture of the day — you
can see at a glance which categories carried it and which sank it. Hovering a slice
highlights the matching row below.

**Sparkline.** A 14-day mini line under the ring, so today reads in context rather than
in isolation. Dashed line at the goal threshold, today's point emphasized.

**"One thing left."** A single line under the ring naming the highest-leverage
incomplete category — the one whose remaining points × weight is largest. Clicking it
focuses that row. Disappears once everything is at 100%.

**Quieter rows.** The goal/weight subtext (`goal 8 h · weight ×2`) fades in on hover or
focus instead of sitting there permanently. Default row is icon, name, bar, input,
score — less to read, easier to scan.

## 3. Close the day ✅

An explicit end-of-day ritual. Right now a day never ends, you just stop typing.

- A `Close the day` button on Today, primary weight, sitting under the ring.
- On click: the ring animates to its final value, the score is stamped as
  `closedAt`, the streak pills tick up with a brief highlight, and if the note is empty
  the journal prompt slides in asking for a line or two before you go.
- Closed days show a small check in the day header and a subtle ring on the calendar
  heatmap cell.
- **Reopening is always allowed** — closing is a ritual marker, not a lock. Editing a
  closed day *keeps* the stamp (decided during the build): fixing a typo at 11pm should
  never cost you a streak. Reopen is an explicit button, never a side effect.
- New stat: current streak of closed days, alongside logged and goal streaks.

Scoring is untouched by this — `dayScore()` does not care whether a day is closed. The
flag is a ritual and a stat, nothing more.

## 4. Polish pass ✅

- Chart hover: crosshair + tooltip reading out the day, overall score, and any
  overlaid categories. The trends chart is currently entirely static.
- Heatmap cells are clickable but styled `cursor: default` — fix, plus a hover state.
- Toast slides and fades instead of appearing instantly.
- Mobile: the metric row wraps awkwardly under ~640px; the ring header stacks poorly.
- Focus-visible styling throughout — the app is keyboard-navigable but invisible about it.

---

## Order of work

1. ~~Journal (tab, list, search + filters, read/write view, prompts, stats)~~
2. ~~Segmented ring, sparkline, one-thing-left, quieter rows~~
3. ~~Close the day~~
4. ~~Polish pass~~

Each stage landed complete and usable on its own, with new smoke-test cases: 34 → 58 → 70
→ 81 → 90 → 112 → 118.

## Stage 5 — Tasks (built 2026-08-12)

Tab order became **Day · Tasks · Trends · Calendar · Journal · Settings**: the two tabs
touched daily first, the three for looking back next. "Today" became "Day" — it always
showed whichever day you had arrowed to, and once Tasks existed, "Today" no longer
distinguished anything.

Tasks live on the day they were written (`entries[key].tasks`) and are never moved.
Carry-over is computed at render time: an unfinished task shows on every later day until
it is ticked, wearing its age (`4d`). Nothing mutates at midnight, so there is no clock to
get wrong and no migration to run.

Deliberately unscored — `dayScore()` never sees them. They are one-off things rather than
habits, and a day with two tasks and a day with nine are not comparable. A progress ring
was built and then removed for the same reason: it rendered "1 of 5 done" as a red 20%,
which is exactly the judgement the feature exists to avoid.

**Fixed alongside it:** an entry object alone no longer counts as a logged day. Adding a
task or writing a note used to create one, which scored the day 0% and dragged the
averages down. `isLogged()` now requires at least one recorded value.

## Stage 6 — Day types (planned 2026-08-13)

Not every day is the same kind of day. A Saturday, a family event, a day of golf — the
current app scores all of them against one weekday definition and reports failure. The fix
is not a way to excuse days; it is a way to say what a day was *for*.

**A day type is a name, an icon, and which categories count.** Nothing else — no per-type
targets or weights to fill in. Targets and weights stay where they already are, on the
category. Because `dayScore()` is a weighted *average* of whatever is active, switching a
category off renormalises the rest automatically: turn off deep work on Saturday and the
remaining categories account for the whole day.

**Every day still scores.** No unscored day, no excused day, no way to pull a day out of
the averages — an averages column that silently drops days stops meaning anything. An
"Out with family" day is scored against the two or three things that were actually
available to you, and it can legitimately hit 100%. A type must therefore keep at least
one category active, or "all off" becomes a delete button through the back door.

**Streaks need no changes.** Every day scores, so `streak()` and the goal threshold keep
working untouched. This falls out of refusing the excused-day mechanism, which would have
required deciding whether a skipped day holds or extends a streak.

### Step 1 — Snapshot the scoring rules onto the day (no visible change) ✅

`entry.scoring` records the targets and weights in force when the day was logged:

```js
entry.scoring = { deepwork: { target: 4, weight: 3 }, sleep: { target: 8, weight: 2 } }
```

`dayScore()` reads that instead of live config, falling back to current behaviour when the
field is absent — so existing days and old JSON backups read exactly as they do now, and
there is still no migration step.

This is the fix for the archiving bug, and it had to land first: day types multiply the
ways history could silently rewrite itself.

Built 2026-08-13 as `scoringFor()` / `writeScoring()` / `ensureScoring()`. `dayScore()` and
`ringGeometry()` both read the snapshot, so the picture and the number can never disagree.
Two details worth remembering:

- **The day in progress is exempt.** `resnapshotToday()` re-freezes today whenever
  categories change, so adding a category at noon still counts today. Only today.
- **Deleted categories are skipped**, not scored as zero — `scoringFor()` drops ids it no
  longer recognises, since deleting already removes the values too.

### Step 2 — Day types, and the picker on the Day tab

```js
profile.dayTypes = [{ id, name, icon, color, weekdays: [0, 6], active: [metricId, …] }]
entry.type = 'sat'   // resolved and written when the day is first logged
```

A built-in **Standard** type holds the current defaults and cannot be deleted, so nothing
changes until it is asked to. On the Day tab, a type chip beside the date; the weekday
supplies the default and clicking picks another. Inactive categories drop out of the rows
and out of the ring, so the ring becomes a picture of *that* day's definition. Changing the
type rewrites that day's snapshot and no other.

### Step 3 — The editor in Settings

Create, rename, recolour, delete types; assign default weekdays; tick which categories
count. Checkboxes only — a type takes about fifteen seconds to make. Plus **save this day
as a type** on the Day tab, so a type can be built by switching things off until the day
looks right, without opening Settings at all.

Deleting a type leaves logged days untouched: they keep their snapshot and show the name
as written.

### Step 4 — Make it visible in the history

Calendar cells carry the type's colour. Trends splits averages by type — *weekdays 82 ·
Saturdays 71 · out-days 94* — which is the first thing the app can say that it structurally
could not before. Three lines of text, not more series on the chart, which already carries
range chips, a delta, per-category averages and legend overlays.

This is also the accountability mechanism. Off-days are never rationed or locked; they are
simply counted in the same view as the score, which is enough when you are the only
audience.

### Removed in the same stage: closing the day

Closing is the weakest feature in the app — it adds a concept, a button, a stamp, a
calendar treatment and two of the six streak stats, and what it buys over having logged the
day is thin. Automating it at midnight was considered and rejected: `closedAt` would come to
mean "this date is in the past", which the calendar already knows, and on a static page with
no background process it would really mean "retroactively stamp days on next open" — a
mutation on launch, the pattern tasks deliberately avoid.

Going: `isClosed()`, `closeHTML()`, the `data-close` / `data-reopen` handlers, the heatmap
ring, and the two closed-day streak stats — the Calendar drops from six numbers to four.
`closedAt` stays *readable* so old backups import untouched; it is simply never written or
shown again. The writing nudge it used to trigger is not lost: the rotating prompt already
renders above an empty note box on every visit to the Day tab.

The heatmap cell spends its one decoration slot on the closed-day ring. Stage 6 needs that
slot for day-type colour.

## Known, not yet fixed

- Days logged before stage 6 carry no snapshot and still fall back to live scoring, so
  archiving can retroactively move *those* days. Backfilling would mean inventing history,
  so they are left as they are.
- The Trends chart at the 1y range still plots months that predate the profile — the same
  complaint the calendar had before it started at `profileStart()`.

## Ideas not taken up

- Deep links (`?view=journal&date=…`) so a specific day can be bookmarked.
- Markdown, or any formatting, in journal entries — kept as plain text for now.
