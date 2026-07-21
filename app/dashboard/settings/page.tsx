"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Settings,
  FolderGit2,
  Plus,
  RefreshCcw,
  Trash2,
  AlertTriangle,
  Check,
  Loader2,
  Power,
} from "lucide-react";
import type { GitHubRepo, UserSettings } from "@/types";
import { updateAutoSync, selectRepository, disconnectGitHub } from "@/action/settings";
import { deleteAccount } from "@/action/account";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create repo state
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("leetcode-solutions");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRepoToo, setDeleteRepoToo] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Disconnect state
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (json.success) setSettings(json.data);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      const res = await fetch("/api/github/repos");
      const json = await res.json();
      if (json.success) setRepos(json.data);
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchRepos();
  }, [fetchSettings, fetchRepos]);

  const handleAutoSyncToggle = async () => {
    if (!settings) return;
    setSaving(true);
    const newValue = !settings.autoSync;
    setSettings({ ...settings, autoSync: newValue });
    await updateAutoSync(newValue);
    setSaving(false);
  };

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSaving(true);
    await selectRepository(String(repo.id), repo.full_name);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            selectedRepoId: String(repo.id),
            selectedRepoFullName: repo.full_name,
          }
        : prev
    );
    setSaving(false);
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRepoName.trim(),
          isPrivate: newRepoPrivate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateRepo(false);
        setNewRepoName("leetcode-solutions");
        await fetchRepos();
        await fetchSettings();
      } else {
        alert(json.error || "Failed to create repository");
      }
    } catch {
      alert("Failed to create repository");
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectGitHub();
    setDisconnecting(false);
    window.location.reload();
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    await deleteAccount(deleteRepoToo);
    // Redirect happens in the server action
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-10 w-32 bg-muted/30 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure your sync preferences
        </p>
      </div>

      {/* Auto-Sync Toggle */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <RefreshCcw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Auto-Sync</h2>
              <p className="text-sm text-muted-foreground">
                Automatically sync solutions when accepted
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoSyncToggle}
            disabled={saving}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
              settings?.autoSync
                ? "bg-primary"
                : "bg-muted"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                settings?.autoSync ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Repository Selection */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderGit2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Target Repository</h2>
              <p className="text-sm text-muted-foreground">
                {settings?.selectedRepoFullName || "No repository selected"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateRepo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create New
          </button>
        </div>

        {/* Create Repo Form */}
        {showCreateRepo && (
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3 animate-slide-up">
            <input
              type="text"
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="Repository name"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newRepoPrivate}
                onChange={(e) => setNewRepoPrivate(e.target.checked)}
                className="rounded"
              />
              Private repository
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCreateRepo}
                disabled={creating || !newRepoName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create
              </button>
              <button
                onClick={() => setShowCreateRepo(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Repo List */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {reposLoading ? (
            <div className="text-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : repos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No repositories found
            </p>
          ) : (
            repos.map((repo) => {
              const isSelected =
                settings?.selectedRepoFullName === repo.full_name;

              return (
                <button
                  key={repo.id}
                  onClick={() => handleSelectRepo(repo)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all ${
                    isSelected
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{repo.full_name}</span>
                    {repo.private && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        private
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Disconnect GitHub */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Power className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-semibold">Disconnect GitHub</h2>
              <p className="text-sm text-muted-foreground">
                Revoke access token and stop syncing
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 disabled:opacity-50 transition-all"
          >
            {disconnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            Disconnect
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="glass-card p-6 border-destructive/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="font-semibold text-destructive">Danger Zone</h2>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all data
            </p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        ) : !showFinalConfirm ? (
          <div className="space-y-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20 animate-slide-up">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  This action is irreversible.
                </p>
                <p className="text-muted-foreground mt-1">
                  This will permanently delete your account, sync history,
                  settings, and all associated data.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={deleteRepoToo}
                onChange={(e) => setDeleteRepoToo(e.target.checked)}
                className="rounded"
              />
              Also delete my GitHub repository created by CodeSync
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => setShowFinalConfirm(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-white hover:bg-destructive/90 transition-all"
              >
                Continue
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteRepoToo(false);
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20 animate-slide-up">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  Final confirmation required.
                </p>
                <p className="text-muted-foreground mt-1">
                  Are you absolutely sure? Your account
                  {deleteRepoToo && " and GitHub repository"} will be deleted
                  forever.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition-all"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Yes, delete everything
              </button>
              <button
                onClick={() => {
                  setShowFinalConfirm(false);
                  setShowDeleteConfirm(false);
                  setDeleteRepoToo(false);
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
