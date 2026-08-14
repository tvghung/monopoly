import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import type {
  AckError,
  AckCallback,
  JoinRoomRequest,
  OfferResult,
  PrivatePlayerState,
  PrivateOffer,
  PublicRoomState,
  PublicGameState,
  RoomRole,
  SessionReplacedInfo,
  ForcedSaleProposal,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import Board from './components/Board';
import ConnectionOverlay from './components/ConnectionOverlay';
import JoinForm from './components/JoinForm';
import Lobby from './components/Lobby';
import SpectatorBanner from './components/SpectatorBanner';
import { useToast } from './components/Toast';
import stateContext from './internal';
import { localizeAckError } from './presentation';
import {
  clearPlayerSession,
  readPlayerSession,
  writePlayerSession,
} from './playerSessionStorage';
import type { AppSocket, SocketFunctions } from './types';
import './App.css';

const socketUrl = typeof __SOCKET_URL__ !== 'undefined' ? __SOCKET_URL__ : '';
const socket: AppSocket = io(socketUrl || undefined, {
  autoConnect: false,
  auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
});

const initialState: PublicGameState = {
  boardState: {
    gameStarted: false,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    paymentShortfall: null,
  },
  players: {},
  turnInfo: {},
  deckCounts: { chance: 0, chest: 0 },
  loaded: false,
};

type AppPhase =
  | 'RESTORING'
  | 'JOIN'
  | 'JOINING'
  | 'LOBBY'
  | 'GAME'
  | 'RECONNECTING'
  | 'REPLACED'
  | 'ERROR';

interface AppFailure {
  message: string;
  retryable: boolean;
  reloadRequired?: boolean;
}

const terminalSessionCodes = new Set<AckError['code']>([
  'SESSION_INVALID',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'ROOM_GONE',
  'GAME_ALREADY_STARTED',
  'ROOM_FULL',
]);
const ACK_TIMEOUT_MS = 10_000;

function LoadingScreen({ message }: { message: string }) {
  return (
    <section className="app-status" role="status" aria-live="polite">
      <span className="connection-overlay__spinner" aria-hidden="true" />
      <h1>Cờ Tỷ Phú Việt Nam</h1>
      <p>{message}</p>
    </section>
  );
}

interface FailureScreenProps {
  title: string;
  failure: AppFailure;
  onRetry?: () => void;
}

function FailureScreen({ title, failure, onRetry }: FailureScreenProps) {
  return (
    <section className="app-status" role="alert">
      <h1>{title}</h1>
      <p>{failure.message}</p>
      {onRetry
        ? (
          <button
            type="button"
            onClick={failure.reloadRequired ? () => window.location.reload() : onRetry}
          >
            {failure.reloadRequired
              ? 'Tải lại trò chơi'
              : failure.retryable ? 'Thử lại' : 'Quay về màn hình vào phòng'}
          </button>
        )
        : null}
    </section>
  );
}

export default function App() {
  const toast = useToast();
  const [initialToken] = useState(readPlayerSession);
  const tokenRef = useRef<string | null>(initialToken);
  const spectatorRequestRef = useRef<JoinRoomRequest | null>(null);
  const phaseRef = useRef<AppPhase>(initialToken ? 'RESTORING' : 'JOIN');
  const roleRef = useRef<RoomRole | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const roomRef = useRef<PublicRoomState | null>(null);
  const admissionAttemptRef = useRef(0);

  const [phase, setPhase] = useState<AppPhase>(phaseRef.current);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [failure, setFailure] = useState<AppFailure | null>(null);
  const [operation, setOperation] = useState<'ready' | 'start' | 'leave' | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [privatePlayerState, setPrivatePlayerState] = useState<PrivatePlayerState | null>(null);
  const [privateOffers, setPrivateOffers] = useState<PrivateOffer[]>([]);

  const transition = useCallback((next: AppPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setIdentity = useCallback((nextRole: RoomRole | null, nextPlayerId: string | null) => {
    roleRef.current = nextRole;
    playerIdRef.current = nextPlayerId;
    setRole(nextRole);
    setPlayerId(nextPlayerId);
  }, []);

  const applyRoom = useCallback((incoming: PublicRoomState, advancePhase: boolean) => {
    const current = roomRef.current;
    if (current
      && current.roomId === incoming.roomId
      && current.version > incoming.version) {
      if (advancePhase && phaseRef.current !== 'REPLACED') {
        transition(roleRef.current === 'PLAYER' && current.status === 'LOBBY' ? 'LOBBY' : 'GAME');
      }
      return;
    }

    roomRef.current = incoming;
    setRoom(incoming);

    if (!advancePhase || phaseRef.current === 'REPLACED') return;
    transition(roleRef.current === 'PLAYER' && incoming.status === 'LOBBY' ? 'LOBBY' : 'GAME');
  }, [transition]);

  const failSession = useCallback((error: AckError) => {
    setOperation(null);
    setOperationError(null);

    if (error.code === 'SESSION_REPLACED') {
      setPrivatePlayerState(null);
      setFailure({ message: localizeAckError(error), retryable: false });
      transition('REPLACED');
      socket.disconnect();
      return;
    }

    if (terminalSessionCodes.has(error.code)) {
      tokenRef.current = null;
      spectatorRequestRef.current = null;
      clearPlayerSession();
      roomRef.current = null;
      setRoom(null);
      setPrivatePlayerState(null);
      setPrivateOffers([]);
      setIdentity(null, null);
    }

    setFailure({ message: localizeAckError(error), retryable: error.retryable });
    transition('ERROR');
  }, [setIdentity, transition]);

  const resumeSession = useCallback((token: string) => {
    if (!socket.connected) {
      transition(roomRef.current ? 'RECONNECTING' : 'RESTORING');
      socket.connect();
      return;
    }

    const attempt = admissionAttemptRef.current + 1;
    admissionAttemptRef.current = attempt;
    const timeout = window.setTimeout(() => {
      if (admissionAttemptRef.current !== attempt || tokenRef.current !== token) return;
      admissionAttemptRef.current += 1;
      setFailure({ message: 'Máy chủ chưa xác nhận phiên chơi kịp thời.', retryable: true });
      transition('ERROR');
    }, ACK_TIMEOUT_MS);

    socket.emit('resume session', { token }, (response) => {
      window.clearTimeout(timeout);
      if (admissionAttemptRef.current !== attempt
        || tokenRef.current !== token
        || phaseRef.current === 'REPLACED') return;
      if (!response.ok) {
        failSession(response.error);
        return;
      }

      setFailure(null);
      setOperationError(null);
      setIdentity(response.data.role, response.data.playerId);
      setPrivatePlayerState(
        response.data.privatePlayerState.playerId === response.data.playerId
          ? response.data.privatePlayerState
          : null,
      );
      setPrivateOffers(response.data.pendingOffers.filter(offer => offer.status === 'PENDING'));
      applyRoom(response.data.room, true);
    });
  }, [applyRoom, failSession, setIdentity, transition]);

  const joinRoom = useCallback((request: JoinRoomRequest, reconnecting = false) => {
    if (!socket.connected) {
      setFailure({ message: 'Không thể kết nối đến máy chủ trò chơi.', retryable: true });
      transition(reconnecting ? 'RECONNECTING' : 'ERROR');
      socket.connect();
      return;
    }

    setFailure(null);
    transition(reconnecting ? 'RECONNECTING' : 'JOINING');
    const attempt = admissionAttemptRef.current + 1;
    admissionAttemptRef.current = attempt;
    const timeout = window.setTimeout(() => {
      if (admissionAttemptRef.current !== attempt) return;
      admissionAttemptRef.current += 1;
      setFailure({ message: 'Máy chủ chưa xác nhận việc vào phòng kịp thời.', retryable: true });
      transition(reconnecting ? 'ERROR' : 'JOIN');
      // Phase-one admission may already exist on the server even though its
      // token ACK was lost. Reset the transport so a retry is not trapped by
      // that socket's one-pending-admission guard; the seat was not activated.
      socket.disconnect();
      socket.connect();
    }, ACK_TIMEOUT_MS);

    socket.emit('join room', request, (response) => {
      window.clearTimeout(timeout);
      if (admissionAttemptRef.current !== attempt || phaseRef.current === 'REPLACED') return;
      if (!response.ok) {
        setFailure({
          message: localizeAckError(response.error),
          retryable: response.error.retryable,
        });
        transition(reconnecting ? 'ERROR' : 'JOIN');
        return;
      }

      if (response.data.kind === 'SPECTATOR') {
        tokenRef.current = null;
        spectatorRequestRef.current = request;
        setIdentity('SPECTATOR', null);
        setPrivatePlayerState(null);
        setPrivateOffers([]);
        applyRoom(response.data.room, true);
        return;
      }

      if (!writePlayerSession(response.data.token)) {
        // The server now has a socket-scoped pending admission, but no durable
        // browser credential exists to activate it safely. Closing this transport
        // abandons that pending admission and lets a later retry start cleanly.
        setFailure({
          message: 'Trình duyệt không thể lưu phiên kết nối lại. Hãy kiểm tra quyền lưu trữ của trang rồi thử lại.',
          retryable: false,
        });
        transition('ERROR');
        socket.disconnect();
        return;
      }

      tokenRef.current = response.data.token;
      spectatorRequestRef.current = null;
      transition('RESTORING');
      resumeSession(response.data.token);
    });
  }, [applyRoom, resumeSession, setIdentity, transition]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setOperation(null);
      if (phaseRef.current === 'REPLACED') {
        socket.disconnect();
        return;
      }

      const token = tokenRef.current;
      if (token) {
        transition(roomRef.current ? 'RECONNECTING' : 'RESTORING');
        resumeSession(token);
        return;
      }

      const spectatorRequest = spectatorRequestRef.current;
      if (spectatorRequest && roomRef.current) {
        joinRoom(spectatorRequest, true);
        return;
      }

      setFailure(null);
      transition('JOIN');
    };

    const onDisconnect = () => {
      admissionAttemptRef.current += 1;
      setConnected(false);
      setOperation(null);
      if (phaseRef.current === 'REPLACED' || phaseRef.current === 'ERROR') return;

      if (roomRef.current || tokenRef.current) {
        transition('RECONNECTING');
      } else {
        transition('JOIN');
      }
    };

    const onUpdate = (incoming: PublicRoomState) => {
      const connecting = phaseRef.current === 'RESTORING'
        || phaseRef.current === 'JOINING'
        || phaseRef.current === 'RECONNECTING';
      applyRoom(incoming, !connecting && roleRef.current !== null);
    };

    const onOffer = (offer: PrivateOffer) => {
      if (offer.status !== 'PENDING') return;
      setPrivateOffers(current => [
        ...current.filter(item => item.offerId !== offer.offerId),
        offer,
      ]);
    };

    const onPrivatePlayerState = (incoming: PrivatePlayerState) => {
      if (roleRef.current !== 'PLAYER' || playerIdRef.current !== incoming.playerId) return;
      setPrivatePlayerState(incoming);
    };

    const onForcedSaleProposal = (proposal: ForcedSaleProposal | null) => {
      if (roleRef.current !== 'PLAYER' || !playerIdRef.current) return;
      setPrivatePlayerState(current => current
        ? { ...current, forcedSaleProposal: proposal }
        : current);
    };

    const handleOfferResult = (result: OfferResult) => {
      setPrivateOffers(current => current.filter(offer => offer.offerId !== result.offerId));
      const verb = result.status === 'ACCEPTED'
        ? 'đã được chấp nhận'
        : result.status === 'DECLINED'
          ? 'đã bị từ chối'
          : result.status === 'EXPIRED'
            ? 'đã hết hạn'
            : 'đã bị hủy';
      toast.show(`Đề nghị giao dịch giữa ${result.proposerName} và ${result.recipientName} ${verb}.`);
    };

    const onSessionReplaced = (info: SessionReplacedInfo) => {
      setPrivatePlayerState(null);
      setFailure({
        message: localizeAckError({ code: info.code, message: info.message }),
        retryable: false,
      });
      transition('REPLACED');
      socket.disconnect();
    };

    const onConnectError = (error: Error) => {
      const details = (error as Error & { data?: Partial<AckError> }).data;
      setConnected(false);
      setFailure({
        message: details?.code
          ? localizeAckError({ code: details.code, message: details.message ?? '' })
          : 'Không thể kết nối đến máy chủ trò chơi.',
        retryable: details?.retryable ?? true,
        reloadRequired: details?.code === 'UPGRADE_REQUIRED',
      });
      if (details?.code === 'UPGRADE_REQUIRED') {
        socket.io.reconnection(false);
        socket.disconnect();
        transition('ERROR');
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('update', onUpdate);
    socket.on('private player state', onPrivatePlayerState);
    socket.on('forced sale proposal', onForcedSaleProposal);
    socket.on('offer on prop', onOffer);
    socket.on('offer accepted', handleOfferResult);
    socket.on('offer declined', handleOfferResult);
    socket.on('offer expired', handleOfferResult);
    socket.on('offer cancelled', handleOfferResult);
    socket.on('session replaced', onSessionReplaced);
    socket.connect();

    return () => {
      admissionAttemptRef.current += 1;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('update', onUpdate);
      socket.off('private player state', onPrivatePlayerState);
      socket.off('forced sale proposal', onForcedSaleProposal);
      socket.off('offer on prop', onOffer);
      socket.off('offer accepted', handleOfferResult);
      socket.off('offer declined', handleOfferResult);
      socket.off('offer expired', handleOfferResult);
      socket.off('offer cancelled', handleOfferResult);
      socket.off('session replaced', onSessionReplaced);
      socket.disconnect();
    };
  }, [applyRoom, joinRoom, resumeSession, toast, transition]);

  const showCommandFailure = useCallback((response: { ok: true } | { ok: false; error: AckError }) => {
    if (!response.ok) toast.show(localizeAckError(response.error));
  }, [toast]);

  const canMutate = connected
    && phase === 'GAME'
    && role === 'PLAYER'
    && room?.status === 'IN_PROGRESS'
    && room.players.some(player => player.playerId === playerId && player.membershipStatus === 'ACTIVE');

  const socketFunctions = useMemo<SocketFunctions>(() => {
    const gameCommandAllowed = () => {
      if (canMutate) return true;
      toast.show('Không thể thao tác khi đang kết nối lại hoặc xem với vai trò khán giả.');
      return false;
    };
    const ack: AckCallback = showCommandFailure;

    return {
      rollDice: () => { if (gameCommandAllowed()) socket.emit('roll dice', ack); },
      buyProperty: (operationId) => {
        if (!gameCommandAllowed()) return;
        socket.emit('buy property', { operationId }, ack);
      },
      doNotBuy: (operationId) => {
        if (gameCommandAllowed()) socket.emit('do not buy', { operationId }, ack);
      },
      resolveDevelopment: (request) => {
        if (gameCommandAllowed()) socket.emit('resolve development', request, ack);
      },
      waitInJail: () => { if (gameCommandAllowed()) socket.emit('wait in jail', ack); },
      sendChat: (message) => {
        if (connected) socket.emit('send chat', message, ack);
      },
      putOpenMarket: (saleInfo) => {
        if (gameCommandAllowed()) socket.emit('put on open market', saleInfo, ack);
      },
      makeOffer: (offerInfo) => {
        if (!gameCommandAllowed()) return;
        socket.emit('make offer', offerInfo, response => showCommandFailure(response));
      },
      acceptOffer: (offerId) => {
        if (gameCommandAllowed()) socket.emit('accept offer', { offerId }, ack);
      },
      declineOffer: (offerId) => {
        if (gameCommandAllowed()) socket.emit('decline offer', { offerId }, ack);
      },
      makeSale: (tileID) => {
        if (gameCommandAllowed()) socket.emit('make sale', { tileID }, ack);
      },
      removeSale: (tileID) => {
        if (gameCommandAllowed()) socket.emit('remove sale', { tileID }, ack);
      },
      sellHouse: (tileID) => {
        if (gameCommandAllowed()) socket.emit('sell house', tileID, ack);
      },
      mortgageProperty: (tileID) => {
        if (gameCommandAllowed()) socket.emit('mortgage property', tileID, ack);
      },
      unmortgageProperty: (tileID) => {
        if (gameCommandAllowed()) socket.emit('unmortgage property', tileID, ack);
      },
      payBail: () => { if (gameCommandAllowed()) socket.emit('pay bail', ack); },
      useJailCard: () => { if (gameCommandAllowed()) socket.emit('use jail card', ack); },
      sellPropertyToBank: (request) => {
        if (gameCommandAllowed()) socket.emit('sell property to bank', request, ack);
      },
      proposeForcedSale: (request) => {
        if (gameCommandAllowed()) socket.emit('propose forced sale', request, response => showCommandFailure(response));
      },
      acceptForcedSale: (proposalId) => {
        if (gameCommandAllowed()) socket.emit('accept forced sale', { proposalId }, ack);
      },
      rejectForcedSale: (proposalId) => {
        if (gameCommandAllowed()) socket.emit('reject forced sale', { proposalId }, ack);
      },
    };
  }, [canMutate, connected, showCommandFailure, toast]);

  const handleJoin = useCallback((name: string, roomCode: string) => {
    joinRoom({ name, roomCode });
  }, [joinRoom]);

  const handleReady = useCallback((ready: boolean) => {
    setOperation('ready');
    setOperationError(null);
    socket.emit('set ready', { ready }, (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(localizeAckError(response.error));
    });
  }, []);

  const handleStart = useCallback(() => {
    setOperation('start');
    setOperationError(null);
    socket.emit('start game', (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(localizeAckError(response.error));
    });
  }, []);

  const handleLeave = useCallback(() => {
    const currentRoom = roomRef.current;
    if (roleRef.current === 'PLAYER'
      && currentRoom?.status === 'IN_PROGRESS'
      && !window.confirm('Rời phòng lúc này đồng nghĩa với bỏ cuộc và thu hồi phiên chơi. Bạn có chắc muốn tiếp tục?')) {
      return;
    }

    setOperation('leave');
    setOperationError(null);
    socket.emit('leave room', (response) => {
      setOperation(null);
      if (!response.ok) {
        setOperationError(localizeAckError(response.error));
        return;
      }

      tokenRef.current = null;
      spectatorRequestRef.current = null;
      clearPlayerSession();
      roomRef.current = null;
      setRoom(null);
      setPrivatePlayerState(null);
      setPrivateOffers([]);
      setIdentity(null, null);
      transition('JOIN');
    });
  }, [setIdentity, transition]);

  const retry = useCallback(() => {
    setFailure(null);
    const token = tokenRef.current;
    if (token) {
      transition(roomRef.current ? 'RECONNECTING' : 'RESTORING');
      if (socket.connected) resumeSession(token);
      else socket.connect();
      return;
    }

    transition('JOIN');
    if (!socket.connected) socket.connect();
  }, [resumeSession, transition]);

  const contextValue = useMemo(() => ({
    state: room?.gameState ?? initialState,
    socketFunctions,
    playerId,
    role,
    connected,
    canMutate,
    privatePlayerState,
    privateOffers,
  }), [canMutate, connected, playerId, privateOffers, privatePlayerState, role, room, socketFunctions]);

  const roomContent = room && role
    ? role === 'PLAYER' && room.status === 'LOBBY' && playerId
      ? (
        <Lobby
          roomCode={room.roomCode}
          players={room.players
            .filter(member => member.membershipStatus === 'ACTIVE')
            .map(member => ({
              id: member.playerId,
              name: member.name,
              color: member.color,
              ready: member.ready,
              connected: member.connected,
            }))}
          playerId={playerId}
          hostPlayerId={room.hostPlayerId}
          minPlayers={room.minPlayers}
          maxPlayers={room.maxPlayers}
          busy={operation !== null}
          error={operationError}
          onSetReady={handleReady}
          onStart={handleStart}
          onLeave={handleLeave}
        />
      )
      : (
        <>
          {role === 'SPECTATOR' ? <SpectatorBanner /> : null}
          <button
            type="button"
            className="room-exit-button"
            disabled={operation !== null}
            onClick={handleLeave}
          >
            {role === 'PLAYER' && room.status === 'IN_PROGRESS'
              ? 'Bỏ cuộc'
              : 'Rời phòng'}
          </button>
          {operationError ? <p className="room-exit-error" role="alert">{operationError}</p> : null}
          <Board />
        </>
      )
    : null;

  return (
    <stateContext.Provider value={contextValue}>
      <main className="App">
        {phase === 'RESTORING' ? <LoadingScreen message="Đang khôi phục ván chơi…" /> : null}
        {phase === 'JOIN' || phase === 'JOINING'
          ? (
            <JoinForm
              onJoin={handleJoin}
              busy={phase === 'JOINING'}
              connected={connected}
              error={failure?.message ?? null}
            />
          )
          : null}
        {phase === 'LOBBY' || phase === 'GAME' || phase === 'RECONNECTING' ? roomContent : null}
        {phase === 'RECONNECTING' ? <ConnectionOverlay /> : null}
        {phase === 'REPLACED' && failure
          ? <FailureScreen title="Phiên chơi đã được mở ở nơi khác" failure={failure} />
          : null}
        {phase === 'ERROR' && failure
          ? <FailureScreen title="Không thể khôi phục ván chơi" failure={failure} onRetry={retry} />
          : null}
      </main>
    </stateContext.Provider>
  );
}
