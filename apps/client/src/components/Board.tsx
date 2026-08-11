import {
  useState,
  useEffect,
  useContext,
  useReducer,
  useMemo,
} from 'react';
import { LayoutGroup } from 'framer-motion';
import './style/Board.css';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import useSteppedPositions from '../useSteppedPositions';
import Tile from './Tile';
import initialState from './BoardInitState';
import Dice from './Dice';
import Log from './Log';
import Dashboard from './Dashboard';
import cardFlipContext, { type CardFlipAction } from '../cardFlipContext';
import sellPromptContext from '../sellPromptContext';
import backOfCards, { type BackCard } from './backOfCards';
import type { SalePrompt } from '../types';

const reducer = (state: BackCard[], action: CardFlipAction): BackCard[] => {
  switch (action.type) {
    case 'FLIP_CARD':
      return [...action.payload];
    default:
      return state;
  }
};

function Board() {
  const [cardsBack, dispatch] = useReducer(reducer, backOfCards);
  const { canMutate, state } = useContext(stateContext);

  // Authoritative tile per player, from the server. The stepper walks the shown
  // positions toward these one tile at a time.
  const actualPositions = useMemo(() => {
    const positions: Record<string, number> = {};
    Object.keys(state.players).forEach((key) => {
      positions[key] = state.players[key].currentTile;
    });
    return positions;
  }, [state.players]);
  const displayPositions = useSteppedPositions(actualPositions);

  const [tiles] = useState(initialState);
  const [openSale, setOpenSale] = useState<SalePrompt | false>(false);
  const [privateSale, setPrivateSale] = useState<SalePrompt | false>(false);

  // Unflip any open card when the user clicks anywhere that isn't a tile or the
  // flipped card itself (e.g. the centre panel, dashboard, log).
  useEffect(() => {
    const anyFlipped = cardsBack.some(card => card.clicked);
    if (!anyFlipped) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('.Tile, .tile-back--container')) return;
      dispatch({
        type: 'FLIP_CARD',
        payload: cardsBack.map(card => (card.clicked ? { ...card, clicked: false } : card)),
      });
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [cardsBack]);

  const handlePutOpenMarket = (tileID: number) => {
    if (canMutate) setOpenSale({ tileID });
  };

  const handleMakeOffer = (tileID: number) => {
    if (canMutate) setPrivateSale({ tileID });
  };

  return (
    <sellPromptContext.Provider value={{
      handlePutOpenMarket,
      handleMakeOffer,
      openSale,
      setOpenSale,
      setPrivateSale,
      privateSale,
    }}
    >
      <cardFlipContext.Provider value={{ cardsBack, dispatch }}>
        <displayPositionsContext.Provider value={displayPositions}>
          <section className="Board">
            <LayoutGroup>
              {
                tiles.map((tile, index) => {
                  if (index === 0) {
                    return <Tile key={index} position="tile__start" id={index} initState={tile} />;
                  }
                  if (index > 0 && index <= 10) {
                    return <Tile key={index} position="tile__horizontal--bottom" id={index} initState={tile} />;
                  }
                  if (index >= 11 && index <= 19) {
                    return <Tile key={index} position="tile__vertical--left" id={index} initState={tile} />;
                  }
                  if (index >= 20 && index <= 30) {
                    return <Tile key={index} position="tile__horizontal--top" id={index} initState={tile} />;
                  }
                  if (index >= 31 && index <= 39) {
                    return <Tile key={index} position="tile__vertical--right" id={index} initState={tile} />;
                  }
                  return null;
                })
              }
            </LayoutGroup>
            <section className="center">
              <Dice />
              <Log />
              <Dashboard />
            </section>
          </section>
        </displayPositionsContext.Provider>
      </cardFlipContext.Provider>
    </sellPromptContext.Provider>
  );
}

export default Board;
