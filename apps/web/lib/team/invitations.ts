import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashInvitationToken,
  isPlausibleInvitationToken,
} from "@/lib/team/invitation-token";
import type { TeamRole } from "@/lib/team/roles";

/**
 * Reading and consuming an invitation.
 *
 * These queries are scoped by token hash rather than by company_id, because
 * at this point in the flow there is no session and therefore no workspace to
 * scope to. The token is the authorisation. That is the same arrangement the
 * public proposal and contract routes use, and the tenant isolation audit
 * recognises the pattern.
 */

export type InvitationStatus =
  | "valid"
  | "malformed"
  | "not_found"
  | "expired"
  | "accepted"
  | "revoked";

export type LoadedInvitation = {
  status: InvitationStatus;
  invitation: {
    id: string;
    companyId: string;
    companyName: string | null;
    email: string;
    role: TeamRole;
    requiresPasswordSetup: boolean;
    expiresAt: string;
  } | null;
};

type InvitationRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  requires_password_setup: boolean;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function loadInvitationByToken(
  token: string
): Promise<LoadedInvitation> {
  if (!isPlausibleInvitationToken(token)) {
    return { status: "malformed", invitation: null };
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("company_invitations")
    .select(
      "id, company_id, email, role, requires_password_setup, expires_at, accepted_at, revoked_at"
    )
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the invitation: ${error.message}`);
  }

  const row = data as InvitationRow | null;

  if (!row) {
    return { status: "not_found", invitation: null };
  }

  /*
   * Order matters. An invitation that was accepted and has since passed its
   * expiry should read as accepted, because that is the fact the invitee
   * needs: they are already in, and should sign in rather than ask for a new
   * link.
   */
  const status: InvitationStatus = row.accepted_at
    ? "accepted"
    : row.revoked_at
      ? "revoked"
      : new Date(row.expires_at).getTime() <= Date.now()
        ? "expired"
        : "valid";

  const companyName = await readCompanyName(row.company_id);

  return {
    status,
    invitation: {
      id: row.id,
      companyId: row.company_id,
      companyName,
      email: row.email,
      role: row.role as TeamRole,
      requiresPasswordSetup: row.requires_password_setup,
      expiresAt: row.expires_at,
    },
  };
}

export type AcceptResult =
  | { ok: true; companyId: string }
  | { ok: false; message: string };

/**
 * Turn a valid invitation into a membership.
 *
 * Called with an authenticated user, because the invitee has to prove control
 * of the mailbox before they get a row in company_members. On the emailed
 * path Supabase has already established that session; on the manual path the
 * person signs in to the account they already have.
 */
export async function acceptInvitation({
  token,
  userId,
  userEmail,
}: {
  token: string;
  userId: string;
  userEmail: string | null;
}): Promise<AcceptResult> {
  const { status, invitation } = await loadInvitationByToken(token);

  if (status !== "valid" || !invitation) {
    return {
      ok: false,
      message: describeInvalidStatus(status),
    };
  }

  /*
   * The session's address must match the invitation's.
   *
   * Without this check, anyone holding the token could accept it from their
   * own account, and the token travels through email and possibly a chat
   * message. The check is what makes the invitation an offer to a specific
   * person rather than a bearer credential for the workspace.
   */
  if (
    !userEmail ||
    userEmail.trim().toLowerCase() !== invitation.email.trim().toLowerCase()
  ) {
    return {
      ok: false,
      message: `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
    };
  }

  const admin = createAdminClient();

  const companyId = invitation.companyId;

  const { data: existing, error: existingError } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      message: "Could not check the existing workspace membership.",
    };
  }

  if (!existing) {
    const { error: insertError } = await admin
      .from("company_members")
      .insert({
        company_id: companyId,
        user_id: userId,
        role: invitation.role,
      });

    /*
     * 23505 means a membership row appeared between the check and the insert
     * - the invitee opened the link twice. Not an error: the desired state
     * holds either way.
     */
    if (insertError && insertError.code !== "23505") {
      return {
        ok: false,
        message: `Could not add you to the workspace: ${insertError.message}`,
      };
    }
  }

  /*
   * Marked accepted last, and conditionally.
   *
   * If this update ran first and the membership insert then failed, the
   * invitation would be spent and the invitee would be locked out with no way
   * back except a fresh invitation. In this order the worst case is an
   * invitation that is still open after a successful join, which the
   * idempotent insert above absorbs.
   *
   * The accepted_at is null predicate makes two simultaneous clicks settle on
   * one winner without either failing.
   */
  const { error: consumeError } = await admin
    .from("company_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq("company_id", companyId)
    .eq("id", invitation.id)
    .is("accepted_at", null);

  if (consumeError) {
    console.error(
      "Membership was created but the invitation was not closed:",
      consumeError.message
    );
  }

  return { ok: true, companyId };
}

export function describeInvalidStatus(status: InvitationStatus): string {
  switch (status) {
    case "expired":
      return "This invitation has expired. Ask the person who invited you to send a new one.";
    case "accepted":
      return "This invitation has already been used. Sign in to reach the workspace.";
    case "revoked":
      return "This invitation was withdrawn. Ask the person who invited you to send a new one.";
    case "malformed":
    case "not_found":
    default:
      return "This invitation link is not valid. Check that it was copied in full, or ask for a new one.";
  }
}

async function readCompanyName(companyId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return typeof data.name === "string" ? data.name : null;
}