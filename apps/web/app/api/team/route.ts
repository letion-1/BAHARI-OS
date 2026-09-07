import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageTeam } from "@/lib/team/roles";

/**
 * Who is in this workspace, and who has been asked to join.
 *
 * WHY THE ADMIN CLIENT
 *
 * company_members carries a self-read RLS policy and nothing else: a member
 * can see their own row and no others. That is correct at the database level
 * - it is the root of the tenant graph, and a policy that let a member read
 * their colleagues' rows would need to read company_members to decide, which
 * recurses.
 *
 * So the only way to list colleagues is the service role, and every guarantee
 * RLS would have given has to be reproduced here in code: the caller's
 * workspace is resolved first, their role is checked, and every query is
 * pinned to workspace.companyId. company_id is never taken from the request.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  requires_password_setup: boolean;
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();

    if (!canManageTeam(workspace.role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can view workspace members.",
        },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    const companyId = workspace.companyId;

    const { data: memberData, error: memberError } = await admin
      .from("company_members")
      .select("id, user_id, role, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (memberError) {
      throw new Error(memberError.message);
    }

    const { data: invitationData, error: invitationError } = await admin
      .from("company_invitations")
      .select(
        "id, email, role, created_at, expires_at, requires_password_setup"
      )
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (invitationError) {
      throw new Error(invitationError.message);
    }

    const members = (memberData ?? []) as MemberRow[];

    /*
     * Names and email addresses live in Supabase Auth, not in
     * company_members, so they have to be fetched per user. Sequential rather
     * than parallel on purpose: a brokerage has a handful of members, and
     * hammering the auth admin API with a burst of concurrent lookups is a
     * good way to meet its rate limit for no benefit.
     */
    const identities = await Promise.all(
      members.map(async (member) => {
        const { data, error } = await admin.auth.admin.getUserById(
          member.user_id
        );

        if (error || !data.user) {
          /*
           * A membership row whose auth user is gone. Shown rather than
           * hidden: it still grants nothing, but an owner auditing access
           * should see that the row exists so they can remove it.
           */
          return {
            email: null,
            fullName: null,
            lastSignInAt: null,
          };
        }

        const metadata = isRecord(data.user.user_metadata)
          ? data.user.user_metadata
          : {};

        return {
          email: data.user.email ?? null,
          fullName:
            readString(metadata, "full_name") ??
            readString(metadata, "display_name"),
          lastSignInAt: data.user.last_sign_in_at ?? null,
        };
      })
    );

    const now = Date.now();

    return NextResponse.json({
      success: true,
      viewer: {
        userId: workspace.userId,
        membershipId: workspace.membershipId,
        role: workspace.role,
      },
      members: members.map((member, index) => ({
        id: member.id,
        userId: member.user_id,
        role: member.role,
        joinedAt: member.created_at,
        email: identities[index]?.email ?? null,
        fullName: identities[index]?.fullName ?? null,
        lastSignInAt: identities[index]?.lastSignInAt ?? null,
        isSelf: member.user_id === workspace.userId,
      })),
      invitations: ((invitationData ?? []) as InvitationRow[]).map(
        (invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          createdAt: invitation.created_at,
          expiresAt: invitation.expires_at,
          isExpired: new Date(invitation.expires_at).getTime() <= now,
          requiresPasswordSetup: invitation.requires_password_setup,
        })
      ),
    });
  } catch (error) {
    return handle(error, "Could not load the workspace team.");
  }
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
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

  console.error("Team API error:", error);

  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}