import { SOCKET_PROTOCOL_VERSION, type Ack } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestRollDiceAck, ROLL_ACK_TIMEOUT_MS } from './rollDiceRequest';

afterEach(() => {
  vi.useRealTimers();
});

function makeSocket() {
  let ack: ((response: Ack) => void) | undefined;
  let disconnect: (() => void) | undefined;
  const socket = {
    emit: vi.fn((_event: 'roll dice', callback: (response: Ack) => void) => {
      ack = callback;
    }),
    once: vi.fn((_event: 'disconnect', listener: () => void) => {
      disconnect = listener;
    }),
    off: vi.fn(),
  };
  return { socket, getAck: () => ack, getDisconnect: () => disconnect };
}

describe('roll ACK transport recovery', () => {
  it('rejects a bounded client-only timeout without retrying the command', async () => {
    vi.useFakeTimers();
    const harness = makeSocket();
    const request = requestRollDiceAck(harness.socket);

    vi.advanceTimersByTime(ROLL_ACK_TIMEOUT_MS);

    await expect(request).rejects.toThrow('Roll ACK timed out.');
    expect(harness.socket.emit).toHaveBeenCalledTimes(1);
    expect(harness.socket.off).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when the connection drops before the ACK', async () => {
    const harness = makeSocket();
    const request = requestRollDiceAck(harness.socket);

    harness.getDisconnect()?.();

    await expect(request).rejects.toThrow('Socket disconnected before the roll ACK.');
    expect(harness.socket.emit).toHaveBeenCalledTimes(1);
    expect(harness.socket.off).toHaveBeenCalledTimes(1);
  });

  it('resolves the authoritative ACK and removes the disconnect listener', async () => {
    const harness = makeSocket();
    const response = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION } as Ack;
    const request = requestRollDiceAck(harness.socket);

    harness.getAck()?.(response);

    await expect(request).resolves.toEqual(response);
    expect(harness.socket.off).toHaveBeenCalledTimes(1);
  });
});
