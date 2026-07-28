"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bug,
  RefreshCcw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  SkipForward,
  Wifi,
  WifiOff,
  Database,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DebugLogEntry } from "@/app/api/debug/logs/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebugMeta {
  total: number;
  autoSync: boolean | null;
  selectedRepo: string | null;
  userId: string;
  githubUsername: string | null;
  generatedAt: string;
}

interface DebugData {
  logs: DebugLogEntry[];
  meta: DebugMeta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  info:  { color: "text-[oklch(0.78_0.18_155)]",  bg: "bg-[oklch(0.78_0.18_155/0.08)]",  label: "INFO",  Icon: CheckCircle2 },
  warn:  { color: "text-[oklch(0.80_0.16_85)]",   bg: "bg-[oklch(0.80_0.16_85/0.08)]",   label: "SKIP",  Icon: SkipForward  },
  error: { color: "text-[oklch(0.68_0.20_25)]",   bg: "bg-[oklch(0.68_0.20_25/0.08)]",   label: "ERR",   Icon: XCircle      },
} as const;

const EVENT_LABELS: Record<string, string> = {
  SYNC_SUCCESS: "Committed to GitHub",
  SYNC_FAILED:  "Sync failed",
  SYNC_SKIPPED: "Duplicate skipped",
};

function timeAgo(iso: string) {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: DebugLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = LEVEL_CONFIG[entry.level];
  const Icon = cfg.Icon;
  const hasExtra = !!(entry.errorMsg || entry.filePath || entry.commitUrl);

  return (
    <div
      className={cn(
        "border-b border-white/[0.04] transition-colors",
        expanded ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
      )}
    >
      {/* Main row */}
      <button
        onClick={() => hasExtra && setExpanded((e) => !e)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 text-left",
          hasExtra ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/* Expand chevron */}
        <span className="w-3.5 flex-shrink-0 text-muted-foreground/40">
          {hasExtra ? (
            expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : null}
        </span>

        {/* Level badge */}
        <span
          className={cn(
            "text-[10px] font-bold w-10 flex-shrink-0 px-1 py-0.5 rounded text-center",
            cfg.color,
            cfg.bg
          )}
        >
          {cfg.label}
        </span>

        {/* Icon */}
        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", cfg.color)} />

        {/* Event label */}
        <span className="text-xs font-mono text-muted-foreground w-36 flex-shrink-0 truncate">
          {entry.event}
        </span>

        {/* Problem name */}
        <span className="text-sm font-medium truncate flex-1">
          {entry.problem ?? "—"}
        </span>

        {/* Language + difficulty */}
        <span className="text-xs text-muted-foreground/60 capitalize w-20 flex-shrink-0 text-right truncate">
          {entry.language} · {entry.difficulty}
        </span>

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground/50 w-20 flex-shrink-0 text-right">
          {timeAgo(entry.ts)}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-14 pb-3 space-y-1.5 text-xs">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-muted-foreground/50 font-mono">slug</span>
            <span className="font-mono text-muted-foreground">{entry.slug}</span>

            <span className="text-muted-foreground/50 font-mono">category</span>
            <span className="font-mono text-muted-foreground">{entry.category ?? "—"}</span>

            <span className="text-muted-foreground/50 font-mono">path</span>
            <span className="font-mono text-muted-foreground break-all">{entry.filePath ?? "—"}</span>

            {entry.commitUrl && (
              <>
                <span className="text-muted-foreground/50 font-mono">commit</span>
                <a
                  href={entry.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline flex items-center gap-1 break-all"
                >
                  {entry.commitUrl}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </>
            )}

            {entry.errorMsg && (
              <>
                <span className="text-muted-foreground/50 font-mono">error</span>
                <span className="font-mono text-destructive break-all">{entry.errorMsg}</span>
              </>
            )}

            <span className="text-muted-foreground/50 font-mono">ts</span>
            <span className="font-mono text-muted-foreground">{entry.ts}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterLevel = "ALL" | "info" | "warn" | "error";
type FilterStatus = "ALL" | "SUCCESS" | "FAILED" | "SKIPPED";

export default function DebugPage() {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [levelFilter, setLevelFilter] = useState<FilterLevel>("ALL");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async (status: FilterStatus = "ALL") => {
    try {
      const params = new URLSearchParams({ limit: "100", status });
      const res = await fetch(`/api/debug/logs?${params}`);
      const json = await res.json() as { success: boolean; data: DebugData };
      if (json.success) {
        setData(json.data);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error("Debug panel fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + status-filter-driven fetch
  useEffect(() => { fetchLogs(statusFilter); }, [fetchLogs, statusFilter]);

  // Auto-refresh every 5 s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchLogs(statusFilter), 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs, statusFilter]);

  // Filtered log list
  const filteredLogs = (data?.logs ?? []).filter((e) => {
    if (levelFilter !== "ALL" && e.level !== levelFilter) return false;
    if (search && !e.problem?.toLowerCase().includes(search.toLowerCase()) &&
        !e.event.toLowerCase().includes(search.toLowerCase()) &&
        !e.slug?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Copy all logs as JSON
  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data?.logs ?? [], null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const meta = data?.meta;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bug className="w-7 h-7 text-primary" />
            Debug Panel
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Live sync logs and connection diagnostics
            {lastRefreshed && (
              <span className="ml-2 text-muted-foreground/50">
                · refreshed {timeAgo(lastRefreshed.toISOString())}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(statusFilter)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors",
              autoRefresh
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {autoRefresh ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy JSON"}
          </button>
        </div>
      </div>

      {/* ── Connection status cards ── */}
      {meta && (
        <div className="grid sm:grid-cols-3 gap-4">
          {/* Auth */}
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.78_0.18_155/0.12)] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-[oklch(0.78_0.18_155)]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Authenticated as</p>
              <p className="text-sm font-semibold truncate">
                {meta.githubUsername
                  ? `@${meta.githubUsername}`
                  : <span className="text-muted-foreground/60 font-mono">{meta.userId.slice(0, 12)}…</span>
                }
              </p>
              {!meta.githubUsername && (
                <p className="text-[10px] text-[oklch(0.80_0.16_85)] mt-0.5">
                  Re-sign in to populate GitHub username
                </p>
              )}
            </div>
          </div>

          {/* Repo */}
          <div className="glass-card p-4 flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              meta.selectedRepo
                ? "bg-[oklch(0.78_0.18_155/0.12)]"
                : "bg-[oklch(0.80_0.16_85/0.12)]"
            )}>
              <Database className={cn("w-4 h-4", meta.selectedRepo
                ? "text-[oklch(0.78_0.18_155)]"
                : "text-[oklch(0.80_0.16_85)]"
              )} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Target repo</p>
              <p className="text-sm font-semibold truncate">
                {meta.selectedRepo ?? "Not configured"}
              </p>
            </div>
          </div>

          {/* Auto-sync */}
          <div className="glass-card p-4 flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              meta.autoSync
                ? "bg-[oklch(0.78_0.18_155/0.12)]"
                : "bg-[oklch(0.68_0.20_25/0.12)]"
            )}>
              {meta.autoSync
                ? <Wifi className="w-4 h-4 text-[oklch(0.78_0.18_155)]" />
                : <WifiOff className="w-4 h-4 text-[oklch(0.68_0.20_25)]" />
              }
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Auto-sync</p>
              <p className="text-sm font-semibold">
                {meta.autoSync === null ? "Unknown" : meta.autoSync ? "Enabled" : "Disabled"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <input
          type="text"
          placeholder="Search problem / event / slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />

        {/* Level filter */}
        <div className="flex gap-1">
          {(["ALL", "info", "warn", "error"] as FilterLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                levelFilter === l
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
              )}
            >
              {l === "ALL" ? "All" : l === "info" ? "✓ Success" : l === "warn" ? "⊘ Skipped" : "✗ Failed"}
            </button>
          ))}
        </div>

        {/* Status filter (affects API fetch) */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
          className="px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
        >
          <option value="ALL">All syncs</option>
          <option value="SUCCESS">Success only</option>
          <option value="FAILED">Failed only</option>
          <option value="SKIPPED">Skipped only</option>
        </select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredLogs.length} / {data?.logs.length ?? 0} entries
        </span>
      </div>

      {/* ── Log table ── */}
      <div className="glass-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <span className="w-3.5" />
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest w-10">lvl</span>
          <span className="w-3.5" />
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest w-36">event</span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest flex-1">problem</span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest w-20 text-right">lang · diff</span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest w-20 text-right">when</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm mt-3">Loading logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Bug className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            {data && data.logs.length === 0 ? (
              <>
                <p className="text-muted-foreground font-medium">No syncs yet</p>
                <p className="text-sm text-muted-foreground/60 mt-2 max-w-xs mx-auto leading-relaxed">
                  Logs appear here after your first LeetCode sync. Make sure the
                  Chrome extension is installed, auto-sync is on, and a target
                  repo is selected in Settings.
                </p>
                <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-left max-w-xs mx-auto space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={meta?.selectedRepo ? "text-[oklch(0.78_0.18_155)]" : "text-[oklch(0.80_0.16_85)]"}>
                      {meta?.selectedRepo ? "✓" : "✗"}
                    </span>
                    <span>Target repo: <span className="font-medium text-foreground">{meta?.selectedRepo ?? "not set"}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={meta?.autoSync ? "text-[oklch(0.78_0.18_155)]" : "text-[oklch(0.68_0.20_25)]"}>
                      {meta?.autoSync ? "✓" : "✗"}
                    </span>
                    <span>Auto-sync: <span className="font-medium text-foreground">{meta?.autoSync ? "enabled" : "disabled"}</span></span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No entries match this filter.</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Try changing the level or status filter above.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="font-mono text-xs">
            {filteredLogs.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* ── Raw JSON export ── */}
      {data && (
        <details className="glass-card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 select-none">
            <ChevronRight className="w-3.5 h-3.5 transition-transform [[open]_&]:rotate-90" />
            Raw JSON
          </summary>
          <div className="border-t border-white/5">
            <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto max-h-96 leading-relaxed">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
