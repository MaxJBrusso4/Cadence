/* Cadence — daily efficiency tracker
   No build step, no server. All data lives in this browser's localStorage. */
(function () {
'use strict';

/* ============================ constants ============================ */

const KEY = 'cadence.v1';
const PALETTE = ['#4f7cff', '#12b886', '#f2994a', '#eb5757', '#9b51e0', '#2d9cdb', '#e5b800', '#e0559b'];
const AVATARS = ['🙂', '🚀', '🌱', '🐙', '🎧', '🏔️', '🦊', '☕', '🌙', '⚡'];

const TYPES = {
  bool:   { label: 'Yes / No',      hint: 'Did it or not' },
  target: { label: 'Number vs goal', hint: 'e.g. 8 hours of sleep' },
  scale:  { label: 'Rating 1–10',    hint: 'How did it feel' }
};

/* ============================ state ============================ */
/* Initialised in boot(), at the bottom — the helpers below are const-bound
   and would be in the temporal dead zone if we called load() up here. */

let db;
let ui;

/* ============================ storage ============================ */

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.profiles && Object.keys(parsed.profiles).length) return parsed;
    }
  } catch (e) { console.warn('Could not read saved data', e); }
  return seed();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save — storage may be full'); }
}

function seed() {
  const p = newProfile('You', '🙂', true);
  return { version: 1, theme: 'auto', activeProfileId: p.id, profiles: { [p.id]: p } };
}

function newProfile(name, avatar, withDefaults) {
  const p = { id: uid(), name, avatar, goal: 75, metrics: [], entries: {}, createdAt: todayKey() };
  if (withDefaults) {
    p.metrics = [
      mk('Sleep',      '😴', 'target', { target: 8,  unit: 'h',     color: PALETTE[5] }),
      mk('Deep work',  '🎯', 'target', { target: 4,  unit: 'h',     color: PALETTE[0] }),
      mk('Exercise',   '🏃', 'bool',   { color: PALETTE[1] }),
      mk('Reading',    '📖', 'target', { target: 30, unit: 'min',   color: PALETTE[2] }),
      mk('Energy',     '⚡', 'scale',  { color: PALETTE[6] })
    ];
  }
  return p;
}

function mk(name, icon, type, extra) {
  return Object.assign({
    id: uid(), name, icon, type,
    target: 1, unit: '', goal: 'atLeast', weight: 1,
    color: PALETTE[0], archived: false
  }, extra || {});
}

/* ============================ helpers ============================ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseKey(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function todayKey() { return dateKey(new Date()); }
function shiftKey(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
function prettyDate(k) {
  const d = parseKey(k), t = todayKey();
  if (k === t) return 'Today';
  if (k === shiftKey(t, -1)) return 'Yesterday';
  if (k === shiftKey(t, 1)) return 'Tomorrow';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

function profile() { return db.profiles[db.activeProfileId]; }

/* The day this profile started existing. Profiles made before `createdAt` was stored
   fall back to their earliest entry — you cannot have logged a day before your first
   one — and a brand-new profile with no history starts today. */
function profileStart() {
  const p = profile();
  const keys = Object.keys(p.entries).sort();
  const earliest = keys.length ? keys[0] : null;
  // Whichever came first: backfilling a day before you started still has to be visible.
  if (p.createdAt && earliest) return p.createdAt < earliest ? p.createdAt : earliest;
  return p.createdAt || earliest || todayKey();
}
function metrics() { return profile().metrics.filter(m => !m.archived); }
function entry(k) { return profile().entries[k]; }
function ensureEntry(k) {
  const p = profile();
  if (!p.entries[k]) p.entries[k] = { values: {}, note: '' };
  return p.entries[k];
}
/* Closing a day is a ritual and a stat, nothing more — dayScore() does not care.
   Reopening is always allowed, and editing a closed day leaves the stamp alone so
   fixing a typo never costs you a streak. */
function isClosed(k) { const e = entry(k); return !!(e && e.closedAt); }

function scoreColor(s) {
  if (s == null) return 'var(--faint)';
  if (s >= 80) return 'var(--good)';
  if (s >= 55) return 'var(--warn)';
  return 'var(--bad)';
}

/* ============================ scoring ============================ */

/* Score for one metric on one day, 0–100, or null when the day was never logged. */
function metricScore(m, raw) {
  if (m.type === 'bool') return raw ? 100 : 0;
  const v = Number(raw);
  if (raw === undefined || raw === null || raw === '' || isNaN(v)) return 0;
  if (m.type === 'scale') return clamp((v / 10) * 100, 0, 100);
  const t = Number(m.target) || 0;
  if (m.goal === 'atMost') {
    if (t <= 0) return v <= 0 ? 100 : 0;
    if (v <= t) return 100;
    return clamp(100 - ((v - t) / t) * 100, 0, 100);   // hits 0 at double the cap
  }
  if (t <= 0) return v > 0 ? 100 : 0;
  return clamp((v / t) * 100, 0, 100);
}

/* Has this day actually been tracked? An entry object alone is not enough — writing a
   note or jotting a task creates one, and neither of those means you logged the day.
   Without this, opening a day to type a line scored it 0% and dragged the averages down. */
function isLogged(k) {
  const e = entry(k);
  if (!e || !e.values) return false;
  return Object.keys(e.values).some(id => {
    const v = e.values[id];
    return v !== undefined && v !== null && v !== '';
  });
}

/* ---- day types ----
   Not every day is the same kind of day. A type is a name, an icon, and which categories
   count — nothing else. Targets and weights stay on the category, and because dayScore()
   averages whatever is active, switching a category off renormalises the rest. Every day
   still scores: a type must keep at least one category, or "all off" becomes a way to
   delete a day from the averages. */

const STANDARD = { id: 'standard', name: 'Standard', icon: '◎', weekdays: [], active: null };

/* `active: null` means "every category that isn't archived". Read with a default so old
   profiles and old backups grow the field without a migration. */
function dayTypes() {
  const p = profile();
  if (!p.dayTypes || !p.dayTypes.length) p.dayTypes = [Object.assign({}, STANDARD)];
  return p.dayTypes;
}
function typeById(id) { return dayTypes().find(t => t.id === id) || null; }

/* What kind of day this is: what it was logged as, else whatever the weekday defaults to. */
function typeFor(k) {
  const e = entry(k);
  const named = e && e.type ? typeById(e.type) : null;
  if (named) return named;
  const wd = parseKey(k).getDay();
  return dayTypes().find(t => (t.weekdays || []).indexOf(wd) >= 0) || dayTypes()[0];
}

/* The categories a type counts, in the profile's own order. */
function activeFor(k) {
  const t = typeFor(k), e = entry(k);
  const off = (e && e.off) || [];
  const byType = (!t || !t.active) ? metrics() : metrics().filter(m => t.active.indexOf(m.id) >= 0);
  const kept = byType.filter(m => off.indexOf(m.id) < 0);
  return kept.length ? kept : byType;
}

/* What the day is actually scored on right now: its frozen snapshot once logged, its
   type's list before that. The snapshot is the source of truth, so a category switched
   off for one day stays off for that day alone. */
function dayActive(k) {
  const e = entry(k);
  if (e && e.scoring) {
    const ids = Object.keys(e.scoring);
    return metrics().filter(m => ids.indexOf(m.id) >= 0);
  }
  return activeFor(k);
}

/* Switching a category off for a single day. Recorded as a list of what was deliberately
   dropped rather than by rewriting the snapshot, so the two cases stay distinguishable: a
   category added later still joins the day, one switched off on purpose stays off.
   Never down to zero — every day has to score. */
function setMetricOnDay(k, id, on) {
  const e = ensureEntry(k);
  const off = e.off || (e.off = []);
  const at = off.indexOf(id);
  if (on) { if (at >= 0) off.splice(at, 1); }
  else {
    if (at >= 0) return true;
    if (activeFor(k).length <= 1) return false;
    off.push(id);
  }
  writeScoring(k);
  return true;
}

/* Choosing a type rewrites that day's snapshot from the type, and no other day's. */
function setDayType(k, id) {
  const e = ensureEntry(k);
  e.type = id;
  e.off = [];            // picking a type is a fresh statement about the day
  writeScoring(k);
}

/* The rules a day was scored by: which categories counted, with the targets and weights
   they had at the time. Frozen onto the entry when the day is first logged, so a change
   made in October cannot rescore August — archiving a category used to do exactly that.
   Days written before snapshots existed have no record and fall back to the live config,
   which is the old behaviour, kept so old JSON backups read as they always did. */
function scoringFor(k) {
  const e = entry(k);
  const snap = e && e.scoring;
  if (!snap) return activeFor(k).map(m => ({ m, weight: Number(m.weight) || 1 }));
  const all = profile().metrics, out = [];
  Object.keys(snap).forEach(id => {
    const m = all.find(x => x.id === id);
    if (!m) return;                    // deleted since — its values are gone too
    const s = snap[id] || {};
    const target = s.target === undefined ? m.target : s.target;
    out.push({
      m: target === m.target ? m : Object.assign({}, m, { target }),
      weight: Number(s.weight) || 1
    });
  });
  return out;
}

/* Freeze the current rules onto a day: the categories its type counts, at today's
   targets and weights. */
