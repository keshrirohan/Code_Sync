import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Code2,
  FolderGit2,
  ExternalLink,
} from "lucide-react";
import StatCard from "@/components/stat-card";
import SyncHistoryTable from "@/components/sync-history-table";
import type { SyncHistoryItem } from "@/types";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  // Fetch data in parallel
  const [totalSynced, totalFailed, settings, recentSyncs, languageGroups] =
    await Promise.all([
      prisma.syncHistory.count({
        where: { userId: session.user.id, status: "SUCCESS" },
      }),
      prisma.syncHistory.count({
        where: { userId: session.user.id, status: "FAILED" },
      }),
      prisma.settings.findUnique({
        where: { userId: session.user.id },
      }),
      prisma.syncHistory.findMany({
        where: { userId: session.user.id },
        orderBy: { syncedAt: "desc" },
        take: 5,
      }),
      prisma.syncHistory.groupBy({
        by: ["language"],
        where: { userId: session.user.id, status: "SUCCESS" },
        _count: true,
      }),
    ]);

  const recentItems: SyncHistoryItem[] = recentSyncs.map((s: typeof recentSyncs[number]) => ({
    id: s.id,
    problemName: s.problemName,
    slug: s.slug,
    difficulty: s.difficulty,
    language: s.language,
    status: s.status as SyncHistoryItem["status"],
    commitUrl: s.commitUrl,
    syncedAt: s.syncedAt.toISOString(),
  }));

  const uniqueLanguages = languageGroups.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {session.user.name || "developer"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Solutions Synced"
          value={totalSynced}
          subtitle="Total accepted solutions on GitHub"
        />
        <StatCard
          icon={<Code2 className="w-5 h-5" />}
          label="Languages Used"
          value={uniqueLanguages}
          subtitle={
            languageGroups
              .map((g: typeof languageGroups[number]) => g.language)
              .slice(0, 3)
              .join(", ") || "None yet"
          }
        />
        <StatCard
          icon={<XCircle className="w-5 h-5" />}
          label="Failed Syncs"
          value={totalFailed}
          subtitle={totalFailed > 0 ? "Check history for details" : "All good!"}
        />
      </div>

      {/* Connected Repo */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderGit2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">
                Connected Repository
              </h2>
              {settings?.selectedRepoFullName ? (
                <p className="text-base font-semibold">
                  {settings.selectedRepoFullName}
                </p>
              ) : (
                <p className="text-base text-muted-foreground/70">
                  No repository selected
                </p>
              )}
            </div>
          </div>
          {settings?.selectedRepoFullName && (
            <a
              href={`https://github.com/${settings.selectedRepoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              Open on GitHub
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Recent Syncs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Syncs</h2>
          <a
            href="/dashboard/history"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            View all →
          </a>
        </div>
        <SyncHistoryTable items={recentItems} compact />
      </div>
    </div>
  );
}