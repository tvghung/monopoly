import type { PublicGameState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { buildBoardRenderModel } from './boardRenderModel';
import type { PresentationState } from '../../presentation/store/types';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import { PLAYER_STATION_WORLD_ANCHORS } from '../stations/stationWorld';

const presentation = (overrides: Partial<PresentationState> = {}): PresentationState => ({
  displayLogs: [],
  displayPositions: {},
  settledPositions: {},
  displayDevelopmentLevels: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  diceRoll: null,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  balanceDeltas: [],
  ownershipChanges: [],
  developmentChanges: [],
  goCrossings: [],
  destinationPreview: null,
  moneyTransfers: [],
  cardPresentation: null,
  animationSpeedMultiplier: 1,
  reducedMotion: false,
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
    gameplayEvents: { sequence: 0, events: [] },
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

  it('keeps consequence feedback separate from authoritative ownership and buildings', () => {
    const model = buildBoardRenderModel(state(), presentation({
      ownershipChanges: [{
        id: 'ownership', sequence: 1, consequenceOrder: 1, tileId: 1,
        fromPlayerId: null, toPlayerId: 'active', durationMs: 180,
      }],
      developmentChanges: [{
        id: 'development', sequence: 1, consequenceOrder: 2, tileId: 1,
        playerId: 'active', fromHouses: 1, toHouses: 2, delta: 1,
        direction: 'UP', durationMs: 140,
      }],
    }));

    expect(model.tiles[1]).toMatchObject({ ownerId: 'active', ownerColor: 'red', houses: 2 });
    expect(model.ownershipChanges[0]?.id).toBe('ownership');
    expect(model.developmentChanges[0]?.id).toBe('development');
  });

  it('uses the presentation-owned building level to prevent authoritative pre-flash', () => {
    const model = buildBoardRenderModel(state(), presentation({
      displayDevelopmentLevels: { 1: 1, 3: 4 },
    }));

    expect(model.tiles[1]).toMatchObject({ houses: 1 });
    expect(model.tiles[3]).toMatchObject({ houses: 4 });
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

  it('builds complete edge-station data from authoritative state and room presence', () => {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 3 },
      3: { id: 'player-a', color: 'red', houses: 5 },
    };
    room.players[1].connected = false;
    const model = buildBoardRenderModel(
      room.gameState,
      presentation({ displayActivePlayerId: 'player-a' }),
      room.players,
      'player-a',
      'PLAYER',
    );

    expect(model.stations).toHaveLength(2);
    expect(model.stations.find(station => station.playerId === 'player-a')).toMatchObject({
      name: 'An',
      characterId: 'dog',
      slot: 'BOTTOM',
      anchor: PLAYER_STATION_WORLD_ANCHORS.BOTTOM,
      accountBalance: 1500,
      propertyCount: 2,
      houseCount: 3,
      hotelCount: 1,
      status: 'ACTIVE',
      isCurrentTurn: true,
      isConnected: true,
    });
    expect(model.stations.find(station => station.playerId === 'player-b')).toMatchObject({
      slot: 'TOP',
      anchor: PLAYER_STATION_WORLD_ANCHORS.TOP,
      isConnected: false,
    });
    expect(model.deckCounts).toEqual({ chance: 16, chest: 16 });
  });

  it('does not bypass queued card presentation with an authoritative pending interaction', () => {
    const room = makeRoom();
    const reconnect = cloneRoom(room);
    reconnect.gameState.boardState.finishedPlayers['player-b'] = {
      name: 'Bình', color: 'blue', characterId: 'panda', accountBalance: 0, reason: 'BANKRUPT',
    };
    reconnect.gameState.turnInfo.pendingCardInteraction = {
      operationId: '00000000-0000-4000-8000-000000000700',
      playerId: 'player-a',
      turnNumber: 1,
      deck: 'chance',
      sourceTile: 7,
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
      continuation: { playerId: 'player-a', turnNumber: 1 },
      deadlineAt: '2030-01-01T00:00:30.000Z',
    };

    const model = buildBoardRenderModel(
      reconnect.gameState,
      presentation(),
      reconnect.players,
      'player-a',
      'PLAYER',
    );
    expect(model.stations.find(station => station.playerId === 'player-b')?.status).toBe('BANKRUPT');
    expect(model.cardPresentation).toBeNull();
    expect(buildBoardRenderModel(
      reconnect.gameState,
      presentation({
        cardPresentation: {
          operationId: '00000000-0000-4000-8000-000000000700',
          playerId: 'player-a',
          deck: 'chance',
          sourceTile: 7,
          stage: 'REVEALED',
          revealedCardId: 'chance-dividend',
          durationMs: 0,
        },
      }),
      reconnect.players,
      'player-a',
      'PLAYER',
    ).cardPresentation).toEqual({
      operationId: '00000000-0000-4000-8000-000000000700',
      playerId: 'player-a',
      deck: 'chance',
      sourceTile: 7,
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
      durationMs: 0,
    });
  });
});
