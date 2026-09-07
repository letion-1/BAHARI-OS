"use server";

import { createClient } from "@/lib/supabase/server";
import { describePasswordProblem } from "@/lib/auth/password-policy";

export type ResetPasswordActionState = {
  status: "idle" | "error" | "done";
  message: string | null;
};

/**
 * Set a new password using the session created by a recovery link.
 *
 * WHY NO CURRENT PASSWORD IS ASKED FOR HERE
 *
 * /api/account/password demands one, because a live session on an unattended
 * machine should not be enough to change it. This path is the opposite case
 * by definition: the person is here because they do not know the current
 * password, and what stands in for it is control of the mailbox, which
 * Supabase verified before issuing this session.
 *
 * WHY THE SESSION IS RE-READ RATHER THAN TRUSTED
 *
 * /reset-password is not in the proxy's public list, so arriving without a
 * session lands on /login instead. That is the desired behaviour and it is
 * why this page needs no token of its own: the recovery session established
 * by /auth/callback?flow=recovery is the credential.
 *
 * The check is still made here. The proxy runs before the page renders, and a
 * recovery session lasts an hour: a form left open past that point submits
 * against an expired session, and getUser() verifies with Supabase rather
 * than trusting the cookie that is still sitting in the browser.
 */
export async function resetPassword(
  _previousState: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> {
  const password = readString(
    formData.get("password")
  );

  const confirmPassword = readString(
    formData.get("confirmPassword")
  );

  const problem =
    describePasswordProblem(password);

  if (problem) {
    return {
      status: "error",
      message: problem,
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message:
        "The passwords do not match.",
    };
  }

  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: "error",
      message:
        "This reset link has expired or has already been used. Request a new one from the sign-in page.",
    };
  }

  const { error: updateError } =
    await supabase.auth.updateUser({
      password,
    });

  if (updateError) {
    console.error(
      "Password reset failed:",
      updateError.message
    );

    /*
     * Supabase's project-level password policy may be stricter than
     * describePasswordProblem, and its rejection explains what is wrong. A
     * generic replacement would leave the person guessing.
     */
    return {
      status: "error",
      message:
        updateError.message ||
        "The password could not be changed. Request a new reset link and try again.",
    };
  }

  return {
    status: "done",
    message:
      "Your password has been changed. You are signed in and can carry on.",
  };
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value
    : "";
}