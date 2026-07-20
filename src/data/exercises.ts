// Catalog of running-form exercises and the issue -> exercise mapping used to
// turn detected gait issues into actionable, coaching-style recommendations.
//
// TONE NOTE: everything here is coaching language, not medical advice. Copy in
// `whyItMatters` should describe efficiency costs and *associations* with injury
// load ("is often associated with", "may increase load on"), and must never
// diagnose a condition or promise that any exercise prevents injury.

import type { Exercise } from '../types';

/**
 * Guidance for a single detected issue: why a runner should care, plus the
 * ordered (most-relevant-first) list of exercise ids that address it.
 *
 * Defined and exported locally on purpose — this shape is specific to the data
 * layer and does not belong in the shared `types.ts`.
 */
export interface IssueGuide {
  issueId: string;
  whyItMatters: string;
  exerciseIds: string[];
}

/**
 * The exercise knowledge base. Each entry is intentionally small and readable
 * so a coach can edit copy without touching any logic. `targetsIssues` values
 * must be issue ids from the detection contract (see ISSUE_GUIDES below).
 */
export const EXERCISES: Exercise[] = [
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    muscles: ['gluteus maximus', 'hamstrings', 'core'],
    howTo:
      'Lie on your back with knees bent and feet flat, hip-width apart. Squeeze your glutes and lift your hips until your body forms a straight line from knees to shoulders. Pause briefly at the top, then lower with control. Keep your ribs down so you drive with the hips, not your lower back.',
    setsReps: '3×12',
    targetsIssues: ['trunk-lean-excessive'],
  },
  {
    id: 'single-leg-glute-bridge',
    name: 'Single-Leg Glute Bridge',
    muscles: ['gluteus maximus', 'hamstrings', 'core'],
    howTo:
      'Set up as for a glute bridge, then extend one leg straight out. Drive through the planted heel to lift your hips, keeping them level across the front of your pelvis. Lower slowly and finish all reps before switching sides. Match the range and control on both legs.',
    setsReps: '3×10 each side',
    targetsIssues: ['hip-drop', 'stride-asymmetry-high'],
  },
  {
    id: 'clamshells',
    name: 'Clamshells',
    muscles: ['gluteus medius', 'hip external rotators'],
    howTo:
      'Lie on your side with hips and knees bent about 45 degrees, heels together. Keeping your feet touching and pelvis still, rotate the top knee up like a clamshell opening. Do not let your top hip roll backward. Lower with control and repeat.',
    setsReps: '3×15 each side',
    targetsIssues: ['hip-drop'],
  },
  {
    id: 'side-lying-hip-abduction',
    name: 'Side-Lying Hip Abduction',
    muscles: ['gluteus medius', 'gluteus minimus'],
    howTo:
      'Lie on your side with legs stacked and straight. Lift the top leg toward the ceiling, leading with the heel and keeping the toes pointing forward, not up. Raise it to about shoulder height, then lower slowly. Keep your torso still so the hip does the work.',
    setsReps: '3×12 each side',
    targetsIssues: ['hip-drop'],
  },
  {
    id: 'single-leg-step-down',
    name: 'Single-Leg Step-Down',
    muscles: ['quadriceps', 'gluteus maximus', 'gluteus medius'],
    howTo:
      'Stand on one leg at the edge of a low step. Slowly bend the standing knee to lower the other heel toward the floor, tapping lightly. Keep the kneecap tracking over your middle toes and your pelvis level. Push back up through the standing leg.',
    setsReps: '3×10 each side',
    targetsIssues: ['knee-valgus', 'stride-asymmetry-high'],
  },
  {
    id: 'monster-walks',
    name: 'Monster Walks (Band)',
    muscles: ['gluteus medius', 'hip abductors'],
    howTo:
      'Place a resistance band around your legs just above the knees and drop into a quarter-squat. Take controlled steps forward and diagonally, keeping constant tension on the band. Do not let your knees cave inward. Keep your chest up and hips low throughout.',
    setsReps: '3×10 steps each direction',
    targetsIssues: ['knee-valgus'],
  },
  {
    id: 'lateral-band-walks',
    name: 'Lateral Band Walks',
    muscles: ['gluteus medius', 'hip abductors'],
    howTo:
      'Loop a band above your knees or around your ankles and set a small squat stance. Step sideways, leading with one foot and following with the other while keeping tension in the band. Keep your feet pointing forward and knees pushed out. Travel one direction, then lead back the other way.',
    setsReps: '3×12 steps each direction',
    targetsIssues: ['knee-valgus'],
  },
  {
    id: 'calf-raises-straight-knee',
    name: 'Straight-Knee Calf Raises',
    muscles: ['gastrocnemius', 'soleus'],
    howTo:
      'Stand tall with legs straight, balls of your feet on the edge of a step and heels hanging off. Rise onto your toes as high as you can, pause at the top, then lower your heels slowly below the step. Keep the knees straight to bias the larger calf muscle. Hold a wall for balance if needed.',
    setsReps: '3×15',
    targetsIssues: ['heel-strike-pronounced', 'vertical-oscillation-high'],
  },
  {
    id: 'calf-raises-bent-knee',
    name: 'Bent-Knee Calf Raises',
    muscles: ['soleus', 'ankle stabilizers'],
    howTo:
      'Stand with the balls of your feet on a step and bend your knees to a soft, held quarter-squat. Keeping that knee bend fixed, rise onto your toes, pause, then lower your heels with control. The bent knee shifts the work toward the deeper calf muscle that handles running loads. Move slowly and avoid bouncing.',
    setsReps: '3×15',
    targetsIssues: ['heel-strike-pronounced'],
  },
  {
    id: 'high-knees-drill',
    name: 'High-Knees Drill',
    muscles: ['hip flexors', 'calves', 'core'],
    howTo:
      'Run in place or move forward slowly, driving each knee up to hip height. Stay tall and light, landing on the balls of your feet under your body. Use quick, snappy ground contacts rather than big bounds. Pump the arms in rhythm with the legs.',
    setsReps: '3×20m or 3×20s',
    targetsIssues: ['cadence-low', 'overstriding-high'],
  },
  {
    id: 'butt-kicks-drill',
    name: 'Butt Kicks Drill',
    muscles: ['hamstrings', 'calves'],
    howTo:
      'Jog slowly in place or forward while flicking your heels up toward your glutes. Keep the motion quick and compact, letting the lower leg fold rather than kicking hard. Stay tall with a light, fast turnover. This grooves a quicker, more compact recovery of the trailing leg.',
    setsReps: '3×20m or 3×20s',
    targetsIssues: ['heel-strike-pronounced'],
  },
  {
    id: 'metronome-cadence-run',
    name: 'Metronome Cadence Run',
    muscles: ['full-body coordination'],
    howTo:
      'Set a metronome or a cadence playlist a few steps per minute faster than your usual turnover. Run easy and match one footfall to each beat, taking slightly shorter, quicker steps. Focus on landing softly with your foot under your hips. Use short intervals and build up as the faster rhythm feels natural.',
    setsReps: '4×2min at +5% cadence',
    targetsIssues: ['cadence-low', 'overstriding-high', 'vertical-oscillation-high'],
  },
  {
    id: 'a-skips',
    name: 'A-Skips',
    muscles: ['hip flexors', 'calves', 'core'],
    howTo:
      'Skip forward, driving one knee up to hip height while the opposite arm swings in sync. Land on the ball of the foot under your body with a quick, springy contact. Stay tall and rhythmic rather than reaching forward. Keep the arms driving cleanly front-to-back.',
    setsReps: '3×20m',
    targetsIssues: ['cadence-low', 'vertical-oscillation-high', 'arm-swing-asymmetric'],
  },
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    muscles: ['deep core', 'hip flexors'],
    howTo:
      'Lie on your back with arms reaching to the ceiling and knees stacked over hips. Slowly lower the opposite arm and leg toward the floor while pressing your lower back into the ground. Return to the start and alternate sides. Move slowly and keep your core braced so the trunk does not twist.',
    setsReps: '3×8 each side',
    targetsIssues: ['trunk-lean-insufficient', 'arm-swing-asymmetric', 'arm-crossover'],
  },
  {
    id: 'forearm-plank',
    name: 'Forearm Plank',
    muscles: ['deep core', 'shoulders', 'glutes'],
    howTo:
      'Rest on your forearms and toes with elbows under your shoulders. Squeeze your glutes and brace your core so your body forms one straight line from head to heels. Keep your hips from sagging or piking up. Breathe steadily and hold the position.',
    setsReps: '3×30s hold',
    targetsIssues: ['trunk-lean-excessive', 'trunk-lean-insufficient', 'arm-crossover'],
  },
  {
    id: 'couch-stretch',
    name: 'Couch Stretch (Hip Flexor)',
    muscles: ['hip flexors', 'quadriceps'],
    howTo:
      'Kneel in front of a wall or couch and place the top of one foot up behind you against it, with the other foot planted in front. Tuck your pelvis and gently press your hips forward until you feel a stretch across the front of the rear hip and thigh. Keep your torso tall rather than arching your lower back. Breathe and hold, then switch sides.',
    setsReps: '2×30s each side',
    targetsIssues: ['overstriding-high', 'trunk-lean-excessive'],
  },
  {
    id: 'single-leg-balance',
    name: 'Single-Leg Balance',
    muscles: ['ankle stabilizers', 'gluteus medius', 'core'],
    howTo:
      'Stand on one foot with a soft knee and your pelvis level. Hold steady for the full time, keeping the arch of your foot active and the knee tracking over your toes. Progress by closing your eyes or standing on a folded towel. Match the difficulty and hold time on both legs.',
    setsReps: '3×30s each side',
    targetsIssues: ['hip-drop', 'stride-asymmetry-high'],
  },
  {
    id: 'arm-swing-drill',
    name: 'Arm-Swing Mirror Drill',
    muscles: ['shoulders', 'upper back'],
    howTo:
      'Stand tall in front of a mirror with elbows bent to about 90 degrees. Drive the arms straight front-to-back, hands travelling from hip to chest height without crossing your body midline. Keep the shoulders relaxed and the motion symmetrical on both sides. Add a light jog in place once the pattern feels even.',
    setsReps: '3×30s',
    targetsIssues: ['arm-swing-asymmetric', 'arm-crossover'],
  },
  {
    id: 'wall-lean-drill',
    name: 'Wall Lean Posture Drill',
    muscles: ['calves', 'core', 'glutes'],
    howTo:
      'Stand an arm’s length from a wall and lean into it with a straight body line from ankles to head, catching yourself with your hands. Feel the lean originate from your ankles, not a fold at the hips. Hold that tall, slightly forward posture and notice the balanced weight over the balls of your feet. Step back and try to recreate the same alignment while running.',
    setsReps: '3×20s hold',
    targetsIssues: ['trunk-lean-insufficient'],
  },
];

