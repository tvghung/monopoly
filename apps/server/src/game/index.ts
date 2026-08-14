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
  streetRent,
  isPropertyLockedByLandingDecision,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  forcedSaleGrossPrice,
  forcedSaleNetProceeds,
  mortgagePrincipal,
} from './property';
export {
  activeDebtClaim,
  activeDebtorId,
  assertDebtActionAllowed,
  createPaymentQueue,
  enqueuePayments,
  hasPendingDebt,
  logPausedDebt,
  refreshDebtDeadline,
  settleAffordableClaims,
  sellPropertyToBankForPayment,
  createForcedSaleProposal,
  acceptForcedSaleProposal,
  rejectForcedSaleProposal,
  activePaymentClaim,
  DEFAULT_FORCED_SALE_PROPOSAL_TIMEOUT_MS,
  DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS,
} from './payment';
export type { CompulsoryPayment, ForcedSaleExecutionResult, QueuePaymentOptions } from './payment';
export { bankruptActiveDebtor, progressPaymentQueue, sellablePropertyIds } from './paymentResolution';
export type { PaymentProgressResult, PaymentProgressStatus } from './paymentResolution';
export {
  executeVoluntaryTrade,
  invalidatePropertyCommerce,
  mortgageTransferInterest,
  transferProperty,
} from './transfer';
export type { PropertyTransferPolicy, PropertyTransferResult } from './transfer';
export {
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
