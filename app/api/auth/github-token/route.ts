import { NextRequest, NextResponse } from "next/server";
import { handleOptions, withCors } from "@/lib/cors";

/**
 * POST /api/auth/github-token
 *
 * Accepts the OAuth authorization `code` from the Chrome extension and
 * exchanges it for a GitHub access token using the server-side client_secret.
 *
 * The client_secret MUST stay server-side — never put it in extension code.
 *
 * Body: { code: string; redirectUri: string }
 * Returns: { accessToken: string; tokenType: string; scope: string }
 */
export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return withCors(
      request,
      NextResponse.json(
        { error: "GitHub OAuth not configured on server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET." },
        { status: 500 }
      )
    );
  }

  let body: { code?: string; redirectUri?: string };
  try {
    body = await request.json();
  } catch {
    return withCors(
      request,
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    );
  }

  const { code, redirectUri } = body;
  if (!code || !redirectUri) {
    return withCors(
      request,
      NextResponse.json({ error: "code and redirectUri are required" }, { status: 400 })
    );
  }

  // Exchange code → access_token with GitHub
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept":       "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      code:          code,
      redirect_uri:  redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return withCors(
      request,
      NextResponse.json(
        { error: `GitHub token exchange failed: HTTP ${tokenRes.status}` },
        { status: 502 }
      )
    );
  }

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    token_type?:   string;
    scope?:        string;
    error?:        string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    const msg = tokenData.error_description || tokenData.error || "Unknown error from GitHub";
    return withCors(
      request,
      NextResponse.json({ error: msg }, { status: 400 })
    );
  }

  return withCors(
    request,
    NextResponse.json({
      accessToken: tokenData.access_token,
      tokenType:   tokenData.token_type   || "bearer",
      scope:       tokenData.scope        || "",
    })
  );
}
