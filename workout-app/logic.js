/* Pure training logic: dates, progression, stats. No DOM access, so it can be unit-tested in Node. */
(function (root) {
  const INCREMENTS = {
    lb: { lower: 10, upper: 5, iso: 5, bw: 0 },
    kg: { lower: 5, upper: 2.5, iso: 2.5, bw: 0 },
  };

  // ---------- dates (local time, weeks start Monday) ----------
  function ymd(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function parseYmd(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  /** ISO weekday: Monday = 1 ... Sunday = 7 */
  function isoDow(d) {
    return ((d.getDay() + 6) % 7) + 1;
  }
  function weekStart(d) {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - (isoDow(s) - 1));
    return s;
  }
  function addDays(d, n) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() + n);
    return r;
  }

  // ---------- strength math ----------
  /** Epley estimated one-rep max. */
  function e1rm(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  }
  function roundTo(x, step) {
    return Math.round(x / step) * step;
  }

  function completedSets(exLog) {
    return (exLog && exLog.sets ? exLog.sets : []).filter((s) => s.done && Number(s.reps) > 0);
  }

  /** Most recent completed log for an exercise name (case-insensitive), before `beforeDate` if given. */
  function lastLogFor(sessions, name, beforeDate) {
    const key = name.trim().toLowerCase();
    const sorted = sessions
      .filter((s) => s.completedAt && !s.deload && (!beforeDate || s.date < beforeDate))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.completedAt || 0) - (a.completedAt || 0)));
    for (const s of sorted) {
      const log = s.exercises.find((e) => e.name.trim().toLowerCase() === key);
      if (log && completedSets(log).length) return { session: s, log };
    }
    return null;
  }

  /**
   * Double progression.
   * - Hit the top of the rep range on every prescribed set -> add weight, reset to bottom of range.
   * - Missed the bottom of the range on two sessions in a row -> deload ~10%.
   * - Otherwise keep the weight and try to add reps.
   * Bodyweight work progresses by reps only.
   */
  function suggest(exercise, sessions, unit = 'lb', beforeDate) {
    const prev = lastLogFor(sessions, exercise.name, beforeDate);
    const top = exercise.repMax == null ? null : exercise.repMax;
    const rangeText = top == null ? 'as many as possible' : exercise.repMin === top ? `${top}` : `${exercise.repMin}–${top}`;
    if (!prev) {
      return {
        action: 'start',
        weight: null,
        targetReps: exercise.repMin,
        text: exercise.kind === 'bw'
          ? `First time: do ${rangeText} reps per set with good form.`
          : `First time: pick a weight you can lift for ${rangeText} reps with 1–2 reps left in the tank.`,
      };
    }
    const sets = completedSets(prev.log);
    const weights = sets.map((s) => Number(s.weight) || 0);
    const workWeight = weights.length ? Math.max(...weights) : 0;
    const workSets = sets.filter((s) => (Number(s.weight) || 0) === workWeight);
    const reps = workSets.map((s) => Number(s.reps));
    const inc = (INCREMENTS[unit] || INCREMENTS.lb)[exercise.kind] ?? 5;
    const step = unit === 'kg' ? 1.25 : 2.5;

    if (exercise.kind === 'bw' || workWeight === 0 || top == null) {
      const best = Math.max(...sets.map((s) => Number(s.reps)));
      return {
        action: 'reps',
        weight: workWeight || null,
        targetReps: best + 1,
        text: `Last time best set: ${best} reps. Beat it — aim for ${best + 1}+.`,
      };
    }

    const allSetsDone = workSets.length >= exercise.sets;
    const hitTop = allSetsDone && reps.every((r) => r >= top);
    if (hitTop) {
      const w = workWeight + inc;
      return {
        action: 'increase',
        weight: w,
        targetReps: exercise.repMin,
        text: `You hit ${top} on every set. Go up to ${w} ${unit} and aim for ${exercise.repMin}+ reps.`,
      };
    }

    const missedBottom = reps.some((r) => r < exercise.repMin);
    if (missedBottom) {
      const older = lastLogFor(sessions, exercise.name, prev.session.date);
      if (older) {
        const oSets = completedSets(older.log);
        const oWeight = Math.max(...oSets.map((s) => Number(s.weight) || 0));
        const oMissed = oSets.filter((s) => (Number(s.weight) || 0) === oWeight).some((s) => Number(s.reps) < exercise.repMin);
        if (oWeight === workWeight && oMissed) {
          const w = roundTo(workWeight * 0.9, step);
          return {
            action: 'deload',
            weight: w,
            targetReps: exercise.repMin,
            text: `Stalled two sessions in a row at ${workWeight} ${unit}. Deload to ${w} ${unit} and build back up.`,
          };
        }
      }
    }

    const total = reps.reduce((a, b) => a + b, 0);
    return {
      action: 'hold',
      weight: workWeight,
      targetReps: Math.min(top, Math.max(exercise.repMin, Math.min(...reps) + 1)),
      text: `Stay at ${workWeight} ${unit}. Last time ${reps.join('/')} (${total} reps) — add a rep or two, aiming for ${top} on all sets.`,
    };
  }

  // ---------- stats ----------
  function sessionVolume(session) {
    let v = 0;
    for (const e of session.exercises) for (const s of completedSets(e)) v += (Number(s.weight) || 0) * Number(s.reps);
    return v;
  }
  function sessionSetCount(session) {
    return session.exercises.reduce((n, e) => n + completedSets(e).length, 0);
  }

  /** Per-session best e1RM for an exercise, oldest first. */
  function exerciseHistory(sessions, name) {
    const key = name.trim().toLowerCase();
    return sessions
      .filter((s) => s.completedAt)
      .map((s) => {
        const log = s.exercises.find((e) => e.name.trim().toLowerCase() === key);
        if (!log) return null;
        const sets = completedSets(log);
        if (!sets.length) return null;
        let best = null;
        for (const st of sets) {
          const est = e1rm(Number(st.weight) || 0, Number(st.reps));
          if (!best || est > best.e1rm) best = { weight: Number(st.weight) || 0, reps: Number(st.reps), e1rm: est };
        }
        const maxReps = Math.max(...sets.map((x) => Number(x.reps)));
        return { date: s.date, ...best, maxReps, volume: sets.reduce((a, x) => a + (Number(x.weight) || 0) * Number(x.reps), 0) };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /** Count consecutive weeks (ending with the last full week, plus this week if already complete) where every workout in `keys` was done. */
  function weekStreak(sessions, today, keys = [1, 2, 3, 4, 5]) {
    const doneByWeek = new Map();
    for (const s of sessions) {
      if (!s.completedAt) continue;
      const wk = ymd(weekStart(parseYmd(s.date)));
      if (!doneByWeek.has(wk)) doneByWeek.set(wk, new Set());
      doneByWeek.get(wk).add(s.dayKey);
    }
    const full = (wk) => {
      const set = doneByWeek.get(wk);
      return !!set && keys.length > 0 && keys.every((d) => set.has(Number(d)) || set.has(String(d)));
    };
    let streak = 0;
    let cursor = weekStart(today);
    if (full(ymd(cursor))) streak++;
    cursor = addDays(cursor, -7);
    while (full(ymd(cursor))) {
      streak++;
      cursor = addDays(cursor, -7);
    }
    return streak;
  }


  // ---------- flexible weekly rotation ----------
  /** Workout keys in rotation order: by usual weekday, then key. */
  function orderedKeys(program) {
    return Object.keys(program.days).sort((a, b) => {
      const ua = program.days[a].usual || 8, ub = program.days[b].usual || 8;
      return ua - ub || Number(a) - Number(b);
    });
  }
  /** First workout in rotation order not yet completed this week, or null when the week is done. */
  function nextWorkout(program, doneKeys) {
    const done = new Set([...doneKeys].map(String));
    return orderedKeys(program).find((k) => !done.has(String(k))) ?? null;
  }

  // ---------- training block (6 weeks: 5 build + 1 deload) ----------
  const BLOCK_WEEKS = 6;
  /** Week number inside the current block, 1..6, counted from the Monday of blockStart. */
  function blockInfo(blockStart, today) {
    const start = weekStart(blockStart ? parseYmd(blockStart) : today);
    const now = weekStart(today);
    const weeks = Math.max(0, Math.round((now - start) / (7 * 864e5)));
    const week = (weeks % BLOCK_WEEKS) + 1;
    return { week, total: BLOCK_WEEKS, block: Math.floor(weeks / BLOCK_WEEKS) + 1, deload: week === BLOCK_WEEKS };
  }
  function deloadSets(sets) {
    return Math.max(1, Math.ceil(sets * 0.6));
  }

  // ---------- warm-ups ----------
  /** Ramp-up sets for a heavy compound lift. Returns [] when not useful. */
  function warmups(workWeight, unit = 'lb', kind = 'upper') {
    const bar = unit === 'kg' ? 20 : 45;
    const step = unit === 'kg' ? 2.5 : 5;
    if (!workWeight || workWeight < bar * 1.6 || (kind !== 'lower' && kind !== 'upper')) return [];
    const ramp = [[0, 10], [0.5, 6], [0.7, 4], [0.85, 2]];
    const out = [];
    for (const [pct, reps] of ramp) {
      const w = pct === 0 ? bar : Math.max(bar, roundTo(workWeight * pct, step));
      if (out.length && w <= out[out.length - 1].weight) continue;
      if (w >= workWeight) break;
      out.push({ weight: w, reps });
    }
    return out;
  }

  // ---------- effort / rest / time ----------
  function effortText(kind) {
    if (kind === 'lower' || kind === 'upper') return 'Stop 1–2 reps short of failure';
    if (kind === 'bw') return 'Last set as many reps as you can';
    return 'Last set to failure (0–1 reps left)';
  }
  function restFor(kind, settings) {
    const c = settings.restCompound || 150;
    const i = settings.restIso || 75;
    if (kind === 'lower') return c + 30;
    if (kind === 'upper') return c;
    return i;
  }
  function estimateMinutes(exercises, settings) {
    let sec = 0;
    for (const e of exercises) sec += Number(e.sets) * (restFor(e.kind, settings) + 40);
    return Math.round(sec / 60 / 5) * 5;
  }

  // ---------- nutrition & conditioning (starting estimates) ----------
  const GOALS = {
    build: { label: 'Build muscle', kcal: +250, rate: [0.25, 0.5], steps: 7000, cardio: 60 },
    recomp: { label: 'Build & lean out', kcal: -200, rate: [-0.25, 0], steps: 9000, cardio: 100 },
    shred: { label: 'Get shredded', kcal: -500, rate: [-1, -0.5], steps: 10000, cardio: 150 },
  };
  /**
   * Daily targets from body weight. Maintenance ≈ 14 kcal/lb lifting 3×/week, 15 kcal/lb at 4+ days.
   * Protein 1 g/lb (higher end protects muscle in a deficit), fat ~0.35 g/lb, carbs fill the rest.
   */
  function nutrition(bodyweight, unit, goal, trainingDays = 3) {
    if (!bodyweight) return null;
    const lb = unit === 'kg' ? bodyweight * 2.2046 : bodyweight;
    const g = GOALS[goal] || GOALS.recomp;
    const maintenance = lb * (trainingDays >= 4 ? 15 : 14);
    const kcal = Math.round((maintenance + g.kcal) / 50) * 50;
    const protein = Math.round(lb * (goal === 'shred' ? 1.1 : 1));
    const fat = Math.round(lb * 0.35);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, maintenance: Math.round(maintenance / 50) * 50, protein, fat, carbs, steps: g.steps, cardio: g.cardio, rate: g.rate, label: g.label };
  }

  /** Compare the last 7 days' average body weight with the 7 days before it. */
  function weightTrend(entries, today) {
    const t = ymd(today);
    const d7 = ymd(addDays(today, -7));
    const d14 = ymd(addDays(today, -14));
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + Number(b.weight), 0) / xs.length : null);
    const recent = entries.filter((e) => e.date > d7 && e.date <= t);
    const prior = entries.filter((e) => e.date > d14 && e.date <= d7);
    const a = avg(recent);
    const b = avg(prior);
    if (a == null || b == null) return null;
    return { recent: a, prior: b, change: a - b, pct: ((a - b) / b) * 100 };
  }

  /** Coaching verdict for the weekly check-in. */
  function checkIn(trend, goal) {
    if (!trend) return null;
    const g = GOALS[goal] || GOALS.recomp;
    const [lo, hi] = g.rate;
    const p = trend.pct;
    if (p < lo - 0.25) return { status: 'fast', text: goal === 'build' ? 'Weight is dropping. Add about 200 kcal a day.' : 'You are losing faster than ideal and could lose muscle. Add about 150 kcal a day, mostly carbs around training.' };
    if (p > hi + 0.25) return { status: 'slow', text: goal === 'build' ? 'Gaining faster than needed, which will add fat. Cut about 150 kcal a day.' : 'Weight is going up. Cut about 150–200 kcal a day or add 2,000 steps.' };
    if (p < lo) return { status: 'fast', text: 'A bit faster than the target. Keep an eye on it; no change needed yet.' };
    if (p > hi) return { status: 'slow', text: goal === 'build' ? 'Slightly ahead of target. Fine, as long as your strength is going up.' : 'Slower than the target. If it stays like this next week, cut about 150 kcal a day.' };
    return { status: 'on', text: 'Right on target. Keep doing exactly this.' };
  }

  const api = {
    orderedKeys, nextWorkout, BLOCK_WEEKS, GOALS, blockInfo, deloadSets, warmups, effortText, restFor, estimateMinutes, nutrition, weightTrend, checkIn,
    INCREMENTS, ymd, parseYmd, isoDow, weekStart, addDays, e1rm, roundTo,
    completedSets, lastLogFor, suggest, sessionVolume, sessionSetCount, exerciseHistory, weekStreak,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
