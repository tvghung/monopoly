import { useEffect, useReducer, useState } from 'react';
import { io } from 'socket.io-client';
import type { GameState } from '@monopoly/shared';
import Board from './components/Board';
import JoinForm from './components/JoinForm';
import stateContext from './internal';
import type { AppSocket, SocketFunctions } from './types';
import './App.css';

// __SOCKET_URL__ is injected by Vite's `define` (see vite.config.ts) at build
// time. The `typeof` guard keeps this safe in dev too, where it resolves to
// same-origin (empty) and the Vite proxy forwards socket.io traffic.
const socketUrl = typeof __SOCKET_URL__ !== 'undefined' ? __SOCKET_URL__ : '';
const socket: AppSocket = io(socketUrl || undefined);

const socketFunctions: SocketFunctions = {
  newPlayer: (name, roomId) => socket.emit('new player', name, roomId),
  endTurn: () => socket.emit('end turn', ''),
  rollDice: () => socket.emit('roll dice'),
  buyProperty: () => socket.emit('buy property', true),
  sendChat: (message) => socket.emit('send chat', message),
  putOpenMarket: (saleInfo) => socket.emit('put on open market', saleInfo),
  makeOffer: (offerInfo) => socket.emit('make offer', offerInfo),
  acceptOffer: (offer) => socket.emit('accept offer', offer),
  declineOffer: (offer) => socket.emit('decline offer', offer),
  makeSale: (item) => socket.emit('make sale', item),
  startGame: () => socket.emit('start game', ''),
  removeSale: (item) => socket.emit('remove sale', item),
};

const initialState: GameState = {
  boardState: {
    gameStarted: false,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    logs: [],
    diceValue: { dice1: ['⚅', 0], dice2: ['⚅', 0] },
    ownedProps: {},
    openMarket: {},
  },
  players: {},
  turnInfo: {},
  loaded: false,
};

type Action = { type: 'updateGameState'; payload: GameState };

const reducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'updateGameState':
      return { ...action.payload };
    default:
      return state;
  }
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [playerId, setPlayerId] = useState<string | false>(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = (name: string, roomId: string) => {
    socketFunctions.newPlayer(name, roomId);
    setJoined(true);
  };

  useEffect(() => {
    const onConnect = () => setPlayerId(socket.id ?? false);
    const onUpdate = (newState: GameState) => dispatch({ type: 'updateGameState', payload: newState });

    if (socket.connected) setPlayerId(socket.id ?? false);
    socket.on('connect', onConnect);
    socket.on('update', onUpdate);

    const preventUnload = () => false;
    window.onbeforeunload = preventUnload;

    return () => {
      socket.off('connect', onConnect);
      socket.off('update', onUpdate);
      if (window.onbeforeunload === preventUnload) window.onbeforeunload = null;
    };
  }, []);

  return (
    <stateContext.Provider value={{
      state, socketFunctions, playerId, socket,
    }}
    >
      <main className="App">
        {joined ? <Board /> : <JoinForm onJoin={handleJoin} />}
      </main>
    </stateContext.Provider>
  );
}
