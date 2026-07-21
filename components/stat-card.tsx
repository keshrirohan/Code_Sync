import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  className?: string;
}

export default function StatCard({
  icon,
  label,
  value,
  subtitle,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "glass-card p-6 hover:border-white/12 transition-all duration-300 hover:scale-[1.02] glow-hover group",
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/15 transition-colors">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground/70">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
