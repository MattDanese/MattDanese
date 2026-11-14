# M-F Lift

A phone-friendly workout tracker for the Muscle & Strength
[M-F Workout Routine](https://www.muscleandstrength.com/workouts/m-f-workout-routine), a 5-day body-part split:

| Day | Focus | Lead lift |
| --- | --- | --- |
| Mon | Back | Deadlift 4×6 |
| Tue | Chest & Abs | Incline Bench Press 4×6 |
| Wed | Legs | Barbell Back Squat 5×6 |
| Thu | Shoulders & Abs | Military Press 4×6 |
| Fri | Arms | Close-Grip Bench Press 4×6–8 |
| Sat/Sun | Rest + optional cardio | |

> The day structure and lead lifts come from the source routine. Accessory exercises marked **check** in
> the Program tab are placeholders. Compare them with the article and edit or confirm them in the app.

## What it does

- **Today** opens the right workout for the day. Log weight and reps for each set and check it off, which starts a rest timer (2:30 for big lifts, 1:30 for accessories). If you miss a day, you can make it up later in the week.
- **Built-in progressive overload** (double progression). Each exercise shows what you did last time and what to do today:
  - Hit the top of the rep range on every set → add weight (+10 lb on squat/deadlift-type lifts, +5 lb on everything else; 5 / 2.5 kg).
  - Partial success → same weight, add reps.
  - Missed the bottom of the range two sessions in a row → deload about 10%.
- **Week**: Mon–Sun completion grid, volume compared with last week, hard sets per muscle group, a streak of full weeks, and body-weight logging.
- **Progress**: estimated 1-rep-max chart for any exercise, best lifts board, body-weight trend, and full workout history.
- **Program**: edit exercises, sets and rep ranges, switch between lb and kg, set rest times, export/import backups, and a short guide to eating and recovery for building muscle.

All data stays in your browser (localStorage) with no account or server. Use **Export backup** from time to time.

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
