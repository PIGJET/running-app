import { useEffect, useRef, type RefObject } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkFrame } from '../types';

interface VideoOverlayPlayerProps {
  /** Owned by the parent so the pose processor can drive the same element. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * Mutable holder for the latest detected frame. The processor writes to
   * `.current` on every frame; the overlay reads it in its own rAF loop so
   * drawing never triggers a React re-render.
   */
  frameRef: RefObject<LandmarkFrame | null>;
}

// MediaPipe pose landmark indices: face is 0-10, then limbs alternate
// left (odd) / right (even). Colour bones and joints by side.
const LOW_VISIBILITY = 0.5;
const COLOR_LEFT = '#f59e0b';
const COLOR_RIGHT = '#22d3ee';
const COLOR_CENTER = '#e5e7eb';

type Side = 'left' | 'right' | 'center';

function sideOf(index: number): Side {
  if (index <= 10) return 'center';
  return index % 2 === 1 ? 'left' : 'right';
}

function colorFor(side: Side): string {
  if (side === 'left') return COLOR_LEFT;
  if (side === 'right') return COLOR_RIGHT;
  return COLOR_CENTER;
}

/**
 * A <video> with a <canvas> overlaid, drawing the pose skeleton aligned to the
 * video's displayed (object-fit: contain, letterboxed) content box.
 */
function VideoOverlayPlayer({ videoRef, frameRef }: VideoOverlayPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0 || ch === 0) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const frame = frameRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!frame || vw === 0 || vh === 0) return;

      // Replicate object-fit: contain to place the skeleton over the body.
      const scale = Math.min(cw / vw, ch / vh);
      const dispW = vw * scale;
      const dispH = vh * scale;
      const offX = (cw - dispW) / 2;
      const offY = (ch - dispH) / 2;
      const toX = (nx: number) => offX + nx * dispW;
      const toY = (ny: number) => offY + ny * dispH;

      const points = frame.landmarks;

      // Bones.
      ctx.lineWidth = 3;
      for (const conn of PoseLandmarker.POSE_CONNECTIONS) {
        const a = points[conn.start];
        const b = points[conn.end];
        if (!a || !b) continue;
        const startSide = sideOf(conn.start);
        const endSide = sideOf(conn.end);
        const side = startSide === endSide ? startSide : 'center';
        const dim = a.visibility < LOW_VISIBILITY || b.visibility < LOW_VISIBILITY;
        ctx.strokeStyle = colorFor(side);
        ctx.globalAlpha = dim ? 0.25 : 0.9;
        ctx.beginPath();
        ctx.moveTo(toX(a.x), toY(a.y));
        ctx.lineTo(toX(b.x), toY(b.y));
        ctx.stroke();
      }

      // Joints.
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const dim = p.visibility < LOW_VISIBILITY;
        ctx.fillStyle = colorFor(sideOf(i));
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, frameRef]);

  return (
    <div className="overlay-player">
      <video ref={videoRef} className="overlay-video" playsInline muted />
      <canvas ref={canvasRef} className="overlay-canvas" />
    </div>
  );
}

export default VideoOverlayPlayer;
