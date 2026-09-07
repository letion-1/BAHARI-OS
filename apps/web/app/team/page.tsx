import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { TeamManager } from "@/components/team/team-manager";
import { canManageTeam } from "@/lib/team/roles";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team · Bahari OS",
};

/**
 * Gated twice on purpose.
 *
 * This check keeps a broker from loading a page whose every control would be
 * refused, which is a better experience than a screen of errors. It is not
 * the security boundary: /api/team and /api/team/members both resolve the
 * caller's workspace and check the role again, because a page component
 * cannot stop a direct request to the API.
 */
export default async function TeamPage() {
  let role: string | null = null;

  try {
    const workspace =
      await getCurrentWorkspace();

    role = workspace.role;
  } catch (error) {
    if (
      !isWorkspaceAccessError(error)
    ) {
      throw error;
    }

    role = null;
  }

  if (!role || !canManageTeam(role)) {
    return (
      <PageContainer contentClassName="space-y-8">
        <HeroCard
          eyebrow="Workspace"
          title="Team"
          description="Managing who can reach this workspace is limited to owners and admins."
        />

        <section className="ui-panel rounded-[28px] p-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-5" />
          </div>

          <h2 className="mt-5 text-2xl leading-none tracking-[0.05em] text-foreground">
            You do not manage this team
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            Inviting colleagues, changing roles and removing access are owner
            and admin actions. Ask whoever set up this workspace if you need
            somebody added.
          </p>

          <Link
            href="/settings"
            className="ui-secondary-button mt-7 inline-flex min-h-10 items-center justify-center px-5 text-xs font-semibold"
          >
            Back to settings
          </Link>
        </section>
      </PageContainer>
    );
  }

  return <TeamManager />;
}