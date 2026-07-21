import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  commitFile,
  getFileContent,
  buildFilePath,
  buildCommitMessage,
  hashCode,
} from "@/lib/github";
import type { SyncPayload, SyncResult, ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    // 1. Validate session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse<SyncResult>>(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // 2. Parse and validate payload
    const body = (await request.json()) as SyncPayload;
    const { problemName, slug, difficulty, language, code, category } = body;

    if (!problemName || !slug || !language || !code) {
      return NextResponse.json<ApiResponse<SyncResult>>(
        { success: false, error: "Missing required fields: problemName, slug, language, code." },
        { status: 400 }
      );
    }

    // 3. Get user's selected repository
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings?.selectedRepoFullName) {
      return NextResponse.json<ApiResponse<SyncResult>>(
        { success: false, error: "No repository selected. Please select a repository in Settings." },
        { status: 400 }
      );
    }

    const [owner, repo] = settings.selectedRepoFullName.split("/");

    // 4. Check for duplicate (same slug + language + same code hash)
    const codeHashValue = hashCode(code);

    const existingSync = await prisma.syncHistory.findFirst({
      where: {
        userId: session.user.id,
        slug,
        language: language.toLowerCase(),
        status: "SUCCESS",
      },
      orderBy: { syncedAt: "desc" },
    });

    if (existingSync && existingSync.codeHash === codeHashValue) {
      // Code hasn't changed — skip
      const skipResult: SyncResult = {
        status: "SKIPPED",
        message: "Solution already synced with identical code.",
        commitUrl: existingSync.commitUrl ?? undefined,
      };

      await prisma.syncHistory.create({
        data: {
          problemName,
          slug,
          difficulty: difficulty || "Unknown",
          language: language.toLowerCase(),
          category: category || "Uncategorized",
          codeHash: codeHashValue,
          status: "SKIPPED",
          commitUrl: existingSync.commitUrl,
          userId: session.user.id,
        },
      });

      return NextResponse.json<ApiResponse<SyncResult>>({
        success: true,
        data: skipResult,
      });
    }

    // 5. Build file path and check if file exists on GitHub
    const filePath = buildFilePath(category || "Uncategorized", problemName, language);
    const isUpdate = !!existingSync;

    let fileSha: string | undefined;
    try {
      const existing = await getFileContent(session.accessToken, owner, repo, filePath);
      if (existing) {
        fileSha = existing.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    // 6. Commit to GitHub
    const commitMessage = buildCommitMessage(problemName, language, isUpdate);
    const commitResult = await commitFile(
      session.accessToken,
      owner,
      repo,
      filePath,
      code,
      commitMessage,
      fileSha
    );

    // 7. Record sync history
    const syncRecord = await prisma.syncHistory.create({
      data: {
        problemName,
        slug,
        difficulty: difficulty || "Unknown",
        language: language.toLowerCase(),
        category: category || "Uncategorized",
        codeHash: codeHashValue,
        status: "SUCCESS",
        commitUrl: commitResult.commitUrl,
        userId: session.user.id,
      },
    });

    const result: SyncResult = {
      status: "SUCCESS",
      message: isUpdate
        ? `Updated "${problemName}" solution.`
        : `Synced "${problemName}" to GitHub.`,
      commitUrl: commitResult.commitUrl,
      syncHistoryId: syncRecord.id,
    };

    return NextResponse.json<ApiResponse<SyncResult>>({ success: true, data: result });
  } catch (error) {
    console.error("[SYNC_ERROR]", error);

    // Record failed sync if we have enough context
    try {
      const session = await getServerSession(authOptions);
      const body = (await request.clone().json()) as Partial<SyncPayload>;
      if (session?.user?.id && body.slug) {
        await prisma.syncHistory.create({
          data: {
            problemName: body.problemName || "Unknown",
            slug: body.slug,
            difficulty: body.difficulty || "Unknown",
            language: (body.language || "unknown").toLowerCase(),
            category: body.category || "Uncategorized",
            codeHash: body.code ? hashCode(body.code) : "",
            status: "FAILED",
            errorMsg: error instanceof Error ? error.message : "Unknown error",
            userId: session.user.id,
          },
        });
      }
    } catch {
      // Ignore errors during error recording
    }

    return NextResponse.json<ApiResponse<SyncResult>>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Sync failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
