import { NextRequest, NextResponse } from "next/server";

/**
 * Returns CORS headers that work for credentialed requests from:
 *   - Chrome extensions  (chrome-extension://<id>)
 *   - The web app itself (same-origin, no header needed)
 *   - Localhost dev      (http://localhost:*)
 *
 * The key rule: Access-Control-Allow-Origin must echo the exact request
 * Origin (not "*") when Access-Control-Allow-Credentials is true.
 */
export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";

  const allowed =
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("https://localhost");

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
  };
}

/** Respond to a CORS preflight OPTIONS request. */
export function handleOptions(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Attach CORS headers to an existing NextResponse. */
export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const headers = corsHeaders(request);
  Object.entries(headers).forEach(([k, v]) => {
    if (v) response.headers.set(k, v);
  });
  return response;
}
