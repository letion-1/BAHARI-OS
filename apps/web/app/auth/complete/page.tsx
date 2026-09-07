import { Suspense } from "react";

import { CompleteSessionClient } from "@/app/auth/complete/complete-session-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signing you in · Bahari OS",
};

/**
 * Finishes a sign-in whose tokens arrived in the URL fragment.
 *
 * Supabase can return an auth result in one of three shapes: a PKCE `code`, a
 * `token_hash`, or an implicit-flow fragment such as
 * `#access_token=...&refresh_token=...`.
 *
 * A fragment never reaches the server. The browser strips everything after
 * the `#` before the request is sent, so /auth/callback ran, found neither
 * query parameter, and correctly reported that the link had no authentication
 * code — while the credentials were sitting in the address bar the whole time,
 * invisible to it.
 *
 * That is why an invited colleague clicking their email landed on the signup
 * page. This page exists to read what the server structurally cannot.
 */
export default function AuthCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteSessionClient />
    </Suspense>
  );
}