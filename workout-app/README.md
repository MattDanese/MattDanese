# M-F Lift

A phone-friendly workout tracker built on the Muscle & Strength
[M-F Workout Routine](https://www.muscleandstrength.com/workouts/m-f-workout-routine), tuned for building muscle and getting lean.

## The plan

| Day | Focus | Lead lift | 2nd hit for |
| --- | --- | --- | --- |
| Mon | Back & rear delts | Deadlift 3×5–6 | |
| Tue | Chest & Abs | Incline Bench Press 4×6–8 | |
| Wed | Legs | Barbell Back Squat 4×6–8 | |
| Thu | Shoulders & Abs | Military Press 4×6–8 | Chest (incline DB press) |
| Fri | Arms | Chin-Up 3×6–12 | Back (chin-ups), calves |
| Sat/Sun | Rest, steps and cardio | | |

- **About 2× a week per muscle** and 10–20 hard sets per muscle per week. That's more growth than the classic once-a-week split.
- **Rep ranges plus double progression.** Once you hit the top of the range on every set, the app adds weight.
- **Effort targets.** Stop 1–2 reps short on big lifts; take the last set of accessory work to failure.
- **6-week cycles.** 5 build weeks, then a deload week with about 60% of the sets.
- **Goal-based targets** (build / build & lean out / get shredded): calories, protein, carbs, fat, steps and cardio minutes. A weekly check-in compares your 7-day average body weight against the target rate and tells you what to change.

## The app

- **Workout**: a week strip to choose the day; a preview with the exercises, sets and estimated time; then a focused view of one exercise at a time with today's target weight and reps, a form tip, warm-up sets, the next set highlighted, and a rest timer that shows what's up next. It moves to the next exercise automatically.
- **Week**: day-by-day status, cycle progress, daily nutrition targets, weekly check-in, and sets per muscle group (done vs planned).
- **Progress**: estimated 1-rep max for the main lifts, a chart for any exercise, body-weight trend, and history.
- **Plan**: goal, how the plan works, workout editor (exercises, sets, reps, type, form tips), units, rest times, cycle controls, backup, and trainer notes.

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
