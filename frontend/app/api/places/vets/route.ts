/**
 * app/api/places/vets/route.ts
 *
 * Server-side Next.js API route — finds nearby veterinary clinics using the
 * Google Places API (New) Nearby Search. The GOOGLE_MAPS_KEY environment
 * variable is accessed only here on the server; it is NEVER sent to the browser.
 *
 * Request:  GET /api/places/vets?lat=<number>&lon=<number>
 * Response: { clinics: ClinicResult[] }  on success
 *           { error: string }            on failure
 *
 * This route implements the same radius fallback strategy as the Python
 * find_nearest_vet_clinic ADK tool so the frontend can call it directly when
 * needed without going through the backend WebSocket (e.g. page reload after
 * a CLINICS_FOUND event was received).
 *
 * Billing note: the X-Goog-FieldMask header is set to ONLY the fields used
 * by the ClinicCardRow UI component. Requesting fewer fields reduces billing
 * tier from Enterprise + Atmosphere to Enterprise.
 *
 * FieldMask:
 *   places.displayName
 *   places.formattedAddress
 *   places.nationalPhoneNumber
 *   places.currentOpeningHours
 *   places.googleMapsUri
 *   places.location
 *
 * Place types used: veterinary_care, pet_care (both in Table A, Services)
 *
 * Security: the API key is read from process.env.GOOGLE_MAPS_KEY (server-only)
 * and is never included in the response body or forwarded to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';

const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.currentOpeningHours',
  'places.googleMapsUri',
  'places.location',
].join(',');

const INCLUDED_TYPES = ['veterinary_care', 'pet_care'];
const MAX_RESULT_COUNT = 5;
const RADIUS_FALLBACK_M = [10_000, 25_000, 50_000];

export interface ClinicResult {
  name: string;
  address: string;
  phone: string | null;
  openNow: boolean | null;
  googleMapsUri: string | null;
  lat: number | null;
  lon: number | null;
}

interface PlacesPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
}

interface PlacesNearbyResponse {
  places?: PlacesPlace[];
}

function normalisePlaceToClinic(place: PlacesPlace): ClinicResult {
  return {
    name: place.displayName?.text ?? 'Veterinary Clinic',
    address: place.formattedAddress ?? '',
    phone: place.nationalPhoneNumber ?? null,
    openNow: place.currentOpeningHours?.openNow ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    lat: place.location?.latitude ?? null,
    lon: place.location?.longitude ?? null,
  };
}

async function searchNearby(
  lat: number,
  lon: number,
  radiusM: number,
  apiKey: string,
): Promise<PlacesPlace[]> {
  const body = {
    includedTypes: INCLUDED_TYPES,
    maxResultCount: MAX_RESULT_COUNT,
    rankPreference: 'DISTANCE',
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: radiusM,
      },
    },
  };

  const resp = await fetch(PLACES_NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    // Do not cache — clinic availability changes in real time.
    cache: 'no-store',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places API HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as PlacesNearbyResponse;
  return data.places ?? [];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const latStr = params.get('lat');
  const lonStr = params.get('lon');

  // ── Parameter validation ──────────────────────────────────────────────────
  if (!latStr || !lonStr) {
    return NextResponse.json(
      { error: 'Missing required query parameters: lat, lon' },
      { status: 400 },
    );
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);

  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: 'Invalid lat/lon values' },
      { status: 400 },
    );
  }

  // ── API key — server-side only ────────────────────────────────────────────
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    console.error('[/api/places/vets] GOOGLE_MAPS_KEY environment variable is not set');
    return NextResponse.json(
      { error: 'Places service is not configured' },
      { status: 500 },
    );
  }

  // ── Radius fallback: 10 km → 25 km → 50 km ───────────────────────────────
  let clinics: ClinicResult[] = [];

  for (const radiusM of RADIUS_FALLBACK_M) {
    try {
      const places = await searchNearby(lat, lon, radiusM, apiKey);
      if (places.length > 0) {
        clinics = places.map(normalisePlaceToClinic);
        break;
      }
    } catch (err) {
      console.error(`[/api/places/vets] Error at radius ${radiusM}m:`, err);
      return NextResponse.json(
        { error: 'Failed to reach Places service' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ clinics });
}
