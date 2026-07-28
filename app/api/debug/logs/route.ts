import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["SUCCESS", "FAILED", "SKIPPED", "ALL"]).default("ALL"),
});

export interface DebugLogEntry {
  id: string;
  ts: string;           // ISO timestamp
  level: "info" | "warn" | "error";
  event: string;        // e.g. "SYNC_SUCCESS", "SYNC_FAILED", "SYNC_SKIPPED"
  problem?: string;
  slug?: string;
  language?: string;
  category?: string;
  difficulty?: string;
  commitUrl?: string | null;
  errorMsg?: string | null;
  filePath?: string;
}

/**
 * GET /api/debug/logs
 * Returns recent SyncHistory rows reformatted as structured debug log entries.
 * Only accessible to the signed-in user — returns their own data only.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { limit, status } = parsed.data;

    const where = {
      userId: session.user.id,
      ...(status !== "ALL" ? { status } : {}),
    };

    const rows = await prisma.syncHistory.findMany({
      where,
      orderBy: { syncedAt: "desc" },
      take: limit,
    });

    // Also pull current settings so the debug panel can show connection state
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
      select: { autoSync: true, selectedRepoFullName: true },
    });

    const logs: DebugLogEntry[] = rows.map((row) => {
      // Build the expected file path for reference
      const sanitize = (s: string) =>
        s.trim().replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ");
      const ext = row.language === "python3" || row.language === "python"
        ? "py"
        : row.language === "cpp" ? "cpp"
        : row.language === "javascript" ? "js"
        : row.language === "typescript" ? "ts"
        : row.language === "java" ? "java"
        : row.language === "rust" ? "rs"
        : row.language === "go" ? "go"
        : row.language === "csharp" ? "cs"
        : row.language === "ruby" ? "rb"
        : row.language;
      const filePath = `${sanitize(row.category || "Uncategorized")}/${sanitize(row.problemName)}/solution.${ext}`;

      return {
        id: row.id,
        ts: row.syncedAt.toISOString(),
        level:
          row.status === "FAILED"
            ? "error"
            : row.status === "SKIPPED"
            ? "warn"
            : "info",
        event:
          row.status === "SUCCESS"
            ? "SYNC_SUCCESS"
            : row.status === "FAILED"
            ? "SYNC_FAILED"
            : "SYNC_SKIPPED",
        problem: row.problemName,
        slug: row.slug,
        language: row.language,
        category: row.category,
        difficulty: row.difficulty,
        commitUrl: row.commitUrl,
        errorMsg: row.errorMsg,
        filePath,
      };
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        logs,
        meta: {
          total: rows.length,
          autoSync: settings?.autoSync ?? null,
          selectedRepo: settings?.selectedRepoFullName ?? null,
          userId: session.user.id,
          githubUsername: session.user.githubUsername ?? null,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("[DEBUG_LOGS_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch debug logs." },
      { status: 500 }
    );
  }
}
