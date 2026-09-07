"use client";

import { useActionState } from "react";
import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
} from "lucide-react";

import {
  acceptInvitationAction,
  type AcceptInvitationActionState,
} from "@/app/invite/[token]/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const initialState: AcceptInvitationActionState =
  {
    status: "idle",
    message: null,
  };

export function AcceptInvitationForm({
  token,
  email,
  needsPassword,
}: {
  token: string;
  email: string;
  needsPassword: boolean;
}) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    acceptInvitationAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="mt-7 space-y-5"
    >
      <input
        type="hidden"
        name="token"
        value={token}
      />

      <input
        type="hidden"
        name="needsPassword"
        value={String(needsPassword)}
      />

      <div className="ui-panel-soft rounded-2xl p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Signing in as
        </p>

        <p className="mt-2 truncate text-sm font-medium text-foreground">
          {email}
        </p>
      </div>

      {needsPassword ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose a password so you can sign in from now on.
          </p>

          <Field
            id="password"
            name="password"
            label="Password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            disabled={isPending}
          />

          <Field
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            placeholder="Type it again"
            disabled={isPending}
          />
        </>
      ) : null}

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
            Joining
          </>
        ) : (
          <>
            {needsPassword
              ? "Set password and join"
              : "Accept invitation"}
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
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