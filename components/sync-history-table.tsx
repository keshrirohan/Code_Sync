"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  SkipForward,
  ExternalLink,
  RefreshCcw,
  Tag,
} from "lucide-react";
import type { SyncHistoryItem } from "@/types";

interface SyncHistoryTableProps {
  items: SyncHistoryItem[];
  compact?: boolean;
  /** Called when user clicks Retry on a FAILED row */
  onRetry?: (item: SyncHistoryItem) => void;
}

const statusConfig = {
  SUCCESS: {
    icon: CheckCircle2,
    label: "Synced",
    className: "text-[oklch(0.78_0.18_155)] bg-[oklch(0.78_0.18_155/0.12)]",
  },
  FAILED: {
    icon: XCircle,
    label: "Failed",
    className: "text-[oklch(0.68_0.20_25)] bg-[oklch(0.68_0.20_25/0.12)]",
  },
  SKIPPED: {
    icon: SkipForward,
    label: "Skipped",
    className: "text-[oklch(0.80_0.16_85)] bg-[oklch(0.80_0.16_85/0.12)]",
  },
};

const difficultyConfig: Record<string, string> = {
  Easy: "badge-easy",
  Medium: "badge-medium",
  Hard: "badge-hard",
};

export default function SyncHistoryTable({
  items,
  compact = false,
  onRetry,
}: SyncHistoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-muted-foreground">No sync history yet.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Solve a LeetCode problem to see your first sync here.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Problem
              </th>
              {!compact && (
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Category
                </th>
              )}
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Difficulty
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Language
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Status
              </th>
              {!compact && (
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Date
                </th>
              )}
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const status =
                statusConfig[item.status as keyof typeof statusConfig] ??
                statusConfig.SUCCESS;
              const StatusIcon = status.icon;
              const isFailed = item.status === "FAILED";

              return (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  {/* Problem name + error hint */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <a
                        href={`https://leetcode.com/problems/${item.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:text-primary transition-colors"
                      >
                        {item.problemName}
                      </a>
                      {isFailed && item.errorMsg && (
                        <span
                          className="text-xs text-destructive/70 truncate max-w-[220px]"
                          title={item.errorMsg}
                        >
                          {item.errorMsg}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Category (full view only) */}
                  {!compact && (
                    <td className="px-4 py-3">
                      {item.category && item.category !== "Uncategorized" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag className="w-3 h-3" />
                          {item.category}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                  )}

                  {/* Difficulty */}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-md text-xs font-medium",
                        difficultyConfig[item.difficulty] ?? ""
                      )}
                    >
                      {item.difficulty}
                    </span>
                  </td>

                  {/* Language */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground capitalize">
                      {item.language}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
                        status.className
                      )}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </td>

                  {/* Date (full view only) */}
                  {!compact && (
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(item.syncedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                  )}

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Retry button — only on FAILED rows in full (non-compact) view */}
                      {!compact && isFailed && onRetry && (
                        <button
                          onClick={() => onRetry(item)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          title="Retry sync instructions"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          Retry
                        </button>
                      )}

                      {/* Commit link */}
                      {item.commitUrl && (
                        <a
                          href={item.commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {/* Empty placeholder to keep column width stable */}
                      {!item.commitUrl && (compact || !isFailed || !onRetry) && (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
