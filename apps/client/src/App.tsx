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
  GameState,
  JoinRoomRequest,
  OfferResult,
  PrivateOffer,
  PublicRoomState,
  RoomRole,
  SessionReplacedInfo,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import Board from './components/Board';
import ConnectionOverlay from './components/ConnectionOverlay';
import JoinForm from './components/JoinForm';
import Lobby from './components/Lobby';
import SpectatorBanner from './components/SpectatorBanner';
import { useToast } from './components/Toast';
import stateContext from './internal';
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

const initialState: GameState = {
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
    auction: null,
  },
  players: {},
  turnInfo: {},
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
      <h1>Monopoly</h1>
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
              ? 'Reload application'
              : failure.retryable ? 'Retry' : 'Return to join'}
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
  const [privateOffers, setPrivateOffers] = useState<PrivateOffer[]>([]);

  const transition = useCallback((next: AppPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setIdentity = useCallback((nextRole: RoomRole | null, nextPlayerId: string | null) => {
    roleRef.current = nextRole;
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
      setFailure({ message: error.message, retryable: false });
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
      setPrivateOffers([]);
      setIdentity(null, null);
    }

    setFailure({ message: error.message, retryable: error.retryable });
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
      setFailure({ message: 'The server did not confirm the session in time.', retryable: true });
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
      setPrivateOffers(response.data.pendingOffers.filter(offer => offer.status === 'PENDING'));
      applyRoom(response.data.room, true);
    });
  }, [applyRoom, failSession, setIdentity, transition]);

  const joinRoom = useCallback((request: JoinRoomRequest, reconnecting = false) => {
    if (!socket.connected) {
      setFailure({ message: 'Unable to reach the game server.', retryable: true });
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
      setFailure({ message: 'The server did not confirm the room admission in time.', retryable: true });
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
        setFailure({ message: response.error.message, retryable: response.error.retryable });
        transition(reconnecting ? 'ERROR' : 'JOIN');
        return;
      }

      if (response.data.kind === 'SPECTATOR') {
        tokenRef.current = null;
        spectatorRequestRef.current = request;
        setIdentity('SPECTATOR', null);
        setPrivateOffers([]);
        applyRoom(response.data.room, true);
        return;
      }

      if (!writePlayerSession(response.data.token)) {
        // The server now has a socket-scoped pending admission, but no durable
        // browser credential exists to activate it safely. Closing this transport
        // abandons that pending admission and lets a later retry start cleanly.
        setFailure({
          message: 'This browser could not store the reconnect session. Check site storage permissions and try again.',
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

    const handleOfferResult = (result: OfferResult) => {
      setPrivateOffers(current => current.filter(offer => offer.offerId !== result.offerId));
      const verb = result.status === 'ACCEPTED'
        ? 'was accepted'
        : result.status === 'DECLINED'
          ? 'was declined'
          : result.status === 'EXPIRED'
            ? 'expired'
            : 'was cancelled';
      toast.show(`Offer for ${result.tileName} at $${result.price}M ${verb}.`);
    };

    const onSessionReplaced = (info: SessionReplacedInfo) => {
      setFailure({ message: info.message, retryable: false });
      transition('REPLACED');
      socket.disconnect();
    };

    const onConnectError = (error: Error) => {
      const details = (error as Error & { data?: Partial<AckError> }).data;
      setConnected(false);
      setFailure({
        message: details?.message ?? error.message ?? 'Unable to connect to the game server.',
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
    if (!response.ok) toast.show(response.error.message);
  }, [toast]);

  const canMutate = connected
    && phase === 'GAME'
    && role === 'PLAYER'
    && room?.status === 'IN_PROGRESS'
    && room.players.some(player => player.playerId === playerId && player.membershipStatus === 'ACTIVE');

  const socketFunctions = useMemo<SocketFunctions>(() => {
    const gameCommandAllowed = () => {
      if (canMutate) return true;
      toast.show('Gameplay actions are unavailable while reconnecting or spectating.');
      return false;
    };
    const ack: AckCallback = showCommandFailure;

    return {
      rollDice: () => { if (gameCommandAllowed()) socket.emit('roll dice', ack); },
      buyProperty: () => { if (gameCommandAllowed()) socket.emit('buy property', ack); },
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
      buildHouse: (tileID) => {
        if (gameCommandAllowed()) socket.emit('build house', tileID, ack);
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
      declineProperty: () => { if (gameCommandAllowed()) socket.emit('decline property', ack); },
      placeBid: (amount) => { if (gameCommandAllowed()) socket.emit('place bid', amount, ack); },
      passBid: () => { if (gameCommandAllowed()) socket.emit('pass bid', ack); },
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
      if (!response.ok) setOperationError(response.error.message);
    });
  }, []);

  const handleStart = useCallback(() => {
    setOperation('start');
    setOperationError(null);
    socket.emit('start game', (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(response.error.message);
    });
  }, []);

  const handleLeave = useCallback(() => {
    const currentRoom = roomRef.current;
    if (roleRef.current === 'PLAYER'
      && currentRoom?.status === 'IN_PROGRESS'
      && !window.confirm('Leaving now forfeits this game and revokes this session. Continue?')) {
      return;
    }

    setOperation('leave');
    setOperationError(null);
    socket.emit('leave room', (response) => {
      setOperation(null);
      if (!response.ok) {
        setOperationError(response.error.message);
        return;
      }

      tokenRef.current = null;
      spectatorRequestRef.current = null;
      clearPlayerSession();
      roomRef.current = null;
      setRoom(null);
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
    privateOffers,
  }), [canMutate, connected, playerId, privateOffers, role, room, socketFunctions]);

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
              ? 'Forfeit game'
              : 'Leave room'}
          </button>
          {operationError ? <p className="room-exit-error" role="alert">{operationError}</p> : null}
          <Board />
        </>
      )
    : null;

  return (
    <stateContext.Provider value={contextValue}>
      <main className="App">
        {phase === 'RESTORING' ? <LoadingScreen message="Restoring your game…" /> : null}
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
          ? <FailureScreen title="Session opened elsewhere" failure={failure} />
          : null}
        {phase === 'ERROR' && failure
          ? <FailureScreen title="Unable to restore game" failure={failure} onRetry={retry} />
          : null}
      </main>
    </stateContext.Provider>
  );
}
