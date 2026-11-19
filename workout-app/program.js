/*
 * Default program: 3 workouts a week, done in order on whichever days you make it to the gym.
 *   1. Back & Biceps     (usually Mon)
 *   2. Chest & Triceps   (usually Tue) — flat bench + incline dumbbell press, also covers shoulders
 *   3. Legs & Abs        (usually Wed)
 * Lead lifts come from the Muscle & Strength M-F routine
 * (https://www.muscleandstrength.com/workouts/m-f-workout-routine).
 *
 * Training each muscle once a week works when every session has enough hard sets
 * (about 9–12 for the big muscles) and you keep adding weight or reps, so sessions are
 * ~19–21 working sets (~60–70 min).
 *
 * Exercise names match earlier versions of the app wherever the exercise was kept,
 * so logged history keeps driving the weight suggestions.
 *
 * kind controls rest time and the progression jump:
 *   lower = big lower-body lift, upper = big upper-body lift,
 *   iso = isolation / machine work, bw = bodyweight (add reps, then add weight)
 * repMax: null means "to failure".  usual: ISO weekday (1 = Mon … 7 = Sun) you normally train it.
 */
(function (root) {
  const ex = (name, sets, repMin, repMax, kind, muscle, cue) => ({ name, sets, repMin, repMax, kind, muscle, cue });

  const PROGRAM_VERSION = 4;

  const DEFAULT_PROGRAM = {
    name: '3-Day Split: Muscle & Shred',
    version: PROGRAM_VERSION,
    days: {
      1: {
        name: 'Back & Biceps',
        usual: 1,
        focus: 'Back width & thickness, biceps, rear delts',
        exercises: [
          ex('Deadlift', 3, 5, 6, 'lower', 'Back', 'Bar over mid-foot, brace hard, push the floor away. Leave 2 reps in the tank; no grinding.'),
          ex('Lat Pulldown', 3, 8, 12, 'iso', 'Back', 'Drive elbows down to your back pockets. Pause at the bottom, full stretch at the top.'),
          ex('Chest-Supported Row', 3, 8, 12, 'upper', 'Back', 'Chest stays on the pad. Pull elbows past your torso and squeeze for a second.'),
          ex('Seated Cable Row', 2, 10, 12, 'iso', 'Back', 'Tall chest, slight lean forward for the stretch, row to your belly button.'),
          ex('Face Pull', 3, 15, 20, 'iso', 'Rear delts', 'Rope to eye level, pull apart and rotate thumbs back. Keeps shoulders healthy.'),
          ex('EZ-Bar Curl', 3, 8, 12, 'iso', 'Biceps', 'Elbows pinned at your sides, squeeze at the top, 2-second lowering.'),
          ex('Incline Dumbbell Curl', 2, 10, 15, 'iso', 'Biceps', 'Arms hang behind your body for the stretch. No swinging. Last set to failure.'),
        ],
      },
      2: {
        name: 'Chest & Triceps',
        usual: 2,
        focus: 'Flat & incline pressing, shoulders, triceps',
        exercises: [
          ex('Bench Press', 4, 6, 8, 'upper', 'Chest', 'Shoulder blades pinned, feet planted, slight arch. Lower to mid-chest, press up and slightly back. Leave 1–2 reps in the tank.'),
          ex('Incline Dumbbell Press', 3, 8, 12, 'upper', 'Chest', '30° bench, deep stretch at the bottom, press up and slightly in. This is your upper-chest work.'),
          ex('Flat Dumbbell Press', 3, 8, 10, 'upper', 'Chest', 'Deep stretch at the bottom, elbows ~45°, press the dumbbells together.'),
          ex('Cable Fly', 2, 12, 15, 'iso', 'Chest', 'Slight elbow bend, hug a big tree, squeeze hands together for a second.'),
          ex('Military Press', 3, 6, 8, 'upper', 'Shoulders', 'Squeeze glutes, bar path close to the face, push your head through at the top.'),
          ex('Lateral Raise', 3, 12, 20, 'iso', 'Side delts', 'Lead with the elbows, raise out to the side to shoulder height. Light weight, strict form.'),
          ex('Overhead Cable Triceps Extension', 3, 10, 15, 'iso', 'Triceps', 'Big stretch behind the head; this hits the long head of the triceps.'),
          ex('Triceps Pushdown', 2, 12, 15, 'iso', 'Triceps', 'Elbows fixed, lock out hard. Take the last set to failure.'),
        ],
      },
      3: {
        name: 'Legs & Abs',
        usual: 3,
        focus: 'Quads, hamstrings, glutes, calves, core',
        exercises: [
          ex('Barbell Back Squat', 4, 6, 8, 'lower', 'Quads', 'Brace, sit between your heels, hit at least parallel, drive up through mid-foot.'),
          ex('Romanian Deadlift', 3, 8, 10, 'lower', 'Hamstrings', 'Soft knees, push hips back until the hamstrings are stretched, flat back.'),
          ex('Leg Press', 3, 10, 15, 'lower', 'Quads', 'Feet shoulder-width, full depth without the lower back peeling off the pad.'),
          ex('Lying Leg Curl', 3, 10, 15, 'iso', 'Hamstrings', 'Hips pressed down, control the lowering for 2–3 seconds.'),
          ex('Standing Calf Raise', 3, 10, 15, 'iso', 'Calves', 'Pause 2 seconds in the bottom stretch, then rise all the way up. No bouncing.'),
          ex('Cable Crunch', 3, 10, 15, 'iso', 'Abs', 'Curl ribs toward hips; your hips stay still. Exhale hard at the bottom.'),
          ex('Hanging Leg Raise', 2, 10, 15, 'bw', 'Abs', 'Curl the pelvis up, not just the legs. No swinging.'),
        ],
      },
    },
  };

  const api = { DEFAULT_PROGRAM, PROGRAM_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
