# M-F Lift

A phone-friendly workout tracker built on the Muscle & Strength
[M-F Workout Routine](https://www.muscleandstrength.com/workouts/m-f-workout-routine), tuned for building muscle and getting lean.

## The plan

Three workouts a week, done **in order on whichever days you make it to the gym**:

| # | Workout | Usual day | Lead lift |
| --- | --- | --- | --- |
| 1 | Back & Biceps (+ rear delts) | Mon | Deadlift 3×5–6 |
| 2 | Chest & Triceps (+ shoulders) | Tue | Incline Bench Press 4×6–8 |
| 3 | Legs & Abs (+ calves) | Wed | Barbell Back Squat 4×6–8 |

- **Flexible days.** The Workout tab always offers the next workout you haven't done this week, so Mon/Thu/Sat works as well as Mon/Tue/Wed. A missed workout just waits for next week. Usual days only set the order, and you can change them in Plan.
- **Each muscle trained once a week with enough volume**: 9–12 hard sets for back, chest and legs per session, about 19–21 sets per workout (≈60–70 min).
- **Rep ranges plus double progression.** Once you hit the top of the range on every set, the app adds weight.
- **Effort targets.** Stop 1–2 reps short on big lifts; take the last set of accessory work to failure.
- **6-week cycles.** 5 build weeks, then a deload week with about 60% of the sets.
- **Goal-based targets** (build / build & lean out / get shredded): calories, macros, steps and cardio, plus a weekly weigh-in check-in.

Updating from the older 5-day plan switches you to this one automatically. Logged workouts are kept and keep driving the weight suggestions; the old plan is saved in your backup data.

## The app

- **Workout**: a week strip showing the days you trained, chips to pick a workout (the next one is selected for you); a preview with the exercises, sets and estimated time; then a focused view of one exercise at a time with today's target weight and reps, a form tip, warm-up sets, the next set highlighted, and a rest timer that shows what's up next. It moves to the next exercise automatically.
- **Week**: your 3 workouts with done dates, cycle progress, daily nutrition targets, weekly check-in, and sets per muscle group (done vs planned).
- **Progress**: estimated 1-rep max for the main lifts, a chart for any exercise, body-weight trend, and history (you can change a workout's date).
- **Plan**: goal, how the plan works, workout editor (add or remove workouts, usual day, exercises, sets, reps, type, form tips), units, rest times, cycle controls, backup, and trainer notes.

Data stays in your browser (localStorage). Use **Export backup** from time to time.

## Run it

It's a static site with no build step.

```bash
cd workout-app
python3 -m http.server 8000   # then open http://localhost:8000
```

To use it at the gym, host the folder anywhere static (for example GitHub Pages: Settings → Pages → deploy from this
branch). Then open it on your phone and choose **Add to Home Screen**. It installs like an app and works offline.

## Tests

```bash
node --test workout-app/tests/logic.test.js
```
