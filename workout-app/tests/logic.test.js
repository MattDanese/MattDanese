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

test('default program has five days Mon–Fri', () => {
  assert.deepEqual(Object.keys(DEFAULT_PROGRAM.days), ['1', '2', '3', '4', '5']);
  assert.equal(DEFAULT_PROGRAM.days[1].exercises[0].name, 'Deadlift');
  assert.equal(DEFAULT_PROGRAM.days[3].exercises[0].sets, 5);
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
