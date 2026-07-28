import { type DefaultSession } from "next-auth";

// ─── Extend NextAuth types ─────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubUsername?: string | null;
    } & DefaultSession["user"];
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    githubUsername?: string;
  }
}

// ─── Sync Payload (Extension → Backend) ────────────────────────────────────────

export interface SyncPayload {
  problemName: string;
  slug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  language: string;
  code: string;
  category: string;
}

// ─── Sync Result (Backend → Extension) ─────────────────────────────────────────

export type SyncStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export interface SyncResult {
  status: SyncStatus;
  message: string;
  commitUrl?: string;
  syncHistoryId?: string;
}

// ─── GitHub Types ──────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
}

export interface GitHubFileContent {
  sha: string;
  content: string;
  encoding: string;
}

// ─── User Settings ─────────────────────────────────────────────────────────────

export interface UserSettings {
  autoSync: boolean;
  selectedRepoId: string | null;
  selectedRepoFullName: string | null;
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

export interface DashboardStats {
  totalSynced: number;
  totalFailed: number;
  totalSkipped: number;
  languagesUsed: string[];
  recentSyncs: SyncHistoryItem[];
}

export interface SyncHistoryItem {
  id: string;
  problemName: string;
  slug: string;
  difficulty: string;
  language: string;
  category: string;
  status: SyncStatus;
  commitUrl: string | null;
  errorMsg?: string | null;
  syncedAt: string;
}

// ─── API Response Wrapper ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Language Extension Mapping ────────────────────────────────────────────────

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  python: "py",
  python3: "py",
  javascript: "js",
  typescript: "ts",
  c: "c",
  csharp: "cs",
  "c#": "cs",
  ruby: "rb",
  swift: "swift",
  go: "go",
  golang: "go",
  scala: "scala",
  kotlin: "kt",
  rust: "rs",
  php: "php",
  dart: "dart",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  sql: "sql",
  mysql: "sql",
  mssql: "sql",
  oraclesql: "sql",
};

export function getLanguageExtension(language: string): string {
  return LANGUAGE_EXTENSIONS[language.toLowerCase()] || "txt";
}
