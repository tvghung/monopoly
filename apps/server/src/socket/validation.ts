import {
  clientEventPayloadSchemas,
  noPayloadSchema,
  type Ack,
} from '@monopoly/shared';
import type { output, ZodType } from 'zod';
import { CommandError, failureAck } from './errors';
import type { AppSocket } from './types';

type RuntimeAcknowledge = (response: Ack<unknown>) => void;

const isAcknowledge = (value: unknown): value is RuntimeAcknowledge => (
  typeof value === 'function'
);

/**
 * Enforce the wire shape before a handler can enqueue a mutation. This catches
 * hostile JavaScript clients that insert an actor object into a no-payload
 * command or omit the required acknowledgement callback.
 */
export function installInboundValidation(socket: AppSocket): void {
  socket.use((packet, next) => {
    const eventName: unknown = packet[0];
    const args: unknown[] = packet.slice(1);
    if (typeof eventName !== 'string' || !(eventName in clientEventPayloadSchemas)) {
      next();
      return;
    }

    const schema = clientEventPayloadSchemas[
      eventName as keyof typeof clientEventPayloadSchemas
    ];
    const acknowledge = args.at(-1);
    const hasPayload = schema !== noPayloadSchema;
    const expectedArgumentCount = hasPayload ? 2 : 1;
    const payload = hasPayload ? args[0] : undefined;
    const parsed = schema.safeParse(payload);

    if (
      args.length === expectedArgumentCount
      && isAcknowledge(acknowledge)
      && parsed.success
    ) {
      next();
      return;
    }

    const error = new CommandError(
      'INVALID_REQUEST',
      parsed.success
        ? 'Every command requires exactly one acknowledgement callback.'
        : parsed.error.issues[0]?.message ?? 'Invalid request.',
    );
    if (isAcknowledge(acknowledge)) acknowledge(failureAck(error));
    next(error);
  });
}

export function parsePayload<TSchema extends ZodType>(
  schema: TSchema,
  payload: unknown,
): output<TSchema> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new CommandError('INVALID_REQUEST', result.error.issues[0]?.message ?? 'Invalid request.');
  }
  return result.data;
}
