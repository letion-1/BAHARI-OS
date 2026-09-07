import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { AcceptInvitationForm } from "@/app/invite/[token]/accept-invitation-form";
import { BrandMark } from "@/components/brand/brand-mark";
import { createClient } from "@/lib/supabase/server";
import {
  describeInvalidStatus,
  loadInvitationByToken,
} from "@/lib/team/invitations";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/team/roles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Join a workspace · Bahari OS",
};

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Where an invitation link lands.
 *
 * The page requires a session, because /invite/ is not in the proxy's public
 * list. That is deliberate and it is what makes the email check in
 * acceptInvitation meaningful: an invited person who is not signed in is sent
 * to /login?next=/invite/<token> and returns here afterwards, either with the
 * account Supabase created for them or with one they already had.
 */
export default async function InvitePage({
  params,
}: InvitePageProps) {
  const { token } = await params;

  const { status, invitation } =
    await loadInvitationByToken(token);

  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signedInEmail =
    user?.email ?? null;

  const isValid =
    status === "valid" && invitation;

  /*
   * The mismatch is caught here as well as in acceptInvitation, because
   * telling someone which address the invitation was for before they fill in
   * a password is a great deal kinder than after.
   */
  const emailMismatch = Boolean(
    isValid &&
      signedInEmail &&
      signedInEmail
        .trim()
        .toLowerCase() !==
        invitation.email
          .trim()
          .toLowerCase()
  );

  return (
    <main className="ui-page relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-20%] top-[-25%] size-[32rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-15%] size-[34rem] rounded-full bg-violet-400/[0.08] blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-10 flex items-center gap-3">
          <BrandMark
            size={44}
            priority
          />

          <div>
            <p className="font-heading text-2xl leading-none tracking-[0.08em] text-foreground">
              Bahari OS
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Charter intelligence workspace
            </p>
          </div>
        </div>

        <div className="ui-panel rounded-[2rem] p-6 backdrop-blur-xl sm:p-8">
          {!isValid ? (
            <InvitationProblem
              message={describeInvalidStatus(
                status
              )}
            />
          ) : emailMismatch ? (
            <InvitationProblem
              message={`This invitation was sent to ${invitation.email}, but you are signed in as ${signedInEmail}. Sign out and sign back in with the invited address to accept it.`}
            />
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Workspace invitation
              </p>

              <h1 className="mt-3 text-balance text-4xl leading-none tracking-[0.05em] text-foreground">
                Join{" "}
                {invitation.companyName ??
                  "this workspace"}
              </h1>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                You have been invited as{" "}
                <span className="font-medium text-foreground">
                  {ROLE_LABELS[
                    invitation.role
                  ] ??
                    invitation.role}
                </span>
                .
              </p>

              <div className="ui-panel-soft mt-5 rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  What this role can do
                </p>

                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {ROLE_DESCRIPTIONS[
                    invitation.role
                  ] ??
                    "Access to this workspace."}
                </p>
              </div>

              <AcceptInvitationForm
                token={token}
                email={
                  invitation.email
                }
                needsPassword={
                  invitation.requiresPasswordSetup
                }
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function InvitationProblem({
  message,
}: {
  message: string;
}) {
  return (
    <>
      <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="size-5" />
      </div>

      <h1 className="mt-5 text-3xl leading-none tracking-[0.05em] text-foreground">
        This invitation cannot be used
      </h1>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {message}
      </p>

      <Link
        href="/login"
        className="ui-secondary-button mt-7 inline-flex min-h-10 w-full items-center justify-center px-4 text-xs font-semibold"
      >
        Go to sign in
      </Link>
    </>
  );
}