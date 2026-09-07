import crypto from "node:crypto";
import {
  generateItineraryShareToken,
  hashItineraryShareToken,
} from "@/lib/itinerary/share-token";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_HERO_IMAGE =
  "/proposal-yacht/hero-exterior.png";

type RouteContext = {
  params:
    | Promise<{ id: string }>
    | { id: string };
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await getCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const [
      charterResult,
      itineraryResult,
      shareResult,
    ] = await Promise.all([
      admin
        .from("charters")
        .select(
          "id, reference, client_name, yacht_name, start_date, end_date"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", charterId)
        .maybeSingle(),

      admin
        .from(
          "charter_itineraries"
        )
        .select(
          "id, title, status"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle(),

      admin
        .from(
          "charter_itinerary_shares"
        )
        .select(
          "id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at, created_at, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle(),
    ]);

    if (charterResult.error) {
      throw new Error(
        charterResult.error.message
      );
    }

    if (itineraryResult.error) {
      throw new Error(
        itineraryResult.error.message
      );
    }

    if (shareResult.error) {
      throw new Error(
        shareResult.error.message
      );
    }

    if (!charterResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        charter: {
          id:
            charterResult.data.id,
          reference:
            charterResult.data.reference,
          clientName:
            charterResult.data.client_name,
          yachtName:
            charterResult.data.yacht_name,
          startDate:
            charterResult.data.start_date,
          endDate:
            charterResult.data.end_date,
        },
        itinerary:
          itineraryResult.data
            ? {
                id:
                  itineraryResult.data.id,
                title:
                  itineraryResult.data.title,
                status:
                  itineraryResult.data.status,
              }
            : null,
        share:
          shareResult.data
            ? {
                id:
                  shareResult.data.id,
                /*
                 * A GET reads an existing row, which stores only a hash, so
                 * there is no URL to hand back. hasToken tells the panel to
                 * offer a replacement link rather than a dead copy button.
                 */
                token: null,
                hasToken: false,
                isActive:
                  shareResult.data.is_active,
                publicPath: null,
                heroImageUrl:
                  normalizeHeroImage(
                    shareResult.data.hero_image_url
                  ),
                heroImageSource:
                  shareResult.data.hero_image_url
                    ? "custom"
                    : "placeholder",
                fallbackHeroImage:
                  FALLBACK_HERO_IMAGE,
                publishedAt:
                  shareResult.data.published_at,
                expiresAt:
                  shareResult.data.expires_at,
                viewCount:
                  shareResult.data.view_count,
                lastViewedAt:
                  shareResult.data.last_viewed_at,
                createdAt:
                  shareResult.data.created_at,
                updatedAt:
                  shareResult.data.updated_at,
              }
            : null,
      },
      {
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleError(
      error,
      "Could not load itinerary sharing."
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await getCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const action =
      text(body.action);

    if (!action) {
      return badRequest(
        "A sharing action is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const [
      charterResult,
      itineraryResult,
      shareResult,
    ] = await Promise.all([
      admin
        .from("charters")
        .select(
          "id, reference, yacht_name"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", charterId)
        .maybeSingle(),

      admin
        .from(
          "charter_itineraries"
        )
        .select("id")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle(),

      admin
        .from(
          "charter_itinerary_shares"
        )
        .select(
          "id, is_active, hero_image_url"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle(),
    ]);

    if (charterResult.error) {
      throw new Error(
        charterResult.error.message
      );
    }

    if (itineraryResult.error) {
      throw new Error(
        itineraryResult.error.message
      );
    }

    if (shareResult.error) {
      throw new Error(
        shareResult.error.message
      );
    }

    if (!charterResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    if (!itineraryResult.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Create the charter itinerary before publishing it.",
        },
        { status: 409 }
      );
    }

    const now =
      new Date()
        .toISOString();

    if (
      action === "publish"
    ) {
      const heroImageUrl =
        normalizeHeroImage(
          body.heroImageUrl
        );

      const expiresAt =
        normalizeExpiry(
          body.expiresAt
        );

      if (
        shareResult.data
      ) {
        const result =
          await admin
            .from(
              "charter_itinerary_shares"
            )
            .update({
              is_active: true,
              hero_image_url:
                heroImageUrl ===
                FALLBACK_HERO_IMAGE
                  ? null
                  : heroImageUrl,
              published_at: now,
              expires_at:
                expiresAt,
              updated_at: now,
            })
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq(
              "id",
              shareResult.data.id
            )
            .select(
              "id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at"
            )
            .single();

        if (
          result.error ||
          !result.data
        ) {
          throw new Error(
            result.error
              ?.message ??
              "Could not publish itinerary."
          );
        }

        return successShare(
          result.data
        );
      }

      /*
       * The raw token exists only in this request. It goes into the response
       * once and the database keeps its hash, so nothing can recover it
       * afterwards.
       */
      const token = generateItineraryShareToken();

      const result =
        await admin
          .from(
            "charter_itinerary_shares"
          )
          .insert({
            company_id:
              workspace.companyId,
            charter_id:
              charterId,
            itinerary_id:
              itineraryResult.data.id,
            token_hash:
              hashItineraryShareToken(
                token
              ),
            is_active: true,
            hero_image_url:
              heroImageUrl ===
              FALLBACK_HERO_IMAGE
                ? null
                : heroImageUrl,
            published_at: now,
            expires_at:
              expiresAt,
            created_by:
              workspace.userId,
            created_at: now,
            updated_at: now,
          })
          .select(
            "id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at"
          )
          .single();

      if (
        result.error ||
        !result.data
      ) {
        throw new Error(
          result.error
            ?.message ??
            "Could not publish itinerary."
        );
      }

      return successShare(
        result.data,
        token
      );
    }

    if (
      action ===
      "update_hero"
    ) {
      if (!shareResult.data) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Publish the itinerary before updating its hero image.",
          },
          { status: 409 }
        );
      }

      const heroImageUrl =
        normalizeHeroImage(
          body.heroImageUrl
        );

      const result =
        await admin
          .from(
            "charter_itinerary_shares"
          )
          .update({
            hero_image_url:
              heroImageUrl ===
              FALLBACK_HERO_IMAGE
                ? null
                : heroImageUrl,
            updated_at: now,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "id",
            shareResult.data.id
          )
          .select(
            "id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at"
          )
          .single();

      if (
        result.error ||
        !result.data
      ) {
        throw new Error(
          result.error
            ?.message ??
            "Could not update hero image."
        );
      }

      return successShare(
        result.data
      );
    }

    if (
      action === "rotate"
    ) {
      if (!shareResult.data) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Publish the itinerary before rotating its secure link.",
          },
          { status: 409 }
        );
      }

      /*
       * Rotation issues a new token and invalidates the old one. The raw
       * value is returned once here and never again, so a broker who rotates
       * and closes the panel has to rotate again to get a usable link.
       */
      const rotatedToken =
        generateItineraryShareToken();

      const result =
        await admin
          .from(
            "charter_itinerary_shares"
          )
          .update({
            token_hash:
              hashItineraryShareToken(
                rotatedToken
              ),
            is_active: true,
            published_at: now,
            updated_at: now,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "id",
            shareResult.data.id
          )
          .select(
            "id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at"
          )
          .single();

      if (
        result.error ||
        !result.data
      ) {
        throw new Error(
          result.error
            ?.message ??
            "Could not rotate secure link."
        );
      }

      return successShare(
        result.data,
        rotatedToken
      );
    }

    if (
      action === "revoke"
    ) {
      if (!shareResult.data) {
        return NextResponse.json(
          {
            success: true,
            revoked: true,
          },
          {
            headers:
              noStoreHeaders(),
          }
        );
      }

      const result =
        await admin
          .from(
            "charter_itinerary_shares"
          )
          .update({
            is_active: false,
            updated_at: now,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "id",
            shareResult.data.id
          );

      if (result.error) {
        throw new Error(
          result.error.message
        );
      }

      return NextResponse.json(
        {
          success: true,
          revoked: true,
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    return badRequest(
      "Unsupported sharing action."
    );
  } catch (error) {
    return handleError(
      error,
      "Could not update itinerary sharing."
    );
  }
}

/**
 * Build the share response.
 *
 * `rawToken` is passed only by the two paths that just minted one: creation
 * and rotation. Every other call reads an existing row, which holds a hash
 * and cannot produce a URL.
 *
 * That is the cost of hashing, and it is the same trade the contract link
 * makes: the link is shown once. `hasToken` says which case this is, so the
 * panel can offer a replacement rather than leaving a broker looking at
 * nothing to copy and no explanation.
 */
function successShare(
  row: {
    id: string;
    is_active: boolean;
    hero_image_url: string | null;
    published_at: string;
    expires_at: string | null;
    view_count: number;
    last_viewed_at: string | null;
  },
  rawToken?: string
) {
  return NextResponse.json(
    {
      success: true,
      share: {
        id: row.id,
        token: rawToken ?? null,
        hasToken: Boolean(rawToken),
        isActive:
          row.is_active,
        publicPath: rawToken
          ? `/guest/itinerary/${rawToken}`
          : null,
        heroImageUrl:
          normalizeHeroImage(
            row.hero_image_url
          ),
        heroImageSource:
          row.hero_image_url
            ? "custom"
            : "placeholder",
        fallbackHeroImage:
          FALLBACK_HERO_IMAGE,
        publishedAt:
          row.published_at,
        expiresAt:
          row.expires_at,
        viewCount:
          row.view_count,
        lastViewedAt:
          row.last_viewed_at,
      },
    },
    {
      headers:
        noStoreHeaders(),
    }
  );
}

function normalizeHeroImage(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return FALLBACK_HERO_IMAGE;
  }

  const cleaned =
    value.trim();

  if (!cleaned) {
    return FALLBACK_HERO_IMAGE;
  }

  if (
    cleaned.startsWith("/")
  ) {
    return cleaned;
  }

  try {
    const url =
      new URL(cleaned);

    if (
      url.protocol ===
        "https:" ||
      url.protocol ===
        "http:"
    ) {
      return url.toString();
    }
  } catch {
    return FALLBACK_HERO_IMAGE;
  }

  return FALLBACK_HERO_IMAGE;
}

function normalizeExpiry(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  if (!cleaned) {
    return null;
  }

  const date =
    new Date(cleaned);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function text(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned
    ? cleaned
    : null;
}

async function getCharterId(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return (
    params.id?.trim() ||
    null
  );
}

function noStoreHeaders() {
  return {
    "Cache-Control":
      "private, no-store, max-age=0",
  };
}

function badRequest(
  error: string
) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status: 400 }
  );
}

function handleError(
  error: unknown,
  fallback: string
) {
  if (
    isAuthenticationRequiredError(
      error
    ) ||
    isWorkspaceAccessError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status:
          error.status,
      }
    );
  }

  console.error(
    "Itinerary share API error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : fallback,
    },
    { status: 500 }
  );
}