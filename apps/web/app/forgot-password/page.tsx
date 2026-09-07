import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset your password · Bahari OS",
};

/**
 * Deliberately reachable without a session, and listed in the proxy's public
 * routes for that reason: the entire audience for this page is people who
 * cannot sign in.
 */
export default function ForgotPasswordPage() {
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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Account recovery
          </p>

          <h1 className="mt-3 text-4xl leading-none tracking-[0.05em] text-foreground">
            Reset your password
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Enter the email address on your Bahari OS account and we will send
            a link for setting a new password.
          </p>

          <ForgotPasswordForm />

          <div className="mt-6 border-t border-border pt-5">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}