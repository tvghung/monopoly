import { randomUUID } from 'node:crypto';
import { ACTIVITY_FEED_MAX_EVENTS } from '@monopoly/shared';
import type {
  ActivityEvent,
  ActivityEventInput,
  ActivityFeed,
  GameState,
  GameplaySemanticEvent,
  MoneyEndpoint,
  PlayerId,
} from '@monopoly/shared';

export const MAX_ACTIVITY_FEED_EVENTS = ACTIVITY_FEED_MAX_EVENTS;

type ActivityState = Pick<GameState, 'boardState' | 'players'>;

export function createEmptyActivityFeed(): ActivityFeed {
  return { sequence: 0, events: [] };
}

export function activityPlayerName(state: ActivityState, playerId: PlayerId): string {
  return state.players[playerId]?.name
    ?? state.boardState.finishedPlayers[playerId]?.name
    ?? 'Người chơi';
}

export function activityEndpoint(state: ActivityState, endpoint: MoneyEndpoint) {
  return endpoint.kind === 'BANK'
    ? { kind: 'BANK' as const }
    : { kind: 'PLAYER' as const, playerId: endpoint.playerId, name: activityPlayerName(state, endpoint.playerId) };
}

export function recordActivityEvent(
  state: ActivityState,
  input: ActivityEventInput,
  occurredAt = new Date().toISOString(),
): ActivityEvent {
  const feed = state.boardState.activityFeed;
  const event = {
    ...input,
    eventId: randomUUID(),
    sequence: feed.sequence + 1,
    occurredAt,
  } as ActivityEvent;
  feed.sequence = event.sequence;
  feed.events.push(event);
  if (feed.events.length > MAX_ACTIVITY_FEED_EVENTS) {
    feed.events.splice(0, feed.events.length - MAX_ACTIVITY_FEED_EVENTS);
  }
  return event;
}

export function recordActivityForGameplayEvent(
  state: ActivityState,
  event: GameplaySemanticEvent,
): void {
  switch (event.type) {
    case 'MONEY_TRANSFER':
      recordActivityEvent(state, {
        type: 'MONEY_TRANSFER',
        source: activityEndpoint(state, event.source),
        destination: activityEndpoint(state, event.destination),
        amount: event.amount,
        reason: event.reason,
      });
      return;
    case 'SENT_TO_JAIL':
      recordActivityEvent(state, {
        type: 'JAIL',
        action: 'ENTRY',
        playerId: event.playerId,
        playerName: activityPlayerName(state, event.playerId),
        cause: event.cause,
      });
      return;
    case 'JAIL_ROLL_FAILED':
      recordActivityEvent(state, {
        type: 'JAIL',
        action: 'FAILED_ROLL',
        playerId: event.playerId,
        playerName: activityPlayerName(state, event.playerId),
      });
      return;
    case 'JAIL_RELEASED':
      recordActivityEvent(state, {
        type: 'JAIL',
        action: 'RELEASE',
        playerId: event.playerId,
        playerName: activityPlayerName(state, event.playerId),
        cause: event.cause,
      });
      return;
    case 'PASS_GO':
    case 'PROPERTY_TRANSFER':
      return;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
