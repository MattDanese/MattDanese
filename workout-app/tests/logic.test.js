// Run: node --test workout-app/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');
const { DEFAULT_PROGRAM } = require('../program.js');

const sess = (date, name, sets, extra = {}) => ({
  id: date + name, date, dayKey: 1, completedAt: 1,
  exercises: [{ name, sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })) }], ...extra,
});
const deadlift = { name: 'Deadlift', sets: 4, repMin: 6, repMax: 6, kind: 'lower' };
const pulldown = { name: 'Lat Pulldown', sets: 4, repMin: 8, repMax: 12, kind: 'iso' };

test('default program keeps the M-F split and lead lifts', () => {
  assert.deepEqual(Object.keys(DEFAULT_PROGRAM.days), ['1', '2', '3', '4', '5']);
  const leads = [1, 2, 3, 4, 5].map((d) => DEFAULT_PROGRAM.days[d].exercises[0].name);
  assert.deepEqual(leads, ['Deadlift', 'Incline Bench Press', 'Barbell Back Squat', 'Military Press', 'Chin-Up']);
});

test('every exercise has a muscle, cue and valid rep range; sessions stay ~60 min', () => {
  for (const day of Object.values(DEFAULT_PROGRAM.days)) {
    let sets = 0;
    for (const e of day.exercises) {
      assert.ok(e.muscle && e.cue, e.name);
      assert.ok(e.repMax == null || e.repMax >= e.repMin, e.name);
      sets += e.sets;
    }
    assert.ok(sets >= 16 && sets <= 22, `${day.name} has ${sets} sets`);
  }
});

test('chest, back and calves are trained at least twice a week; each major muscle gets 10+ sets', () => {
  const days = {}, sets = {};
  for (const [k, day] of Object.entries(DEFAULT_PROGRAM.days)) for (const e of day.exercises) {
    (days[e.muscle] ||= new Set()).add(k);
    sets[e.muscle] = (sets[e.muscle] || 0) + e.sets;
  }
  for (const m of ['Chest', 'Back', 'Calves']) assert.ok(days[m].size >= 2, m);
  for (const m of ['Chest', 'Back']) assert.ok(sets[m] >= 10 && sets[m] <= 22, `${m} ${sets[m]}`);
});

test('first session asks for a starting weight', () => {
  assert.equal(L.suggest(deadlift, []).action, 'start');
});

test('hitting top of range on all sets adds weight', () => {
  const s = [sess('2026-11-02', 'Deadlift', [[225, 6], [225, 6], [225, 6], [225, 6]])];
  const r = L.suggest(deadlift, s, 'lb');
  assert.equal(r.action, 'increase');
  assert.equal(r.weight, 235);
  assert.equal(L.suggest(deadlift, s, 'kg').weight, 230);
  const p = [sess('2026-11-02', 'Lat Pulldown', [[120, 12], [120, 12], [120, 12], [120, 12]])];
  assert.equal(L.suggest(pulldown, p).weight, 125);
});

test('partial success holds weight', () => {
  const s = [sess('2026-11-02', 'Lat Pulldown', [[120, 12], [120, 10], [120, 9], [120, 8]])];
  const r = L.suggest(pulldown, s);
  assert.equal(r.action, 'hold');
  assert.equal(r.weight, 120);
  assert.equal(r.targetReps, 9);
});

test('missing too few sets does not trigger increase', () => {
  const s = [sess('2026-11-02', 'Deadlift', [[225, 6], [225, 6]])];
  assert.equal(L.suggest(deadlift, s).action, 'hold');
});

test('two stalled sessions trigger a ~10% deload', () => {
  const s = [
    sess('2026-11-02', 'Deadlift', [[300, 5], [300, 5], [300, 4], [300, 4]]),
    sess('2026-11-09', 'Deadlift', [[300, 5], [300, 4], [300, 4], [300, 3]]),
  ];
  const r = L.suggest(deadlift, s);
  assert.equal(r.action, 'deload');
  assert.equal(r.weight, 270);
});

test('beforeDate ignores same-day and later sessions', () => {
  const s = [sess('2026-11-09', 'Deadlift', [[225, 6], [225, 6], [225, 6], [225, 6]])];
  assert.equal(L.suggest(deadlift, s, 'lb', '2026-11-09').action, 'start');
});

