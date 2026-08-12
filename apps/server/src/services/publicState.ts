import {
  SOCKET_PROTOCOL_VERSION,
  type PlayerId,
  type PrivatePlayerState,
  type PublicAuction,
  type PublicGameState,
  type PublicRoomState,
  type RoomPlayerMeta,
} from '@monopoly/shared';
import { bankBuildingInventory } from '../game';
import type { RoomRecord } from '../persistence/types';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  assertSupportedRoomSnapshot,
  hydrateGameState,
  type RoomSnapshot,
} from '../rooms';
import type { ConnectionRegistry } from './connectionRegistry';

export function projectPublicRoomState(
  room: RoomRecord<RoomSnapshot>,
  connections: ConnectionRegistry,
  now = new Date(),
): PublicRoomState {
  assertSupportedRoomSnapshot(room);
  const gameState = hydrateGameState(room.gameSnapshot, room.status);
  const auction = gameState.boardState.auction;
  let publicAuction: PublicAuction | null = null;
  if (auction) {
    const { continuation: _continuation, ...auctionFields } = auction;
    void _continuation;
    publicAuction = {
      ...auctionFields,
      timer: Math.max(
        0,
        Math.ceil((new Date(auction.endsAt).getTime() - now.getTime()) / 1_000),
      ),
    };
  }
  const queue = gameState.boardState.paymentQueue;
  const activeClaim = queue?.orderedClaims[queue.activeClaimIndex];
  const boardState = gameState.boardState;

  const players: RoomPlayerMeta[] = Object.entries(room.gameSnapshot.members)
    .sort(([, left], [, right]) => left.joinOrder - right.joinOrder)
    .map(([playerId, member]) => {
      const identity = gameState.players[playerId]
        ?? gameState.boardState.finishedPlayers[playerId];
      if (!identity) {
        throw new Error(`Room member ${playerId} is missing player display data`);
      }
      return {
        playerId,
        name: identity.name,
        color: identity.color,
        joinOrder: member.joinOrder,
        membershipStatus: member.membershipStatus,
        ready: member.ready,
        connected: member.membershipStatus === 'ACTIVE'
          && connections.isConnected(playerId),
      };
    });

  const publicGameState: PublicGameState = {
    boardState: {
      gameStarted: boardState.gameStarted,
      players: boardState.players,
      finishedPlayers: boardState.finishedPlayers,
      currentPlayer: boardState.currentPlayer,
      turnNumber: boardState.turnNumber,
      logs: boardState.logs,
      diceValue: boardState.diceValue,
      ownedProps: boardState.ownedProps,
      openMarket: boardState.openMarket,
      winner: boardState.winner,
      turnRecovery: boardState.turnRecovery
        ? {
          playerId: boardState.turnRecovery.playerId,
          deadlineAt: boardState.turnRecovery.deadlineAt,
        }
        : null,
      auction: publicAuction,
      buildingContention: boardState.buildingContention ? {
        buildingType: boardState.buildingContention.buildingType,
        claimantPlayerIds: Object.keys(boardState.buildingContention.requests),
        endsAt: boardState.buildingContention.endsAt,
      } : null,
      paymentQueue: queue && activeClaim ? {
        debtorPlayerId: activeClaim.debtorPlayerId,
        creditor: activeClaim.creditor,
        creditorPlayerId: activeClaim.creditorPlayerId,
        amount: activeClaim.amount,
        remainingAmount: activeClaim.remainingAmount,
        source: activeClaim.source,
        actionDeadlineAt: queue.actionDeadlineAt,
        remainingClaimCount: queue.orderedClaims.length - queue.activeClaimIndex,
      } : null,
      bankPropertyAuctionQueue: boardState.bankPropertyAuctionQueue ? {
        currentTileId: boardState.bankPropertyAuctionQueue.currentTileId,
        remainingCount: boardState.bankPropertyAuctionQueue.orderedRemainingTileIds.length
          + (boardState.bankPropertyAuctionQueue.currentTileId === null ? 0 : 1),
      } : null,
    },
    players: Object.fromEntries(Object.entries(gameState.players).map(([playerId, player]) => [
      playerId,
      {
        name: player.name,
        currentTile: player.currentTile,
        color: player.color,
        accountBalance: player.accountBalance,
        isJail: player.isJail,
        jailRounds: player.jailRounds,
        getOutOfJailCardCount: player.heldJailFreeCardIds.length,
      },
    ])),
    turnInfo: gameState.turnInfo.canBuyProp === undefined
      ? {}
      : { canBuyProp: gameState.turnInfo.canBuyProp },
    deckCounts: {
      chance: gameState.privateState.decks.chance.drawPile.length,
      chest: gameState.privateState.decks.chest.drawPile.length,
    },
    bankBuildingInventory: bankBuildingInventory(gameState),
    loaded: true,
  };

  return {
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    version: room.aggregateVersion,
    roomId: room.id,
    roomCode: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players,
    gameState: publicGameState,
  };
}

export function projectPrivatePlayerState(
  room: RoomRecord<RoomSnapshot>,
  playerId: PlayerId,
): PrivatePlayerState {
  assertSupportedRoomSnapshot(room);
  const player = room.gameSnapshot.gameState.players[playerId];
  if (player) return { playerId, heldJailFreeCardIds: [...player.heldJailFreeCardIds] };
  if (room.gameSnapshot.gameState.boardState.finishedPlayers[playerId]) {
    return { playerId, heldJailFreeCardIds: [] };
  }
  throw new Error(`Player ${playerId} does not belong to this room`);
}
