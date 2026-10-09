import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AckError,
  Ack,
  AckCallback,
  AddBotResult,
  JoinRoomRequest,
  OfferResult,
  PrivatePlayerState,
  PrivateOffer,
  PublicRoomState,
  PublicGameState,
  RoomRole,
  SessionReplacedInfo,
  ForcedSaleProposal,
  GameMode,
  PlayerColorId,
  SetAppearanceRequest,
  TeamId,
  TeamSlot,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { Flag, X as XIcon } from 'lucide-react';
import ErrorScreen from './app/screens/ErrorScreen';
import LoadingScreen from './app/screens/LoadingScreen';
import Board from './components/Board';
import ConnectionOverlay, { type RelinkOutcome } from './components/ConnectionOverlay';
import { verifyHostContinuity } from './runtime/hostContinuity';
import ForfeitChoiceDialog from './components/ForfeitChoiceDialog';
import JoinForm from './components/JoinForm';
import Lobby from './components/Lobby';
import SpectatorBanner from './components/SpectatorBanner';
import { useToast } from './components/Toast';
import IconButton from './design-system/components/IconButton/IconButton';
import { ActionIcon as RegistryIcon } from './design-system/icons/ActionIcon';
import ConfirmationDialog from './design-system/components/ConfirmationDialog/ConfirmationDialog';
import SettingsPanel from './settings/SettingsPanel';
import FpsBadge from './game/ui/FpsBadge';
import HowToPlayButton from './howToPlay/HowToPlayButton';
import { getDesktopBridge } from './runtime/desktopBridge';
import stateContext from './internal';
import { roomExitContext, type RoomExitContextValue } from './roomExitContext';
import { getTileName, localizeAckError } from './presentation';
import { createSocket } from './network/createSocket';
import { PresentationController, type SnapshotSource } from './game/presentation/PresentationController';
import { PresentationProvider } from './game/presentation/PresentationProvider';
import CardInteractionOverlay from './game/ui/events/CardInteractionOverlay';
import {
  clearPlayerSession,
  getSessionAuthority,
  readPlayerSession,
  readPlayerSessionForRoom,
  writePlayerSessionForRoom,
} from './playerSessionStorage';
import type { AppSocket, SocketFunctions } from './types';
import { requestRollDiceAck } from './rollDiceRequest';
import { getDefaultWebRuntimeConfig } from './runtime/runtimeConfig';
import type { DesktopLaunchSelection, RuntimeConfig } from './runtime/types';
import { roomCodeFromLocation } from './runtime/lanSharing';
import { useAudio } from './audio/useAudio';
import { useTranslation } from './i18n/I18n';
import { translate, type MessageValues } from './i18n/I18n';
import type { MessageKey } from './i18n/catalog';
import './App.css';

