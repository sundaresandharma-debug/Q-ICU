import { Skeleton } from "@/components/Skeleton";
import { RESOURCE_ORDER, type ResourceName } from "./model";

type Props = {
  demand: Record<ResourceName, number>;
  capacity: Record<ResourceName, number>;
  bottleneck: ResourceName | null;
  loading?: boolean;
};

/** Patients who need each resource (bar) against units available (vertical rule). Red when demand exceeds supply. */
export function CapacityFigure({ demand, capacity, bottleneck, loading = false }: Props) {
  const scale = Math.max(1, ...RESOURCE_ORDER.flatMap(n => [demand[n] ?? 0, capacity[n]]));
  return (
    <>
      <table className="capacity">
        <caption className="visually-hidden">Patients predicted to need each resource, compared with units available</caption>
        <thead className="visually-hidden"><tr><th scope="col">Resource</th><th scope="col">Needed</th><th scope="col">Available</th><th scope="col">Bar</th><th scope="col">Ratio</th></tr></thead>
        <tbody>
          {RESOURCE_ORDER.map(name => {
            const need = demand[name] ?? 0, cap = capacity[name];
            return (
              <tr key={name} data-bottleneck={name === bottleneck}>
                <th scope="row">{name}{name === bottleneck && <span className="tag">bottleneck</span>}</th>
                <td className="num">{loading ? <Skeleton width={32} /> : need}</td>
                <td className="num">of {cap}</td>
                <td className="capacity-bar-cell">
                  <div className="capacity-bar" aria-hidden="true">
                    <div className="capacity-need" data-over={need > cap} style={{ width: `${(need / scale) * 100}%` }} />
                    <div className="capacity-line" style={{ left: `${(cap / scale) * 100}%` }} />
                  </div>
                </td>
                <td className="num ratio">{(need / Math.max(cap, 1)).toFixed(2)}x</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="meta">Bar: patients who need the resource. Vertical rule: units available.</p>
    </>
  );
}
