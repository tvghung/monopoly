import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRoomState } from '@monopoly/shared';
import {
  AssetReadinessAbortedError,
  createRoomGameplayAssetInventory,
  getRoomGameplayAssetKey,
  getSafeAssetReadinessMessage,
  preloadAssetPlan,
  type AssetProgress,
} from './assetReadiness';

export type RoomAssetReadinessStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RoomAssetReadinessState {
  status: RoomAssetReadinessStatus;
  progress: AssetProgress;
  error: string | null;
}

const EMPTY_PROGRESS: AssetProgress = {
  loaded: 0,
  total: 0,
  failed: 0,
  currentAssetId: null,
  currentAssetLabel: null,
};

const IDLE_STATE: RoomAssetReadinessState = {
  status: 'idle',
  progress: EMPTY_PROGRESS,
  error: null,
};

export function useRoomAssetReadiness(
  room: PublicRoomState | null,
  webglSupported: boolean,
): RoomAssetReadinessState & { retry: () => void } {
  const [retryNumber, setRetryNumber] = useState(0);
  const [state, setState] = useState<RoomAssetReadinessState>(IDLE_STATE);
  const roomRef = useRef(room);
  roomRef.current = room;

  const roomAssetKey = getRoomGameplayAssetKey(
    room?.roomId ?? null,
    room?.players ?? [],
    webglSupported,
  );

  useEffect(() => {
    const currentRoom = roomRef.current;
    if (!currentRoom) {
      setState(IDLE_STATE);
      return undefined;
    }
    if (!webglSupported) {
      setState({ status: 'ready', progress: EMPTY_PROGRESS, error: null });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    let releaseRetainedAssets: (() => void) | undefined;
    const assets = createRoomGameplayAssetInventory(currentRoom.players, true);
    setState({
      status: 'loading',
      progress: {
        ...EMPTY_PROGRESS,
        total: assets.length,
      },
      error: null,
    });

    void preloadAssetPlan(assets, {
      signal: controller.signal,
      onProgress: progress => {
        if (active) setState(current => ({ ...current, status: 'loading', progress }));
      },
    }).then(report => {
      if (!active) {
        report.release();
        return;
      }
      releaseRetainedAssets = report.release;
      setState({ status: 'ready', progress: report.progress, error: null });
    }).catch(error => {
      if (!active || error instanceof AssetReadinessAbortedError) return;
      console.error('Room gameplay assets failed to load.', error);
      setState(current => ({
        ...current,
        status: 'error',
        error: getSafeAssetReadinessMessage(error),
      }));
    });

    return () => {
      active = false;
      controller.abort();
      releaseRetainedAssets?.();
    };
  }, [roomAssetKey, retryNumber, webglSupported]);

  const retry = useCallback(() => {
    setRetryNumber(value => value + 1);
  }, []);

  return { ...state, retry };
}
