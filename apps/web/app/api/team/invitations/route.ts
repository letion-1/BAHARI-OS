import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { canAssignRole, isInvitableRole, ROLE_LABELS } from "@/lib/team/roles";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiryFrom,
} from "@/lib/team/invitation-token";

/**
 * Invite someone into the workspace, or withdraw an invitation.
 *
 * TWO DELIVERY PATHS, AND WHY
 *
 * If the address has no Bahari OS account, Supabase creates one and sends the
 * invitation email itself through the project's configured SMTP. The invitee
 * clicks through, lands with a session and no password, and sets one.
 *
 * If the address already has an account - a captain who also works with
 * another brokerage on the platform - Supabase's invite endpoint refuses,
 * correctly: it will not overwrite a live user. That person needs a plain
 * link instead, which they can open while signed in to the account they
 * already have. So the raw token is returned to the inviter to pass along,
 * and the response says which of the two happened.
 *
 * The alternative was to refuse the second case entirely. That would mean a
 * broker who works with two customers cannot be invited by the second one,
 * which is a normal arrangement in this industry and not something to design
 * out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown;
      role?: unknown;
    };

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const role = body.role;

    if (!isValidEmail(email)) {
      return bad("Enter a valid email address.");
    }

    if (!isInvitableRole(role)) {
      return bad("Choose a role for the new member.");
    }

    /*
     * canAssignRole covers both questions at once: whether the caller may
     * manage the team at all, and whether they may hand out this particular
     * role. Only an owner can create an admin.
     */
    if (!canAssignRole(workspace.role, role)) {
      return NextResponse.json(
        {
          success: false,
          error:
            role === "admin"
              ? "Only the workspace owner can invite an admin."
              : "Only owners and admins can invite colleagues.",
        },
        { status: 403 }
      );
    }

    /*
     * Rate limited per company rather than per user. The cost being defended
     * is outbound mail from the project's sending domain: an owner who
     * scripts a loop of invitations to addresses that never accept damages
     * the domain reputation that the charter proposals also depend on.
     */
    const limit = checkRateLimit(`team:invite:${workspace.companyId}`, {
      limit: 20,
      windowSeconds: 3600,
    });

    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many invitations sent in the last hour. Try again shortly.",
        },
        { status: 429 }
      );
    }

    const admin = createAdminClient();

    const companyId = workspace.companyId;

    /*
     * Already a member. Reported plainly: the inviter typed a colleague's
     * address, and the useful answer is that they are already in, not a
     * generic failure.
     */
    const existingUser = await findAuthUserByEmail(email);

    /*
     * An auth row is not the same thing as a usable account.
     *
     * inviteUserByEmail creates the Supabase user as a side effect, before the
     * person has done anything. If that first invitation email was never
     * opened, or its link expired, the row sits there with no password ever
     * set. A second invitation then found the row, concluded "they already
     * have an account", took the manual path, and sent them to a sign-in
     * screen for credentials that do not exist. The person is told the
     * password is incorrect, which is true and useless: there is no password
     * to be correct.
     *
     * Supabase marks these stubs by leaving last_sign_in_at null. Someone who
     * has genuinely used the platform has signed in at least once, because
     * that is how they set their password in the first place.
     */
    const isUnclaimedInviteStub = Boolean(
      existingUser && !existingUser.last_sign_in_at
    );

    const hasUsableAccount = Boolean(
      existingUser && !isUnclaimedInviteStub
    );

    if (existingUser) {
      const { data: existingMember, error: existingMemberError } = await admin
        .from("company_members")
        .select("id, role")
        .eq("company_id", companyId)
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (existingMemberError) {
        throw new Error(existingMemberError.message);
      }

      if (existingMember) {
        return bad(
          `${email} is already a member of this workspace as ${
            ROLE_LABELS[
              (existingMember.role as keyof typeof ROLE_LABELS) ?? "broker"
            ] ?? existingMember.role
          }.`
        );
      }
    }

    /*
     * Clear a dead invitation for this address before writing a new one. The
     * unique index is partial on accepted_at is null and revoked_at is null,
     * and cannot also test expiry because a predicate may not call now(). So
     * an expired row still occupies the slot until it is revoked here.
     */
    const { error: sweepError } = await admin
      .from("company_invitations")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: workspace.userId,
      })
      .eq("company_id", companyId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .lt("expires_at", new Date().toISOString());

    if (sweepError) {
      throw new Error(sweepError.message);
    }

    const token = generateInvitationToken();

    /*
     * Inlined rather than hoisted into a variable so company_id is visible to
     * the tenant isolation audit at the point of the write. A variable
     * payload cannot be resolved statically and lands in the review list.
     */
    const { data: invitation, error: insertError } = await admin
      .from("company_invitations")
      .insert({
        company_id: companyId,
        email,
        role,
        token_hash: hashInvitationToken(token),
        requires_password_setup: !existingUser,
        invited_by: workspace.userId,
        expires_at: invitationExpiryFrom().toISOString(),
      })
      .select("id, email, role, created_at, expires_at")
      .single();

    /*
     * 23505 is the partial unique index reporting a live invitation for this
     * address. From the inviter's side nothing is broken, so it is a conflict
     * rather than an error.
     */
    if (insertError?.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: `${email} already has a pending invitation to this workspace.`,
        },
        { status: 409 }
      );
    }

    if (insertError || !invitation) {
      throw new Error(insertError?.message ?? "Invitation was not created.");
    }

    const inviteUrl = buildInviteUrl(token);

    if (hasUsableAccount) {
      /*
       * No email is sent on this path. Supabase's invite endpoint would
       * refuse, and there is no application-side mailer - transactional mail
       * is Supabase Auth's, configured on the project. Rather than pretend,
       * the link comes back for the inviter to send however they normally
       * reach this person.
       */
      return NextResponse.json({
        success: true,
        delivery: "manual",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          createdAt: invitation.created_at,
          expiresAt: invitation.expires_at,
        },
        inviteUrl,
        message: `${email} already has a Bahari OS account, so no invitation email was sent. Send them this link instead.`,
      });
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: buildCallbackUrl(token),
        data: {
          invited_to_company_id: companyId,
          invited_company_name: workspace.companyName,
          signup_source: "workspace_invitation",
        },
      }
    );

    if (inviteError) {
      /*
       * The invitation row exists but nothing was delivered. Revoked rather
       * than left behind, so the address is free to be invited again once the
       * mail problem is fixed, instead of colliding with a row nobody can
       * use.
       */
      await admin
        .from("company_invitations")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: workspace.userId,
        })
        .eq("company_id", companyId)
        .eq("id", invitation.id);

      console.error("Supabase invitation email failed:", inviteError.message);

      return NextResponse.json(
        {
          success: false,
          error:
            "The invitation could not be emailed. Check the project's SMTP configuration and try again.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      delivery: "email",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
      },
      /*
       * Returned on this path too. Invitation email deliverability is not
       * something this application can observe, and a link the owner can pass
       * on directly is the difference between a colleague getting in today
       * and a support conversation.
       */
      inviteUrl,
      message: `Invitation sent to ${email}.`,
    });
  } catch (error) {
    return handle(error, "Could not send the invitation.");
  }
}

