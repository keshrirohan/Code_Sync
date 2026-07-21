"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Toggle auto-sync on or off.
 */
export async function updateAutoSync(enabled: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  await prisma.settings.upsert({
    where: { userId: session.user.id },
    update: { autoSync: enabled },
    create: {
      userId: session.user.id,
      autoSync: enabled,
    },
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

/**
 * Select a repository for syncing solutions.
 */
export async function selectRepository(repoId: string, repoFullName: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  await prisma.settings.upsert({
    where: { userId: session.user.id },
    update: {
      selectedRepoId: repoId,
      selectedRepoFullName: repoFullName,
    },
    create: {
      userId: session.user.id,
      selectedRepoId: repoId,
      selectedRepoFullName: repoFullName,
      autoSync: true,
    },
  });

  // Also track the repo in our database if not already tracked
  const existing = await prisma.repository.findUnique({
    where: { repoId },
  });

  if (!existing) {
    const [, repoName] = repoFullName.split("/");
    await prisma.repository.create({
      data: {
        repoId,
        name: repoName || repoFullName,
        fullName: repoFullName,
        isPrivate: false,
        htmlUrl: `https://github.com/${repoFullName}`,
        userId: session.user.id,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}

/**
 * Disconnect GitHub — removes the OAuth token and clears settings.
 */
export async function disconnectGitHub() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  // Remove access token from the account record
  await prisma.account.updateMany({
    where: {
      userId: session.user.id,
      provider: "github",
    },
    data: {
      access_token: null,
      refresh_token: null,
    },
  });

  // Clear selected repo from settings
  await prisma.settings.updateMany({
    where: { userId: session.user.id },
    data: {
      selectedRepoId: null,
      selectedRepoFullName: null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
