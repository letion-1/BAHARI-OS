import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  generateItineraryShareToken,
  hashItineraryShareToken,
  isPlausibleItineraryShareToken,
} from "@/lib/itinerary/share-token";

describe("itinerary share tokens", () => {
  it("issues a different token every time", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateItineraryShareToken())
    );

    expect(tokens.size).toBe(50);
  });

  it("hashes exactly as migration 0019 backfilled", () => {
    /*
     * The migration ran encode(digest(token,'sha256'),'hex'). If this ever
     * diverges, every link issued before the migration stops resolving and it
     * presents as all of them expiring at once.
     */
    const token = "an-existing-token-value";

    expect(hashItineraryShareToken(token)).toBe(
      createHash("sha256").update(token, "utf8").digest("hex")
    );
  });

  it("still accepts the 48-character hex tokens issued before hashing", () => {
    // Old links are in guests' inboxes. The pattern has to let them through
    // so they reach the lookup, where their backfilled hash resolves.
    expect(isPlausibleItineraryShareToken("a".repeat(48))).toBe(true);
  });

  it("rejects anything too short to be a real token", () => {
    expect(isPlausibleItineraryShareToken("abc")).toBe(false);
    expect(isPlausibleItineraryShareToken("")).toBe(false);
    expect(isPlausibleItineraryShareToken(null)).toBe(false);
    expect(isPlausibleItineraryShareToken(42)).toBe(false);
  });

  it("rejects characters that would not survive a URL path", () => {
    expect(
      isPlausibleItineraryShareToken(`${"a".repeat(40)}/../secret`)
    ).toBe(false);
  });
});