test('bodyweight work progresses by reps', () => {
  const pu = { name: 'Push-Ups', sets: 2, repMin: 1, repMax: null, kind: 'bw' };
  const r = L.suggest(pu, [sess('2026-11-03', 'Push-Ups', [['', 30], ['', 22]])]);
  assert.equal(r.action, 'reps');
  assert.equal(r.targetReps, 31);
});

test('dates: weeks start Monday', () => {
  const sun = L.parseYmd('2026-11-15');
  assert.equal(L.isoDow(sun), 7);
  assert.equal(L.ymd(L.weekStart(sun)), '2026-11-09');
  assert.equal(L.ymd(L.weekStart(L.parseYmd('2026-11-09'))), '2026-11-09');
});

test('e1rm and week streak', () => {
  assert.equal(Math.round(L.e1rm(200, 6)), 240);
  const mk = (date, dayKey) => ({ date, dayKey, completedAt: 1, exercises: [] });
  const sessions = [
    ...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d, i) => mk(d, i + 1)),
    ...['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].map((d, i) => mk(d, i + 1)),
    mk('2026-11-09', 1),
  ];
  assert.equal(L.weekStreak(sessions, L.parseYmd('2026-11-10')), 2);
});

test('exercise history picks best set per session', () => {
  const s = [sess('2026-11-02', 'Deadlift', [[225, 6], [245, 3]]), sess('2026-11-09', 'deadlift', [[235, 6]])];
  const h = L.exerciseHistory(s, 'Deadlift');
  assert.equal(h.length, 2);
  assert.equal(h[0].weight, 225);
  assert.equal(h[1].date, '2026-11-09');
});

test('6-week cycle: week 6 is deload, then wraps to cycle 2', () => {
  const b = (d) => L.blockInfo('2026-11-09', L.parseYmd(d));
  assert.deepEqual(b('2026-11-12'), { week: 1, total: 6, block: 1, deload: false });
  assert.equal(b('2026-12-17').week, 6);
  assert.equal(b('2026-12-17').deload, true);
  assert.deepEqual(b('2026-12-21'), { week: 1, total: 6, block: 2, deload: false });
  assert.equal(L.deloadSets(4), 3);
  assert.equal(L.deloadSets(2), 2);
});

test('deload sessions are ignored for progression', () => {
  const s = [
    sess('2026-11-02', 'Deadlift', [[225, 6], [225, 6], [225, 6], [225, 6]]),
    sess('2026-11-09', 'Deadlift', [[185, 5], [185, 5]], { deload: true }),
  ];
  assert.equal(L.suggest(deadlift, s).weight, 235);
});

test('warm-ups ramp below working weight; none for light or accessory work', () => {
  const w = L.warmups(225, 'lb', 'lower');
  assert.equal(w[0].weight, 45);
  assert.ok(w.every((x, i) => x.weight < 225 && (i === 0 || x.weight > w[i - 1].weight)));
  assert.deepEqual(L.warmups(60, 'lb', 'upper'), []);
  assert.deepEqual(L.warmups(200, 'lb', 'iso'), []);
});

test('nutrition targets follow the goal', () => {
  const shred = L.nutrition(200, 'lb', 'shred');
  const build = L.nutrition(200, 'lb', 'build');
  assert.equal(shred.maintenance, 3000);
  assert.equal(shred.kcal, 2500);
  assert.equal(build.kcal, 3250);
  assert.ok(shred.protein >= 200);
  assert.ok(Math.abs(shred.protein * 4 + shred.carbs * 4 + shred.fat * 9 - shred.kcal) < 10);
  assert.equal(L.nutrition(90.7, 'kg', 'recomp').kcal, L.nutrition(200, 'lb', 'recomp').kcal);
  assert.equal(L.nutrition(null, 'lb', 'shred'), null);
});

test('weekly check-in compares 7-day averages and gives a verdict', () => {
  const day = (n) => L.ymd(L.addDays(L.parseYmd('2026-11-14'), -n));
  const entries = [
    { date: day(12), weight: 200 }, { date: day(10), weight: 200 }, { date: day(8), weight: 200 },
    { date: day(5), weight: 198.6 }, { date: day(3), weight: 198.8 }, { date: day(1), weight: 198.7 },
  ];
  const t = L.weightTrend(entries, L.parseYmd('2026-11-14'));
  assert.ok(Math.abs(t.pct - -0.65) < 0.01);
  assert.equal(L.checkIn(t, 'shred').status, 'on');
  assert.equal(L.checkIn(t, 'build').status, 'fast');
  assert.equal(L.weightTrend(entries.slice(3), L.parseYmd('2026-11-14')), null);
});
