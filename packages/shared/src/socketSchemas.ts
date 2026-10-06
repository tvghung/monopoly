import { z } from 'zod';
import {
  CHARACTER_IDS,
  GAME_MODES,
  PLAYER_COLOR_IDS,
  TEAM_IDS,
  TEAM_NAME_MAX_LENGTH,
} from './types';
import type {
  JoinRoomRequest,
  OfferAction,
  OfferInfo,
  RescueDecisionRequest,
  ResumeSessionRequest,
  SetAppearanceRequest,
  SetGameModeRequest,
  SetReadyRequest,
  SetTeamColorRequest,
  SetTeamNameRequest,
  SwapTeamRequest,
  TradeBundle,
} from './types';
import type { ClientToServerEvents } from './events';

export const playerIdSchema = z.uuid();
export const roomIdSchema = z.uuid();
export const offerIdSchema = z.uuid();
export const gameCardIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(chance|chest)-[a-z0-9-]+$/);
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const playerNameSchema = z.string().trim().min(1).max(20);
export const gameModeSchema = z.enum(GAME_MODES);
export const teamIdSchema = z.enum(TEAM_IDS);
export const playerColorSchema = z.enum(PLAYER_COLOR_IDS);
export const teamNameSchema = z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH);
export const roomCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[a-zA-Z0-9-]+$/)
  .transform((value) => value.toUpperCase());
export const reconnectTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const tileIdSchema = z.number().int().min(0).max(39);
export const MAX_MONEY_AMOUNT = 2_147_483_647;
export const moneyAmountSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_MONEY_AMOUNT);
export const nonNegativeMoneyAmountSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_MONEY_AMOUNT);
export const chatMessageSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((message) => message.trim().length > 0, 'Message cannot be blank');
export const noPayloadSchema = z.undefined();

export const joinRoomRequestSchema = z.strictObject({
  name: playerNameSchema,
  roomCode: roomCodeSchema,
}) satisfies z.ZodType<JoinRoomRequest>;

export const resumeSessionRequestSchema = z.strictObject({
  token: reconnectTokenSchema,
}) satisfies z.ZodType<ResumeSessionRequest>;

export const setReadyRequestSchema = z.strictObject({
  ready: z.boolean(),
}) satisfies z.ZodType<SetReadyRequest>;

export const setAppearanceRequestSchema = z.strictObject({
  characterId: z.enum(CHARACTER_IDS).optional(),
  color: z.enum(PLAYER_COLOR_IDS).optional(),
})
  .refine(
    request => request.characterId !== undefined || request.color !== undefined,
    'At least one appearance field is required',
  ) satisfies z.ZodType<SetAppearanceRequest>;

export const setGameModeRequestSchema = z.strictObject({
  mode: gameModeSchema,
}) satisfies z.ZodType<SetGameModeRequest>;

export const setTeamNameRequestSchema = z.strictObject({
  teamId: teamIdSchema,
  name: teamNameSchema,
}) satisfies z.ZodType<SetTeamNameRequest>;

export const setTeamColorRequestSchema = z.strictObject({
  color: playerColorSchema,
}) satisfies z.ZodType<SetTeamColorRequest>;

export const swapTeamRequestSchema = z.strictObject({
  playerId: playerIdSchema,
  withPlayerId: playerIdSchema,
}).refine(
  request => request.playerId !== request.withPlayerId,
  'Cần chọn hai người chơi khác nhau để đổi đội',
) satisfies z.ZodType<SwapTeamRequest>;

export const operationIdSchema = z.uuid();
export const rescueDecisionRequestSchema = z.strictObject({
  rescueId: operationIdSchema,
}) satisfies z.ZodType<RescueDecisionRequest>;
export const purchaseDecisionRequestSchema = z.strictObject({
  operationId: operationIdSchema,
});
export const developmentDecisionRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ operationId: operationIdSchema, action: z.literal('SKIP') }),
  z.strictObject({
    operationId: operationIdSchema,
    action: z.literal('BUILD_HOUSES'),
    quantity: z.number().int().min(1).max(4),
  }),
  z.strictObject({ operationId: operationIdSchema, action: z.literal('UPGRADE_HOTEL') }),
]);
export const forcedSaleBankRequestSchema = z.strictObject({
  paymentOperationId: operationIdSchema,
  claimId: operationIdSchema,
  tileID: tileIdSchema,
});
export const forcedSaleProposalRequestSchema = z.strictObject({
  paymentOperationId: operationIdSchema,
  claimId: operationIdSchema,
  tileID: tileIdSchema,
  buyerPlayerId: playerIdSchema,
  /** The price the seller asks (V1.1). Omitted: the Bank formula, as before. */
  price: moneyAmountSchema.optional(),
});
export const forcedSaleProposalActionSchema = z.strictObject({ proposalId: operationIdSchema });

