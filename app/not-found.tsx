import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="wrap not-found">
      <p className="code">Error 404</p>
      <h1>We could not find that page.</h1>
      <p>The link may be out of date, or the address may have a typo. Nothing you saved has been affected.</p>
      <div className="btn-row">
        <Link href="/" className="btn btn-primary">Go to the home page</Link>
        <Link href="/demo" className="btn">Open the demo</Link>
      </div>
    </div>
  );
}
