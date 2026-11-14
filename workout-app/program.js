/*
 * Default program: Muscle & Strength "M-F Workout Routine" (5-day body-part split).
 * Source: https://www.muscleandstrength.com/workouts/m-f-workout-routine
 *
 * Exercises marked `verify: true` were filled in where the source text was not
 * available when this was built. Check them against the article and adjust in
 * the app's Program tab.
 *
 * kind controls the progression jump:
 *   lower = big lower-body lift, upper = big upper-body press/row,
 *   iso = isolation / machine work, bw = bodyweight (progress by reps)
 * repMax: null means "to failure".
 */
(function (root) {
  const ex = (name, sets, repMin, repMax, kind, extra = {}) =>
    Object.assign({ name, sets, repMin, repMax, kind }, extra);

  const DEFAULT_PROGRAM = {
    name: 'M-F Workout Routine',
    days: {
      1: {
        name: 'Back',
        exercises: [
          ex('Deadlift', 4, 6, 6, 'lower', { muscle: 'Back' }),
          ex('Lat Pulldown', 4, 8, 12, 'iso', { muscle: 'Back' }),
          ex('Barbell Bent-Over Row', 4, 8, 12, 'upper', { muscle: 'Back', verify: true }),
          ex('Seated Cable Row', 3, 8, 12, 'iso', { muscle: 'Back', verify: true }),
          ex('Straight-Arm Pulldown', 3, 12, 15, 'iso', { muscle: 'Back', verify: true }),
        ],
      },
      2: {
        name: 'Chest & Abs',
        exercises: [
          ex('Incline Bench Press', 4, 6, 6, 'upper', { muscle: 'Chest' }),
          ex('Decline Bench Press', 4, 8, 12, 'upper', { muscle: 'Chest', verify: true }),
          ex('Machine Chest Press', 3, 8, 12, 'iso', { muscle: 'Chest', verify: true }),
          ex('Dumbbell Flyes', 3, 10, 12, 'iso', { muscle: 'Chest', verify: true }),
          ex('Push-Ups', 2, 1, null, 'bw', { muscle: 'Chest' }),
          ex('Hanging Leg Raise', 3, 12, 15, 'bw', { muscle: 'Abs', verify: true }),
          ex('Cable Crunch', 3, 12, 15, 'iso', { muscle: 'Abs', verify: true }),
        ],
      },
      3: {
        name: 'Legs',
        exercises: [
          ex('Barbell Back Squat', 5, 6, 6, 'lower', { muscle: 'Legs' }),
          ex('Romanian Deadlift', 4, 8, 10, 'lower', { muscle: 'Legs', verify: true }),
          ex('Leg Press', 4, 10, 12, 'lower', { muscle: 'Legs', verify: true }),
          ex('Lying Leg Curl', 3, 10, 12, 'iso', { muscle: 'Legs', verify: true }),
          ex('Walking Lunge (each leg)', 3, 10, 12, 'iso', { muscle: 'Legs', verify: true }),
          ex('Standing Calf Raise', 4, 12, 15, 'iso', { muscle: 'Calves', verify: true }),
        ],
      },
      4: {
        name: 'Shoulders & Abs',
        exercises: [
          ex('Military Press', 4, 6, 6, 'upper', { muscle: 'Shoulders' }),
          ex('Dumbbell Lateral Raise', 4, 10, 12, 'iso', { muscle: 'Shoulders', verify: true }),
          ex('Reverse Machine Fly', 4, 12, 15, 'iso', { muscle: 'Shoulders', verify: true }),
          ex('Barbell Shrug', 3, 10, 12, 'iso', { muscle: 'Traps', verify: true }),
          ex('Crunch', 3, 15, 20, 'bw', { muscle: 'Abs', verify: true }),
          ex('Plank (seconds)', 3, 45, 60, 'bw', { muscle: 'Abs', verify: true }),
        ],
      },
      5: {
        name: 'Arms',
        exercises: [
          ex('Close-Grip Bench Press', 4, 6, 8, 'upper', { muscle: 'Triceps', verify: true }),
          ex('Barbell Curl', 4, 8, 10, 'iso', { muscle: 'Biceps', verify: true }),
          ex('Triceps Pushdown', 3, 10, 12, 'iso', { muscle: 'Triceps', verify: true }),
          ex('Hammer Curl', 3, 10, 12, 'iso', { muscle: 'Biceps', verify: true }),
          ex('Overhead Triceps Extension', 3, 10, 12, 'iso', { muscle: 'Triceps', verify: true }),
          ex('Preacher Curl', 3, 10, 12, 'iso', { muscle: 'Biceps', verify: true }),
        ],
      },
    },
  };

  const api = { DEFAULT_PROGRAM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