const initialState: PublicGameState = {
  boardState: {
    gameStarted: false,
    gameStartedAt: null,
    gameMode: 'SOLO',
    winningTeamId: null,
    teams: [],
    teamPlay: { revivedPlayerIds: [], reviveWindows: [] },
    seatSwapRequests: [],
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    rollSequence: 0,
    gameplayEvents: { sequence: 0, events: [] },
    activityFeed: { sequence: 0, events: [] },
    ownedProps: {},
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
  /** Replaces the failure screen's default heading; a failure that is not about restoring the game says what happened. */
  title?: string;
  message?: string;
  messageKey?: MessageKey;
  messageValues?: MessageValues;
  error?: Pick<AckError, 'code' | 'message'>;
  retryable: boolean;
  reloadRequired?: boolean;
  returnToLauncher?: boolean;
}

type ConfirmationState = 'LEAVE' | { kind: 'QUIT'; requestId: string };

const terminalSessionCodes = new Set<AckError['code']>([
  'SESSION_INVALID',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'ROOM_GONE',
  'GAME_ALREADY_STARTED',
  'ROOM_FULL',
]);
const ACK_TIMEOUT_MS = 10_000;
interface FailureScreenProps {
  title: string;
  failure: AppFailure;
  onRetry?: () => void;
  /** Desktop only: leaves for the start screen ("Chơi qua mạng LAN"). Given on every desktop failure, so none is a dead end. */
  onBack?: () => void;
}

function FailureScreen({
  title, failure, onRetry, onBack,
}: FailureScreenProps) {
  const { language, t } = useTranslation();
  const message = failure.error
    ? localizeAckError(failure.error, language)
    : failure.messageKey
      ? t(failure.messageKey, failure.messageValues)
      : failure.message ?? '';
  const returnsToLauncher = !failure.reloadRequired && failure.returnToLauncher;
  const mainAction = onRetry
    ? {
      label: failure.reloadRequired
        ? t('app.reload')
        : failure.returnToLauncher
          ? t('app.home')
          : failure.retryable ? t('app.retry') : t('app.returnJoin'),
      icon: <RegistryIcon name={returnsToLauncher ? 'home' : 'retry'} />,
      onClick: failure.reloadRequired ? () => window.location.reload() : onRetry,
    }
    : undefined;
  const homeAction = onBack ? { label: t('app.home'), icon: <RegistryIcon name="home" />, onClick: onBack } : undefined;
  return (
    <ErrorScreen
      as="section"
      title={title}
      message={message}
      // The way home is the main action when there is no other, and a second, quieter one beside a retry. When the main action
      // already goes home, nothing is added.
      action={mainAction ?? homeAction}
      secondaryAction={mainAction && !returnsToLauncher ? homeAction : undefined}
    />
  );
}

interface AppProps {
  socket?: AppSocket;
  runtimeConfig?: RuntimeConfig;
  launch?: DesktopLaunchSelection;
  onExitToLauncher?: () => void;
  /**
   * The Host of this room answers at a new address (its tunnel was replaced). The token has already been stored for that
   * address; the shell reconnects there and the player resumes their own seat.
   */
  onSwitchEndpoint?: (endpoint: string, roomCode: string) => void;
}

/** How long a reconnection may fail before the overlay offers to use the Host's new link. */
export const RECONNECT_STALL_MS = 20_000;

export default function App({
  socket: injectedSocket,
  runtimeConfig,
  launch,
  onExitToLauncher,
  onSwitchEndpoint,
}: AppProps = {}) {
  const { language, t } = useTranslation();
  const languageRef = useRef(language);
  languageRef.current = language;
  const tx = useCallback((key: MessageKey, values?: MessageValues) => translate(key, languageRef.current, values), []);
  const toast = useToast();
  const audio = useAudio();
  const socket = useMemo(
    () => injectedSocket ?? createSocket(runtimeConfig ?? getDefaultWebRuntimeConfig()),
    [injectedSocket, runtimeConfig],
  );
  const [presentationController] = useState(() => new PresentationController(false, 1, audio));
  const sessionAuthority = getSessionAuthority(runtimeConfig?.socketUrl);
  const [initialToken] = useState(() => launch?.targetRoomCode !== undefined
    ? readPlayerSessionForRoom(sessionAuthority, launch.targetRoomCode)
    : readPlayerSession(sessionAuthority));
  const [initialRoomCode] = useState(() => roomCodeFromLocation());
  const tokenRef = useRef<string | null>(initialToken);
  // The continuity key of the Host process this seat was resumed on (resume ACK); a new address must sign with it.
  const hostContinuityKeyRef = useRef<string | null>(null);
  const initialJoinRef = useRef(launch?.initialJoin ?? null);
  // The Host's room-creation capability outlives a failed first admission (timeout, throttling): without it a retry
  // would be a Guest request for a room that does not exist yet. It is dropped once the admission is accepted.
  const hostCapabilityRef = useRef<{ roomCode: string; capability: string } | null>(
    launch?.initialJoin?.hostCapability
      ? { roomCode: launch.initialJoin.roomCode, capability: launch.initialJoin.hostCapability }
      : null,
  );
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
  const [operation, setOperation] = useState<'ready' | 'appearance' | 'team' | 'start' | 'leave' | null>(null);
  const [operationError, setOperationError] = useState<AckError | null>(null);
  const [privatePlayerState, setPrivatePlayerState] = useState<PrivatePlayerState | null>(null);
  const [privateOffers, setPrivateOffers] = useState<PrivateOffer[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The "Xem tiếp / Rời phòng" choice a player gets right after giving up. */
  const [forfeitChoiceOpen, setForfeitChoiceOpen] = useState(false);
  const desktopBridge = getDesktopBridge();
  // A reconnection that keeps failing may mean the Host's link changed: after a while the overlay offers to use a new link.
  const [reconnectStalled, setReconnectStalled] = useState(false);

  useEffect(() => {
    if (phase !== 'RECONNECTING') {
      setReconnectStalled(false);
      return undefined;
    }
    const timer = setTimeout(() => setReconnectStalled(true), RECONNECT_STALL_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /**
   * Moves this player's token to the Host's new address (in this device's storage only) and reconnects there, but only once
   * that address signs a fresh challenge with the pinned continuity key of the Host process (`runtime/hostContinuity.ts`):
   * another Host using the same room code, a replayed or relayed answer, or a restarted Host never receives the token.
   */
  const switchEndpoint = useCallback(async (endpoint: string, roomCode: string): Promise<RelinkOutcome> => {
    const token = tokenRef.current;
    const pinnedKey = hostContinuityKeyRef.current;
    const target = getSessionAuthority(endpoint);
    if (!token || !onSwitchEndpoint || !target || target === sessionAuthority || !pinnedKey) return 'NOT_SAME_HOST';
    const outcome = await verifyHostContinuity(endpoint, roomCode, pinnedKey);
    if (outcome !== 'SAME_HOST') return outcome;
    // The seat may have changed while the check ran (a new resume, leave): only the token checked for is moved.
    if (tokenRef.current !== token || hostContinuityKeyRef.current !== pinnedKey) return 'NOT_SAME_HOST';
    if (!writePlayerSessionForRoom(token, target, roomCode)) return 'NOT_SAME_HOST';
    onSwitchEndpoint(endpoint, roomCode);
    return 'OK';
  }, [onSwitchEndpoint, sessionAuthority]);

  // The desktop app can ask the room registry where the Host is now; a browser relies on the pasted link.
  useEffect(() => {
    const roomCode = roomRef.current?.roomCode;
    if (!reconnectStalled || !roomCode || !desktopBridge?.online) return undefined;
    let active = true;
    void desktopBridge.online.findRoom(roomCode).then(result => {
      // The registry is only a hint: the address it names still has to prove continuity before the token moves.
      if (active && result.ok) void switchEndpoint(result.endpoint, roomCode);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [desktopBridge, reconnectStalled, switchEndpoint]);

  useEffect(() => {
    audio.setGameActive?.(room?.status === 'IN_PROGRESS');
  }, [audio, room?.status]);

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

  const applyRoom = useCallback((
    incoming: PublicRoomState,
    advancePhase: boolean,
    source: SnapshotSource = 'LIVE_UPDATE',
  ) => {
    const current = roomRef.current;
    if (current
      && current.roomId === incoming.roomId
      && current.version >= incoming.version) {
      if (advancePhase && phaseRef.current !== 'REPLACED') {
        transition(roleRef.current === 'PLAYER' && current.status === 'LOBBY' ? 'LOBBY' : 'GAME');
      }
      return;
    }

    const replaySync = current?.roomId === incoming.roomId
      && current.status === 'FINISHED'
      && incoming.status === 'LOBBY';
    if (replaySync) {
      setPrivatePlayerState(null);
      setPrivateOffers([]);
    }

    roomRef.current = incoming;
    setRoom(incoming);
    presentationController.acceptRoomSnapshot(incoming, replaySync ? 'REPLAY_SYNC' : source);

    if (!advancePhase || phaseRef.current === 'REPLACED') return;
    transition(roleRef.current === 'PLAYER' && incoming.status === 'LOBBY' ? 'LOBBY' : 'GAME');
  }, [presentationController, transition]);

  /** The session is over for good (revoked, expired, left, removed): forget the token, the room and the player so nothing resumes it. */
  const forgetSession = useCallback(() => {
    tokenRef.current = null;
    spectatorRequestRef.current = null;
    clearPlayerSession(sessionAuthority);
    roomRef.current = null;
    setRoom(null);
    setPrivatePlayerState(null);
    setPrivateOffers([]);
    setIdentity(null, null);
    setForfeitChoiceOpen(false);
  }, [sessionAuthority, setIdentity]);

  const failSession = useCallback((error: AckError) => {
    setOperation(null);
    setOperationError(null);

    if (error.code === 'SESSION_REPLACED') {
      setPrivatePlayerState(null);
      setFailure({ error, retryable: false });
      transition('REPLACED');
      socket.disconnect();
      return;
    }

    const returnToLauncher = terminalSessionCodes.has(error.code)
      && Boolean(desktopBridge && tokenRef.current);
    if (terminalSessionCodes.has(error.code)) forgetSession();

    setFailure({
      error,
      retryable: error.retryable,
      returnToLauncher,
    });
    transition('ERROR');
  }, [desktopBridge, forgetSession, socket, transition]);

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
      setFailure({ messageKey: 'app.resumeTimeout', retryable: true });
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
      hostContinuityKeyRef.current = response.data.hostContinuityKey ?? null;
      setIdentity(response.data.role, response.data.playerId);
      setPrivatePlayerState(
        response.data.privatePlayerState.playerId === response.data.playerId
          ? response.data.privatePlayerState
          : null,
      );
      presentationController.acceptPrivatePlayerState(
        response.data.privatePlayerState,
        response.data.room,
        'SESSION_SYNC',
      );
      setPrivateOffers(response.data.pendingOffers.filter(offer => offer.status === 'PENDING'));
      writePlayerSessionForRoom(token, sessionAuthority, response.data.room.roomCode);
      applyRoom(response.data.room, true, 'SESSION_SYNC');
    });
  }, [applyRoom, failSession, presentationController, sessionAuthority, setIdentity, socket, transition]);

  const joinRoom = useCallback((request: JoinRoomRequest, reconnecting = false) => {
    if (!socket.connected) {
      setFailure({ messageKey: 'app.connectionFailed', retryable: true });
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
      setFailure({ messageKey: 'app.joinTimeout', retryable: true });
      transition(reconnecting ? 'ERROR' : 'JOIN');
      // Phase-one admission may already exist on the server even though its
      // token ACK was lost. Reset the transport so a retry is not trapped by
      // that socket's one-pending-admission guard; the seat was not activated.
      socket.disconnect();
      socket.connect();
    }, ACK_TIMEOUT_MS);

    const pendingCapability = hostCapabilityRef.current;
    const outgoing: JoinRoomRequest = pendingCapability && pendingCapability.roomCode === request.roomCode && !request.hostCapability
      ? { ...request, hostCapability: pendingCapability.capability }
      : request;
    socket.emit('join room', outgoing, (response) => {
      window.clearTimeout(timeout);
      if (admissionAttemptRef.current !== attempt || phaseRef.current === 'REPLACED') return;
      if (!response.ok) {
        setFailure({
          error: response.error,
          retryable: response.error.retryable,
        });
        transition(reconnecting ? 'ERROR' : 'JOIN');
        return;
      }

      hostCapabilityRef.current = null;
      if (response.data.kind === 'SPECTATOR') {
        tokenRef.current = null;
        spectatorRequestRef.current = request;
        setIdentity('SPECTATOR', null);
        setPrivatePlayerState(null);
        setPrivateOffers([]);
         applyRoom(response.data.room, true, 'SPECTATOR_SYNC');
        return;
      }

      if (!writePlayerSessionForRoom(response.data.token, sessionAuthority, request.roomCode)) {
        // The server now has a socket-scoped pending admission, but no durable
        // browser credential exists to activate it safely. Closing this transport
        // abandons that pending admission and lets a later retry start cleanly.
        setFailure({
          messageKey: 'app.sessionStorageFailed',
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
  }, [applyRoom, resumeSession, sessionAuthority, setIdentity, socket, transition]);

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
        initialJoinRef.current = null;
        transition(roomRef.current ? 'RECONNECTING' : 'RESTORING');
        resumeSession(token);
        return;
      }

      const initialJoin = initialJoinRef.current;
      if (initialJoin) {
        initialJoinRef.current = null;
        joinRoom(initialJoin);
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
      const replaySync = roomRef.current?.status === 'FINISHED' && incoming.status === 'LOBBY';
      applyRoom(
        incoming,
        !connecting && roleRef.current !== null,
        connecting ? 'SESSION_SYNC' : replaySync ? 'REPLAY_SYNC' : 'LIVE_UPDATE',
      );
    };

    const onOffer = (offer: PrivateOffer) => {
      if (offer.status !== 'PENDING') return;
      setPrivateOffers(current => [
        ...current.filter(item => item.offerId !== offer.offerId),
        offer,
      ]);
      // A player in debt answers offers inside the debt dialog, which covers the screen: say that one has arrived.
      const shortfall = roomRef.current?.gameState.boardState.paymentShortfall;
      if (shortfall?.debtorPlayerId === playerIdRef.current && offer.recipientPlayerId === playerIdRef.current) {
        toast.show(tx('app.offerReceived', {
          properties: offer.requested.propertyIds.map(id => getTileName(id, languageRef.current)).join(', '),
          playerName: offer.proposerName,
        }));
      }
    };

    const onPrivatePlayerState = (incoming: PrivatePlayerState) => {
      if (roleRef.current !== 'PLAYER' || playerIdRef.current !== incoming.playerId) return;
      setPrivatePlayerState(incoming);
      const currentRoom = roomRef.current;
      if (currentRoom) presentationController.acceptPrivatePlayerState(incoming, currentRoom, 'LIVE_UPDATE');
    };

    const onForcedSaleProposal = (proposal: ForcedSaleProposal | null) => {
      if (roleRef.current !== 'PLAYER' || !playerIdRef.current) return;
      setPrivatePlayerState(current => current
        ? { ...current, forcedSaleProposal: proposal }
        : current);
    };

    const handleOfferResult = (result: OfferResult) => {
      setPrivateOffers(current => current.filter(offer => offer.offerId !== result.offerId));
      const resultKey = result.status === 'ACCEPTED' ? 'app.offer.ACCEPTED'
        : result.status === 'DECLINED' ? 'app.offer.DECLINED'
          : result.status === 'EXPIRED' ? 'app.offer.EXPIRED' : 'app.offer.CANCELLED';
      toast.show(tx(resultKey, { proposerName: result.proposerName, recipientName: result.recipientName }));
    };

    const onSessionReplaced = (info: SessionReplacedInfo) => {
      setPrivatePlayerState(null);
      setFailure({
        error: { code: info.code, message: info.message },
        retryable: false,
      });
      transition('REPLACED');
      socket.disconnect();
    };

    // The host removed this player from the lobby: their session is revoked on the server, so this is a terminal end like an
    // invalid token. Stop resuming, forget the room and show the failure screen; the way back is the join form (or the launcher).
    const onRemovedFromRoom = () => {
      if (phaseRef.current === 'REPLACED') return;
      admissionAttemptRef.current += 1;
      const returnToLauncher = Boolean(desktopBridge && tokenRef.current);
      setOperation(null);
      setOperationError(null);
      forgetSession();
      setFailure({
        title: tx('app.removedTitle'),
        messageKey: 'app.removedMessage',
        retryable: false,
        returnToLauncher,
      });
      transition('ERROR');
    };

    const onConnectError = (error: Error) => {
      const details = (error as Error & { data?: Partial<AckError> }).data;
      setConnected(false);
      setFailure({
        ...(details?.code
          ? { error: { code: details.code, message: details.message ?? '' } }
          : { messageKey: 'app.offlineJoinFailed' as const }),
        retryable: details?.retryable ?? true,
        reloadRequired: details?.code === 'UPGRADE_REQUIRED',
        returnToLauncher: Boolean(desktopBridge && launch),
      });
      if (details?.code === 'UPGRADE_REQUIRED' || desktopBridge && launch) {
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
    socket.on('removed from room', onRemovedFromRoom);
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
      socket.off('removed from room', onRemovedFromRoom);
      socket.disconnect();
    };
  }, [applyRoom, desktopBridge, forgetSession, joinRoom, launch, presentationController, resumeSession, socket, toast, transition, tx]);

  useEffect(() => {
    const reconnect = () => {
      if (phaseRef.current !== 'REPLACED' && !socket.connected) socket.connect();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconnect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', reconnect);
    window.addEventListener('online', reconnect);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', reconnect);
      window.removeEventListener('online', reconnect);
    };
  }, [socket]);

  const showCommandFailure = useCallback((response: { ok: true } | { ok: false; error: AckError }) => {
    if (!response.ok) toast.show(localizeAckError(response.error, languageRef.current));
  }, [toast]);

  const canMutate = connected
    && phase === 'GAME'
    && role === 'PLAYER'
    && room?.status === 'IN_PROGRESS'
    && room.players.some(player => player.playerId === playerId && player.membershipStatus === 'ACTIVE');

  const canPlayAgain = connected
    && phase === 'GAME'
    && role === 'PLAYER'
    && room?.status === 'FINISHED'
    && room.hostPlayerId === playerId
    && room.players.some(player => player.playerId === playerId && player.membershipStatus !== 'LEFT');

  const socketFunctions = useMemo<SocketFunctions>(() => {
    const gameCommandAllowed = (showFailure = true) => {
      if (canMutate) return true;
      if (showFailure) {
        toast.show(tx('app.cannotAct'));
      }
      return false;
    };
    const ack: AckCallback = showCommandFailure;
    const unavailableAck = (): Ack => ({
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: {
        code: 'FORBIDDEN',
        message: 'Gameplay action is not available.',
        retryable: false,
      },
    });
    const sendAck = <T = void>(send: (callback: AckCallback<T>) => void): Promise<Ack<T>> => new Promise(resolve => {
      send(response => {
        resolve(response);
      });
    });

    return {
      rollDice: () => {
        if (!gameCommandAllowed(false)) {
          return Promise.resolve({
            ok: false,
            protocolVersion: SOCKET_PROTOCOL_VERSION,
            error: {
              code: 'FORBIDDEN',
              message: 'Gameplay action is not available.',
              retryable: false,
            },
          } satisfies Ack);
        }
        return requestRollDiceAck(socket);
      },
      buyProperty: (operationId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('buy property', { operationId }, callback));
      },
      doNotBuy: (operationId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('do not buy', { operationId }, callback));
      },
      resolveDevelopment: (request) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('resolve development', request, callback));
      },
      dismissCard: (operationId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('dismiss card', { operationId }, callback));
      },
      waitInJail: () => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('wait in jail', callback));
      },
      sendChat: (message) => {
        if (connected) socket.emit('send chat', message, ack);
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
      sellHouse: (tileID) => {
        if (gameCommandAllowed()) socket.emit('sell house', tileID, ack);
      },
      payBail: () => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('pay bail', callback));
      },
      useJailCard: () => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('use jail card', callback));
      },
      sellPropertyToBank: (request) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('sell property to bank', request, callback));
      },
      proposeForcedSale: (request) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck<{ proposalId: string; expiresAt: string }>(
          callback => socket.emit('propose forced sale', request, callback),
        ) as Promise<Ack>;
      },
      acceptForcedSale: (proposalId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('accept forced sale', { proposalId }, callback));
      },
      rejectForcedSale: (proposalId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('reject forced sale', { proposalId }, callback));
      },
      playAgain: () => {
        if (!canPlayAgain) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('play again', callback));
      },
      reviveTeammate: () => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('revive teammate', callback));
      },
      acceptRescue: (rescueId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('accept rescue', { rescueId }, callback));
      },
      declineRescue: (rescueId) => {
        if (!gameCommandAllowed(false)) return Promise.resolve(unavailableAck());
        return sendAck(callback => socket.emit('decline rescue', { rescueId }, callback));
      },
    };
  }, [canMutate, canPlayAgain, connected, showCommandFailure, socket, toast, tx]);

  const handleJoin = useCallback((name: string, roomCode: string) => {
    joinRoom({ name, roomCode });
  }, [joinRoom]);

  const handleReady = useCallback((ready: boolean) => {
    setOperation('ready');
    setOperationError(null);
    socket.emit('set ready', { ready }, (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(response.error);
    });
  }, [socket]);

  const handleAppearance = useCallback((request: SetAppearanceRequest) => {
    setOperation('appearance');
    setOperationError(null);
    socket.emit('set appearance', request, (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(response.error);
    });
  }, [socket]);

  /** The lobby's room commands (mode, team, seats, removing a player) share one busy state and one error line, like ready and appearance. */
  const runTeamCommand = useCallback(<T = void,>(send: (done: (response: Ack<T>) => void) => void) => {
    setOperation('team');
    setOperationError(null);
    send((response) => {
      setOperation(null);
      if (!response.ok) setOperationError(response.error);
    });
  }, []);

  const handleSetGameMode = useCallback((mode: GameMode) => {
    runTeamCommand(done => socket.emit('set game mode', { mode }, done));
  }, [runTeamCommand, socket]);

  // The team is never sent: the server renames the sender's own team, so nobody can rename the other one.
  const handleSetTeamName = useCallback((name: string) => {
    runTeamCommand(done => socket.emit('set team name', { name }, done));
  }, [runTeamCommand, socket]);

  const handleSetTeamColor = useCallback((color: PlayerColorId) => {
    runTeamCommand(done => socket.emit('set team color', { color }, done));
  }, [runTeamCommand, socket]);

  const handleKickPlayer = useCallback((targetPlayerId: string) => {
    runTeamCommand(done => socket.emit('kick player', { playerId: targetPlayerId }, done));
  }, [runTeamCommand, socket]);

  // A fresh request id per click: a retry of the same emit (replayed after a reconnect) cannot add a second bot.
  const handleAddBot = useCallback((seat?: { teamId: TeamId; teamSlot: TeamSlot }) => {
    const requestId = crypto.randomUUID();
    runTeamCommand<AddBotResult>(done => socket.emit('add bot', seat ? { requestId, seat } : { requestId }, done));
  }, [runTeamCommand, socket]);

  const handleRemoveBot = useCallback((targetPlayerId: string) => {
    runTeamCommand(done => socket.emit('remove bot', { playerId: targetPlayerId }, done));
  }, [runTeamCommand, socket]);

  const handleMoveToSeat = useCallback((teamId: TeamId, teamSlot: TeamSlot) => {
    runTeamCommand(done => socket.emit('move to seat', { teamId, teamSlot }, done));
  }, [runTeamCommand, socket]);

  const handleRequestSeatSwap = useCallback((targetPlayerId: string) => {
    runTeamCommand(done => socket.emit('request seat swap', { targetPlayerId }, done));
  }, [runTeamCommand, socket]);

  const handleCancelSeatSwap = useCallback(() => {
    runTeamCommand(done => socket.emit('cancel seat swap', done));
  }, [runTeamCommand, socket]);

  const handleRespondSeatSwap = useCallback((requesterPlayerId: string, accept: boolean) => {
    runTeamCommand(done => socket.emit('respond seat swap', { requesterPlayerId, accept }, done));
  }, [runTeamCommand, socket]);

  const handleStart = useCallback(() => {
    setOperation('start');
    setOperationError(null);
    socket.emit('start game', (response) => {
      setOperation(null);
      if (!response.ok) setOperationError(response.error);
    });
  }, [socket]);

  /** The end of every leave: forget the room and go back to where the app starts (the launcher on desktop, the join form on the web). */
  const exitToStart = useCallback(() => {
    forgetSession();

    if (desktopBridge) {
      socket.disconnect();
      onExitToLauncher?.();
      if (!onExitToLauncher) transition('JOIN');
      return;
    }

    transition('JOIN');
  }, [desktopBridge, forgetSession, onExitToLauncher, socket, transition]);

  const leaveRoom = useCallback(() => {
    setOperation('leave');
    setOperationError(null);
    socket.emit('leave room', (response) => {
      setOperation(null);
      if (!response.ok) {
        setOperationError(response.error);
        return;
      }
      exitToStart();
    });
  }, [exitToStart, socket]);

  /**
   * "Bỏ cuộc": the server returns the player's assets to the Bank and revokes their session, then the same socket asks to
   * watch the room as a spectator, and a dialog offers "Xem tiếp" or "Rời phòng". Nothing changes on the server: a socket
   * that has left may join the room again, and a join after the start is a spectator.
   */
  const forfeitAndWatch = useCallback(() => {
    const currentRoom = roomRef.current;
    const self = currentRoom?.players.find(member => member.playerId === playerIdRef.current);
    if (!currentRoom || !self) {
      leaveRoom();
      return;
    }
    const request: JoinRoomRequest = { name: self.name, roomCode: currentRoom.roomCode };
    setOperation('leave');
    setOperationError(null);
    socket.emit('leave room', (left) => {
      if (!left.ok) {
        setOperation(null);
        setOperationError(left.error);
        return;
      }
      // The seat and the session are gone. The board stays on screen; a dropped connection from here on re-joins as a
      // spectator too, because the connect handler reads spectatorRequestRef.
      tokenRef.current = null;
      clearPlayerSession(sessionAuthority);
      spectatorRequestRef.current = request;
      setPrivatePlayerState(null);
      setPrivateOffers([]);
      setIdentity('SPECTATOR', null);

      let settled = false;
      const giveUp = () => {
        if (settled) return;
        settled = true;
        setOperation(null);
        exitToStart();
        toast.show(tx('app.forfeitLeft'));
      };
      const timeout = window.setTimeout(giveUp, ACK_TIMEOUT_MS);
      socket.emit('join room', request, (joined) => {
        window.clearTimeout(timeout);
        if (settled) return;
        settled = true;
        setOperation(null);
        if (joined.ok && joined.data.kind === 'SPECTATOR') {
          applyRoom(joined.data.room, true, 'SPECTATOR_SYNC');
          setForfeitChoiceOpen(true);
          return;
        }
        // The room cannot be watched any more (it is gone, or the answer was unexpected): leave for good.
        exitToStart();
        toast.show(tx('app.forfeitLeft'));
      });
    });
  }, [applyRoom, exitToStart, leaveRoom, sessionAuthority, setIdentity, socket, toast, tx]);

  const handleLeave = useCallback(() => {
    const currentRoom = roomRef.current;
    if (roleRef.current === 'PLAYER' && currentRoom?.status === 'IN_PROGRESS') {
      setConfirmation('LEAVE');
      return;
    }
    leaveRoom();
  }, [leaveRoom]);

  useEffect(() => {
    if (!desktopBridge) return undefined;
    return desktopBridge.quit.onQuitRequested(requestId => {
      const activeGame = roleRef.current === 'PLAYER'
        && roomRef.current?.status === 'IN_PROGRESS';
      if (activeGame) {
        setConfirmation({ kind: 'QUIT', requestId });
      } else {
        desktopBridge.quit.respond(requestId, true);
      }
    });
  }, [desktopBridge]);

  const cancelConfirmation = useCallback(() => {
    if (confirmation && confirmation !== 'LEAVE') {
      desktopBridge?.quit.respond(confirmation.requestId, false);
    }
    setConfirmation(null);
  }, [confirmation, desktopBridge]);

  const confirmConfirmation = useCallback(() => {
    if (!confirmation) return;
    if (confirmation === 'LEAVE') {
      setConfirmation(null);
      forfeitAndWatch();
      return;
    }
    desktopBridge?.quit.respond(confirmation.requestId, true);
    setConfirmation(null);
  }, [confirmation, desktopBridge, forfeitAndWatch]);

  /**
   * "Quay lại" / "Về trang chủ" on the join form and the failure screens of the desktop app. Nothing was joined, so nothing is
   * left: the socket is disconnected (which only changes presence) and the saved session, if there is one, stays, so the player can
   * still come back to that room. Only an explicit leave revokes a session (`exitToStart`).
   */
  const backToLauncher = useCallback(() => {
    // Late answers of this room must not touch the screen that is about to go away.
    admissionAttemptRef.current += 1;
    initialJoinRef.current = null;
    socket.disconnect();
    onExitToLauncher?.();
  }, [onExitToLauncher, socket]);
  const onBack = desktopBridge && onExitToLauncher ? backToLauncher : undefined;

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
  }, [resumeSession, socket, transition]);

  const recoverFromFailure = useCallback(() => {
    if (failure?.returnToLauncher && onExitToLauncher) {
      onExitToLauncher();
      return;
    }
    retry();
  }, [failure?.returnToLauncher, onExitToLauncher, retry]);

  const contextValue = useMemo(() => ({
    state: room?.gameState ?? initialState,
    socketFunctions,
    playerId,
    role,
    connected,
    canMutate,
    privatePlayerState,
    privateOffers,
    roomPlayers: room?.players ?? [],
    roomStatus: room?.status,
    roomCode: room?.roomCode,
    hostPlayerId: room?.hostPlayerId,
    canPlayAgain,
  }), [canMutate, canPlayAgain, connected, playerId, privateOffers, privatePlayerState, role, room, socketFunctions]);

  const operationErrorText = operationError ? localizeAckError(operationError, language) : null;
  const joinErrorText = failure
    ? failure.error
      ? localizeAckError(failure.error, language)
      : failure.messageKey
        ? t(failure.messageKey, failure.messageValues)
        : failure.message ?? null
    : null;
  const roomExit = useMemo<RoomExitContextValue>(() => ({
    requestLeave: handleLeave,
    leaving: operation === 'leave',
    label: role === 'PLAYER' && room?.status === 'IN_PROGRESS' ? t('app.leaveGame') : t('app.leaveRoom'),
    error: operationErrorText,
  }), [handleLeave, operation, operationErrorText, role, room?.status, t]);

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
              characterId: member.characterId,
              teamId: member.teamId,
              teamSlot: member.teamSlot,
              ready: member.ready,
              connected: member.connected,
              kind: member.kind,
            }))}
          playerId={playerId}
          hostPlayerId={room.hostPlayerId}
          minPlayers={room.minPlayers}
          maxPlayers={room.maxPlayers}
          gameMode={room.gameState.boardState.gameMode}
          teams={room.gameState.boardState.teams}
          seatSwapRequests={room.gameState.boardState.seatSwapRequests}
          busy={operation !== null}
          error={operationErrorText}
          onSetReady={handleReady}
          onSetAppearance={handleAppearance}
          onSetGameMode={handleSetGameMode}
          onSetTeamName={handleSetTeamName}
          onSetTeamColor={handleSetTeamColor}
          onKickPlayer={handleKickPlayer}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          onMoveToSeat={handleMoveToSeat}
          onRequestSeatSwap={handleRequestSeatSwap}
          onCancelSeatSwap={handleCancelSeatSwap}
          onRespondSeatSwap={handleRespondSeatSwap}
          onStart={handleStart}
          onLeave={handleLeave}
          onSettings={() => setSettingsOpen(true)}
          showLanSharing={Boolean(launch?.hosting)}
        />
      )
      : (
        <>
          {role === 'SPECTATOR' ? <SpectatorBanner /> : null}
          <div className="room-toolbar" data-hud-region="toolbar" aria-label={t('app.toolbar')}>
            {import.meta.env.DEV || __PHASE4_UAT__ ? <FpsBadge /> : null}
            <HowToPlayButton />
            <IconButton
              label={t('launcher.settings')}
              icon={<RegistryIcon name="settings" className="room-settings-button__icon" />}
              className={`room-settings-button${settingsOpen ? ' room-settings-button--open' : ''}`}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            />
            <IconButton
              label={role === 'PLAYER' && room.status === 'IN_PROGRESS' ? t('app.leaveGame') : t('app.leaveRoom')}
              icon={role === 'PLAYER' && room.status === 'IN_PROGRESS' ? 'forfeit' : 'leave'}
              className="room-exit-button"
              disabled={operation !== null}
              onClick={handleLeave}
            />
          </div>
          {operationErrorText ? <p className="room-exit-error" role="alert">{operationErrorText}</p> : null}
          <Board />
        </>
      )
    : null;

  return (
    <PresentationProvider controller={presentationController}>
      <stateContext.Provider value={contextValue}>
        <roomExitContext.Provider value={roomExit}>
        <main className="App">
          {phase === 'RESTORING' ? <LoadingScreen as="section" stage="restoring" /> : null}
          {phase === 'JOIN' || phase === 'JOINING'
            ? (
              <JoinForm
                onJoin={handleJoin}
                onBack={onBack}
                busy={phase === 'JOINING'}
                connected={connected}
                error={joinErrorText}
                // What the player typed on the start screen is already in the form: they never type it twice.
                initialName={launch?.initialJoin?.name}
                initialRoomCode={launch?.initialJoin?.roomCode ?? initialRoomCode}
                // A browser opens another Host's own invitation page; the desktop app joins other Hosts from its start screen.
                onOpenInvitation={desktopBridge ? undefined : (endpoint, roomCode) => {
                  window.location.assign(`${endpoint}/?room=${encodeURIComponent(roomCode)}`);
                }}
              />
            )
            : null}
          {phase === 'LOBBY' || phase === 'GAME' || phase === 'RECONNECTING' ? roomContent : null}
          {phase === 'RECONNECTING'
            ? (
              <ConnectionOverlay
                stalled={reconnectStalled}
                roomCode={room?.roomCode}
                onUseNewLink={onSwitchEndpoint ? (endpoint, roomCode) => switchEndpoint(endpoint, roomCode) : undefined}
              />
            )
            : null}
          {phase === 'REPLACED' && failure
            ? <FailureScreen title={t('app.sessionOtherWindow')} failure={failure} onBack={onBack} />
            : null}
          {phase === 'ERROR' && failure
            ? <FailureScreen title={failure.title ?? t('app.restoreFailed')} failure={failure} onRetry={recoverFromFailure} onBack={onBack} />
            : null}
          <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <ConfirmationDialog
            open={confirmation !== null}
            title={confirmation === 'LEAVE' ? t('app.leaveTitle') : t('app.quitTitle')}
            message={confirmation === 'LEAVE'
              ? t('app.leaveMessage')
              : launch?.hosting
                ? t('app.closeHostMessage')
                : t('app.closeWindowMessage')}
            confirmLabel={confirmation === 'LEAVE' ? t('app.leaveGame') : t('app.closeWindow')}
            confirmIcon={confirmation === 'LEAVE' ? <Flag /> : <XIcon />}
            peek={phase === 'GAME' ? 'view' : undefined}
            onCancel={cancelConfirmation}
            onConfirm={confirmConfirmation}
          />
          <ForfeitChoiceDialog
            open={forfeitChoiceOpen && role === 'SPECTATOR' && room?.status === 'IN_PROGRESS'}
            hosting={Boolean(launch?.hosting)}
            leaving={operation === 'leave'}
            onWatch={() => setForfeitChoiceOpen(false)}
            onLeave={leaveRoom}
          />
        </main>
        <CardInteractionOverlay />
        </roomExitContext.Provider>
      </stateContext.Provider>
    </PresentationProvider>
  );
}
