"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { acceptInvitation } from "@/lib/team/invitations";
import { createClient } from "@/lib/supabase/server";
import { describePasswordProblem } from "@/lib/auth/password-policy";
import { getActiveCompanyCookieName } from "@/lib/workspace/get-current-workspace";

export type AcceptInvitationActionState =
  {
    status: "idle" | "error";
    message: string | null;
  };

/**
 * Join the workspace an invitation points at.
 *
 * ORDER OF OPERATIONS
 *
 * The password, when one is being set, is written before the membership. An
 * invited user arrives with a Supabase session and no password at all: if the
 * membership were created first and the password write then failed, they
 * would be a member of the workspace with no way to sign in again once the
 * invitation session lapsed, and no way to recover except a reset link for a
 * password that was never set.
 *
 * Failing in the other order leaves them with a working password and an
 * invitation still open, which they can accept by opening the same link
 * again.
 */
export async function acceptInvitationAction(
  _previousState: AcceptInvitationActionState,
  formData: FormData
): Promise<AcceptInvitationActionState> {
  const token = readString(
    formData.get("token")
  );

  const needsPassword =
    readString(
      formData.get("needsPassword")
    ) === "true";

  const password = readString(
    formData.get("password")
  );

  const confirmPassword = readString(
    formData.get("confirmPassword")
  );

  if (!token) {
    return {
      status: "error",
      message:
        "This invitation link is not valid. Ask for a new one.",
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
        "Your session has expired. Sign in again to accept this invitation.",
    };
  }

  if (needsPassword) {
    const problem =
      describePasswordProblem(
        password
      );

    if (problem) {
      return {
        status: "error",
        message: problem,
      };
    }

    if (
      password !== confirmPassword
    ) {
      return {
        status: "error",
        message:
          "The passwords do not match.",
      };
    }

    const { error: passwordError } =
      await supabase.auth.updateUser({
        password,
      });

    if (passwordError) {
      console.error(
        "Could not set password for invited user:",
        passwordError.message
      );

      return {
        status: "error",
        message:
          passwordError.message ||
          "Your password could not be set. Try again.",
      };
    }
  }

  const result =
    await acceptInvitation({
      token,
      userId: user.id,
      userEmail: user.email ?? null,
    });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  /*
   * Point the workspace switcher at the company just joined.
   *
   * getCurrentWorkspace falls back to the oldest membership when this cookie
   * is absent, so without it a broker who already belongs to another
   * brokerage would accept an invitation and land in the wrong workspace,
   * with no visible sign that anything had happened.
   *
   * The cookie grants nothing on its own. getCurrentWorkspace still requires
   * a matching company_members row, and RLS enforces the same boundary again.
   */
  const cookieStore = await cookies();

  cookieStore.set(
    getActiveCompanyCookieName(),
    result.companyId,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    }
  );

  redirect("/");
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}