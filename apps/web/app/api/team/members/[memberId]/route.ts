import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAssignRole, canManageTeam, isTeamRole } from "@/lib/team/roles";

/**
 * Change a member's role, or remove them from the workspace.
 *
 * THE INVARIANTS, AND WHY EACH ONE EXISTS
 *
 * A workspace always keeps at least one owner. Owner is the only role that
 * can request account deletion, transfer billing or invite an admin, so a
 * workspace with none is a workspace nobody can administer - recoverable only
 * by someone with the service-role key, which is Anthropic-side support work
 * for a self-service product. Both the demotion and the removal path check
 * this.
 *
 * Nobody edits their own membership. An owner who demotes themselves by
 * mis-clicking a dropdown has locked the workspace; an admin who promotes
 * themselves to owner has taken the brokerage. Self-removal is a different
 * gesture with different wording, and it belongs on the settings page next to
 * account deletion, not in a colleague list.
 *
 * Only an owner may create or remove an admin. Otherwise two admins can
 * remove each other, and the owner is a spectator.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const workspace = await getCurrentWorkspace();
    const { memberId } = await context.params;

    if (!canManageTeam(workspace.role)) {
      return forbidden("Only owners and admins can change member roles.");
    }

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
    };

    const nextRole = body.role;

    if (!isTeamRole(nextRole)) {
      return bad("Choose a valid role.");
    }

    if (!canAssignRole(workspace.role, nextRole)) {
      return forbidden(
        nextRole === "owner"
          ? "Ownership cannot be assigned here."
          : "Only the workspace owner can grant the admin role."
      );
    }

    const admin = createAdminClient();

    const companyId = workspace.companyId;

    const { data: memberData, error: memberError } = await admin
      .from("company_members")
      .select("id, user_id, role")
      .eq("company_id", companyId)
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    const member = memberData as MemberRow | null;

    if (!member) {
      return bad("That member is not part of this workspace.", 404);
    }

    if (member.id === workspace.membershipId) {
      return forbidden("You cannot change your own role.");
    }

    if (member.role === nextRole) {
      return NextResponse.json({ success: true, role: nextRole });
    }

    if (member.role === "owner") {
      if (workspace.role !== "owner") {
        return forbidden("Only an owner can change another owner's role.");
      }

      const remaining = await countOwnersExcluding(companyId, member.id);

      if (remaining === 0) {
        return bad(
          "This is the only owner. Promote another member to owner before changing this role.",
          409
        );
      }
    }

    if (member.role === "admin" && workspace.role !== "owner") {
      return forbidden("Only the workspace owner can change an admin's role.");
    }

    const { error: updateError } = await admin
      .from("company_members")
      .update({ role: nextRole })
      .eq("company_id", companyId)
      .eq("id", member.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ success: true, role: nextRole });
  } catch (error) {
    return handle(error, "Could not change the member's role.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const workspace = await getCurrentWorkspace();
    const { memberId } = await context.params;

    if (!canManageTeam(workspace.role)) {
      return forbidden("Only owners and admins can remove members.");
    }

    const admin = createAdminClient();

    const companyId = workspace.companyId;

    const { data: memberData, error: memberError } = await admin
      .from("company_members")
      .select("id, user_id, role")
      .eq("company_id", companyId)
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    const member = memberData as MemberRow | null;

    if (!member) {
      return bad("That member is not part of this workspace.", 404);
    }

    if (member.id === workspace.membershipId) {
      return forbidden(
        "You cannot remove yourself. Ask another owner or admin, or delete the account from Settings."
      );
    }

    if (member.role === "owner") {
      if (workspace.role !== "owner") {
        return forbidden("Only an owner can remove another owner.");
      }

      const remaining = await countOwnersExcluding(companyId, member.id);

      if (remaining === 0) {
        return bad(
          "This is the only owner. Promote another member to owner first.",
          409
        );
      }
    }

    if (member.role === "admin" && workspace.role !== "owner") {
      return forbidden("Only the workspace owner can remove an admin.");
    }

    /*
     * The membership row goes; the auth user stays.
     *
     * The person may hold memberships in other brokerages on the platform,
     * and deleting the auth account would take those with it. Removing
     * membership is already sufficient: getCurrentWorkspace resolves the
     * active company from company_members, and every RLS policy runs through
     * is_company_member, so with no row here their session can reach nothing
     * belonging to this company.
     *
     * Their authored records - proposals they wrote, notes they left - keep
     * their user_id. Rewriting history to erase a departed colleague would
     * make the audit trail useless. An Art. 17 request from that individual
     * is a separate, deliberate path and is handled by the deletion worker.
     */
    const { error: deleteError } = await admin
      .from("company_members")
      .delete()
      .eq("company_id", companyId)
      .eq("id", member.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handle(error, "Could not remove the member.");
  }
}

/**
 * How many owners the company would still have if this membership stopped
 * being one. Counted through the service role because company_members is not
 * readable across a company by any client.
 */
async function countOwnersExcluding(
  companyId: string,
  excludedMembershipId: string
): Promise<number> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .neq("id", excludedMembershipId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).length;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function forbidden(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
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

  console.error("Team member API error:", error);

  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}