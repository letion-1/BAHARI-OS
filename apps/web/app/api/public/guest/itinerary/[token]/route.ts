import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  hashItineraryShareToken,
  isPlausibleItineraryShareToken,
} from "@/lib/itinerary/share-token";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_HERO_IMAGE =
  "/proposal-yacht/hero-exterior.png";

type RouteContext = {
  params:
    | Promise<{ token: string }>
    | { token: string };
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const params =
      await Promise.resolve(
        context.params
      );

    const token =
      params.token?.trim();

    /*
     * Shape-checked before the query. A probing request for a short or
     * malformed token is answered from the regex rather than the database.
     */
    if (!token || !isPlausibleItineraryShareToken(token)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A secure itinerary token is required.",
        },
        { status: 400 }
      );
    }

    const admin =
      createAdminClient();

    const shareResult =
      await admin
        .from(
          "charter_itinerary_shares"
        )
        .select(
          "id, company_id, charter_id, itinerary_id, is_active, hero_image_url, published_at, expires_at, view_count, last_viewed_at"
        )
        /*
         * Looked up by hash. The plaintext is no longer stored, so this is
         * the only way to resolve a link, and a database copy yields no
         * working tokens.
         */
        .eq("token_hash", hashItineraryShareToken(token))
        .maybeSingle();

    if (shareResult.error) {
      throw new Error(
        shareResult.error.message
      );
    }

    const share =
      shareResult.data;

    if (
      !share ||
      !share.is_active
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This itinerary link is unavailable.",
        },
        { status: 404 }
      );
    }

    if (
      share.expires_at &&
      new Date(
        share.expires_at
      ).getTime() <
        Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This itinerary link has expired.",
        },
        { status: 410 }
      );
    }

    const [
      charterResult,
      itineraryResult,
      daysResult,
      activitiesResult,
      legsResult,
    ] = await Promise.all([
      admin
        .from("charters")
        .select(
          "id, reference, client_name, yacht_name, start_date, end_date, destination, embarkation_port, disembarkation_port, guests"
        )
        .eq(
          "company_id",
          share.company_id
        )
        .eq(
          "id",
          share.charter_id
        )
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
          share.company_id
        )
        .eq(
          "id",
          share.itinerary_id
        )
        .maybeSingle(),

      admin
        .from(
          "charter_itinerary_days"
        )
        .select(
          "id, position, charter_date, title, destination_name, overnight_type, overnight_name, summary, guest_notes, guest_visible"
        )
        .eq(
          "company_id",
          share.company_id
        )
        .eq(
          "itinerary_id",
          share.itinerary_id
        )
        .eq(
          "guest_visible",
          true
        )
        .order(
          "charter_date",
          { ascending: true }
        )
        .order(
          "position",
          { ascending: true }
        ),

      admin
        .from(
          "charter_itinerary_activities"
        )
        .select(
          "id, day_id, position, activity_type, title, start_time, end_time, location, description, status, guest_visible"
        )
        .eq(
          "company_id",
          share.company_id
        )
        .eq(
          "itinerary_id",
          share.itinerary_id
        )
        .eq(
          "guest_visible",
          true
        )
        .neq(
          "status",
          "cancelled"
        )
        .order(
          "position",
          { ascending: true }
        ),

      admin
        .from(
          "charter_itinerary_legs"
        )
        .select(
          "id, position, charter_date, from_name, to_name, distance_nm, departure_time, arrival_time, guest_visible, notes"
        )
        .eq(
          "company_id",
          share.company_id
        )
        .eq(
          "itinerary_id",
          share.itinerary_id
        )
        .eq(
          "guest_visible",
          true
        )
        .order(
          "position",
          { ascending: true }
        ),
    ]);

    for (
      const result of [
        charterResult,
        itineraryResult,
        daysResult,
        activitiesResult,
        legsResult,
      ]
    ) {
      if (result.error) {
        throw new Error(
          result.error.message
        );
      }
    }

    if (
      !charterResult.data ||
      !itineraryResult.data
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This itinerary is no longer available.",
        },
        { status: 404 }
      );
    }

    const days =
      (daysResult.data ??
        []).map(
        (day) => ({
          id: day.id,
          position:
            day.position,
          charterDate:
            day.charter_date,
          title:
            day.title,
          destinationName:
            day.destination_name,
          overnightType:
            day.overnight_type,
          overnightName:
            day.overnight_name,
          summary:
            day.summary,
          guestNotes:
            day.guest_notes,
          activities:
            (
              activitiesResult.data ??
              []
            )
              .filter(
                (activity) =>
                  activity.day_id ===
                  day.id
              )
              .map(
                (activity) => ({
                  id:
                    activity.id,
                  position:
                    activity.position,
                  activityType:
                    activity.activity_type,
                  title:
                    activity.title,
                  startTime:
                    activity.start_time,
                  endTime:
                    activity.end_time,
                  location:
                    activity.location,
                  description:
                    activity.description,
                  status:
                    activity.status,
                })
              ),
          routeLegs:
            (
              legsResult.data ??
              []
            )
              .filter(
                (leg) =>
                  leg.charter_date ===
                  day.charter_date
              )
              .map(
                (leg) => ({
                  id:
                    leg.id,
                  position:
                    leg.position,
                  fromName:
                    leg.from_name,
                  toName:
                    leg.to_name,
                  distanceNm:
                    numberOrNull(
                      leg.distance_nm
                    ),
                  departureTime:
                    leg.departure_time,
                  arrivalTime:
                    leg.arrival_time,
                  notes:
                    leg.notes,
                })
              ),
        })
      );

    const heroImageUrl =
      normalizeHeroImage(
        share.hero_image_url
      );

    await admin
      .from(
        "charter_itinerary_shares"
      )
      .update({
        view_count:
          Number(
            share.view_count ??
            0
          ) + 1,
        last_viewed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        share.id
      );

    return NextResponse.json(
      {
        success: true,
        share: {
          publishedAt:
            share.published_at,
          expiresAt:
            share.expires_at,
        },
        hero: {
          imageUrl:
            heroImageUrl,
          fallbackImageUrl:
            FALLBACK_HERO_IMAGE,
          source:
            share.hero_image_url
              ? "custom"
              : "placeholder",
        },
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
          destination:
            charterResult.data.destination,
          embarkationPort:
            charterResult.data.embarkation_port,
          disembarkationPort:
            charterResult.data.disembarkation_port,
          guests:
            charterResult.data.guests,
        },
        itinerary: {
          id:
            itineraryResult.data.id,
          title:
            itineraryResult.data.title,
          status:
            itineraryResult.data.status,
        },
        days,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Public itinerary API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load itinerary.",
      },
      { status: 500 }
    );
  }
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

function numberOrNull(
  value: unknown
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(
      parsed
    )
      ? parsed
      : null;
  }

  return null;
}