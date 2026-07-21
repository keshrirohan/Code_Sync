"use client";

import { signIn } from "next-auth/react";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <button
        onClick={() => signIn("github")}
        className="rounded-lg bg-black px-5 py-3 text-white"
      >
        Continue with GitHub
      </button>
    </main>
  );
}