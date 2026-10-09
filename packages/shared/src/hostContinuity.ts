/**
 * Host continuity after an address change (a new tunnel hostname). A client hands its reconnect token to a new address only
 * after the Host process it was playing on proves, with a fresh signature, that it answers at exactly that address:
 *
 * - every Host process has its own random P-256 key pair, kept in RAM (a restarted process has a new key);
 * - the resume ACK gives the client that process's public key;
 * - the client sends a random single-use challenge and the address it is about to use; the Host signs
 *   `continuityMessage(roomCode, endpoint, challenge)` only when `endpoint` is one of its own addresses, so another Host can
 *   neither sign (no private key) nor relay the challenge to the real Host (which refuses an address that is not its own).
 *
 * Nothing here is a secret: the key is public, the challenge is random, the token never leaves the client during the check.
 */
export const HOST_CONTINUITY_VERSION = 'otb-host-continuity-v1';

/** 32 random bytes in base64url. */
export const HOST_CONTINUITY_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The exact text the Host signs (ECDSA P-256, SHA-256, IEEE P1363 r||s signature). */
export function continuityMessage(roomCode: string, endpoint: string, challenge: string): string {
  return `${HOST_CONTINUITY_VERSION}\n${roomCode}\n${endpoint}\n${challenge}`;
}

/** What `/_otb/continuity` answers: the signed fields echoed back with the base64url signature. */
export interface HostContinuityProof {
  version: typeof HOST_CONTINUITY_VERSION;
  roomCode: string;
  endpoint: string;
  challenge: string;
  signature: string;
}
