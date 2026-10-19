import { useEffect, useState } from 'react';
import { SCENE_FRAME_EVENT } from '../scene/render/diagnostics/sceneFrameEvent';
import { useSettingsSelector } from '../../settings/selectors';
import type { GameSettings } from '../../settings/types';

export const FPS_UPDATE_INTERVAL_MS = 750;
const selectFpsLimit = (settings: GameSettings): number => settings.fpsLimit;

/** Actual main-scene submissions per elapsed wall-clock second; zero while the board is idle. */
export function useSceneFps(updateIntervalMs = FPS_UPDATE_INTERVAL_MS): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    let frameCount = 0;
    let startedAt = performance.now();
    let interval: number | null = null;
    const onFrame = () => { frameCount += 1; };
    const stop = () => {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    };
    const start = () => {
      if (interval !== null || document.hidden) return;
      frameCount = 0;
      startedAt = performance.now();
      interval = window.setInterval(() => {
        const now = performance.now();
        const elapsed = now - startedAt;
        if (elapsed > 0) setFps(Math.round(frameCount * 1000 / elapsed));
        frameCount = 0;
        startedAt = now;
      }, updateIntervalMs);
    };
    const onVisibilityChange = () => {
      stop();
      setFps(null);
      start();
    };
    window.addEventListener(SCENE_FRAME_EVENT, onFrame);
    document.addEventListener('visibilitychange', onVisibilityChange);
    start();
    return () => {
      stop();
      window.removeEventListener(SCENE_FRAME_EVENT, onFrame);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
  const fps = useSceneFps();
  const limit = useSettingsSelector(selectFpsLimit);
  const label = fps === null ? `3D -- / ${limit} FPS` : `3D ${fps} / ${limit} FPS`;

  return (
    <span
      className={`fps-badge ${getFpsTone(fps)}`}
      aria-label={`${label}; khung hình 3D thực tế / giới hạn đã chọn`}
      title="Khung hình 3D thực tế mỗi giây / giới hạn FPS đã chọn. Cảnh đứng yên là 0 FPS."
    >
      {label}
    </span>
  );
}
