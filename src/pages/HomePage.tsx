import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalysis } from '../state/AnalysisContext';
import type { VideoMeta, ViewAngle, VideoSource } from '../types';

const MAX_VIDEOS = 3;
const MAX_BYTES = 200 * 1024 * 1024; // ~200MB
const MAX_DURATION_SECONDS = 60;

const VIEW_OPTIONS: { value: ViewAngle; label: string }[] = [
  { value: 'side', label: 'Side' },
  { value: 'front', label: 'Front' },
  { value: 'rear', label: 'Rear' },
];

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Load metadata from a detached <video> to read duration and dimensions. */
function readVideoMeta(objectUrl: string, fileName: string): Promise<VideoMeta> {
  return new Promise<VideoMeta>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    };
    const finish = () => {
      const meta: VideoMeta = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        fileName,
      };
      cleanup();
      resolve(meta);
    };
    const onDurationChange = () => {
      if (Number.isFinite(video.duration)) finish();
    };
    const onLoaded = () => {
      if (!Number.isFinite(video.duration)) {
        // MediaRecorder-produced webm reports duration=Infinity until forced
        // to seek past the end, which triggers durationchange with the real value.
        video.addEventListener('durationchange', onDurationChange);
        video.currentTime = Number.MAX_SAFE_INTEGER;
        return;
      }
      finish();
    };
    const onError = () => {
      cleanup();
      reject(new Error('unreadable'));
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    video.src = objectUrl;
  });
}

function HomePage() {
  const navigate = useNavigate();
  const { videos, treadmillSpeed, addVideo, removeVideo, updateVideoView, setTreadmillSpeed } =
    useAnalysis();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openPicker = () => inputRef.current?.click();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      let slots = MAX_VIDEOS - videos.length;
      for (const file of Array.from(fileList)) {
        if (slots <= 0) {
          setError(`You can analyze up to ${MAX_VIDEOS} videos.`);
          break;
        }
        if (!file.type.startsWith('video/')) {
          setError(`"${file.name}" is not a video file.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" is over 200MB. Please trim or compress it first.`);
          continue;
        }
        const objectUrl = URL.createObjectURL(file);
        let meta: VideoMeta;
        try {
          meta = await readVideoMeta(objectUrl, file.name);
        } catch {
          URL.revokeObjectURL(objectUrl);
          setError(`"${file.name}" could not be read — the format may be unsupported.`);
          continue;
        }
        if (meta.duration > MAX_DURATION_SECONDS) {
          URL.revokeObjectURL(objectUrl);
          setError(
            `"${file.name}" is ${formatDuration(meta.duration)} long. Please keep clips under 60s.`,
          );
          continue;
        }
        const source: VideoSource = {
          id: crypto.randomUUID(),
          view: 'side',
          blob: file,
          objectUrl,
          meta,
        };
        addVideo(source);
        slots -= 1;
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const onRemove = (source: VideoSource) => {
    URL.revokeObjectURL(source.objectUrl);
    removeVideo(source.id);
  };

  const onSpeedChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    setTreadmillSpeed(raw === '' ? undefined : Number(raw));
  };

  const hasSideView = videos.some((v) => v.view === 'side');
  const canAnalyze = videos.length > 0;

  return (
    <section className="page">
      <h1>shinless</h1>
      <p className="lead">
        A client-side treadmill running-form analyzer. Upload up to three videos (side view
        required; front and rear optional) and get a form report with exercise
        recommendations — all processed in your browser.
      </p>

      <div
        className={`dropzone interactive${dragOver ? ' dragover' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <p>{busy ? 'Reading video…' : 'Drag & drop running videos here'}</p>
        <p className="muted">or click to browse — MP4/WebM/MOV, up to 3 clips, 60s each, 200MB max.</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={onInputChange}
        />
      </div>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {videos.length > 0 && (
        <ul className="video-list">
          {videos.map((v) => (
            <li key={v.id} className="video-card">
              <video className="video-thumb" src={v.objectUrl} muted preload="metadata" />
              <div className="video-card-body">
                <span className="video-name" title={v.meta?.fileName}>
                  {v.meta?.fileName ?? 'video'}
                </span>
                <span className="muted">
                  {formatDuration(v.meta?.duration ?? NaN)}
                  {v.meta ? ` · ${v.meta.width}×${v.meta.height}` : ''}
                </span>
                <label className="view-select">
                  View:{' '}
                  <select
                    value={v.view}
                    onChange={(e) => updateVideoView(v.id, e.target.value as ViewAngle)}
                  >
                    {VIEW_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="button ghost" onClick={() => onRemove(v)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="speed-field">
        Treadmill speed (km/h, optional)
        <input
          type="number"
          min={0}
          step={0.1}
          inputMode="decimal"
          value={treadmillSpeed ?? ''}
          onChange={onSpeedChange}
          placeholder="e.g. 10"
        />
      </label>

      {canAnalyze && !hasSideView && (
        <p className="notice warn">
          No video is tagged as a <strong>side</strong> view. Side view is recommended for the
          most reliable analysis.
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="button primary"
          disabled={!canAnalyze}
          onClick={() => navigate('/processing')}
        >
          Analyze
        </button>
      </div>
    </section>
  );
}

export default HomePage;
