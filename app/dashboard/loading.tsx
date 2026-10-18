import { Skeleton, SkeletonRows } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="wrap tool" aria-busy="true">
      <p className="visually-hidden" role="status">Loading your dashboard</p>
      <Skeleton width={220} height={34} />
      <div style={{ height: 24 }} />
      <div className="figures">
        {[0, 1, 2, 3].map(i => <div className="figure" key={i}><Skeleton width="50%" /><div style={{ height: 8 }} /><Skeleton width="70%" height={26} /></div>)}
      </div>
      <div style={{ height: 24 }} />
      <SkeletonRows rows={6} />
    </div>
  );
}
