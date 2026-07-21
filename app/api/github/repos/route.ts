import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listUserRepos, createRepo } from "@/lib/github";
import type { ApiResponse, GitHubRepo } from "@/types";

/**
 * GET /api/github/repos — List authenticated user's GitHub repositories.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const repos = await listUserRepos(session.accessToken);

    return NextResponse.json<ApiResponse<GitHubRepo[]>>({
      success: true,
      data: repos,
    });
  } catch (error) {
    console.error("[GITHUB_REPOS_LIST_ERROR]", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch repositories." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/github/repos — Create a new GitHub repository.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { name, isPrivate, description } = (await request.json()) as {
      name: string;
      isPrivate?: boolean;
      description?: string;
    };

    if (!name || name.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Repository name is required." },
        { status: 400 }
      );
    }

    const repo = await createRepo(
      session.accessToken,
      name.trim(),
      isPrivate ?? false,
      description
    );

    // Save the repo reference in our database
    await prisma.repository.create({
      data: {
        repoId: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
        userId: session.user.id,
      },
    });

    // Auto-select the new repo
    await prisma.settings.upsert({
      where: { userId: session.user.id },
      update: {
        selectedRepoId: String(repo.id),
        selectedRepoFullName: repo.full_name,
      },
      create: {
        userId: session.user.id,
        selectedRepoId: String(repo.id),
        selectedRepoFullName: repo.full_name,
        autoSync: true,
      },
    });

    return NextResponse.json<ApiResponse<GitHubRepo>>({
      success: true,
      data: repo,
    });
  } catch (error) {
    console.error("[GITHUB_REPOS_CREATE_ERROR]", error);
    const message =
      error instanceof Error && error.message.includes("name already exists")
        ? "A repository with this name already exists."
        : "Failed to create repository.";
    return NextResponse.json<ApiResponse>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
