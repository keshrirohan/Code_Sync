import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  commitFile,
  getFileContent,
  buildFilePath,
  buildCommitMessage,
} from "@/lib/github";
import type { ApiResponse, SyncResult } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { syncHistoryId } = (await request.json()) as { syncHistoryId: string };

    if (!syncHistoryId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing syncHistoryId." },
        { status: 400 }
      );
    }

    // Find the failed sync record
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

    // Get the user's selected repo
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings?.selectedRepoFullName) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "No repository selected." },
        { status: 400 }
      );
    }

    const [owner, repo] = settings.selectedRepoFullName.split("/");

    // We need to re-fetch the original code — use the stored codeHash to verify
    // Since we can't reconstruct code from hash, we need to re-commit
    // The retry should be triggered with the original code, but we'll attempt
    // to rebuild from what we have

    const filePath = buildFilePath(
      failedSync.category,
      failedSync.problemName,
      failedSync.language
    );

    // Check if file exists on GitHub already
    let fileSha: string | undefined;
    try {
      const existing = await getFileContent(session.accessToken, owner, repo, filePath);
      if (existing) {
        fileSha = existing.sha;
      }
    } catch {
      // File doesn't exist
    }

    // For retry, we need the code. If it wasn't stored, we can only mark as needing re-submit.
    // In practice, the extension should re-send the code for retries.
    return NextResponse.json<ApiResponse<SyncResult>>({
      success: false,
      error: "Please re-submit the solution from the extension to retry. The original code is not stored on the server for security.",
    });
  } catch (error) {
    console.error("[SYNC_RETRY_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Retry failed." },
      { status: 500 }
    );
  }
}
