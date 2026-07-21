export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="h-10 w-48 bg-muted/30 rounded-lg animate-pulse" />
      <div className="grid md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 space-y-4">
            <div className="w-10 h-10 bg-muted/30 rounded-xl animate-pulse" />
            <div className="space-y-2">
              <div className="h-8 w-16 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="glass-card p-6">
        <div className="h-5 w-32 bg-muted/30 rounded animate-pulse mb-4" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 py-3">
            <div className="h-4 w-40 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}