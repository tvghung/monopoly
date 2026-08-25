import type { ActivityEvent, DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type {
  BalanceDeltaSignal,
  CharacterMovementSignal,
  CharacterReactionKind,
  CardPresentationSignal,
  DevelopmentChangeSignal,
  DestinationPreviewSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
  MoneyTransferSignal,
  PresentationListener,
  PresentationState,
  PresentationStoreLike,
} from './types';
import type { TileImpactSignal, TileImpactTiming } from '../../scene/board/motion/tileMotionTypes';

const emptyState: PresentationState = {
  displayLogs: [],
  displayActivity: [],
  displayPositions: {},
  settledPositions: {},
  displayBalances: {},
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
};

const CHARACTER_SIGNAL_LIMIT = 128;
const ONE_SHOT_SIGNAL_LIMIT = 64;

export class PresentationStore implements PresentationStoreLike {
  private state: PresentationState = emptyState;
  private readonly listeners = new Set<PresentationListener>();
  private nextTileImpactSequence = 0;
  private nextCharacterMovementSequence = 0;
  private nextCharacterLandingSequence = 0;
  private nextCharacterReactionSequence = 0;
  private nextConsequenceOrder = 0;
  private nextBalanceDeltaSequence = 0;
  private nextOwnershipChangeSequence = 0;
  private nextDevelopmentChangeSequence = 0;
  private nextGoCrossingSequence = 0;
  private nextMoneyTransferSequence = 0;
  private readonly playerJoinOrder = new Map<string, number>();
  private readonly activeCharacterMovements = new Map<string, CharacterMovementSignal>();
  private readonly pendingBalanceChanges = new Map<string, Set<string>>();
  private readonly balanceDeltaIds = new Set<string>();
  private readonly ownershipChangeIds = new Set<string>();
  private readonly developmentChangeIds = new Set<string>();
  private readonly goCrossingIds = new Set<string>();
  private readonly moneyTransferIds = new Set<string>();
  private readonly developmentCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly moneyTransferCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public getSnapshot(): PresentationState {
    return this.state;
  }

  public subscribe(listener: PresentationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resetFromSnapshot(room: PublicRoomState): void {
    this.developmentCleanupTimers.forEach(timer => clearTimeout(timer));
    this.developmentCleanupTimers.clear();
    this.moneyTransferCleanupTimers.forEach(timer => clearTimeout(timer));
    this.moneyTransferCleanupTimers.clear();
    const positions: Record<string, number> = {};
    const balances: Record<string, number> = {};
    const developmentLevels: Record<number, number> = {};
    Object.entries(room.gameState.players).forEach(([playerId, player]) => {
      positions[playerId] = player.currentTile;
      balances[playerId] = player.accountBalance;
    });
    Object.entries(room.gameState.boardState.finishedPlayers).forEach(([playerId, player]) => {
      if (balances[playerId] === undefined) balances[playerId] = player.accountBalance ?? 0;
    });
    Object.entries(room.gameState.boardState.ownedProps).forEach(([tileId, property]) => {
      developmentLevels[Number(tileId)] = property.houses;
    });
    this.playerJoinOrder.clear();
    room.players.forEach(player => this.playerJoinOrder.set(player.playerId, player.joinOrder));
    const pendingCard = room.gameState.turnInfo.pendingCardInteraction;
    this.activeCharacterMovements.clear();
    this.state = {
      displayLogs: [...room.gameState.boardState.logs],
      displayActivity: [...room.gameState.boardState.activityFeed.events],
      displayPositions: positions,
      settledPositions: positions,
      displayBalances: balances,
      displayDevelopmentLevels: developmentLevels,
      displayActivePlayerId: room.gameState.boardState.currentPlayer.id || null,
      displayDice: { ...room.gameState.boardState.diceValue },
      displayRollSequence: room.gameState.boardState.rollSequence,
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
      cardPresentation: pendingCard
        ? {
            operationId: pendingCard.operationId,
            playerId: pendingCard.playerId,
            deck: pendingCard.deck,
            sourceTile: pendingCard.sourceTile,
            stage: pendingCard.stage,
            ...(pendingCard.revealedCardId ? { revealedCardId: pendingCard.revealedCardId } : {}),
            durationMs: 0,
          }
        : null,
      animationSpeedMultiplier: this.state.animationSpeedMultiplier,
      reducedMotion: this.state.reducedMotion,
      presentationResetEpoch: this.state.presentationResetEpoch + 1,
    };
    this.nextTileImpactSequence = 0;
    this.nextCharacterMovementSequence = 0;
    this.nextCharacterLandingSequence = 0;
    this.nextCharacterReactionSequence = 0;
    this.nextConsequenceOrder = 0;
    this.nextBalanceDeltaSequence = 0;
    this.nextOwnershipChangeSequence = 0;
    this.nextDevelopmentChangeSequence = 0;
    this.nextGoCrossingSequence = 0;
    this.nextMoneyTransferSequence = 0;
    this.balanceDeltaIds.clear();
    this.pendingBalanceChanges.clear();
    this.ownershipChangeIds.clear();
    this.developmentChangeIds.clear();
    this.goCrossingIds.clear();
    this.moneyTransferIds.clear();
    this.notify();
  }

  public setDisplayLogs(logs: readonly string[]): void {
    if (this.state.displayLogs.length === logs.length
      && this.state.displayLogs.every((log, index) => log === logs[index])) return;
    this.state = { ...this.state, displayLogs: [...logs] };
    this.notify();
  }

  public setDisplayActivity(events: readonly ActivityEvent[]): void {
    if (this.state.displayActivity.length === events.length
      && this.state.displayActivity.every((event, index) => event.eventId === events[index]?.eventId)) return;
    this.state = { ...this.state, displayActivity: [...events] };
    this.notify();
  }

  public syncPlayers(room: PublicRoomState): void {
    room.players.forEach(player => this.playerJoinOrder.set(player.playerId, player.joinOrder));
    const nextPositions: Record<string, number> = {};
    const nextSettledPositions: Record<string, number> = {};
    let changed = false;
    Object.entries(room.gameState.players).forEach(([playerId, player]) => {
      if (this.state.displayPositions[playerId] === undefined) changed = true;
      nextPositions[playerId] = this.state.displayPositions[playerId] ?? player.currentTile;
      if (this.state.settledPositions[playerId] === undefined) changed = true;
      nextSettledPositions[playerId] = this.state.settledPositions[playerId] ?? player.currentTile;
    });
    if (Object.keys(nextPositions).length !== Object.keys(this.state.displayPositions).length) changed = true;
    if (Object.keys(nextSettledPositions).length !== Object.keys(this.state.settledPositions).length) changed = true;
    if (!changed) return;
    this.state = {
      ...this.state,
      displayPositions: nextPositions,
      settledPositions: nextSettledPositions,
    };
    this.notify();
  }

  public syncDisplayBalances(
    balances: Readonly<Record<string, number>>,
    delayedChanges: readonly Pick<BalanceDeltaSignal, 'id' | 'playerId' | 'from' | 'to'>[] = [],
  ): void {
    delayedChanges.forEach(change => {
      const pending = this.pendingBalanceChanges.get(change.playerId) ?? new Set<string>();
      pending.add(change.id);
      this.pendingBalanceChanges.set(change.playerId, pending);
    });

    const nextBalances: Record<string, number> = {};
    Object.entries(balances).forEach(([playerId, authoritativeBalance]) => {
      const pending = this.pendingBalanceChanges.get(playerId);
      nextBalances[playerId] = pending && pending.size > 0
        ? this.state.displayBalances[playerId]
          ?? delayedChanges.find(change => change.playerId === playerId)?.from
          ?? authoritativeBalance
        : authoritativeBalance;
    });
    this.pendingBalanceChanges.forEach((pending, playerId) => {
      if (nextBalances[playerId] !== undefined || pending.size === 0) return;
      const fallback = delayedChanges.find(change => change.playerId === playerId);
      if (fallback) nextBalances[playerId] = this.state.displayBalances[playerId] ?? fallback.from;
    });

    const currentEntries = Object.entries(this.state.displayBalances);
    const unchanged = currentEntries.length === Object.keys(nextBalances).length
      && currentEntries.every(([playerId, balance]) => nextBalances[playerId] === balance);
    if (unchanged) return;
    this.state = { ...this.state, displayBalances: nextBalances };
    this.notify();
  }

  public syncDisplayDevelopmentLevels(
    levels: Readonly<Record<number, number | { houses: number }>>,
    delayedChanges: readonly Pick<DevelopmentChangeSignal, 'tileId' | 'fromHouses' | 'toHouses'>[] = [],
  ): void {
    const delayedByTile = new Map(delayedChanges.map(change => [change.tileId, change]));
    const nextLevels: Record<number, number> = {};
    Object.entries(levels).forEach(([rawTileId, value]) => {
      const tileId = Number(rawTileId);
      const authoritativeLevel = typeof value === 'number' ? value : value.houses;
      const delayed = delayedByTile.get(tileId);
      nextLevels[tileId] = delayed
        ? Math.min(
          this.state.displayDevelopmentLevels[tileId] ?? delayed.fromHouses,
          delayed.fromHouses,
        )
        : authoritativeLevel;
    });
    const currentEntries = Object.entries(this.state.displayDevelopmentLevels);
    const unchanged = currentEntries.length === Object.keys(nextLevels).length
      && currentEntries.every(([tileId, level]) => nextLevels[Number(tileId)] === level);
    if (unchanged) return;
    this.state = { ...this.state, displayDevelopmentLevels: nextLevels };
    this.notify();
  }

  public startCharacterHop(
    playerId: string,
    fromTileId: number,
    toTileId: number,
    durationMs: number,
  ): void {
    const currentPositions = this.state.displayPositions;
    const nextPositions = { ...currentPositions, [playerId]: toTileId };
    const fromSlot = this.getSlotInfo(currentPositions, playerId, fromTileId);
    const toSlot = this.getSlotInfo(nextPositions, playerId, toTileId);
    this.nextCharacterMovementSequence += 1;
    const signal: CharacterMovementSignal = {
      sequence: this.nextCharacterMovementSequence,
      playerId,
      transition: 'TILE_HOP',
      phase: 'START',
      fromTileId,
      toTileId,
      fromSlotIndex: fromSlot.slotIndex,
      fromOccupantCount: fromSlot.occupantCount,
      toSlotIndex: toSlot.slotIndex,
      toOccupantCount: toSlot.occupantCount,
      durationMs: Math.max(0, durationMs),
    };
    this.activeCharacterMovements.set(playerId, signal);
    this.state = {
      ...this.state,
      displayPositions: nextPositions,
      characterMovements: this.appendCharacterMovement(signal),
    };
    this.notify();
  }

  public startJailTransfer(
    playerId: string,
    fromTileId: number,
    toTileId: number,
    durationMs: number,
  ): void {
    const currentPositions = this.state.displayPositions;
    const nextPositions = { ...currentPositions, [playerId]: toTileId };
    const fromSlot = this.getSlotInfo(currentPositions, playerId, fromTileId);
    const toSlot = this.getSlotInfo(nextPositions, playerId, toTileId);
    this.nextCharacterMovementSequence += 1;
    const signal: CharacterMovementSignal = {
      sequence: this.nextCharacterMovementSequence,
      playerId,
      transition: 'JAIL_TRANSFER',
      phase: 'START',
      fromTileId,
      toTileId,
      fromSlotIndex: fromSlot.slotIndex,
      fromOccupantCount: fromSlot.occupantCount,
      toSlotIndex: toSlot.slotIndex,
      toOccupantCount: toSlot.occupantCount,
      durationMs: Math.max(0, durationMs),
    };
    this.activeCharacterMovements.set(playerId, signal);
    this.state = {
      ...this.state,
      displayPositions: nextPositions,
      characterMovements: this.appendCharacterMovement(signal),
    };
    this.notify();
  }

  public completeCharacterHop(playerId: string, tileId: number): void {
    const active = this.activeCharacterMovements.get(playerId);
    this.activeCharacterMovements.delete(playerId);
    const signal = active
      ? active
      : this.createSnapSignal(playerId, tileId);
    this.nextCharacterMovementSequence += 1;
    const completed: CharacterMovementSignal = {
      ...signal,
      sequence: this.nextCharacterMovementSequence,
      phase: 'COMPLETE',
      toTileId: tileId,
    };
    this.state = {
      ...this.state,
      displayPositions: { ...this.state.displayPositions, [playerId]: tileId },
      settledPositions: { ...this.state.settledPositions, [playerId]: tileId },
      characterMovements: this.appendCharacterMovement(completed),
    };
    this.notify();
  }

  public snapDisplayPosition(playerId: string, tileId: number): void {
    const currentTileId = this.state.displayPositions[playerId]
      ?? this.state.settledPositions[playerId]
      ?? tileId;
    this.activeCharacterMovements.delete(playerId);
    this.nextCharacterMovementSequence += 1;
    const signal: CharacterMovementSignal = {
      ...this.createSnapSignal(playerId, tileId, currentTileId),
      sequence: this.nextCharacterMovementSequence,
    };
    this.state = {
      ...this.state,
      displayPositions: { ...this.state.displayPositions, [playerId]: tileId },
      settledPositions: { ...this.state.settledPositions, [playerId]: tileId },
      characterMovements: this.appendCharacterMovement(signal),
    };
    this.notify();
  }

  public emitCharacterLanding(playerId: string, tileId: number, durationMs: number): void {
    this.nextCharacterLandingSequence += 1;
    const nextLanding = {
      sequence: this.nextCharacterLandingSequence,
      playerId,
      tileId,
      durationMs: Math.max(0, durationMs),
    };
    const characterLandings = [...this.state.characterLandings, nextLanding].slice(-CHARACTER_SIGNAL_LIMIT);
    this.state = { ...this.state, characterLandings };
    this.notify();
  }

  public startDiceRoll(dice: DiceValue, rollSequence: number, durationMs: number): void {
    if (rollSequence <= this.state.displayRollSequence) return;
    if (this.state.diceRoll?.rollSequence === rollSequence
      && this.state.diceRoll.dice.dice1 === dice.dice1
      && this.state.diceRoll.dice.dice2 === dice.dice2) return;
    const fromDice = this.state.displayRollSequence > 0
      ? { ...this.state.displayDice }
      : undefined;
    this.state = {
      ...this.state,
      diceRoll: {
        lifecycle: 'rolling',
        dice: { ...dice },
        ...(fromDice ? { fromDice } : {}),
        rollSequence,
        durationMs: Math.max(0, durationMs),
      },
    };
    this.notify();
  }

  public settleDiceRoll(dice: DiceValue, rollSequence: number): void {
    const activeRoll = this.state.diceRoll;
    if (rollSequence < this.state.displayRollSequence) {
      if (activeRoll?.rollSequence === rollSequence) {
        this.state = { ...this.state, diceRoll: null };
        this.notify();
      }
      return;
    }
    if (rollSequence === this.state.displayRollSequence
      && this.state.displayDice.dice1 === dice.dice1
      && this.state.displayDice.dice2 === dice.dice2) {
      if (!activeRoll) return;
      this.state = { ...this.state, diceRoll: null };
      this.notify();
      return;
    }
    this.state = {
      ...this.state,
      displayDice: { ...dice },
      displayRollSequence: rollSequence,
      diceRoll: null,
    };
    this.notify();
  }

  public setDisplayDice(dice: DiceValue, rollSequence: number): void {
    if (rollSequence <= this.state.displayRollSequence) return;
    this.state = {
      ...this.state,
      displayDice: { ...dice },
      displayRollSequence: rollSequence,
    };
    this.notify();
  }

  public syncDisplayDice(dice: DiceValue, rollSequence: number): void {
    if (this.state.diceRoll && rollSequence <= this.state.diceRoll.rollSequence) return;
    if (rollSequence < this.state.displayRollSequence
      || (rollSequence === this.state.displayRollSequence
        && this.state.displayDice.dice1 === dice.dice1
        && this.state.displayDice.dice2 === dice.dice2)) return;
    this.state = {
      ...this.state,
      displayDice: { ...dice },
      displayRollSequence: rollSequence,
      diceRoll: null,
    };
    this.notify();
  }

  public setDisplayActivePlayerId(playerId: string): void {
    const next = playerId || null;
    if (this.state.displayActivePlayerId === next) return;
    this.state = { ...this.state, displayActivePlayerId: next };
    this.notify();
  }

  public emitTileImpact(
    playerId: string,
    tileId: number,
    kind: PresentationState['tileImpacts'][number]['kind'],
    timing: TileImpactTiming,
  ): void {
    this.nextTileImpactSequence += 1;
    const nextImpact: TileImpactSignal = {
      sequence: this.nextTileImpactSequence,
      playerId,
      tileId,
      kind,
      delayMs: Math.max(0, timing.delayMs),
      depressDurationMs: Math.max(0, timing.depressDurationMs),
      reboundDurationMs: Math.max(0, timing.reboundDurationMs),
    };
    const impacts = [...this.state.tileImpacts, nextImpact].slice(-64);
    this.state = { ...this.state, tileImpacts: impacts };
    this.notify();
  }

  public emitCharacterReaction(playerId: string, kind: CharacterReactionKind, durationMs: number): void {
    this.nextCharacterReactionSequence += 1;
    const nextReaction = {
      sequence: this.nextCharacterReactionSequence,
      playerId,
      kind,
      durationMs: Math.max(0, durationMs),
    };
    const characterReactions = [...this.state.characterReactions, nextReaction].slice(-64);
    this.state = { ...this.state, characterReactions };
    this.notify();
  }

  public emitBalanceDelta(
    id: string,
    playerId: string,
    from: number,
    to: number,
    durationMs: number,
  ): void {
    if (this.balanceDeltaIds.has(id)) return;
    this.nextConsequenceOrder += 1;
    this.nextBalanceDeltaSequence += 1;
    const signal: BalanceDeltaSignal = {
      id,
      sequence: this.nextBalanceDeltaSequence,
      consequenceOrder: this.nextConsequenceOrder,
      playerId,
      from,
      to,
      delta: to - from,
      durationMs: Math.max(0, durationMs),
    };
    const balanceDeltas = this.appendOneShotSignal(
      this.state.balanceDeltas,
      this.balanceDeltaIds,
      signal,
    );
    if (!balanceDeltas) return;
    const pending = this.pendingBalanceChanges.get(playerId);
    pending?.delete(id);
    if (pending && pending.size === 0) this.pendingBalanceChanges.delete(playerId);
    this.state = {
      ...this.state,
      displayBalances: { ...this.state.displayBalances, [playerId]: to },
      balanceDeltas,
    };
    this.notify();
  }

  public emitOwnershipChange(
    id: string,
    tileId: number,
    fromPlayerId: string | null,
    toPlayerId: string | null,
    durationMs: number,
  ): void {
    if (this.ownershipChangeIds.has(id)) return;
    this.nextConsequenceOrder += 1;
    this.nextOwnershipChangeSequence += 1;
    const signal: OwnershipChangeSignal = {
      id,
      sequence: this.nextOwnershipChangeSequence,
      consequenceOrder: this.nextConsequenceOrder,
      tileId,
      fromPlayerId,
      toPlayerId,
      durationMs: Math.max(0, durationMs),
    };
    const ownershipChanges = this.appendOneShotSignal(
      this.state.ownershipChanges,
      this.ownershipChangeIds,
      signal,
    );
    if (!ownershipChanges) return;
    this.state = { ...this.state, ownershipChanges };
    this.notify();
  }

  public emitDevelopmentChange(
    id: string,
    tileId: number,
    playerId: string,
    fromHouses: number,
    toHouses: number,
    durationMs: number,
  ): void {
    if (this.developmentChangeIds.has(id)) return;
    this.nextConsequenceOrder += 1;
    this.nextDevelopmentChangeSequence += 1;
    const signal: DevelopmentChangeSignal = {
      id,
      sequence: this.nextDevelopmentChangeSequence,
      consequenceOrder: this.nextConsequenceOrder,
      tileId,
      playerId,
      fromHouses,
      toHouses,
      delta: toHouses - fromHouses,
      direction: toHouses >= fromHouses ? 'UP' : 'DOWN',
      durationMs: Math.max(0, durationMs),
    };
    const developmentChanges = this.appendOneShotSignal(
      this.state.developmentChanges,
      this.developmentChangeIds,
      signal,
    );
    if (!developmentChanges) return;
    this.state = {
      ...this.state,
      displayDevelopmentLevels: {
        ...this.state.displayDevelopmentLevels,
        [tileId]: Math.max(0, Math.min(5, toHouses)),
      },
      developmentChanges,
    };
    this.notify();
    const cleanupTimer = setTimeout(() => {
      this.developmentCleanupTimers.delete(id);
      if (!this.state.developmentChanges.some(signal => signal.id === id)) return;
      this.state = {
        ...this.state,
        developmentChanges: this.state.developmentChanges.filter(signal => signal.id !== id),
      };
      this.notify();
    }, Math.max(0, durationMs) + 50);
    this.developmentCleanupTimers.set(id, cleanupTimer);
  }

  public emitGoCrossing(id: string, playerId: string, fromTileId: number, durationMs: number): void {
    if (this.goCrossingIds.has(id)) return;
    this.nextConsequenceOrder += 1;
    this.nextGoCrossingSequence += 1;
    const signal: GoCrossingSignal = {
      id,
      sequence: this.nextGoCrossingSequence,
      consequenceOrder: this.nextConsequenceOrder,
      playerId,
      fromTileId,
      toTileId: 0,
      durationMs: Math.max(0, durationMs),
    };
    const goCrossings = this.appendOneShotSignal(
      this.state.goCrossings,
      this.goCrossingIds,
      signal,
    );
    if (!goCrossings) return;
    this.state = { ...this.state, goCrossings };
    this.notify();
  }

  public showDestinationPreview(signal: DestinationPreviewSignal): void {
    this.state = {
      ...this.state,
      destinationPreview: { ...signal, strongDurationMs: Math.max(0, signal.strongDurationMs) },
    };
    this.notify();
  }

  public clearDestinationPreview(id?: string): void {
    if (!this.state.destinationPreview) return;
    if (id && this.state.destinationPreview.id !== id) return;
    this.state = { ...this.state, destinationPreview: null };
    this.notify();
  }

  public emitMoneyTransfer(
    signal: Omit<MoneyTransferSignal, 'sequence' | 'coinCount'>,
  ): void {
    if (this.moneyTransferIds.has(signal.id)) return;
    this.nextMoneyTransferSequence += 1;
    const amount = Math.max(1, signal.amount);
    const coinCount = Math.min(8, Math.max(2, 2 + Math.floor(Math.log10(amount))));
    const next: MoneyTransferSignal = {
      ...signal,
      sequence: this.nextMoneyTransferSequence,
      coinCount,
      durationMs: Math.max(0, signal.durationMs),
    };
    const moneyTransfers = this.appendOneShotSignal(
      this.state.moneyTransfers,
      this.moneyTransferIds,
      next,
    );
    if (!moneyTransfers) return;
    this.state = { ...this.state, moneyTransfers };
    this.notify();
    const cleanupTimer = setTimeout(() => {
      this.moneyTransferCleanupTimers.delete(signal.id);
      if (!this.state.moneyTransfers.some(transfer => transfer.id === signal.id)) return;
      this.state = {
        ...this.state,
        moneyTransfers: this.state.moneyTransfers.filter(transfer => transfer.id !== signal.id),
      };
      this.notify();
    }, Math.max(0, signal.durationMs) + 50);
    this.moneyTransferCleanupTimers.set(signal.id, cleanupTimer);
  }

  public setCardPresentation(signal: CardPresentationSignal | null): void {
    this.state = { ...this.state, cardPresentation: signal };
    this.notify();
  }

  public setAnimationSpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    const next = Math.min(2, Math.max(0.75, multiplier));
    if (this.state.animationSpeedMultiplier === next) return;
    this.state = { ...this.state, animationSpeedMultiplier: next };
    this.notify();
  }

  public setReducedMotion(reducedMotion: boolean): void {
    if (this.state.reducedMotion === reducedMotion) return;
    this.state = { ...this.state, reducedMotion };
    this.notify();
  }

  public setStatus(status: AnimationQueueStatus): void {
    if (this.state.status === status) return;
    this.state = { ...this.state, status };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }

  private appendCharacterMovement(signal: CharacterMovementSignal): readonly CharacterMovementSignal[] {
    return [...this.state.characterMovements, signal].slice(-CHARACTER_SIGNAL_LIMIT);
  }

  private appendOneShotSignal<T extends { id: string }>(
    current: readonly T[],
    ids: Set<string>,
    signal: T,
  ): readonly T[] | null {
    if (ids.has(signal.id)) return null;
    const next = [...current, signal].slice(-ONE_SHOT_SIGNAL_LIMIT);
    ids.clear();
    next.forEach(item => ids.add(item.id));
    return next;
  }

  private createSnapSignal(
    playerId: string,
    toTileId: number,
    fromTileId = this.state.displayPositions[playerId] ?? toTileId,
  ): CharacterMovementSignal {
    const fromSlot = this.getSlotInfo(this.state.displayPositions, playerId, fromTileId);
    const nextPositions = { ...this.state.displayPositions, [playerId]: toTileId };
    const toSlot = this.getSlotInfo(nextPositions, playerId, toTileId);
    return {
      sequence: 0,
      playerId,
      transition: 'SNAP',
      phase: 'COMPLETE',
      fromTileId,
      toTileId,
      fromSlotIndex: fromSlot.slotIndex,
      fromOccupantCount: fromSlot.occupantCount,
      toSlotIndex: toSlot.slotIndex,
      toOccupantCount: toSlot.occupantCount,
      durationMs: 0,
    };
  }

  private getSlotInfo(
    positions: Record<string, number>,
    playerId: string,
    tileId: number,
  ): { slotIndex: number; occupantCount: number } {
    const occupants = Object.entries(positions)
      .filter(([, position]) => position === tileId)
      .map(([id]) => id);
    if (!occupants.includes(playerId)) occupants.push(playerId);
    occupants.sort((left, right) => (
      (this.playerJoinOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (this.playerJoinOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    ) || left.localeCompare(right));
    return {
      slotIndex: Math.max(0, occupants.indexOf(playerId)),
      occupantCount: occupants.length,
    };
  }
}

