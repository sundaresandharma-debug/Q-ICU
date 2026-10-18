import { site } from "@/lib/site";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wrap page">
      <article className="prose">
        <h1>{title}</h1>
        <p className="meta">Effective {site.policyEffectiveDate}. Operated by {site.legalName}.</p>
        {children}
      </article>
    </div>
  );
}
