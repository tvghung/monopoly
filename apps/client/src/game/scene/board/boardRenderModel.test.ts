import type { PublicGameState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { buildBoardRenderModel } from './boardRenderModel';
import type { PresentationState } from '../../presentation/store/types';

const presentation = (overrides: Partial<PresentationState> = {}): PresentationState => ({
  displayPositions: {},
  settledPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  status: 'idle',
  tileImpacts: [],
  characterReactions: [],
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
});