function writeScoring(k) {
  const e = entry(k);
  if (!e) return;
  const snap = {};
  activeFor(k).forEach(m => { snap[m.id] = { target: m.target, weight: Number(m.weight) || 1 }; });
  if (!Object.keys(snap).length) metrics().forEach(m => { snap[m.id] = { target: m.target, weight: Number(m.weight) || 1 }; });
  e.scoring = snap;
  if (!e.type) e.type = typeFor(k).id;
}

/* The first value recorded fixes the day's rules. */
function ensureScoring(k) { const e = entry(k); if (e && !e.scoring) writeScoring(k); }

/* Editing categories should still reach the day in progress — but only that day. Anything
   switched off by hand lives in `entry.off`, so re-freezing here can't undo it. */
function resnapshotToday() { const k = todayKey(); if (entry(k) && isLogged(k)) writeScoring(k); }

/* Weighted day score, or null if nothing was logged that day. */
function dayScore(k) {
  const e = entry(k);
  if (!isLogged(k)) return null;
  const rules = scoringFor(k);
  if (!rules.length) return null;
  let sum = 0, w = 0;
  rules.forEach(({ m, weight }) => {
    sum += metricScore(m, e.values[m.id]) * weight;
    w += weight;
  });
  return w ? Math.round(sum / w) : null;
}

function lastNDays(n, endKey) {
  const out = [];
  let k = endKey || todayKey();
  for (let i = n - 1; i >= 0; i--) out.push(shiftKey(k, -i));
  return out;
}

/* Consecutive days (ending today or yesterday) where `pass(key)` is true. */
function streak(pass) {
  let k = todayKey(), n = 0;
  if (!pass(k)) { k = shiftKey(k, -1); if (!pass(k)) return 0; }
  while (pass(k)) { n++; k = shiftKey(k, -1); }
  return n;
}
function metricStreak(m) {
  return streak(k => {
    const e = entry(k);
    if (!e) return false;
    return metricScore(m, e.values[m.id]) >= 100;
  });
}
function bestStreak(pass) {
  const keys = Object.keys(profile().entries).sort();
  if (!keys.length) return 0;
  let best = 0, run = 0, prev = null;
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = shiftKey(k, 1)) {
    if (pass(k)) { run = (prev && shiftKey(prev, 1) === k) ? run + 1 : 1; prev = k; best = Math.max(best, run); }
    else { run = 0; prev = null; }
  }
  return best;
}

/* ============================ render root ============================ */

