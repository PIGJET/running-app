// Lazy singleton factory for the MediaPipe Pose Landmarker.
//
// The app is otherwise offline-friendly, but in v1 the WASM runtime and the
// model file are fetched from CDNs on first use. We try the GPU delegate first
// and transparently fall back to CPU so the pipeline still runs on machines
// without WebGL2.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export type PoseDelegate = 'GPU' | 'CPU';

export interface PoseLandmarkerBundle {
  landmarker: PoseLandmarker;
  /** The delegate that actually initialized — surface it in the UI. */
  delegate: PoseDelegate;
}

let bundlePromise: Promise<PoseLandmarkerBundle> | null = null;

/** Cheap probe: GPU delegate needs a working WebGL2 context. */
function hasWebGl2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

async function createLandmarker(delegate: PoseDelegate): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

async function initBundle(): Promise<PoseLandmarkerBundle> {
  if (hasWebGl2()) {
    try {
      const landmarker = await createLandmarker('GPU');
      return { landmarker, delegate: 'GPU' };
    } catch (err) {
      console.warn('[pose] GPU delegate failed, falling back to CPU', err);
    }
  }
  const landmarker = await createLandmarker('CPU');
  return { landmarker, delegate: 'CPU' };
}

/**
 * Returns the shared PoseLandmarker, initializing it on first call. If
 * initialization fails the cached promise is cleared so a later call can retry.
 */
export function getPoseLandmarker(): Promise<PoseLandmarkerBundle> {
  if (bundlePromise === null) {
    bundlePromise = initBundle().catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

/** Target sampling rate: GPU can keep up at 24fps, CPU is throttled to 15fps. */
export function targetFpsForDelegate(delegate: PoseDelegate): number {
  return delegate === 'GPU' ? 24 : 15;
}
