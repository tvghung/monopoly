import type { Ack } from '@monopoly/shared';

export const ROLL_ACK_TIMEOUT_MS = 8_000;

interface RollDiceSocket {
  emit: (event: 'roll dice', callback: (response: Ack) => void) => unknown;
  once: (event: 'disconnect', listener: () => void) => unknown;
  off: (event: 'disconnect', listener: () => void) => unknown;
}

/** Client transport recovery only. It never retries a non-idempotent roll. */
export function requestRollDiceAck(socket: RollDiceSocket): Promise<Ack> {
  return new Promise<Ack>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settleReject(new Error('Roll ACK timed out.'));
    }, ROLL_ACK_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('disconnect', onDisconnect);
    };
    const settleResolve = (response: Ack) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onDisconnect = () => {
      settleReject(new Error('Socket disconnected before the roll ACK.'));
    };

    socket.once('disconnect', onDisconnect);
    try {
      socket.emit('roll dice', settleResolve);
    } catch (error) {
      settleReject(error instanceof Error ? error : new Error('Roll request failed.'));
    }
  });
}
