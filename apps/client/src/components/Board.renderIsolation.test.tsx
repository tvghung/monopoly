import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import { memo, useEffect, useState } from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import type { StateContextValue } from '../types';
import { PresentationController } from '../game/presentation/PresentationController';
import { PresentationProvider } from '../game/presentation/PresentationProvider';
import { sameScenePresentation, selectScenePresentation } from '../game/scene/board/boardRenderModel';
import { cloneRoom, makeRoom, makeTeamRoom } from '../game/presentation/testFixtures';
import type { GameSceneProps } from '../game/scene/GameScene';
import { useSettings } from '../settings/selectors';
import { SettingsProvider } from '../settings/SettingsProvider';
import Board from './Board';

/**
 * Phase B2 (PERF-03): the board shell must not re-render the 3D scene for anything the scene does not draw. A scene render is
 * a React commit on the R3F root and therefore a GPU frame, so each of these cases would otherwise cost a frame for nothing.
 * The real GameScene is replaced by a memoised stand-in that counts renders and keeps its last props, which is exactly the
 * contract the real one has (it is `memo`ised, so it renders only when a prop changes).
 */
// The module registry is reset first so these mocks apply whichever test file ran before in the same worker.
const scene = vi.hoisted((): { renders: number; props: unknown } => { vi.resetModules(); return { renders: 0, props: null }; });
vi.mock('../game/scene/GameScene', async () => {
  const { memo: memoize } = await import('react');
  const { useEffect: useCommitEffect } = await import('react');
  const SceneStandIn = (props: unknown) => {
    // Counted in an effect without dependencies, which runs once after every committed render.
    useCommitEffect(() => {
      scene.renders += 1;
      scene.props = props;
    });
    return <div data-testid="game-scene" />;
  };
  return { default: memoize(SceneStandIn) };
});

// jsdom has no WebGL, which would put the board on the legacy renderer; this test is about the 3D path.
vi.mock('../game/scene/fallback/webglSupport', () => ({ supportsWebGL: () => true }));

const lastProps = () => scene.props as GameSceneProps;