const uniqueTileIdsSchema = z
  .array(tileIdSchema)
  .max(28)
  .refine((ids) => new Set(ids).size === ids.length, 'Property ids must be unique');

const uniqueJailCardIdsSchema = z
  .array(gameCardIdSchema)
  .max(2)
  .refine((ids) => new Set(ids).size === ids.length, 'Jail-free card ids must be unique');

export const tradeBundleSchema = z.strictObject({
  cash: nonNegativeMoneyAmountSchema,
  propertyIds: uniqueTileIdsSchema,
  jailFreeCardIds: uniqueJailCardIdsSchema,
}) satisfies z.ZodType<TradeBundle>;

const bundleHasValue = (bundle: TradeBundle): boolean => (
  bundle.cash > 0
  || bundle.propertyIds.length > 0
  || bundle.jailFreeCardIds.length > 0
);

export const offerInfoSchema = z.strictObject({
  recipientPlayerId: playerIdSchema,
  offered: tradeBundleSchema,
  requested: tradeBundleSchema,
})
  .refine(
    (offer) => bundleHasValue(offer.offered) || bundleHasValue(offer.requested),
    'A trade must exchange cash, property, or a jail-free card',
  )
  .refine(
    (offer) => !offer.offered.propertyIds.some((id) => offer.requested.propertyIds.includes(id)),
    'The same property cannot appear on both sides of a trade',
  )
  .refine(
    (offer) => !offer.offered.jailFreeCardIds.some(
      (id) => offer.requested.jailFreeCardIds.includes(id),
    ),
    'The same jail-free card cannot appear on both sides of a trade',
  ) satisfies z.ZodType<OfferInfo>;

export const offerActionSchema = z.strictObject({
  offerId: offerIdSchema,
}) satisfies z.ZodType<OfferAction>;

type ClientEventPayloadSchemas = {
  [EventName in keyof ClientToServerEvents]: z.ZodType;
};

// The first argument supplied by a client for every inbound event. Commands
// with no business payload use `undefined`; their only argument is the typed
// acknowledgement callback and is never parsed as user data.
export const clientEventPayloadSchemas = {
  'join room': joinRoomRequestSchema,
  'resume session': resumeSessionRequestSchema,
  'set ready': setReadyRequestSchema,
  'set appearance': setAppearanceRequestSchema,
  'set game mode': setGameModeRequestSchema,
  'set team name': setTeamNameRequestSchema,
  'set team color': setTeamColorRequestSchema,
  'swap team': swapTeamRequestSchema,
  'leave room': noPayloadSchema,
  'start game': noPayloadSchema,
  'play again': noPayloadSchema,
  'send chat': chatMessageSchema,
  'roll dice': noPayloadSchema,
  'buy property': purchaseDecisionRequestSchema,
  'do not buy': purchaseDecisionRequestSchema,
  'resolve development': developmentDecisionRequestSchema,
  'draw card': purchaseDecisionRequestSchema,
  'dismiss card': purchaseDecisionRequestSchema,
  'make offer': offerInfoSchema,
  'accept offer': offerActionSchema,
  'decline offer': offerActionSchema,
  'sell house': tileIdSchema,
  'pay bail': noPayloadSchema,
  'use jail card': noPayloadSchema,
  'wait in jail': noPayloadSchema,
  'sell property to bank': forcedSaleBankRequestSchema,
  'propose forced sale': forcedSaleProposalRequestSchema,
  'accept forced sale': forcedSaleProposalActionSchema,
  'reject forced sale': forcedSaleProposalActionSchema,
  'revive teammate': noPayloadSchema,
  'accept rescue': rescueDecisionRequestSchema,
  'decline rescue': rescueDecisionRequestSchema,
} as const satisfies ClientEventPayloadSchemas;

export type ClientEventName = keyof typeof clientEventPayloadSchemas;
