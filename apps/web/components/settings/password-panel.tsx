"use client";

import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { SectionHeader } from "@/components/ui/section-header";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

type PasswordResponse = {
  success: boolean;
  message?: string;
  error?: string;
};

/**
 * Changing the password of the signed-in account.
 *
 * The current password is asked for because /api/account/password requires
 * it, and it requires it because a live session on an unattended laptop
 * should not be enough to take permanent ownership of a workspace.
 *
 * Validation here is a courtesy that saves a round trip. The route revalidates
 * everything independently, and Supabase's own project policy applies on top
 * of both, so a password accepted by this component can still be refused with
 * a message worth reading.
 */
export function PasswordPanel() {
  const [currentPassword, setCurrentPassword] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [isRevealed, setIsRevealed] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >=
      MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    !isSaving;

  async function changePassword() {
    setError("");
    setSuccess("");

    if (
      newPassword !== confirmPassword
    ) {
      setError(
        "The new passwords do not match."
      );

      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/account/password",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        }
      );

      const payload =
        (await response.json()) as PasswordResponse;

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not change the password."
        );
      }

      setSuccess(
        payload.message ??
          "Your password has been changed."
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not change the password."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="ui-panel rounded-[28px] p-6">
      <SectionHeader
        eyebrow="Security"
        title="Change password"
        subtitle="Your current password is required, so an open session alone cannot lock you out of your own workspace."
      />

      <div className="mt-7 grid max-w-xl gap-5">
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          placeholder="Your current password"
          isRevealed={isRevealed}
          disabled={isSaving}
        />

        <div className="ui-panel-soft rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

            <p className="text-xs leading-5 text-muted-foreground">
              Use at least{" "}
              {MIN_PASSWORD_LENGTH}{" "}
              characters. Length matters
              more than symbols, so a
              short phrase you can
              remember beats a scrambled
              word you cannot.
            </p>
          </div>
        </div>

        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          placeholder="Your new password"
          isRevealed={isRevealed}
          disabled={isSaving}
        />

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Type it again"
          isRevealed={isRevealed}
          disabled={isSaving}
        />

        <button
          type="button"
          onClick={() =>
            setIsRevealed(
              (current) => !current
            )
          }
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:justify-self-start"
        >
          {isRevealed ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}

          {isRevealed
            ? "Hide passwords"
            : "Show passwords"}
        </button>

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
            {success}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() =>
            void changePassword()
          }
          disabled={!canSubmit}
          className="ui-primary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}

          {isSaving
            ? "Changing..."
            : "Change password"}
        </button>
      </div>
    </section>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  isRevealed,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  isRevealed: boolean;
  disabled: boolean;
}) {
  return (
    <label
      className="space-y-2"
      htmlFor={id}
    >
      <span className="text-sm font-medium text-foreground">
        {label}
      </span>

      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          id={id}
          type={
            isRevealed
              ? "text"
              : "password"
          }
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          className="ui-input h-12 pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </label>
  );
}