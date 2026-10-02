import { act, cleanup, render, screen } from '@testing-library/react';
import type { PublicGameState, RoomStatus } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { presentationStoreContext } from '../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../game/presentation/queue/AnimationQueue';
import { PresentationStore } from '../../game/presentation/store/presentationStore';
import { makeRoom } from '../../game/presentation/testFixtures';
import type { SocketFunctions } from '../../types';
import useVictoryVisibility, { VICTORY_FALLBACK_MS } from './useVictoryVisibility';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A fresh room state each call, like a new snapshot from the server. */
function roomState(winner: boolean, loaded = true): PublicGameState {
  const room = makeRoom();
  room.gameState.loaded = loaded;
  if (winner) {
    room.gameState.boardState.winner = {
      playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 1_500,
    };
  }
  return room.gameState;
}

function Probe() {
  const { visible, celebrate } = useVictoryVisibility();
  return <output data-testid="gate" data-visible={String(visible)} data-celebrate={String(celebrate)} />;
}

function Harness({ state, store, roomStatus = 'FINISHED' }: {
  state: PublicGameState;
  store: PresentationStore;
  roomStatus?: RoomStatus;
}) {
  return (
    <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
      <stateContext.Provider
        value={{
          state,
          socketFunctions: {} as SocketFunctions,
          playerId: 'player-a',
          role: 'PLAYER',
          connected: true,
          canMutate: false,
          privatePlayerState: null,
          privateOffers: [],
          roomStatus,
        }}
      >
        <Probe />
      </stateContext.Provider>
    </presentationStoreContext.Provider>
  );
}

function gate() {
  const output = screen.getByTestId('gate');
  return {
    visible: output.getAttribute('data-visible') === 'true',
    celebrate: output.getAttribute('data-celebrate') === 'true',
  };
}

function busyStore(): PresentationStore {
  const store = new PresentationStore();
  store.setStatus('playing');
  return store;
}

describe('useVictoryVisibility', () => {
  it('holds a winner that arrives live until the queue is idle, then shows it with a celebration', () => {
    const store = busyStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    expect(gate()).toEqual({ visible: false, celebrate: false });

    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate()).toEqual({ visible: false, celebrate: false });

    act(() => { store.setStatus('idle'); });
    expect(gate()).toEqual({ visible: true, celebrate: true });
  });

  it('shows a live winner at once when the queue is already idle', () => {
    const store = new PresentationStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate()).toEqual({ visible: true, celebrate: true });
  });

  it('shows a winner that is already there on the first render at once, even with a busy queue, and never celebrates', () => {
    render(<Harness state={roomState(true)} store={busyStore()} />);
    expect(gate()).toEqual({ visible: true, celebrate: false });
  });

  it('shows a waiting winner at once when a snapshot resets the presentation', () => {
    const store = busyStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate().visible).toBe(false);

    // Reconnect or session sync: the epoch moves while the queue still reports a busy status.
    act(() => {
      store.resetFromSnapshot(makeRoom());
      store.setStatus('playing');
    });
    expect(gate()).toEqual({ visible: true, celebrate: false });
  });

  it('treats a snapshot that carries the winner as a snap even though the epoch moves a render earlier', () => {
    const store = new PresentationStore();
    const view = render(<Harness state={roomState(false)} store={store} />);

    // The store is reset first (sync render with the old room state); the room state with the winner follows.
    act(() => { store.resetFromSnapshot(makeRoom()); });
    expect(gate().visible).toBe(false);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate()).toEqual({ visible: true, celebrate: false });

    // A later live winner (after the room leaves FINISHED) is live again.
    view.rerender(<Harness state={roomState(false)} store={store} roomStatus="LOBBY" />);
    expect(gate().visible).toBe(false);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate()).toEqual({ visible: true, celebrate: true });
  });

  it('shows the winner after the safety timeout when the queue never reports idle', () => {
    vi.useFakeTimers();
    const store = busyStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    view.rerender(<Harness state={roomState(true)} store={store} />);

    act(() => { vi.advanceTimersByTime(VICTORY_FALLBACK_MS - 1); });
    expect(gate().visible).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(gate()).toEqual({ visible: true, celebrate: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the safety timeout once the queue is idle', () => {
    vi.useFakeTimers();
    const store = busyStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(vi.getTimerCount()).toBe(1);

    act(() => { store.setStatus('idle'); });
    expect(gate().visible).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays shown while the queue gets busy again and until the room leaves FINISHED', () => {
    const store = new PresentationStore();
    const view = render(<Harness state={roomState(false)} store={store} />);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate().visible).toBe(true);

    act(() => { store.setStatus('playing'); });
    expect(gate().visible).toBe(true);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate().visible).toBe(true);

    view.rerender(<Harness state={roomState(true)} store={store} roomStatus="LOBBY" />);
    expect(gate()).toEqual({ visible: false, celebrate: false });
  });

  it('shows nothing for a winner until the state is loaded', () => {
    const store = new PresentationStore();
    const view = render(<Harness state={roomState(true, false)} store={store} />);
    expect(gate().visible).toBe(false);
    view.rerender(<Harness state={roomState(true)} store={store} />);
    expect(gate().visible).toBe(true);
  });
});
