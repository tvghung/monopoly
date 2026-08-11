import { z } from 'zod';
import type {
  JoinRoomRequest,
  OfferAction,
  OfferInfo,
  ResumeSessionRequest,
  SaleInfo,
  SetReadyRequest,
} from './types';
import type { ClientToServerEvents, TileRequest } from './events';

export const playerIdSchema = z.uuid();
export const roomIdSchema = z.uuid();
export const offerIdSchema = z.uuid();
export const auctionIdSchema = z.uuid();
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const playerNameSchema = z.string().trim().min(1).max(20);
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

export const tileRequestSchema = z.strictObject({
  tileID: tileIdSchema,
}) satisfies z.ZodType<TileRequest>;

export const saleInfoSchema = z.strictObject({
  tileID: tileIdSchema,
  price: moneyAmountSchema,
}) satisfies z.ZodType<SaleInfo>;

export const offerInfoSchema = z.strictObject({
  tileID: tileIdSchema,
  price: moneyAmountSchema,
}) satisfies z.ZodType<OfferInfo>;

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
  'leave room': noPayloadSchema,
  'start game': noPayloadSchema,
  'send chat': chatMessageSchema,
  'roll dice': noPayloadSchema,
  'buy property': noPayloadSchema,
  'put on open market': saleInfoSchema,
  'make offer': offerInfoSchema,
  'accept offer': offerActionSchema,
  'decline offer': offerActionSchema,
  'make sale': tileRequestSchema,
  'remove sale': tileRequestSchema,
  'build house': tileIdSchema,
  'sell house': tileIdSchema,
  'mortgage property': tileIdSchema,
  'unmortgage property': tileIdSchema,
  'pay bail': noPayloadSchema,
  'use jail card': noPayloadSchema,
  'decline property': noPayloadSchema,
  'place bid': moneyAmountSchema,
  'pass bid': noPayloadSchema,
} as const satisfies ClientEventPayloadSchemas;

export type ClientEventName = keyof typeof clientEventPayloadSchemas;
