import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import { memo, useEffect, useState } from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import type { StateContextValue } from '../../types';
import { PresentationController } from '../../game/presentation/PresentationController';
import { PresentationProvider } from '../../game/presentation/PresentationProvider';
import { makeRoom } from '../../game/presentation/testFixtures';
import type { GameSceneProps } from '../../game/scene/GameScene';
import { DEFAULT_GAME_SETTINGS } from '../../settings/defaults';
import { useSettings } from '../../settings/selectors';
import { SettingsProvider } from '../../settings/SettingsProvider';
import type { GraphicsQualitySetting } from '../../settings/types';
import Board from '../Board';
import SceneLayer, { type ScenePhase } from './SceneLayer';

/**
 * The persistent scene layer (08H Task 3): the scene is built before the board, kept while the board comes and goes, and dropped with
 * the room. The real GameScene is replaced by a stand-in that counts mounts and renders and keeps its last props, as in
 * `Board.renderIsolation.test.tsx`; the real controller, layer, slot and board are under test. The deferral policy is replaced by a
 * handle the test fires, because its timing is tested on its own in `sceneEarlyMount.test.ts`.
 */
const scene = vi.hoisted((): { mounts: number; renders: number; props: unknown } => { vi.resetModules(); return { mounts: 0, renders: 0, props: null }; });
vi.mock('../../game/scene/GameScene', async () => {
  const { memo: memoize, useEffect: useMountEffect } = await import('react');
  const SceneStandIn = (props: unknown) => {
    useMountEffect(() => {
      scene.mounts += 1;
      return () => { scene.mounts -= 1; };
    }, []);
    useMountEffect(() => {
      scene.renders += 1;
      scene.props = props;
    });
    return <div data-testid="game-scene" />;
  };
  return { default: memoize(SceneStandIn) };
});

const webgl = vi.hoisted(() => ({ supported: true }));
vi.mock('../../game/scene/fallback/webglSupport', () => ({ supportsWebGL: () => webgl.supported }));

const earlyMount = vi.hoisted(() => ({ onReady: null as (() => void) | null, calls: 0, cancels: 0 }));
vi.mock('./sceneEarlyMount', () => ({
  scheduleEarlyMount: (onReady: () => void) => {
    earlyMount.calls += 1;
    earlyMount.onReady = onReady;
    return () => { earlyMount.cancels += 1; };
  },
}));

const lastProps = () => scene.props as GameSceneProps;

beforeEach(() => {
  scene.mounts = 0;
  scene.renders = 0;
  scene.props = null;
  webgl.supported = true;
  earlyMount.onReady = null;
  earlyMount.calls = 0;
  earlyMount.cancels = 0;
});
afterEach(cleanup);

function contextValue(room: ReturnType<typeof makeRoom>): StateContextValue {
  return {
    state: room.gameState,
    socketFunctions: {} as StateContextValue['socketFunctions'],
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
}

interface Handle {
  setPhase: (phase: ScenePhase) => void;
  setBoard: (shown: boolean) => void;
  updateSettings: ReturnType<typeof useSettings>['updateSettings'];
}
const handle: Handle = { setPhase: () => {}, setBoard: () => {}, updateSettings: () => {} };

const SettingsHandle = memo(function SettingsHandle() {
  const settings = useSettings();
  useEffect(() => { handle.updateSettings = settings.updateSettings; });
  return null;
});

function Harness({
  controller, room, phase: initialPhase, board: initialBoard, quality,
}: {
  controller: PresentationController;
  room: ReturnType<typeof makeRoom>;
  phase: ScenePhase;
  board: boolean;
  quality: GraphicsQualitySetting;
}) {
  const [phase, setPhase] = useState<ScenePhase>(initialPhase);
  const [board, setBoard] = useState(initialBoard);
  useEffect(() => { handle.setPhase = setPhase; handle.setBoard = setBoard; }, []);
  return (
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, graphicsQuality: quality }}>
      <SettingsHandle />
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextValue(room)}>
          <SceneLayer phase={phase} roomKey={phase ? 'ROOM1' : null}>
            <main>{board ? <Board /> : <p>lobby</p>}</main>
          </SceneLayer>
        </stateContext.Provider>
      </PresentationProvider>
    </SettingsProvider>
  );
}

