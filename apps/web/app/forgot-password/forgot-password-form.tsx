"use client";

import { useActionState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  Mail,
  MailCheck,
} from "lucide-react";

import {
  requestPasswordReset,
  type ForgotPasswordActionState,
} from "@/app/forgot-password/actions";

const initialState: ForgotPasswordActionState =
  {
    status: "idle",
    message: null,
  };

export function ForgotPasswordForm() {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    requestPasswordReset,
    initialState
  );

  /*
   * On success the form is replaced rather than reset. Leaving the field in
   * place invites a second submission, which the action rate limits and
   * reports as sent anyway, so the person would be told twice that something
   * had happened while nothing did.
   */
  if (state.status === "sent") {
    return (
      <div className="mt-8 space-y-4">
        <div className="ui-panel-soft flex items-start gap-3 rounded-2xl p-4">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />

          <p className="text-sm leading-6 text-muted-foreground">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-8 space-y-5"
    >
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium text-foreground"
        >
          Email address
        </label>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={
              state.email ?? ""
            }
            disabled={isPending}
            placeholder="you@brokerage.com"
            className="ui-input h-12 pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {state.status === "error" &&
      state.message ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
        >
          {state.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="ui-primary-button apple-transition inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Sending link
          </>
        ) : (
          <>
            Send reset link
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}