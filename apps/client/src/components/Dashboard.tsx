import { useContext, useState, useEffect } from 'react';
import './style/Dashboard.css';
import MarketPlace from './MarketPlace';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import PlayerList from './dashboard/PlayerList';
import JailPanel from './dashboard/JailPanel';
import BuyPrompt from './dashboard/BuyPrompt';
import SellPrompts from './dashboard/SellPrompts';
import IncomingOffers from './dashboard/IncomingOffers';
import AuctionPanel from './dashboard/AuctionPanel';
import WinnerBanner from './dashboard/WinnerBanner';

export default function Dashboard() {
  const { state, playerId, socketFunctions } = useContext(stateContext);
  const displayPositions = useContext(displayPositionsContext);

  // The buy prompt is driven by authoritative server state, which updates the
  // instant the move resolves — but the token is still walking there. Hold the
  // prompt until our token has actually reached its destination tile.
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const tokenArrived = !myPlayer
    || (displayPositions[playerId as string] ?? myPlayer.currentTile) === myPlayer.currentTile;

  // Every token has finished its stepped walk when each player's displayed tile
  // matches the authoritative server tile.
  const tokensSettled = Object.keys(state.players).every(
    id => (displayPositions[id] ?? state.players[id].currentTile) === state.players[id].currentTile,
  );

  // The server flips `currentPlayer` the instant a move resolves, but a token may
  // still be walking to its landing tile. Hold the "now playing" indicator on the
  // last value until every token has settled, so the turn hand-off doesn't spoil
  // watching the current token finish moving.
  const serverActiveId = state.boardState.currentPlayer.id;
  const [activePlayerId, setActivePlayerId] = useState(serverActiveId);
  useEffect(() => {
    if (tokensSettled) setActivePlayerId(serverActiveId);
  }, [tokensSettled, serverActiveId]);

  return (
    <section className="center__dashboard--container">
      <section className="center__dashboard">
        <article className="center__dashboard--img" />

        <PlayerList activePlayerId={activePlayerId} />

        <section className="center__dashboard__block">
          <JailPanel />
          <BuyPrompt tokenArrived={tokenArrived} />
          <SellPrompts />
          <IncomingOffers />
          <AuctionPanel />
          <WinnerBanner />
          {state.loaded && !state.boardState.gameStarted
            ? (
              <button className="button__start-game" type="button" onClick={() => socketFunctions.startGame()}>
                Start game
              </button>
            )
            : null}
        </section>
        <MarketPlace />
      </section>
    </section>
  );
}
