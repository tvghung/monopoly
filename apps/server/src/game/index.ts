// Pure game logic, grouped by concern. This barrel keeps the public surface a
// single `./game` import for the socket handlers and the test suite.
export {
  date, escapeHtml, sanitizeName, sendToLog,
} from './text';
export { checkBalance, checkWinner, nextTurn } from './turn';
export { rollDice, movePlayer } from './dice';
export {
  ownsFullGroup,
  streetRent,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
} from './property';
export { startAuction, finalizeAuction } from './auction';
export {
  checkOwned, applyCard, resolveTile, handleJailRoll,
} from './tiles';
