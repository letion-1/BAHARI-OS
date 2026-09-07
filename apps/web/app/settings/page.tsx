"use client";

import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountDeletionPanel } from "@/components/settings/account-deletion-panel";
import { PasswordPanel } from "@/components/settings/password-panel";

type Account = {
  id: string;
  email: string | null;
  fullName: string;
  roleTitle: string;
  membershipRole: string | null;
  companyId: string | null;
  companyName: string | null;
  memberSince: string | null;
};

type AccountResponse = {
  success: boolean;
  account?: Account;
  error?: string;
};

export default function SettingsPage() {
  const [account, setAccount] =
    useState<Account | null>(null);

  const [fullName, setFullName] =
    useState("");

  const [roleTitle, setRoleTitle] =
    useState("");

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const loadAccount = useCallback(
    async () => {
      setError("");
      setIsLoading(true);

      try {
        const response = await fetch(
          "/api/account",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload =
          (await response.json()) as AccountResponse;

        if (
          !response.ok ||
          !payload.success ||
          !payload.account
        ) {
          throw new Error(
            payload.error ??
              "Could not load account."
          );
        }

        setAccount(payload.account);
        setFullName(
          payload.account.fullName
        );
        setRoleTitle(
          payload.account.roleTitle
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load account."
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const initials = useMemo(
    () => getInitials(fullName),
    [fullName]
  );

  async function saveProfile() {
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/account",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            fullName,
            roleTitle,
          }),
        }
      );

      const payload =
        (await response.json()) as AccountResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ??
            "Could not update account."
        );
      }

      setAccount((current) =>
        current
          ? {
              ...current,
              fullName,
              roleTitle,
            }
          : current
      );

      setSuccess(
        "Your profile has been updated."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update account."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageContainer contentClassName="space-y-8">
      <HeroCard
        eyebrow="Workspace settings"
        title="Settings"
        description="Manage the identity, appearance and account details connected to your Bahari OS workspace."
        actions={
          <div className="flex items-center gap-3">
            <span className="ui-hero-muted text-xs">
              Appearance
            </span>
            <ThemeToggle />
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
          {success}
        </div>
      ) : null}

      {isLoading ? (
        <div className="ui-panel flex min-h-80 items-center justify-center rounded-[28px]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : account ? (
        <>
          <section className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[0.78fr_1.22fr]">
            <div className="ui-panel rounded-[28px] p-6">
              <SectionHeader
                eyebrow="Account"
                title="Profile summary"
                subtitle="The identity shown across your workspace."
              />

              <div className="mt-7 flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-[22px] bg-primary font-heading text-3xl tracking-[0.06em] text-primary-foreground shadow-lg">
                  {initials}
                </div>

                <div className="min-w-0">
                  <p className="truncate font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
                    {account.fullName}
                  </p>

                  <p className="mt-2 text-sm text-muted-foreground">
                    {account.roleTitle}
                  </p>
                </div>
              </div>

              <div className="mt-7 space-y-3">
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={
                    account.email ??
                    "Not available"
                  }
                />

                <InfoRow
                  icon={Building2}
                  label="Workspace"
                  value={
                    account.companyName ??
                    "No company name"
                  }
                />

                <InfoRow
                  icon={ShieldCheck}
                  label="Membership"
                  value={humanize(
                    account.membershipRole ??
                      "member"
                  )}
                />

                <InfoRow
                  icon={CalendarClock}
                  label="Member since"
                  value={formatDate(
                    account.memberSince
                  )}
                />
              </div>
            </div>

            <div className="ui-panel rounded-[28px] p-6">
              <SectionHeader
                eyebrow="Personal details"
                title="Edit profile"
                subtitle="Update the name and professional role displayed in Bahari OS."
              />

              <div className="mt-7 grid gap-5">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Full name
                  </span>

                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      value={fullName}
                      onChange={(event) =>
                        setFullName(
                          event.target.value
                        )
                      }
                      className="ui-input h-12 pl-10 pr-4 text-sm"
                      placeholder="Your full name"
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Role
                  </span>

                  <div className="relative">
                    <BadgeCheck className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      value={roleTitle}
                      onChange={(event) =>
                        setRoleTitle(
                          event.target.value
                        )
                      }
                      className="ui-input h-12 pl-10 pr-4 text-sm"
                      placeholder="Charter Broker"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void saveProfile()
                  }
                  disabled={isSaving}
                  className="ui-primary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start"
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}

                  {isSaving
                    ? "Saving..."
                    : "Save profile"}
                </button>
              </div>
            </div>
          </section>

          <section className="ui-panel rounded-[28px] p-6">
            <SectionHeader
              eyebrow="Workspace"
              title="Account identifiers"
              subtitle="Read-only identifiers used by Supabase and Bahari OS."
            />

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <ReadOnlyField
                label="User ID"
                value={account.id}
              />

              <ReadOnlyField
                label="Company ID"
                value={
                  account.companyId ??
                  "Not assigned"
                }
              />

              <ReadOnlyField
                label="Company"
                value={
                  account.companyName ??
                  "Not assigned"
                }
              />

              <ReadOnlyField
                label="Access level"
                value={humanize(
                  account.membershipRole ??
                    "member"
                )}
              />
            </div>
          </section>

          <PasswordPanel />

          {/*
            Last on the page, deliberately. Nothing should sit below the
            control that erases the workspace, and nobody should meet it on
            the way to changing their display name.
          */}
          <AccountDeletionPanel
            workspaceName={account.companyName ?? "this workspace"}
            isOwner={account.membershipRole === "owner"}
          />
        </>
      ) : null}
    </PageContainer>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft flex items-center gap-3 rounded-2xl p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>

        <p className="mt-1 truncate text-sm font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 break-all text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "YO";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(date);
}