"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useActionState } from "react";

import {
  signUp,
  type SignUpActionState,
} from "@/app/sign-up/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const initialState: SignUpActionState = {
  status: "idle",
  message: null,
};

export function SignUpForm() {
  const [state, formAction, isPending] =
    useActionState(
      signUp,
      initialState
    );

  if (state.status === "success") {
    return (
      <div className="mt-8 rounded-[22px] border border-emerald-500/25 bg-emerald-500/10 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
            <CheckCircle2 className="size-5 text-emerald-700 dark:text-emerald-200" />
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">
              Verify your email
            </p>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {state.message}
            </p>

            {state.email ? (
              <p className="mt-3 break-all text-xs font-semibold text-foreground">
                {state.email}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-5 border-t border-emerald-500/15 pt-4 text-xs leading-5 text-muted-foreground">
          After confirmation, Bahari OS will create the company workspace, make this account its owner and open first-time onboarding.
        </p>

        <Link
          href="/login"
          className="ui-secondary-button mt-4 inline-flex min-h-10 w-full items-center justify-center px-4 text-xs font-semibold"
        >
          Back to sign in
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
        id="companyName"
        name="companyName"
        label="Company or brokerage"
        placeholder="Pacific Charter Group"
        autoComplete="organization"
        icon={Building2}
        error={
          state.fieldErrors?.companyName
        }
        disabled={isPending}
        required
      />

      <Field
        id="email"
        name="email"
        label="Work email"
        placeholder="you@brokerage.com"
        autoComplete="email"
        type="email"
        inputMode="email"
        icon={Mail}
        error={
          state.fieldErrors?.email
        }
        disabled={isPending}
        required
      />

      <Field
        id="password"
        name="password"
        label="Create password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete="new-password"
        type="password"
        minLength={MIN_PASSWORD_LENGTH}
        icon={LockKeyhole}
        error={
          state.fieldErrors?.password
        }
        disabled={isPending}
        required
      />

      <Field
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        placeholder="Repeat your password"
        autoComplete="new-password"
        type="password"
        minLength={MIN_PASSWORD_LENGTH}
        icon={LockKeyhole}
        error={
          state.fieldErrors
            ?.confirmPassword
        }
        disabled={isPending}
        required
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
        className="ui-primary-button apple-transition inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Creating account
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="size-4" />
          </>
        )}
      </button>

      <p className="text-center text-xs leading-5 text-muted-foreground">
        Already have a Bahari OS account?{" "}
        <Link
          href="/login"
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Sign in
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
  autoComplete,
  type = "text",
  inputMode,
  minLength,
  required,
  disabled,
  error,
  icon: Icon,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  type?: string;
  inputMode?:
    | "email"
    | "text";
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  icon: typeof Mail;
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
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          id={id}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="ui-input h-12 w-full pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}