import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

/**
 * POST /api/sync/retry
 *
 * CodeSync does NOT store raw solution code on the server — only a SHA-256
 * hash for deduplication. Because of this, a true server-side retry (recreating
 * the commit from stored data) is impossible.
 *
 * This endpoint exists so the extension can call it and receive a friendly,
 * structured error telling the user to re-submit from LeetCode. It also
 * validates the sync record belongs to the requesting user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { syncHistoryId?: string };
    const { syncHistoryId } = body;

    if (!syncHistoryId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing syncHistoryId." },
        { status: 400 }
      );
    }

    // Verify the record exists and belongs to this user
    const failedSync = await prisma.syncHistory.findFirst({
      where: {
        id: syncHistoryId,
        userId: session.user.id,
        status: "FAILED",
      },
    });

    if (!failedSync) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Failed sync record not found." },
        { status: 404 }
      );
    }

    // Inform the caller: raw code is never stored server-side (security by design).
    // The user must navigate back to the LeetCode problem and re-submit to trigger
    // a fresh sync via the extension.
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: `To retry syncing "${failedSync.problemName}", please navigate to the problem on LeetCode and re-submit your solution. The extension will detect the accepted submission and sync it automatically.`,
      },
      { status: 422 }
    );
  } catch (error) {
    console.error("[SYNC_RETRY_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Retry check failed." },
      { status: 500 }
    );
  }
}

