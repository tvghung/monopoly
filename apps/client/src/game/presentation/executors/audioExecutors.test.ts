import { describe, expect, it, vi } from 'vitest';
import type { AudioCueId, AudioPlayOptions, AudioPort } from '../../../audio/types';
import type {
  BalanceChangedPresentationEvent,
  CardInteractionChangedPresentationEvent,
  GameFinishedPresentationEvent,
  JailReleasedPresentationEvent,
  JailRollFailedPresentationEvent,
  JailStateChangedPresentationEvent,
  MoneyTransferPresentationEvent,
  MoveCharacterPresentationEvent,
  PlayerFinishedPresentationEvent,
  PropertyDevelopmentChangedPresentationEvent,
  PropertyOwnershipChangedPresentationEvent,
  PropertyTransferPresentationEvent,
  RollDicePresentationEvent,
  SentToJailPresentationEvent,
} from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';
import { createBasicExecutors } from './basicExecutors';
import { createDiceExecutor } from './diceExecutor';
import { createMovementExecutor } from './movementExecutor';
import { createSemanticExecutors } from './semanticExecutors';

interface AudioSpy {
  audio: AudioPort;
  play: ReturnType<typeof vi.fn<(cueId: AudioCueId, options?: AudioPlayOptions) => void>>;
}

function createAudioSpy(): AudioSpy {
  const play = vi.fn<(cueId: AudioCueId, options?: AudioPlayOptions) => void>();
  return {
    play,
    audio: { play, handleUserInteraction: vi.fn() },
  };
}

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: () => Promise.resolve(),
  waitForDuration: () => Promise.resolve(),
  isCurrent: () => true,
};

function store(): PresentationStore {
  const target = new PresentationStore();
  target.resetFromSnapshot(makeRoom());
  return target;
}

function rollEvent(): RollDicePresentationEvent {
  return {
    id: 'roll', roomId: 'room-1', roomVersion: 2, type: 'ROLL_DICE', entityId: 'room',
    dice1: 3, dice2: 4, rollSequence: 1,
  };
}

function moveEvent(overrides: Partial<MoveCharacterPresentationEvent> = {}): MoveCharacterPresentationEvent {
  return {
    id: 'move', roomId: 'room-1', roomVersion: 2, type: 'MOVE_CHARACTER', entityId: 'player-a',
    playerId: 'player-a', from: 0, to: 4, steps: 4, presentation: 'WALK',
    ...overrides,
  };
}

function moneyEvent(
  source: MoneyTransferPresentationEvent['source'],
  destination: MoneyTransferPresentationEvent['destination'],
): MoneyTransferPresentationEvent {
  return {
    id: 'money', roomId: 'room-1', roomVersion: 2, type: 'MONEY_TRANSFER', entityId: 'money',
    source, destination, amount: 100, reason: 'OTHER',
  };
}

function propertyEvent(cause: PropertyTransferPresentationEvent['cause']): PropertyTransferPresentationEvent {
  return {
    id: `property:${cause}`,
    roomId: 'room-1',
    roomVersion: 2,
    type: 'PROPERTY_TRANSFER',
    entityId: 'property',
    cause,
    transfers: [{
      eventId: `property:${cause}:1`,
      tileId: 1,
      from: { kind: 'BANK' },
      to: { kind: 'PLAYER', playerId: 'player-a' },
      fromPlayerId: null,
      toPlayerId: 'player-a',
    }],
  };
}

