import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse, UserSettings } from "@/types";

/**
 * GET /api/settings — Fetch user settings.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      // Create default settings if they don't exist
      const newSettings = await prisma.settings.create({
        data: {
          userId: session.user.id,
          autoSync: true,
        },
      });

      return NextResponse.json<ApiResponse<UserSettings>>({
        success: true,
        data: {
          autoSync: newSettings.autoSync,
          selectedRepoId: newSettings.selectedRepoId,
          selectedRepoFullName: newSettings.selectedRepoFullName,
        },
      });
    }

    return NextResponse.json<ApiResponse<UserSettings>>({
      success: true,
      data: {
        autoSync: settings.autoSync,
        selectedRepoId: settings.selectedRepoId,
        selectedRepoFullName: settings.selectedRepoFullName,
      },
    });
  } catch (error) {
    console.error("[SETTINGS_GET_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch settings." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings — Update user settings.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Partial<UserSettings>;

    const updateData: Record<string, unknown> = {};
    if (typeof body.autoSync === "boolean") {
      updateData.autoSync = body.autoSync;
    }
    if (body.selectedRepoId !== undefined) {
      updateData.selectedRepoId = body.selectedRepoId;
    }
    if (body.selectedRepoFullName !== undefined) {
      updateData.selectedRepoFullName = body.selectedRepoFullName;
    }

    const settings = await prisma.settings.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        autoSync: body.autoSync ?? true,
        selectedRepoId: body.selectedRepoId ?? null,
        selectedRepoFullName: body.selectedRepoFullName ?? null,
      },
    });

    return NextResponse.json<ApiResponse<UserSettings>>({
      success: true,
      data: {
        autoSync: settings.autoSync,
        selectedRepoId: settings.selectedRepoId,
        selectedRepoFullName: settings.selectedRepoFullName,
      },
    });
  } catch (error) {
    console.error("[SETTINGS_UPDATE_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to update settings." },
      { status: 500 }
    );
  }
}
