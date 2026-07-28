import type { Metadata } from "next";
import "@/app/globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "CodeSync — Auto-sync LeetCode to GitHub",
  description:
    "Automatically sync your accepted LeetCode solutions to a GitHub repository, organized by topic.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
