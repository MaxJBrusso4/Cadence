# Cadence — build plan

**Status: six stages built and passing (155 smoke tests).** What follows is the plan they
were built from; it doubles as the record of what the app now does.

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
→ 81 → 90 → 112 → 118 → 132 → 146 → 155. Stage 6 removed nine tests with the closing feature and added nine of its own,
so the total holds at 146 while the coverage moved.

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

## Stage 6 — Day types (built 2026-08-13 → 16)

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

### Step 2 — Day types, and the picker on the Day tab ✅

```js
profile.dayTypes = [{ id, name, icon, color, weekdays: [0, 6], active: [metricId, …] }]
entry.type = 'sat'   // resolved and written when the day is first logged
```

A built-in **Standard** type holds the current defaults and cannot be deleted, so nothing
changes until it is asked to. On the Day tab, a type chip beside the date; the weekday
supplies the default and clicking picks another. Inactive categories drop out of the rows
and out of the ring, so the ring becomes a picture of *that* day's definition. Changing the
type rewrites that day's snapshot and no other.

Built 2026-08-13, with **save this day as a type** pulled forward from step 3 — without it
the picker would have held only Standard and there would have been nothing to try. Switch
categories off with the `×` on a row until the day looks right, then name it.

Two things learned in the build:

- **Deliberate drops are stored, not inferred.** `entry.off` lists what was switched off by
  hand. Inferring it by comparing the snapshot against the type looked cleaner and was
  wrong: a category added later reads as "missing on purpose", so new categories never
  reached the day in progress. With `off`, re-freezing is safe and `resnapshotToday()` goes
  back to one line.
- **Dropped categories stay on screen**, in a "not counted today" strip under the rows.
  Nothing should vanish silently — the point is to say what the day was for, out loud.

**Weekday defaults are not being built.** The field (`weekdays: []`) is stored and read, but
after using step 2 the manual pick was the right answer: choosing the kind of day *before*
it starts is a statement of intent, whereas a type that assigns itself leaves you adjusting
it afterwards — which is where cheating yourself lives. Decided 2026-08-14. The field stays
in the shape in case it is ever wanted; nothing sets it.

This shrinks step 3 to rename, recolour, re-tick and delete.

### Step 3 — The editor in Settings ✅

Rename, re-icon, recolour, re-tick and delete, in a **Kinds of day** card under Categories.
Tick boxes only — no targets, no weights, nothing to fill in. Creation still happens on the
Day tab via **save this day as a type**, which is the shorter path and was already built.

Built 2026-08-16. Three rules the editor enforces:

- **"All of them" is stored as `active: null`, not as a full list.** Tick every category and
  the field goes back to null, which is what makes a type keep picking up categories added
  later. Materialising the list would quietly freeze the type at today's categories.
- **A type can't be emptied** — un-ticking the last category is refused, the same guard the
  Day tab uses. Every day has to score against something.
- **Editing a type never touches logged days.** They hold their own snapshot; only
  `resnapshotToday()` re-freezes, and only today. Deleting a type is likewise safe: the days
  it scored keep their scores, and their chip falls back to Standard.

Day-type rows use `.trow`, not `.mrow` — the category tests count `.mrow` and would
otherwise have counted kinds of day as categories.

### Step 4 — Make it visible in the history ✅

Built 2026-08-16.

**Calendar.** Every logged day carries a corner dot in its kind-of-day colour — the slot the
closed-day ring used to hold. Standard days stay plain, so the tint means "this day was
something else" rather than decorating everything. The streak grid drops from six numbers to
four, current and longest for logged and goal days.

**Trends.** A *By kind of day* card — `weekdays 82 · Saturdays 71 · out-days 94`, with the
number of days each average rests on. Three lines of text rather than more series on a chart
that already carries range chips, a delta, per-category averages and legend overlays. It
only appears once there is more than one kind of day in the window.

Two corrections that came with it, both from the issues list:

- **Per-category averages now skip days the category wasn't counted on.** Otherwise every
  Saturday that doesn't count deep work would drag the deep-work average down as though it
  were a zero. Each row says how many days it covers, so a small sample is visible rather
  than implied.
- **Category streaks hold across days they weren't measured on.** `streak()` and
  `bestStreak()` understand a third answer, `'skip'`, which holds a run without extending
  it. A Saturday that doesn't count deep work no longer breaks a deep-work streak — you
  can't fail at something you weren't measured on.

### Step 5 — A category that belongs to one kind of day ✅

Built 2026-08-16, straight off first use: on a day out with a girlfriend, none of the
standard categories apply and the only honest thing to record is "have a good day". Ticking
existing categories couldn't express that, because every category applied to every day.

A category may now carry `forType`, and then it exists on that kind of day and nowhere else:

- **"Everything" excludes them.** A type with `active: null` counts every *general*
  category, never another type's own — otherwise "have a good day" would turn up on a
  Tuesday.
- **The not-counted strip is scoped too.** A category belonging to another kind of day
  isn't "not counted today", it doesn't exist here, so it isn't offered.
- **Deleting a type frees its categories** rather than orphaning them — they become
  ordinary ones, and the confirmation says so by name. Nothing is lost and nothing is left
  pointing at a type that has gone.

Added from inside the type's editor (**+ Something only this kind of day counts**), which is
also where it reads best: the thing that only matters here is defined here. Settings badges
it `only on Girlfriend day` so it is never a mystery in the category list.

### Removed in the same stage: closing the day

Closing is the weakest feature in the app — it adds a concept, a button, a stamp, a
calendar treatment and two of the six streak stats, and what it buys over having logged the
day is thin. Automating it at midnight was considered and rejected: `closedAt` would come to
mean "this date is in the past", which the calendar already knows, and on a static page with
no background process it would really mean "retroactively stamp days on next open" — a
mutation on launch, the pattern tasks deliberately avoid.

Done 2026-08-16. Gone: `isClosed()`, `closeHTML()`, the `data-close` / `data-reopen`
handlers, the heatmap ring, the settle/lightup animations, and the two closed-day streak
stats. `closedAt` stays *readable* so old backups import untouched; it is simply never
written or shown again. The writing nudge it used to trigger is not lost: the rotating
prompt already renders above an empty note box on every visit to the Day tab.

The heatmap cell spent its one decoration slot on the closed-day ring. Step 4 needed that
slot for day-type colour, and now has it.

## Known, not yet fixed

- Days logged before stage 6 carry no snapshot and still fall back to live scoring, so
  archiving can retroactively move *those* days. Backfilling would mean inventing history,
  so they are left as they are.
- The Trends chart at the 1y range still plots months that predate the profile — the same
  complaint the calendar had before it started at `profileStart()`.
- Archiving every category a type counts leaves that type with nothing, and it quietly
  falls back to counting all of them. Rare, and better than scoring nothing, but it happens
  without saying so.
- Averages mix kinds of day: a 94% out-day and an 82% weekday sit in the same 30-day
  average, and light days are easier to clear the goal threshold with. The *By kind of day*
  card is the honest counterweight rather than a fix. Deliberate — weighting days by type
  gets complicated fast — but worth revisiting after a few months of real use.

## Ideas not taken up

- Deep links (`?view=journal&date=…`) so a specific day can be bookmarked.
- Markdown, or any formatting, in journal entries — kept as plain text for now.
