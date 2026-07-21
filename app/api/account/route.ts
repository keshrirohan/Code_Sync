import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteRepo } from "@/lib/github";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/account — Delete user account and all associated data.
 * Optionally deletes the GitHub repository created by CodeSync.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { deleteGitHubRepo } = (await request.json()) as {
      deleteGitHubRepo?: boolean;
    };

    const userId = session.user.id;

    // Optionally delete the GitHub repo
    if (deleteGitHubRepo) {
      const repos = await prisma.repository.findMany({
        where: { userId },
      });

      for (const repo of repos) {
        try {
          const [owner, repoName] = repo.fullName.split("/");
          await deleteRepo(session.accessToken, owner, repoName);
        } catch (error) {
          console.error(`[ACCOUNT_DELETE] Failed to delete repo ${repo.fullName}:`, error);
          // Continue — don't block account deletion because of repo deletion failure
        }
      }
    }

    // Delete all user data (cascading deletes handle related records)
    // The order matters for relations without cascade
    await prisma.syncHistory.deleteMany({ where: { userId } });
    await prisma.settings.deleteMany({ where: { userId } });
    await prisma.repository.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { message: "Account deleted successfully." },
    });
  } catch (error) {
    console.error("[ACCOUNT_DELETE_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to delete account." },
      { status: 500 }
    );
  }
}
