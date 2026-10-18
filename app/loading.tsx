import { SkeletonRows, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="wrap page" aria-busy="true">
      <p className="visually-hidden" role="status">Loading</p>
      <Skeleton width="40%" height={34} />
      <div style={{ height: 20 }} />
      <SkeletonRows rows={5} />
    </div>
  );
}
