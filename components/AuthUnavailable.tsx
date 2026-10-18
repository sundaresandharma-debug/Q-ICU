import Link from "next/link";

export function AuthUnavailable() {
  return (
    <div className="alert" role="status">
      <p>Accounts are not set up on this deployment yet, so sign-in is turned off. You can still use the <Link href="/demo">demo</Link>.</p>
    </div>
  );
}
