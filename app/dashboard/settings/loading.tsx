export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header skeleton */}
      <div className="h-10 w-40 bg-muted/30 rounded-lg animate-pulse" />
      {/* Card skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-6 h-24 animate-pulse" />
      ))}
    </div>
  );
}
