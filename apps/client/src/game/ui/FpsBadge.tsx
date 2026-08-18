import { useEffect, useState } from 'react';

export const FPS_UPDATE_INTERVAL_MS = 750;

export function useBrowserFps(updateIntervalMs = FPS_UPDATE_INTERVAL_MS): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let animationFrame: number | null = null;
    let running = false;
    let frameCount = 0;
    let sampleStartedAt = 0;

    const stop = () => {
      running = false;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      frameCount = 0;
      sampleStartedAt = performance.now();

      const sample = (timestamp: number) => {
        if (!running) return;
        frameCount += 1;
        const elapsed = timestamp - sampleStartedAt;
        if (elapsed >= updateIntervalMs) {
          setFps(Math.round(frameCount * 1000 / elapsed));
          frameCount = 0;
          sampleStartedAt = timestamp;
        }
        animationFrame = window.requestAnimationFrame(sample);
      };

      animationFrame = window.requestAnimationFrame(sample);
    };

    const handleVisibilityChange = () => {
      stop();
      if (!document.hidden) start();
      else setFps(null);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateIntervalMs]);

  return fps;
}

function getFpsTone(fps: number | null): string {
  if (fps === null) return 'fps-badge--pending';
  if (fps >= 55) return 'fps-badge--good';
  if (fps >= 40) return 'fps-badge--warning';
  return 'fps-badge--poor';
}

export default function FpsBadge() {
  const fps = useBrowserFps();
  const label = fps === null ? 'FPS --' : `FPS ${fps}`;

  return (
    <span
      className={`fps-badge ${getFpsTone(fps)}`}
      aria-label={`${label}; nhịp khung hình trình duyệt`}
      title="FPS đo nhịp requestAnimationFrame của trình duyệt; cảnh 3D chỉ vẽ khi có invalidation."
    >
      {label}
    </span>
  );
}
