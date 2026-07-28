import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { corsHeaders, handleOptions, withCors } from "@/lib/cors";
import type { ApiResponse } from "@/types";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

/**
 * GET /api/auth/extension
 * Checks whether the caller has a valid session.
 * Called by the Chrome extension before every sync.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return withCors(
        request,
        NextResponse.json<ApiResponse>(
          { success: false, error: "Not authenticated" },
          { status: 401, headers: corsHeaders(request) }
        )
      );
    }

    return withCors(
      request,
      NextResponse.json<ApiResponse>({
        success: true,
        data: {
          userId: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          githubUsername: session.user.githubUsername,
        },
      })
    );
  } catch (error) {
    console.error("[AUTH_EXTENSION_ERROR]", error);
    return withCors(
      request,
      NextResponse.json<ApiResponse>(
        { success: false, error: "Authentication check failed." },
        { status: 500 }
      )
    );
  }
}
