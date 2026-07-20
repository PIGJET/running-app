import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import VideoOverlayPlayer from '../components/VideoOverlayPlayer';
import { useAnalysis } from '../state/AnalysisContext';
import { getPoseLandmarker, type PoseDelegate } from '../pose/landmarker';
import { processVideo } from '../pose/videoProcessor';
import { segmentGaitCycles } from '../analysis/gaitCycles';
import type { LandmarkFrame } from '../types';

type Phase = 'processing' | 'done' | 'error';

interface VideoError {
  fileName: string;
  message: string;
}

function humanizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred while processing this video.';
}

function ProcessingPage() {
  const { videos, framesByVideo, setVideoFrames } = useAnalysis();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<LandmarkFrame | null>(null);

  // Live counters are kept in refs (updated per-frame) and flushed to state on
  // an interval so per-frame detections don't trigger a React render each time.
  const detectedRef = useRef(0);
  const skippedRef = useRef(0);
  const progressRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('processing');
  const [delegate, setDelegate] = useState<PoseDelegate | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [display, setDisplay] = useState({ detected: 0, skipped: 0, progress: 0 });
  const [videoErrors, setVideoErrors] = useState<VideoError[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const hasVideos = videos.length > 0;

  // Debug readout: segment gait cycles on the fly once extraction is done.
  // Nothing is persisted to context yet — that arrives in a later step.
  const gaitDebug = useMemo(() => {
    if (phase !== 'done') return [];
    return videos.map((source) => {
      const frames = framesByVideo[source.id] ?? [];
      const label = source.meta?.fileName ?? `${source.view} view`;
      if (frames.length === 0) {
        return { id: source.id, label, text: 'no frames' };
      }
      const { diagnostics } = segmentGaitCycles(frames);
      const meanMs = diagnostics.left.meanCycleDuration || diagnostics.right.meanCycleDuration;
      const text =
        `${diagnostics.left.keptCycles} left / ${diagnostics.right.keptCycles} right cycles, ` +
        `quality ${diagnostics.quality}` +
        (meanMs ? ` (mean cycle ${meanMs.toFixed(2)}s)` : '');
      return { id: source.id, label, text };
    });
  }, [phase, videos, framesByVideo]);

  // Flush live counters to state a few times a second for smooth display.
  useEffect(() => {
    if (!hasVideos) return;
    const id = window.setInterval(() => {
      setDisplay({
        detected: detectedRef.current,
        skipped: skippedRef.current,
        progress: progressRef.current,
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [hasVideos]);

  useEffect(() => {
    if (!hasVideos) return;
    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      try {
        const bundle = await getPoseLandmarker();
        if (signal.aborted) return;
        setDelegate(bundle.delegate);
      } catch {
        if (!signal.aborted) {
          setFatalError('Could not load the pose model. Check your connection and try again.');
          setPhase('error');
        }
        return;
      }

      for (let i = 0; i < videos.length; i++) {
        if (signal.aborted) return;
        const source = videos[i];
        setCurrentIndex(i);
        progressRef.current = 0;
        frameRef.current = null;
        try {
          const frames = await processVideo(source, {
            videoEl: videoRef.current ?? undefined,
            signal,
            onFrame: (frame) => {
              frameRef.current = frame;
              detectedRef.current += 1;
            },
            onSkip: () => {
              skippedRef.current += 1;
            },
            onProgress: (p) => {
              progressRef.current = p;
            },
          });
          if (signal.aborted) return;
          setVideoFrames(source.id, frames);
          if (frames.length === 0) {
            setVideoErrors((prev) => [
              ...prev,
              {
                fileName: source.meta?.fileName ?? `video ${i + 1}`,
                message: 'No pose was detected — check lighting, framing, and that a runner is visible.',
              },
            ]);
          }
        } catch (err) {
          if (signal.aborted) return;
          setVideoFrames(source.id, []);
          setVideoErrors((prev) => [
            ...prev,
            { fileName: source.meta?.fileName ?? `video ${i + 1}`, message: humanizeError(err) },
          ]);
        }
      }

      if (!signal.aborted) {
        setDisplay({
          detected: detectedRef.current,
          skipped: skippedRef.current,
          progress: 1,
        });
        setPhase('done');
      }
    })();

    return () => controller.abort();
  }, [hasVideos]);

  if (!hasVideos) {
    return <Navigate to="/" replace />;
  }

  const current = videos[currentIndex];

  return (
    <section className="page">
      <h1>Processing</h1>

      {delegate === 'CPU' && (
        <p className="notice warn">
          Processing on CPU — this will take longer. (No GPU acceleration available.)
        </p>
      )}

      <div className="proc-stage">
        <VideoOverlayPlayer videoRef={videoRef} frameRef={frameRef} />
      </div>

      {phase === 'processing' && (
        <div className="proc-status">
          <p className="muted">
            Video {currentIndex + 1} of {videos.length}
            {current?.meta?.fileName ? ` · ${current.meta.fileName}` : ''} (
            {current?.view} view)
          </p>
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${Math.round(display.progress * 100)}%` }} />
          </div>
          <p className="muted">
            {display.detected} frames detected · {display.skipped} skipped
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="proc-status">
          <p>
            Pose extraction complete — <strong>{display.detected}</strong> frames,{' '}
            <strong>{display.skipped}</strong> skipped across {videos.length} video
            {videos.length === 1 ? '' : 's'}.
          </p>
          {videoErrors.length > 0 && (
            <ul className="video-errors">
              {videoErrors.map((e, idx) => (
                <li key={idx} className="notice warn">
                  <strong>{e.fileName}:</strong> {e.message}
                </li>
              ))}
            </ul>
          )}
          {gaitDebug.length > 0 && (
            <ul className="gait-debug muted">
              {gaitDebug.map((g) => (
                <li key={g.id}>
                  <strong>{g.label}:</strong> Gait: {g.text}
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <Link className="button primary" to="/report">
              Continue to report
            </Link>
            <Link className="button" to="/">
              Start over
            </Link>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="proc-status">
          <p className="notice error" role="alert">
            {fatalError}
          </p>
          <div className="actions">
            <Link className="button" to="/">
              Go back
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

export default ProcessingPage;