describe('presentation audio integration', () => {
  it('plays normal dice shake and impact once at their existing milestones', async () => {
    const audio = createAudioSpy();
    await createDiceExecutor(store(), audio.audio).run(rollEvent(), immediateContext);

    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['dice.shake', 'dice.impact']);
    expect(audio.play.mock.calls.every(call => call[1]?.signal === immediateContext.signal)).toBe(true);
  });

  it('suppresses a late dice impact after abort and uses only impact for Reduced Motion', async () => {
    const audio = createAudioSpy();
    const controller = new AbortController();
    const context: AnimationExecutionContext = {
      ...immediateContext,
      signal: controller.signal,
      waitForDuration: () => new Promise((_resolve, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      }),
    };
    const run = createDiceExecutor(store(), audio.audio).run(rollEvent(), context);
    await Promise.resolve();
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['dice.shake']);

    audio.play.mockClear();
    await createDiceExecutor(store(), audio.audio).run(
      rollEvent(),
      { ...immediateContext, reducedMotion: true },
    );
    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['dice.impact']);
  });

  it('plays one hop per completed WALK hop, none for SNAP or Reduced Motion', async () => {
    const audio = createAudioSpy();
    await createMovementExecutor(store(), audio.audio).run(moveEvent(), immediateContext);
    expect(audio.play.mock.calls.filter(call => call[0] === 'movement.hop')).toHaveLength(4);

    audio.play.mockClear();
    await createMovementExecutor(store(), audio.audio).run(
      moveEvent({ presentation: 'SNAP' }),
      immediateContext,
    );
    await createMovementExecutor(store(), audio.audio).run(
      moveEvent(),
      { ...immediateContext, reducedMotion: true },
    );
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('plays one GO receive accent exactly when a proven WALK reaches tile zero', async () => {
    const audio = createAudioSpy();
    await createMovementExecutor(store(), audio.audio).run(moveEvent({
      from: 39,
      to: 1,
      steps: 2,
      passGo: {
        eventId: 'go', sequence: 1, type: 'PASS_GO', playerId: 'player-a', reward: 200,
        fromTile: 39, destinationTile: 1, movement: { kind: 'DICE_WALK', rollSequence: 1 },
      },
    }), immediateContext);

    expect(audio.play.mock.calls.map(call => call[0])).toEqual([
      'movement.hop', 'money.receive', 'movement.hop',
    ]);
  });

  it.each([
    [{ kind: 'BANK' } as const, { kind: 'PLAYER', playerId: 'player-a' } as const, 'money.receive'],
    [{ kind: 'PLAYER', playerId: 'player-a' } as const, { kind: 'BANK' } as const, 'money.pay'],
    [
      { kind: 'PLAYER', playerId: 'player-a' } as const,
      { kind: 'PLAYER', playerId: 'player-b' } as const,
      'money.transfer',
    ],
  ])('routes authoritative money endpoints to one compact cue', async (source, destination, cue) => {
    const audio = createAudioSpy();
    const executor = createSemanticExecutors(store(), audio.audio).MONEY_TRANSFER as unknown as
      PresentationExecutor<MoneyTransferPresentationEvent>;

    await executor.run(moneyEvent(source, destination), immediateContext);
    expect(audio.play.mock.calls.map(call => call[0])).toEqual([cue]);
  });

  it('does not duplicate authoritative money audio from BALANCE_CHANGED', async () => {
    const audio = createAudioSpy();
    const target = store();
    const semantic = createSemanticExecutors(target, audio.audio).MONEY_TRANSFER as unknown as
      PresentationExecutor<MoneyTransferPresentationEvent>;
    const balance = createBasicExecutors(target, audio.audio).BALANCE_CHANGED as unknown as
      PresentationExecutor<BalanceChangedPresentationEvent>;

    await semantic.run(moneyEvent(
      { kind: 'PLAYER', playerId: 'player-a' },
      { kind: 'BANK' },
    ), immediateContext);
    await balance.run({
      id: 'balance', roomId: 'room-1', roomVersion: 2, type: 'BALANCE_CHANGED', entityId: 'player-a',
      playerId: 'player-a', from: 1_500, to: 1_400,
    }, immediateContext);

    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['money.pay']);
  });

  it.each([
    ['BANK_PURCHASE', 'property.purchase'],
    ['BANK_SALE', 'property.release'],
    ['BANKRUPTCY', 'property.release'],
    ['PLAYER_LEFT', 'property.release'],
    ['VOLUNTARY_TRADE', 'property.transfer'],
    ['FORCED_SALE', 'property.transfer'],
    ['OTHER', 'property.transfer'],
  ] as const)('routes %s property semantics to %s', async (cause, cue) => {
    const audio = createAudioSpy();
    const executor = createSemanticExecutors(store(), audio.audio).PROPERTY_TRANSFER as unknown as
      PresentationExecutor<PropertyTransferPresentationEvent>;

    await executor.run(propertyEvent(cause), immediateContext);
    expect(audio.play.mock.calls.map(call => call[0])).toEqual([cue]);
  });

  it('uses only a generic cue for fallback ownership changes', async () => {
    const audio = createAudioSpy();
    const executor = createBasicExecutors(store(), audio.audio).PROPERTY_OWNERSHIP_CHANGED as unknown as
      PresentationExecutor<PropertyOwnershipChangedPresentationEvent>;
    await executor.run({
      id: 'ownership', roomId: 'room-1', roomVersion: 2, type: 'PROPERTY_OWNERSHIP_CHANGED', entityId: '1',
      tileId: 1, fromPlayerId: null, toPlayerId: 'player-a',
    }, immediateContext);
    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['property.change']);
  });

  it.each([
    [0, 2, 'build.house'],
    [4, 5, 'build.hotel'],
    [5, 2, 'build.remove'],
  ] as const)('routes development %i to %i to %s', async (fromHouses, toHouses, cue) => {
    const audio = createAudioSpy();
    const executor = createBasicExecutors(store(), audio.audio).PROPERTY_DEVELOPMENT_CHANGED as unknown as
      PresentationExecutor<PropertyDevelopmentChangedPresentationEvent>;
    await executor.run({
      id: 'development', roomId: 'room-1', roomVersion: 2, type: 'PROPERTY_DEVELOPMENT_CHANGED', entityId: '1',
      tileId: 1, playerId: 'player-a', fromHouses, toHouses,
    }, immediateContext);
    expect(audio.play.mock.calls.map(call => call[0])).toEqual([cue]);
  });

  it('plays card audio only when the authoritative interaction enters REVEALED', async () => {
    const audio = createAudioSpy();
    const executor = createSemanticExecutors(store(), audio.audio).CARD_INTERACTION_CHANGED as unknown as
      PresentationExecutor<CardInteractionChangedPresentationEvent>;
    const base = {
      roomId: 'room-1', roomVersion: 2, type: 'CARD_INTERACTION_CHANGED' as const, entityId: 'card',
      operationId: 'card', playerId: 'player-a', deck: 'chance' as const, sourceTile: 7,
    };

    await executor.run({ ...base, id: 'awaiting', stage: 'AWAITING_DRAW' }, immediateContext);
    expect(audio.play).not.toHaveBeenCalled();
    await executor.run({
      ...base, id: 'revealed', stage: 'REVEALED', revealedCardId: 'chance-dividend',
    }, immediateContext);
    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['card.reveal']);
  });

  it('plays jail entry at arrival and routes fallback, failure, and release cues', async () => {
    const trace: string[] = [];
    const audio: AudioPort = {
      play: cue => { trace.push(cue); },
      handleUserInteraction: () => {},
    };
    const target = store();
    const semantic = createSemanticExecutors(target, audio);
    const sent = semantic.SENT_TO_JAIL as unknown as PresentationExecutor<SentToJailPresentationEvent>;
    await sent.run({
      id: 'jail-entry', roomId: 'room-1', roomVersion: 2, type: 'SENT_TO_JAIL', entityId: 'player-a',
      event: {
        eventId: 'jail-entry', sequence: 1, type: 'SENT_TO_JAIL', playerId: 'player-a',
        fromTile: 30, destinationTile: 10, cause: 'BOARD_TILE',
      },
    }, {
      ...immediateContext,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    });
    expect(trace[0]).toMatch(/^wait:/);
    expect(trace[1]).toBe('jail.enter');

    const basic = createBasicExecutors(target, audio);
    await (basic.JAIL_STATE_CHANGED as unknown as PresentationExecutor<JailStateChangedPresentationEvent>).run({
      id: 'fallback-jail', roomId: 'room-1', roomVersion: 3, type: 'JAIL_STATE_CHANGED', entityId: 'player-b',
      playerId: 'player-b', isJail: true,
    }, immediateContext);
    await (semantic.JAIL_ROLL_FAILED as unknown as PresentationExecutor<JailRollFailedPresentationEvent>).run({
      id: 'jail-failed', roomId: 'room-1', roomVersion: 4, type: 'JAIL_ROLL_FAILED', entityId: 'player-a',
      playerId: 'player-a',
    }, immediateContext);
    await (semantic.JAIL_RELEASED as unknown as PresentationExecutor<JailReleasedPresentationEvent>).run({
      id: 'jail-release', roomId: 'room-1', roomVersion: 5, type: 'JAIL_RELEASED', entityId: 'player-a',
      playerId: 'player-a', cause: 'BAIL',
    }, immediateContext);
    expect(trace).toEqual(expect.arrayContaining(['jail.enter', 'jail.failed', 'jail.release']));
    expect(trace.filter(item => item === 'jail.enter')).toHaveLength(2);
  });

  it('plays bankruptcy only for BANKRUPT and victory only for a real winner', async () => {
    const audio = createAudioSpy();
    const basic = createBasicExecutors(store(), audio.audio);
    const finished = basic.PLAYER_FINISHED as unknown as PresentationExecutor<PlayerFinishedPresentationEvent>;
    const gameFinished = basic.GAME_FINISHED as unknown as PresentationExecutor<GameFinishedPresentationEvent>;
    const finishedBase = {
      roomId: 'room-1', roomVersion: 2, type: 'PLAYER_FINISHED' as const, entityId: 'player-a', playerId: 'player-a',
    };

    await finished.run({ ...finishedBase, id: 'left', reason: 'LEFT' }, immediateContext);
    await finished.run({ ...finishedBase, id: 'unknown', reason: null }, immediateContext);
    await finished.run({ ...finishedBase, id: 'bankrupt', reason: 'BANKRUPT' }, immediateContext);
    await gameFinished.run({
      id: 'no-winner', roomId: 'room-1', roomVersion: 3, type: 'GAME_FINISHED', entityId: 'game',
      winnerPlayerId: null,
    }, immediateContext);
    await gameFinished.run({
      id: 'winner', roomId: 'room-1', roomVersion: 4, type: 'GAME_FINISHED', entityId: 'game',
      winnerPlayerId: 'player-b',
    }, immediateContext);

    expect(audio.play.mock.calls.map(call => call[0])).toEqual(['bankruptcy', 'victory']);
  });
});
