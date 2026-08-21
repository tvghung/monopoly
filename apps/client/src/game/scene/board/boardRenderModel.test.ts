import type { PublicGameState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { buildBoardRenderModel } from './boardRenderModel';
import type { PresentationState } from '../../presentation/store/types';

const presentation = (overrides: Partial<PresentationState> = {}): PresentationState => ({
  displayPositions: {},
  settledPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  diceRoll: null,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  animationSpeedMultiplier: 1,
  presentationResetEpoch: 0,
  ...overrides,
});

const state = (overrides: Partial<PublicGameState> = {}): PublicGameState => ({
  boardState: {
    gameStarted: true,
    players: ['active', 'finished', 'fallback'],
    finishedPlayers: {
      finished: { name: 'Đã rời', color: 'purple', characterId: 'panda', reason: 'BANKRUPT' },
    },
    currentPlayer: { id: 'active', hasMoved: false },
    turnNumber: 2,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 2, dice2: 3 },
    rollSequence: 1,
    ownedProps: {
      1: { id: 'active', color: 'red', houses: 2 },
      3: { id: 'finished', color: 'purple', houses: 5 },
      5: { id: 'missing', color: 'charcoal', houses: 1 },
      12: { id: 'active', color: 'red', houses: 0 },
    },
    winner: null,
  },
  players: {
    active: {
      name: 'An', currentTile: 4, color: 'red', characterId: 'dog', accountBalance: 900,
      isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
    },
    finished: {
      name: 'Bình', currentTile: 8, color: 'blue', characterId: 'panda', accountBalance: 0,
      isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
    },
    fallback: {
      name: 'Chi', currentTile: 9, color: 'green', characterId: 'cat', accountBalance: 600,
      isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
    },
  },
  turnInfo: {},
  deckCounts: { chance: 16, chest: 16 },
  loaded: true,
  ...overrides,
});

describe('board render model', () => {
  it('maps canonical tile metadata and authoritative ownership/buildings', () => {
    const current = state();
    const playersWithoutFinished = Object.fromEntries(
      Object.entries(current.players).filter(([playerId]) => playerId !== 'finished'),
    );
    const model = buildBoardRenderModel({ ...current, players: playersWithoutFinished }, presentation());
    expect(model.tiles).toHaveLength(40);
    expect(model.tiles[1]).toMatchObject({
      tileId: 1,
      name: 'Cà Mau',
      ownerId: 'active',
      ownerColor: 'red',
      houses: 2,
    });
    expect(model.tiles[3]).toMatchObject({ ownerId: 'finished', ownerColor: 'purple', houses: 5 });
    expect(model.tiles[5]).toMatchObject({ ownerId: 'missing', ownerColor: 'charcoal', houses: 1 });
    expect(model.tiles[12]).toMatchObject({ ownerId: 'active', ownerColor: 'red', houses: 0 });
    expect(model.tiles[2]).toHaveProperty('houses', 0);
    expect(model.tiles[2]).not.toHaveProperty('ownerId');
  });

  it('uses presentation positions and active player timing with authoritative fallback', () => {
    const model = buildBoardRenderModel(state(), presentation({
      displayPositions: { active: 17 },
      displayActivePlayerId: 'fallback',
    }));
    expect(model.players.find(player => player.playerId === 'active')).toMatchObject({ tileId: 17, isActive: false });
    expect(model.players.find(player => player.playerId === 'finished')).toMatchObject({ tileId: 8, isActive: false });
    expect(model.players.find(player => player.playerId === 'fallback')).toMatchObject({ tileId: 9, isActive: true });
  });

  it('forwards visual movement contracts without changing authoritative player data', () => {
    const movement = {
      sequence: 1,
      playerId: 'active',
      transition: 'TILE_HOP' as const,
      phase: 'START' as const,
      fromTileId: 4,
      toTileId: 5,
      fromSlotIndex: 0,
      fromOccupantCount: 1,
      toSlotIndex: 1,
      toOccupantCount: 2,
      durationMs: 90,
    };
    const model = buildBoardRenderModel(state(), presentation({
      displayPositions: { active: 5 },
      characterMovements: [movement],
      animationSpeedMultiplier: 2,
    }));

    expect(model.players.find(player => player.playerId === 'active')?.tileId).toBe(5);
    expect(model.characterMovements).toEqual([movement]);
    expect(model.animationSpeedMultiplier).toBe(2);
    expect(state().players.active.currentTile).toBe(4);
  });

  it('projects hidden, rolling, and settled dice from the presentation state', () => {
    const hidden = buildBoardRenderModel(state(), presentation());
    expect(hidden.dice).toMatchObject({ phase: 'HIDDEN', rollSequence: 0 });

    const rolling = buildBoardRenderModel(state(), presentation({
      displayDice: { dice1: 1, dice2: 1 },
      diceRoll: {
        lifecycle: 'rolling',
        dice: { dice1: 5, dice2: 6 },
        fromDice: { dice1: 2, dice2: 3 },
        rollSequence: 2,
        durationMs: 640,
      },
    }));
    expect(rolling.dice).toEqual({
      dice: { dice1: 5, dice2: 6 },
      fromDice: { dice1: 2, dice2: 3 },
      rollSequence: 2,
      phase: 'ROLLING',
      durationMs: 640,
    });

    const settled = buildBoardRenderModel(state(), presentation({
      displayDice: { dice1: 5, dice2: 6 },
      displayRollSequence: 2,
    }));
    expect(settled.dice).toMatchObject({
      dice: { dice1: 5, dice2: 6 },
      rollSequence: 2,
      phase: 'SETTLED',
    });
  });
});
