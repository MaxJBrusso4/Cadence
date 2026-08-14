# Cadence — daily efficiency tracker

A single-page web app for tracking how efficient your days are, against the categories
*you* decide matter. No build step, no server, no accounts — open `index.html` and it runs.

## Running it

Double-click `index.html` (or drag it into a browser). That's it.

Data is saved in the browser's `localStorage` under the key `cadence.v1`, which means:

- it never leaves the machine, and works offline;
- each browser/device holds its own copy — use **Settings → Export JSON** to move it.

To serve it over HTTP instead (e.g. to open it from a phone on the same network):

```
python3 -m http.server 8000
```

## How it works

**Profiles.** Everyone on the same browser gets their own profile — own categories, own
history, own definition of a good day. Switch or add via the avatar menu, top right.

**Categories** are whatever makes your day. Each one picks a type:

| Type | Scores 100% when | Example |
|---|---|---|
| Yes / No | you did it | Exercise, meditate, no alcohol |
| Number vs goal | you hit the target (or stay under a cap) | 8 h sleep, 4 h deep work, ≤3 h screen time |
| Rating 1–10 | you rate it 10 | Energy, mood, focus |

Each also has a **weight** (×0.5 to ×5), so deep work can count double against reading.

**The daily score** is the weighted average of every category's 0–100% score. A day only
counts as logged once you record at least one value — writing a journal entry or jotting
down a task does not score the day. An unlogged day shows `—` and is skipped in averages.
Once you *have* recorded something, blank numeric fields count as zero — you didn't do it.

For "at most" targets (screen time, spending), you score 100% up to the cap and slide
linearly to 0% at double it.

**Streaks** come in three flavours: days logged in a row, days at or above your "good day"
threshold in a row (set it in Settings), and days *closed* in a row. Categories track their
own streaks of consecutive 100% days.

**Closing a day** is the end-of-day ritual: press **Close the day** on the Day tab and the score
is stamped, the ring gives one pulse, and if you haven't written anything the caret lands
in the journal box. It is a marker and a stat, never a lock — scoring ignores it entirely,
a closed day stays fully editable, and you can reopen any day at any time.

## The views

Left to right: the two tabs you touch daily, then the three for looking back, then settings.

- **Day** — enter the day and watch it score live. A Saturday isn't a Monday, so every day
  has a **type**: a name and which categories count. Pick one from the chips by the date,
  or drop a single category with the `×` on its row when the day just went differently —
  what isn't counted sits below the rows, labelled, rather than vanishing. Once a day looks
  right, **+ Save as type** turns it into a kind of day you can pick again. Types never
  excuse a day: a day always scores against *something*, so the averages stay honest. The ring is segmented: each category
  owns a slice sized by its weight and filled to its own score, so you can see *which*
  categories carried the day, not just the total. Hovering a slice lights up its row and
  vice versa. Under it, a 14-day sparkline for context and a nudge naming the single
  unfinished category that would move the score most. `←` / `→` move between days.
- **Tasks** — what has to get done, written the night before or that morning. Type and
  press Enter, tick it off when it's done. **Anything you don't tick follows you to the
  next day**, wearing the age it has earned (`4d`) so you can see what's going stale.
  Tasks are deliberately kept *out* of the score: they're one-off things, not habits, and
  counting them would make the daily percentage mean less rather than more.
- **Trends** — 7/30/90/365-day efficiency line, first-half vs second-half delta, per-category
  averages. Click a legend name to overlay that category on the chart. Hovering the chart
  brings up a crosshair and reads out that day, including any overlaid categories.
- **Calendar** — a heatmap that begins the day the profile did and grows forward from
  there, so it never offers you days that predate the app (it stops widening at 12
  months). Click any day to open it. Plus six streak stats: current and longest for days
  logged, days above your threshold, and days closed. Closed days carry a faint ring.
- **Journal** — one entry per day, the same text the Day view writes. Search everything
  you've written, filter by the kind of day it was (great / middling / rough / unscored),
  star the ones worth keeping. Write for any date, whenever you like — pick it with
  **Any day**, or arrow between days with `←` / `→`. `Esc` returns to the list. That day's
  tasks show beside the entry.
- **Settings** — add, edit, reorder, archive, or delete categories; profile name, avatar, and goal threshold; JSON backup, CSV export, JSON import.

Archiving a category hides it from daily entry and scoring but keeps its history.
Deleting removes its values from every day, permanently.

## Files

| File | |
|---|---|
| `index.html` | page shell |
| `styles.css` | all styling, light + dark |
| `app.js` | state, scoring, rendering, import/export |
| `smoke-test.html` | 132 interaction tests — open it in a browser and read the list at the bottom |
| `PLAN.md` | what's built and what's next |

`app.js` is plain ES5-compatible-ish JavaScript in one IIFE, no dependencies. The scoring
rules live in `metricScore()` / `dayScore()` if you want to change how a day is graded.
