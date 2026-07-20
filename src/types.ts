// Shared domain types for shinless treadmill running-form analyzer.

export type ViewAngle = 'side' | 'front' | 'rear';

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface LandmarkFrame {
  timestamp: number;
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
}

export interface GaitEvent {
  type: 'footStrike' | 'toeOff';
  side: 'left' | 'right';
  time: number;
  frameIndex: number;
}

export interface GaitCycle {
  side: 'left' | 'right';
  start: GaitEvent;
  toeOff: GaitEvent;
  end: GaitEvent;
  frameRange: [number, number];
  stanceDuration: number;
  swingDuration: number;
}

export interface GaitSideDiagnostics {
  side: 'left' | 'right';
  /** Raw detected foot-strike events (before cycle filtering). */
  rawFootStrikes: number;
  /** Raw detected toe-off events (before cycle filtering). */
  rawToeOffs: number;
  /** Cycles that survived all filters. */
  keptCycles: number;
  /** Cycles that were discarded by a filter. */
  discardedCycles: number;
  /** Count of discards keyed by reason (e.g. 'duration', 'visibility'). */
  discardReasons: Record<string, number>;
  /** Mean duration of kept cycles, in seconds (0 when none kept). */
  meanCycleDuration: number;
}

export interface GaitDiagnostics {
  /** Estimated sampling rate of the frame series, in fps. */
  fps: number;
  left: GaitSideDiagnostics;
  right: GaitSideDiagnostics;
  quality: 'good' | 'marginal' | 'poor';
}

export type MetricId =
  | 'overstriding'
  | 'footStrike'
  | 'cadence'
  | 'verticalOscillation'
  | 'trunkLean'
  | 'armSwing'
  | 'hipDrop'
  | 'kneeValgus'
  | 'strideAsymmetry';

export interface Metric {
  id: MetricId;
  label: string;
  unit: string;
  value: number;
  perCycle?: number[];
  perSide?: { left: number; right: number };
  healthyRange: { min?: number; max?: number; approximate: boolean; source: string };
  confidence: 'high' | 'medium' | 'low';
  sourceView: ViewAngle;
  keyMoments?: { time: number; label: string }[];
}

export interface DetectedIssue {
  id: string;
  metricId: MetricId;
  severity: 'mild' | 'moderate' | 'notable';
  confidence: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  exerciseIds: string[];
}

export interface Exercise {
  id: string;
  name: string;
  muscles: string[];
  howTo: string;
  setsReps: string;
  targetsIssues: string[];
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  fileName?: string;
}

export interface QualityWarning {
  code: string;
  message: string;
}

export interface VideoSource {
  id: string;
  view: ViewAngle;
  blob: Blob;
  objectUrl: string;
  meta?: VideoMeta;
}

export interface AnalysisResult {
  videos: { view: ViewAngle; meta: VideoMeta }[];
  qualityWarnings: QualityWarning[];
  cycles: Partial<Record<ViewAngle, GaitCycle[]>>;
  metrics: Metric[];
  issues: DetectedIssue[];
  summary: string;
  treadmillSpeed?: number;
}
