import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type GameplaySemanticEvent,
  type PublicRoomState,
  type RoomRole,
} from '@monopoly/shared';
import Board from '../../components/Board';
import stateContext from '../../internal';
import { PresentationController } from '../../game/presentation/PresentationController';
import { PresentationProvider } from '../../game/presentation/PresentationProvider';
import CardInteractionOverlay, {
  CardInteractionProvider,
} from '../../game/ui/events/CardInteractionOverlay';
import { DEFAULT_GAME_SETTINGS } from '../../settings/defaults';
import { useSettings } from '../../settings/selectors';
import { SettingsProvider } from '../../settings/SettingsProvider';
import type { SocketFunctions } from '../../types';
import './Phase4UatHarness.css';

const PLAYER_IDS = ['player-a', 'player-b', 'player-c', 'player-d'] as const;
const PLAYER_NAMES = ['An', 'Bình', 'Chi', 'Dũng'] as const;
const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
const PLAYER_CHARACTERS = ['dog', 'panda', 'cat', 'penguin'] as const;
const CARD_OPERATION = '00000000-0000-4000-8000-000000004001';
const CHAIN_OPERATION = '00000000-0000-4000-8000-000000004002';

const scenarios = [
  ['stations-2', '01 · Trạm 2 người'],
  ['stations-4', '01 · Trạm 4 người'],
  ['walk', '02 · Đích đến → di chuyển'],
  ['roll-chance', '02 · Đổ → Cơ Hội → LAND → thẻ'],
  ['roll-chest', '02 · Đổ → Khí Vận → LAND → thẻ'],
  ['pass-go', '03 · Qua Xuất Phát'],
  ['purchase', '04 · Mua tài sản'],
  ['decline', '05 · Từ chối mua'],
  ['rent', '06 · Trả tiền thuê'],
  ['partial-debt', '07 · Thanh toán thiếu'],
  ['bank-sale', '08 · Bán lại ngân hàng'],
  ['forced-sale', '09 · Đổi chủ bắt buộc'],
  ['house-1', '10 · Xây 1 nhà'],
  ['house-2', '10 · Xây 2 nhà'],
  ['house-3', '10 · Xây 3 nhà'],
  ['house-4', '10 · Xây 4 nhà'],
  ['hotel', '10 · 4 nhà → khách sạn'],
  ['chance', '11 · Rút Cơ Hội'],
  ['chest', '12 · Rút Khí Vận'],
  ['pay-each', '13 · Thẻ trả mỗi người'],
  ['collect-each', '13 · Thẻ thu mỗi người'],
  ['card-chain', '14 · Thẻ nối sang thẻ'],
  ['jail', '15 · Bị đưa vào tù'],
  ['just-visiting', '16 · Thăm tù'],
  ['jail-failed', '17 · Chưa thoát tù'],
  ['jail-bail', '17 · Ra tù bằng bảo lãnh'],
  ['jail-free', '17 · Dùng thẻ ra tù'],
  ['bankrupt', '18 · Phá sản giữ nguyên trạm'],
  ['leave-mid-motion', '19 · Rời giữa chuyển động'],
  ['reconnect-awaiting', '20 · Kết nối lại khi chờ rút'],
  ['reconnect-revealed', '20 · Kết nối lại khi đã mở'],
  ['spectator-awaiting', '21 · Khán giả chờ mở thẻ'],
  ['spectator-revealed', '21 · Khán giả xem thẻ đã mở'],
  ['speed-walk', '22 · Kiểm tra tốc độ'],
  ['reduced-motion', '23 · Giảm chuyển động'],
  ['skip-motion', '24 · Bỏ qua chuyển động'],
  ['skip-card-flight', '24 · Bỏ qua khi thẻ đang bay'],
  ['skip-card-reveal', '24 · Bỏ qua khi thẻ đang lật'],
  ['keyboard-card', '26 · Focus / Escape thẻ'],
  ['opponent-turn', '27 · Ẩn Roll khi đối thủ chơi'],
  ['stress', 'Hiệu năng · trạng thái đồng thời'],
] as const;

type ScenarioKey = typeof scenarios[number][0];
type SemanticWithoutIdentity<T> = T extends GameplaySemanticEvent
  ? Omit<T, 'eventId' | 'sequence'>
  : never;
