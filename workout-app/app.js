/* M-F Lift — UI layer. Data lives in this browser's localStorage; use Export in the Plan tab to back it up. */
(function () {
  'use strict';
  const L = window.Logic;
  const STORE_KEY = 'mf-lift-v1';
  const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const KIND_LABEL = { lower: 'Big lower lift', upper: 'Big upper lift', iso: 'Accessory', bw: 'Bodyweight' };

  // ---------- state ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Math.random().toString(36).slice(2, 10);

  function freshProgram() {
    const program = clone(window.DEFAULT_PROGRAM);
    for (const d of Object.values(program.days)) for (const e of d.exercises) e.id = uid();
    return program;
  }
  function freshState() {
    return {
      version: 2,
      program: freshProgram(),
      sessions: [],
      bodyweight: [],
      cardio: [],
      settings: { unit: 'lb', restCompound: 150, restIso: 75, goal: null, onboarded: false, blockStart: null },
    };
  }

  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY)) || freshState();
  } catch (e) {
    state = freshState();
  }
  state.settings = Object.assign({ unit: 'lb', restCompound: 150, restIso: 75, goal: null, onboarded: false, blockStart: null }, state.settings);
  state.cardio = state.cardio || [];
  state.bodyweight = state.bodyweight || [];
  state.sessions = state.sessions || [];

  const ui = {
    tab: 'today',
    todayDay: null,
    active: {}, // sessionId -> expanded exercise index
    cue: {}, // `${sessionId}:${i}` -> bool
    progressEx: null,
    programDay: '1',
    offerUpgrade: false,
    migrated: false,
  };

  // Move older saved plans to the current one. Logged workouts are never touched; the old plan is kept as a backup.
  if ((state.program.version || 1) < 3) {
    if (state.sessions.length) {
      state.previousProgram = state.program;
      ui.migrated = true;
    }
    state.program = freshProgram();
  }
  // v3 → v4: flat Bench Press leads chest day, Incline Dumbbell Press added after it.
  // Edits only that exercise so any other changes you made to your plan are kept.
  if (state.program.version === 3) {
    const tpl = Object.values(window.DEFAULT_PROGRAM.days).flatMap((d) => d.exercises);
    const bench = tpl.find((e) => e.name === 'Bench Press');
    const incline = tpl.find((e) => e.name === 'Incline Dumbbell Press');
    for (const day of Object.values(state.program.days)) {
      const i = day.exercises.findIndex((e) => e.name === 'Incline Bench Press');
      if (i === -1) continue;
      Object.assign(day.exercises[i], { name: bench.name, cue: bench.cue });
      if (!day.exercises.some((e) => e.name === incline.name)) day.exercises.splice(i + 1, 0, { ...clone(incline), id: uid() });
      if (day.focus === 'Upper chest priority, shoulders, triceps') day.focus = 'Flat & incline pressing, shoulders, triceps';
    }
    state.program.version = 4;
    ui.benchUpdate = true;
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* saved on next change */ }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save. Storage is full or blocked.');
    }
  }

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
  const today = () => new Date();
  const todayStr = () => L.ymd(today());
  const unit = () => state.settings.unit;
  const repText = (e) => (e.repMax == null ? 'max' : e.repMin === e.repMax ? `${e.repMax}` : `${e.repMin}–${e.repMax}`);
  const prettyDate = (s) => L.parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const shortDate = (s) => L.parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const block = () => L.blockInfo(state.settings.blockStart, today());
  const goal = () => state.settings.goal || 'recomp';
  const latestBw = () => [...state.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1)).pop();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function findSession(date, dayKey) {
    return state.sessions.find((s) => s.date === date && String(s.dayKey) === String(dayKey));
  }
  function weekRange(start) {
    return [L.ymd(start), L.ymd(L.addDays(start, 6))];
  }
  function sessionsInWeek(start) {
    const [a, b] = weekRange(start);
    return state.sessions.filter((s) => s.date >= a && s.date <= b);
  }
  function cardioInWeek(start) {
    const [a, b] = weekRange(start);
    return state.cardio.filter((c) => c.date >= a && c.date <= b).reduce((t, c) => t + Number(c.minutes || 0), 0);
  }
  const MUSCLE_GROUP = { 'Rear delts': 'Shoulders', 'Side delts': 'Shoulders', Traps: 'Shoulders', Quads: 'Legs', Hamstrings: 'Legs', Glutes: 'Legs', Biceps: 'Arms', Triceps: 'Arms' };
  const groupOf = (m) => MUSCLE_GROUP[m] || m;
  function muscleIndex() {
    const idx = {};
    for (const day of Object.values(state.program.days)) for (const e of day.exercises) idx[e.name.toLowerCase()] = groupOf(e.muscle || day.name);
    return idx;
  }

  // ---------- suggestions ----------
  function suggestionFor(e, date, deload) {
    if (deload) {
      const prev = L.lastLogFor(state.sessions, e.name, date);
      const w = prev ? Math.max(...L.completedSets(prev.log).map((s) => Number(s.weight) || 0)) : null;
      return {
        action: 'deloadweek',
        weight: w || null,
        targetReps: e.repMin,
        text: 'Deload week: same weight as last time, fewer sets, and stop 3–4 reps short. Your body catches up so you come back stronger.',
      };
    }
    return L.suggest(e, state.sessions, unit(), date);
  }
  function badge(sg) {
    switch (sg && sg.action) {
      case 'increase': return `<span class="pill good">▲ Add weight</span>`;
      case 'hold': return `<span class="pill info">＝ Beat your reps</span>`;
      case 'reps': return `<span class="pill info">▲ +1 rep</span>`;
      case 'deload': return `<span class="pill warn">▼ Reset weight</span>`;
      case 'deloadweek': return `<span class="pill warn">Deload</span>`;
      default: return `<span class="pill">New</span>`;
    }
  }

  // ---------- rest timer ----------
  const timer = { end: 0, total: 0, int: null };
  function startTimer(sec, nextText) {
    timer.total = sec;
    timer.end = Date.now() + sec * 1000;
    $('#timer-next').textContent = nextText || '';
    $('#timer').classList.remove('hidden', 'over');
    document.body.classList.add('timer-on');
    clearInterval(timer.int);
    timer.int = setInterval(tickTimer, 250);
    tickTimer();
  }
  function tickTimer() {
    const left = Math.round((timer.end - Date.now()) / 1000);
    const el = $('#timer');
    const a = Math.abs(left);
    $('#timer-time').textContent = `${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
    $('#timer-label').textContent = left > 0 ? 'Rest' : 'Go — next set';
    $('#timer-fill').style.width = `${Math.max(0, Math.min(100, (1 - left / timer.total) * 100))}%`;
    if (left <= 0 && !el.classList.contains('over')) {
      el.classList.add('over');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      beep();
    }
    if (left < -120) stopTimer();
  }
  function stopTimer() {
    clearInterval(timer.int);
    $('#timer').classList.add('hidden');
    document.body.classList.remove('timer-on');
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (e) { /* audio unavailable */ }
  }
  $('#timer').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-timer]');
    if (!b) return;
    const v = b.dataset.timer;
    if (v === 'skip') return stopTimer();
    timer.end += Number(v) * 1000;
    timer.total = Math.max(timer.total, (timer.end - Date.now()) / 1000);
    $('#timer').classList.remove('over');
    tickTimer();
  });

  // ---------- onboarding ----------
  const GOAL_CHOICES = [
    ['build', '💪', 'Build muscle', 'Small calorie surplus. Gain size and strength while staying lean.'],
    ['recomp', '⚖️', 'Build & lean out', 'Around maintenance. Add muscle while slowly losing fat.'],
    ['shred', '🔥', 'Get shredded', 'Calorie deficit plus more cardio. Lose fat and keep your muscle.'],
  ];
  const onboard = { goal: 'recomp', unit: 'lb' };
  function showOnboarding() {
    onboard.goal = state.settings.goal || 'recomp';
    onboard.unit = state.settings.unit || 'lb';
    renderSheet();
    $('#sheet').classList.remove('hidden');
    document.body.classList.add('sheet-open');
  }
  function renderSheet() {
    const bw = latestBw();
    $('#sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="eyebrow">Quick setup</div>
      <h1 id="ob-title">What's the goal?</h1>
      <p class="muted">This sets your calorie, protein, step and cardio targets. You can change it any time in Plan.</p>
      ${GOAL_CHOICES.map(([k, i, t, d]) => `<button class="choice ${onboard.goal === k ? 'on' : ''}" data-ob-goal="${k}"><span class="ci">${i}</span><span><b>${t}</b><span>${d}</span></span></button>`).join('')}
      <div class="row between" style="margin-top:16px">
        <label class="field grow">Body weight<input id="ob-bw" class="input" inputmode="decimal" placeholder="e.g. ${onboard.unit === 'kg' ? '82' : '180'}" value="${bw ? esc(bw.weight) : ''}"></label>
        <div class="seg" style="margin-top:18px">${['lb', 'kg'].map((u) => `<button data-ob-unit="${u}" class="${onboard.unit === u ? 'on' : ''}">${u}</button>`).join('')}</div>
      </div>
      <button class="btn lg block" style="margin-top:20px" data-ob-done>Let's go</button>
    </div>`;
  }
  $('#sheet').addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-ob-goal]');
    const u = ev.target.closest('[data-ob-unit]');
    if (g || u) {
      const bwVal = $('#ob-bw').value;
      if (g) onboard.goal = g.dataset.obGoal;
      if (u) onboard.unit = u.dataset.obUnit;
      renderSheet();
      $('#ob-bw').value = bwVal;
      return;
    }
    if (ev.target.closest('[data-ob-done]')) {
      const w = parseFloat($('#ob-bw').value);
      state.settings.goal = onboard.goal;
      state.settings.unit = onboard.unit;
      state.settings.onboarded = true;
      if (!state.settings.blockStart) state.settings.blockStart = L.ymd(L.weekStart(today()));
      if (w) {
        state.bodyweight = state.bodyweight.filter((x) => x.date !== todayStr());
        state.bodyweight.push({ date: todayStr(), weight: w });
      }
      save();
      $('#sheet').classList.add('hidden');
      document.body.classList.remove('sheet-open');
      render();
    }
  });

  // ---------- TODAY ----------
  function startSession(date, dayKey) {
    const day = state.program.days[dayKey];
    const deload = block().deload;
    const session = {
      id: uid(),
      date,
      dayKey: Number(dayKey),
      dayName: day.name,
      deload,
      startedAt: Date.now(),
      completedAt: null,
      notes: '',
      exercises: day.exercises.map((e) => {
        const sg = suggestionFor(e, date, deload);
        const n = deload ? L.deloadSets(e.sets) : e.sets;
        return {
          exId: e.id,
          name: e.name,
          cue: e.cue || '',
          target: { sets: n, repMin: e.repMin, repMax: e.repMax, kind: e.kind },
          suggestion: sg,
          sets: Array.from({ length: n }, () => ({ weight: sg.weight ?? '', reps: '', done: false })),
        };
      }),
    };
    state.sessions.push(session);
    save();
    return session;
  }

  function prevSets(name, date) {
    const p = L.lastLogFor(state.sessions, name, date);
    if (!p) return [];
    return p.log.sets.map((s) => (s.done && s.reps ? `${s.weight ? s.weight + '×' : ''}${s.reps}` : '–'));
  }
  const exDone = (ex) => ex.sets.length > 0 && ex.sets.every((s) => s.done);
  function activeIndex(session) {
    if (ui.active[session.id] != null) return ui.active[session.id];
    const i = session.exercises.findIndex((e) => !exDone(e));
    return i === -1 ? null : i;
  }

  function dayKeys() {
    return L.orderedKeys(state.program);
  }
  const usualLabel = (day) => (day && day.usual ? `usually ${DOW_LONG[day.usual]}` : 'any day');

  function weekStatus() {
    const d = today();
    const ws = L.weekStart(d);
    const wk = sessionsInWeek(ws);
    const doneBy = {};
    for (const s of wk) if (s.completedAt && state.program.days[s.dayKey]) doneBy[s.dayKey] = s;
    const keys = dayKeys();
    const doneCount = keys.filter((k) => doneBy[k]).length;
    return { ws, doneBy, keys, doneCount, total: keys.length };
  }

  /** Unfinished workouts from an earlier day (e.g. forgot to tap Finish). */
  function staleSessions() {
    const t = todayStr();
    return state.sessions.filter((s) => !s.completedAt && s.date < t);
  }

  /** Which workout the Workout tab shows: your pick, else today's session, else the next one in the rotation. */
  function selection() {
    const date = todayStr();
    const ws = weekStatus();
    const next = L.nextWorkout(state.program, Object.keys(ws.doneBy));
    let key = ui.todayDay != null && state.program.days[ui.todayDay] ? String(ui.todayDay) : null;
    if (key == null) {
      const todays = state.sessions.filter((s) => s.date === date && state.program.days[s.dayKey]);
      const pick = todays.find((s) => !s.completedAt) || todays[todays.length - 1];
      if (pick) key = String(pick.dayKey);
    }
    if (key == null) key = next;
    return { key, next, ...ws };
  }

  function stripHtml() {
    const ts = todayStr();
    const { ws } = weekStatus();
    let h = `<div class="strip" aria-label="This week">`;
    for (let i = 1; i <= 7; i++) {
      const dd = L.addDays(ws, i - 1);
      const ds = L.ymd(dd);
      const trained = state.sessions.some((s) => s.date === ds && s.completedAt);
      const partial = !trained && state.sessions.some((s) => s.date === ds);
      let cls = 'rest';
      let mark = '';
      if (trained) { cls = 'done'; mark = '✓'; }
      else if (partial) { cls = 'partial'; mark = '•'; }
      if (ds === ts) cls += ' today';
      h += `<div class="sd ${cls}">${DOW[i]}<span class="n">${dd.getDate()}</span><span class="st">${mark}</span></div>`;
    }
    return h + `</div>`;
  }

  function workoutChips(sel, doneBy) {
    return `<div class="chips" style="margin:0 0 12px" role="tablist" aria-label="Choose a workout">${dayKeys().map((k) => {
      const done = doneBy[k];
      return `<button class="chip ${String(k) === String(sel) ? 'on' : ''}" data-act="pick-day" data-day="${k}">${done ? '✓ ' : ''}${esc(state.program.days[k].name)}</button>`;
    }).join('')}</div>`;
  }

  function staleBanner() {
    return staleSessions().map((s) => `<div class="banner warn"><span class="bi">⏸</span><div><strong>Unfinished: ${esc(s.dayName)} from ${esc(prettyDate(s.date))}</strong>${L.sessionSetCount(s)} sets logged. Save it to keep it in your history and your week.
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="finish-stale" data-id="${s.id}">Save as done</button><button class="btn ghost sm" data-act="delete-stale" data-id="${s.id}">Delete</button></div></div></div>`).join('');
  }

  function blockBanner() {
    const b = block();
    if (b.deload) {
      return `<div class="banner warn"><span class="bi">🧘</span><div><strong>Deload week (week 6 of 6)</strong>Fewer sets and lighter effort this week. This is where the muscle you built shows up. Next week starts a new 6-week cycle.</div></div>`;
    }
    return '';
  }

  function renderToday() {
    const d = today();
    const dow = L.isoDow(d);
    const date = todayStr();
    const { key: dayKey, next, doneBy, doneCount, total } = selection();
    const b = block();

    let html = stripHtml() + (ui.migrated ? migratedBanner() : '') + staleBanner();

    if (dayKey == null) {
      html += `<div class="card hero"><div class="eyebrow">${DOW_LONG[dow]} · ${doneCount}/${total} done</div><h1>Week complete 🎉</h1>
        <p class="muted">All ${total} workouts are done. Muscle grows while you recover, so eat your protein, sleep 7–9 hours and get your steps in.</p>
        <div class="meta"><span class="pill accent">Cycle week ${b.week} of ${b.total}</span><span class="pill">${fmt(L.GOALS[goal()].steps)} steps a day</span></div></div>
        <div class="card"><h3>Feeling good?</h3><p class="muted small">An extra session is optional. Pick the one you want to bring up most.</p>
        <div class="row wrap" style="margin-top:10px">${dayKeys().map((k) => `<button class="btn outline sm" data-act="pick-day" data-day="${k}">${esc(state.program.days[k].name)}</button>`).join('')}</div></div>`;
      html += cardioCard(date);
      $('#view').innerHTML = html;
      return;
    }

    html += workoutChips(dayKey, doneBy);
    const day = state.program.days[dayKey];
    const session = findSession(date, dayKey);

    if (!session) {
      html += blockBanner();
      const isNext = String(dayKey) === String(next);
      const doneEarlier = doneBy[dayKey];
      if (doneEarlier) {
        html += `<div class="banner good"><span class="bi">✓</span><div><strong>You already did ${esc(day.name)} on ${esc(prettyDate(doneEarlier.date))}</strong>${next ? `Next up is ${esc(state.program.days[next].name)}. You can still repeat this one if you want.` : 'You can repeat it as a bonus session.'}</div></div>`;
      }
      if (day.exercises.every((e) => !L.lastLogFor(state.sessions, e.name, date))) {
        html += `<div class="banner"><span class="bi">🧭</span><div><strong>First time doing this workout</strong>Pick weights you could lift for 1–2 more reps than the target. The app remembers them and tells you when to go heavier.</div></div>`;
      }
      const sets = day.exercises.reduce((a, e) => a + (b.deload ? L.deloadSets(e.sets) : Number(e.sets)), 0);
      const mins = L.estimateMinutes(day.exercises.map((e) => ({ ...e, sets: b.deload ? L.deloadSets(e.sets) : e.sets })), state.settings);
      const eyebrow = isNext ? `Up next · workout ${doneCount + 1} of ${total} this week` : `Workout · ${usualLabel(day)}`;
      html += `<div class="card hero">
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h1>${esc(day.name)}</h1>
        ${day.focus ? `<div class="muted">${esc(day.focus)}</div>` : ''}
        <div class="meta"><span class="pill">${day.exercises.length} exercises</span><span class="pill">${sets} sets</span><span class="pill">≈ ${mins} min</span><span class="pill accent">Cycle wk ${b.week}/${b.total}</span></div>
        <ul class="plan-list">${day.exercises.map((e, i) => {
          const sg = suggestionFor(e, date, b.deload);
          const n = b.deload ? L.deloadSets(e.sets) : e.sets;
          const w = sg.weight ? `${fmt(sg.weight, 1)} ${unit()} · ` : '';
          return `<li><span class="idx">${i + 1}</span><div class="grow"><div class="pl-name">${esc(e.name)}</div><div class="pl-sub">${w}${n} × ${repText(e)} reps</div></div>${sg.action === 'start' ? '' : badge(sg)}</li>`;
        }).join('')}</ul>
      </div>
      <button class="btn lg block" data-act="start" data-day="${dayKey}">Start workout</button>
      <p class="muted small" style="text-align:center;margin-top:10px">Train on whichever days work for you. The app just keeps your 3 workouts in order.</p>`;
      $('#view').innerHTML = html;
      return;
    }

    if (session.completedAt) {
      html += summaryCard(session);
      if (next) {
        const nd = state.program.days[next];
        html += `<div class="card row"><span class="idx">${doneCount + 1}</span><div class="grow"><div class="tiny muted">Up next · whenever you're back</div><div style="font-weight:700">${esc(nd.name)}</div></div><span class="small muted">${doneCount}/${total} done</span></div>`;
      } else {
        html += `<div class="banner good"><span class="bi">🎉</span><div><strong>That's all ${total} workouts this week</strong>Recover well and keep your steps up.</div></div>`;
      }
      html += cardioCard(date);
      html += `<button class="btn outline block" data-act="reopen" data-id="${session.id}">Edit this workout</button>`;
      $('#view').innerHTML = html;
      return;
    }

    // ----- in progress -----
    const doneSets = L.sessionSetCount(session);
    const totalSets = session.exercises.reduce((a, e) => a + e.sets.length, 0);
    const exCompleted = session.exercises.filter(exDone).length;
    const act = activeIndex(session);
    html += `<div class="progress-head">
      <div class="row between" style="margin-bottom:8px"><div><strong>${esc(session.dayName)}</strong>${session.deload ? ' <span class="pill warn">Deload</span>' : ''}</div>
      <div class="small muted num">${exCompleted}/${session.exercises.length} exercises · ${doneSets}/${totalSets} sets</div></div>
      <div class="bar"><span style="width:${totalSets ? (doneSets / totalSets) * 100 : 0}%"></span></div></div>`;

    session.exercises.forEach((ex, ei) => {
      const done = exDone(ex);
      const isActive = ei === act;
      const sg = ex.suggestion || {};
      const nDone = ex.sets.filter((s) => s.done).length;
      const summary = done
        ? L.completedSets(ex).map((s) => `${s.weight ? s.weight + '×' : ''}${s.reps}`).join(' · ')
        : `${nDone ? `${nDone}/${ex.sets.length} sets · ` : ''}${ex.target.sets} × ${repText(ex.target)}${sg.weight ? ` @ ${fmt(sg.weight, 1)} ${unit()}` : ''}`;
      html += `<div class="card ex ${isActive ? 'active' : ''} ${done ? 'complete' : ''}" id="ex-${ei}">
        <button class="ex-head" data-act="expand" data-ei="${ei}" aria-expanded="${isActive}">
          <span class="idx ${done ? 'done' : isActive ? 'active' : ''}">${done ? '✓' : ei + 1}</span>
          <div class="grow"><div>${esc(ex.name)}</div><div class="small muted num">${esc(summary)}</div></div>
          ${isActive || done || sg.action === 'start' ? '' : badge(sg)}
        </button>`;
      if (isActive) html += exerciseBody(session, ex, ei);
      html += `</div>`;
    });

    const allDone = session.exercises.every(exDone);
    html += `<label class="field" style="margin-top:16px">Notes (optional)<textarea class="input" rows="2" data-f="notes" placeholder="Energy, sleep, anything that felt off…">${esc(session.notes)}</textarea></label>
      <button class="btn lg block ${allDone ? '' : 'outline'}" style="margin-top:14px" data-act="finish" data-id="${session.id}">${allDone ? 'Finish workout 🎉' : 'Finish early'}</button>
      <div style="text-align:center;margin-top:6px"><button class="link small" style="color:var(--bad)" data-act="discard" data-id="${session.id}">Discard workout</button></div>`;
    $('#view').innerHTML = html;
  }

  function exerciseBody(session, ex, ei) {
    const sg = ex.suggestion || {};
    const prev = prevSets(ex.name, session.date);
    const kind = ex.target.kind;
    const nextIdx = ex.sets.findIndex((s) => !s.done);
    const weightTxt = sg.weight ? `${fmt(sg.weight, 1)} ${unit()}` : kind === 'bw' ? 'Bodyweight' : 'Choose a weight';
    const firstWorking = Number(ex.sets[0] && ex.sets[0].weight) || sg.weight;
    const wu = L.warmups(firstWorking, unit(), kind);
    const cueOpen = ui.cue[`${session.id}:${ei}`];
    let h = `<div class="ex-body">
      <div class="target">
        <div class="row between top"><div class="tiny muted">Today's target</div>${badge(sg)}</div>
        <div class="target-main"><span class="target-w">${esc(weightTxt)}</span><span class="target-r">× ${repText(ex.target)} reps · ${ex.target.sets} sets</span></div>
        ${sg.text ? `<div class="target-why">${esc(sg.text)}</div>` : ''}
        <div class="effort"><span>🎯</span><span>${esc(L.effortText(kind))}</span><span class="muted">· rest ${Math.round(L.restFor(kind, state.settings) / 60 * 2) / 2} min</span></div>
      </div>`;
    if (ex.cue) {
      h += cueOpen
        ? `<div class="cue"><div class="row between"><strong>Form tip</strong><button class="link small" data-act="cue" data-ei="${ei}">Hide</button></div>${esc(ex.cue)}</div>`
        : `<button class="link small" style="margin:-4px 0 6px" data-act="cue" data-ei="${ei}">ⓘ Form tip</button>`;
    }
    if (wu.length) {
      h += `<details class="warm"><summary>Warm-up sets (${wu.length}) — don't log these</summary><div class="warm-list">${wu.map((w) => `<span class="pill">${w.weight} × ${w.reps}</span>`).join('')}</div></details>`;
    }
    h += `<table class="sets"><thead><tr><th>Set</th><th>Last time</th><th>${kind === 'bw' ? '+' + unit() : unit()}</th><th>Reps</th><th>Done</th></tr></thead><tbody>` +
      ex.sets.map((s, si) => `<tr class="${s.done ? 'done' : ''} ${si === nextIdx ? 'next' : ''}">
        <td class="setno">${si + 1}</td>
        <td class="prev num">${esc(prev[si] || '–')}</td>
        <td><input inputmode="decimal" data-f="weight" data-ei="${ei}" data-si="${si}" value="${esc(s.weight)}" placeholder="${kind === 'bw' ? '0' : '—'}" aria-label="Set ${si + 1} weight"></td>
        <td><input inputmode="numeric" data-f="reps" data-ei="${ei}" data-si="${si}" value="${esc(s.reps)}" placeholder="${esc(sg.targetReps ?? ex.target.repMin)}" aria-label="Set ${si + 1} reps"></td>
        <td><button class="check ${s.done ? 'on' : ''}" data-act="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Mark set ${si + 1} done">✓</button></td>
      </tr>`).join('') +
      `</tbody></table>
      <div class="row between" style="margin-top:8px">
        <div class="row"><button class="btn ghost sm" data-act="add-set" data-ei="${ei}">+ Set</button>
        ${ex.sets.length > 1 ? `<button class="btn ghost sm" data-act="rm-set" data-ei="${ei}">− Set</button>` : ''}</div>
      </div></div>`;
    return h;
  }

  function summaryCard(session) {
    const vol = L.sessionVolume(session);
    const sets = L.sessionSetCount(session);
    const mins = session.completedAt && session.startedAt ? Math.round((session.completedAt - session.startedAt) / 60000) : null;
    const prs = [];
    for (const ex of session.exercises) {
      const hist = L.exerciseHistory(state.sessions.filter((s) => s.date < session.date || s.id === session.id), ex.name);
      const mine = hist.find((h) => h.date === session.date);
      const before = hist.filter((h) => h.date < session.date);
      if (mine && before.length && mine.e1rm > 0 && mine.e1rm > Math.max(...before.map((h) => h.e1rm))) {
        prs.push(`<li class="row between"><span>${esc(ex.name)}</span><span class="num"><strong>${mine.weight} × ${mine.reps}</strong></span></li>`);
      }
    }
    return `<div class="card hero">
      <div class="eyebrow">Workout complete</div>
      <h1>${esc(session.dayName)} ✓</h1>
      <div class="stats" style="margin-top:12px;grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="v">${fmt(sets)}</div><div class="l">sets</div></div>
        <div class="stat"><div class="v">${vol >= 10000 ? fmt(vol / 1000, 1) + 'k' : fmt(vol)}</div><div class="l">${unit()} lifted</div></div>
        <div class="stat"><div class="v">${mins != null && mins < 300 ? mins : '–'}</div><div class="l">minutes</div></div>
      </div>
      ${prs.length ? `<h2 style="margin-top:18px">🏆 New personal records</h2><ul class="list">${prs.join('')}</ul>` : ''}
      ${session.notes ? `<p class="muted small" style="margin-top:12px">“${esc(session.notes)}”</p>` : ''}
    </div>`;
  }

  function cardioCard(date) {
    const g = L.GOALS[goal()];
    const todays = state.cardio.filter((c) => c.date === date);
    const weekMin = cardioInWeek(L.weekStart(today()));
    const pct = Math.min(100, (weekMin / g.cardio) * 100);
    return `<div class="card">
      <div class="row between"><h3>Cardio</h3><span class="small muted num">${weekMin}/${g.cardio} min this week</span></div>
      <div class="bar ${pct >= 100 ? 'good' : ''}" style="margin:10px 0"><span style="width:${pct}%"></span></div>
      <p class="muted small">${goal() === 'shred'
        ? 'For fat loss: 3–4 sessions of 30–40 min at an easy pace where you can still talk (incline walk or bike), plus at most one HIIT session. Do it after lifting or on rest days.'
        : 'For heart health and recovery: 2–3 easy 20–30 min sessions. Keep it easy so it doesn’t eat into your lifting.'}</p>
      <div class="row" style="margin-top:10px">
        <select class="input grow" id="cardio-type" aria-label="Cardio type"><option>Walk</option><option>Bike</option><option>Run</option><option>Row</option><option>HIIT</option><option>Other</option></select>
        <input class="input" id="cardio-min" inputmode="numeric" placeholder="Min" aria-label="Minutes" style="width:76px;flex:none">
        <button class="btn sm" data-act="add-cardio">Log</button>
      </div>
      ${todays.length ? `<ul class="list" style="margin-top:6px">${todays.map((c) => `<li class="row between"><span>${esc(c.type)} · ${c.minutes} min</span><button class="icon-btn" data-act="rm-cardio" data-id="${c.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  // ---------- WEEK ----------
  function renderWeek() {
    const d = today();
    const ts = todayStr();
    const { ws, doneBy, keys, total } = weekStatus();
    const b = block();
    const lastWk = sessionsInWeek(L.addDays(ws, -7)).filter((s) => s.completedAt);
    const done = Object.values(doneBy);
    const g = L.GOALS[goal()];

    let html = `<div class="eyebrow">Week of ${esc(ws.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))}</div><h1>This week</h1>`;

    // cycle
    html += `<div class="card">
      <div class="row between"><h3>${b.deload ? 'Deload week' : `Building · week ${b.week} of ${b.total - 1}`}</h3><span class="pill ${b.deload ? 'warn' : 'accent'}">Cycle ${b.block}</span></div>
      <div class="block-track">${Array.from({ length: b.total }, (_, i) => `<span class="${i + 1 < b.week ? 'past' : i + 1 === b.week ? 'now' : ''} ${i + 1 === b.total ? 'deload' : ''}"></span>`).join('')}</div>
      <p class="muted small" style="margin-bottom:0">${b.deload ? 'Lighter week: fewer sets and easier effort. Your recovery catches up so next cycle starts stronger.' : `Push to add weight or reps every week. Week 6 is a lighter deload week, ${b.total - b.week} week${b.total - b.week === 1 ? '' : 's'} away.`}</p>
    </div>`;

    // workouts this week
    const daysLeft = 8 - L.isoDow(d); // including today
    const remaining = keys.filter((k) => !doneBy[k]);
    const nextKey = remaining[0];
    html += `<div class="card flush"><ul class="day-list">`;
    keys.forEach((k, i) => {
      const day = state.program.days[k];
      const s = doneBy[k];
      const inProg = !s && sessionsInWeek(ws).some((x) => String(x.dayKey) === String(k) && !x.completedAt);
      let cls = '', sub = '';
      if (s) { cls = 'done'; sub = `Done ${prettyDate(s.date)} · ${L.sessionSetCount(s)} sets · ${fmt(L.sessionVolume(s))} ${unit()}`; }
      else if (inProg) { cls = 'partial'; sub = 'In progress'; }
      else { const lead = day.exercises[0]; sub = `${String(k) === String(nextKey) ? 'Up next' : 'To do'} · ${usualLabel(day)}${lead ? ` · starts with ${lead.name}` : ''}`; }
      html += `<li class="${!s && String(k) === String(nextKey) ? 'is-today' : ''}"><span class="dl-badge ${cls}">${s ? '✓' : i + 1}</span><div class="grow"><div style="font-weight:700">${esc(day.name)}</div><div class="small muted">${esc(sub)}</div></div></li>`;
    });
    html += `</ul></div>`;
    if (remaining.length && remaining.length > daysLeft) {
      html += `<div class="banner warn"><span class="bi">⏳</span><div><strong>${remaining.length} workouts left, ${daysLeft} day${daysLeft === 1 ? '' : 's'} left this week</strong>Do the next one in line. Whatever you miss simply waits for next week, so nothing breaks.</div></div>`;
    } else if (!remaining.length) {
      html += `<div class="banner good"><span class="bi">🎉</span><div><strong>All ${total} workouts done this week</strong>Nice work. Recovery, steps and protein are your job until Monday.</div></div>`;
    }

    // stats
    const vol = done.reduce((a, s) => a + L.sessionVolume(s), 0);
    const lastVol = lastWk.reduce((a, s) => a + L.sessionVolume(s), 0);
    const sets = done.reduce((a, s) => a + L.sessionSetCount(s), 0);
    const streak = L.weekStreak(state.sessions, d, keys);
    const delta = lastVol && vol ? Math.round(((vol - lastVol) / lastVol) * 100) : null;
    const cardioMin = cardioInWeek(ws);
    html += `<div class="stats">
      <div class="stat"><div class="v">${done.length}<span class="muted" style="font-size:16px">/${total}</span></div><div class="l">workouts</div></div>
      <div class="stat"><div class="v">${streak}</div><div class="l">full-week streak 🔥</div></div>
      <div class="stat"><div class="v">${vol >= 10000 ? fmt(vol / 1000, 1) + 'k' : fmt(vol)}</div><div class="l">${unit()} lifted ${delta != null ? `<span class="${delta >= 0 ? 'good-t' : 'bad-t'}">${delta >= 0 ? '▲' : '▼'}${Math.abs(delta)}%</span>` : ''}</div></div>
      <div class="stat"><div class="v">${cardioMin}<span class="muted" style="font-size:16px">/${g.cardio}</span></div><div class="l">cardio min</div></div>
    </div>`;

    // nutrition targets
    const bw = latestBw();
    const n = bw ? L.nutrition(Number(bw.weight), unit(), goal(), total) : null;
    html += `<h2>Daily targets · ${esc(g.label)}</h2>`;
    if (n) {
      html += `<div class="card">
        <div class="row between"><div><div class="v" style="font-size:28px;font-weight:850" class="num">${fmt(n.kcal)}</div><div class="small muted">calories / day <span class="muted">(maintenance ≈ ${fmt(n.maintenance)})</span></div></div><button class="link small" data-act="edit-goal">Change goal</button></div>
        <div class="macro"><div><b>${n.protein}g</b><span>Protein</span></div><div><b>${n.carbs}g</b><span>Carbs</span></div><div><b>${n.fat}g</b><span>Fat</span></div><div><b>${fmt(n.steps / 1000)}k</b><span>Steps</span></div></div>
        <p class="muted small" style="margin-bottom:0">These are starting estimates. The weekly check-in below tells you when to adjust them.</p>
      </div>`;
    } else {
      html += `<div class="card"><p class="muted" style="margin:0 0 10px">Log your body weight to get calorie and protein targets.</p><button class="btn sm" data-act="edit-goal">Set goal & weight</button></div>`;
    }

    // check-in
    const trend = L.weightTrend(state.bodyweight, d);
    const verdict = L.checkIn(trend, goal());
    html += `<h2>Weekly check-in</h2><div class="card">`;
    if (trend) {
      const sign = trend.change > 0 ? '+' : '';
      html += `<div class="row between"><div><div style="font-size:24px;font-weight:850" class="num">${sign}${fmt(trend.change, 1)} ${unit()}</div><div class="small muted">7-day average vs the week before (${sign}${fmt(trend.pct, 2)}%)</div></div>
        <span class="pill ${verdict.status === 'on' ? 'good' : 'warn'}">${verdict.status === 'on' ? 'On track' : verdict.status === 'fast' ? 'Too fast' : 'Too slow'}</span></div>
        <p style="margin-bottom:0">${esc(verdict.text)}</p>
        <p class="muted small" style="margin-bottom:0">Target: ${g.rate[0] > 0 ? '+' : ''}${g.rate[0]}% to ${g.rate[1] > 0 ? '+' : ''}${g.rate[1]}% of body weight per week.</p>`;
    } else {
      html += `<p class="muted small" style="margin-top:0">Weigh in first thing in the morning 3+ times a week. After two weeks you'll get a verdict here: on track, too fast or too slow, plus exactly what to change.</p>`;
    }
    html += `<div class="row" style="margin-top:10px"><input class="input" id="bw-input" inputmode="decimal" placeholder="Today's weight (${unit()})"><button class="btn sm" data-act="log-bw">Log</button></div>
      ${bw ? `<p class="muted small" style="margin-bottom:0">Last: ${bw.weight} ${unit()} · ${esc(prettyDate(bw.date))}</p>` : ''}</div>`;

    // sets per muscle
    const idx = muscleIndex();
    const planned = {};
    for (const day of Object.values(state.program.days)) for (const e of day.exercises) { const m = groupOf(e.muscle || day.name); planned[m] = (planned[m] || 0) + Number(e.sets); }
    const actual = {};
    for (const s of done) for (const e of s.exercises) {
      const m = idx[e.name.toLowerCase()] || s.dayName;
      actual[m] = (actual[m] || 0) + L.completedSets(e).length;
    }
    const muscles = Object.keys(planned).sort((a, b2) => planned[b2] - planned[a]);
    html += `<h2>Sets per muscle</h2><div class="card"><p class="muted small" style="margin-top:0">Sets done vs planned this week. For growth, aim for 10–20 hard sets per muscle each week.</p>` +
      muscles.map((m) => {
        const a = actual[m] || 0, p = planned[m];
        return `<div class="mrow"><div class="row between small"><span style="font-weight:650">${esc(m)}</span><span class="num muted">${a} / ${p}</span></div><div class="bar ${a >= p ? 'good' : ''}"><span style="width:${Math.min(100, (a / Math.max(p, 1)) * 100)}%"></span></div></div>`;
      }).join('') + `</div>`;

    $('#view').innerHTML = html;
  }

  // ---------- PROGRESS ----------
  function lineChart(points, { yLabel = '', w = 600, h = 220 } = {}) {
    if (points.length < 2) return `<p class="muted small">Log at least two sessions to see a trend.</p>`;
    const pad = { l: 44, r: 12, t: 12, b: 26 };
    const ys = points.map((p) => p.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    min -= span * 0.1; max += span * 0.1;
    const x = (i) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    const area = `${path} L${x(points.length - 1).toFixed(1)},${h - pad.b} L${x(0).toFixed(1)},${h - pad.b} Z`;
    const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
    const idxLabels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)} trend">
      ${ticks.map((t) => `<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke-dasharray="3 4"/><text class="lbl" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
      <path class="area" d="${area}"/><path class="ln" d="${path}"/>
      ${points.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.y)}" r="3.5"><title>${esc(p.label)}: ${fmt(p.y, 1)}</title></circle>`).join('')}
      ${idxLabels.map((i) => `<text class="lbl" x="${x(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(points[i].label)}</text>`).join('')}
    </svg>`;
  }

  function renderProgress() {
    const done = state.sessions.filter((s) => s.completedAt);
    const names = [];
    const seen = new Set();
    for (const k of dayKeys()) for (const e of state.program.days[k].exercises) {
      if (!seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); names.push(e.name); }
    }
    for (const s of done) for (const e of s.exercises) if (!seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); names.push(e.name); }
    if (!ui.progressEx || !seen.has(ui.progressEx.toLowerCase())) ui.progressEx = names[0];

    let html = `<div class="eyebrow">${done.length} workouts logged</div><h1>Progress</h1>`;

    // Main lifts
    const prRows = [];
    for (const k of dayKeys()) {
      const main = state.program.days[k].exercises[0];
      if (!main) continue;
      const h = L.exerciseHistory(state.sessions, main.name);
      if (!h.length) {
        prRows.push(`<li class="row between"><div><strong>${esc(main.name)}</strong><div class="muted small">${esc(state.program.days[k].name)} · not logged yet</div></div><span class="muted">–</span></li>`);
        continue;
      }
      const best = h.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
      const first = h[0];
      const gain = first.e1rm ? Math.round(((best.e1rm - first.e1rm) / first.e1rm) * 100) : 0;
      prRows.push(`<li class="row between" data-act="pick-ex" data-name="${esc(main.name)}" style="cursor:pointer"><div><strong>${esc(main.name)}</strong><div class="muted small">Best: ${best.weight ? `${best.weight} × ${best.reps}` : `${best.maxReps} reps`} · ${esc(shortDate(best.date))}</div></div><div style="text-align:right"><div class="num"><strong>${best.weight ? fmt(best.e1rm) : best.maxReps}</strong> <span class="muted small">${best.weight ? unit() : 'reps'}</span></div>${gain > 0 ? `<div class="small good-t">▲ ${gain}% since start</div>` : ''}</div></li>`);
    }
    html += `<h2>Main lifts · estimated 1-rep max</h2><div class="card"><ul class="list">${prRows.join('')}</ul></div>`;

    // Exercise chart
    const hist = L.exerciseHistory(state.sessions, ui.progressEx);
    const isBw = hist.length && hist.every((h) => !h.weight);
    html += `<h2>Any exercise</h2><div class="card">
      <select class="input" data-f="progress-ex" aria-label="Exercise">${names.map((n) => `<option ${n === ui.progressEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div class="muted small" style="margin:12px 0 4px">${isBw ? 'Best set (reps)' : `Estimated 1-rep max (${unit()})`}</div>
      ${lineChart(hist.map((h) => ({ y: isBw ? h.maxReps : h.e1rm, label: shortDate(h.date) })), { yLabel: ui.progressEx })}
      ${hist.length ? `<ul class="list" style="margin-top:8px">${hist.slice(-5).reverse().map((h) => `<li class="row between small"><span>${esc(prettyDate(h.date))}</span><span class="num">${h.weight ? `${h.weight} ${unit()} × ${h.reps}` : `${h.maxReps} reps`}${h.weight ? ` · e1RM ${fmt(h.e1rm)}` : ''}</span></li>`).join('')}</ul>` : ''}
    </div>`;

    // body weight
    const bw = [...state.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1));
    html += `<h2>Body weight</h2><div class="card">${lineChart(bw.map((b) => ({ y: Number(b.weight), label: shortDate(b.date) })), { yLabel: 'Body weight' })}
      ${bw.length ? `<ul class="list" style="margin-top:8px">${bw.slice(-5).reverse().map((b) => `<li class="row between small"><span>${esc(prettyDate(b.date))}</span><span class="row"><span class="num">${b.weight} ${unit()}</span><button class="icon-btn" data-act="rm-bw" data-date="${b.date}" aria-label="Remove">✕</button></span></li>`).join('')}</ul>` : ''}</div>`;

    // history
    const sorted = [...done].sort((a, b) => (a.date < b.date ? 1 : -1));
    html += `<h2>History</h2>`;
    if (!sorted.length) html += `<div class="card"><p class="muted" style="margin:0">No workouts yet. Your first one is on the Workout tab.</p></div>`;
    for (const s of sorted.slice(0, 40)) {
      html += `<details class="card"><summary><span>${esc(prettyDate(s.date))} · ${esc(s.dayName)}${s.deload ? ' <span class="pill warn">Deload</span>' : ''}<div class="small muted" style="font-weight:500">${L.sessionSetCount(s)} sets · ${fmt(L.sessionVolume(s))} ${unit()}</div></span></summary>
        <ul class="list" style="margin-top:8px">${s.exercises.map((e) => {
          const cs = L.completedSets(e);
          return `<li class="small"><strong>${esc(e.name)}</strong><div class="muted num">${cs.length ? cs.map((x) => `${x.weight ? x.weight + '×' : ''}${x.reps}`).join(' · ') : 'skipped'}</div></li>`;
        }).join('')}</ul>
        ${s.notes ? `<p class="muted small">“${esc(s.notes)}”</p>` : ''}
        <div class="row between" style="margin-top:10px"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Date<input type="date" class="input" style="width:auto;min-height:36px;padding:4px 8px" data-f="session-date" data-id="${s.id}" value="${s.date}"></label>
        <button class="btn danger sm" data-act="delete-session" data-id="${s.id}">Delete</button></div>
      </details>`;
    }
    $('#view').innerHTML = html;
  }

  // ---------- PLAN ----------
  function migratedBanner() {
    return `<div class="banner good"><span class="bi">✨</span><div><strong>Switched to your 3-day plan</strong>${dayKeys().map((x) => esc(state.program.days[x].name)).join(' → ')}. All ${state.sessions.filter((x) => x.completedAt).length} logged workouts are kept, and this week's count toward your 3.
      <div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="dismiss-migrated">Got it</button></div></div></div>`;
  }

  function renderProgram() {
    if (!state.program.days[ui.programDay]) ui.programDay = dayKeys()[0];
    const k = ui.programDay;
    const day = state.program.days[k];
    const b = block();
    const s = state.settings;
    let html = `<div class="eyebrow">${esc(state.program.name)}</div><h1>Your plan</h1>`;

    if (ui.migrated) html += migratedBanner();

    // goal
    html += `<h2>Goal</h2>` + GOAL_CHOICES.map(([key, i, t, d]) => `<button class="choice ${goal() === key ? 'on' : ''}" data-act="set-goal" data-goal="${key}"><span class="ci">${i}</span><span><b>${t}</b><span>${d}</span></span></button>`).join('');

    // how the plan works
    html += `<h2>How this plan works</h2><div class="card stack small">
      <div class="row top"><span class="idx">1</span><div><strong>${dayKeys().length} workouts a week, on any days.</strong> ${dayKeys().map((x) => esc(state.program.days[x].name)).join(', then ')}. Go Mon/Tue/Wed or Mon/Thu/Sat: the Workout tab always gives you the next one you haven't done this week. Anything missed waits for next week.</div></div>
      <div class="row top"><span class="idx">2</span><div><strong>Add weight or reps every week.</strong> Hit the top of the rep range on every set and the app adds weight next time. Otherwise it keeps the weight and you aim for more reps.</div></div>
      <div class="row top"><span class="idx">3</span><div><strong>Make every set count.</strong> Each muscle is trained once a week, so each session has 9–12 hard sets for the big muscles. Stop 1–2 reps short on presses, squats and deadlifts; take the last set of accessory exercises to failure.</div></div>
      <div class="row top"><span class="idx">4</span><div><strong>6-week cycles.</strong> 5 weeks building, then 1 lighter deload week. You're in week ${b.week} of cycle ${b.block}.</div></div>
    </div>`;

    // editor
    html += `<h2>Edit workouts</h2><div class="chips" style="margin:0 0 10px">${dayKeys().map((d) => `<button class="chip ${String(d) === String(k) ? 'on' : ''}" data-act="prog-day" data-day="${d}">${esc(state.program.days[d].name)}</button>`).join('')}<button class="chip" data-act="add-day">+ Workout</button></div>`;
    html += `<div class="card"><div class="grid-ex" style="grid-template-columns:1.3fr 1fr;margin:0">
      <label class="field">Workout name<input data-f="day-name" value="${esc(day.name)}"></label>
      <label class="field">Usual day<select data-f="day-usual">${[[0, 'Any day'], ...[1, 2, 3, 4, 5, 6, 7].map((i) => [i, DOW_LONG[i]])].map(([v, l]) => `<option value="${v}" ${Number(day.usual || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="field" style="margin-top:8px">Focus<input data-f="day-focus" value="${esc(day.focus || '')}"></label>
      <p class="muted small" style="margin-bottom:0">The usual day only sets the order. You can still do any workout on any day.</p>
      ${dayKeys().length > 1 ? `<div style="text-align:right"><button class="link small" style="color:var(--bad)" data-act="rm-day">Remove this workout</button></div>` : ''}</div>`;
    day.exercises.forEach((e, i) => {
      html += `<details class="card"><summary><span class="row" style="gap:10px"><span class="idx">${i + 1}</span><span><span>${esc(e.name)}</span><div class="small muted" style="font-weight:500">${e.sets} × ${repText(e)} · ${KIND_LABEL[e.kind] || ''}${e.muscle ? ' · ' + esc(e.muscle) : ''}</div></span></span></summary>
        <div style="margin-top:12px">
          <label class="field">Exercise<input data-pf="name" data-i="${i}" value="${esc(e.name)}"></label>
          <div class="grid-ex">
            <label class="field">Sets<input inputmode="numeric" data-pf="sets" data-i="${i}" value="${e.sets}"></label>
            <label class="field">Min reps<input inputmode="numeric" data-pf="repMin" data-i="${i}" value="${e.repMin}"></label>
            <label class="field">Max reps<input inputmode="numeric" data-pf="repMax" data-i="${i}" value="${e.repMax ?? ''}" placeholder="fail"></label>
            <label class="field">Muscle<input data-pf="muscle" data-i="${i}" value="${esc(e.muscle || '')}"></label>
          </div>
          <label class="field" style="margin-top:8px">Type (sets rest time & weight jumps)<select data-pf="kind" data-i="${i}">
            ${Object.entries(KIND_LABEL).map(([v, l]) => `<option value="${v}" ${e.kind === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label class="field" style="margin-top:8px">Form tip<textarea rows="2" data-pf="cue" data-i="${i}">${esc(e.cue || '')}</textarea></label>
          <div class="row" style="margin-top:8px;justify-content:flex-end">
            <button class="icon-btn" data-act="move" data-i="${i}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" data-act="move" data-i="${i}" data-dir="1" aria-label="Move down" ${i === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn danger sm" data-act="rm-ex" data-i="${i}">Remove</button>
          </div>
        </div></details>`;
    });
    html += `<button class="btn outline block" data-act="add-ex">+ Add exercise</button>`;

    // settings
    html += `<h2>Settings</h2><div class="card stack">
      <div class="row between"><span style="font-weight:650">Units</span><div class="seg">${['lb', 'kg'].map((u) => `<button data-act="set-unit" data-unit="${u}" class="${s.unit === u ? 'on' : ''}">${u}</button>`).join('')}</div></div>
      <div class="divider"></div>
      <div class="grid-ex" style="grid-template-columns:1fr 1fr;margin:0">
        <label class="field">Rest, big lifts (sec)<input inputmode="numeric" data-sf="restCompound" value="${s.restCompound}"></label>
        <label class="field">Rest, accessories (sec)<input inputmode="numeric" data-sf="restIso" value="${s.restIso}"></label>
      </div>
      <div class="divider"></div>
      <div class="row between"><div><div style="font-weight:650">Training cycle</div><div class="small muted">Week ${b.week} of ${b.total}${b.deload ? ' (deload)' : ''}</div></div>
        <div class="row"><button class="btn ghost sm" data-act="cycle-restart">Restart</button><button class="btn ghost sm" data-act="cycle-deload">Deload now</button></div></div>
    </div>`;

    html += `<h2>Your data</h2><div class="card">
      <p class="muted small" style="margin-top:0">Your data is saved only in this browser on this device. Export a backup regularly, especially before clearing browser data or switching phones.</p>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn ghost sm" data-act="export">Export backup</button>
        <label class="btn ghost sm">Import backup (adds, never deletes)<input type="file" accept="application/json" id="import-file" hidden></label>
        <button class="btn danger sm" data-act="reset-program">Reset plan to default</button>
      </div>
    </div>`;

    html += guideHtml();
    $('#view').innerHTML = html;
  }

  function guideHtml() {
    return `<h2>Trainer notes</h2>
    <details class="card"><summary>Getting shredded without losing muscle</summary>
      <p class="small">1. <strong>Keep lifting heavy.</strong> Heavy weights are what tell your body to keep its muscle while you're in a deficit. Don't switch to light, high-rep "toning" work.<br>
      2. <strong>Protein ~1 g per lb</strong> of body weight, every day, spread over 3–5 meals.<br>
      3. <strong>A moderate deficit</strong> (about 500 kcal a day) to lose 0.5–1% of body weight a week. Losing faster costs muscle.<br>
      4. <strong>Steps first, cardio second.</strong> 8–10k steps a day burns a lot without hurting recovery. Add easy cardio after that.<br>
      5. <strong>Expect strength to hold, not climb</strong>, late in a cut. Matching last week's numbers counts as a win.</p>
    </details>
    <details class="card"><summary>Building muscle efficiently</summary>
      <p class="small">Eat a small surplus (+250 kcal a day) and aim to gain 0.25–0.5% of body weight a week. Bigger surpluses mostly add fat. Sleep 7–9 hours. The progress chart for your main lifts is the best sign it's working: they should keep going up most weeks.</p>
    </details>
    <details class="card"><summary>Warming up</summary>
      <p class="small">5 minutes of light cardio, then the warm-up sets shown on your first big lift (empty bar → ~50% → ~70% → ~85%). Accessories after that need at most one light set.</p>
    </details>
    <details class="card"><summary>When something hurts or stalls</summary>
      <p class="small">Joint pain (not muscle burn): swap to a similar machine or dumbbell version in Edit workouts. Stalled for two sessions: the app drops the weight about 10% for you. Exhausted all the time: take the deload week early with "Deload now" in Settings.</p>
    </details>`;
  }

  // ---------- events ----------
  document.querySelector('.tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    ui.tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    render();
    window.scrollTo(0, 0);
  });

  const view = $('#view');

  function currentSession() {
    const { key } = selection();
    return key == null ? null : findSession(todayStr(), key);
  }

  view.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.f === 'weight' || t.dataset.f === 'reps') {
      const s = currentSession();
      if (!s) return;
      s.exercises[t.dataset.ei].sets[t.dataset.si][t.dataset.f] = t.value.trim() === '' ? '' : Number(t.value) || t.value;
      save();
    } else if (t.dataset.f === 'notes') {
      const s = currentSession();
      if (s) { s.notes = t.value; save(); }
    } else if (t.dataset.f === 'day-name') {
      state.program.days[ui.programDay].name = t.value;
      save();
    } else if (t.dataset.f === 'day-usual') {
      state.program.days[ui.programDay].usual = Number(t.value) || null;
      save();
    } else if (t.dataset.f === 'session-date') {
      const sess = state.sessions.find((x) => x.id === t.dataset.id);
      if (sess && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { sess.date = t.value; save(); }
    } else if (t.dataset.f === 'day-focus') {
      state.program.days[ui.programDay].focus = t.value;
      save();
    } else if (t.dataset.pf) {
      const e = state.program.days[ui.programDay].exercises[t.dataset.i];
      const f = t.dataset.pf;
      if (['name', 'kind', 'cue', 'muscle'].includes(f)) e[f] = t.value;
      else if (f === 'repMax') e.repMax = t.value.trim() === '' ? null : Math.max(1, parseInt(t.value, 10) || 1);
      else e[f] = Math.max(1, parseInt(t.value, 10) || 1);
      save();
    } else if (t.dataset.sf) {
      state.settings[t.dataset.sf] = Math.max(10, parseInt(t.value, 10) || 60);
      save();
    }
  });

  view.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.f === 'progress-ex') { ui.progressEx = t.value; render(); }
    if (t.dataset.f === 'day-usual' || t.dataset.f === 'session-date') { render(); toast(t.dataset.f === 'session-date' ? 'Workout date changed' : 'Order updated'); }
    if (t.id === 'import-file' && t.files[0]) importFile(t.files[0]);
  });

  function nextLabel(ex, si, session, ei) {
    const nxt = ex.sets.findIndex((s, i) => i > si && !s.done);
    if (nxt !== -1) {
      const s = ex.sets[nxt];
      const reps = ex.suggestion?.targetReps ?? ex.target.repMin;
      return `Up next: set ${nxt + 1} · ${s.weight ? `${s.weight} ${unit()} × ` : ''}${reps} reps`;
    }
    const ne = session.exercises.find((e, i) => i > ei && !exDone(e)) || session.exercises.find((e) => !exDone(e));
    return ne ? `Up next: ${ne.name}` : 'Last set done. Finish your workout 🎉';
  }

  view.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const s = currentSession();
    let scrollTo = null;

    switch (act) {
      case 'pick-day':
        ui.todayDay = Number(b.dataset.day);
        break;
      case 'start': {
        const sess = startSession(todayStr(), b.dataset.day);
        ui.active[sess.id] = 0;
        window.scrollTo(0, 0);
        break;
      }
      case 'expand': {
        const ei = Number(b.dataset.ei);
        ui.active[s.id] = activeIndex(s) === ei ? -1 : ei;
        scrollTo = ei;
        break;
      }
      case 'cue': {
        const key = `${s.id}:${b.dataset.ei}`;
        ui.cue[key] = !ui.cue[key];
        break;
      }
      case 'toggle-set': {
        const ei = Number(b.dataset.ei);
        const si = Number(b.dataset.si);
        const ex = s.exercises[ei];
        const set = ex.sets[si];
        if (!set.done) {
          if (set.reps === '' || set.reps == null) set.reps = ex.suggestion?.targetReps ?? ex.target.repMin;
          if ((set.weight === '' || set.weight == null) && ex.target.kind !== 'bw') {
            const above = ex.sets[si - 1];
            if (above && above.weight !== '') set.weight = above.weight;
          }
          set.done = true;
          for (let j = si + 1; j < ex.sets.length; j++) {
            if (ex.sets[j].done) continue;
            if (ex.sets[j].weight === '' || ex.sets[j].weight == null || Number(ex.sets[j].weight) === Number(ex.suggestion?.weight)) ex.sets[j].weight = set.weight;
          }
          const finishedEx = exDone(ex);
          const allDone = s.exercises.every(exDone);
          if (!allDone) startTimer(L.restFor(ex.target.kind, state.settings), nextLabel(ex, si, s, ei));
          else stopTimer();
          if (finishedEx) {
            const ni = s.exercises.findIndex((e, i) => i > ei && !exDone(e));
            const fallback = s.exercises.findIndex((e) => !exDone(e));
            const target = ni !== -1 ? ni : fallback;
            ui.active[s.id] = target === -1 ? -1 : target;
            if (target !== -1) scrollTo = target;
            if (allDone) toast('All sets done! Tap Finish 🎉');
          }
        } else {
          set.done = false;
        }
        save();
        break;
      }
      case 'add-set': {
        const ex = s.exercises[b.dataset.ei];
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push({ weight: last ? last.weight : '', reps: '', done: false });
        save();
        break;
      }
      case 'rm-set':
        s.exercises[b.dataset.ei].sets.pop();
        save();
        break;
      case 'finish': {
        const sess = state.sessions.find((x) => x.id === b.dataset.id);
        if (!L.sessionSetCount(sess) && !confirm('No sets are checked off yet. Finish anyway?')) return;
        if (!sess.exercises.every(exDone) && L.sessionSetCount(sess) && !confirm('Some sets aren’t checked off. Finish anyway?')) return;
        sess.completedAt = Date.now();
        save();
        stopTimer();
        window.scrollTo(0, 0);
        toast('Workout saved 💪');
        break;
      }
      case 'reopen': {
        const sess = state.sessions.find((x) => x.id === b.dataset.id);
        sess.completedAt = null;
        delete ui.active[sess.id];
        save();
        break;
      }
      case 'discard':
        if (!confirm('Discard this workout? The sets you logged will be deleted.')) return;
        state.sessions = state.sessions.filter((x) => x.id !== b.dataset.id);
        save();
        stopTimer();
        break;
      case 'delete-session':
        if (!confirm('Delete this workout from your history?')) return;
        state.sessions = state.sessions.filter((x) => x.id !== b.dataset.id);
        save();
        break;
      case 'add-cardio': {
        const min = parseInt($('#cardio-min').value, 10);
        if (!min) return toast('Enter minutes first');
        state.cardio.push({ id: uid(), date: todayStr(), type: $('#cardio-type').value, minutes: min });
        save();
        toast('Cardio logged');
        break;
      }
      case 'rm-cardio':
        state.cardio = state.cardio.filter((c) => c.id !== b.dataset.id);
        save();
        break;
      case 'log-bw': {
        const w = parseFloat($('#bw-input').value);
        if (!w) return toast('Enter your weight first');
        const date = todayStr();
        state.bodyweight = state.bodyweight.filter((x) => x.date !== date);
        state.bodyweight.push({ date, weight: w });
        save();
        toast('Weight logged');
        break;
      }
      case 'rm-bw':
        state.bodyweight = state.bodyweight.filter((x) => x.date !== b.dataset.date);
        save();
        break;
      case 'edit-goal':
        showOnboarding();
        return;
      case 'pick-ex':
        ui.progressEx = b.dataset.name;
        break;
      case 'set-goal':
        state.settings.goal = b.dataset.goal;
        save();
        toast(`Goal: ${L.GOALS[b.dataset.goal].label}`);
        break;
      case 'set-unit':
        state.settings.unit = b.dataset.unit;
        save();
        break;
      case 'cycle-restart':
        state.settings.blockStart = L.ymd(L.weekStart(today()));
        save();
        toast('Cycle restarted: week 1');
        break;
      case 'cycle-deload':
        if (!confirm('Make this week your deload week? The next cycle starts next Monday.')) return;
        state.settings.blockStart = L.ymd(L.addDays(L.weekStart(today()), -7 * (L.BLOCK_WEEKS - 1)));
        save();
        break;
      case 'finish-stale': {
        const sess = state.sessions.find((x) => x.id === b.dataset.id);
        sess.completedAt = sess.startedAt || Date.now();
        save();
        toast(`${sess.dayName} saved`);
        break;
      }
      case 'delete-stale':
        if (!confirm('Delete this unfinished workout and its logged sets?')) return;
        state.sessions = state.sessions.filter((x) => x.id !== b.dataset.id);
        save();
        break;
      case 'dismiss-migrated':
        ui.migrated = false;
        break;
      case 'add-day': {
        const keys = Object.keys(state.program.days).map(Number);
        const nk = String(Math.max(0, ...keys) + 1);
        state.program.days[nk] = { name: 'New workout', usual: null, focus: '', exercises: [] };
        ui.programDay = nk;
        save();
        break;
      }
      case 'rm-day':
        if (!confirm(`Remove the ${state.program.days[ui.programDay].name} workout? Workouts you already logged stay in your history.`)) return;
        delete state.program.days[ui.programDay];
        ui.programDay = dayKeys()[0];
        save();
        break;
      case 'upgrade':
        state.program = freshProgram();
        ui.offerUpgrade = false;
        save();
        toast('Trainer program loaded');
        break;
      case 'dismiss-upgrade':
        ui.offerUpgrade = false;
        state.program.version = window.PROGRAM_VERSION;
        save();
        break;
      case 'prog-day':
        ui.programDay = b.dataset.day;
        break;
      case 'move': {
        const arr = state.program.days[ui.programDay].exercises;
        const i = Number(b.dataset.i), j = i + Number(b.dataset.dir);
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        save();
        break;
      }
      case 'rm-ex': {
        const arr = state.program.days[ui.programDay].exercises;
        if (!confirm(`Remove ${arr[b.dataset.i].name}?`)) return;
        arr.splice(Number(b.dataset.i), 1);
        save();
        break;
      }
      case 'add-ex':
        state.program.days[ui.programDay].exercises.push({ id: uid(), name: 'New exercise', sets: 3, repMin: 8, repMax: 12, kind: 'iso', muscle: '', cue: '' });
        save();
        break;
      case 'reset-program':
        if (!confirm('Reset to the default 3-day plan? Your logged workouts are kept.')) return;
        state.program = freshProgram();
        ui.offerUpgrade = false;
        save();
        toast('Plan reset');
        break;
      case 'export':
        exportData();
        return;
      default:
        return;
    }
    render();
    if (scrollTo != null) {
      const el = document.getElementById(`ex-${scrollTo}`);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mf-lift-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /**
   * Merge a backup into the current data. Nothing already in the app is removed:
   * workouts, weigh-ins and cardio not yet present are added. Backups from older plan
   * versions keep the current plan (the logged workouts still count toward this week).
   */
  function mergeBackup(data) {
    const key = (s) => `${s.date}|${s.dayName}`;
    const haveIds = new Set(state.sessions.map((s) => s.id));
    const haveKeys = new Set(state.sessions.map(key));
    const sessions = data.sessions.filter((s) => s && s.date && Array.isArray(s.exercises) && !haveIds.has(s.id) && !haveKeys.has(key(s)));
    const bwDates = new Set(state.bodyweight.map((x) => x.date));
    const bodyweight = (data.bodyweight || []).filter((x) => x && x.date && !bwDates.has(x.date));
    const cardioIds = new Set(state.cardio.map((x) => x.id));
    const cardio = (data.cardio || []).filter((x) => x && !cardioIds.has(x.id));
    return { sessions, bodyweight, cardio };
  }

  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      let data;
      try {
        data = JSON.parse(r.result);
        if (!data.program || !Array.isArray(data.sessions)) throw new Error('bad file');
      } catch (e) {
        toast("That file doesn't look like an M-F Lift backup.");
        return;
      }
      const add = mergeBackup(data);
      const n = add.sessions.length;
      if (!n && !add.bodyweight.length && !add.cardio.length) {
        toast('Everything in that backup is already in the app.');
        return;
      }
      const list = add.sessions.map((s) => `• ${prettyDate(s.date)}: ${s.dayName}`).join('\n');
      if (!confirm(`Add ${n} workout${n === 1 ? '' : 's'} from this backup?\n${list}\n\nNothing already in the app will be removed.`)) return;
      const wasEmpty = !state.sessions.length;
      state.sessions.push(...add.sessions);
      state.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      state.bodyweight.push(...add.bodyweight);
      state.cardio.push(...add.cardio);
      const ds = data.settings || {};
      // Keep the earlier cycle start so the 6-week cycle continues where it was.
      if (ds.blockStart && (!state.settings.blockStart || ds.blockStart < state.settings.blockStart)) state.settings.blockStart = ds.blockStart;
      if (wasEmpty && ds.unit) state.settings.unit = ds.unit;
      if (!state.settings.goal && ds.goal) state.settings.goal = ds.goal;
      state.settings.onboarded = true;
      // A backup with an up-to-date plan you customised replaces the plan only when the app had nothing logged.
      if (wasEmpty && (data.program.version || 1) >= window.PROGRAM_VERSION) state.program = data.program;
      else if ((data.program.version || 1) < window.PROGRAM_VERSION && !state.previousProgram) state.previousProgram = data.program;
      ui.todayDay = null;
      save();
      toast(`Added ${n} workout${n === 1 ? '' : 's'} ✓`);
      render();
    };
    r.readAsText(file);
  }

  // ---------- render ----------
  function render() {
    const { doneCount, total } = weekStatus();
    const b = block();
    $('#topbar-meta').innerHTML = `${doneCount}/${total} this week<br><span style="font-weight:500">${b.deload ? 'Deload week' : `Cycle wk ${b.week}/${b.total}`}</span>`;
    ({ today: renderToday, week: renderWeek, progress: renderProgress, program: renderProgram })[ui.tab]();
    const on = document.querySelector('#view .chips .chip.on');
    if (on) on.parentElement.scrollLeft = on.offsetLeft - (on.parentElement.clientWidth - on.offsetWidth) / 2;
  }

  render();
  if (!state.settings.onboarded) showOnboarding();
  else if (ui.benchUpdate) toast('Chest day updated: Bench Press + Incline Dumbbell Press');

  let lastDate = todayStr();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayStr() !== lastDate) {
      lastDate = todayStr();
      ui.todayDay = null;
      render();
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
