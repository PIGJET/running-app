// Decode a video and feed frames to the pose landmarker.
//
// Capture is driven by requestVideoFrameCallback during muted playback so we
// only ever run detection on frames the browser has actually decoded. When
// rVFC is unavailable we fall back to a currentTime seek-loop.
import type { Landmark, LandmarkFrame, VideoSource } from '../types';
import { getPoseLandmarker, targetFpsForDelegate } from './landmarker';

/** Only the first N seconds of each clip are analyzed. */
const MAX_ANALYSIS_SECONDS = 20;

export interface ProcessVideoOptions {
  /** Reuse an on-screen <video> so the user sees playback + overlay. */
  videoEl?: HTMLVideoElement;
  /** Called for every frame that produced a pose. */
  onFrame?: (frame: LandmarkFrame, videoEl: HTMLVideoElement) => void;
  /** Called for every sampled frame that produced no detection. */
  onSkip?: () => void;
  /** 0..1 progress through the analysis window. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

// requestVideoFrameCallback is not in every TS DOM lib yet; describe the bits
// we use so we can feature-detect without `any` sprinkled everywhere.
interface VideoFrameMeta {
  mediaTime: number;
}
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback: (
    cb: (now: number, metadata: VideoFrameMeta) => void,
  ) => number;
};

function supportsRvfc(el: HTMLVideoElement): el is RvfcVideo {
  return typeof (el as Partial<RvfcVideo>).requestVideoFrameCallback === 'function';
}

function toLandmark(l: { x: number; y: number; z: number; visibility?: number }): Landmark {
  return {
    x: l.x,
    y: l.y,
    z: l.z,
    visibility: typeof l.visibility === 'number' ? l.visibility : 0,
  };
}

function abortError(): DOMException {
  return new DOMException('Video processing aborted', 'AbortError');
}

/** Resolve once the element has dimensions and a first frame decoded. */
function waitForReady(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onReady = () => {
      // HAVE_CURRENT_DATA or better, with real dimensions.
      if (video.readyState >= 2 && video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be decoded (unsupported codec or corrupt file).'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    // In case data is already available.
    onReady();
  });
}

/** Seek and wait for the frame at `time` to be presentable. */
function seekTo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be decoded while seeking.'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    video.currentTime = time;
  });
}

/**
 * Extract pose landmark frames from a video source.
 *
 * The returned array only contains frames where a pose was detected; frames
 * with no detection are reported via `onSkip` and omitted.
 */
export async function processVideo(
  source: VideoSource,
  opts: ProcessVideoOptions = {},
): Promise<LandmarkFrame[]> {
  const { videoEl, onFrame, onSkip, onProgress, signal } = opts;
  const { landmarker, delegate } = await getPoseLandmarker();

  if (signal?.aborted) throw abortError();

  const targetFps = targetFpsForDelegate(delegate);
  const minIntervalMs = 1000 / targetFps;

  const ownsElement = !videoEl;
  const video = videoEl ?? document.createElement('video');
  video.src = source.objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.load();

  const frames: LandmarkFrame[] = [];
  let lastTimestampMs = -1;
  let sampledCount = 0;

  const detect = (timestampMs: number, mediaTimeSec: number) => {
    // detectForVideo requires strictly increasing timestamps.
    if (timestampMs <= lastTimestampMs) return;
    lastTimestampMs = timestampMs;
    sampledCount += 1;
    const result = landmarker.detectForVideo(video, timestampMs);
    const points = result.landmarks[0];
    if (points && points.length > 0) {
      const frame: LandmarkFrame = {
        timestamp: mediaTimeSec,
        landmarks: points.map(toLandmark),
        worldLandmarks: (result.worldLandmarks[0] ?? []).map(toLandmark),
      };
      frames.push(frame);
      onFrame?.(frame, video);
    } else {
      onSkip?.();
    }
  };

  try {
    await waitForReady(video, signal);
    const window = Math.min(
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : MAX_ANALYSIS_SECONDS,
      MAX_ANALYSIS_SECONDS,
    );

    if (supportsRvfc(video)) {
      await runWithRvfc(video, window, minIntervalMs, detect, onProgress, signal);
      if (sampledCount === 0) {
        // rVFC is compositor-driven and stops firing in backgrounded/hidden
        // tabs; the video can then play to 'ended' without a single sample.
        // Recover by re-running with the seek loop, which doesn't depend on
        // the page being visible.
        await runWithSeek(video, window, targetFps, detect, onProgress, signal);
      }
    } else {
      await runWithSeek(video, window, targetFps, detect, onProgress, signal);
    }

    onProgress?.(1);
    return frames;
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    if (ownsElement) {
      video.removeAttribute('src');
      video.load();
    }
  }
}

function runWithRvfc(
  video: RvfcVideo,
  window: number,
  minIntervalMs: number,
  detect: (timestampMs: number, mediaTimeSec: number) => void,
  onProgress: ProcessVideoOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let lastSampleMs = -Infinity;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      video.pause();
      resolve();
    };
    const fail = (err: unknown) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      video.pause();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onAbort = () => fail(abortError());
    signal?.addEventListener('abort', onAbort);

    const frameCb = (_now: number, meta: VideoFrameMeta) => {
      if (done) return;
      if (signal?.aborted) {
        fail(abortError());
        return;
      }
      const mediaTime = meta.mediaTime;
      if (mediaTime > window) {
        onProgress?.(1);
        finish();
        return;
      }
      const mediaMs = mediaTime * 1000;
      if (mediaMs - lastSampleMs >= minIntervalMs) {
        lastSampleMs = mediaMs;
        try {
          detect(Math.round(mediaMs), mediaTime);
        } catch (err) {
          fail(err);
          return;
        }
      }
      onProgress?.(Math.min(mediaTime / window, 1));
      video.requestVideoFrameCallback(frameCb);
    };

    video.addEventListener('ended', () => finish(), { once: true });
    video.requestVideoFrameCallback(frameCb);
    video.play().catch(fail);
  });
}

async function runWithSeek(
  video: HTMLVideoElement,
  window: number,
  targetFps: number,
  detect: (timestampMs: number, mediaTimeSec: number) => void,
  onProgress: ProcessVideoOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  const step = 1 / targetFps;
  for (let t = 0; t <= window + 1e-6; t += step) {
    if (signal?.aborted) throw abortError();
    await seekTo(video, Math.min(t, window), signal);
    detect(Math.round(t * 1000), Math.min(t, window));
    onProgress?.(Math.min(t / window, 1));
  }
}
