import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse, SyncHistoryItem } from "@/types";

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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const status = searchParams.get("status"); // SUCCESS | FAILED | SKIPPED
    const search = searchParams.get("search");

    const where = {
      userId: session.user.id,
      ...(status ? { status } : {}),
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
      status: item.status as SyncHistoryItem["status"],
      commitUrl: item.commitUrl,
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
