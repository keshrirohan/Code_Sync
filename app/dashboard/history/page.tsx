"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import toast from "react-hot-toast";
import SyncHistoryTable from "@/components/sync-history-table";
import type { SyncHistoryItem } from "@/types";

type StatusFilter = "" | "SUCCESS" | "FAILED" | "SKIPPED";

interface HistoryResponse {
  items: SyncHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

export default function HistoryPage() {
  const [items, setItems] = useState<SyncHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [language, setLanguage] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryModal, setRetryModal] = useState<SyncHistoryItem | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (status) params.set("status", status);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (language) params.set("language", language);

      const res = await fetch(`/api/sync/history?${params}`);
      const json = (await res.json()) as { success: boolean; data: HistoryResponse };

      if (json.success && json.data) {
        setItems(json.data.items);
        setTotalPages(json.data.totalPages);
        setTotal(json.data.total);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, language]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [status, language]);

  function handleRetry(item: SyncHistoryItem) {
    setRetryModal(item);
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setLanguage("");
    setPage(1);
  }

  const hasActiveFilters = search || status || language;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync History</h1>
        <p className="text-muted-foreground mt-1">
          All your sync attempts ·{" "}
          <span className="text-foreground font-medium">{total}</span> total
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by problem name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="pl-10 pr-8 py-2.5 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="SUCCESS">Synced</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>

        {/* Language filter */}
        <div>
          <input
            type="text"
            placeholder="Language..."
            value={language}
            onChange={(e) => { setLanguage(e.target.value); setPage(1); }}
            className="w-32 px-3 py-2.5 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm mt-3">Loading...</p>
        </div>
      ) : (
        <SyncHistoryTable items={items} onRetry={handleRetry} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Retry Modal */}
      {retryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRetryModal(null)}
        >
          <div
            className="glass-card p-6 max-w-md w-full mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">How to Retry</h2>
              <button
                onClick={() => setRetryModal(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              To retry syncing{" "}
              <span className="font-medium text-foreground">
                &ldquo;{retryModal.problemName}&rdquo;
              </span>
              , CodeSync needs the original code from LeetCode. Since code is never
              stored server-side, follow these steps:
            </p>

            <ol className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>
                  Go to{" "}
                  <a
                    href={`https://leetcode.com/problems/${retryModal.slug}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    the LeetCode problem
                  </a>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Open your previous accepted submission and paste the code back into the editor</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>Submit — the extension will detect Accepted and sync automatically</span>
              </li>
            </ol>

            {retryModal.errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive/80 font-mono break-all">
                  Error: {retryModal.errorMsg}
                </p>
              </div>
            )}

            <button
              onClick={() => setRetryModal(null)}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