function mount({
  phase, board = false, quality = 'balanced',
}: { phase: ScenePhase; board?: boolean; quality?: GraphicsQualitySetting }) {
  const room = makeRoom();
  const controller = new PresentationController();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
  const view = render(<Harness controller={controller} room={room} phase={phase} board={board} quality={quality} />);
  return { view, controller, room };
}

const parked = () => document.querySelector('.scene-parking .scene-host');
const slotted = () => document.querySelector('.scene-slot .scene-host');
const flush = () => act(async () => { await Promise.resolve(); });

describe('building the scene in the lobby', () => {
  it('builds nothing until the deferral says the lobby is idle, then builds into the parking element', async () => {
    mount({ phase: 'LOBBY' });
    await flush();
    expect(earlyMount.calls).toBe(1);
    expect(scene.mounts).toBe(0);
    expect(screen.queryByTestId('game-scene')).toBeNull();
    act(() => { earlyMount.onReady?.(); });
    await screen.findByTestId('game-scene');
    expect(scene.mounts).toBe(1);
    expect(parked()?.querySelector('[data-testid="game-scene"]')).not.toBeNull();
  });

  it('the parked scene is invisible and out of reach (the parking element is inert and hidden from assistive technology)', async () => {
    mount({ phase: 'LOBBY' });
    act(() => { earlyMount.onReady?.(); });
    await screen.findByTestId('game-scene');
    const parking = document.querySelector('.scene-parking');
    expect(parking?.getAttribute('aria-hidden')).toBe('true');
    expect(parking?.hasAttribute('inert')).toBe(true);
  });

  it('does not even schedule the early build on the low tier, without WebGL or outside a lobby', async () => {
    mount({ phase: 'LOBBY', quality: 'low' });
    await flush();
    expect(earlyMount.calls).toBe(0);
    cleanup();

    webgl.supported = false;
    mount({ phase: 'LOBBY' });
    act(() => { earlyMount.onReady?.(); });
    expect(screen.queryByTestId('game-scene')).toBeNull();
    cleanup();

    webgl.supported = true;
    earlyMount.calls = 0;
    mount({ phase: 'GAME' });
    await flush();
    expect(earlyMount.calls).toBe(0);
    expect(screen.queryByTestId('game-scene')).toBeNull();
    cleanup();

    mount({ phase: null });
    await flush();
    expect(earlyMount.calls).toBe(0);
  });

  it('cancels the deferral when the lobby ends before it fired', async () => {
    mount({ phase: 'LOBBY' });
    await flush();
    act(() => handle.setPhase(null));
    expect(earlyMount.cancels).toBeGreaterThan(0);
  });
});

describe('the board takes the scene and gives it back', () => {
  it('a board shown with no early build mounts the scene itself, in its slot', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    expect(scene.mounts).toBe(1);
    expect(slotted()).not.toBeNull();
    expect(parked()).toBeNull();
  });

  it('moves the same scene from the parking element into the board and back, without remounting it', async () => {
    mount({ phase: 'LOBBY' });
    act(() => { earlyMount.onReady?.(); });
    await screen.findByTestId('game-scene');
    const element = screen.getByTestId('game-scene');
    expect(scene.mounts).toBe(1);

    act(() => { handle.setPhase('GAME'); handle.setBoard(true); });
    expect(slotted()).not.toBeNull();
    expect(screen.getByTestId('game-scene')).toBe(element);

    act(() => { handle.setPhase('LOBBY'); handle.setBoard(false); });
    expect(parked()).not.toBeNull();
    expect(screen.getByTestId('game-scene')).toBe(element);

    act(() => { handle.setPhase('GAME'); handle.setBoard(true); });
    expect(slotted()).not.toBeNull();
    expect(screen.getByTestId('game-scene')).toBe(element);
    // One mount for the whole session of the room: lobby, game, lobby (play again), game.
    expect(scene.mounts).toBe(1);
  });

  it('keeps the scene through a lobby that comes after a game (play again) and drops it with the room', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    act(() => { handle.setPhase('LOBBY'); handle.setBoard(false); });
    expect(scene.mounts).toBe(1);
    expect(parked()).not.toBeNull();
    act(() => { handle.setPhase(null); });
    expect(scene.mounts).toBe(0);
    expect(screen.queryByTestId('game-scene')).toBeNull();
  });

  it('asks for one frame every time the scene is shown in a board (a new reveal token)', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    const first = lastProps().revealToken;
    act(() => { handle.setBoard(false); });
    act(() => { handle.setBoard(true); });
    expect(lastProps().revealToken).toBeGreaterThan(first ?? 0);
  });

  it('draws the board without a scene of its own on the page (no second scene in the board)', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    expect(screen.getAllByTestId('game-scene')).toHaveLength(1);
  });
});