type SemanticInput = SemanticWithoutIdentity<GameplaySemanticEvent>;

function successfulAck(revision: number): Ack {
  return { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision };
}

function createRoom(playerCount: 2 | 4, run: number): PublicRoomState {
  const ids = PLAYER_IDS.slice(0, playerCount);
  return {
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    version: 1,
    roomId: `phase4-uat-${run}`,
    roomCode: 'P4UAT',
    status: 'IN_PROGRESS',
    hostPlayerId: 'player-a',
    minPlayers: 2,
    maxPlayers: 4,
    players: ids.map((playerId, index) => ({
      playerId,
      name: PLAYER_NAMES[index],
      color: PLAYER_COLORS[index],
      characterId: PLAYER_CHARACTERS[index],
      joinOrder: index,
      membershipStatus: 'ACTIVE',
      ready: true,
      connected: true,
    })),
    gameState: {
      boardState: {
        gameStarted: true,
        gameStartedAt: '2030-01-01T00:00:00.000Z',
        players: [...ids],
        finishedPlayers: {},
        currentPlayer: { id: 'player-a', hasMoved: false },
        turnNumber: 1,
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 0, dice2: 0 },
        rollSequence: 0,
        gameplayEvents: { sequence: 0, events: [] },
        ownedProps: {},
        winner: null,
        paymentShortfall: null,
      },
      players: Object.fromEntries(ids.map((playerId, index) => [playerId, {
        name: PLAYER_NAMES[index],
        currentTile: [1, 12, 22, 32][index] ?? 0,
        color: PLAYER_COLORS[index],
        characterId: PLAYER_CHARACTERS[index],
        accountBalance: [1_500, 1_350, 1_800, 950][index] ?? 1_500,
        isJail: false,
        jailOpponentRoundsElapsed: 0,
        getOutOfJailCardCount: playerId === 'player-a' ? 1 : 0,
      }])),
      turnInfo: {},
      deckCounts: { chance: 13, chest: 15 },
      loaded: true,
    },
  };
}

function cloneRoom(room: PublicRoomState): PublicRoomState {
  const next = structuredClone(room);
  next.version += 1;
  return next;
}

function appendSemantic(room: PublicRoomState, inputs: SemanticInput[]): void {
  const stream = room.gameState.boardState.gameplayEvents;
  const added = inputs.map((input, index) => ({
    ...input,
    sequence: stream.sequence + index + 1,
    eventId: `${room.roomId}:semantic-${stream.sequence + index + 1}`,
  }));
  room.gameState.boardState.gameplayEvents = {
    sequence: stream.sequence + added.length,
    events: [...stream.events, ...added],
  };
}

function setPendingCard(
  room: PublicRoomState,
  deck: 'chance' | 'chest',
  stage: 'AWAITING_DRAW' | 'REVEALED',
  cardId?: string,
): void {
  const sourceTile = deck === 'chance' ? 7 : 2;
  room.gameState.players['player-a'].currentTile = sourceTile;
  room.gameState.boardState.currentPlayer.hasMoved = true;
  room.gameState.turnInfo.pendingCardInteraction = {
    operationId: CARD_OPERATION,
    playerId: 'player-a',
    turnNumber: room.gameState.boardState.turnNumber,
    deck,
    sourceTile,
    stage,
    ...(cardId ? { revealedCardId: cardId } : {}),
    continuation: { playerId: 'player-a', turnNumber: room.gameState.boardState.turnNumber },
    deadlineAt: '2030-01-01T00:00:30.000Z',
  };
}

function cardForScenario(scenario: ScenarioKey): string {
  if (scenario === 'pay-each') return 'chance-community-event';
  if (scenario === 'collect-each') return 'chest-birthday';
  if (scenario === 'card-chain') return 'chance-back-three';
  if (scenario === 'jail') return 'chance-go-to-jail';
  if (scenario === 'chest') return 'chest-bank-adjustment';
  return 'chance-dividend';
}

function cardDeckForScenario(scenario: ScenarioKey): 'chance' | 'chest' {
  return scenario === 'chest' || scenario === 'collect-each' || scenario === 'roll-chest' ? 'chest' : 'chance';
}

