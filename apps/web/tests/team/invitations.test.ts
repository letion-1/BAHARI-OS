import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiryFrom,
  isPlausibleInvitationToken,
} from "@/lib/team/invitation-token";
import {
  INVITABLE_ROLES,
  WORKSPACE_ROLES,
  canAssignRole,
  canManageTeam,
  humanizeRole,
  isInvitableRole,
  isTeamRole,
} from "@/lib/team/roles";

describe("invitation tokens", () => {
  it("generates URL-safe tokens that pass their own validator", () => {
    for (let index = 0; index < 25; index += 1) {
      const token = generateInvitationToken();

      expect(isPlausibleInvitationToken(token)).toBe(true);

      // The token sits in a path segment of an emailed link.
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("never repeats a token", () => {
    const tokens = new Set(
      Array.from({ length: 500 }, () => generateInvitationToken())
    );

    expect(tokens.size).toBe(500);
  });

  it("stores a SHA-256 hash, not the token", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex")
    );
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it("rejects values that are not tokens", () => {
    for (const value of [
      "",
      "short",
      null,
      undefined,
      42,
      "has spaces in it aaaaaaaaaaaaaaaaaaaaaaaaaa",
      "contains/a/slash/aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "a".repeat(200),
    ]) {
      expect(isPlausibleInvitationToken(value)).toBe(false);
    }
  });

  it("expires the configured number of days out", () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const expiry = invitationExpiryFrom(now);

    const days =
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    expect(days).toBe(INVITATION_TTL_DAYS);
  });

  it("does not mutate the date it is given", () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const before = now.toISOString();

    invitationExpiryFrom(now);

    expect(now.toISOString()).toBe(before);
  });
});

describe("workspace roles", () => {
  it("never offers owner as an invitable role", () => {
    /*
     * The database check constraint on company_invitations.role refuses
     * 'owner' outright. If this list ever gained it, every invitation at that
     * role would fail at the insert with a constraint violation rather than a
     * useful message.
     */
    expect(INVITABLE_ROLES).not.toContain("owner");

    expect(isInvitableRole("owner")).toBe(false);
  });

  it("keeps the invitable roles a subset of the workspace roles", () => {
    for (const role of INVITABLE_ROLES) {
      expect(WORKSPACE_ROLES).toContain(role);
    }
  });

  it("lets only owners and admins manage the team", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);

    for (const role of ["broker", "crew", "viewer", "", "nonsense"]) {
      expect(canManageTeam(role)).toBe(false);
    }
  });

  it("lets only an owner create an admin", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
  });

  it("refuses to assign ownership through any path", () => {
    for (const actor of WORKSPACE_ROLES) {
      expect(canAssignRole(actor, "owner")).toBe(false);
    }
  });

  it("lets admins assign the day-to-day roles", () => {
    for (const role of ["broker", "crew", "viewer"] as const) {
      expect(canAssignRole("admin", role)).toBe(true);
      expect(canAssignRole("owner", role)).toBe(true);
    }
  });

  it("grants a broker nothing, whatever the target role", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(canAssignRole("broker", role)).toBe(false);
      expect(canAssignRole("viewer", role)).toBe(false);
      expect(canAssignRole("crew", role)).toBe(false);
    }
  });

  it("recognises exactly the five roles", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(isTeamRole(role)).toBe(true);
    }

    for (const value of ["Owner", "OWNER", "captain", "", null, 7]) {
      expect(isTeamRole(value)).toBe(false);
    }
  });

  it("humanises a legacy role rather than dropping it", () => {
    /*
     * company_members.role was free text before migration 0018, and the
     * constraint added there is NOT VALID, so a pre-existing odd value is
     * still possible. The team screen has to render it as something.
     */
    expect(humanizeRole("owner")).toBe("Owner");
    expect(humanizeRole("head_of_charter")).toBe("Head Of Charter");
    expect(humanizeRole(null)).toBe("Member");
    expect(humanizeRole("")).toBe("Member");
  });
});