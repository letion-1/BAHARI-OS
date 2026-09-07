"use client";

import {
  Check,
  Copy,
  Loader2,
  Mail,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import {
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  canAssignRole,
  humanizeRole,
  type InvitableRole,
  type TeamRole,
} from "@/lib/team/roles";

type Member = {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  email: string | null;
  fullName: string | null;
  lastSignInAt: string | null;
  isSelf: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  requiresPasswordSetup: boolean;
};

type TeamResponse = {
  success: boolean;
  error?: string;
  viewer?: {
    userId: string;
    membershipId: string;
    role: string;
  };
  members?: Member[];
  invitations?: Invitation[];
};

type InviteResponse = {
  success: boolean;
  error?: string;
  message?: string;
  delivery?: "email" | "manual";
  inviteUrl?: string;
};

export function TeamManager() {
  const [viewerRole, setViewerRole] =
    useState<string>("");

  const [members, setMembers] =
    useState<Member[]>([]);

  const [invitations, setInvitations] =
    useState<Invitation[]>([]);

  const [inviteEmail, setInviteEmail] =
    useState("");

  const [inviteRole, setInviteRole] =
    useState<InvitableRole>("broker");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isInviting, setIsInviting] =
    useState(false);

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [manualLink, setManualLink] =
    useState<string | null>(null);

  const [isCopied, setIsCopied] =
    useState(false);

  const load = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(
        "/api/team",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload =
        (await response.json()) as TeamResponse;

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not load the team."
        );
      }

      setViewerRole(
        payload.viewer?.role ?? ""
      );

      setMembers(
        payload.members ?? []
      );

      setInvitations(
        payload.invitations ?? []
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load the team."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvitation() {
    setError("");
    setNotice("");
    setManualLink(null);
    setIsCopied(false);
    setIsInviting(true);

    try {
      const response = await fetch(
        "/api/team/invitations",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email: inviteEmail,
            role: inviteRole,
          }),
        }
      );

      const payload =
        (await response.json()) as InviteResponse;

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not send the invitation."
        );
      }

      setNotice(
        payload.message ??
          "Invitation sent."
      );

      /*
       * The link is shown for the manual path only. On the emailed path the
       * API returns it too, but putting a working invitation URL on screen
       * every time invites it being pasted into a group chat, which is the
       * one way this token gets somewhere it should not.
       */
      if (
        payload.delivery === "manual" &&
        payload.inviteUrl
      ) {
        setManualLink(
          payload.inviteUrl
        );
      }

      setInviteEmail("");

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send the invitation."
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function changeRole(
    member: Member,
    nextRole: TeamRole
  ) {
    setError("");
    setNotice("");
    setBusyId(member.id);

    try {
      const response = await fetch(
        `/api/team/members/${member.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            role: nextRole,
          }),
        }
      );

      const payload =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not change the role."
        );
      }

      setNotice(
        `${
          member.fullName ??
          member.email ??
          "That member"
        } is now ${
          ROLE_LABELS[nextRole]
        }.`
      );

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not change the role."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(
    member: Member
  ) {
    const label =
      member.fullName ??
      member.email ??
      "this member";

    if (
      !window.confirm(
        `Remove ${label} from the workspace? They keep their Bahari OS account and anything they authored stays, but they lose all access to this company's data.`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setBusyId(member.id);

    try {
      const response = await fetch(
        `/api/team/members/${member.id}`,
        { method: "DELETE" }
      );

      const payload =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not remove the member."
        );
      }

      setNotice(
        `${label} has been removed from the workspace.`
      );

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not remove the member."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function withdrawInvitation(
    invitation: Invitation
  ) {
    setError("");
    setNotice("");
    setBusyId(invitation.id);

    try {
      const response = await fetch(
        `/api/team/invitations?id=${encodeURIComponent(
          invitation.id
        )}`,
        { method: "DELETE" }
      );

      const payload =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not withdraw the invitation."
        );
      }

      setNotice(
        `The invitation to ${invitation.email} has been withdrawn.`
      );

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not withdraw the invitation."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyManualLink() {
    if (!manualLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        manualLink
      );

      setIsCopied(true);

      window.setTimeout(
        () => setIsCopied(false),
        2500
      );
    } catch {
      setError(
        "Could not copy the link. Select it and copy manually."
      );
    }
  }

  const availableRoles =
    INVITABLE_ROLES.filter((role) =>
      canAssignRole(viewerRole, role)
    );

  return (
    <PageContainer contentClassName="space-y-8">
      <HeroCard
        eyebrow="Workspace"
        title="Team"
        description="Who can reach this brokerage's yachts, clients and charter pricing, and what each of them may do."
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      {manualLink ? (
        <div className="ui-panel rounded-[28px] p-6">
          <SectionHeader
            eyebrow="Send this link"
            title="No email was sent"
            subtitle="This address already has a Bahari OS account, so Supabase would not send an invitation email. Pass this link on however you normally reach them. It expires in seven days and works once."
          />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              readOnly
              value={manualLink}
              onFocus={(event) =>
                event.target.select()
              }
              className="ui-input h-12 flex-1 px-4 font-mono text-xs"
            />

            <button
              type="button"
              onClick={() =>
                void copyManualLink()
              }
              className="ui-secondary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold"
            >
              {isCopied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}

              {isCopied
                ? "Copied"
                : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}

      <section className="ui-panel rounded-[28px] p-6">
        <SectionHeader
          eyebrow="Add someone"
          title="Invite a colleague"
          subtitle="They receive a link, set their own password, and join this workspace. Nobody else ever knows their password."
        />

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Email address
            </span>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <input
                type="email"
                inputMode="email"
                value={inviteEmail}
                onChange={(event) =>
                  setInviteEmail(
                    event.target.value
                  )
                }
                disabled={isInviting}
                placeholder="captain@brokerage.com"
                className="ui-input h-12 pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Role
            </span>

            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(
                  event.target
                    .value as InvitableRole
                )
              }
              disabled={isInviting}
              className="ui-input h-12 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {availableRoles.map(
                (role) => (
                  <option
                    key={role}
                    value={role}
                  >
                    {ROLE_LABELS[role]}
                  </option>
                )
              )}
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              void sendInvitation()
            }
            disabled={
              isInviting ||
              inviteEmail.trim()
                .length === 0
            }
            className="ui-primary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInviting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MailPlus className="size-4" />
            )}

            {isInviting
              ? "Sending..."
              : "Send invitation"}
          </button>
        </div>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {ROLE_DESCRIPTIONS[
            inviteRole
          ] ?? ""}
        </p>
      </section>

      {isLoading ? (
        <div className="ui-panel flex min-h-64 items-center justify-center rounded-[28px]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {invitations.length > 0 ? (
            <section className="ui-panel rounded-[28px] p-6">
              <SectionHeader
                eyebrow="Waiting"
                title="Pending invitations"
                subtitle="Nobody here has access yet. An invitation grants nothing until it is accepted."
              />

              <div className="mt-7 space-y-3">
                {invitations.map(
                  (invitation) => (
                    <div
                      key={
                        invitation.id
                      }
                      className="ui-panel-soft flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {
                            invitation.email
                          }
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {humanizeRole(
                            invitation.role
                          )}
                          {" · "}
                          {invitation.isExpired
                            ? "Expired"
                            : `Expires ${formatDate(
                                invitation.expiresAt
                              )}`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void withdrawInvitation(
                            invitation
                          )
                        }
                        disabled={
                          busyId ===
                          invitation.id
                        }
                        className="ui-secondary-button apple-transition inline-flex h-9 items-center justify-center gap-2 px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyId ===
                        invitation.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <X className="size-3.5" />
                        )}
                        Withdraw
                      </button>
                    </div>
                  )
                )}
              </div>
            </section>
          ) : null}

          <section className="ui-panel rounded-[28px] p-6">
            <SectionHeader
              eyebrow="Access"
              title={`Members (${members.length})`}
              subtitle="Everyone who can sign in to this workspace."
            />

            <div className="mt-7 space-y-3">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  viewerRole={
                    viewerRole
                  }
                  isBusy={
                    busyId === member.id
                  }
                  onChangeRole={
                    changeRole
                  }
                  onRemove={
                    removeMember
                  }
                />
              ))}
            </div>
          </section>
        </>
      )}
    </PageContainer>
  );
}

