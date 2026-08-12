// Pure game logic, grouped by concern. This barrel keeps the public surface a
// single `./game` import for the socket handlers and the test suite.
export {
  date, escapeHtml, sanitizeName, sendToLog,
} from './text';
export {
  checkBalance,
  checkWinner,
  completeTurnResolution,
  continuationForRoll,
  nextTurn,
  removePlayerFromGame,
} from './turn';
export type { TurnResolutionOutcome } from './turn';
export {
  chooseStartingPlayer,
  diceTotal,
  isDouble,
  moveBy,
  movePlayer,
  moveToJail,
  moveToTile,
  rollDice,
  rotateSeatOrder,
} from './dice';
export { createShuffledDecks, shuffleInPlace } from './decks';
export type { RandomIndex } from './decks';
export {
  BANK_HOTELS,
  BANK_HOUSES,
  bankBuildingInventory,
  canBuildHouse,
  ownsFullGroup,
  propertyGroupHasBuildings,
  requestedBuildingType,
  streetRent,
  buildHouse,
  liquidateBuildings,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
} from './property';
export {
  AUCTION_INITIAL_DURATION_MS,
  AUCTION_MIN_BID_WINDOW_MS,
  BUILDING_CONTENTION_DURATION_MS,
  startAuction,
  startBuildingAuction,
  startNextBankPropertyAuction,
  extendAuctionDeadline,
  finalizeAuction,
} from './auction';
export type { StartAuctionOptions } from './auction';
export {
  activeDebtClaim,
  activeDebtorId,
  assertDebtActionAllowed,
  createPaymentQueue,
  continueDebtAfterLiquidity,
  DEFAULT_DEBT_ACTION_TIMEOUT_MS,
  enqueuePayments,
  hasPendingDebt,
  logPausedDebt,
  refreshDebtDeadline,
  settleAffordableClaims,
} from './payment';
export type { CompulsoryPayment, QueuePaymentOptions } from './payment';
export {
  executeVoluntaryTrade,
  groupTileIds,
  invalidatePropertyCommerce,
  mortgageTransferInterest,
  transferProperty,
} from './transfer';
export type { PropertyTransferPolicy, PropertyTransferResult } from './transfer';
export {
  declareActiveDebtBankruptcy,
  surrenderPlayerToBank,
} from './bankruptcy';
export type { BankruptcyResult } from './bankruptcy';
export {
  applyCard,
  cardTileIndices,
  checkOwned,
  handleJailRoll,
  railroadRent,
  resolveTile,
  resumePaymentContinuation,
  utilityRent,
} from './tiles';
export type { TileResolutionOptions } from './tiles';
