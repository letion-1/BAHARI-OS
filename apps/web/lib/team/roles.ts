/**
 * The workspace permission tiers.
 *
 * Not job titles. A person's job title lives in the auth user metadata as
 * role_title and is free text: "Captain, M/Y Serenity", "Head of Charter
 * Marketing". This is the much smaller question of what they may do in the
 * application, and it has to be a closed set because every permission check
 * branches on it.
 *
 * Kept in sync with the company_members_role_check constraint in migration
 * 0018 and with WorkspaceRole in lib/workspace/get-current-workspace.ts.
 */

export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "broker",
  "crew",
  "viewer",
] as const;

export type TeamRole = (typeof WORKSPACE_ROLES)[number];

/** Roles that may be handed out in an invitation. Ownership may not. */
export const INVITABLE_ROLES = [
  "admin",
  "broker",
  "crew",
  "viewer",
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  broker: "Broker",
  crew: "Crew",
  viewer: "Viewer",
};

/**
 * Written for the person choosing from a dropdown, who is a yacht broker and
 * not an administrator of software. "Manage billing and members" is useful to
 * them; "elevated privileges" is not.
 */
export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner:
    "Full access, plus billing and workspace deletion. There is always exactly one path to this role and it cannot be invited.",
  admin:
    "Everything a broker can do, plus inviting and removing colleagues and changing workspace settings.",
  broker:
    "Day-to-day charter work: inquiries, proposals, charters, clients and itineraries.",
  crew:
    "Read the fleet, availability and the itineraries and concierge lists for charters they are working. No client or commercial data.",
  viewer:
    "Read-only across the workspace. For an accountant or an owner's representative who needs visibility and nothing else.",
};

export function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return (
    typeof value === "string" &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Who may open the team page and change who is in the workspace.
 *
 * Brokers cannot, deliberately. A brokerage of four people where everyone can
 * invite is a brokerage where nobody knows who has access, and the access in
 * question is to client contact details and charter pricing.
 */
export function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Only an owner may create another admin.
 *
 * Without this an admin can invite a second admin, who can invite a third,
 * and the owner loses any practical control over the size of the group that
 * can remove members. Admins can still invite brokers, crew and viewers,
 * which is the case the role exists for.
 */
export function canAssignRole(
  actorRole: string,
  targetRole: TeamRole
): boolean {
  if (!canManageTeam(actorRole)) {
    return false;
  }

  if (targetRole === "owner") {
    return false;
  }

  if (targetRole === "admin") {
    return actorRole === "owner";
  }

  return true;
}

export function humanizeRole(value: string | null | undefined): string {
  if (!value) {
    return "Member";
  }

  if (isTeamRole(value)) {
    return ROLE_LABELS[value];
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}