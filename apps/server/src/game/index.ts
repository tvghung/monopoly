// Pure game logic, grouped by concern. This barrel keeps the public surface a
// single `./game` import for the socket handlers and the test suite.
export {
  date, escapeHtml, sanitizeName, sendToLog,
} from './text';
export {
  checkBalance,
  checkWinner,
  nextTurn,
  removePlayerFromGame,
} from './turn';
export { rollDice, movePlayer } from './dice';
export {
  ownsFullGroup,
  streetRent,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
} from './property';
export {
  AUCTION_INITIAL_DURATION_MS,
  AUCTION_MIN_BID_WINDOW_MS,
  startAuction,
  extendAuctionDeadline,
  finalizeAuction,
} from './auction';
export type { StartAuctionOptions } from './auction';
export {
  checkOwned, applyCard, resolveTile, handleJailRoll,
} from './tiles';