function MemberRow({
  member,
  viewerRole,
  isBusy,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  viewerRole: string;
  isBusy: boolean;
  onChangeRole: (
    member: Member,
    role: TeamRole
  ) => Promise<void>;
  onRemove: (
    member: Member
  ) => Promise<void>;
}) {
  /*
   * Mirrors the route's rules so the UI does not offer actions that will be
   * refused. The route is still the authority: these checks are courtesy, not
   * security, and every one of them is repeated server-side.
   */
  const isOwnerRow =
    member.role === "owner";

  const canEdit =
    !member.isSelf &&
    !isOwnerRow &&
    (member.role !== "admin" ||
      viewerRole === "owner");

  const roleOptions =
    INVITABLE_ROLES.filter((role) =>
      canAssignRole(viewerRole, role)
    );

  return (
    <div className="ui-panel-soft flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {isOwnerRow ? (
            <ShieldCheck className="size-4" />
          ) : (
            <UserRound className="size-4" />
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {member.fullName ??
              member.email ??
              "Unknown member"}

            {member.isSelf ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                you
              </span>
            ) : null}
          </p>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {member.email ??
              "No email on record"}
            {" · joined "}
            {formatDate(
              member.joinedAt
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canEdit ? (
          <select
            value={member.role}
            onChange={(event) =>
              void onChangeRole(
                member,
                event.target
                  .value as TeamRole
              )
            }
            disabled={isBusy}
            className="ui-input h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/*
              The member's current role is included even when it is not one the
              viewer could assign, so the select shows the truth rather than
              silently displaying someone as something they are not.
            */}
            {!roleOptions.includes(
              member.role as InvitableRole
            ) ? (
              <option
                value={member.role}
              >
                {humanizeRole(
                  member.role
                )}
              </option>
            ) : null}

            {roleOptions.map(
              (role) => (
                <option
                  key={role}
                  value={role}
                >
                  {ROLE_LABELS[role]}
                </option>
              )
            )}
          </select>
        ) : (
          <span className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {humanizeRole(member.role)}
          </span>
        )}

        {canEdit ? (
          <button
            type="button"
            onClick={() =>
              void onRemove(member)
            }
            disabled={isBusy}
            aria-label={`Remove ${
              member.fullName ??
              member.email ??
              "member"
            }`}
            className="apple-transition inline-flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-red-300"
          >
            {isBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}