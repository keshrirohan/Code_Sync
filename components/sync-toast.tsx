"use client";

/**
 * SyncToast — polls /api/sync/history every 8 seconds and fires a rich
 * slide-in popup whenever a new sync row lands (SUCCESS, FAILED, or SKIPPED).
 * Mounts once inside the dashboard layout.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  SkipForward,
  ExternalLink,
  X,
  GitCommit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncHistoryItem } from "@/types";

// ─── Individual toast card ─────────────────────────────────────────────────────

interface ToastCard {
  id: string;
  item: SyncHistoryItem;
  visible: boolean;
}

const STATUS_META = {
  SUCCESS: {
    icon: CheckCircle2,
    label: "Synced to GitHub",
    color: "text-[oklch(0.78_0.18_155)]",
    bg: "bg-[oklch(0.78_0.18_155/0.10)]",
    border: "border-[oklch(0.78_0.18_155/0.25)]",
    barColor: "bg-[oklch(0.78_0.18_155)]",
  },
  FAILED: {
    icon: XCircle,
    label: "Sync failed",
    color: "text-[oklch(0.68_0.20_25)]",
    bg: "bg-[oklch(0.68_0.20_25/0.10)]",
    border: "border-[oklch(0.68_0.20_25/0.25)]",
    barColor: "bg-[oklch(0.68_0.20_25)]",
  },
  SKIPPED: {
    icon: SkipForward,
    label: "Already synced",
    color: "text-[oklch(0.80_0.16_85)]",
    bg: "bg-[oklch(0.80_0.16_85/0.10)]",
    border: "border-[oklch(0.80_0.16_85/0.25)]",
    barColor: "bg-[oklch(0.80_0.16_85)]",
  },
} as const;

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: "text-[oklch(0.78_0.18_155)] bg-[oklch(0.78_0.18_155/0.12)]",
  Medium: "text-[oklch(0.80_0.16_85)] bg-[oklch(0.80_0.16_85/0.12)]",
  Hard: "text-[oklch(0.68_0.20_25)] bg-[oklch(0.68_0.20_25/0.12)]",
};

const AUTO_DISMISS_MS = 7000;

function SyncToastCard({
  card,
  onDismiss,
}: {
  card: ToastCard;
  onDismiss: (id: string) => void;
}) {
  const { item } = card;
  const meta = STATUS_META[item.status as keyof typeof STATUS_META] ?? STATUS_META.SUCCESS;
  const Icon = meta.icon;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 50);
    const timer = setTimeout(() => onDismiss(card.id), AUTO_DISMISS_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [card.id, onDismiss]);

  return (
    <div
      className={cn(
        "relative w-80 rounded-xl border backdrop-blur-xl shadow-2xl overflow-hidden",
        "transition-all duration-500",
        meta.bg,
        meta.border,
        card.visible
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      )}
    >
      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/5">
        <div
          className={cn("h-full transition-all duration-50 ease-linear", meta.barColor)}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("w-4.5 h-4.5 flex-shrink-0", meta.color)} />
            <span className={cn("text-sm font-semibold", meta.color)}>
              {meta.label}
            </span>
          </div>
          <button
            onClick={() => onDismiss(card.id)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Problem info */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-snug">{item.problemName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Difficulty badge */}
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                DIFFICULTY_COLOR[item.difficulty] ?? "text-muted-foreground bg-muted/30"
              )}
            >
              {item.difficulty}
            </span>
            {/* Language */}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">
              {item.language}
            </span>
            {/* Category */}
            {item.category && item.category !== "Uncategorized" && (
              <span className="text-[10px] text-muted-foreground">
                {item.category}
              </span>
            )}
          </div>

          {/* Error message on FAILED */}
          {item.status === "FAILED" && item.errorMsg && (
            <p className="text-[11px] text-destructive/80 font-mono mt-1 break-all line-clamp-2">
              {item.errorMsg}
            </p>
          )}
        </div>

        {/* Action row */}
        {item.commitUrl && item.status === "SUCCESS" && (
          <a
            href={item.commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-3 flex items-center gap-1.5 text-[11px] font-medium transition-colors",
              meta.color,
              "hover:opacity-80"
            )}
          >
            <GitCommit className="w-3 h-3" />
            View commit on GitHub
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Container — polls for new syncs ──────────────────────────────────────────

const POLL_INTERVAL_MS = 8000;

export default function SyncToastContainer() {
  const [cards, setCards] = useState<ToastCard[]>([]);
  const latestSyncedAtRef = useRef<string | null>(null);
  const isFirstPollRef = useRef(true);

  const dismiss = useCallback((id: string) => {
    // Start exit animation
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: false } : c))
    );
    // Remove after animation completes
    setTimeout(() => {
      setCards((prev) => prev.filter((c) => c.id !== id));
    }, 550);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/history?page=1&limit=5");
      if (!res.ok) return;
      const json = await res.json() as {
        success: boolean;
        data: { items: SyncHistoryItem[] };
      };
      if (!json.success || !json.data?.items?.length) return;

      const items = json.data.items;

      // On first poll, just record the newest timestamp — don't fire toasts
      if (isFirstPollRef.current) {
        latestSyncedAtRef.current = items[0].syncedAt;
        isFirstPollRef.current = false;
        return;
      }

      // Find items newer than what we last saw
      const newItems = latestSyncedAtRef.current
        ? items.filter((i) => i.syncedAt > latestSyncedAtRef.current!)
        : [];

      if (newItems.length === 0) return;

      // Update watermark
      latestSyncedAtRef.current = newItems[0].syncedAt;

      // Enqueue new toasts (newest first, show up to 3)
      const toShow = newItems.slice(0, 3);
      const newCards: ToastCard[] = toShow.map((item) => ({
        id: `${item.id}-${Date.now()}`,
        item,
        visible: false,
      }));

      setCards((prev) => [...newCards, ...prev].slice(0, 5));

      // Trigger enter animation on next tick
      requestAnimationFrame(() => {
        setCards((prev) =>
          prev.map((c) =>
            newCards.some((nc) => nc.id === c.id) ? { ...c, visible: true } : c
          )
        );
      });
    } catch {
      // Silently ignore — toast polling is best-effort
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  if (cards.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      {cards.map((card) => (
        <div key={card.id} className="pointer-events-auto">
          <SyncToastCard card={card} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
