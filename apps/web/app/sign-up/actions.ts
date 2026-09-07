"use server";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describePasswordProblem } from "@/lib/auth/password-policy";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

export type SignUpActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  email?: string;
  fieldErrors?: Record<string, string>;
};

export async function signUp(
  _previousState: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const companyName = readString(
    formData.get("companyName")
  );

  const email = readString(
    formData.get("email")
  ).toLowerCase();

  const password = readString(
    formData.get("password")
  );

  const confirmPassword = readString(
    formData.get("confirmPassword")
  );

  const fieldErrors: Record<
    string,
    string
  > = {};

  if (companyName.length < 2) {
    fieldErrors.companyName =
      "Enter your company or brokerage name.";
  }

  if (!isValidEmail(email)) {
    fieldErrors.email =
      "Enter a valid work email address.";
  }

  /*
   * Delegated to the shared policy rather than an inline length check.
   *
   * Signup used to ask for 8 characters while the reset and change-password
   * paths ask for 10. That mismatch is invisible until the day someone tries
   * to change the password they signed up with and is told it is too short,
   * with nothing on screen explaining why the rule moved.
   *
   * Login is deliberately left alone: it validates a password that already
   * exists, and raising its floor would lock out every account created under
   * the old rule.
   */
  const passwordProblem =
    describePasswordProblem(password);

  if (passwordProblem) {
    fieldErrors.password =
      passwordProblem;
  }

  if (password !== confirmPassword) {
    fieldErrors.confirmPassword =
      "The passwords do not match.";
  }

  if (
    Object.keys(fieldErrors).length >
    0
  ) {
    return {
      status: "error",
      message:
        "Check the highlighted account details.",
      fieldErrors,
    };
  }

  const existingUser =
    await findAuthUserByEmail(email);

  if (existingUser) {
    const isConfirmed =
      Boolean(
        existingUser.email_confirmed_at
      ) ||
      Boolean(
        existingUser.confirmed_at
      );

    return {
      status: "error",
      message: isConfirmed
        ? "A Bahari OS account already exists with this email. Sign in instead."
        : "An account already exists with this email and is waiting for email confirmation. Open the latest confirmation email before signing in.",
      fieldErrors: {
        email: isConfirmed
          ? "Account already exists."
          : "Confirmation is still pending.",
      },
    };
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          pending_company_name:
            companyName,
          signup_source:
            "self_service",
        },
      },
    });

  if (error) {
    console.error(
      "Bahari OS signup failed:",
      error.message
    );

    const normalizedMessage =
      error.message.toLowerCase();

    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many signup attempts. Wait a moment and try again."
          : normalizedMessage.includes(
                "already registered"
              ) ||
              normalizedMessage.includes(
                "already exists"
              )
            ? "A Bahari OS account already exists with this email. Sign in instead."
            : "Bahari OS could not create the account. Check the details and try again.",
    };
  }

  if (data.user && data.session) {
    await provisionWorkspaceForUser({
      userId: data.user.id,
      email:
        data.user.email ?? email,
      companyName,
    });

    redirect(
      "/onboarding?next=%2F"
    );
  }

  return {
    status: "success",
    message:
      "Check your inbox and confirm your email address to finish creating your Bahari OS workspace.",
    email,
  };
}

async function findAuthUserByEmail(
  email: string
): Promise<User | null> {
  const admin =
    createAdminClient();

  const target =
    email.trim().toLowerCase();

  const perPage = 1000;
  let page = 1;

  while (page <= 100) {
    const {
      data,
      error,
    } =
      await admin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (error) {
      console.error(
        "Could not inspect existing Supabase Auth users:",
        error.message
      );

      return null;
    }

    const found =
      data.users.find(
        (user) =>
          user.email
            ?.trim()
            .toLowerCase() === target
      );

    if (found) {
      return found;
    }

    if (
      data.users.length < perPage
    ) {
      return null;
    }

    page += 1;
  }

  return null;
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isValidEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}