import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleOptions, withCors } from "@/lib/cors";
import {
  commitFile,
  getFileContent,
  buildFilePath,
  buildCommitMessage,
  hashCode,
} from "@/lib/github";
import type { SyncResult, ApiResponse } from "@/types";

// ─── Zod schema ───────────────────────────────────────────────────────────────

const syncPayloadSchema = z.object({
  problemName: z.string().min(1, "problemName is required"),
  slug: z.string().min(1, "slug is required"),
  difficulty: z.string().default("Unknown"),
  language: z.string().min(1, "language is required"),
  code: z.string().min(1, "code is required"),
  category: z.string().default("Uncategorized"),
});

// ─── CORS preflight ───────────────────────────────────────────────────────────

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

// ─── POST /api/sync ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Validate session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return withCors(request,
        NextResponse.json<ApiResponse<SyncResult>>(
          { success: false, error: "Unauthorized. Please sign in at the CodeSync web app." },
          { status: 401 }
        )
      );
    }

    // 2. Parse + validate body with Zod
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return withCors(request,
        NextResponse.json<ApiResponse<SyncResult>>(
          { success: false, error: "Invalid JSON body." },
          { status: 400 }
        )
      );
    }

    const parsed = syncPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(", ");
      return withCors(request,
        NextResponse.json<ApiResponse<SyncResult>>(
          { success: false, error: `Invalid payload: ${msg}` },
          { status: 400 }
        )
      );
    }

    const { problemName, slug, difficulty, language, code, category } = parsed.data;

    // 3. Get user's selected repository
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings?.selectedRepoFullName) {
      return withCors(request,
        NextResponse.json<ApiResponse<SyncResult>>(
          { success: false, error: "No repository selected. Please pick one in Settings." },
          { status: 400 }
        )
      );
    }

    const [owner, repo] = settings.selectedRepoFullName.split("/");

    // 4. Deduplication — hash the code, look up last successful sync
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
      await prisma.syncHistory.create({
        data: {
          problemName, slug,
          difficulty: difficulty || "Unknown",
          language: language.toLowerCase(),
          category: category || "Uncategorized",
          codeHash: codeHashValue,
          status: "SKIPPED",
          commitUrl: existingSync.commitUrl,
          userId: session.user.id,
        },
      });

      return withCors(request,
        NextResponse.json<ApiResponse<SyncResult>>({
          success: true,
          data: {
            status: "SKIPPED",
            message: "Solution already synced with identical code.",
            commitUrl: existingSync.commitUrl ?? undefined,
          },
        })
      );
    }

    // 5. Build file path + get existing blob SHA (for update commits)
    const filePath = buildFilePath(category || "Uncategorized", problemName, language);
    const isUpdate = !!existingSync;

    let fileSha: string | undefined;
    try {
      const existing = await getFileContent(session.accessToken, owner, repo, filePath);
      if (existing) fileSha = existing.sha;
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

    // 7. Record success
    const syncRecord = await prisma.syncHistory.create({
      data: {
        problemName, slug,
        difficulty: difficulty || "Unknown",
        language: language.toLowerCase(),
        category: category || "Uncategorized",
        codeHash: codeHashValue,
        status: "SUCCESS",
        commitUrl: commitResult.commitUrl,
        userId: session.user.id,
      },
    });

    return withCors(request,
      NextResponse.json<ApiResponse<SyncResult>>({
        success: true,
        data: {
          status: "SUCCESS",
          message: isUpdate
            ? `Updated "${problemName}" solution.`
            : `Synced "${problemName}" to GitHub.`,
          commitUrl: commitResult.commitUrl,
          syncHistoryId: syncRecord.id,
        },
      })
    );

  } catch (error) {
    console.error("[SYNC_ERROR]", error);

    // Best-effort failure record
    try {
      const session = await getServerSession(authOptions);
      const rawBody = await request.clone().json() as Record<string, unknown>;
      if (session?.user?.id && typeof rawBody.slug === "string") {
        await prisma.syncHistory.create({
          data: {
            problemName: typeof rawBody.problemName === "string" ? rawBody.problemName : "Unknown",
            slug: rawBody.slug,
            difficulty: typeof rawBody.difficulty === "string" ? rawBody.difficulty : "Unknown",
            language: typeof rawBody.language === "string" ? rawBody.language.toLowerCase() : "unknown",
            category: typeof rawBody.category === "string" ? rawBody.category : "Uncategorized",
            codeHash: typeof rawBody.code === "string" ? hashCode(rawBody.code) : "",
            status: "FAILED",
            errorMsg: error instanceof Error ? error.message : "Unknown error",
            userId: session.user.id,
          },
        });
      }
    } catch { /* ignore recording errors */ }

    return withCors(request,
      NextResponse.json<ApiResponse<SyncResult>>(
        {
          success: false,
          error: error instanceof Error ? error.message : "Sync failed. Please try again.",
        },
        { status: 500 }
      )
    );
  }
}