/**
 * One guide per detected issue id from the detection contract. `exerciseIds`
 * are ordered most-relevant-first and must reference ids present in EXERCISES.
 */
export const ISSUE_GUIDES: IssueGuide[] = [
  {
    issueId: 'cadence-low',
    whyItMatters:
      'A lower step rate usually means longer, more airborne strides, which tends to raise the impact your body absorbs on each landing. Nudging cadence up a few percent is one of the simplest ways to run more efficiently. Higher, lighter turnover is often associated with reduced peak loads through the legs.',
    exerciseIds: ['metronome-cadence-run', 'high-knees-drill', 'a-skips'],
  },
  {
    issueId: 'overstriding-high',
    whyItMatters:
      'Landing with the foot well ahead of your hips creates a braking force that fights your forward momentum and wastes energy. That reaching pattern may increase load on the shin and knee as the leg decelerates. Shortening and quickening the stride so you land closer to under your body tends to smooth things out.',
    exerciseIds: ['metronome-cadence-run', 'high-knees-drill', 'couch-stretch'],
  },
  {
    issueId: 'heel-strike-pronounced',
    whyItMatters:
      'A hard heel-first landing with a straight knee sends a sharp impact spike up the leg and adds to braking. It is often associated with more stress at the knee and shin. Building calf strength and a quicker, more compact footfall helps the lower leg absorb landings more gradually.',
    exerciseIds: ['butt-kicks-drill', 'calf-raises-straight-knee', 'calf-raises-bent-knee'],
  },
  {
    issueId: 'vertical-oscillation-high',
    whyItMatters:
      'Excessive up-and-down bounce means energy is going into lifting your body rather than moving you forward, so it costs efficiency. All that extra rise also means a harder landing on the way down. Directing effort forward with quicker, springier steps appears to lower this wasted vertical motion.',
    exerciseIds: ['metronome-cadence-run', 'a-skips', 'calf-raises-straight-knee'],
  },
  {
    issueId: 'trunk-lean-excessive',
    whyItMatters:
      'Folding forward at the hips shifts your posture and is often associated with a tired or under-active core and hip extensors. It can put extra load on the lower back and change how your legs swing through. Strengthening the core and glutes while freeing up the hip flexors helps you hold a taller, more efficient line.',
    exerciseIds: ['forearm-plank', 'glute-bridge', 'couch-stretch'],
  },
  {
    issueId: 'trunk-lean-insufficient',
    whyItMatters:
      'Running too upright or leaning back places your weight behind your center of mass, which can add a subtle braking effect on each step. A small lean originating from the ankles lets gravity assist your forward momentum. Core control and a rehearsed posture make that slight forward lean feel stable rather than a fold at the waist.',
    exerciseIds: ['wall-lean-drill', 'forearm-plank', 'dead-bug'],
  },
  {
    issueId: 'arm-swing-asymmetric',
    whyItMatters:
      'When the left and right arms move differently, the mismatch often reflects an imbalance elsewhere in the body and can nudge your stride out of sync. Uneven arm drive may lead to rotational compensations that cost efficiency. Grooving a symmetrical, front-to-back swing helps the whole gait feel more even.',
    exerciseIds: ['arm-swing-drill', 'a-skips', 'dead-bug'],
  },
  {
    issueId: 'arm-crossover',
    whyItMatters:
      'Arms swinging across your body midline usually signals rotational compensation, meaning your torso is twisting to balance the legs. That extra rotation is often associated with wasted energy and a less stable core. Training the arms to drive straight and bracing the trunk against rotation keeps momentum pointed forward.',
    exerciseIds: ['arm-swing-drill', 'dead-bug', 'forearm-plank'],
  },
  {
    issueId: 'hip-drop',
    whyItMatters:
      'When the pelvis dips toward the swinging-leg side during stance, the muscles on the outside of the standing hip may not be controlling the load well. This pattern is often associated with extra strain at the knee, hip, and lower back. Strengthening the side-hip stabilizers helps keep the pelvis level and steady each step.',
    exerciseIds: ['single-leg-glute-bridge', 'side-lying-hip-abduction', 'clamshells', 'single-leg-balance'],
  },
  {
    issueId: 'knee-valgus',
    whyItMatters:
      'A knee that collapses inward during stance changes how force travels through the joint and is often associated with increased load at the knee and kneecap. It usually points to hip and glute muscles that could steer the leg more strongly. Training the hips to keep the knee tracking over the foot tends to make landings more stable.',
    exerciseIds: ['single-leg-step-down', 'lateral-band-walks', 'monster-walks'],
  },
  {
    issueId: 'stride-asymmetry-high',
    whyItMatters:
      'A sizable left-versus-right difference in timing or range of motion means one side is working differently from the other, which can quietly cost efficiency. Persistent imbalances may increase load on the harder-working side over long runs. Single-leg strength and balance work helps even out the two sides.',
    exerciseIds: ['single-leg-step-down', 'single-leg-glute-bridge', 'single-leg-balance'],
  },
];

// Index for O(1) lookups; built once at module load.
const EXERCISE_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

/**
 * Resolve an issue id to its ordered list of recommended exercises via
 * ISSUE_GUIDES. Order follows the guide (most relevant first), duplicates are
 * removed, and unknown ids (or ids referencing missing exercises) are skipped.
 * Returns [] for an issue id that has no guide.
 */
export function getExercisesForIssue(issueId: string): Exercise[] {
  const guide = ISSUE_GUIDES.find((g) => g.issueId === issueId);
  if (!guide) return [];

  const seen = new Set<string>();
  const result: Exercise[] = [];
  for (const id of guide.exerciseIds) {
    if (seen.has(id)) continue;
    const exercise = EXERCISE_BY_ID.get(id);
    if (!exercise) continue;
    seen.add(id);
    result.push(exercise);
  }
  return result;
}
