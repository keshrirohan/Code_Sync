import Sidebar from "@/components/sidebar";
import SyncToastContainer from "@/components/sync-toast";
import { Toaster } from "react-hot-toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>

      {/* Rich push popup — fires whenever a new sync arrives */}
      <SyncToastContainer />

      {/* react-hot-toast for imperative toasts (history page, etc.) */}
      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            background: "oklch(0.17 0.008 260 / 0.9)",
            color: "oklch(0.97 0 0)",
            border: "1px solid oklch(1 0 0 / 0.08)",
            backdropFilter: "blur(16px)",
            borderRadius: "0.75rem",
            fontSize: "0.875rem",
          },
        }}
      />
    </div>
  );
}
