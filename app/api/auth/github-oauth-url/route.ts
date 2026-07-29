import { NextRequest, NextResponse } from "next/server";
import { handleOptions, withCors } from "@/lib/cors";

/**
 * GET /api/auth/github-oauth-url
 *
 * Called by the Chrome extension popup to get the GitHub OAuth authorization
 * URL (with the public client_id pre-filled). The extension passes its own
 * redirect_uri (chrome.identity.getRedirectURL()) as a query param so we can
 * embed it in the returned URL without exposing the client_id in extension code.
 *
 * The client_id is NOT a secret — it's safe to return from the server.
 */
export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return withCors(
      request,
      NextResponse.json({ error: "GITHUB_CLIENT_ID not configured on server" }, { status: 500 })
    );
  }

  const { searchParams } = new URL(request.url);
  const redirectUri = searchParams.get("redirect_uri");
  if (!redirectUri) {
    return withCors(
      request,
      NextResponse.json({ error: "redirect_uri query param is required" }, { status: 400 })
    );
  }

  // Validate it looks like a Chrome extension redirect URI
  if (!redirectUri.startsWith("https://") && !redirectUri.includes("chromiumapp.org")) {
    return withCors(
      request,
      NextResponse.json({ error: "Invalid redirect_uri" }, { status: 400 })
    );
  }

  const state = crypto.randomUUID(); // CSRF protection (extension verifies this)

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        "repo read:user user:email",
    state:        state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return withCors(
    request,
    NextResponse.json({ authUrl, state, clientId })
  );
}