const liveCardScenarios: readonly ScenarioKey[] = [
  'chance', 'chest', 'pay-each', 'collect-each', 'card-chain', 'keyboard-card',
  'skip-card-flight', 'skip-card-reveal', 'roll-chance', 'roll-chest',
];

function configureBaseline(
  room: PublicRoomState,
  scenario: ScenarioKey,
): { playerId: string | null; role: RoomRole } {
  if (scenario === 'purchase' || scenario === 'decline') {
    room.gameState.players['player-a'].currentTile = 1;
  }
  if (scenario === 'decline') {
    room.gameState.boardState.currentPlayer.hasMoved = true;
    room.gameState.turnInfo.pendingLandingDecision = {
      kind: 'PURCHASE',
      operationId: '00000000-0000-4000-8000-000000004003',
      playerId: 'player-a',
      tileID: 1,
      price: 60,
    };
  }
  if (scenario === 'bank-sale' || scenario === 'forced-sale') {
    room.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 0 };
  }
  if (scenario.startsWith('house-')) {
    room.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 0 };
  }
  if (scenario === 'hotel') {
    room.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 4 };
  }
  if (scenario === 'stations-2' || scenario === 'stations-4') {
    room.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 2 };
    room.gameState.boardState.ownedProps[3] = { id: 'player-b', color: 'blue', houses: 5 };
    if (scenario === 'stations-4') {
      room.gameState.boardState.ownedProps[5] = { id: 'player-c', color: 'green', houses: 0 };
      room.gameState.boardState.ownedProps[6] = { id: 'player-d', color: 'yellow', houses: 0 };
      const disconnected = room.players.find(player => player.playerId === 'player-c');
      if (disconnected) disconnected.connected = false;
    }
  }
  if (liveCardScenarios.includes(scenario)) {
    room.gameState.players['player-a'].currentTile = cardDeckForScenario(scenario) === 'chance' ? 7 : 2;
  }
  if (scenario === 'reconnect-awaiting') setPendingCard(room, 'chance', 'AWAITING_DRAW');
  if (scenario === 'reconnect-awaiting' || scenario === 'reconnect-revealed') {
    room.gameState.boardState.logs = ['Lịch sử: An đã đáp xuống ô rút thẻ.'];
  }
  if (scenario === 'reconnect-revealed') setPendingCard(room, 'chance', 'REVEALED', 'chance-dividend');
  if (scenario === 'spectator-awaiting') {
    setPendingCard(room, 'chest', 'AWAITING_DRAW');
    return { playerId: null, role: 'SPECTATOR' };
  }
  if (scenario === 'spectator-revealed') {
    setPendingCard(room, 'chest', 'REVEALED', 'chest-bank-adjustment');
    return { playerId: null, role: 'SPECTATOR' };
  }
  if (scenario === 'pass-go') room.gameState.players['player-a'].currentTile = 37;
  if (scenario === 'roll-chance' || scenario === 'roll-chest') {
    room.gameState.players['player-a'].currentTile = 0;
  }
  if (scenario === 'opponent-turn') {
    room.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
  }
  if (scenario === 'jail') room.gameState.players['player-a'].currentTile = 25;
  if (scenario === 'just-visiting') room.gameState.players['player-a'].currentTile = 8;
  if (scenario === 'jail-bail' || scenario === 'jail-free') {
    room.gameState.players['player-a'].currentTile = 10;
    room.gameState.players['player-a'].isJail = true;
  }
  if (scenario === 'bankrupt') {
    const bankrupt = room.gameState.players['player-b'];
    delete room.gameState.players['player-b'];
    room.gameState.boardState.players = room.gameState.boardState.players.filter(id => id !== 'player-b');
    room.gameState.boardState.finishedPlayers['player-b'] = {
      name: bankrupt.name,
      color: bankrupt.color,
      characterId: bankrupt.characterId,
      reason: 'BANKRUPT',
      accountBalance: 0,
    };
    const meta = room.players.find(player => player.playerId === 'player-b');
    if (meta) meta.membershipStatus = 'FINISHED';
  }
  return { playerId: 'player-a', role: 'PLAYER' };
}

