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
      .filter((s) => s.completedAt && (!beforeDate || s.date < beforeDate))
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

  /** Count consecutive weeks (ending with the last full week, plus this week if already complete) where all 5 weekdays were trained. */
  function weekStreak(sessions, today) {
    const doneByWeek = new Map();
    for (const s of sessions) {
      if (!s.completedAt) continue;
      const wk = ymd(weekStart(parseYmd(s.date)));
      if (!doneByWeek.has(wk)) doneByWeek.set(wk, new Set());
      doneByWeek.get(wk).add(s.dayKey);
    }
    const full = (wk) => {
      const set = doneByWeek.get(wk);
      return !!set && [1, 2, 3, 4, 5].every((d) => set.has(d) || set.has(String(d)));
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

  const api = {
    INCREMENTS, ymd, parseYmd, isoDow, weekStart, addDays, e1rm, roundTo,
    completedSets, lastLogFor, suggest, sessionVolume, sessionSetCount, exerciseHistory, weekStreak,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
