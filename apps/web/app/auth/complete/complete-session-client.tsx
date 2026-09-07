"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Reads the tokens out of the URL fragment and establishes the session.
 *
 * The fragment survives the server-side redirect that sent us here, because
 * browsers carry it across a 3xx when the destination has none of its own.
 * That is the only reason this two-step works.
 */
export function CompleteSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = searchParams.get("next") || "/";

    /*
     * The leading "#" is dropped before parsing. URLSearchParams treats it as
     * part of the first key otherwise, so access_token would come back as
     * null and the link would look expired rather than misread.
     */
    const fragment = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );

    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    const fragmentError =
      fragment.get("error_description") ?? fragment.get("error");

    if (fragmentError) {
      setError(decodeURIComponent(fragmentError.replace(/\+/g, " ")));
      return;
    }

    if (!accessToken || !refreshToken) {
      setError(
        "This link did not carry a sign-in token. It may have already been used. Ask for a new invitation."
      );
      return;
    }

    const supabase = createClient();

    void supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(
            "The link could not be completed. It may have expired. Ask for a new invitation."
          );
          return;
        }

        /*
         * replace rather than push, so the back button does not return to a
         * URL whose fragment still holds a live access token.
         */
        router.replace(next);
      });
  }, [router, searchParams]);

  return (
    <main className="ui-page flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="font-heading text-xl text-foreground">
              This link could not be opened
            </h1>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {error}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </main>
  );
}