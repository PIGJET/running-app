import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AnalysisResult, LandmarkFrame, VideoSource, ViewAngle } from '../types';

interface AnalysisContextValue {
  videos: VideoSource[];
  treadmillSpeed?: number;
  result: AnalysisResult | null;
  /** Raw pose frames keyed by VideoSource.id, produced by the pose pipeline. */
  framesByVideo: Record<string, LandmarkFrame[]>;
  addVideo: (video: VideoSource) => void;
  removeVideo: (id: string) => void;
  updateVideoView: (id: string, view: ViewAngle) => void;
  setTreadmillSpeed: (speed: number | undefined) => void;
  setVideoFrames: (id: string, frames: LandmarkFrame[]) => void;
  setResult: (result: AnalysisResult | null) => void;
  reset: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<VideoSource[]>([]);
  const [treadmillSpeed, setTreadmillSpeedState] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [framesByVideo, setFramesByVideo] = useState<Record<string, LandmarkFrame[]>>({});

  const addVideo = useCallback((video: VideoSource) => {
    setVideos((prev) => [...prev, video]);
  }, []);

  const removeVideo = useCallback((id: string) => {
    setVideos((prev) => prev.filter((video) => video.id !== id));
    setFramesByVideo((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateVideoView = useCallback((id: string, view: ViewAngle) => {
    setVideos((prev) =>
      prev.map((video) => (video.id === id ? { ...video, view } : video)),
    );
  }, []);

  const setTreadmillSpeed = useCallback((speed: number | undefined) => {
    setTreadmillSpeedState(speed);
  }, []);

  const setVideoFrames = useCallback((id: string, frames: LandmarkFrame[]) => {
    setFramesByVideo((prev) => ({ ...prev, [id]: frames }));
  }, []);

  const reset = useCallback(() => {
    setVideos([]);
    setTreadmillSpeedState(undefined);
    setResult(null);
    setFramesByVideo({});
  }, []);

  const value = useMemo<AnalysisContextValue>(
    () => ({
      videos,
      treadmillSpeed,
      result,
      framesByVideo,
      addVideo,
      removeVideo,
      updateVideoView,
      setTreadmillSpeed,
      setVideoFrames,
      setResult,
      reset,
    }),
    [
      videos,
      treadmillSpeed,
      result,
      framesByVideo,
      addVideo,
      removeVideo,
      updateVideoView,
      setTreadmillSpeed,
      setVideoFrames,
      reset,
    ],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (context === null) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
}