/** Withdraw a pending invitation. */
export async function DELETE(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    if (!canAssignRole(workspace.role, "viewer")) {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can withdraw invitations.",
        },
        { status: 403 }
      );
    }

    const invitationId = new URL(request.url).searchParams.get("id");

    if (!invitationId) {
      return bad("The invitation to withdraw was not identified.");
    }

    const admin = createAdminClient();

    const companyId = workspace.companyId;

    const { data, error } = await admin
      .from("company_invitations")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: workspace.userId,
      })
      .eq("company_id", companyId)
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return bad(
        "That invitation has already been accepted or withdrawn.",
        409
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handle(error, "Could not withdraw the invitation.");
  }
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();

  const target = email.trim().toLowerCase();

  const perPage = 1000;
  let page = 1;

  while (page <= 100) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error(
        "Could not inspect existing Supabase Auth users:",
        error.message
      );

      return null;
    }

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );

    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}

function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

function buildInviteUrl(token: string) {
  return `${appOrigin()}/invite/${token}`;
}

/**
 * Where Supabase sends the invitee after it verifies its own link.
 *
 * flow=invite matters: without it the callback treats every arrival as a new
 * signup and provisions the user a company of their own, which is precisely
 * the opposite of joining an existing one.
 */
function buildCallbackUrl(token: string) {
  const next = encodeURIComponent(`/invite/${token}`);

  return `${appOrigin()}/auth/callback?flow=invite&next=${next}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function handle(error: unknown, fallback: string) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  console.error("Team invitation API error:", error);

  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}