"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteRepo } from "@/lib/github";
import { redirect } from "next/navigation";

/**
 * Delete user account and all associated data.
 * Optionally deletes GitHub repos created by CodeSync.
 */
export async function deleteAccount(deleteGitHubRepos: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.accessToken) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = session.user.id;

  // Optionally delete GitHub repos
  if (deleteGitHubRepos && session.accessToken) {
    const repos = await prisma.repository.findMany({
      where: { userId },
    });

    for (const repo of repos) {
      try {
        const [owner, repoName] = repo.fullName.split("/");
        await deleteRepo(session.accessToken, owner, repoName);
      } catch (error) {
        console.error(`Failed to delete repo ${repo.fullName}:`, error);
        // Continue deletion — don't block on repo delete failure
      }
    }
  }

  // Delete all user data
  await prisma.syncHistory.deleteMany({ where: { userId } });
  await prisma.settings.deleteMany({ where: { userId } });
  await prisma.repository.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });

  redirect("/");
}
