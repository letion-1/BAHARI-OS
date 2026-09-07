import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens for public itinerary share links.
 *
 * Deliberately identical in shape to lib/charter/contract-share-token.ts and
 * lib/proposal/share-token.ts. Three link types with three token formats
 * would mean three sets of validation rules to keep correct, and a mistake in
 * any one of them is a public URL that either fails to open or opens
 * something it should not.
 *
 * WHAT CHANGED
 *
 * These tokens used to be stored in plaintext, generated as 24 random bytes
 * hex-encoded and looked up directly. Only the hash is stored now.
 *
 * An itinerary is the most personal thing this product holds: guest names,
 * their movements, and the dates a family is away from home. Its link is also
 * the one most likely to be forwarded, screenshotted and pasted into a group
 * chat. Storing the token in the clear meant a database copy was a working
 * key to every one of those.
 *
 * 32 bytes of randomness, base64url encoded so it survives a URL path
 * segment, a WhatsApp message and a copy-paste out of an email client.
 */

const TOKEN_BYTES = 32;

/*
 * Matches base64url of 32 bytes, with room either side.
 *
 * The lower bound is 32 rather than 43 on purpose: tokens issued before this
 * change were 48 hex characters, and a guest opening an old link should reach
 * the itinerary rather than a validation error. Migration 0019 hashed those,
 * so they still resolve.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function generateItineraryShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hex-encoded SHA-256 of the UTF-8 bytes.
 *
 * The encoding is load-bearing and matches migration 0019's backfill:
 * encode(digest(token, 'sha256'), 'hex'). Any difference here and every link
 * issued before the migration stops resolving, which would present as all of
 * them expiring at once.
 */
export function hashItineraryShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Checked before the database is touched, so a malformed or probing request
 * costs a regex rather than a query.
 */
export function isPlausibleItineraryShareToken(
  value: unknown
): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}