function render() {
  const p = profile();
  $('#profileName').textContent = p.name;
  $('#profileAvatar').textContent = p.avatar;
  $$('#tabs .tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === ui.view));
  const el = $('#view');
  el.innerHTML = ({
    today: viewToday, tasks: viewTasks, trends: viewTrends,
    calendar: viewCalendar, journal: viewJournal, settings: viewSettings
  })[ui.view]();
}

/* ============================ view: today ============================ */

function viewToday() {
  const ms = metrics();
  const k = ui.date;
  const e = entry(k);
  const p = profile();

  if (!ms.length) {
    return `<div class="card"><div class="empty">
      Nothing tracked yet — decide what makes a good day for you.<br><br>
      <button class="btn primary" data-go="settings">Add your first category</button>
    </div></div>`;
  }

  const on = dayActive(k);
  const off = ms.filter(m => on.indexOf(m) < 0);

  const rows = on.map(m => {
    const v = e ? e.values[m.id] : undefined;
    const sc = e ? metricScore(m, v) : null;
    const st = metricStreak(m);
    let control;
    if (m.type === 'bool') {
      control = `<button class="toggle" role="switch" aria-pressed="${v ? 'true' : 'false'}" data-set="${m.id}" data-kind="bool" aria-label="${esc(m.name)}"></button>`;
    } else if (m.type === 'scale') {
      control = `<div class="scale">` + Array.from({ length: 10 }, (_, i) =>
        `<button data-set="${m.id}" data-kind="scale" data-val="${i + 1}" class="${Number(v) === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('') + `</div>`;
    } else {
      control = `<input class="input" type="number" step="any" min="0" inputmode="decimal"
        placeholder="0" value="${v === undefined || v === null ? '' : esc(v)}" data-set="${m.id}" data-kind="num">
        <span class="sub" style="width:34px">${esc(m.unit)}</span>`;
    }
    const goalTxt = m.type === 'target'
      ? `${m.goal === 'atMost' ? 'at most' : 'goal'} ${m.target}${m.unit ? ' ' + m.unit : ''}`
      : (m.type === 'scale' ? 'rate 1–10' : 'daily habit');
    return `<div class="metric" data-row="${m.id}">
      <div class="m-icon" style="color:${m.color}">${esc(m.icon || '•')}</div>
      <div class="m-main">
        <div class="m-name">${esc(m.name)} ${st > 1 ? `<span class="streak">🔥 ${st}</span>` : ''}</div>
        <div class="m-sub">${goalTxt}${Number(m.weight) !== 1 ? ` · weight ×${m.weight}` : ''}</div>
        <div class="bar"><i style="width:${sc == null ? 0 : sc}%;background:${m.color}"></i></div>
      </div>
      <div class="m-input">${control}</div>
      <div class="m-score">${sc == null ? '—' : Math.round(sc) + '%'}</div>
      <button class="m-off" data-dropm="${m.id}" title="Doesn't count today" aria-label="Leave ${esc(m.name)} out of today">×</button>
    </div>`;
  }).join('');

  /* Categories this kind of day doesn't count. Visible, so nothing disappears silently. */
  const offStrip = off.length ? `<div class="offstrip">
    <span class="sub">Not counted today</span>
    ${off.map(m => `<button class="tchip ghost" data-addm="${m.id}" title="Count ${esc(m.name)} today">
      <span style="color:${m.color}">${esc(m.icon || '•')}</span> ${esc(m.name)} +</button>`).join('')}
  </div>` : '';

  const logged = streak(isLogged);
  const goodRun = streak(d => (dayScore(d) ?? -1) >= p.goal);

  /* What kind of day this is. A Saturday and a Monday are not the same day, and the score
     should be measured against what the day was actually for. */
  const cur = typeFor(k);
  const adjusted = !!(e && e.off && e.off.length);
  const typeRow = `<div class="types">
    ${dayTypes().map(t => `<button class="tchip ${t.id === cur.id ? 'on' : ''}" data-settype="${t.id}"
      ><span style="color:${t.color || 'inherit'}">${esc(t.icon || '◎')}</span> ${esc(t.name)}</button>`).join('')}
    <button class="tchip ghost" data-savetype="1"
      title="Save the categories showing today as a new kind of day">+ Save as type</button>
    ${adjusted ? '<span class="sub">adjusted for this day</span>' : ''}
  </div>`;

  return `
  <div class="card">
    <div class="day-head">
      ${ring(k)}
      <div class="day-meta">
        <h1>${prettyDate(k)}</h1>
        <div class="sub">${parseKey(k).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div class="day-nav">
          <button class="btn sm" data-day="-1">←</button>
          <button class="btn sm" data-day="+1" ${k >= todayKey() ? 'disabled' : ''}>→</button>
          ${k !== todayKey() ? `<button class="btn sm ghost" data-day="today">Jump to today</button>` : ''}
          ${closeHTML(k)}
        </div>
        ${typeRow}
        ${nudgeHTML(k)}
      </div>
      <div class="spacer"></div>
      <div class="day-side">
        ${sparkline(k)}
        <div class="row">
          <span class="pill ${logged ? 'good' : ''}">🔥 ${logged}d logged</span>
          <span class="pill">${goodRun}d above ${p.goal}%</span>
          ${openTaskCount(k) ? `<button class="pill tasks-pill" data-gotasks="1">☑ ${openTaskCount(k)} to do</button>` : ''}
        </div>
      </div>
    </div>
    ${rows}
    ${offStrip}
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Journal</h2>
      <div class="row">
        <span class="sub">saved automatically</span>
        <button class="btn sm ghost" data-jopen="${k}">Open in journal →</button>
      </div>
    </div>
    <div class="card-body">
      ${(e && e.note || '').trim() ? '' : `<div class="jprompt">${esc(promptFor(k))}</div>`}
      <textarea class="input" id="note" placeholder="What shaped the day? Anything worth remembering…">${esc(e ? e.note : '')}</textarea>
    </div>
  </div>`;
}

/* The ring is one arc per category, not one arc for the day: each category owns a
   slice sized by its weight, filled to its own score in its own color. The total is
   still in the middle — but now you can see which categories carried the day. */

const RING_R = 46, RING_C = 2 * Math.PI * RING_R;

/* Where each category's slice sits on the circle. Shared by the renderer and the
   live-update path so the two can never drift apart. */
function ringGeometry(k) {
  // The same rules dayScore() used, so the picture can never disagree with the number.
  const rules = scoringFor(k), e = entry(k);
  const totalW = rules.reduce((n, r) => n + r.weight, 0);
  if (!rules.length || !totalW) return [];
  // Gap between slices, shrinking as categories multiply so it never eats the arc.
  const gap = rules.length > 1 ? Math.min(7, RING_C / (rules.length * 7)) : 0;
  let at = 0;
  return rules.map(({ m, weight }) => {
    const len = (weight / totalW) * RING_C;
    const seg = { m, at, span: Math.max(1, len - gap), score: e ? metricScore(m, e.values[m.id]) : 0 };
    at += len;
    return seg;
  });
}

const dashes = (drawn) => `${Math.max(0, drawn)} ${RING_C}`;

function ring(k) {
  const s = dayScore(k);
  const segs = ringGeometry(k);

  const arcs = segs.length ? segs.map(g => `
    <circle class="seg-track" cx="54" cy="54" r="${RING_R}" fill="none" stroke-width="9"
      stroke-dasharray="${dashes(g.span)}" stroke-dashoffset="${-g.at}"/>
    <circle class="seg-fill" data-seg="${g.m.id}" cx="54" cy="54" r="${RING_R}" fill="none" stroke="${g.m.color}"
      stroke-width="9" stroke-dasharray="${dashes(g.span * g.score / 100)}" stroke-dashoffset="${-g.at}">
      <title>${esc(g.m.name)} — ${Math.round(g.score)}%</title>
    </circle>`).join('')
    : `<circle class="seg-track" cx="54" cy="54" r="${RING_R}" fill="none" stroke-width="9"
         stroke-dasharray="${dashes(RING_C)}"/>`;

  return `<div class="ring">
    <svg width="108" height="108" viewBox="0 0 108 108">${arcs}</svg>
    <div class="ring-label"><div>
      <b id="ringVal" style="color:${scoreColor(s)}">${s == null ? '—' : s + '%'}</b><span>efficiency</span>
    </div></div>
  </div>`;
}

/* A day never used to end — you just stopped typing. This gives it a finish line. */
function closeHTML(k) {
  if (!isClosed(k)) return `<button class="btn primary sm" data-close="${k}">Close the day</button>`;
  const at = new Date(entry(k).closedAt);
  const time = isNaN(at) ? '' : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `<span class="pill closed" title="Closed${time ? ' at ' + time : ''}">✓ Closed</span>
    <button class="btn sm ghost" data-reopen="${k}">Reopen</button>`;
}

function nudgeHTML(k) {
  const n = nextBest(k);
  if (!n) return `<div id="nudge" class="nudge done">Every category at 100% — that's the whole day.</div>`;
  return `<button id="nudge" class="nudge" data-focus="${n.m.id}">
    <span class="dot" style="background:${n.m.color}"></span>
    Biggest win left: <b>${esc(n.m.name)}</b> <span class="sub">+${Math.round(n.gain)} pts</span>
  </button>`;
}

/* A fortnight of context under the ring, so today doesn't read in isolation. */
function sparkline(k) {
  const days = lastNDays(14, k);
  const vals = days.map(dayScore);
  const logged = vals.filter(v => v != null);
  if (logged.length < 2) return `<div class="spark-empty sub">a few more days and a trend shows up here</div>`;

  const W = 168, H = 42, P = 4;
  const goal = profile().goal;
  // Scale to the data, not to 0–100 — a fortnight spent between 79 and 95 is a shape,
  // and on a fixed axis it flattens into a straight line that says nothing.
  let lo = Math.min.apply(null, logged), hi = Math.max.apply(null, logged);
  if (goal >= lo - 12 && goal <= hi + 12) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  const mid = (lo + hi) / 2, span = Math.max(hi - lo, 18);
  lo = Math.max(0, mid - span / 2); hi = Math.min(100, mid + span / 2);

  const x = i => P + (i / (days.length - 1)) * (W - P * 2);
  const y = v => H - P - ((v - lo) / (hi - lo || 1)) * (H - P * 2);
  const pts = vals.map((s, i) => s == null ? null : [x(i), y(s)]);
  const last = pts[pts.length - 1];

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Efficiency over the last 14 days, ${Math.round(lo)} to ${Math.round(hi)} percent">
    ${goal >= lo && goal <= hi ? `<line x1="${P}" x2="${W - P}" y1="${y(goal)}" y2="${y(goal)}"
      stroke="var(--good)" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>` : ''}
    ${path(pts, 'var(--accent)', 1.8, .85)}
    ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="var(--accent)"/>` : ''}
  </svg>
  <div class="spark-cap sub">last 14 days · ${Math.round(lo)}–${Math.round(hi)}%</div>`;
}

/* The single unfinished category that would move the day's score most. */
function nextBest(k) {
  const e = entry(k), ms = dayActive(k);   // only what this kind of day counts
  const totalW = ms.reduce((n, m) => n + (Number(m.weight) || 1), 0);
  if (!ms.length || !totalW) return null;
  let best = null;
  ms.forEach(m => {
    const sc = e ? metricScore(m, e.values[m.id]) : 0;
    const gain = ((100 - sc) * (Number(m.weight) || 1)) / totalW;
    if (gain >= 1 && (!best || gain > best.gain)) best = { m, gain };
  });
  return best;
}

/* Update the ring and each row's score/bar without rebuilding the DOM. */
function refreshScores() {
  const e = entry(ui.date);
  dayActive(ui.date).forEach(m => {
    const row = $(`.metric[data-row="${m.id}"]`);
    if (!row) return;
    const sc = e ? metricScore(m, e.values[m.id]) : null;
    $('.m-score', row).textContent = sc == null ? '—' : Math.round(sc) + '%';
    $('.bar > i', row).style.width = (sc == null ? 0 : sc) + '%';
  });

  ringGeometry(ui.date).forEach(g => {
    const fill = $(`.seg-fill[data-seg="${g.m.id}"]`);
    if (!fill) return;
    fill.setAttribute('stroke-dasharray', dashes(g.span * g.score / 100));
    const t = $('title', fill);
    if (t) t.textContent = `${g.m.name} — ${Math.round(g.score)}%`;
  });

  const s = dayScore(ui.date), val = $('#ringVal');
  if (val) {
    val.textContent = s == null ? '—' : s + '%';
    val.style.color = scoreColor(s);
  }
  const nudge = $('#nudge');
  if (nudge) nudge.outerHTML = nudgeHTML(ui.date);
}

/* ============================ tasks ============================ */

/* Tasks live on the day they were written — `entries[key].tasks` — and are never moved.
   Carry-over is worked out at render time instead: an unfinished task keeps showing up
   on every later day until it is ticked, wearing the age it has earned. Nothing mutates
   at midnight, so there is no clock to get wrong and no data to migrate. */

function tasksOn(k) {
  const p = profile(), out = [];
  Object.keys(p.entries).forEach(day => {
    if (day > k) return;                                  // not written yet, as of k
    (p.entries[day].tasks || []).forEach(t => {
      // Show it if it is still open, or if this is the day it was ticked off.
      if (!t.done || t.doneAt === k) out.push({ t, day });
    });
  });
  // Open tasks first, oldest at the top so what's rotting is what you see.
  return out.sort((a, b) => (a.t.done - b.t.done) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function openTaskCount(k) { return tasksOn(k).filter(x => !x.t.done).length; }

function daysBetween(from, to) {
  return Math.round((parseKey(to) - parseKey(from)) / 86400000);
}

function findTask(id) {
  const p = profile();
  const days = Object.keys(p.entries);
  for (let i = 0; i < days.length; i++) {
    const list = p.entries[days[i]].tasks || [];
    const t = list.find(x => x.id === id);
    if (t) return { t, list, day: days[i] };
  }
  return null;
}

function addTask(k, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  const e = ensureEntry(k);
  if (!e.tasks) e.tasks = [];
  e.tasks.push({ id: uid(), text: trimmed, done: false, doneAt: null });
  save();
  return true;
}

/* ============================ view: tasks ============================ */

function viewTasks() {
  const k = ui.date;
  const rows = tasksOn(k);
  const open = rows.filter(x => !x.t.done).length;
  const done = rows.length - open;

  const list = rows.map(({ t, day }) => {
    const age = daysBetween(day, k);
    return `<div class="task ${t.done ? 'is-done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" role="checkbox" aria-checked="${t.done}"
        data-task="${t.id}" aria-label="${esc(t.text)}"></button>
      <span class="task-text">${esc(t.text)}</span>
      ${age > 0 && !t.done ? `<span class="task-age" title="Written ${age} day${age === 1 ? '' : 's'} ago">${age}d</span>` : ''}
      <span class="spacer"></span>
      <button class="btn sm ghost task-del" data-taskdel="${t.id}" title="Delete">×</button>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <div class="day-head tasks-head">
      <div class="day-meta">
        <h1>${prettyDate(k)}</h1>
        <div class="sub">${open ? `${open} to do` : rows.length ? 'all done' : 'nothing written down yet'}${done ? ` · ${done} done` : ''}</div>
        <div class="day-nav">
          <button class="btn sm" data-day="-1">←</button>
          <button class="btn sm" data-day="+1" ${k >= todayKey() ? 'disabled' : ''}>→</button>
          ${k !== todayKey() ? `<button class="btn sm ghost" data-day="today">Jump to today</button>` : ''}
        </div>
      </div>
      <div class="spacer"></div>
      ${rows.length ? `<div class="task-count"><b>${done}</b><span>of ${rows.length} done</span></div>` : ''}
    </div>

    <div class="task-add">
      <input class="input" id="taskInput" placeholder="What has to happen ${k === todayKey() ? 'today' : 'that day'}? Press Enter"
        autocomplete="off">
      <button class="btn primary sm" data-taskadd="1">Add</button>
    </div>

    ${list || `<div class="empty">
      Nothing here yet. Write down what has to get done — tonight, for tomorrow, whenever.<br>
      <span class="sub">Anything you don't tick follows you to the next day.</span>
    </div>`}
  </div>`;
}

/* ============================ view: journal ============================ */

/* The journal is not a separate store — `entry.note` IS the journal entry, one per
   day, the same text the Today view writes. This view is a lens on it: browse, search,
   filter by the kind of day it was, and write for any date whenever you please. */

const PROMPTS = [
  'What made today work?',
  'What did you avoid, and why?',
  'What would you do differently tomorrow?',
  'What took more out of you than it should have?',
  'What are you carrying into tomorrow?',
  'Who did you spend time with, and was it worth it?',
  'What went better than expected?',
  'What did you learn — about anything, however small?',
  'Where did the time actually go?',
  'What are you glad you did?',
  'What is worth remembering about today?',
  'What is the one thing nagging at you?'
];

/* Chosen from the date, so the prompt holds still while you look at it. */
function promptFor(k) {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PROMPTS[h % PROMPTS.length];
}

const BANDS = {
  all:      { label: 'All',           test: () => true },
  great:    { label: 'Great 80+',     test: s => s != null && s >= 80 },
  middling: { label: 'Middling',      test: s => s != null && s >= 55 && s < 80 },
  rough:    { label: 'Rough',         test: s => s != null && s < 55 },
  unscored: { label: 'Unscored',      test: s => s == null }
};

function noteOf(k) { const e = entry(k); return (e && e.note) || ''; }
function isStarred(k) { const e = entry(k); return !!(e && e.starred); }
function wordCount(s) { const t = String(s || '').trim(); return t ? t.split(/\s+/).length : 0; }

/* Every day that has been written on, newest first. */
function writtenDays() {
  return Object.keys(profile().entries).filter(k => noteOf(k).trim()).sort().reverse();
}

function journalMatches() {
  const q = ui.journalQuery.trim().toLowerCase();
  const band = BANDS[ui.journalBand] || BANDS.all;
  return writtenDays().filter(k => {
    if (ui.journalStarred && !isStarred(k)) return false;
    if (!band.test(dayScore(k))) return false;
    return !q || noteOf(k).toLowerCase().includes(q);
  });
}

/* A small score donut — swapped for the segmented ring in stage 2. */
function miniRing(s) {
  const r = 13, c = 2 * Math.PI * r;
  return `<svg class="mini-ring" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
    <circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="4"/>
    <circle cx="17" cy="17" r="${r}" fill="none" stroke="${scoreColor(s)}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - (s == null ? 0 : s) / 100)}"/>
    <text x="17" y="17" class="mini-ring-txt" text-anchor="middle" dominant-baseline="central">${s == null ? '–' : s}</text>
  </svg>`;
}

/* Escape first, then mark the query inside the escaped text — never the reverse. */
function excerpt(k) {
  const raw = noteOf(k).replace(/\s+/g, ' ').trim();
  const cut = raw.length > 190 ? raw.slice(0, 190).replace(/\s\S*$/, '') + '…' : raw;
  let out = esc(cut);
  const q = esc(ui.journalQuery.trim());
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(rx, m => `<mark>${m}</mark>`);
  }
  return out;
}

function journalListHTML() {
  const keys = journalMatches();
  if (!keys.length) {
    const filtering = ui.journalQuery.trim() || ui.journalStarred || ui.journalBand !== 'all';
    return `<div class="empty">${filtering
      ? 'Nothing matches that.'
      : 'No entries yet — write the first one for today, or pick any date above.'}</div>`;
  }
  return keys.map(k => {
    const s = dayScore(k), wc = wordCount(noteOf(k));
    return `<button class="jrow" data-jopen="${k}">
      ${miniRing(s)}
      <span class="jrow-main">
        <span class="jrow-head">
          <b>${prettyDate(k)}</b>
          <span class="sub">${parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          ${isStarred(k) ? '<span class="star on">★</span>' : ''}
          <span class="spacer"></span>
          <span class="sub">${wc} word${wc === 1 ? '' : 's'}</span>
        </span>
        <span class="jrow-text">${excerpt(k)}</span>
      </span>
    </button>`;
  }).join('');
}

function viewJournal() {
  if (ui.journalOpen) return journalDay(ui.journalOpen);

  const all = writtenDays();
  const month = todayKey().slice(0, 7);
  const wordsThisMonth = all.filter(k => k.startsWith(month))
    .reduce((n, k) => n + wordCount(noteOf(k)), 0);
  const written = k => wordCount(noteOf(k)) > 0;
  const now = streak(written), best = bestStreak(written);

  const chips = Object.keys(BANDS).map(b =>
    `<button class="chip ${ui.journalBand === b ? 'on' : ''}" data-jband="${b}">${BANDS[b].label}</button>`).join('');

  return `
  <div class="card">
    <div class="stats">
      <div class="stat"><b>${all.length}</b><span>entries written</span></div>
      <div class="stat"><b>${wordsThisMonth.toLocaleString()}</b><span>words this month</span></div>
      <div class="stat"><b style="color:var(--warn)">${now}d</b><span>writing streak</span></div>
      <div class="stat"><b>${best}d</b><span>longest writing streak</span></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Journal</h2>
      <div class="row">
        <label class="jdate"><span>Any day</span><input class="input" type="date" id="jDate" max="${todayKey()}"></label>
        <button class="btn primary sm" data-jopen="${todayKey()}">Write today</button>
      </div>
    </div>
    <div class="jtools">
      <input class="input jsearch" id="jSearch" type="search" placeholder="Search everything you've written…" value="${esc(ui.journalQuery)}">
      <div class="chips">${chips}</div>
      <button class="chip ${ui.journalStarred ? 'on' : ''}" data-jstarred="1">★ Starred</button>
    </div>
    <div id="jList" class="jlist">${journalListHTML()}</div>
  </div>`;
}

function journalDay(k) {
  const note = noteOf(k), ms = metrics();
  const e = entry(k);
  const wc = wordCount(note);

  const breakdown = ms.length ? ms.map(m => {
    const sc = e ? metricScore(m, e.values[m.id]) : null;
    return `<div class="jb-row">
      <span class="dot" style="background:${m.color}"></span>
      <span class="jb-name">${esc(m.icon || '')} ${esc(m.name)}</span>
      <span class="spacer"></span>
      <b>${sc == null ? '—' : Math.round(sc) + '%'}</b>
    </div>`;
  }).join('') : '<div class="sub">No categories yet.</div>';

  return `
  <div class="card">
    <div class="card-head">
      <div class="row">
        <button class="btn sm ghost" data-jback="1">← All entries</button>
        <h2 style="font-size:15px">${prettyDate(k)}</h2>
        <span class="sub">${parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div class="row">
        <button class="btn sm ghost star ${isStarred(k) ? 'on' : ''}" data-jstar="${k}" title="Star this entry">${isStarred(k) ? '★' : '☆'}</button>
        <button class="btn sm" data-jday="-1">←</button>
        <button class="btn sm" data-jday="1" ${k >= todayKey() ? 'disabled' : ''}>→</button>
      </div>
    </div>
    <div class="jday">
      <div class="jwrite">
        ${note.trim() ? '' : `<div class="jprompt">${esc(promptFor(k))}</div>`}
        <textarea class="input jnote" id="jNote" placeholder="Write about ${esc(prettyDate(k).toLowerCase())}…">${esc(note)}</textarea>
        <div class="row jmeta">
          <span class="sub" id="jCount">${wc} word${wc === 1 ? '' : 's'}</span>
          <span class="spacer"></span>
          <span class="sub">saved automatically</span>
        </div>
      </div>
      <aside class="jaside">
        <div class="jaside-score">
          ${ring(k)}
        </div>
        <div class="jb">${breakdown}</div>
        ${(() => {
          // What you'd meant to do that day — useful context when reading a rough one back.
          const rows = tasksOn(k);
          if (!rows.length) return '';
          return `<div class="jb jb-tasks">
            <div class="sub" style="font-size:12px">Tasks that day</div>
            ${rows.map(({ t }) => `<div class="jb-row ${t.done ? 'is-done' : ''}">
              <span class="tick">${t.done ? '✓' : '○'}</span>
              <span class="jb-name">${esc(t.text)}</span>
            </div>`).join('')}
          </div>`;
        })()}
        <button class="btn sm" data-jtoday="${k}">Edit the numbers →</button>
      </aside>
    </div>
  </div>`;
}

function renderJournalList() {
  const el = $('#jList');
  if (el) el.innerHTML = journalListHTML();
  $$('[data-jband]').forEach(b => b.classList.toggle('on', b.dataset.jband === ui.journalBand));
}

/* ============================ view: trends ============================ */

function viewTrends() {
  const ms = metrics();
  const days = lastNDays(ui.range);
  const scores = days.map(dayScore);
  const logged = scores.filter(s => s != null);
  const avg = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null;

  // first vs second half, for the trend arrow
  const half = Math.floor(days.length / 2);
  const a1 = avgOf(scores.slice(0, half)), a2 = avgOf(scores.slice(half));
  const delta = (a1 == null || a2 == null) ? null : Math.round(a2 - a1);
  const best = logged.length ? Math.max.apply(null, logged) : null;

  const perMetric = ms.map(m => {
    const vals = days.map(k => { const e = entry(k); return e ? metricScore(m, e.values[m.id]) : null; }).filter(v => v != null);
    return { m, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  }).sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1));

  const ranges = [7, 30, 90, 365].map(r =>
    `<button class="btn sm ${ui.range === r ? 'primary' : ''}" data-range="${r}">${r === 365 ? '1y' : r + 'd'}</button>`).join(' ');

  return `
  <div class="card">
    <div class="stats">
      <div class="stat"><b style="color:${scoreColor(avg)}">${avg == null ? '—' : avg + '%'}</b><span>average efficiency</span></div>
      <div class="stat"><b>${delta == null ? '—' : (delta >= 0 ? '↑ ' : '↓ ') + Math.abs(delta) + '%'}</b><span>vs. first half</span></div>
      <div class="stat"><b>${best == null ? '—' : best + '%'}</b><span>best day</span></div>
      <div class="stat"><b>${logged.length}<span class="sub" style="font-size:14px">/${days.length}</span></b><span>days logged</span></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Efficiency over time</h2><div class="row">${ranges}</div></div>
    <div class="card-body">${lineChart(days, scores, ms)}</div>
  </div>

  <div class="card">
    <div class="card-head"><h2>By category</h2><span class="sub">average over ${ui.range === 365 ? 'the year' : 'the last ' + ui.range + ' days'}</span></div>
    <div class="card-body">
      ${perMetric.length ? perMetric.map(x => `
        <div style="margin-bottom:14px">
          <div class="row" style="font-size:13.5px">
            <span class="dot" style="background:${x.m.color}"></span>
            <span>${esc(x.m.icon || '')} ${esc(x.m.name)}</span>
            <span class="spacer"></span>
            <b style="font-variant-numeric:tabular-nums">${x.avg == null ? '—' : x.avg + '%'}</b>
          </div>
          <div class="bar" style="height:7px"><i style="width:${x.avg || 0}%;background:${x.m.color}"></i></div>
        </div>`).join('') : `<div class="sub">No categories yet.</div>`}
    </div>
  </div>`;
}

function avgOf(arr) {
  const v = arr.filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* Chart geometry, shared with the hover handler so the crosshair lands on the point. */
const CH = { W: 860, H: 260, PL: 34, PR: 12, PT: 14, PB: 26 };
CH.iw = CH.W - CH.PL - CH.PR;
CH.ih = CH.H - CH.PT - CH.PB;
const chartX = (i, n) => CH.PL + (n <= 1 ? CH.iw / 2 : (i / (n - 1)) * CH.iw);
const chartY = v => CH.PT + CH.ih - (v / 100) * CH.ih;

function lineChart(days, scores, ms) {
  const { W, H, PL, PR, PT, PB, iw, ih } = CH;
  const x = i => chartX(i, days.length);
  const y = chartY;
  ui.chart = { days: days.slice(), shown: ms.filter(m => ui.shown[m.id]).map(m => m.id) };

  let grid = '';
  [0, 25, 50, 75, 100].forEach(v => {
    grid += `<line class="grid-line" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/>
             <text class="axis-text" x="${PL - 7}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  });

  // per-metric lines — off by default, switched on from the legend
  let series = '';
  ms.forEach(m => {
    if (!ui.shown[m.id]) return;
    const pts = days.map((k, i) => {
      const e = entry(k);
      return e ? [x(i), y(metricScore(m, e.values[m.id]))] : null;
    });
    series += path(pts, m.color, 1.6, .75);
  });

  // main efficiency line + area
  const mainPts = days.map((k, i) => scores[i] == null ? null : [x(i), y(scores[i])]);
  const segs = segments(mainPts);
  let area = '';
  segs.forEach(s => {
    if (s.length < 2) return;
    area += `<path d="M${s[0][0]},${y(0)} ` + s.map(p => `L${p[0]},${p[1]}`).join(' ') +
      ` L${s[s.length - 1][0]},${y(0)} Z" fill="var(--accent)" opacity=".08"/>`;
  });
  const main = path(mainPts, 'var(--accent)', 2.4, 1);
  const dots = mainPts.map(p => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="var(--accent)"/>` : '').join('');

  // x labels: about 6 evenly spaced
  const step = Math.max(1, Math.round(days.length / 6));
  let xlab = '';
  days.forEach((k, i) => {
    if (i % step === 0 || i === days.length - 1) {
      const d = parseKey(k);
      xlab += `<text class="axis-text" x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`;
    }
  });

  const goalY = y(profile().goal);
  const legend = ms.map(m => `<button data-toggle-series="${m.id}" class="${ui.shown[m.id] ? '' : 'off'}"
      title="Overlay ${esc(m.name)}"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}</button>`).join('');

  return `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Efficiency over time">
      ${grid}
      <line x1="${PL}" x2="${W - PR}" y1="${goalY}" y2="${goalY}" stroke="var(--good)" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>
      ${area}${series}${main}${dots}${xlab}
      <g id="crosshair" hidden>
        <line y1="${PT}" y2="${PT + ih}" stroke="var(--faint)" stroke-width="1" stroke-dasharray="3 3"/>
        <circle r="4.5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>
      </g>
    </svg>
    <div id="chartTip" class="chart-tip" hidden></div>
    </div>
    <div class="legend">
      <button style="cursor:default"><span class="dot" style="background:var(--accent)"></span><b style="color:var(--text)">Overall</b></button>
      ${legend}
      <span class="sub" style="font-size:12px">← click to overlay</span>
    </div>`;
}

function segments(pts) {
  const out = []; let cur = [];
  pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) out.push(cur); cur = []; } });
  if (cur.length) out.push(cur);
  return out;
}
function path(pts, color, w, op) {
  return segments(pts).map(s => {
    if (s.length === 1) return `<circle cx="${s[0][0]}" cy="${s[0][1]}" r="${w}" fill="${color}" opacity="${op}"/>`;
    return `<path d="M` + s.map(p => `${p[0]},${p[1]}`).join(' L') +
      `" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`;
  }).join('');
}

/* ============================ view: calendar ============================ */

function viewCalendar() {
  const p = profile();
  // The heatmap begins the day this profile did, not a fixed year back — there is no
  // sense offering to log days that predate the app. It stops growing at 12 months.
  const end = parseKey(todayKey());
  const firstKey = profileStart();
  const yearAgo = new Date(end); yearAgo.setDate(yearAgo.getDate() - 363);
  const first = parseKey(firstKey) > yearAgo ? parseKey(firstKey) : yearAgo;
  const capped = parseKey(firstKey) <= yearAgo;
  // Back up to Sunday so the week rows line up; the days before `first` render as blanks.
  const grid = new Date(first); grid.setDate(grid.getDate() - grid.getDay());

  let cells = '', months = '', lastMonth = -1;
  for (let d = new Date(grid); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dateKey(d);
    if (d < first) {
      cells += `<i class="pre" aria-hidden="true"></i>`;
    } else {
      const s = dayScore(k);
      const lvl = s == null ? '' : s >= 90 ? 4 : s >= 75 ? 3 : s >= 55 ? 2 : s >= 30 ? 1 : 0;
      const cls = (k === todayKey() ? 'today ' : '') + (isClosed(k) ? 'closed' : '');
      cells += `<i data-lvl="${lvl}" class="${cls.trim()}" data-jump="${k}"
        title="${prettyDate(k)} — ${s == null ? 'not logged' : s + '%'}${isClosed(k) ? ' · closed' : ''}"></i>`;
    }
    if (d.getDay() === 0) {
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        months += `<span style="width:15px;flex:none">${d.toLocaleDateString(undefined, { month: 'short' })}</span>`;
      } else months += `<span style="width:15px;flex:none"></span>`;
    }
  }

  const spanLabel = capped
    ? 'Last 12 months'
    : `Since ${first.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const dayCount = Math.round((end - first) / 86400000) + 1;

  const loggedNow = streak(isLogged);
  const goodNow = streak(k => (dayScore(k) ?? -1) >= p.goal);
  const closedNow = streak(isClosed);
  const loggedBest = bestStreak(isLogged);
  const goodBest = bestStreak(k => (dayScore(k) ?? -1) >= p.goal);
  const closedBest = bestStreak(isClosed);

  const perMetric = metrics().map(m => {
    const cur = metricStreak(m);
    const bst = bestStreak(k => { const e = entry(k); return !!e && metricScore(m, e.values[m.id]) >= 100; });
    return `<div class="row" style="padding:9px 0;border-top:1px solid var(--line-soft)">
      <span class="m-icon" style="width:26px;height:26px;font-size:13px">${esc(m.icon || '•')}</span>
      <span style="font-size:13.5px">${esc(m.name)}</span><span class="spacer"></span>
      <span class="sub">best ${bst}d</span>
      <b style="width:56px;text-align:right;color:${cur ? 'var(--warn)' : 'var(--faint)'}">🔥 ${cur}d</b>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <div class="stats cols-3">
      <div class="stat"><b style="color:var(--warn)">${loggedNow}d</b><span>current logging streak</span></div>
      <div class="stat"><b style="color:var(--good)">${goodNow}d</b><span>current ${p.goal}%+ streak</span></div>
      <div class="stat"><b style="color:var(--accent)">${closedNow}d</b><span>current closed streak</span></div>
      <div class="stat"><b>${loggedBest}d</b><span>longest logging streak</span></div>
      <div class="stat"><b>${goodBest}d</b><span>longest ${p.goal}%+ streak</span></div>
      <div class="stat"><b>${closedBest}d</b><span>longest closed streak</span></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>${esc(spanLabel)}</h2>
      <span class="sub">${dayCount} day${dayCount === 1 ? '' : 's'} · click one to open it</span>
    </div>
    <div class="card-body">
      <div class="heat-scroll">
        <div class="months">${months}</div>
        <div class="heat">${cells}</div>
      </div>
      <div class="heat-legend">
        <span>less</span>
        <i style="background:var(--line-soft)"></i>
        <i data-lvl="0" style="background:color-mix(in srgb, var(--bad) 55%, var(--line-soft))"></i>
        <i data-lvl="1" style="background:color-mix(in srgb, var(--warn) 45%, var(--line-soft))"></i>
        <i data-lvl="2" style="background:color-mix(in srgb, var(--good) 30%, var(--line-soft))"></i>
        <i data-lvl="3" style="background:color-mix(in srgb, var(--good) 60%, var(--line-soft))"></i>
        <i data-lvl="4" style="background:var(--good)"></i>
        <span>more</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Category streaks</h2><span class="sub">consecutive days at 100%</span></div>
    <div class="card-body" style="padding-top:4px">${perMetric || '<div class="sub">No categories yet.</div>'}</div>
  </div>`;
}

/* ============================ view: settings ============================ */

function viewSettings() {
  const p = profile();
  const list = p.metrics.map((m, i) => {
    if (ui.editing === m.id) return metricEditor(m, i);
    return `<div class="mrow">
      <div class="m-icon" style="color:${m.color}">${esc(m.icon || '•')}</div>
      <div class="m-main">
        <div class="m-name">${esc(m.name)} ${m.archived ? '<span class="pill">archived</span>' : ''}</div>
        <div class="m-sub">${TYPES[m.type].label}${m.type === 'target' ? ` · ${m.goal === 'atMost' ? 'at most' : 'at least'} ${m.target}${m.unit ? ' ' + m.unit : ''}` : ''} · weight ×${m.weight}</div>
      </div>
      <button class="btn sm ghost" data-move="${m.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
      <button class="btn sm ghost" data-move="${m.id}" data-dir="1" ${i === p.metrics.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
      <button class="btn sm" data-edit="${m.id}">Edit</button>
    </div>`;
  }).join('');

  const types = dayTypes().map(t => ui.editingType === t.id ? typeEditor(t) : `<div class="trow">
      <div class="m-icon" style="color:${t.color || 'var(--accent)'}">${esc(t.icon || '◎')}</div>
      <div class="m-main">
        <div class="m-name">${esc(t.name)}</div>
        <div class="m-sub">${typeSummary(t)}</div>
      </div>
      <button class="btn sm" data-tedit="${t.id}">Edit</button>
    </div>`).join('');

  return `
  <div class="card">
    <div class="card-head">
      <h2>Categories</h2>
      <button class="btn primary sm" data-add="1">+ Add category</button>
    </div>
    ${list || '<div class="empty">Nothing tracked yet — add what makes a good day for you.</div>'}
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Kinds of day</h2>
      <span class="sub">picked by hand on the Day tab, never assigned for you</span>
    </div>
    ${types}
  </div>

  <div class="card">
    <div class="card-head"><h2>Profile</h2></div>
    <div class="card-body grid-2">
      <label class="field"><span>Name</span>
        <input class="input" id="pName" value="${esc(p.name)}"></label>
      <label class="field"><span>Avatar</span>
        <div class="swatches" style="padding-top:4px">
          ${AVATARS.map(a => `<button data-avatar="${a}" class="${p.avatar === a ? 'on' : ''}" style="background:var(--panel-2);font-size:14px;width:28px;height:28px">${a}</button>`).join('')}
        </div></label>
      <label class="field full" style="grid-column:1/-1"><span>A "good day" is <b id="goalVal">${p.goal}%</b> efficiency or better — used for streaks and the dashed line on charts</span>
        <input type="range" min="40" max="100" step="5" value="${p.goal}" id="pGoal" style="width:100%"></label>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Data</h2><span class="sub">stored only in this browser</span></div>
    <div class="card-body row" style="flex-wrap:wrap;gap:8px">
      <button class="btn" data-export="json">Export JSON (backup)</button>
      <button class="btn" data-export="csv">Export CSV</button>
      <button class="btn" data-import="1">Import JSON…</button>
      <span class="spacer"></span>
      <button class="btn danger" data-wipe="1">Delete this profile</button>
    </div>
  </div>`;
}

/* "Everything" rather than a list, when a type counts the lot — said plainly, and it is
   also how the type keeps picking up categories added later. */
function typeSummary(t) {
  if (!t.active) return 'counts every category';
  const names = metrics().filter(m => t.active.indexOf(m.id) >= 0).map(m => m.name);
  if (!names.length) return 'counts nothing yet';
  return 'counts ' + names.join(', ');
}

/* A type is a name, an icon, a colour and a set of tick boxes. No targets, no weights —
   those live on the category, once, and a type never overrides them. */
function typeEditor(t) {
  const ms = metrics();
  const isOn = m => !t.active || t.active.indexOf(m.id) >= 0;
  const onCount = ms.filter(isOn).length;
  return `<div class="trow editing" style="align-items:flex-start">
    <div class="m-main">
      <div class="editor">
        <label class="field" style="grid-column:span 2"><span>Name</span>
          <input class="input" data-tf="name" value="${esc(t.name)}" placeholder="e.g. Saturday"></label>
        <label class="field"><span>Icon</span>
          <input class="input" data-tf="icon" value="${esc(t.icon || '◎')}" maxlength="2"></label>

        <label class="field full"><span>Colour</span>
          <div class="swatches">${PALETTE.map(c =>
            `<button data-tcolor="${c}" class="${t.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>

        <div class="field full"><span>Counts these categories${onCount === ms.length ? ' — all of them, so new ones join automatically' : ''}</span>
          <div class="ticks">${ms.map(m => `<button class="tchip ${isOn(m) ? 'on' : ''}" data-ttick="${m.id}">
            <span style="color:${m.color}">${esc(m.icon || '•')}</span> ${esc(m.name)}</button>`).join('')}</div>
        </div>

        <div class="full row">
          <button class="btn primary sm" data-tdone="1">Done</button>
          <span class="sub">Editing a kind of day changes days from here on, never the ones already logged.</span>
          <span class="spacer"></span>
          ${t.id === 'standard'
            ? '<span class="sub">Standard can’t be deleted</span>'
            : `<button class="btn danger sm" data-tdel="${t.id}">Delete</button>`}
        </div>
      </div>
    </div>
  </div>`;
}

function metricEditor(m, i) {
  return `<div class="mrow editing" style="align-items:flex-start">
      <div class="m-main">
        <div class="editor">
          <label class="field" style="grid-column:span 2"><span>Name</span>
            <input class="input" data-f="name" value="${esc(m.name)}" placeholder="e.g. Deep work"></label>
          <label class="field"><span>Icon</span>
            <input class="input" data-f="icon" value="${esc(m.icon)}" maxlength="2" placeholder="🎯"></label>
          <label class="field"><span>Type</span>
            <select class="input" data-f="type">
              ${Object.keys(TYPES).map(t => `<option value="${t}" ${m.type === t ? 'selected' : ''}>${TYPES[t].label}</option>`).join('')}
            </select></label>

          ${m.type === 'target' ? `
          <label class="field"><span>Direction</span>
            <select class="input" data-f="goal">
              <option value="atLeast" ${m.goal !== 'atMost' ? 'selected' : ''}>At least (more is better)</option>
              <option value="atMost" ${m.goal === 'atMost' ? 'selected' : ''}>At most (less is better)</option>
            </select></label>
          <label class="field"><span>Daily target</span>
            <input class="input" type="number" step="any" min="0" data-f="target" value="${esc(m.target)}"></label>
          <label class="field"><span>Unit</span>
            <input class="input" data-f="unit" value="${esc(m.unit)}" placeholder="h, min, pages…"></label>` : ''}

          <label class="field"><span>Weight (×${m.weight})</span>
            <input class="input" type="number" step="0.5" min="0.5" max="5" data-f="weight" value="${esc(m.weight)}"></label>

          <label class="field full"><span>Color</span>
            <div class="swatches">${PALETTE.map(c =>
              `<button data-color="${c}" class="${m.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>

          <div class="full row">
            <button class="btn primary sm" data-done="1">Done</button>
            <button class="btn sm" data-archive="${m.id}">${m.archived ? 'Restore' : 'Archive'}</button>
            <span class="sub">${m.archived ? 'Hidden from daily entry, history kept.' : 'Archiving hides it without deleting history.'}</span>
            <span class="spacer"></span>
            <button class="btn danger sm" data-del="${m.id}">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ============================ events ============================ */

function onClick(ev) {
  const t = ev.target.closest('[data-day],[data-set],[data-range],[data-toggle-series],[data-jump],[data-go],[data-add],[data-edit],[data-move],[data-done],[data-del],[data-archive],[data-color],[data-avatar],[data-export],[data-import],[data-wipe],[data-jopen],[data-jback],[data-jstar],[data-jband],[data-jstarred],[data-jday],[data-jtoday],[data-focus],[data-close],[data-reopen],[data-task],[data-taskdel],[data-taskadd],[data-gotasks],[data-settype],[data-savetype],[data-dropm],[data-addm],[data-tedit],[data-tdone],[data-tdel],[data-tcolor],[data-ttick]');
  if (!t) return;
  const d = t.dataset;

  /* --- tasks --- */
  if (d.task) {
    const found = findTask(d.task);
    if (found) {
      found.t.done = !found.t.done;
      found.t.doneAt = found.t.done ? ui.date : null;   // ticked today, so it shows today
      save();
    }
    return render();
  }
  if (d.taskdel) {
    const found = findTask(d.taskdel);
    if (found) {
      found.list.splice(found.list.indexOf(found.t), 1);
      save();
    }
    return render();
  }
  if (d.taskadd) {
    const input = $('#taskInput');
    if (input && addTask(ui.date, input.value)) { render(); $('#taskInput').focus(); }
    return;
  }
  if (d.gotasks) { ui.view = 'tasks'; return render(); }

  /* --- day types --- */
  if (d.settype) {
    setDayType(ui.date, d.settype);
    save(); toast(typeFor(ui.date).name);
    return render();
  }
  if (d.dropm) {
    if (!setMetricOnDay(ui.date, d.dropm, false)) { toast('A day has to count something'); return; }
    save(); return render();
  }
  if (d.addm) { setMetricOnDay(ui.date, d.addm, true); save(); return render(); }
  if (d.tedit) { ui.editingType = d.tedit; return render(); }
  if (d.tdone) { ui.editingType = null; save(); return render(); }
  if (d.tcolor) {
    const t = typeById(ui.editingType);
    if (t) { t.color = d.tcolor; resnapshotToday(); save(); render(); }
    return;
  }
  if (d.ttick) {
    const t = typeById(ui.editingType);
    if (!t) return;
    const ms = metrics();
    const list = t.active ? ms.filter(m => t.active.indexOf(m.id) >= 0).map(m => m.id) : ms.map(m => m.id);
    const at = list.indexOf(d.ttick);
    if (at >= 0) {
      if (list.length <= 1) { toast('A day has to count something'); return; }
      list.splice(at, 1);
    } else list.push(d.ttick);
    // All of them means "all of them" — kept as null so categories added later join in.
    t.active = list.length === ms.length ? null : list;
    resnapshotToday(); save(); return render();
  }
  if (d.tdel) {
    const t = typeById(d.tdel);
    if (!t) return;
    if (!confirm(`Delete the "${t.name}" kind of day? Days already logged keep the score they were given.`)) return;
    const p = profile();
    p.dayTypes = dayTypes().filter(x => x.id !== d.tdel);
    ui.editingType = null; save(); toast('Kind of day deleted'); return render();
  }
  if (d.savetype) {
    const name = (prompt('What kind of day is this?') || '').trim();
    if (!name) return;
    const ids = dayActive(ui.date).map(m => m.id);
    if (!ids.length) { toast('A day has to count something'); return; }
    const t = { id: uid(), name, icon: '◎', color: PALETTE[dayTypes().length % PALETTE.length], weekdays: [], active: ids };
    dayTypes().push(t);
    setDayType(ui.date, t.id);
    save(); toast(`Saved “${name}”`);
    return render();
  }

  if (d.close) {
    const e = ensureEntry(d.close);
    e.closedAt = new Date().toISOString();
    save(); render();
    const card = $('.day-head');
    if (card) { card.classList.add('just-closed'); setTimeout(() => card.classList.remove('just-closed'), 1200); }
    const s = dayScore(d.close);
    toast(`Day closed${s == null ? '' : ' — ' + s + '%'}`);
    // The one moment the app asks for something back: a line about the day.
    if (!noteOf(d.close).trim()) {
      const note = $('#note');
      if (note) { note.scrollIntoView({ block: 'center', behavior: 'smooth' }); note.focus(); }
    }
    return;
  }
  if (d.reopen) {
    const e = entry(d.reopen);
    if (e) { delete e.closedAt; save(); }
    return render();
  }

  if (d.focus) {
    const row = $(`.metric[data-row="${d.focus}"]`);
    if (!row) return;
    const ctl = $('input,.toggle,.scale button', row);
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (ctl) ctl.focus();
    return;
  }

  if (d.day) {
    ui.date = d.day === 'today' ? todayKey() : shiftKey(ui.date, Number(d.day));
    return render();
  }

  /* --- journal --- */
  if (d.jopen)  { ui.view = 'journal'; ui.journalOpen = d.jopen; render(); return focusNote(); }
  if (d.jback)  { ui.journalOpen = null; return render(); }
  if (d.jday)   { ui.journalOpen = shiftKey(ui.journalOpen, Number(d.jday)); return render(); }
  if (d.jtoday) { ui.date = d.jtoday; ui.view = 'today'; ui.journalOpen = null; return render(); }
  if (d.jstar) {
    const e = ensureEntry(d.jstar);
    e.starred = !e.starred;
    save(); return render();
  }
  if (d.jband)    { ui.journalBand = d.jband; return renderJournalList(); }
  if (d.jstarred) { ui.journalStarred = !ui.journalStarred; return render(); }
  if (d.set) {
    const m = profile().metrics.find(x => x.id === d.set);
    const e = ensureEntry(ui.date);
    if (d.kind === 'bool') e.values[m.id] = !e.values[m.id];
    if (d.kind === 'scale') e.values[m.id] = Number(e.values[m.id]) === Number(d.val) ? undefined : Number(d.val);
    ensureScoring(ui.date);
    save(); return render();
  }
  if (d.range) { ui.range = Number(d.range); return render(); }
  if (d.toggleSeries) {
    ui.shown[d.toggleSeries] = !ui.shown[d.toggleSeries];
    return render();
  }
  if (d.jump) { ui.date = d.jump; ui.view = 'today'; return render(); }
  if (d.go) { ui.view = d.go; return render(); }

  if (d.add) {
    const m = mk('New category', '⭐', 'bool', { color: PALETTE[profile().metrics.length % PALETTE.length] });
    profile().metrics.push(m); ui.editing = m.id; resnapshotToday(); save(); return render();
  }
  if (d.edit) { ui.editing = d.edit; return render(); }
  if (d.done) { ui.editing = null; save(); return render(); }
  if (d.move) {
    const arr = profile().metrics, i = arr.findIndex(x => x.id === d.move), j = i + Number(d.dir);
    if (j >= 0 && j < arr.length) { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; save(); render(); }
    return;
  }
  if (d.archive) {
    const m = profile().metrics.find(x => x.id === d.archive);
    m.archived = !m.archived; resnapshotToday(); save(); return render();
  }
  if (d.del) {
    const m = profile().metrics.find(x => x.id === d.del);
    if (!confirm(`Delete "${m.name}"? Its logged values are removed from every day. This can't be undone.`)) return;
    const p = profile();
    p.metrics = p.metrics.filter(x => x.id !== d.del);
    Object.values(p.entries).forEach(e => { delete e.values[d.del]; });
    ui.editing = null; resnapshotToday(); save(); toast('Category deleted'); return render();
  }
  if (d.color) {
    const m = profile().metrics.find(x => x.id === ui.editing);
    if (m) { m.color = d.color; save(); render(); }
    return;
  }
  if (d.avatar) { profile().avatar = d.avatar; save(); return render(); }
  if (d.export) { d.export === 'csv' ? exportCSV() : exportJSON(); return; }
  if (d.import) { $('#importFile').click(); return; }
  if (d.wipe) {
    const ids = Object.keys(db.profiles);
    if (ids.length === 1) { toast('Create another profile first'); return; }
    if (!confirm(`Delete profile "${profile().name}" and all of its history? This can't be undone.`)) return;
    delete db.profiles[db.activeProfileId];
    db.activeProfileId = Object.keys(db.profiles)[0];
    save(); toast('Profile deleted'); return render();
  }
}

function onChange(ev) {
  const el = ev.target;
  if (el.dataset.f && ui.editing) {
    const m = profile().metrics.find(x => x.id === ui.editing);
    const f = el.dataset.f;
    m[f] = (f === 'target' || f === 'weight') ? (Number(el.value) || (f === 'weight' ? 1 : 0)) : el.value;
    if (f === 'target' || f === 'weight') resnapshotToday();
    save();
    if (f === 'type' || f === 'goal' || f === 'weight') render();   // editor layout depends on these
    return;
  }
  if (el.dataset.tf && ui.editingType) {
    const t = typeById(ui.editingType);
    if (t) { t[el.dataset.tf] = el.value || (el.dataset.tf === 'icon' ? '◎' : 'Unnamed'); resnapshotToday(); save(); render(); }
    return;
  }
  if (el.id === 'jDate' && el.value) { ui.journalOpen = el.value; render(); focusNote(); }
}

/* Land the caret in the entry so you can just start typing. */
function focusNote() {
  const n = $('#jNote');
  if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}

function onInput(ev) {
  const el = ev.target;
  // Numbers update live, in place — a full re-render here would steal focus mid-typing.
  if (el.dataset.kind === 'num') {
    const e = ensureEntry(ui.date);
    e.values[el.dataset.set] = el.value === '' ? undefined : Number(el.value);
    ensureScoring(ui.date);
    debouncedSave(); refreshScores();
    return;
  }
  if (el.id === 'note') { ensureEntry(ui.date).note = el.value; debouncedSave(); return; }
  // Re-render only the list, never the search box — rebuilding it would drop the caret.
  if (el.id === 'jSearch') { ui.journalQuery = el.value; renderJournalList(); return; }
  if (el.id === 'jNote') {
    ensureEntry(ui.journalOpen).note = el.value;
    const wc = wordCount(el.value);
    $('#jCount').textContent = wc + ' word' + (wc === 1 ? '' : 's');
    debouncedSave(); return;
  }
  if (el.id === 'pName') { profile().name = el.value || 'Unnamed'; $('#profileName').textContent = profile().name; debouncedSave(); return; }
  if (el.id === 'pGoal') { profile().goal = Number(el.value); $('#goalVal').textContent = el.value + '%'; debouncedSave(); return; }
}

let saveTimer;
function debouncedSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 350); }

/* ============================ profiles menu ============================ */

function renderProfileMenu() {
  const menu = $('#profileMenu');
  menu.innerHTML =
    Object.values(db.profiles).map(p =>
      `<button class="menu-item ${p.id === db.activeProfileId ? 'is-active' : ''}" data-switch="${p.id}">
        <span class="avatar">${p.avatar}</span>${esc(p.name)}</button>`).join('') +
    `<div class="menu-sep"></div>
     <button class="menu-item" data-newprofile="1"><span class="avatar">＋</span>New profile</button>`;
  menu.hidden = false;
  $('#profileBtn').setAttribute('aria-expanded', 'true');
}
function closeMenu() { $('#profileMenu').hidden = true; $('#profileBtn').setAttribute('aria-expanded', 'false'); }

document.addEventListener('click', ev => {
  const btn = ev.target.closest('#profileBtn');
  if (btn) { $('#profileMenu').hidden ? renderProfileMenu() : closeMenu(); return; }
  const item = ev.target.closest('[data-switch],[data-newprofile]');
  if (item) {
    if (item.dataset.switch) { db.activeProfileId = item.dataset.switch; }
    else {
      const name = prompt('Name for the new profile?');
      if (!name) { closeMenu(); return; }
      const used = Object.values(db.profiles).length;
      const p = newProfile(name.trim(), AVATARS[used % AVATARS.length], confirm('Start with a few example categories? (Cancel = start empty)'));
      db.profiles[p.id] = p; db.activeProfileId = p.id;
    }
    ui.editing = null; ui.date = todayKey(); ui.shown = {};
    ui.journalOpen = null; ui.journalQuery = ''; ui.journalBand = 'all'; ui.journalStarred = false;
    closeMenu(); save(); render(); return;
  }
  if (!ev.target.closest('#profileMenu')) closeMenu();
});

/* ============================ import / export ============================ */

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJSON() {
  download(`cadence-${profile().name.replace(/\W+/g, '-').toLowerCase()}-${todayKey()}.json`,
    JSON.stringify({ kind: 'cadence-profile', version: 1, profile: profile() }, null, 2), 'application/json');
  toast('Backup downloaded');
}
function exportCSV() {
  const p = profile();
  const ms = p.metrics;
  const keys = Object.keys(p.entries).sort();
  const head = ['date', 'efficiency', ...ms.map(m => m.name), 'note'];
  const rows = keys.map(k => {
    const e = p.entries[k];
    return [k, dayScore(k) ?? '', ...ms.map(m => {
      const v = e.values[m.id];
      if (m.type === 'bool') return v ? 1 : 0;
      return v === undefined || v === null ? '' : v;
    }), e.note || ''];
  });
  const csv = [head, ...rows].map(r => r.map(c => {
    const s = String(c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  download(`cadence-${todayKey()}.csv`, csv, 'text/csv');
  toast('CSV downloaded');
}

$('#importFile').addEventListener('change', ev => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const p = data.profile || (data.profiles ? Object.values(data.profiles)[0] : null);
      if (!p || !Array.isArray(p.metrics) || typeof p.entries !== 'object') throw new Error('bad shape');
      p.id = uid();
      p.name = (p.name || 'Imported') + ' (imported)';
      p.goal = p.goal || 75;
      db.profiles[p.id] = p;
      db.activeProfileId = p.id;
      save(); render(); toast('Profile imported');
    } catch (e) { toast('That file does not look like a Cadence backup'); }
    ev.target.value = '';
  };
  reader.readAsText(file);
});

/* ============================ theme + toast ============================ */

function applyTheme() {
  const pref = db.theme || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  $('#themeBtn').textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '☾' : '☀';
  $('#themeBtn').title = `Theme: ${pref}`;
}
$('#themeBtn').addEventListener('click', () => {
  db.theme = { auto: 'light', light: 'dark', dark: 'auto' }[db.theme || 'auto'];
  save(); applyTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ============================ boot ============================ */

$('#tabs').addEventListener('click', ev => {
  const t = ev.target.closest('.tab');
  if (!t) return;
  ui.view = t.dataset.view; ui.editing = null; ui.journalOpen = null;
  render();
  window.scrollTo({ top: 0 });
});

document.addEventListener('keydown', ev => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (ui.view === 'journal' && ui.journalOpen) {
    if (ev.key === 'Escape') { ui.journalOpen = null; render(); }
    if (ev.key === 'ArrowLeft') { ui.journalOpen = shiftKey(ui.journalOpen, -1); render(); }
    if (ev.key === 'ArrowRight' && ui.journalOpen < todayKey()) { ui.journalOpen = shiftKey(ui.journalOpen, 1); render(); }
    return;
  }
  if (ui.view !== 'today') return;
  if (ev.key === 'ArrowLeft') { ui.date = shiftKey(ui.date, -1); render(); }
  if (ev.key === 'ArrowRight' && ui.date < todayKey()) { ui.date = shiftKey(ui.date, 1); render(); }
});

db = load();
ui = {
  view: 'today', date: todayKey(), range: 30, editing: null, editingType: null, shown: {},
  journalOpen: null, journalQuery: '', journalBand: 'all', journalStarred: false
};

// Attached once — #view is reused across renders, so per-render binding would stack up.
const viewEl = $('#view');
/* Chart crosshair: map the pointer back to a day and read that column out. */
function moveCrosshair(ev) {
  const wrap = ev.target.closest('.chart-wrap');
  if (!wrap || !ui.chart) return;
  const svg = $('.chart', wrap), tip = $('#chartTip', wrap), cross = $('#crosshair', wrap);
  if (!svg || !tip || !cross) return;

  const days = ui.chart.days, n = days.length;
  const box = svg.getBoundingClientRect();
  const xv = ((ev.clientX - box.left) / box.width) * CH.W;
  const i = clamp(Math.round(((xv - CH.PL) / CH.iw) * (n - 1)), 0, n - 1);
  const k = days[i], s = dayScore(k), px = chartX(i, n);

  cross.hidden = false;
  $('line', cross).setAttribute('x1', px);
  $('line', cross).setAttribute('x2', px);
  const dot = $('circle', cross);
  dot.setAttribute('cx', px);
  dot.setAttribute('cy', chartY(s == null ? 0 : s));
  dot.setAttribute('opacity', s == null ? 0 : 1);

  const e = entry(k);
  const rows = ui.chart.shown.map(id => {
    const m = profile().metrics.find(x => x.id === id);
    if (!m) return '';
    const sc = e ? metricScore(m, e.values[m.id]) : null;
    return `<div class="tip-row"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}
      <span class="spacer"></span><b>${sc == null ? '—' : Math.round(sc) + '%'}</b></div>`;
  }).join('');

  tip.innerHTML = `<div class="tip-date">${prettyDate(k)}</div>
    <div class="tip-row"><span class="dot" style="background:var(--accent)"></span>Overall
      <span class="spacer"></span><b>${s == null ? 'not logged' : s + '%'}</b></div>${rows}`;
  tip.hidden = false;
  // Keep it inside the card rather than letting it hang off the edge. Measure from the
  // middle first: an absolutely-positioned box near an edge shrinks to fit, so measuring
  // it in place would report a narrower width than it actually wants.
  tip.style.left = box.width / 2 + 'px';
  const half = tip.offsetWidth / 2;
  tip.style.left = clamp((px / CH.W) * box.width, half, box.width - half) + 'px';
}
function hideCrosshair() {
  const cross = $('#crosshair'), tip = $('#chartTip');
  if (cross) cross.hidden = true;
  if (tip) tip.hidden = true;
}

/* Hovering a ring slice lights up its row, and the other way round — the ring only
   pays off if you can tell which slice is which. */
function link(id) {
  $$('.metric.lit, .seg-fill.lit').forEach(el => el.classList.remove('lit'));
  if (!id) return;
  const row = $(`.metric[data-row="${id}"]`), seg = $(`.seg-fill[data-seg="${id}"]`);
  if (row) row.classList.add('lit');
  if (seg) seg.classList.add('lit');
}
viewEl.addEventListener('pointerover', ev => {
  const seg = ev.target.closest('.seg-fill'), row = ev.target.closest('.metric');
  link(seg ? seg.dataset.seg : row ? row.dataset.row : null);
});
viewEl.addEventListener('pointerleave', () => { link(null); hideCrosshair(); });
viewEl.addEventListener('pointermove', ev => {
  if (ev.target.closest('.chart-wrap')) moveCrosshair(ev);
  else hideCrosshair();
});

/* Enter adds and leaves the caret in place, so a list can be typed straight through. */
viewEl.addEventListener('keydown', ev => {
  if (ev.target.id !== 'taskInput' || ev.key !== 'Enter') return;
  ev.preventDefault();
  if (addTask(ui.date, ev.target.value)) { render(); $('#taskInput').focus(); }
});

viewEl.addEventListener('click', onClick);
viewEl.addEventListener('change', onChange);
viewEl.addEventListener('input', onInput);

applyTheme();
render();

})();
