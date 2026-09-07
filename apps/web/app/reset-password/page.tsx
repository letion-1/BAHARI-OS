import { BrandMark } from "@/components/brand/brand-mark";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set a new password · Bahari OS",
};

/**
 * Where /auth/callback?flow=recovery lands.
 *
 * There is no token in this URL and no session check in this component. The
 * proxy has already required a session to reach the page at all, and the
 * action revalidates it before writing anything.
 */
export default function ResetPasswordPage() {
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
            Set a new password
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Choose a new password for your Bahari OS account. You are already
            signed in on this device.
          </p>

          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}