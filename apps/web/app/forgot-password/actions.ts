"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  clientIdentifier,
} from "@/lib/security/rate-limit";

export type ForgotPasswordActionState = {
  status: "idle" | "error" | "sent";
  message: string | null;
  email?: string;
};

/**
 * Request a password reset email.
 *
 * WHY THE RESPONSE IS THE SAME WHETHER THE ACCOUNT EXISTS OR NOT
 *
 * "No account found with that address" turns this form into a free tool for
 * checking whether a given broker uses Bahari OS. That is commercially useful
 * information to a competitor and it is the first step of a targeted phishing
 * campaign against a named brokerage. Supabase's resetPasswordForEmail
 * already declines to distinguish the two cases; this action does not undo
 * that by inspecting the user list first.
 *
 * The cost is a worse experience for someone who mistypes their address: they
 * wait for an email that never arrives. The message below is worded to make
 * that outcome recoverable rather than mysterious.
 */
export async function requestPasswordReset(
  _previousState: ForgotPasswordActionState,
  formData: FormData
): Promise<ForgotPasswordActionState> {
  const email = readString(formData.get("email")).toLowerCase();

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      email,
    };
  }

  /*
   * Two limits, mirroring the login action.
   *
   * Per address stops one mailbox being flooded with reset emails, which is
   * a harassment vector and a fast way to have the sending domain marked as
   * spam. Per source stops a script walking a list of addresses to farm out
   * reset mail from this domain in bulk.
   */
  const requestHeaders = await headers();

  const source = clientIdentifier(
    new Request("https://internal", { headers: requestHeaders })
  );

  const perAccount = checkRateLimit(`reset:account:${email}`, {
    limit: 3,
    windowSeconds: 900,
  });

  const perSource = checkRateLimit(`reset:source:${source}`, {
    limit: 10,
    windowSeconds: 900,
  });

  if (!perAccount.ok || !perSource.ok) {
    /*
     * Reported as success. A distinct "you have asked too often" reply for a
     * known address and a normal reply for an unknown one would reintroduce
     * exactly the account-existence signal the generic message above exists
     * to remove.
     */
    return sentState(email);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    /*
     * flow=recovery is load-bearing. The callback provisions a brand new
     * company workspace for any arrival it reads as a signup, so a reset link
     * without this parameter would hand someone a second empty brokerage on
     * their way to changing their password.
     */
    redirectTo: `${appOrigin()}/auth/callback?flow=recovery&next=%2Freset-password`,
  });

  if (error) {
    console.error("Password reset request failed:", error.message);

    /*
     * Still reported as sent. The failure here is almost always the project's
     * mail transport or Supabase's own rate limit, neither of which the
     * person filling in this form can act on, and the alternative leaks
     * whether the address resolved.
     */
    return sentState(email);
  }

  return sentState(email);
}

function sentState(email: string): ForgotPasswordActionState {
  return {
    status: "sent",
    message: `If a Bahari OS account exists for ${email}, a password reset link is on its way. It is valid for one hour. Check the spam folder before asking for another, and confirm the address is spelled correctly if nothing arrives.`,
    email,
  };
}

function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}