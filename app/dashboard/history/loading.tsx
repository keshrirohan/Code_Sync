export default function HistoryLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="h-10 w-48 bg-muted/30 rounded-lg animate-pulse" />
      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-10 bg-muted/30 rounded-lg animate-pulse" />
        <div className="w-36 h-10 bg-muted/30 rounded-lg animate-pulse" />
      </div>
      {/* Table rows skeleton */}
      <div className="glass-card overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="flex gap-4 px-6 py-4 border-b border-white/5">
            <div className="h-4 w-48 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-20 bg-muted/30 rounded animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
