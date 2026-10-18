/** Placeholder blocks shown while content loads. Hidden from screen readers; pair with a status message. */
export function Skeleton({ width = "100%", height = 14 }: { width?: number | string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} />)}
    </div>
  );
}