beforeEach(() => {
  scene.renders = 0;
  scene.props = null;
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

let setRoom: (room: ReturnType<typeof makeRoom>) => void = () => {};
let updateSettings: ReturnType<typeof useSettings>['updateSettings'] = () => {};

const SettingsHandle = memo(function SettingsHandle() {
  const settings = useSettings();
  useEffect(() => { updateSettings = settings.updateSettings; });
  return null;
});

function Harness({ controller, initial }: { controller: PresentationController; initial: ReturnType<typeof makeRoom> }) {
  const [room, setRoomState] = useState(initial);
  useEffect(() => { setRoom = setRoomState; }, [setRoomState]);
  return (
    <SettingsProvider>
      <SettingsHandle />
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextValue(room)}>
          <Board />
        </stateContext.Provider>
      </PresentationProvider>
    </SettingsProvider>
  );
}

async function mount(room = makeRoom()) {
  const controller = new PresentationController();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
  render(<Harness controller={controller} initial={room} />);
  await screen.findByTestId('game-scene');
  await act(async () => { await Promise.resolve(); });
  return { controller, room };
}

describe('the 3D scene is not re-rendered by what it does not draw', () => {
  it('renders once on mount and receives the hover store, not a hovered tile', async () => {
    await mount();
    expect(scene.renders).toBeGreaterThan(0);
    expect(lastProps().hoverStore).toBeDefined();
    expect(lastProps()).not.toHaveProperty('hoveredTileId');
    expect(lastProps()).not.toHaveProperty('onTileHover');
  });

  it('does not re-render for a sweep of hovered tiles', async () => {
    await mount();
    const store = lastProps().hoverStore;
    const before = scene.renders;
    // One act per tile: a batch that ends where it began would hide a render per step.
    for (let tileId = 0; tileId < 18; tileId += 1) {
      act(() => store?.set(tileId));
      expect(store?.get()).toBe(tileId);
    }
    act(() => store?.set(null));
    expect(scene.renders).toBe(before);
    expect(store?.get()).toBeNull();
  });

  it('does not re-render for a settings change (volume, mute, animation speed)', async () => {
    await mount();
    const before = scene.renders;
    act(() => updateSettings({ masterVolume: 0.2 }));
    act(() => updateSettings({ masterVolume: 0.7 }));
    act(() => updateSettings({ muted: true }));
    act(() => updateSettings({ musicVolume: 0.1, sfxVolume: 0.1 }));
    expect(scene.renders).toBe(before);
  });

  it('does not re-render for a presentation tick that changes nothing the scene draws', async () => {
    const { controller } = await mount();
    const before = scene.renders;
    act(() => controller.store.setDisplayLogs(['An đổ được 5']));
    act(() => controller.store.setStatus('playing'));
    expect(scene.renders).toBe(before);
  });

  it('does not re-render for a room update with identical board content', async () => {
    const { room } = await mount();
    const before = scene.renders;
    const next = cloneRoom(room);
    next.gameState.boardState.logs = ['một dòng nhật ký mới'];
    act(() => setRoom(next));
    expect(scene.renders).toBe(before);
  });

  it('re-renders once when a token moves, and keeps every tile object it did not change', async () => {
    const { controller } = await mount();
    const modelBefore = lastProps().model;
    const before = scene.renders;
    act(() => controller.store.snapDisplayPosition('player-a', 3));
    expect(scene.renders).toBe(before + 1);
    const modelAfter = lastProps().model;
    expect(modelAfter).not.toBe(modelBefore);
    expect(modelAfter?.players.find(player => player.playerId === 'player-a')?.tileId).toBe(3);
    expect(modelAfter?.tiles).toBe(modelBefore?.tiles);
    expect(modelAfter?.stations).toBe(modelBefore?.stations);
    expect(modelAfter?.dice).toBe(modelBefore?.dice);
  });

  it('re-renders when a property changes owner and replaces only that tile', async () => {
    const { room } = await mount();
    const modelBefore = lastProps().model;
    const before = scene.renders;
    const next = cloneRoom(room);
    next.gameState.boardState.ownedProps[1] = { id: 'player-b', color: 'blue', houses: 0 };
    act(() => setRoom(next));
    expect(scene.renders).toBeGreaterThan(before);
    const modelAfter = lastProps().model;
    expect(modelAfter?.tiles[1]).not.toBe(modelBefore?.tiles[1]);
    expect(modelAfter?.tiles[1]?.ownerId).toBe('player-b');
    expect(modelAfter?.tiles[2]).toBe(modelBefore?.tiles[2]);
  });

  it('renders the scene at most once per change of what it draws while a roll and a walk play', async () => {
    const { controller, room } = await mount();
    let previous = selectScenePresentation(controller.getState());
    let sliceChanges = 0;
    controller.store.subscribe(() => {
      const next = selectScenePresentation(controller.store.getSnapshot());
      if (sameScenePresentation(previous, next)) return;
      sliceChanges += 1;
      previous = next;
    });
    const before = scene.renders;
    const live = cloneRoom(room);
    live.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
    live.gameState.boardState.rollSequence = 1;
    live.gameState.players['player-a'].currentTile = 5;
    act(() => setRoom(live));
    act(() => { controller.acceptRoomSnapshot(live, 'LIVE_UPDATE'); });
    await act(async () => { await controller.queue.whenIdle(); });
    const renders = scene.renders - before;
    // The roll and five hops really change the scene many times; none of them may render it twice, and nothing else renders it.
    expect(sliceChanges).toBeGreaterThan(3);
    expect(renders).toBeGreaterThan(0);
    expect(renders).toBeLessThanOrEqual(sliceChanges + 1);
    expect(lastProps().model?.players.find(player => player.playerId === 'player-a')?.tileId).toBe(5);
  }, 30_000);

  it('keeps the callbacks it passes stable across its own re-renders', async () => {
    const { controller } = await mount();
    const first = lastProps();
    act(() => controller.store.snapDisplayPosition('player-a', 4));
    const second = lastProps();
    expect(second.onTileSelect).toBe(first.onTileSelect);
    expect(second.onRendererFailure).toBe(first.onRendererFailure);
    expect(second.hoverStore).toBe(first.hoverStore);
  });
});

describe('the 2v2 owner hover card follows the hover store', () => {
  function teamRoomWithOwnedTile() {
    const room = makeTeamRoom();
    room.gameState.boardState.ownedProps = { 1: { id: 'player-c', color: 'red', houses: 0 } };
    return room;
  }

  it('shows the owner, team and relation of the hovered tile and hides them when the pointer leaves', async () => {
    await mount(teamRoomWithOwnedTile());
    const store = lastProps().hoverStore;
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();

    act(() => store?.set(1));
    const card = screen.getByTestId('tile-owner-hover');
    expect(card.textContent).toContain('Chủ sở hữu: Chi');
    expect(card.textContent).toContain('Đồng đội');

    act(() => store?.set(2));
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
    act(() => store?.set(1));
    expect(screen.getByTestId('tile-owner-hover')).toBeTruthy();
    act(() => store?.set(null));
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
  });

  it('draws no card in a solo game, and the scene still does not render for the hover in a team game', async () => {
    const solo = makeRoom();
    solo.gameState.boardState.ownedProps = { 1: { id: 'player-b', color: 'blue', houses: 0 } };
    await mount(solo);
    act(() => lastProps().hoverStore?.set(1));
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
    cleanup();

    await mount(teamRoomWithOwnedTile());
    const before = scene.renders;
    act(() => lastProps().hoverStore?.set(1));
    act(() => lastProps().hoverStore?.set(null));
    expect(scene.renders).toBe(before);
  });
});
