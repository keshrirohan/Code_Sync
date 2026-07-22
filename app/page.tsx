"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Zap,
  GitBranch,
  Shield,
  FolderGit2,
  RefreshCcw,
  ArrowRight,
  CheckCircle2,
  Code2,
  ChevronRight,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[oklch(0.72_0.19_250/0.08)] blur-[120px] animate-float" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[oklch(0.65_0.22_290/0.06)] blur-[100px] animate-float stagger-3" />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-[oklch(0.78_0.15_200/0.04)] blur-[80px] animate-float stagger-5" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-7 h-7 text-primary" />
            <span className="text-lg font-bold tracking-tight">CodeSync</span>
          </div>
          <button
            onClick={() => signIn("github")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <GithubIcon className="w-4 h-4" />
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-muted-foreground mb-8 animate-fade-in">
            <Zap className="w-3.5 h-3.5 text-primary" />
            Automatic LeetCode to GitHub sync
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 animate-slide-up opacity-0">
            Your solutions.{" "}
            <span className="gradient-text">Automatically</span>{" "}
            on GitHub.
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up opacity-0 stagger-2">
            CodeSync detects your accepted LeetCode submissions and commits them to
            GitHub — organized by topic, deduped, and ready to showcase.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up opacity-0 stagger-3">
            <button
              onClick={() => signIn("github")}
              className="group flex items-center gap-3 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] glow hover:shadow-[0_0_40px_oklch(0.72_0.19_250/0.3)]"
            >
              <GithubIcon className="w-5 h-5" />
              Continue with GitHub
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <a
              href="#features"
              className="flex items-center gap-2 px-6 py-4 rounded-xl text-muted-foreground hover:text-foreground text-base transition-colors"
            >
              See how it works
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          {/* Code Preview Window */}
          <div className="mt-16 max-w-2xl mx-auto animate-slide-up opacity-0 stagger-4">
            <div className="glass-card overflow-hidden glow">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <div className="w-3 h-3 rounded-full bg-[oklch(0.65_0.2_25)]" />
                <div className="w-3 h-3 rounded-full bg-[oklch(0.80_0.16_85)]" />
                <div className="w-3 h-3 rounded-full bg-[oklch(0.78_0.18_155)]" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  leetcode-solutions / Arrays / Two Sum / solution.py
                </span>
              </div>
              <div className="p-6 text-left font-mono text-sm leading-relaxed">
                <div className="text-muted-foreground">
                  <span className="text-[oklch(0.75_0.17_310)]">class</span>{" "}
                  <span className="text-[oklch(0.78_0.15_200)]">Solution</span>:
                </div>
                <div className="pl-4 text-muted-foreground">
                  <span className="text-[oklch(0.75_0.17_310)]">def</span>{" "}
                  <span className="text-[oklch(0.78_0.15_200)]">twoSum</span>
                  (self, nums, target):
                </div>
                <div className="pl-8 text-muted-foreground">
                  seen = {"{"}{"}"} 
                </div>
                <div className="pl-8 text-muted-foreground">
                  <span className="text-[oklch(0.75_0.17_310)]">for</span> i, n{" "}
                  <span className="text-[oklch(0.75_0.17_310)]">in</span>{" "}
                  enumerate(nums):
                </div>
                <div className="pl-12 text-muted-foreground">
                  <span className="text-[oklch(0.75_0.17_310)]">if</span>{" "}
                  target - n{" "}
                  <span className="text-[oklch(0.75_0.17_310)]">in</span> seen:
                </div>
                <div className="pl-16 text-muted-foreground">
                  <span className="text-[oklch(0.75_0.17_310)]">return</span>{" "}
                  [seen[target - n], i]
                </div>
                <div className="pl-12 text-muted-foreground">
                  seen[n] = i
                </div>
              </div>
              <div className="px-4 py-3 border-t border-white/5 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.78_0.18_155)]" />
                <span>Committed to GitHub · 2 seconds ago</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to{" "}
              <span className="gradient-text">track your progress</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From automatic detection to organized commits — CodeSync handles it all.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Zap className="w-6 h-6" />,
                title: "Auto-Detection",
                description:
                  "Instantly detects when your LeetCode submission is accepted. No manual effort needed.",
              },
              {
                icon: <FolderGit2 className="w-6 h-6" />,
                title: "Organized Commits",
                description:
                  "Solutions are organized by topic: Arrays, Strings, Dynamic Programming — clean and structured.",
              },
              {
                icon: <RefreshCcw className="w-6 h-6" />,
                title: "Smart Deduplication",
                description:
                  "Only pushes when your code actually changes. No duplicate commits, ever.",
              },
              {
                icon: <Shield className="w-6 h-6" />,
                title: "Secure by Design",
                description:
                  "Your GitHub token never touches the extension. All API calls go through our secure backend.",
              },
              {
                icon: <GitBranch className="w-6 h-6" />,
                title: "Multi-Language",
                description:
                  "Python, C++, Java, JavaScript, TypeScript, Go — supports every LeetCode language.",
              },
              {
                icon: <GithubIcon className="w-6 h-6" />,
                title: "Your Repos, Your Rules",
                description:
                  "Choose any repo or create a new one. Private or public — it's your call.",
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className={`glass-card p-6 hover:border-white/12 transition-all duration-300 hover:scale-[1.02] glow-hover group animate-slide-up opacity-0 stagger-${
                  i + 1
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/15 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              How it <span className="gradient-text">works</span>
            </h2>
          </div>

          <div className="space-y-8">
            {[
              {
                step: "01",
                title: "Install the Chrome Extension",
                description:
                  "Add CodeSync to your browser from the Chrome Web Store. It quietly runs in the background.",
              },
              {
                step: "02",
                title: "Sign in with GitHub",
                description:
                  "Authenticate once. CodeSync creates a secure connection to your GitHub account.",
              },
              {
                step: "03",
                title: "Solve problems on LeetCode",
                description:
                  "Code normally. When you get \"Accepted\", CodeSync detects it automatically.",
              },
              {
                step: "04",
                title: "Solutions appear on GitHub",
                description:
                  "Your code is committed, organized by topic, and ready to share with the world.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className={`flex gap-6 items-start animate-slide-up opacity-0 stagger-${
                  i + 1
                }`}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card p-12 animate-pulse-glow">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Ready to sync your solutions?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Join developers who use CodeSync to keep their GitHub green and their
              progress visible.
            </p>
            <button
              onClick={() => signIn("github")}
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
            >
              <GithubIcon className="w-5 h-5" />
              Get Started — It&apos;s Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            <span>CodeSync</span>
          </div>
          <p>Built for developers who love clean code.</p>
        </div>
      </footer>
    </div>
  );
}