import {
  SOCKET_PROTOCOL_VERSION,
  type PlayerId,
  type PrivatePlayerState,
  type PublicGameState,
  type PublicRoomState,
  type RoomPlayerMeta,
} from '@monopoly/shared';
import { tileState } from '@monopoly/shared';
import { forcedSaleGrossPrice, forcedSaleNetProceeds } from '../game';
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
  void now;
  assertSupportedRoomSnapshot(room);
  const gameState = hydrateGameState(room.gameSnapshot, room.status);
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
      currentPlayer: {
        id: boardState.currentPlayer.id,
        hasMoved: boardState.currentPlayer.hasMoved,
      },
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
      paymentShortfall: queue && activeClaim ? {
        debtorPlayerId: activeClaim.debtorPlayerId,
        creditor: activeClaim.creditor,
        creditorPlayerId: activeClaim.creditorPlayerId,
        amount: activeClaim.amount,
        remainingAmount: activeClaim.remainingAmount,
        source: activeClaim.source,
        actionDeadlineAt: queue.actionDeadlineAt,
        remainingClaimCount: queue.orderedClaims
          .slice(queue.activeClaimIndex)
          .filter(claim => claim.status !== 'SETTLED' && claim.status !== 'BANKRUPT').length,
        paymentOperationId: queue.operationId,
        claimId: activeClaim.claimId,
        sellableProperties: Object.entries(boardState.ownedProps)
          .filter(([, property]) => property.id === activeClaim.debtorPlayerId)
          .sort(([left], [right]) => Number(left) - Number(right))
          .map(([tileID, property]) => ({
            tileID: Number(tileID),
            grossPrice: forcedSaleGrossPrice(Number(tileID), property.houses),
            netProceeds: forcedSaleNetProceeds(Number(tileID), property.houses, property.mortgaged),
            houses: property.houses,
            mortgaged: property.mortgaged,
          })),
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
        jailOpponentRoundsElapsed: player.jailOpponentRoundsElapsed ?? player.jailRounds ?? 0,
        getOutOfJailCardCount: player.heldJailFreeCardIds.length,
      },
    ])),
    turnInfo: (() => {
      const purchase = gameState.turnInfo.pendingPropertyDecision;
      const development = gameState.turnInfo.pendingDevelopmentDecision;
      if (purchase) {
        return {
          pendingLandingDecision: {
            kind: 'PURCHASE' as const,
            operationId: purchase.operationId,
            playerId: purchase.playerId,
            tileID: purchase.tileID,
            price: tileState[purchase.tileID]?.price ?? 0,
          },
        };
      }
      if (development) {
        const tile = tileState[development.tileID];
        return {
          pendingLandingDecision: {
            kind: development.kind === 'HOTEL' ? 'UPGRADE_HOTEL' as const : 'DEVELOP_HOUSES' as const,
            operationId: development.operationId,
            playerId: development.playerId,
            tileID: development.tileID,
            levelAtLanding: development.levelAtLanding,
            maxQuantity: development.kind === 'HOUSES' ? 4 - development.levelAtLanding : 1,
            unitCost: tile?.houseCost ?? 0,
          },
        };
      }
      return {};
    })(),
    deckCounts: {
      chance: gameState.privateState.decks.chance.drawPile.length,
      chest: gameState.privateState.decks.chest.drawPile.length,
    },
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
  if (player) return {
    playerId,
    heldJailFreeCardIds: [...player.heldJailFreeCardIds],
    forcedSaleProposal: room.gameSnapshot.gameState.privateState.forcedSaleProposal
      && [
        room.gameSnapshot.gameState.privateState.forcedSaleProposal.sellerPlayerId,
        room.gameSnapshot.gameState.privateState.forcedSaleProposal.buyerPlayerId,
      ].includes(playerId)
      ? structuredClone(room.gameSnapshot.gameState.privateState.forcedSaleProposal)
      : null,
  };
  if (room.gameSnapshot.gameState.boardState.finishedPlayers[playerId]) {
    return { playerId, heldJailFreeCardIds: [] };
  }
  throw new Error(`Player ${playerId} does not belong to this room`);
}
