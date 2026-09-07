"use client";

import { useActionState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { login } from "@/app/login/actions";

type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
};

const initialLoginActionState: LoginActionState = {
  status: "idle",
  message: null,
};

export function LoginForm({
  nextPath,
  defaultEmail,
}: {
  nextPath: string;
  /**
   * Prefilled when arriving from an invitation, because the invitation is an
   * offer to one specific address and acceptance is refused if the session
   * belongs to any other. Someone with two mailboxes has no way to know which
   * one was invited unless the form tells them.
   */
  defaultEmail?: string;
}) {
  const [state, formAction, isPending] =
    useActionState(
      login,
      initialLoginActionState
    );

  return (
    <form
      action={formAction}
      className="mt-8 space-y-5"
    >
      <input
        type="hidden"
        name="next"
        value={nextPath}
      />

      <Field
        id="email"
        name="email"
        label="Email address"
        placeholder="you@brokerage.com"
        autoComplete="email"
        type="email"
        inputMode="email"
        icon={Mail}
        disabled={isPending}
        defaultValue={defaultEmail}
        required
      />

      <Field
        id="password"
        name="password"
        label="Password"
        placeholder="Enter your password"
        autoComplete="current-password"
        type="password"
        minLength={6}
        icon={LockKeyhole}
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
        className="ui-primary-button apple-transition inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Signing in
          </>
        ) : (
          <>
            Sign in
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
  autoComplete,
  type = "text",
  inputMode,
  minLength,
  required,
  disabled,
  defaultValue,
  icon: Icon,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  defaultValue?: string;
  type?: string;
  inputMode?:
    | "email"
    | "text"
    | "search"
    | "tel"
    | "url"
    | "numeric"
    | "decimal";
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
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
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="ui-input h-12 pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}