import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Text } from 'troika-three-text';
import beVietnamProFont from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-800-normal.woff?url';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';

export const MATCH_TIMER_PLACEHOLDER = '--:--';
export const MATCH_TIMER_UPDATE_INTERVAL_MS = 1000;
export const MATCH_TIMER_SIGN_Z = -1.72;

export function formatElapsedMatchTime(elapsedMilliseconds: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMilliseconds / 1000));
  const seconds = elapsedSeconds % 60;
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = String(seconds).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

export function formatElapsedMatchTimeFromTimestamp(
  gameStartedAt: string | null | undefined,
  nowMilliseconds = Date.now(),
): string {
  if (!gameStartedAt) return MATCH_TIMER_PLACEHOLDER;
  const startedMilliseconds = Date.parse(gameStartedAt);
  if (!Number.isFinite(startedMilliseconds)) return MATCH_TIMER_PLACEHOLDER;
  return formatElapsedMatchTime(nowMilliseconds - startedMilliseconds);
}

export function getMatchTimerFaceRotationY(
  cameraPosition: readonly [number, number, number],
): number {
  return Math.atan2(cameraPosition[0], cameraPosition[2]);
}

function TimerText({ value }: { value: string }) {
  const invalidate = useThree(state => state.invalidate);
  const textObjectRef = useRef<Text | null>(null);
  if (!textObjectRef.current) textObjectRef.current = new Text();
  const textObject = textObjectRef.current;

  useEffect(() => {
    textObject.text = value;
    textObject.font = beVietnamProFont;
    textObject.fontSize = 0.44;
    textObject.maxWidth = 1.52;
    textObject.anchorX = 'center';
    textObject.anchorY = 'middle';
    textObject.textAlign = 'center';
    textObject.color = boardVisualTokens.timerDisplay;
    textObject.renderOrder = 10;
    textObject.sync(invalidate);
  }, [invalidate, textObject, value]);

  useEffect(() => () => textObject.dispose(), [textObject]);

  return (
    <primitive
      object={textObject}
      name="MatchTimerDigits"
      position={[0, 0.76, 0.13]}
    />
  );
}

export default function MatchTimerSign({ gameStartedAt }: { gameStartedAt?: string | null }) {
  const invalidate = useThree(state => state.invalidate);
  const camera = useThree(state => state.camera);
  const [displayValue, setDisplayValue] = useState(() => (
    formatElapsedMatchTimeFromTimestamp(gameStartedAt)
  ));
  const faceRotationY = useMemo(
    () => getMatchTimerFaceRotationY(camera.position.toArray()),
    [camera],
  );

  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const nextValue = formatElapsedMatchTimeFromTimestamp(gameStartedAt);
      setDisplayValue(previous => {
        if (previous === nextValue) return previous;
        invalidate();
        return nextValue;
      });
    };
    update();
    if (!gameStartedAt || !Number.isFinite(Date.parse(gameStartedAt))) {
      return () => { active = false; };
    }
    const interval = window.setInterval(update, MATCH_TIMER_UPDATE_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [gameStartedAt, invalidate]);

  return (
    <group
      name="MatchTimerSign"
      position={[0, 0, MATCH_TIMER_SIGN_Z]}
      rotation={[0, faceRotationY, 0]}
      userData={{ authoritativeStart: gameStartedAt ?? null, updateIntervalMs: MATCH_TIMER_UPDATE_INTERVAL_MS }}
    >
      <RoundedBoxMesh
        name="MatchTimerPostLeft"
        width={0.1}
        height={0.58}
        depth={0.1}
        radius={0.025}
        color={boardVisualTokens.timerFrame}
        materialProfile="metal"
        position={[-0.68, 0.3, 0]}
      />
      <RoundedBoxMesh
        name="MatchTimerPostRight"
        width={0.1}
        height={0.58}
        depth={0.1}
        radius={0.025}
        color={boardVisualTokens.timerFrame}
        materialProfile="metal"
        position={[0.68, 0.3, 0]}
      />
      <RoundedBoxMesh
        name="MatchTimerFrame"
        width={1.78}
        height={0.58}
        depth={0.13}
        radius={0.06}
        color={boardVisualTokens.timerFrame}
        materialProfile="boardEdge"
        position={[0, 0.76, 0]}
      />
      <RoundedBoxMesh
        name="MatchTimerTrim"
        width={1.56}
        height={0.38}
        depth={0.022}
        radius={0.025}
        color={boardVisualTokens.timerTrim}
        materialProfile="boardTop"
        position={[0, 0.76, 0.078]}
      />
      <TimerText value={displayValue} />
    </group>
  );
}
