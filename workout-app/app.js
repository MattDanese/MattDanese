/* M-F Lift — UI layer. Data lives in this browser's localStorage; use Export in the Program tab to back it up. */
(function () {
  'use strict';
  const L = window.Logic;
  const STORE_KEY = 'mf-lift-v1';
  const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // ---------- state ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Math.random().toString(36).slice(2, 10);

  function freshState() {
    const program = clone(window.DEFAULT_PROGRAM);
    for (const d of Object.values(program.days)) for (const e of d.exercises) e.id = uid();
    return {
      version: 1,
      program,
      sessions: [],
      bodyweight: [],
      cardio: [],
      settings: { unit: 'lb', restCompound: 150, restIso: 90 },
    };
  }

  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY)) || freshState();
  } catch (e) {
    state = freshState();
  }
  state.settings = Object.assign({ unit: 'lb', restCompound: 150, restIso: 90 }, state.settings);
  state.cardio = state.cardio || [];
  state.bodyweight = state.bodyweight || [];

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — storage is full or blocked.');
    }
  }

  // ---------- ui state ----------
  const ui = {
    tab: 'today',
    todayDay: null, // dayKey override on Today tab
    progressEx: null,
    programDay: '1',
  };

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
  const today = () => new Date();
  const todayStr = () => L.ymd(today());
  const unit = () => state.settings.unit;
  const repText = (e) => (e.repMax == null ? 'max' : e.repMin === e.repMax ? `${e.repMax}` : `${e.repMin}–${e.repMax}`);
  const prettyDate = (s) => L.parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

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
  function sessionsInWeek(start) {
    const a = L.ymd(start);
    const b = L.ymd(L.addDays(start, 6));
    return state.sessions.filter((s) => s.date >= a && s.date <= b);
  }

  // ---------- rest timer ----------
  const timer = { end: 0, int: null };
  function startTimer(sec) {
    timer.end = Date.now() + sec * 1000;
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
    $('#timer').classList.remove('over');
    tickTimer();
  });

  // ---------- TODAY ----------
  function startSession(date, dayKey) {
    const day = state.program.days[dayKey];
    const session = {
      id: uid(),
      date,
      dayKey: Number(dayKey),
      dayName: day.name,
      startedAt: Date.now(),
      completedAt: null,
      notes: '',
      exercises: day.exercises.map((e) => {
        const sg = L.suggest(e, state.sessions, unit(), date);
        return {
          exId: e.id,
          name: e.name,
          target: { sets: e.sets, repMin: e.repMin, repMax: e.repMax, kind: e.kind },
          suggestion: sg,
          sets: Array.from({ length: e.sets }, () => ({ weight: sg.weight ?? '', reps: '', done: false })),
        };
      }),
    };
    state.sessions.push(session);
    save();
    return session;
  }

  function prevSetsText(name, date) {
    const p = L.lastLogFor(state.sessions, name, date);
    if (!p) return [];
    return p.log.sets.map((s) => (s.done && s.reps ? `${s.weight ? s.weight + '×' : ''}${s.reps}` : '–'));
  }

  function renderToday() {
    const d = today();
    const dow = L.isoDow(d);
    const date = todayStr();
    const scheduled = dow <= 5 ? dow : null;
    const dayKey = ui.todayDay ?? scheduled;
    const ws = L.weekStart(d);
    const weekSessions = sessionsInWeek(ws).filter((s) => s.completedAt);
    const doneKeys = new Set(weekSessions.map((s) => Number(s.dayKey)));
    const missed = [1, 2, 3, 4, 5].filter((k) => k < (scheduled ?? 6) && !doneKeys.has(k));

    let html = `<div class="muted small">${esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>`;

    // day picker
    html += `<div class="chips" style="margin:10px 0 4px">` +
      [1, 2, 3, 4, 5].map((k) => {
        const on = String(k) === String(dayKey);
        const mark = doneKeys.has(k) ? ' ✓' : '';
        return `<button class="chip ${on ? 'on' : ''}" data-act="pick-day" data-day="${k}">${DOW[k]} · ${esc(state.program.days[k].name)}${mark}</button>`;
      }).join('') + `</div>`;

    if (dayKey == null) {
      html += `<h1>Rest day</h1><p class="muted">Recovery is when muscle actually gets built. Hit your protein, sleep 7–9 hours, and move a little.</p>`;
      if (missed.length) {
        html += `<div class="card"><h3>Missed this week</h3><p class="muted small">Want to make one up? It won't break your plan.</p><div class="row wrap" style="margin-top:8px">` +
          missed.map((k) => `<button class="btn ghost sm" data-act="pick-day" data-day="${k}">${DOW[k]} · ${esc(state.program.days[k].name)}</button>`).join('') +
          `</div></div>`;
      }
      html += cardioCard(date);
      $('#view').innerHTML = html;
      return;
    }

    const day = state.program.days[dayKey];
    const session = findSession(date, dayKey);
    const offPlan = scheduled !== Number(dayKey);
    html += `<h1>${esc(day.name)}</h1>`;
    html += `<p class="muted small">${DOW_LONG[dayKey]} workout${offPlan ? ' · doing it today instead' : ''} · ${day.exercises.length} exercises · ${day.exercises.reduce((a, e) => a + Number(e.sets), 0)} sets</p>`;

    if (scheduled && missed.length && !session && !offPlan) {
      html += `<div class="hint deload">You skipped ${missed.map((k) => DOW[k]).join(', ')} this week. Tap a day above to make it up, or just keep going.</div>`;
    }

    if (!session) {
      html += `<div class="card">` + day.exercises.map((e) => {
        const sg = L.suggest(e, state.sessions, unit(), date);
        return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div class="row between"><strong>${esc(e.name)}</strong><span class="pill">${e.sets} × ${repText(e)}</span></div>
          <div class="muted small">${esc(sg.text)}</div></div>`;
      }).join('') + `</div>`;
      html += `<button class="btn block" data-act="start" data-day="${dayKey}">Start ${esc(day.name)} workout</button>`;
      $('#view').innerHTML = html;
      return;
    }

    if (session.completedAt) {
      html += summaryCard(session);
      html += `<div class="row" style="margin-top:8px"><button class="btn ghost grow" data-act="reopen" data-id="${session.id}">Edit this workout</button></div>`;
      html += cardioCard(date);
      $('#view').innerHTML = html;
      return;
    }

    // in progress
    const doneSets = L.sessionSetCount(session);
    const totalSets = session.exercises.reduce((a, e) => a + e.sets.length, 0);
    html += `<div class="row" style="margin:6px 0 2px"><div class="bar grow"><span style="width:${totalSets ? (doneSets / totalSets) * 100 : 0}%"></span></div><span class="small muted num">${doneSets}/${totalSets} sets</span></div>`;

    session.exercises.forEach((ex, ei) => {
      const prev = prevSetsText(ex.name, session.date);
      const allDone = ex.sets.length && ex.sets.every((s) => s.done);
      const sg = ex.suggestion || {};
      html += `<div class="card ${allDone ? 'done' : ''}" data-ex="${ei}">
        <div class="row between"><h3>${esc(ex.name)}</h3><span class="pill ${allDone ? 'good' : ''}">${ex.target.sets} × ${repText(ex.target)}</span></div>
        ${sg.text ? `<div class="hint ${esc(sg.action)}">${esc(sg.text)}</div>` : ''}
        <table class="sets"><thead><tr><th>Set</th><th>Last</th><th>${ex.target.kind === 'bw' ? `+${unit()}` : unit()}</th><th>Reps</th><th></th></tr></thead><tbody>` +
        ex.sets.map((s, si) => `<tr class="${s.done ? 'done' : ''}">
          <td class="setno">${si + 1}</td>
          <td class="prev">${esc(prev[si] || '–')}</td>
          <td><input inputmode="decimal" data-f="weight" data-ei="${ei}" data-si="${si}" value="${esc(s.weight)}" placeholder="${ex.target.kind === 'bw' ? '0' : '—'}"></td>
          <td><input inputmode="numeric" data-f="reps" data-ei="${ei}" data-si="${si}" value="${esc(s.reps)}" placeholder="${esc(sg.targetReps ?? ex.target.repMin)}"></td>
          <td><button class="check ${s.done ? 'on' : ''}" data-act="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Mark set ${si + 1} done">✓</button></td>
        </tr>`).join('') +
        `</tbody></table>
        <div class="row" style="margin-top:6px">
          <button class="btn ghost sm" data-act="add-set" data-ei="${ei}">+ Set</button>
          ${ex.sets.length > 1 ? `<button class="btn ghost sm" data-act="rm-set" data-ei="${ei}">− Set</button>` : ''}
        </div>
      </div>`;
    });

    html += `<label class="field" style="margin-top:12px">Notes<textarea class="input" rows="2" data-f="notes" placeholder="How did it feel? Sleep, energy, anything to remember…">${esc(session.notes)}</textarea></label>`;
    html += `<div class="row" style="margin-top:12px">
      <button class="btn danger" data-act="discard" data-id="${session.id}">Discard</button>
      <button class="btn grow" data-act="finish" data-id="${session.id}">Finish workout</button></div>`;
    $('#view').innerHTML = html;
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
      if (mine && before.length && mine.e1rm > Math.max(...before.map((h) => h.e1rm)) && mine.e1rm > 0) {
        prs.push(`${ex.name}: ${mine.weight}×${mine.reps} (est. 1RM ${fmt(mine.e1rm)} ${unit()})`);
      }
    }
    return `<div class="card done">
      <div class="row between"><h3>Workout complete</h3><span class="pill good">✓ Done</span></div>
      <div class="stats" style="margin-top:10px">
        <div class="stat"><div class="v">${fmt(sets)}</div><div class="l">sets</div></div>
        <div class="stat"><div class="v">${fmt(vol)}</div><div class="l">volume (${unit()})</div></div>
        ${mins != null && mins < 300 ? `<div class="stat"><div class="v">${mins}</div><div class="l">minutes</div></div>` : ''}
      </div>
      ${prs.length ? `<h3 style="margin-top:14px">New personal records 🏆</h3><ul class="list">${prs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${session.notes ? `<p class="muted small" style="margin-top:10px">“${esc(session.notes)}”</p>` : ''}
    </div>`;
  }

  function cardioCard(date) {
    const todays = state.cardio.filter((c) => c.date === date);
    return `<div class="card"><h3>Cardio / conditioning</h3>
      <p class="muted small">20–30 min of walking, cycling or intervals 2–3× a week helps you stay lean and recover.</p>
      <div class="row" style="margin-top:8px">
        <select class="input" id="cardio-type" style="max-width:140px"><option>Walk</option><option>Run</option><option>Bike</option><option>Row</option><option>HIIT</option><option>Other</option></select>
        <input class="input" id="cardio-min" inputmode="numeric" placeholder="Minutes">
        <button class="btn sm" data-act="add-cardio">Log</button>
      </div>
      ${todays.length ? `<ul class="list" style="margin-top:6px">${todays.map((c) => `<li class="row between"><span>${esc(c.type)} · ${c.minutes} min</span><button class="icon-btn" data-act="rm-cardio" data-id="${c.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  // ---------- WEEK ----------
  function renderWeek() {
    const d = today();
    const ws = L.weekStart(d);
    const ts = todayStr();
    const wk = sessionsInWeek(ws);
    const lastWk = sessionsInWeek(L.addDays(ws, -7)).filter((s) => s.completedAt);
    const done = wk.filter((s) => s.completedAt);

    let html = `<div class="muted small">Week of ${esc(ws.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))}</div><h1>This week</h1>`;
    html += `<div class="week" style="margin-top:12px">`;
    for (let i = 1; i <= 7; i++) {
      const dd = L.addDays(ws, i - 1);
      const ds = L.ymd(dd);
      const isTrain = i <= 5;
      const s = isTrain ? done.find((x) => Number(x.dayKey) === i) : null;
      const anyDone = done.some((x) => x.date === ds);
      const cardio = state.cardio.some((c) => c.date === ds);
      let cls = '';
      if (isTrain) {
        if (s) cls = 'complete';
        else if (wk.some((x) => Number(x.dayKey) === i && !x.completedAt)) cls = 'partial';
        else if (ds < ts) cls = 'missed';
      } else if (anyDone || cardio) cls = 'complete';
      html += `<div class="day ${cls} ${ds === ts ? 'today' : ''}">
        <div class="dname">${DOW[i]}</div><div class="dnum">${dd.getDate()}</div>
        <div class="dfocus">${isTrain ? esc(state.program.days[i].name) : cardio ? 'Cardio' : 'Rest'}</div><span class="dot"></span></div>`;
    }
    html += `</div>`;

    const vol = done.reduce((a, s) => a + L.sessionVolume(s), 0);
    const lastVol = lastWk.reduce((a, s) => a + L.sessionVolume(s), 0);
    const sets = done.reduce((a, s) => a + L.sessionSetCount(s), 0);
    const trained = new Set(done.map((s) => Number(s.dayKey))).size;
    const streak = L.weekStreak(state.sessions, d);
    const delta = lastVol && vol ? Math.round(((vol - lastVol) / lastVol) * 100) : null;
    const cardioMin = state.cardio.filter((c) => c.date >= L.ymd(ws) && c.date <= L.ymd(L.addDays(ws, 6))).reduce((a, c) => a + Number(c.minutes || 0), 0);

    html += `<div class="stats" style="margin-top:14px">
      <div class="stat"><div class="v">${trained}/5</div><div class="l">workouts done</div></div>
      <div class="stat"><div class="v">${fmt(vol)}</div><div class="l">volume (${unit()}) ${delta != null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last wk</span>` : ''}</div></div>
      <div class="stat"><div class="v">${sets}</div><div class="l">hard sets</div></div>
      <div class="stat"><div class="v">${streak}</div><div class="l">week streak (all 5 days)</div></div>
      <div class="stat"><div class="v">${cardioMin}</div><div class="l">cardio minutes</div></div>
    </div>`;

    // sets per muscle
    const byMuscle = {};
    const exIndex = {};
    for (const day of Object.values(state.program.days)) for (const e of day.exercises) exIndex[e.name.toLowerCase()] = e.muscle || day.name;
    for (const s of done) for (const e of s.exercises) {
      const m = exIndex[e.name.toLowerCase()] || s.dayName;
      byMuscle[m] = (byMuscle[m] || 0) + L.completedSets(e).length;
    }
    const muscles = Object.entries(byMuscle).sort((a, b) => b[1] - a[1]);
    if (muscles.length) {
      html += `<h2>Sets per muscle group</h2><div class="card"><p class="muted small" style="margin-top:0">10–20 hard sets per muscle per week is a solid range for growth.</p>` +
        muscles.map(([m, n]) => `<div style="margin:8px 0"><div class="row between small"><span>${esc(m)}</span><span class="num">${n}</span></div><div class="bar"><span style="width:${Math.min(100, (n / 20) * 100)}%"></span></div></div>`).join('') +
        `</div>`;
    }

    // body weight
    const bw = [...state.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1));
    const lastBw = bw[bw.length - 1];
    html += `<h2>Body weight</h2><div class="card">
      <div class="row"><input class="input" id="bw-input" inputmode="decimal" placeholder="Today's weight (${unit()})"><button class="btn sm" data-act="log-bw">Log</button></div>
      ${lastBw ? `<p class="muted small">Last: ${lastBw.weight} ${unit()} on ${esc(prettyDate(lastBw.date))}. See the trend in Progress.</p>` : '<p class="muted small">Weigh in a few mornings a week. The trend matters more than any single day.</p>'}
    </div>`;

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
    const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
    const idxLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)} trend">
      ${ticks.map((t) => `<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke-dasharray="3 4"/><text class="lbl" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
      <path class="ln" d="${path}"/>
      ${points.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.y)}" r="3.5"><title>${esc(p.label)}: ${fmt(p.y, 1)}</title></circle>`).join('')}
      ${[...new Set(idxLabels)].map((i) => `<text class="lbl" x="${x(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(points[i].label)}</text>`).join('')}
    </svg>`;
  }

  function renderProgress() {
    const done = state.sessions.filter((s) => s.completedAt);
    const names = [];
    const seen = new Set();
    for (const k of [1, 2, 3, 4, 5]) for (const e of state.program.days[k].exercises) {
      if (!seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); names.push(e.name); }
    }
    for (const s of done) for (const e of s.exercises) if (!seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); names.push(e.name); }
    if (!ui.progressEx || !seen.has(ui.progressEx.toLowerCase())) ui.progressEx = names[0];

    let html = `<h1>Progress</h1><p class="muted small">${done.length} workouts logged</p>`;

    // Exercise chart
    const hist = L.exerciseHistory(state.sessions, ui.progressEx);
    const isBw = hist.length && hist.every((h) => !h.weight);
    html += `<div class="card">
      <select class="input" data-f="progress-ex">${names.map((n) => `<option ${n === ui.progressEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div class="muted small" style="margin:10px 0 4px">${isBw ? 'Best set (reps)' : `Estimated 1-rep max (${unit()})`}</div>
      ${lineChart(hist.map((h) => ({ y: isBw ? h.maxReps : h.e1rm, label: prettyDate(h.date).replace(/^\w+,\s*/, '') })), { yLabel: ui.progressEx })}
      ${hist.length ? `<ul class="list" style="margin-top:8px">${hist.slice(-5).reverse().map((h) => `<li class="row between small"><span>${esc(prettyDate(h.date))}</span><span class="num">${h.weight ? `${h.weight} ${unit()} × ${h.reps}` : `${h.maxReps} reps`}${h.weight ? ` · e1RM ${fmt(h.e1rm)}` : ''}</span></li>`).join('')}</ul>` : ''}
    </div>`;

    // PR board for main lifts
    const prRows = [];
    for (const k of [1, 2, 3, 4, 5]) {
      const main = state.program.days[k].exercises[0];
      if (!main) continue;
      const h = L.exerciseHistory(state.sessions, main.name);
      if (!h.length) continue;
      const best = h.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
      const first = h[0];
      const gain = first.e1rm ? Math.round(((best.e1rm - first.e1rm) / first.e1rm) * 100) : 0;
      prRows.push(`<li class="row between"><div><strong>${esc(main.name)}</strong><div class="muted small">${best.weight} × ${best.reps} on ${esc(prettyDate(best.date))}</div></div><div style="text-align:right"><div class="num"><strong>${fmt(best.e1rm)}</strong> <span class="muted small">${unit()}</span></div>${gain > 0 ? `<div class="small delta up">▲ ${gain}%</div>` : ''}</div></li>`);
    }
    html += `<h2>Main lifts — best estimated 1RM</h2><div class="card">${prRows.length ? `<ul class="list">${prRows.join('')}</ul>` : '<p class="muted small">Your deadlift, squat, bench and press records show up here once you log them.</p>'}</div>`;

    // body weight
    const bw = [...state.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1));
    html += `<h2>Body weight</h2><div class="card">${lineChart(bw.map((b) => ({ y: Number(b.weight), label: prettyDate(b.date).replace(/^\w+,\s*/, '') })), { yLabel: 'Body weight' })}
      ${bw.length ? `<ul class="list" style="margin-top:8px">${bw.slice(-5).reverse().map((b) => `<li class="row between small"><span>${esc(prettyDate(b.date))}</span><span class="row"><span class="num">${b.weight} ${unit()}</span><button class="icon-btn" data-act="rm-bw" data-date="${b.date}" aria-label="Remove">✕</button></span></li>`).join('')}</ul>` : ''}</div>`;

    // history
    const sorted = [...done].sort((a, b) => (a.date < b.date ? 1 : -1));
    html += `<h2>History</h2>`;
    if (!sorted.length) html += `<p class="muted">No workouts yet. Your first one is on the Today tab.</p>`;
    for (const s of sorted.slice(0, 40)) {
      html += `<details class="card"><summary><span>${esc(prettyDate(s.date))} · ${esc(s.dayName)}</span> <span class="muted small">· ${L.sessionSetCount(s)} sets · ${fmt(L.sessionVolume(s))} ${unit()}</span></summary>
        <ul class="list" style="margin-top:8px">${s.exercises.map((e) => {
          const cs = L.completedSets(e);
          return `<li class="small"><strong>${esc(e.name)}</strong><div class="muted num">${cs.length ? cs.map((x) => `${x.weight ? x.weight + '×' : ''}${x.reps}`).join(', ') : 'skipped'}</div></li>`;
        }).join('')}</ul>
        ${s.notes ? `<p class="muted small">“${esc(s.notes)}”</p>` : ''}
        <button class="btn danger sm" data-act="delete-session" data-id="${s.id}">Delete workout</button>
      </details>`;
    }
    $('#view').innerHTML = html;
  }

  // ---------- PROGRAM ----------
  function renderProgram() {
    const k = ui.programDay;
    const day = state.program.days[k];
    const verifyCount = Object.values(state.program.days).reduce((a, d) => a + d.exercises.filter((e) => e.verify).length, 0);
    let html = `<h1>Program</h1><p class="muted small">${esc(state.program.name)} · 5-day split. Changes apply to your next workout.</p>`;
    if (verifyCount) {
      html += `<div class="hint deload">${verifyCount} accessory exercises are placeholders marked <span class="pill warn">check</span>. Compare them with the article and edit, or tap ✓ to keep them as they are.</div>`;
    }
    html += `<div class="chips" style="margin:10px 0">${[1, 2, 3, 4, 5].map((d) => `<button class="chip ${String(d) === String(k) ? 'on' : ''}" data-act="prog-day" data-day="${d}">${DOW[d]}</button>`).join('')}</div>`;
    html += `<label class="field">Day name<input class="input" data-f="day-name" value="${esc(day.name)}"></label>`;

    day.exercises.forEach((e, i) => {
      html += `<div class="card" data-pi="${i}">
        <div class="row">
          <input class="input grow" data-pf="name" data-i="${i}" value="${esc(e.name)}" aria-label="Exercise name">
          ${e.verify ? `<button class="pill warn" style="border:0;cursor:pointer" data-act="verify" data-i="${i}" title="Mark as checked">check ✓</button>` : ''}
        </div>
        <div class="grid-ex">
          <label class="field">Sets<input inputmode="numeric" data-pf="sets" data-i="${i}" value="${e.sets}"></label>
          <label class="field">Min reps<input inputmode="numeric" data-pf="repMin" data-i="${i}" value="${e.repMin}"></label>
          <label class="field">Max reps<input inputmode="numeric" data-pf="repMax" data-i="${i}" value="${e.repMax ?? ''}" placeholder="failure"></label>
          <label class="field">Type<select data-pf="kind" data-i="${i}">
            ${[['lower', 'Big lower lift'], ['upper', 'Big upper lift'], ['iso', 'Accessory'], ['bw', 'Bodyweight']].map(([v, l]) => `<option value="${v}" ${e.kind === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        </div>
        <div class="row" style="margin-top:8px;justify-content:flex-end">
          <button class="icon-btn" data-act="move" data-i="${i}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="move" data-i="${i}" data-dir="1" aria-label="Move down" ${i === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="rm-ex" data-i="${i}" aria-label="Remove exercise">🗑</button>
        </div>
      </div>`;
    });
    html += `<button class="btn ghost block" data-act="add-ex">+ Add exercise</button>`;

    const s = state.settings;
    html += `<h2>Settings</h2><div class="card stack">
      <div class="grid-ex" style="grid-template-columns:1fr 1fr 1fr">
        <label class="field">Units<select data-sf="unit"><option value="lb" ${s.unit === 'lb' ? 'selected' : ''}>lb</option><option value="kg" ${s.unit === 'kg' ? 'selected' : ''}>kg</option></select></label>
        <label class="field">Rest, big lifts (s)<input inputmode="numeric" data-sf="restCompound" value="${s.restCompound}"></label>
        <label class="field">Rest, accessories (s)<input inputmode="numeric" data-sf="restIso" value="${s.restIso}"></label>
      </div>
    </div>`;

    html += `<h2>Your data</h2><div class="card">
      <p class="muted small" style="margin-top:0">Everything is saved in this browser on this device. Export a backup now and then, especially before clearing browser data or switching phones.</p>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn ghost sm" data-act="export">Export backup</button>
        <label class="btn ghost sm" style="display:inline-flex;align-items:center">Import backup<input type="file" accept="application/json" id="import-file" hidden></label>
        <button class="btn danger sm" data-act="reset-program">Reset program to default</button>
      </div>
    </div>`;

    html += guideHtml();
    $('#view').innerHTML = html;
  }

  function guideHtml() {
    return `<h2>How to build muscle with this plan</h2>
    <details class="card"><summary>Progressive overload: the rule the app follows</summary>
      <p class="small">Every exercise has a rep range. Keep the same weight until you hit the <strong>top</strong> of the range on <strong>every</strong> set, then add weight (+10 ${unit() === 'kg' ? '/ 5 kg' : 'lb'} on squats and deadlifts, +5 ${unit() === 'kg' ? '/ 2.5 kg' : 'lb'} on everything else) and work back up. If you miss the bottom of the range two sessions in a row, drop about 10% and rebuild. The tip on each exercise card tells you what to do.</p>
    </details>
    <details class="card"><summary>Effort</summary>
      <p class="small">Finish most sets with 1–2 good reps left in the tank. Warm-up sets don't count, so log only your working sets. On the big lifts, do 2–3 lighter warm-up sets first.</p>
    </details>
    <details class="card"><summary>Eating to grow (or lean out)</summary>
      <p class="small"><strong>Protein:</strong> about 0.7–1 g per lb of body weight (1.6–2.2 g/kg) every day.<br>
      <strong>To build:</strong> eat a small surplus (≈200–300 kcal) and aim to gain 0.25–0.5% of body weight per week.<br>
      <strong>To lean out:</strong> eat a ≈300–500 kcal deficit, keep lifting heavy, and aim to lose 0.5–1% per week.<br>
      The body-weight trend in Progress shows whether it's working.</p>
    </details>
    <details class="card"><summary>Recovery and staying fit</summary>
      <p class="small">Sleep 7–9 hours. Use the weekends for rest, plus 2–3 short cardio sessions (walking counts) for heart health and conditioning. Every 6–8 weeks, or whenever everything feels heavy, take a deload week: same exercises at about 60% of the sets.</p>
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
    } else if (t.dataset.pf) {
      const e = state.program.days[ui.programDay].exercises[t.dataset.i];
      const f = t.dataset.pf;
      if (f === 'name' || f === 'kind') e[f] = t.value;
      else if (f === 'repMax') e.repMax = t.value.trim() === '' ? null : Math.max(1, parseInt(t.value, 10) || 1);
      else e[f] = Math.max(1, parseInt(t.value, 10) || 1);
      save();
    } else if (t.dataset.sf) {
      const f = t.dataset.sf;
      state.settings[f] = f === 'unit' ? t.value : Math.max(10, parseInt(t.value, 10) || 60);
      save();
    }
  });

  view.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.f === 'progress-ex') { ui.progressEx = t.value; render(); }
    if (t.dataset.pf === 'kind' || t.dataset.sf === 'unit') render();
    if (t.id === 'import-file' && t.files[0]) importFile(t.files[0]);
  });

  function currentSession() {
    const d = today();
    const dow = L.isoDow(d);
    const key = ui.todayDay ?? (dow <= 5 ? dow : null);
    return key == null ? null : findSession(todayStr(), key);
  }

  view.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const s = currentSession();

    switch (act) {
      case 'pick-day':
        ui.todayDay = Number(b.dataset.day);
        break;
      case 'start':
        startSession(todayStr(), b.dataset.day);
        break;
      case 'toggle-set': {
        const ex = s.exercises[b.dataset.ei];
        const set = ex.sets[b.dataset.si];
        if (!set.done) {
          if (set.reps === '' || set.reps == null) set.reps = ex.suggestion?.targetReps ?? ex.target.repMin;
          if ((set.weight === '' || set.weight == null) && ex.target.kind !== 'bw') {
            const above = ex.sets[b.dataset.si - 1];
            if (above && above.weight !== '') set.weight = above.weight;
          }
          set.done = true;
          // carry weight forward to next empty set
          const next = ex.sets[Number(b.dataset.si) + 1];
          if (next && (next.weight === '' || next.weight == null)) next.weight = set.weight;
          const big = ex.target.kind === 'lower' || ex.target.kind === 'upper';
          startTimer(big ? state.settings.restCompound : state.settings.restIso);
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
        sess.completedAt = Date.now();
        save();
        stopTimer();
        toast('Workout saved 💪');
        break;
      }
      case 'reopen': {
        const sess = state.sessions.find((x) => x.id === b.dataset.id);
        sess.completedAt = null;
        save();
        break;
      }
      case 'discard':
        if (!confirm('Discard this workout? Sets you logged will be deleted.')) return;
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
      case 'prog-day':
        ui.programDay = b.dataset.day;
        break;
      case 'verify':
        delete state.program.days[ui.programDay].exercises[b.dataset.i].verify;
        save();
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
        state.program.days[ui.programDay].exercises.push({ id: uid(), name: 'New exercise', sets: 3, repMin: 8, repMax: 12, kind: 'iso' });
        save();
        break;
      case 'reset-program':
        if (!confirm('Reset all five days to the default M-F routine? Your logged workouts are kept.')) return;
        state.program = freshState().program;
        save();
        toast('Program reset');
        break;
      case 'export':
        exportData();
        return;
      default:
        return;
    }
    render();
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

  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.program || !Array.isArray(data.sessions)) throw new Error('bad file');
        if (!confirm(`Replace current data with this backup (${data.sessions.length} workouts)?`)) return;
        state = Object.assign(freshState(), data);
        save();
        toast('Backup restored');
        render();
      } catch (e) {
        toast("That file doesn't look like an M-F Lift backup.");
      }
    };
    r.readAsText(file);
  }

  // ---------- render ----------
  function render() {
    const d = today();
    const ws = L.weekStart(d);
    const n = new Set(sessionsInWeek(ws).filter((s) => s.completedAt).map((s) => Number(s.dayKey))).size;
    $('#topbar-meta').textContent = `${n}/5 this week`;
    ({ today: renderToday, week: renderWeek, progress: renderProgress, program: renderProgram })[ui.tab]();
  }

  render();

  // re-render Today when the date rolls over while the app is open
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
