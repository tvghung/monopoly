import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancel = vi.fn();
const start = vi.fn(() => cancel);

vi.mock('./lobbyPrewarm', () => ({
  startLobbyPrewarm: () => start(),
}));

import PrewarmWhileInLobby from './PrewarmWhileInLobby';

beforeEach(() => {
  cancel.mockClear();
  start.mockClear();
});

describe('PrewarmWhileInLobby', () => {
  it('starts the preparation on mount, renders nothing and cancels on unmount', () => {
    const { container, unmount } = render(<PrewarmWhileInLobby />);
    expect(container.childElementCount).toBe(0);
    expect(start).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
