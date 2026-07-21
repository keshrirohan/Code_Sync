import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteRepo } from "@/lib/github";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/github/repos/[repoId] — Delete a GitHub repository.
 * Only deletes repos tracked by CodeSync. Requires double confirmation from the client.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { repoId } = await params;

    // Only allow deletion of repos tracked in our database
    const repoRecord = await prisma.repository.findFirst({
      where: {
        repoId,
        userId: session.user.id,
      },
    });

    if (!repoRecord) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Repository not found or not managed by CodeSync." },
        { status: 404 }
      );
    }

    const [owner, repo] = repoRecord.fullName.split("/");

    // Delete from GitHub
    await deleteRepo(session.accessToken, owner, repo);

    // Remove from our database
    await prisma.repository.delete({ where: { id: repoRecord.id } });

    // Clear from settings if it was the selected repo
    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (settings?.selectedRepoId === repoId) {
      await prisma.settings.update({
        where: { userId: session.user.id },
        data: {
          selectedRepoId: null,
          selectedRepoFullName: null,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { message: "Repository deleted successfully." },
    });
  } catch (error) {
    console.error("[GITHUB_REPO_DELETE_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to delete repository." },
      { status: 500 }
    );
  }
}