describe('a renderer that fails', () => {
  it('in a lobby: the scene is dropped, and the board that comes next starts on the legacy board', async () => {
    mount({ phase: 'LOBBY' });
    act(() => { earlyMount.onReady?.(); });
    await screen.findByTestId('game-scene');
    act(() => lastProps().onRendererFailure?.(new Error('context lost')));
    expect(screen.queryByTestId('game-scene')).toBeNull();
    expect(scene.mounts).toBe(0);

    act(() => { handle.setPhase('GAME'); handle.setBoard(true); });
    const renderer = document.querySelector('.game-board__renderer');
    expect(renderer?.getAttribute('data-renderer-mode')).toBe('legacy');
    expect(screen.queryByTestId('game-scene')).toBeNull();
  });

  it('in a game: the board switches to the legacy board and the scene is dropped', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    expect(document.querySelector('.game-board__renderer')?.getAttribute('data-renderer-mode')).toBe('webgl');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => lastProps().onRendererFailure?.(new Error('context lost')));
    expect(document.querySelector('.game-board__renderer')?.getAttribute('data-renderer-mode')).toBe('legacy');
    expect(screen.queryByTestId('game-scene')).toBeNull();
    expect(document.querySelector('.scene-slot')).toBeNull();
  });

  it('leaving the room forgets the failure, so the next room tries the 3D board again', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => lastProps().onRendererFailure?.(new Error('context lost')));
    act(() => { handle.setBoard(false); handle.setPhase(null); });
    act(() => { handle.setPhase('GAME'); handle.setBoard(true); });
    expect(document.querySelector('.game-board__renderer')?.getAttribute('data-renderer-mode')).toBe('webgl');
    await screen.findByTestId('game-scene');
  });
});

describe('the persistent scene is not re-rendered by what it does not draw (as in Board.renderIsolation)', () => {
  it('receives the hover store and stable callbacks, and ignores a sweep of hovered tiles and a volume change', async () => {
    const { controller } = mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    await flush();
    const store = lastProps().hoverStore;
    expect(store).toBeDefined();
    const first = lastProps();
    const before = scene.renders;
    for (let tileId = 0; tileId < 18; tileId += 1) act(() => store?.set(tileId));
    act(() => store?.set(null));
    act(() => handle.updateSettings({ masterVolume: 0.2 }));
    act(() => handle.updateSettings({ muted: true }));
    act(() => controller.store.setStatus('playing'));
    expect(scene.renders).toBe(before);
    expect(lastProps().onTileSelect).toBe(first.onTileSelect);
    expect(lastProps().onRendererFailure).toBe(first.onRendererFailure);
  });

  it('passes a tile selected on the board to the scene, and a tile the scene selects to the board', async () => {
    mount({ phase: 'GAME', board: true });
    await screen.findByTestId('game-scene');
    expect(lastProps().selectedTileId).toBeNull();
    act(() => lastProps().onTileSelect?.(5));
    expect(lastProps().selectedTileId).toBe(5);
  });
});