function Phase4UatSurface() {
  const [controller] = useState(() => new PresentationController());
  const subscribeToPresentation = useMemo(
    () => controller.store.subscribe.bind(controller.store),
    [controller],
  );
  const getPresentationSnapshot = useMemo(
    () => controller.store.getSnapshot.bind(controller.store),
    [controller],
  );
  const presentationState = useSyncExternalStore(
    subscribeToPresentation,
    getPresentationSnapshot,
    getPresentationSnapshot,
  );
  const [scenario, setScenario] = useState<ScenarioKey>('stations-4');
  const [room, setRoom] = useState(() => createRoom(4, 1));
  const [viewer, setViewer] = useState<{ playerId: string | null; role: RoomRole }>({
    playerId: 'player-a', role: 'PLAYER',
  });
  const [rendererMetrics, setRendererMetrics] = useState<Record<string, unknown> | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const traceRef = useRef<{
    scenario: ScenarioKey;
    steps: string[];
    previewBeforeWalk: boolean;
    previewBeforeLand: boolean;
  }>({ scenario: 'stations-4', steps: [], previewBeforeWalk: false, previewBeforeLand: false });
  const runNumberRef = useRef(1);
  const roomRef = useRef(room);
  const scenarioRef = useRef(scenario);
  const timersRef = useRef<number[]>([]);
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    if (traceRef.current.scenario !== scenario) {
      traceRef.current = {
        scenario,
        steps: [],
        previewBeforeWalk: false,
        previewBeforeLand: false,
      };
    }
    const trace = traceRef.current;
    const addStep = (step: string) => {
      if (!trace.steps.includes(step)) trace.steps.push(step);
    };
    if (presentationState.destinationPreview) {
      if (!trace.steps.includes('WALK')) trace.previewBeforeWalk = true;
      addStep('PREVIEW');
    }
    const movement = presentationState.characterMovements.at(-1);
    if (movement?.phase === 'START') {
      if (presentationState.destinationPreview) trace.previewBeforeLand = true;
      addStep('WALK');
    }
    if (presentationState.characterLandings.length > 0) addStep('LAND');
    if (presentationState.cardPresentation?.stage === 'AWAITING_DRAW'
      || presentationState.cardPresentation?.stage === 'REVEALED') addStep('CARD');
  }, [presentationState, scenario]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);
  const schedule = useCallback((callback: () => void, delayMs: number) => {
    timersRef.current.push(window.setTimeout(callback, delayMs));
  }, []);
  const commit = useCallback((mutate: (next: PublicRoomState) => void, source: 'LIVE_UPDATE' | 'SESSION_SYNC' = 'LIVE_UPDATE') => {
    const next = cloneRoom(roomRef.current);
    mutate(next);
    roomRef.current = next;
    setRoom(next);
    controller.acceptRoomSnapshot(next, source);
  }, [controller]);

  const applyAnimatedScenario = useCallback((key: ScenarioKey) => {
    if (key === 'roll-chance' || key === 'roll-chest') {
      commit(next => {
        const deck = key === 'roll-chance' ? 'chance' : 'chest';
        const destinationTile = deck === 'chance' ? 7 : 2;
        next.gameState.boardState.diceValue = deck === 'chance'
          ? { dice1: 3, dice2: 4 }
          : { dice1: 1, dice2: 1 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.boardState.currentPlayer.hasMoved = true;
        next.gameState.players['player-a'].currentTile = destinationTile;
        setPendingCard(next, deck, 'AWAITING_DRAW');
        next.gameState.boardState.logs = [`An đổ được ${deck === 'chance' ? 7 : 2}`];
      });
      return;
    }
    if (liveCardScenarios.includes(key)) {
      commit(next => {
        setPendingCard(next, cardDeckForScenario(key), 'AWAITING_DRAW');
        next.gameState.boardState.logs = ['An đáp xuống ô rút thẻ'];
      });
      if (key === 'skip-card-flight') {
        schedule(() => controller.skipAllAndSnap(), 240);
      }
      if (key === 'skip-card-reveal') {
        schedule(() => commit(next => {
          const pending = next.gameState.turnInfo.pendingCardInteraction;
          if (!pending) return;
          pending.stage = 'REVEALED';
          pending.revealedCardId = cardForScenario(key);
          next.gameState.deckCounts[pending.deck] = Math.max(
            0,
            next.gameState.deckCounts[pending.deck] - 1,
          );
        }), 900);
        schedule(() => controller.skipAllAndSnap(), 1_100);
      }
      return;
    }
    if (key === 'walk' || key === 'speed-walk' || key === 'skip-motion' || key === 'reduced-motion') {
      commit(next => {
        next.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.players['player-a'].currentTile = 6;
        next.gameState.boardState.logs = ['An đổ được 5'];
      });
      schedule(() => commit(next => {
        next.gameState.boardState.turnNumber += 1;
        next.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
      }), 3_600);
      return;
    }
    if (key === 'pass-go') {
      commit(next => {
        next.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.players['player-a'].currentTile = 2;
        next.gameState.players['player-a'].accountBalance += 200;
        appendSemantic(next, [{
          type: 'PASS_GO', playerId: 'player-a', reward: 200, fromTile: 39,
          destinationTile: 2, movement: { kind: 'DICE_WALK', rollSequence: 1 },
          operationId: 'uat-pass-go',
        }, {
          type: 'MONEY_TRANSFER', source: { kind: 'BANK' },
          destination: { kind: 'PLAYER', playerId: 'player-a' }, amount: 200,
          reason: 'PASS_GO', operationId: 'uat-pass-go',
        }]);
      });
      return;
    }
    if (key === 'purchase') {
      commit(next => {
        next.gameState.players['player-a'].accountBalance -= 60;
        next.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 0 };
        appendSemantic(next, [{
          type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: 'player-a' },
          destination: { kind: 'BANK' }, amount: 60, reason: 'PROPERTY_PURCHASE',
          operationId: 'uat-purchase',
        }, {
          type: 'PROPERTY_TRANSFER', tileID: 1, from: { kind: 'BANK' },
          to: { kind: 'PLAYER', playerId: 'player-a' }, cause: 'BANK_PURCHASE',
          operationId: 'uat-purchase',
        }]);
      });
      return;
    }
    if (key === 'decline') {
      commit(next => { delete next.gameState.turnInfo.pendingLandingDecision; });
      return;
    }
    if (key === 'rent' || key === 'partial-debt') {
      commit(next => {
        const paid = key === 'partial-debt' ? 10 : 80;
        next.gameState.players['player-a'].accountBalance = key === 'partial-debt' ? 0 : 1_500 - paid;
        next.gameState.players['player-b'].accountBalance += paid;
        appendSemantic(next, [{
          type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: 'player-a' },
          destination: { kind: 'PLAYER', playerId: 'player-b' }, amount: paid,
          reason: 'RENT', operationId: 'uat-rent',
        }]);
        if (key === 'partial-debt') next.gameState.boardState.paymentShortfall = {
          debtorPlayerId: 'player-a', creditor: 'PLAYER', creditorPlayerId: 'player-b',
          amount: 80, remainingAmount: 70, source: { kind: 'RENT', tileID: 3 },
          actionDeadlineAt: '2030-01-01T00:02:00.000Z', remainingClaimCount: 1,
          paymentOperationId: 'uat-rent', claimId: 'uat-rent-claim', sellableProperties: [],
        };
      });
      return;
    }
    if (key === 'bank-sale') {
      commit(next => {
        delete next.gameState.boardState.ownedProps[1];
        next.gameState.players['player-a'].accountBalance += 30;
        appendSemantic(next, [{
          type: 'MONEY_TRANSFER', source: { kind: 'BANK' },
          destination: { kind: 'PLAYER', playerId: 'player-a' }, amount: 30,
          reason: 'PROPERTY_SALE', operationId: 'uat-bank-sale',
        }, {
          type: 'PROPERTY_TRANSFER', tileID: 1,
          from: { kind: 'PLAYER', playerId: 'player-a' }, to: { kind: 'BANK' },
          cause: 'BANK_SALE', operationId: 'uat-bank-sale',
        }]);
      });
      return;
    }
    if (key === 'forced-sale') {
      commit(next => {
        next.gameState.boardState.ownedProps[1] = { id: 'player-b', color: 'blue', houses: 0 };
        appendSemantic(next, [{
          type: 'PROPERTY_TRANSFER', tileID: 1,
          from: { kind: 'PLAYER', playerId: 'player-a' },
          to: { kind: 'PLAYER', playerId: 'player-b' },
          cause: 'FORCED_SALE', operationId: 'uat-private-forced-sale',
        }]);
      });
      return;
    }
    if (key.startsWith('house-') || key === 'hotel') {
      const target = key === 'hotel' ? 5 : Number(key.slice(-1));
      commit(next => {
        const owned = next.gameState.boardState.ownedProps[1];
        if (owned) owned.houses = target;
        next.gameState.players['player-a'].accountBalance -= target === 5 ? 50 : target * 50;
        appendSemantic(next, [{
          type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: 'player-a' },
          destination: { kind: 'BANK' }, amount: target === 5 ? 50 : target * 50,
          reason: 'DEVELOPMENT', operationId: `uat-build-${target}`,
        }]);
      });
      return;
    }
    if (key === 'jail') {
      commit(next => {
        next.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.players['player-a'].currentTile = 10;
        next.gameState.players['player-a'].isJail = true;
        appendSemantic(next, [{
          type: 'SENT_TO_JAIL', playerId: 'player-a', fromTile: 30,
          destinationTile: 10, cause: 'BOARD_TILE', operationId: 'uat-jail',
        }]);
      });
      return;
    }
    if (key === 'just-visiting') {
      commit(next => {
        next.gameState.boardState.diceValue = { dice1: 1, dice2: 1 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.players['player-a'].currentTile = 10;
      });
      return;
    }
    if (key === 'jail-failed') {
      commit(next => {
        next.gameState.players['player-a'].currentTile = 10;
        next.gameState.players['player-a'].isJail = true;
        appendSemantic(next, [{ type: 'JAIL_ROLL_FAILED', playerId: 'player-a', operationId: 'uat-jail-failed' }]);
      });
      return;
    }
    if (key === 'jail-bail' || key === 'jail-free') {
      commit(next => {
        next.gameState.players['player-a'].isJail = false;
        appendSemantic(next, [{
          type: 'JAIL_RELEASED', playerId: 'player-a',
          cause: key === 'jail-bail' ? 'BAIL' : 'JAIL_FREE_CARD', operationId: `uat-${key}`,
        }]);
      });
      return;
    }
    if (key === 'leave-mid-motion') {
      commit(next => {
        next.gameState.boardState.diceValue = { dice1: 5, dice2: 6 };
        next.gameState.boardState.rollSequence = 1;
        next.gameState.players['player-a'].currentTile = 12;
      });
      schedule(() => commit(next => {
        const left = next.gameState.players['player-a'];
        delete next.gameState.players['player-a'];
        next.gameState.boardState.players = next.gameState.boardState.players.filter(id => id !== 'player-a');
        next.gameState.boardState.finishedPlayers['player-a'] = {
          name: left.name, color: left.color, characterId: left.characterId,
          reason: 'LEFT', accountBalance: left.accountBalance,
        };
        const meta = next.players.find(player => player.playerId === 'player-a');
        if (meta) meta.membershipStatus = 'LEFT';
      }), 1_100);
      return;
    }
    if (key === 'reconnect-awaiting' || key === 'reconnect-revealed') {
      schedule(() => commit(() => {}, 'SESSION_SYNC'), 850);
      return;
    }
    if (key === 'stress') {
      commit(next => {
        next.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 4 };
        next.gameState.players['player-a'].currentTile = 6;
      }, 'SESSION_SYNC');
      controller.store.emitDevelopmentChange('uat-stress-build', 1, 'player-a', 0, 4, 1_000);
      controller.store.emitMoneyTransfer({
        id: 'uat-stress-money', source: { kind: 'PLAYER', playerId: 'player-a' },
        destination: { kind: 'PLAYER', playerId: 'player-b' }, amount: 800,
        reason: 'RENT', durationMs: 1_300,
      });
      controller.store.emitTileImpact('player-a', 6, 'LAND', {
        delayMs: 0, depressDurationMs: 120, reboundDurationMs: 180,
      });
      controller.store.emitOwnershipChange('uat-stress-owner', 3, null, 'player-c', 900);
      controller.store.showDestinationPreview({
        id: 'uat-stress-preview', playerId: 'player-d', tileId: 18, strongDurationMs: 1_000,
      });
    }
  }, [commit, controller, schedule]);

  const runScenario = useCallback((key: ScenarioKey = scenarioRef.current) => {
    clearTimers();
    scenarioRef.current = key;
    setScenario(key);
    runNumberRef.current += 1;
    const nextRoom = createRoom(key === 'stations-2' ? 2 : 4, runNumberRef.current);
    const nextViewer = configureBaseline(nextRoom, key);
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    setViewer(nextViewer);
    updateSettings({ reducedMotion: key === 'reduced-motion' });
    controller.acceptRoomSnapshot(nextRoom, 'SESSION_SYNC');
    if (![
      'stations-2', 'stations-4', 'bankrupt', 'spectator-awaiting', 'spectator-revealed',
    ].includes(key)) schedule(() => applyAnimatedScenario(key), 180);
  }, [applyAnimatedScenario, clearTimers, controller, schedule, updateSettings]);
  const runNextScenario = useCallback(() => {
    const currentIndex = scenarios.findIndex(([key]) => key === scenarioRef.current);
    const nextScenario = scenarios[(currentIndex + 1) % scenarios.length]?.[0] ?? scenarios[0][0];
    runScenario(nextScenario);
  }, [runScenario]);

  const drawCard = useCallback((operationId: string): Promise<Ack> => {
    if (operationId !== CARD_OPERATION || viewer.role !== 'PLAYER') return Promise.resolve(successfulAck(roomRef.current.version));
    commit(next => {
      const pending = next.gameState.turnInfo.pendingCardInteraction;
      if (!pending) return;
      pending.stage = 'REVEALED';
      pending.revealedCardId = cardForScenario(scenarioRef.current);
      pending.deadlineAt = '2030-01-01T00:01:00.000Z';
      next.gameState.deckCounts[pending.deck] = Math.max(
        0,
        next.gameState.deckCounts[pending.deck] - 1,
      );
    });
    return Promise.resolve(successfulAck(roomRef.current.version));
  }, [commit, viewer.role]);

  const dismissCard = useCallback((operationId: string): Promise<Ack> => {
    if (operationId !== CARD_OPERATION || viewer.role !== 'PLAYER') return Promise.resolve(successfulAck(roomRef.current.version));
    commit(next => {
      const pending = next.gameState.turnInfo.pendingCardInteraction;
      if (!pending) return;
      next.gameState.deckCounts[pending.deck] += 1;
      delete next.gameState.turnInfo.pendingCardInteraction;
      const key = scenarioRef.current;
      if (key === 'pay-each' || key === 'collect-each') {
        const inputs: SemanticInput[] = [];
        for (const recipientId of PLAYER_IDS.slice(1)) {
          const sourceId = key === 'pay-each' ? 'player-a' : recipientId;
          const destinationId = key === 'pay-each' ? recipientId : 'player-a';
          next.gameState.players[sourceId].accountBalance -= key === 'pay-each' ? 50 : 10;
          next.gameState.players[destinationId].accountBalance += key === 'pay-each' ? 50 : 10;
          inputs.push({
            type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: sourceId },
            destination: { kind: 'PLAYER', playerId: destinationId },
            amount: key === 'pay-each' ? 50 : 10, reason: 'CARD',
            operationId: CARD_OPERATION,
          });
        }
        appendSemantic(next, inputs);
      } else if (key === 'card-chain') {
        next.gameState.players['player-a'].currentTile = 7;
        next.gameState.turnInfo.pendingCardInteraction = {
          operationId: CHAIN_OPERATION, playerId: 'player-a', turnNumber: 1,
          deck: 'chance', sourceTile: 7, stage: 'AWAITING_DRAW',
          continuation: { playerId: 'player-a', turnNumber: 1 },
          deadlineAt: '2030-01-01T00:02:00.000Z',
        };
      } else {
        const amount = key === 'chest' ? 200 : 50;
        next.gameState.players['player-a'].accountBalance += amount;
        appendSemantic(next, [{
          type: 'MONEY_TRANSFER', source: { kind: 'BANK' },
          destination: { kind: 'PLAYER', playerId: 'player-a' }, amount,
          reason: 'CARD', operationId: CARD_OPERATION,
        }]);
        next.gameState.boardState.turnNumber += 1;
        next.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
      }
    });
    return Promise.resolve(successfulAck(roomRef.current.version));
  }, [commit, viewer.role]);

  const socketFunctions = useMemo(() => ({
    rollDice: () => Promise.resolve(successfulAck(roomRef.current.version)),
    buyProperty: () => Promise.resolve(successfulAck(roomRef.current.version)),
    doNotBuy: () => Promise.resolve(successfulAck(roomRef.current.version)),
    drawCard,
    dismissCard,
    sendChat: () => {},
    makeOffer: () => {},
    acceptOffer: () => {},
    declineOffer: () => {},
    sellHouse: () => {},
    payBail: () => Promise.resolve(successfulAck(roomRef.current.version)),
    useJailCard: () => Promise.resolve(successfulAck(roomRef.current.version)),
  } satisfies SocketFunctions), [dismissCard, drawCard]);

  useEffect(() => {
    controller.acceptRoomSnapshot(roomRef.current, 'SESSION_SYNC');
    const onMetrics = (event: Event) => {
      setRendererMetrics((event as CustomEvent<Record<string, unknown>>).detail);
    };
    window.addEventListener('own-the-block-renderer', onMetrics);
    return () => {
      clearTimers();
      window.removeEventListener('own-the-block-renderer', onMetrics);
    };
  }, [clearTimers, controller]);

  const contextValue = useMemo(() => ({
    state: room.gameState,
    socketFunctions,
    playerId: viewer.playerId,
    role: viewer.role,
    connected: true,
    canMutate: viewer.role === 'PLAYER',
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  }), [room, socketFunctions, viewer]);

  return (
    <PresentationProvider controller={controller}>
      <stateContext.Provider value={contextValue}>
        <CardInteractionProvider>
          <main className="phase4-uat" data-scenario={scenario}>
          <aside
            className={`phase4-uat__controls${controlsCollapsed ? ' phase4-uat__controls--collapsed' : ''}`}
            aria-label="Điều khiển UAT Phase 4"
          >
            <button
              type="button"
              aria-label={controlsCollapsed ? 'Mở điều khiển UAT' : 'Ẩn điều khiển UAT'}
              onClick={() => setControlsCollapsed(value => !value)}
            >{controlsCollapsed ? 'UAT' : 'Ẩn'}</button>
            {!controlsCollapsed ? <><strong>PHASE 4 UAT</strong>
            <select
              aria-label="Kịch bản"
              value={scenario}
              onChange={event => runScenario(event.target.value as ScenarioKey)}
            >
              {scenarios.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <button type="button" onClick={() => runScenario()}>Chạy lại</button>
            <button type="button" onClick={runNextScenario}>Kịch bản kế</button>
            <button type="button" onClick={() => controller.skipAllAndSnap()}>Bỏ qua trình bày</button>
            <label>
              Tốc độ
              <select
                aria-label="Tốc độ trình bày"
                value={settings.animationSpeed}
                onChange={event => updateSettings({ animationSpeed: Number(event.target.value) })}
              >
                {[0.75, 1, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={event => updateSettings({ reducedMotion: event.target.checked })}
              />
              Giảm chuyển động
            </label>
            <output aria-live="polite">
              v{room.version} · semantic {room.gameState.boardState.gameplayEvents.sequence}
              {room.gameState.turnInfo.pendingCardInteraction
                ? ` · ${room.gameState.turnInfo.pendingCardInteraction.stage}`
                : ''}
              {` · queue ${presentationState.status}`}
              {` · dice ${presentationState.diceRoll?.lifecycle ?? 'settled'}`}
              {` · card ${presentationState.cardPresentation?.stage ?? 'direct'}`}
              {` · preview ${presentationState.destinationPreview ? 'on' : 'off'}`}
              {` · trace ${traceRef.current.steps.join(' > ') || '—'}`}
              {traceRef.current.previewBeforeWalk ? ' · preview-before-walk yes' : ''}
              {traceRef.current.previewBeforeLand ? ' · preview-before-land yes' : ''}
            </output>
            {rendererMetrics ? (
              <output data-testid="renderer-metrics">
                {`draw ${String(rendererMetrics.drawCalls)} · tri ${String(rendererMetrics.triangles)} · active ${String(rendererMetrics.activeAnimatedObjects)}`}
              </output>
            ) : null}</> : null}
          </aside>
          <Board />
          </main>
          <CardInteractionOverlay />
        </CardInteractionProvider>
      </stateContext.Provider>
    </PresentationProvider>
  );
}

export default function Phase4UatHarness() {
  return (
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, masterVolume: 0 }}>
      <Phase4UatSurface />
    </SettingsProvider>
  );
}
