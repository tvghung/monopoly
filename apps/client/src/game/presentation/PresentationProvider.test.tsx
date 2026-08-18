import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PresentationController } from './PresentationController';
import { PresentationProvider, usePresentation } from './PresentationProvider';
import { cloneRoom, makeRoom } from './testFixtures';

afterEach(() => {
  cleanup();
});

function PresentationProbe({ onMount }: { onMount: () => void }) {
  const { state } = usePresentation();

  useEffect(() => {
    onMount();
  }, [onMount]);

  return (
    <output data-testid="presentation-position">
      {state.displayPositions['player-a'] ?? 'missing'}
    </output>
  );
}

describe('PresentationProvider', () => {
  it('keeps a stable controller usable through the StrictMode effect probe', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    const live = cloneRoom(initial);
    live.gameState.players['player-a'].currentTile = 4;
    let mountCount = 0;

    render(
      <StrictMode>
        <PresentationProvider controller={controller}>
          <PresentationProbe onMount={() => { mountCount += 1; }} />
        </PresentationProvider>
      </StrictMode>,
    );

    act(() => {
      controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    });
    expect(screen.getByTestId('presentation-position').textContent).toBe('0');

    act(() => {
      controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    });
    await act(async () => {
      await controller.queue.whenIdle();
    });

    expect(mountCount).toBe(2);
    expect(controller.getState().displayPositions['player-a']).toBe(4);
    expect(screen.getByTestId('presentation-position').textContent).toBe('4');
  });

  it('disposes the controller after the provider truly unmounts', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    const live = cloneRoom(initial);
    live.gameState.players['player-a'].currentTile = 4;
    const view = render(
      <StrictMode>
        <PresentationProvider controller={controller}>
          <PresentationProbe onMount={() => {}} />
        </PresentationProvider>
      </StrictMode>,
    );

    act(() => {
      controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    });
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
    expect(controller.getState().displayPositions['player-a']).toBe(0);
  });
});
