import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { ApiResponse } from "@/types";

/**
 * GET /api/auth/extension — Check if the user is authenticated.
 * Used by the Chrome extension to verify auth status.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Not authenticated",
        },
        { status: 401 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        userId: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        githubUsername: session.user.githubUsername,
      },
    });
  } catch (error) {
    console.error("[AUTH_EXTENSION_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Authentication check failed." },
      { status: 500 }
    );
  }
}
