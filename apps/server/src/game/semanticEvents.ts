import { randomUUID } from 'node:crypto';
import type {
  GameState,
  GameplayEventStream,
  GameplaySemanticEvent,
  PlayerId,
} from '@monopoly/shared';

export const MAX_GAMEPLAY_SEMANTIC_EVENTS = 64;

export type GameplaySemanticEventInput = GameplaySemanticEvent extends infer Event
  ? Event extends GameplaySemanticEvent
    ? Omit<Event, 'eventId' | 'sequence'>
    : never
  : never;

export function createEmptyGameplayEventStream(): GameplayEventStream {
  return { sequence: 0, events: [] };
}

function appendGameplayEvent(
  stream: GameplayEventStream,
  input: GameplaySemanticEventInput,
  eventId: string,
): GameplaySemanticEvent {
  const sequence = stream.sequence + 1;
  const event = { ...input, eventId, sequence };
  stream.sequence = sequence;
  stream.events.push(event);
  if (stream.events.length > MAX_GAMEPLAY_SEMANTIC_EVENTS) {
    stream.events.splice(0, stream.events.length - MAX_GAMEPLAY_SEMANTIC_EVENTS);
  }
  return event;
}

export function recordPublicGameplayEvent(
  state: GameState,
  input: GameplaySemanticEventInput,
): GameplaySemanticEvent {
  return appendGameplayEvent(state.boardState.gameplayEvents, input, randomUUID());
}

export function recordPrivateGameplayEvent(
  state: GameState,
  playerIds: readonly PlayerId[],
  input: GameplaySemanticEventInput,
): void {
  const eventId = randomUUID();
  [...new Set(playerIds)].forEach(playerId => {
    const stream = state.privateState.privateGameplayEventsByPlayer[playerId]
      ?? createEmptyGameplayEventStream();
    state.privateState.privateGameplayEventsByPlayer[playerId] = stream;
    appendGameplayEvent(stream, input, eventId);
  });
}
