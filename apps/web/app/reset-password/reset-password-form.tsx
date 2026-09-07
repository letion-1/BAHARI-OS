"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
} from "lucide-react";

import {
  resetPassword,
  type ResetPasswordActionState,
} from "@/app/reset-password/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const initialState: ResetPasswordActionState =
  {
    status: "idle",
    message: null,
  };

export function ResetPasswordForm() {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    resetPassword,
    initialState
  );

  if (state.status === "done") {
    return (
      <div className="mt-8 space-y-5">
        <div className="ui-panel-soft flex items-start gap-3 rounded-2xl p-4">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />

          <p className="text-sm leading-6 text-muted-foreground">
            {state.message}
          </p>
        </div>

        <Link
          href="/"
          className="ui-primary-button apple-transition inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
        >
          Go to your workspace
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-8 space-y-5"
    >
      <Field
        id="password"
        name="password"
        label="New password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        disabled={isPending}
      />

      <Field
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        placeholder="Type it again"
        disabled={isPending}
      />

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
            Saving
          </>
        ) : (
          <>
            Save new password
            <ArrowRight className="size-4" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Link stopped working?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new one
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  placeholder,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          id={id}
          name={name}
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          disabled={disabled}
          placeholder={placeholder}
          className="ui-input h-12 pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}