import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { describePasswordProblem } from "@/lib/auth/password-policy";

/**
 * Change the password of the signed-in account.
 *
 * WHY THE CURRENT PASSWORD IS REQUIRED
 *
 * supabase.auth.updateUser({ password }) does not ask for it: a live session
 * is enough. That is the wrong trade for this product. Sessions on this
 * platform are long-lived and brokers work from shared office machines and
 * phones, so an unattended session is a realistic way in. Without a
 * re-authentication step, anyone reaching an open laptop can silently take
 * permanent ownership of the account by changing its password, and the
 * genuine owner is locked out of a workspace holding their client list.
 *
 * Requiring the current password means the attacker has to know something,
 * not merely be standing somewhere.
 *
 * Verified by attempting a sign-in with it. Supabase exposes no "check this
 * password" call, and signInWithPassword against the user's own email is the
 * standard way to do this. It issues a fresh session for the same user, which
 * is harmless.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    /*
     * Keyed on the user, not the address, because this endpoint needs a
     * session to reach at all. It limits how fast the current password can be
     * guessed by someone who found an open session.
     */
    const limit = checkRateLimit(`password:change:${user.id}`, {
      limit: 5,
      windowSeconds: 900,
    });

    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many attempts. Wait ${Math.ceil(
            limit.retryAfterSeconds / 60
          )} minutes and try again.`,
        },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      confirmPassword?: unknown;
    };

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";

    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword) {
      return bad("Enter your current password.");
    }

    const problem = describePasswordProblem(newPassword);

    if (problem) {
      return bad(problem);
    }

    if (newPassword !== confirmPassword) {
      return bad("The new passwords do not match.");
    }

    if (newPassword === currentPassword) {
      return bad("The new password must be different from the current one.");
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      return bad("Your current password is incorrect.", 403);
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      /*
       * Supabase enforces its own password rules on the project, which may be
       * stricter than this application's. Its message is surfaced rather than
       * replaced, because "password is too weak" is actionable and a generic
       * failure is not.
       */
      return bad(
        updateError.message || "The password could not be changed.",
        400
      );
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been changed.",
    });
  } catch (error) {
    console.error("Password change error:", error);

    return NextResponse.json(
      { success: false, error: "Could not change the password." },
      { status: 500 }
    );
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}