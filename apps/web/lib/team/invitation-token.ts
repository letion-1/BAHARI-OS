import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens for workspace invitation links.
 *
 * Same shape as lib/charter/contract-share-token.ts and
 * lib/proposal/share-token.ts: 32 random bytes, base64url, sha256 at rest.
 * A third token format would mean a third set of validation rules to keep
 * correct, and there is nothing about an invitation that needs one.
 *
 * What is different is the stake. A share link exposes one proposal; an
 * invitation grants standing membership of a company workspace. So the token
 * is checked against a hash, has an expiry, and is single-use.
 */

const TOKEN_BYTES = 32;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** How long an invitation stays open. */
export const INVITATION_TTL_DAYS = 7;

export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Only the hash is stored. The raw token exists in the invitation email and
 * in the link the owner can copy at creation time, and cannot be recovered
 * from the database afterwards.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Cheap shape check, run before the database is touched, so a probing
 * request costs a regex rather than a query.
 */
export function isPlausibleInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function invitationExpiryFrom(now: Date = new Date()): Date {
  const expires = new Date(now);

  expires.setUTCDate(expires.getUTCDate() + INVITATION_TTL_DAYS);

  return expires;
}