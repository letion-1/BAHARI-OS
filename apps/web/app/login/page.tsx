import {
  Database,
  ShieldCheck,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand/brand-mark";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;

  const nextPath =
    normalizeNextPath(
      params.next
    );

  const supabase =
    await createClient();

  const { data } =
    await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect(nextPath);
  }

  return (
    <main className="ui-page relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[-20%] size-[34rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] size-[38rem] rounded-full bg-violet-400/[0.08] blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between border-r border-border px-12 py-10 lg:flex xl:px-16">
          <Brand />

          <div className="max-w-xl pb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/55 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl">
              <Waves className="size-3.5" />
              Connected charter operations
            </div>

            <h1 className="mt-7 text-balance text-6xl leading-[0.98] tracking-[0.05em] text-foreground xl:text-7xl">
              Your yachts, availability and inquiries in one calm command deck.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              Sign in to your protected Bahari OS company workspace. Company membership keeps each brokerage&apos;s operational data isolated.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Feature
                icon={Database}
                title="One operating workspace"
                description="Yachts, availability, inquiries and communications stay connected."
              />

              <Feature
                icon={ShieldCheck}
                title="Tenant-isolated data"
                description="Company membership is verified on protected workspace queries."
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70">
            Intrigue Studios · Bahari OS
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <Brand />
            </div>

            <div className="ui-panel rounded-[2rem] p-6 backdrop-blur-xl sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Welcome back
              </p>

              <h2 className="mt-3 text-4xl leading-none tracking-[0.05em] text-foreground">
                Sign in to Bahari OS
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Enter the email and password attached to your Bahari OS account.
              </p>

              <LoginForm
                nextPath={nextPath}
              />

              <div className="mt-5 text-center">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>

              <div className="mt-6 border-t border-border pt-5 text-center">
                <p className="text-xs text-muted-foreground">
                  New brokerage?
                </p>

                <Link
                  href="/sign-up"
                  className="ui-secondary-button mt-3 inline-flex min-h-10 w-full items-center justify-center px-4 text-xs font-semibold"
                >
                  Create a Bahari OS account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={44} priority />

      <div>
        <p className="font-heading text-2xl leading-none tracking-[0.08em] text-foreground">
          Bahari OS
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Charter intelligence workspace
        </p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <Icon className="size-4 text-foreground/75" />

      <p className="mt-4 text-sm font-medium text-foreground">
        {title}
      </p>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function normalizeNextPath(
  value:
    | string
    | string[]
    | undefined
) {
  const candidate =
    Array.isArray(value)
      ? value[0]
      : value;

  if (
    candidate &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/login") &&
    !candidate.startsWith("/sign-up") &&
    !candidate.startsWith("/onboarding")
  ) {
    return candidate;
  }

  return "/";
}