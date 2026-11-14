/*
 * Default program: built on the Muscle & Strength "M-F Workout Routine" 5-day split
 * (https://www.muscleandstrength.com/workouts/m-f-workout-routine), keeping its
 * Mon Back / Tue Chest / Wed Legs / Thu Shoulders / Fri Arms structure and lead lifts,
 * tuned for hypertrophy and fat loss:
 *   - each major muscle gets a second, lighter hit during the week (≈2×/week frequency)
 *   - 10–20 hard sets per muscle per week, ~18–20 working sets per session (~60 min)
 *   - rep ranges on the main lifts (6–8) so double progression works
 *   - an effort target (reps in reserve) and a form cue on every exercise
 *
 * kind controls rest time and the progression jump:
 *   lower = big lower-body lift, upper = big upper-body lift,
 *   iso = isolation / machine work, bw = bodyweight (add reps, then add weight)
 * repMax: null means "to failure".
 * muscle: primary muscle, used for the weekly sets-per-muscle chart.
 */
(function (root) {
  const ex = (name, sets, repMin, repMax, kind, muscle, cue) => ({ name, sets, repMin, repMax, kind, muscle, cue });

  const PROGRAM_VERSION = 2;

  const DEFAULT_PROGRAM = {
    name: 'M-F Split: Muscle & Shred',
    version: PROGRAM_VERSION,
    days: {
      1: {
        name: 'Back',
        focus: 'Back thickness & width, rear delts',
        exercises: [
          ex('Deadlift', 3, 5, 6, 'lower', 'Back', 'Bar over mid-foot, brace hard, push the floor away. Leave 2 reps in the tank; no grinding.'),
          ex('Lat Pulldown', 4, 8, 12, 'iso', 'Back', 'Drive elbows down to your back pockets. Pause at the bottom, full stretch at the top.'),
          ex('Chest-Supported Row', 3, 8, 12, 'upper', 'Back', 'Chest stays on the pad. Pull elbows past your torso and squeeze for a second.'),
          ex('Seated Cable Row', 3, 10, 12, 'iso', 'Back', 'Tall chest, slight lean forward for the stretch, row to your belly button.'),
          ex('Straight-Arm Pulldown', 2, 12, 15, 'iso', 'Back', 'Soft elbows, sweep the bar to your thighs using your lats, not your triceps.'),
          ex('Face Pull', 3, 15, 20, 'iso', 'Rear delts', 'Rope to eye level, pull apart and rotate thumbs back. Keeps shoulders healthy.'),
        ],
      },
      2: {
        name: 'Chest & Abs',
        focus: 'Upper chest priority, core',
        exercises: [
          ex('Incline Bench Press', 4, 6, 8, 'upper', 'Chest', '30° bench, shoulder blades pinned, touch upper chest, press up and slightly back.'),
          ex('Flat Dumbbell Press', 3, 8, 10, 'upper', 'Chest', 'Deep stretch at the bottom, elbows ~45°, press the dumbbells together.'),
          ex('Cable Fly', 3, 12, 15, 'iso', 'Chest', 'Slight elbow bend, hug a big tree, squeeze hands together for a second.'),
          ex('Dips', 3, 8, 12, 'bw', 'Chest', 'Lean forward, go to a deep stretch. Add weight once you hit 12 on every set.'),
          ex('Cable Crunch', 3, 10, 15, 'iso', 'Abs', 'Curl ribs toward hips; your hips stay still. Exhale hard at the bottom.'),
          ex('Hanging Leg Raise', 3, 10, 15, 'bw', 'Abs', 'Curl the pelvis up, not just the legs. No swinging.'),
        ],
      },
      3: {
        name: 'Legs',
        focus: 'Quads, hamstrings, glutes, calves',
        exercises: [
          ex('Barbell Back Squat', 4, 6, 8, 'lower', 'Quads', 'Brace, sit between your heels, hit at least parallel, drive up through mid-foot.'),
          ex('Romanian Deadlift', 3, 8, 10, 'lower', 'Hamstrings', 'Soft knees, push hips back until the hamstrings are stretched, flat back.'),
          ex('Leg Press', 3, 10, 15, 'lower', 'Quads', 'Feet shoulder-width, full depth without the lower back peeling off the pad.'),
          ex('Lying Leg Curl', 3, 10, 15, 'iso', 'Hamstrings', 'Hips pressed down, control the lowering for 2–3 seconds.'),
          ex('Bulgarian Split Squat', 2, 8, 12, 'iso', 'Glutes', 'Reps are per leg. Long stance, torso leaning slightly forward, sink straight down.'),
          ex('Standing Calf Raise', 4, 10, 15, 'iso', 'Calves', 'Pause 2 seconds in the bottom stretch, then rise all the way up. No bouncing.'),
        ],
      },
      4: {
        name: 'Shoulders & Abs',
        focus: 'Wide delts, 2nd chest hit, core',
        exercises: [
          ex('Military Press', 4, 6, 8, 'upper', 'Shoulders', 'Squeeze glutes, bar path close to the face, push your head through at the top.'),
          ex('Incline Dumbbell Press', 3, 8, 12, 'upper', 'Chest', 'Your second chest session of the week. Moderate weight, big stretch, 1–2 reps in reserve.'),
          ex('Lateral Raise', 4, 12, 20, 'iso', 'Side delts', 'Lead with the elbows, raise out to the side to shoulder height. Light weight, strict form.'),
          ex('Reverse Pec Deck', 3, 15, 20, 'iso', 'Rear delts', 'Arms long, sweep wide, squeeze the back of the shoulders.'),
          ex('Dumbbell Shrug', 3, 10, 15, 'iso', 'Traps', 'Straight up to the ears, hold 1 second at the top. No rolling.'),
          ex('Ab Wheel Rollout', 3, 8, 12, 'bw', 'Abs', 'Tuck your pelvis, roll out only as far as you can without the lower back sagging.'),
        ],
      },
      5: {
        name: 'Arms',
        focus: 'Biceps, triceps, 2nd back hit, calves',
        exercises: [
          ex('Chin-Up', 3, 6, 12, 'bw', 'Back', 'Your second back session of the week. Full hang to chest-to-bar. Add weight once you hit 12.'),
          ex('Close-Grip Bench Press', 3, 6, 8, 'upper', 'Triceps', 'Hands just inside shoulder width, elbows tucked, touch the lower chest.'),
          ex('EZ-Bar Curl', 3, 8, 12, 'iso', 'Biceps', 'Elbows pinned at your sides, squeeze at the top, 2-second lowering.'),
          ex('Overhead Cable Triceps Extension', 3, 10, 15, 'iso', 'Triceps', 'Big stretch behind the head; this hits the long head of the triceps.'),
          ex('Incline Dumbbell Curl', 3, 10, 15, 'iso', 'Biceps', 'Arms hang behind your body for the stretch. No swinging.'),
          ex('Triceps Pushdown', 2, 12, 15, 'iso', 'Triceps', 'Elbows fixed, lock out hard. Take the last set to failure.'),
          ex('Seated Calf Raise', 3, 12, 20, 'iso', 'Calves', 'Your second calf session of the week. Pause in the stretch.'),
        ],
      },
    },
  };

  const api = { DEFAULT_PROGRAM, PROGRAM_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
