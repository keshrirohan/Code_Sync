import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse, SyncHistoryItem } from "@/types";

// ─── Query param schema ────────────────────────────────────────────────────────
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["SUCCESS", "FAILED", "SKIPPED"]).optional(),
  search: z.string().optional(),
  language: z.string().optional(),
  category: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse + validate query params
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, limit, status, search, language, category } = parsed.data;

    const where = {
      userId: session.user.id,
      ...(status ? { status } : {}),
      ...(language ? { language: language.toLowerCase() } : {}),
      ...(category ? { category: { contains: category, mode: "insensitive" as const } } : {}),
      ...(search
        ? {
            problemName: {
              contains: search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.syncHistory.findMany({
        where,
        orderBy: { syncedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.syncHistory.count({ where }),
    ]);

    const history: SyncHistoryItem[] = items.map((item) => ({
      id: item.id,
      problemName: item.problemName,
      slug: item.slug,
      difficulty: item.difficulty,
      language: item.language,
      category: item.category,
      status: item.status as SyncHistoryItem["status"],
      commitUrl: item.commitUrl,
      errorMsg: item.errorMsg,
      syncedAt: item.syncedAt.toISOString(),
    }));

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        items: history,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[SYNC_HISTORY_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch sync history." },
      { status: 500 }
    );
  }
}
