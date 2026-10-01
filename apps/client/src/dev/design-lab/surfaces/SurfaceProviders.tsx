import { useEffect, useState, type ReactNode } from 'react';
import { SOCKET_PROTOCOL_VERSION, type PublicRoomState, type RoomRole } from '@monopoly/shared';
import { ToastProvider } from '../../../components/Toast';
import { emptyPresentationState, presentationContext } from '../../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../../game/presentation/queue/AnimationQueue';
import { makeRoom } from '../../../game/presentation/testFixtures';
import stateContext from '../../../internal';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../../../settings/defaults';
import { SettingsProvider } from '../../../settings/SettingsProvider';
import type { GameSettings } from '../../../settings/types';
import type { SocketFunctions, StateContextValue } from '../../../types';

/**
 * Dev-only fixtures for the real-component surfaces of the Design Lab (plan 04 §9). The components are the production
 * ones; only their providers are built here from the same room fixture the unit tests use, so each surface can be
 * captured without a server. Nothing in this folder ships in production builds.
 */

const accepted = () => Promise.resolve({ ok: true as const, protocolVersion: SOCKET_PROTOCOL_VERSION });
const ignore = () => undefined;

/** Socket functions that accept every command and do nothing else. */
export const SURFACE_SOCKET_FUNCTIONS: SocketFunctions = {
  rollDice: accepted,
  buyProperty: accepted,
  doNotBuy: accepted,
  resolveDevelopment: accepted,
  dismissCard: accepted,
  waitInJail: accepted,
  sendChat: ignore,
  makeOffer: ignore,
  acceptOffer: ignore,
  declineOffer: ignore,
  sellHouse: ignore,
  payBail: accepted,
  useJailCard: accepted,
  sellPropertyToBank: accepted,
  proposeForcedSale: accepted,
  acceptForcedSale: accepted,
  rejectForcedSale: accepted,
  playAgain: accepted,
};

export interface SurfaceStateOptions {
  /** Edit the fixture room before the context is built. */
  mutate?: (room: PublicRoomState) => void;
  /** The viewing player; defaults to the first seat. */
  playerId?: string | null;
  role?: RoomRole | null;
  canMutate?: boolean;
  canPlayAgain?: boolean;
  connected?: boolean;
  socketFunctions?: Partial<SocketFunctions>;
}

/** The state context a surface reads, built from `makeRoom()` (two seated players: An / player-a and Bình / player-b). */
export function makeSurfaceState(options: SurfaceStateOptions = {}): StateContextValue {
  const room = makeRoom();
  options.mutate?.(room);
  const playerId = options.playerId === undefined ? 'player-a' : options.playerId;
  return {
    state: room.gameState,
    socketFunctions: { ...SURFACE_SOCKET_FUNCTIONS, ...options.socketFunctions },
    playerId,
    role: options.role === undefined ? (playerId ? 'PLAYER' : 'SPECTATOR') : options.role,
    connected: options.connected ?? true,
    canMutate: options.canMutate ?? playerId !== null,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
    roomStatus: room.status,
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    canPlayAgain: options.canPlayAgain ?? false,
  };
}

/**
 * The settings provider saves its state to localStorage as soon as it mounts, and the Lab shares an origin with the app in
 * development. Put back what was stored before the surface opened, so reviewing a surface never changes the saved settings.
 */
function useRestoreStoredSettings() {
  const [stored] = useState(() => {
    try {
      return window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => () => {
    try {
      if (stored === null) window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
      else window.localStorage.setItem(SETTINGS_STORAGE_KEY, stored);
    } catch {
      // Storage may be blocked; there is nothing to restore then.
    }
  }, [stored]);
}

/** Settings, toasts, the game state and a static (idle) presentation state around one surface. */
export default function SurfaceProviders({
  value,
  settings = DEFAULT_GAME_SETTINGS,
  children,
}: {
  value?: StateContextValue;
  /** The settings the surface opens with; defaults to the game defaults. */
  settings?: GameSettings;
  children: ReactNode;
}) {
  useRestoreStoredSettings();
  return (
    <SettingsProvider initialSettings={settings}>
      <ToastProvider>
        <presentationContext.Provider
          value={{ state: { ...emptyPresentationState, status: 'idle' }, queue: null as unknown as AnimationQueue }}
        >
          {value ? <stateContext.Provider value={value}>{children}</stateContext.Provider> : children}
        </presentationContext.Provider>
      </ToastProvider>
    </SettingsProvider>
  );
}
